const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const history    = { general: [] };
const reactions  = {};           // msgId -> { emoji: [users] }
const MAX        = 100;
const onlineUsers = {};

function broadcastOnline() {
  io.emit('online-users', Object.values(onlineUsers));
}

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.on('join', ({ channel, name, color, bg } = {}) => {
    if (typeof channel === 'string') socket.join(channel);
    if (name) {
      onlineUsers[socket.id] = { name, color, bg };
      broadcastOnline();
    }
    const hist = {};
    for (const ch in history) {
      hist[ch] = history[ch].map(m => ({
        ...m,
        reactions: reactions[m.id] || {}
      }));
    }
    socket.emit('history', hist);
  });

  socket.on('message', ({ channel, id, sender, text, color, bg, attachment }) => {
    const msg = {
      id: id || Date.now().toString(36),
      sender, text, color, bg, attachment,
      time: new Date().toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' }),
    };
    if (!history[channel]) history[channel] = [];
    history[channel].push(msg);
    if (history[channel].length > MAX) history[channel].shift();
    io.to(channel).emit('message', { channel, ...msg, reactions: {} });
  });

  
  socket.on('reaction', ({ channel, msgId, emoji, user }) => {
    if (!reactions[msgId]) reactions[msgId] = {};
    if (!reactions[msgId][emoji]) reactions[msgId][emoji] = [];
    const idx = reactions[msgId][emoji].indexOf(user);
    if (idx === -1) reactions[msgId][emoji].push(user);
    else            reactions[msgId][emoji].splice(idx, 1);
    io.to(channel).emit('reaction', { channel, msgId, emoji, user });
  });

  socket.on('typing',      ({ channel, name }) => socket.to(channel).emit('typing',      { name }));
  socket.on('stop-typing', ({ channel, name }) => socket.to(channel).emit('stop-typing', { name }));

  socket.on('disconnect', () => {
    console.log('Desconectado:', socket.id);
    delete onlineUsers[socket.id];
    broadcastOnline();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
