const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/client');

async function createUser(email, password) {
  const normalized = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);
  const id = uuidv4();

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at AS "createdAt"`,
      [id, normalized, passwordHash]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new Error('EMAIL_TAKEN'); // unique violation
    throw err;
  }
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, created_at AS "createdAt" FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

async function searchByEmail(query, excludeId) {
  const { rows } = await pool.query(
    `SELECT id, email FROM users
     WHERE id != $1 AND email ILIKE $2
     ORDER BY email
     LIMIT 10`,
    [excludeId, `%${query.toLowerCase()}%`]
  );
  return rows;
}

module.exports = { createUser, findByEmail, findById, verifyPassword, searchByEmail };
