const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const { Pool } = require('pg');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── PostgreSQL ──
   Railway inyecta DATABASE_URL automáticamente.
   Para desarrollo local crea un archivo .env con:
   DATABASE_URL=postgresql://usuario:password@localhost:5432/chat
*/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

/* ── Crear tablas si no existen ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      username  VARCHAR(30) UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      color     VARCHAR(20) DEFAULT '#a78bfa',
      bg        VARCHAR(50) DEFAULT 'rgba(167,139,250,0.15)',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         VARCHAR(30) PRIMARY KEY,
      channel    VARCHAR(50) NOT NULL,
      sender     VARCHAR(30) NOT NULL,
      text       TEXT,
      color      VARCHAR(20),
      bg         VARCHAR(50),
      attachment JSONB,
      time       VARCHAR(10),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reactions (
      msg_id  VARCHAR(30) NOT NULL,
      emoji   VARCHAR(10) NOT NULL,
      username VARCHAR(30) NOT NULL,
      PRIMARY KEY (msg_id, emoji, username)
    );
  `);
  console.log('✅ Base de datos lista');
}

/* ══════════════════════════════════════
   REST API — Autenticación
══════════════════════════════════════ */

/* Registro */
app.post('/api/register', async (req, res) => {
  const { username, password, color, bg } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (username.length < 2 || username.length > 30) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 30 caracteres' });
  if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, color, bg) VALUES ($1, $2, $3, $4)',
      [username.trim(), hash, color || '#a78bfa', bg || 'rgba(167,139,250,0.15)']
    );
    res.json({ ok: true, username: username.trim(), color, bg });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* Login */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (!result.rows.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    res.json({ ok: true, username: user.username, color: user.color, bg: user.bg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ══════════════════════════════════════
   SOCKET.IO — Chat en tiempo real
══════════════════════════════════════ */
const onlineUsers = {};
const MAX = 100;

/* Cargar historial de un canal desde DB */
async function getHistory(channel) {
  const msgs = await pool.query(
    `SELECT m.*, 
      COALESCE(
        json_object_agg(r.emoji, r.users) FILTER (WHERE r.emoji IS NOT NULL), '{}'
      ) AS reactions
     FROM messages m
     LEFT JOIN (
       SELECT msg_id, emoji, json_agg(username) AS users
       FROM reactions GROUP BY msg_id, emoji
     ) r ON r.msg_id = m.id
     WHERE m.channel = $1
     ORDER BY m.created_at ASC
     LIMIT $2`,
    [channel, MAX]
  );
  return msgs.rows;
}

function broadcastOnline() {
  io.emit('online-users', Object.values(onlineUsers));
}

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.on('join', async ({ channel, name, color, bg } = {}) => {
    if (typeof channel === 'string') socket.join(channel);
    if (name) {
      onlineUsers[socket.id] = { name, color, bg };
      broadcastOnline();
    }
    try {
      const msgs = await getHistory(channel || 'general');
      socket.emit('history', { [channel]: msgs });
    } catch (err) {
      console.error('Error cargando historial:', err);
      socket.emit('history', { [channel]: [] });
    }
  });

  socket.on('message', async ({ channel, id, sender, text, color, bg, attachment }) => {
    const msgId = id || Date.now().toString(36);
    const time  = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const msg   = { id: msgId, sender, text, color, bg, attachment, time, reactions: {} };

    try {
      await pool.query(
        `INSERT INTO messages (id, channel, sender, text, color, bg, attachment, time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [msgId, channel, sender, text || null, color, bg, attachment ? JSON.stringify(attachment) : null, time]
      );
    } catch (err) {
      console.error('Error guardando mensaje:', err);
    }

    io.to(channel).emit('message', { channel, ...msg });
  });

  socket.on('reaction', async ({ channel, msgId, emoji, user }) => {
    try {
      // Toggle: si existe lo borra, si no existe lo inserta
      const exists = await pool.query(
        'SELECT 1 FROM reactions WHERE msg_id=$1 AND emoji=$2 AND username=$3',
        [msgId, emoji, user]
      );
      if (exists.rows.length) {
        await pool.query('DELETE FROM reactions WHERE msg_id=$1 AND emoji=$2 AND username=$3', [msgId, emoji, user]);
      } else {
        await pool.query('INSERT INTO reactions (msg_id, emoji, username) VALUES ($1,$2,$3)', [msgId, emoji, user]);
      }
    } catch (err) {
      console.error('Error en reacción:', err);
    }
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

/* ── Arrancar ── */
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => server.listen(PORT, () => console.log(`http://localhost:${PORT}`)))
  .catch(err => { console.error('Error iniciando DB:', err); process.exit(1); });
