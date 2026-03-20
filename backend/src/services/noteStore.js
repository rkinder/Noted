const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/client');
const storage = require('./storage');
const { encrypt, decrypt } = require('./crypto');

const contentKey = (id) => `notes/${id}.json`;

// ─── Content file helpers (body only) ─────────────────────────────────────────

async function loadContent(noteId) {
  const raw = await storage.readFile(contentKey(noteId));
  const note = JSON.parse(decrypt(raw));
  return note.content ?? '';
}

async function persistContent(noteId, content) {
  await storage.writeFile(contentKey(noteId), encrypt(JSON.stringify({ content })));
}

async function deleteContent(noteId) {
  await storage.deleteFile(contentKey(noteId));
}

// ─── Public API ────────────────────────────────────────────────────────────────

async function createNote(ownerId, title = 'Untitled Note', content = '') {
  const id = uuidv4();
  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO notes (id, title, owner_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, title, ownerId, now]
  );

  await persistContent(id, content);

  return {
    id,
    title,
    ownerId,
    folderId: null,
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load a single note with full content (used when opening a note).
 */
async function load(noteId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.title, n.owner_id AS "ownerId", n.folder_id AS "folderId",
            n.created_at AS "createdAt", n.updated_at AS "updatedAt",
            COALESCE(
              json_agg(json_build_object(
                'userId', nc.user_id,
                'email',  nc.email,
                'permission', nc.permission
              )) FILTER (WHERE nc.user_id IS NOT NULL),
              '[]'
            ) AS collaborators
     FROM notes n
     LEFT JOIN note_collaborators nc ON nc.note_id = n.id
     WHERE n.id = $1
     GROUP BY n.id`,
    [noteId]
  );

  if (!rows.length) throw new Error('Note not found');

  const note = rows[0];
  note.content = await loadContent(noteId);
  return note;
}

async function updateNote(noteId, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(updates.title);
  }
  if (updates.folderId !== undefined) {
    fields.push(`folder_id = $${idx++}`);
    values.push(updates.folderId);
  }

  const now = new Date().toISOString();
  fields.push(`updated_at = $${idx++}`);
  values.push(now);
  values.push(noteId);

  if (fields.length > 1) {
    await pool.query(
      `UPDATE notes SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  if (updates.content !== undefined) {
    await persistContent(noteId, updates.content);
  }

  return load(noteId);
}

async function deleteNote(noteId) {
  // note_collaborators cascade on DELETE; content file removed separately
  await pool.query('DELETE FROM notes WHERE id = $1', [noteId]);
  await deleteContent(noteId);
}

async function getNotesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.title, n.owner_id AS "ownerId", n.folder_id AS "folderId",
            n.created_at AS "createdAt", n.updated_at AS "updatedAt",
            (n.owner_id = $1) AS "isOwner",
            CASE WHEN n.owner_id = $1 THEN 'write' ELSE nc_me.permission END AS permission,
            COALESCE(
              json_agg(json_build_object(
                'userId', nc.user_id,
                'email',  nc.email,
                'permission', nc.permission
              )) FILTER (WHERE nc.user_id IS NOT NULL),
              '[]'
            ) AS collaborators
     FROM notes n
     LEFT JOIN note_collaborators nc     ON nc.note_id = n.id
     LEFT JOIN note_collaborators nc_me  ON nc_me.note_id = n.id AND nc_me.user_id = $1
     WHERE n.owner_id = $1 OR nc_me.user_id = $1
     GROUP BY n.id, nc_me.permission
     ORDER BY n.updated_at DESC`,
    [userId]
  );

  return rows;
}

async function canAccess(noteId, userId, requireWrite = false) {
  const { rows } = await pool.query(
    `SELECT n.owner_id, nc.permission
     FROM notes n
     LEFT JOIN note_collaborators nc ON nc.note_id = n.id AND nc.user_id = $2
     WHERE n.id = $1`,
    [noteId, userId]
  );

  if (!rows.length) return false;
  const { owner_id, permission } = rows[0];
  if (owner_id === userId) return true;
  if (!permission) return false;
  if (requireWrite) return permission === 'write';
  return true;
}

async function addCollaborator(noteId, userId, email, permission = 'write') {
  await pool.query(
    `INSERT INTO note_collaborators (note_id, user_id, email, permission)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (note_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
    [noteId, userId, email, permission]
  );
  return load(noteId);
}

async function removeCollaborator(noteId, userId) {
  await pool.query(
    'DELETE FROM note_collaborators WHERE note_id = $1 AND user_id = $2',
    [noteId, userId]
  );
  return load(noteId);
}

module.exports = {
  load,
  createNote,
  updateNote,
  deleteNote,
  getNotesForUser,
  canAccess,
  addCollaborator,
  removeCollaborator,
};
