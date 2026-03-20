/**
 * Shared test helpers — db cleanup, user/note factories.
 */
const { pool } = require('../db/client');
const userStore = require('../services/userStore');
const noteStore = require('../services/noteStore');

// Truncate all tables between tests (order respects FK constraints)
async function cleanDb() {
  await pool.query('TRUNCATE note_collaborators, notes, folders, users RESTART IDENTITY CASCADE');
}

async function createTestUser(email = 'test@example.com', password = 'password123') {
  return userStore.createUser(email, password);
}

async function createTestNote(ownerId, title = 'Test Note', content = '# Hello') {
  return noteStore.createNote(ownerId, title, content);
}

module.exports = { cleanDb, createTestUser, createTestNote };
