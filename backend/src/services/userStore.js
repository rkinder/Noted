const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const storage = require('./storage');
const { encrypt, decrypt } = require('./crypto');

const USERS_KEY = 'users/index.json';

async function load() {
  try {
    return JSON.parse(decrypt(await storage.readFile(USERS_KEY)));
  } catch {
    return [];
  }
}

async function save(users) {
  await storage.writeFile(USERS_KEY, encrypt(JSON.stringify(users)));
}

async function createUser(email, password) {
  const users = await load();
  const normalized = email.toLowerCase().trim();
  if (users.find(u => u.email === normalized)) throw new Error('EMAIL_TAKEN');

  const user = {
    id: uuidv4(),
    email: normalized,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await save(users);
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

async function findByEmail(email) {
  const users = await load();
  return users.find(u => u.email === email.toLowerCase().trim()) || null;
}

async function findById(id) {
  const users = await load();
  return users.find(u => u.id === id) || null;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

async function searchByEmail(query, excludeId) {
  const users = await load();
  const q = query.toLowerCase();
  return users
    .filter(u => u.id !== excludeId && u.email.includes(q))
    .map(u => ({ id: u.id, email: u.email }))
    .slice(0, 10);
}

module.exports = { createUser, findByEmail, findById, verifyPassword, searchByEmail };
