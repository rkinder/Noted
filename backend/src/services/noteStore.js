const { v4: uuidv4 } = require('uuid');
const storage = require('./storage');
const { encrypt, decrypt } = require('./crypto');

const noteKey = (id) => `notes/${id}.json`;

async function load(noteId) {
  const raw = await storage.readFile(noteKey(noteId));
  return JSON.parse(decrypt(raw));
}

async function persist(note) {
  await storage.writeFile(noteKey(note.id), encrypt(JSON.stringify(note)));
  return note;
}

async function createNote(ownerId, title = 'Untitled Note', content = '') {
  return persist({
    id: uuidv4(),
    title,
    content,
    ownerId,
    collaborators: [], // [{ userId, email, permission: 'read'|'write' }]
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function updateNote(noteId, updates) {
  const note = await load(noteId);
  return persist({ ...note, ...updates, updatedAt: new Date().toISOString() });
}

async function deleteNote(noteId) {
  await storage.deleteFile(noteKey(noteId));
}

async function getNotesForUser(userId) {
  const keys = await storage.listFiles('notes/');
  const notes = [];

  await Promise.all(
    keys
      .filter(k => k.endsWith('.json'))
      .map(async (key) => {
        try {
          const raw = await storage.readFile(key);
          const note = JSON.parse(decrypt(raw));
          const isOwner = note.ownerId === userId;
          const collab = note.collaborators.find(c => c.userId === userId);
          if (isOwner || collab) {
            notes.push({
              id: note.id,
              title: note.title,
              ownerId: note.ownerId,
              collaborators: note.collaborators,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
              isOwner,
              permission: isOwner ? 'write' : collab.permission,
            });
          }
        } catch {
          // skip corrupted entries
        }
      })
  );

  return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function canAccess(noteId, userId, requireWrite = false) {
  try {
    const note = await load(noteId);
    if (note.ownerId === userId) return true;
    const collab = note.collaborators.find(c => c.userId === userId);
    if (!collab) return false;
    if (requireWrite) return collab.permission === 'write';
    return true;
  } catch {
    return false;
  }
}

async function addCollaborator(noteId, userId, email, permission = 'write') {
  const note = await load(noteId);
  const idx = note.collaborators.findIndex(c => c.userId === userId);
  if (idx >= 0) {
    note.collaborators[idx].permission = permission;
  } else {
    note.collaborators.push({ userId, email, permission });
  }
  return persist({ ...note, updatedAt: new Date().toISOString() });
}

async function removeCollaborator(noteId, userId) {
  const note = await load(noteId);
  note.collaborators = note.collaborators.filter(c => c.userId !== userId);
  return persist({ ...note, updatedAt: new Date().toISOString() });
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
