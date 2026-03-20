const express = require('express');
const auth = require('../middleware/auth');
const folderStore = require('../services/folderStore');
const noteStore = require('../services/noteStore');

const router = express.Router();
router.use(auth);

// GET /api/folders — list all folders for the current user
router.get('/', async (req, res) => {
  try {
    const folders = await folderStore.getFoldersForUser(req.userId);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// POST /api/folders — create a folder
router.post('/', async (req, res) => {
  const { name, parentId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    if (parentId) {
      const ok = await folderStore.canAccess(parentId, req.userId);
      if (!ok) return res.status(403).json({ error: 'Parent folder not found' });
    }
    const folder = await folderStore.createFolder(req.userId, name.trim(), parentId || null);
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PATCH /api/folders/:id — rename or re-parent a folder
router.patch('/:id', async (req, res) => {
  try {
    const ok = await folderStore.canAccess(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Folder not found' });

    const { name, parentId } = req.body;
    const folder = await folderStore.updateFolder(req.params.id, { name, parentId });
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// DELETE /api/folders/:id — delete folder, re-parent contents
router.delete('/:id', async (req, res) => {
  try {
    const ok = await folderStore.canAccess(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Folder not found' });

    await folderStore.deleteFolder(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// PATCH /api/notes/:id/folder — move a note into (or out of) a folder
router.patch('/note/:noteId/folder', async (req, res) => {
  const { noteId } = req.params;
  const { folderId } = req.body; // null = move to root

  try {
    const canEdit = await noteStore.canAccess(noteId, req.userId, true);
    if (!canEdit) return res.status(403).json({ error: 'Access denied' });

    if (folderId) {
      const folderOk = await folderStore.canAccess(folderId, req.userId);
      if (!folderOk) return res.status(404).json({ error: 'Folder not found' });
    }

    const note = await noteStore.updateNote(noteId, { folderId: folderId || null });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to move note' });
  }
});

module.exports = router;
