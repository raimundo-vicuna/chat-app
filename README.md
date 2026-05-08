# NEXUS/chat

Chat en tiempo real con Node.js + Socket.io. Múltiples usuarios, múltiples canales.

## Estructura

```
chat-app/
├── server.js        ← Servidor Node.js + Socket.io
├── package.json
├── railway.toml     ← Config para Railway (deploy gratis)
└── public/
    └── index.html   ← Frontend (se sirve automáticamente)
```

## Correr localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor
npm start

# 3. Abrir en el navegador
# http://localhost:3000
#
# Otras personas en tu red local pueden entrar con:
# http://TU_IP_LOCAL:3000  (ej: http://192.168.1.10:3000)
```

---

## Deploy en la nube con Railway (gratis)

Railway es gratuito y no requiere tarjeta de crédito para empezar.

### Paso 1 — Crea cuenta
Entra a https://railway.app y regístrate con GitHub.

### Paso 2 — Sube el código a GitHub
```bash
git init
git add .
git commit -m "primer commit"
# Crea un repo en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/nexus-chat.git
git push -u origin main
```

### Paso 3 — Despliega en Railway
1. En Railway, haz clic en **"New Project"**
2. Selecciona **"Deploy from GitHub repo"**
3. Elige tu repositorio `nexus-chat`
4. Railway detecta automáticamente Node.js y despliega

### Paso 4 — Obtén tu URL pública
- En tu proyecto Railway, ve a **Settings → Domains**
- Haz clic en **"Generate Domain"**
- Obtendrás una URL como: `https://nexus-chat-production.up.railway.app`

### Paso 5 — Comparte
Envía esa URL a quien quieras. Cualquier persona desde cualquier dispositivo puede abrir el chat directamente en el navegador. No necesitan instalar nada.

---

## Otras opciones de deploy

| Plataforma | Plan gratuito | Notas |
|---|---|---|
| **Railway** | ✅ $5 crédito/mes | Recomendado, muy fácil |
| **Render** | ✅ gratis | Se duerme tras 15 min sin uso |
| **Fly.io** | ✅ gratis | Requiere CLI |
| **VPS propio** | — | DigitalOcean, Hetzner, etc. |

---

## Funcionalidades

- ✅ Chat en tiempo real con WebSockets
- ✅ 4 canales: general, random, tech, ideas
- ✅ Indicador "está escribiendo..."
- ✅ Historial de mensajes (últimos 50 por canal)
- ✅ Lista de usuarios online
- ✅ Cada usuario elige nombre y color
- ✅ Notificación de mensajes en canales no activos
