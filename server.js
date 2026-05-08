const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Historial en memoria (últimos 50 mensajes por canal)
const history = { general: [], random: [], tech: [], ideas: [] };
const MAX = 50;

// Usuarios online: socketId -> { name, color, bg }
const onlineUsers = {};

function broadcastOnline() {
  const users = Object.values(onlineUsers);
  io.emit('online-users', users);
}

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.emit('history', history);

  socket.on('join', ({ channel, name, color, bg }) => {
    if (typeof channel === 'object') {
      ({ channel, name, color, bg } = channel);
    }
    socket.join(channel);
    if (name) {
      onlineUsers[socket.id] = { name, color, bg };
      broadcastOnline();
    }
  });

  socket.on('message', ({ channel, sender, text, color, bg }) => {
    const msg = {
      sender, text, color, bg,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    };
    if (!history[channel]) history[channel] = [];
    history[channel].push(msg);
    if (history[channel].length > MAX) history[channel].shift();
    io.to(channel).emit('message', { channel, ...msg });
  });

  socket.on('typing', ({ channel, name }) => {
    socket.to(channel).emit('typing', { name });
  });

  socket.on('stop-typing', ({ channel, name }) => {
    socket.to(channel).emit('stop-typing', { name });
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    delete onlineUsers[socket.id];
    broadcastOnline();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
