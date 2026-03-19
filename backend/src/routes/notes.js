const express = require('express');
const noteStore = require('../services/noteStore');
const userStore = require('../services/userStore');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    res.json(await noteStore.getNotesForUser(req.userId));
  } catch (err) {
    console.error('list notes:', err);
    res.status(500).json({ error: 'Failed to list notes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    res.status(201).json(await noteStore.createNote(req.userId, title, content));
  } catch (err) {
    console.error('create note:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!(await noteStore.canAccess(req.params.id, req.userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(await noteStore.load(req.params.id));
  } catch (err) {
    console.error('get note:', err);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!(await noteStore.canAccess(req.params.id, req.userId, true))) {
      return res.status(403).json({ error: 'Access denied or read-only' });
    }
    const { title, content } = req.body;
    res.json(await noteStore.updateNote(req.params.id, { title, content }));
  } catch (err) {
    console.error('update note:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const note = await noteStore.load(req.params.id);
    if (note.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this note' });
    }
    await noteStore.deleteNote(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('delete note:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

router.post('/:id/collaborators', async (req, res) => {
  try {
    const note = await noteStore.load(req.params.id);
    if (note.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can manage collaborators' });
    }
    const { email, permission = 'write' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!['read', 'write'].includes(permission)) {
      return res.status(400).json({ error: 'Permission must be read or write' });
    }

    const collaborator = await userStore.findByEmail(email);
    if (!collaborator) return res.status(404).json({ error: 'User not found' });
    if (collaborator.id === req.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as collaborator' });
    }

    res.json(await noteStore.addCollaborator(req.params.id, collaborator.id, collaborator.email, permission));
  } catch (err) {
    console.error('add collaborator:', err);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

router.delete('/:id/collaborators/:userId', async (req, res) => {
  try {
    const note = await noteStore.load(req.params.id);
    // Owner can remove anyone; collaborator can remove themselves
    if (note.ownerId !== req.userId && req.params.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(await noteStore.removeCollaborator(req.params.id, req.params.userId));
  } catch (err) {
    console.error('remove collaborator:', err);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

module.exports = router;
