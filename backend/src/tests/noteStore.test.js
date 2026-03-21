require('dotenv').config();

const { pool } = require('../db/client');
const noteStore = require('../services/noteStore');
const folderStore = require('../services/folderStore');
const storage = require('../services/storage');
const { cleanDb, createTestUser, createTestNote } = require('./helpers');

// Ensure content files don't hit real S3/disk during tests
jest.mock('../services/storage', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  deleteFile: jest.fn(),
  listFiles: jest.fn(),
}));

beforeEach(async () => {
  await cleanDb();
  storage.writeFile.mockResolvedValue(undefined);
  storage.deleteFile.mockResolvedValue(undefined);
  storage.readFile.mockResolvedValue(
    // Minimal encrypted payload — crypto is not mocked so we stub the file read
    // with a pre-encrypted value. For simplicity, noteStore.load's content read
    // is the only place storage.readFile is called after the pg refactor.
    require('../services/crypto').encrypt(JSON.stringify({ content: '# Hello' }))
  );
});

afterAll(async () => {
  await pool.end();
});

describe('noteStore', () => {
  test('createNote inserts metadata into pg and writes content file', async () => {
    const user = await createTestUser();
    const note = await noteStore.createNote(user.id, 'My Note', '# Content');

    expect(note.id).toBeTruthy();
    expect(note.title).toBe('My Note');
    expect(note.ownerId).toBe(user.id);
    expect(storage.writeFile).toHaveBeenCalledTimes(1);
  });

  test('getNotesForUser returns only accessible notes without reading content files', async () => {
    const owner = await createTestUser('owner@example.com');
    const other = await createTestUser('other@example.com');

    await noteStore.createNote(owner.id, 'Owners Note');
    await noteStore.createNote(other.id, 'Others Note');

    storage.readFile.mockClear();
    const notes = await noteStore.getNotesForUser(owner.id);

    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Owners Note');
    // Critical: listing must not touch content files
    expect(storage.readFile).not.toHaveBeenCalled();
  });

  test('getNotesForUser includes shared notes with correct permission', async () => {
    const owner = await createTestUser('owner@example.com');
    const viewer = await createTestUser('viewer@example.com');
    const note = await noteStore.createNote(owner.id, 'Shared Note');
    await noteStore.addCollaborator(note.id, viewer.id, viewer.email, 'read');

    const notes = await noteStore.getNotesForUser(viewer.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].permission).toBe('read');
    expect(notes[0].isOwner).toBe(false);
  });

  test('load returns note with content', async () => {
    const user = await createTestUser();
    const created = await noteStore.createNote(user.id, 'Load Test');
    const loaded = await noteStore.load(created.id);

    expect(loaded.title).toBe('Load Test');
    expect(loaded.content).toBe('# Hello'); // from mocked storage.readFile
  });

  test('updateNote updates title in pg and rewrites content file', async () => {
    const user = await createTestUser();
    const note = await noteStore.createNote(user.id, 'Old Title');
    storage.writeFile.mockClear();

    await noteStore.updateNote(note.id, { title: 'New Title', content: '# Updated' });

    const { rows } = await pool.query('SELECT title FROM notes WHERE id = $1', [note.id]);
    expect(rows[0].title).toBe('New Title');
    expect(storage.writeFile).toHaveBeenCalledTimes(1);
  });

  test('deleteNote removes pg row and content file', async () => {
    const user = await createTestUser();
    const note = await noteStore.createNote(user.id, 'To Delete');

    await noteStore.deleteNote(note.id);

    const { rows } = await pool.query('SELECT 1 FROM notes WHERE id = $1', [note.id]);
    expect(rows).toHaveLength(0);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
  });

  test('canAccess returns true for owner, false for stranger', async () => {
    const owner = await createTestUser('owner@example.com');
    const stranger = await createTestUser('stranger@example.com');
    const note = await noteStore.createNote(owner.id);

    expect(await noteStore.canAccess(note.id, owner.id)).toBe(true);
    expect(await noteStore.canAccess(note.id, stranger.id)).toBe(false);
  });

  test('canAccess respects requireWrite flag for read-only collaborator', async () => {
    const owner = await createTestUser('owner@example.com');
    const reader = await createTestUser('reader@example.com');
    const note = await noteStore.createNote(owner.id);
    await noteStore.addCollaborator(note.id, reader.id, reader.email, 'read');

    expect(await noteStore.canAccess(note.id, reader.id)).toBe(true);
    expect(await noteStore.canAccess(note.id, reader.id, true)).toBe(false);
  });

  test('addCollaborator upserts permission', async () => {
    const owner = await createTestUser('owner@example.com');
    const collab = await createTestUser('collab@example.com');
    const note = await noteStore.createNote(owner.id);

    await noteStore.addCollaborator(note.id, collab.id, collab.email, 'read');
    await noteStore.addCollaborator(note.id, collab.id, collab.email, 'write');

    const { rows } = await pool.query(
      'SELECT permission FROM note_collaborators WHERE note_id=$1 AND user_id=$2',
      [note.id, collab.id]
    );
    expect(rows[0].permission).toBe('write');
  });

  test('removeCollaborator deletes row', async () => {
    const owner = await createTestUser('owner@example.com');
    const collab = await createTestUser('collab@example.com');
    const note = await noteStore.createNote(owner.id);
    await noteStore.addCollaborator(note.id, collab.id, collab.email, 'write');
    await noteStore.removeCollaborator(note.id, collab.id);

    expect(await noteStore.canAccess(note.id, collab.id)).toBe(false);
  });
});

describe('folderStore', () => {
  test('createFolder and getFoldersForUser', async () => {
    const user = await createTestUser();
    await folderStore.createFolder(user.id, 'Work');
    await folderStore.createFolder(user.id, 'Personal');

    const folders = await folderStore.getFoldersForUser(user.id);
    expect(folders).toHaveLength(2);
    expect(folders.map(f => f.name).sort()).toEqual(['Personal', 'Work']);
  });

  test('nested folders set parentId', async () => {
    const user = await createTestUser();
    const parent = await folderStore.createFolder(user.id, 'Parent');
    const child = await folderStore.createFolder(user.id, 'Child', parent.id);

    expect(child.parentId).toBe(parent.id);
  });

  test('updateFolder renames', async () => {
    const user = await createTestUser();
    const folder = await folderStore.createFolder(user.id, 'Old');
    const updated = await folderStore.updateFolder(folder.id, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  test('deleteFolder re-parents notes and child folders', async () => {
    const user = await createTestUser();
    const parent = await folderStore.createFolder(user.id, 'Parent');
    const child = await folderStore.createFolder(user.id, 'Child', parent.id);
    const note = await noteStore.createNote(user.id, 'Note In Parent');
    await noteStore.updateNote(note.id, { folderId: parent.id });

    await folderStore.deleteFolder(parent.id);

    // Child folder should now be at root
    const updatedChild = await folderStore.getFolder(child.id);
    expect(updatedChild.parentId).toBeNull();

    // Note should be at root
    const { rows } = await pool.query('SELECT folder_id FROM notes WHERE id=$1', [note.id]);
    expect(rows[0].folder_id).toBeNull();
  });

  test('canAccess returns false for another user', async () => {
    const owner = await createTestUser('owner@example.com');
    const other = await createTestUser('other@example.com');
    const folder = await folderStore.createFolder(owner.id, 'Private');

    expect(await folderStore.canAccess(folder.id, other.id)).toBe(false);
  });

  test('getNotesForUser scoped to folder', async () => {
    const user = await createTestUser();
    const folder = await folderStore.createFolder(user.id, 'Work');
    const inFolder = await noteStore.createNote(user.id, 'Work Note');
    await noteStore.createNote(user.id, 'Root Note');
    await noteStore.updateNote(inFolder.id, { folderId: folder.id });

    const allNotes = await noteStore.getNotesForUser(user.id);
    const folderNotes = allNotes.filter(n => n.folderId === folder.id);

    expect(allNotes).toHaveLength(2);
    expect(folderNotes).toHaveLength(1);
    expect(folderNotes[0].title).toBe('Work Note');
  });
});
