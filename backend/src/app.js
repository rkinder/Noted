const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const config = require('./config');
const authRoutes = require('./routes/auth');
const noteRoutes = require('./routes/notes');
const folderRoutes = require('./routes/folders');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', storage: config.storage.type }));
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/folders', folderRoutes);

// Socket.IO auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    socket.userId = payload.userId;
    socket.userEmail = payload.email;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.on('note:join',  (noteId) => socket.join(`note:${noteId}`));
  socket.on('note:leave', (noteId) => socket.leave(`note:${noteId}`));
  socket.on('note:change', ({ noteId, content, title }) => {
    socket.to(`note:${noteId}`).emit('note:update', {
      noteId, content, title,
      userId: socket.userId,
      userEmail: socket.userEmail,
    });
  });
  socket.on('disconnect', () => {});
});

module.exports = { app, server, io };
