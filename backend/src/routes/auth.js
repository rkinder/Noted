const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userStore = require('../services/userStore');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = await userStore.createUser(email, password);
    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.message === 'EMAIL_TAKEN') return res.status(409).json({ error: 'Email already registered' });
    console.error('register:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await userStore.findByEmail(email);
    if (!user || !(await userStore.verifyPassword(user, password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await userStore.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// Search users by email fragment (for sharing)
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    res.json(await userStore.searchByEmail(q, req.userId));
  } catch {
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
