/**
 * One-time data migration: file-based users/notes → PostgreSQL
 *
 * Run with:  npm run migrate-data
 *
 * The script is idempotent — existing rows (matched by id/email) are skipped.
 * Content files are left untouched.
 */

require('dotenv').config();

const { pool, waitForDb } = require('./client');
const { migrate } = require('./migrate');
const storage = require('../services/storage');
const { decrypt } = require('../services/crypto');

let usersOk = 0, usersSkipped = 0;
let notesOk = 0, notesSkipped = 0;

async function migrateUsers() {
  let raw;
  try {
    raw = await storage.readFile('users/index.json');
  } catch {
    console.log('No legacy users/index.json found — skipping user migration.');
    return;
  }

  const users = JSON.parse(decrypt(raw));
  for (const u of users) {
    try {
      await pool.query(
        `INSERT INTO users (id, email, password_hash, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.passwordHash, u.createdAt]
      );
      // ON CONFLICT returns 0 rows affected when skipped
      const check = await pool.query('SELECT 1 FROM users WHERE id = $1', [u.id]);
      if (check.rowCount) usersOk++;
    } catch {
      usersSkipped++;
    }
  }
}

async function migrateNotes() {
  let keys;
  try {
    keys = await storage.listFiles('notes/');
  } catch {
    console.log('No legacy notes/ directory found — skipping note migration.');
    return;
  }

  for (const key of keys.filter(k => k.endsWith('.json'))) {
    try {
      const raw = await storage.readFile(key);
      const note = JSON.parse(decrypt(raw));

      // Skip if this is the new-format content-only file (no ownerId)
      if (!note.ownerId) { notesSkipped++; continue; }

      await pool.query(
        `INSERT INTO notes (id, title, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [note.id, note.title, note.ownerId, note.createdAt, note.updatedAt]
      );

      for (const c of (note.collaborators || [])) {
        await pool.query(
          `INSERT INTO note_collaborators (note_id, user_id, email, permission)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (note_id, user_id) DO NOTHING`,
          [note.id, c.userId, c.email, c.permission]
        );
      }

      notesOk++;
    } catch (err) {
      console.warn(`  Skipped ${key}: ${err.message}`);
      notesSkipped++;
    }
  }
}

async function run() {
  console.log('Connecting to database…');
  await waitForDb();
  await migrate();

  console.log('Migrating users…');
  await migrateUsers();

  console.log('Migrating notes…');
  await migrateNotes();

  console.log(`\nDone.`);
  console.log(`  Users:  ${usersOk} migrated, ${usersSkipped} skipped`);
  console.log(`  Notes:  ${notesOk} migrated, ${notesSkipped} skipped`);

  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
