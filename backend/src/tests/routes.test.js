require('dotenv').config();

const request = require('supertest');
const { app } = require('../app');
const { pool } = require('../db/client');
const { cleanDb, createTestUser } = require('./helpers');
const jwt = require('jsonwebtoken');
const config = require('../config');

// Mock storage so tests don't hit disk/S3
jest.mock('../services/storage', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  deleteFile: jest.fn().mockResolvedValue(undefined),
  listFiles: jest.fn(),
}));

const storage = require('../services/storage');

function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
}

beforeEach(async () => {
  await cleanDb();
  storage.writeFile.mockResolvedValue(undefined);
  storage.deleteFile.mockResolvedValue(undefined);
  const crypto = require('../services/crypto');
  storage.readFile.mockResolvedValue(
    crypto.encrypt(JSON.stringify({ content: '# Hello' }))
  );
});

afterAll(async () => {
  await pool.end();
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('creates user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  test('rejects duplicate email with 409', async () => {
    await createTestUser('alice@example.com');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('returns token for valid credentials', async () => {
    await createTestUser('alice@example.com', 'password123');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('rejects wrong password with 401', async () => {
    await createTestUser('alice@example.com', 'password123');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// ─── Notes routes ─────────────────────────────────────────────────────────────

describe('Notes API', () => {
  let owner, ownerToken, reader, readerToken;

  beforeEach(async () => {
    owner = await createTestUser('owner@example.com');
    ownerToken = makeToken(owner);
    reader = await createTestUser('reader@example.com');
    readerToken = makeToken(reader);
  });

  test('GET /api/notes returns only user notes', async () => {
    await request(app).post('/api/notes').set('Authorization', `Bearer ${ownerToken}`).send({ title: 'My Note' });
    await request(app).post('/api/notes').set('Authorization', `Bearer ${readerToken}`).send({ title: 'Other Note' });

    const res = await request(app).get('/api/notes').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('My Note');
  });

  test('POST /api/notes creates a note', async () => {
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'New Note', content: '# Hi' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Note');
    expect(res.body.ownerId).toBe(owner.id);
  });

  test('GET /api/notes/:id denied for non-collaborator', async () => {
    const create = await request(app)
      .post('/api/notes').set('Authorization', `Bearer ${ownerToken}`).send({ title: 'Private' });
    const noteId = create.body.id;

    const res = await request(app)
      .get(`/api/notes/${noteId}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(res.status).toBe(403);
  });

  test('PUT /api/notes/:id denied for read-only collaborator', async () => {
    const create = await request(app)
      .post('/api/notes').set('Authorization', `Bearer ${ownerToken}`).send({ title: 'Shared' });
    const noteId = create.body.id;

    // Share as read-only
    await request(app)
      .post(`/api/notes/${noteId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: reader.email, permission: 'read' });

    const res = await request(app)
      .put(`/api/notes/${noteId}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ title: 'Hijacked', content: '' });
    expect(res.status).toBe(403);
  });

  test('DELETE /api/notes/:id denied for non-owner', async () => {
    const create = await request(app)
      .post('/api/notes').set('Authorization', `Bearer ${ownerToken}`).send({ title: 'Delete Me' });
    const noteId = create.body.id;

    await request(app)
      .post(`/api/notes/${noteId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: reader.email, permission: 'write' });

    const res = await request(app)
      .delete(`/api/notes/${noteId}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(res.status).toBe(403);
  });

  test('full collaborator lifecycle', async () => {
    const create = await request(app)
      .post('/api/notes').set('Authorization', `Bearer ${ownerToken}`).send({ title: 'Collab Note' });
    const noteId = create.body.id;

    // Add collaborator
    let res = await request(app)
      .post(`/api/notes/${noteId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: reader.email, permission: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.collaborators[0].email).toBe(reader.email);

    // Collaborator can now edit
    res = await request(app)
      .put(`/api/notes/${noteId}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ title: 'Updated by collab', content: '# New' });
    expect(res.status).toBe(200);

    // Remove collaborator
    res = await request(app)
      .delete(`/api/notes/${noteId}/collaborators/${reader.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.collaborators).toHaveLength(0);
  });
});

// ─── Folders routes ───────────────────────────────────────────────────────────

describe('Folders API', () => {
  let user, token, other, otherToken;

  beforeEach(async () => {
    user = await createTestUser('user@example.com');
    token = makeToken(user);
    other = await createTestUser('other@example.com');
    otherToken = makeToken(other);
  });

  test('POST /api/folders creates a folder', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Work');
    expect(res.body.ownerId).toBe(user.id);
  });

  test('GET /api/folders returns only user folders', async () => {
    await request(app).post('/api/folders').set('Authorization', `Bearer ${token}`).send({ name: 'Mine' });
    await request(app).post('/api/folders').set('Authorization', `Bearer ${otherToken}`).send({ name: 'Theirs' });

    const res = await request(app).get('/api/folders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Mine');
  });

  test('PATCH /api/folders/:id renames folder', async () => {
    const create = await request(app)
      .post('/api/folders').set('Authorization', `Bearer ${token}`).send({ name: 'Old' });
    const folderId = create.body.id;

    const res = await request(app)
      .patch(`/api/folders/${folderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
  });

  test('PATCH /api/folders/:id denied for non-owner with 404', async () => {
    const create = await request(app)
      .post('/api/folders').set('Authorization', `Bearer ${token}`).send({ name: 'Private' });

    const res = await request(app)
      .patch(`/api/folders/${create.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/folders/:id removes folder', async () => {
    const create = await request(app)
      .post('/api/folders').set('Authorization', `Bearer ${token}`).send({ name: 'Temp' });

    const del = await request(app)
      .delete(`/api/folders/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/folders').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });

  test('PATCH /api/folders/note/:noteId/folder moves note into folder', async () => {
    const folderRes = await request(app)
      .post('/api/folders').set('Authorization', `Bearer ${token}`).send({ name: 'Work' });
    const folderId = folderRes.body.id;

    const noteRes = await request(app)
      .post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Task' });
    const noteId = noteRes.body.id;

    const res = await request(app)
      .patch(`/api/folders/note/${noteId}/folder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId });
    expect(res.status).toBe(200);
    expect(res.body.folderId).toBe(folderId);
  });
});
