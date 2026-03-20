const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/client');

async function createFolder(ownerId, name, parentId = null) {
  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO folders (id, owner_id, name, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, owner_id AS "ownerId", name, parent_id AS "parentId",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, ownerId, name, parentId]
  );
  return rows[0];
}

async function getFoldersForUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, owner_id AS "ownerId", name, parent_id AS "parentId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM folders
     WHERE owner_id = $1
     ORDER BY name`,
    [userId]
  );
  return rows;
}

async function getFolder(folderId) {
  const { rows } = await pool.query(
    `SELECT id, owner_id AS "ownerId", name, parent_id AS "parentId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM folders WHERE id = $1`,
    [folderId]
  );
  return rows[0] || null;
}

async function updateFolder(folderId, { name, parentId }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined)     { fields.push(`name = $${idx++}`);      values.push(name); }
  if (parentId !== undefined) { fields.push(`parent_id = $${idx++}`); values.push(parentId); }

  if (!fields.length) return getFolder(folderId);

  fields.push(`updated_at = NOW()`);
  values.push(folderId);

  const { rows } = await pool.query(
    `UPDATE folders SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, owner_id AS "ownerId", name, parent_id AS "parentId",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    values
  );
  return rows[0] || null;
}

/**
 * Deletes a folder. Notes inside are moved to the folder's parent (or root).
 * Child folders are also moved up (ON DELETE CASCADE is NOT used for folders —
 * we explicitly re-parent to avoid wiping entire subtrees accidentally).
 */
async function deleteFolder(folderId) {
  const folder = await getFolder(folderId);
  if (!folder) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Move child folders up one level
    await client.query(
      'UPDATE folders SET parent_id = $1 WHERE parent_id = $2',
      [folder.parentId, folderId]
    );
    // Move notes to parent folder (or root)
    await client.query(
      'UPDATE notes SET folder_id = $1 WHERE folder_id = $2',
      [folder.parentId, folderId]
    );
    await client.query('DELETE FROM folders WHERE id = $1', [folderId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function canAccess(folderId, userId) {
  const folder = await getFolder(folderId);
  return folder?.ownerId === userId;
}

module.exports = {
  createFolder,
  getFoldersForUser,
  getFolder,
  updateFolder,
  deleteFolder,
  canAccess,
};
