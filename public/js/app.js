const CLOUD_NAME    = 'TU_CLOUD_NAME';
const UPLOAD_PRESET = 'TU_UPLOAD_PRESET';

const COLORS = [
  { color:'#a78bfa', bg:'rgba(167,139,250,0.15)' },
  { color:'#4ade80', bg:'rgba(74,222,128,0.12)'  },
  { color:'#f87171', bg:'rgba(248,113,113,0.12)' },
  { color:'#fbbf24', bg:'rgba(251,191,36,0.12)'  },
  { color:'#38bdf8', bg:'rgba(56,189,248,0.12)'  },
  { color:'#f472b6', bg:'rgba(244,114,182,0.12)' },
];
const REACTION_EMOJIS = ['\u{1F44D}','\u{2764}\u{FE0F}','\u{1F602}','\u{1F62E}','\u{1F622}','\u{1F525}'];
const CHANNELS_INFO = { general:{ label:'# gabo chupalo', sub:'Canal principal' } };

let myName='', myColor=COLORS[0].color, myBg=COLORS[0].bg;
let currentChannel='general';
const localMessages = { general:[] };
const unread = { general:0 };
const typingNames = {};
let typingTimer=null, isTyping=false, socket;
let pendingFile=null, mentionIdx=-1, onlineUsers=[];
(() => {
  const p = document.getElementById('reg-colors');
  COLORS.forEach((c,i) => {
    const d = document.createElement('div');
    d.className = 'color-dot'+(i===0?' selected':'');
    d.style.background = c.color;
    d.onclick = () => {
      myColor=c.color; myBg=c.bg;
      p.querySelectorAll('.color-dot').forEach(x=>x.classList.remove('selected'));
      d.classList.add('selected');
    };
    p.appendChild(d);
  });
})();

function showTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register')));
  document.getElementById('panel-login').classList.toggle('active', tab==='login');
  document.getElementById('panel-register').classList.toggle('active', tab==='register');
  hideError();
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('visible');
}
function hideError() {
  document.getElementById('auth-error').classList.remove('visible');
}

function setAuthLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btnId==='login-btn' ? 'Entrar al chat &rarr;' : 'Crear cuenta &rarr;';
  }
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) { showError('Completa todos los campos'); return; }
  hideError();
  setAuthLoading('login-btn', true);
  try {
    const res = await fetch('/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Error al iniciar sesión'); return; }
    myName  = data.username;
    myColor = data.color;
    myBg    = data.bg;
    enterApp();
  } catch(e) {
    showError('Error de conexión');
  } finally {
    setAuthLoading('login-btn', false);
  }
}

async function doRegister() {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const pass2    = document.getElementById('reg-pass2').value;
  if (!username || !password || !pass2) { showError('Completa todos los campos'); return; }
  if (password !== pass2) { showError('Las contraseñas no coinciden'); return; }
  if (password.length < 4) { showError('La contraseña debe tener al menos 4 caracteres'); return; }
  hideError();
  setAuthLoading('reg-btn', true);
  try {
    const res = await fetch('/api/register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password, color: myColor, bg: myBg })
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Error al crear cuenta'); return; }
    myName  = data.username;
    myColor = data.color;
    myBg    = data.bg;
    enterApp();
  } catch(e) {
    showError('Error de conexión');
  } finally {
    setAuthLoading('reg-btn', false);
  }
}

function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const av = document.getElementById('my-avatar-bar');
  av.textContent = myName[0].toUpperCase();
  av.style.background = myBg;
  av.style.color = myColor;
  document.getElementById('my-name-bar').textContent = myName;
  connectSocket();
}

function doLogout() {
  if (socket) socket.disconnect();
  myName=''; myColor=COLORS[0].color; myBg=COLORS[0].bg;
  localMessages.general = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  hideError();
  showTab('login');
}
['login-user','login-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
});
['reg-user','reg-pass','reg-pass2'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doRegister(); });
});

function connectSocket() {
  socket = io();
  socket.on('connect', () => {
    setStatus(true);
    socket.emit('join', { channel:currentChannel, name:myName, color:myColor, bg:myBg });
  });
  socket.on('disconnect', () => setStatus(false));

  socket.on('history', hist => {
    for (const ch in hist) localMessages[ch] = hist[ch] || [];
    renderMessages();
  });

  socket.on('message', ({ channel, ...msg }) => {
    if (!localMessages[channel]) localMessages[channel] = [];
    if (msg.sender===myName && localMessages[channel].some(m=>m.id===msg.id)) return;
    localMessages[channel].push(msg);
    if (channel===currentChannel) { appendMessage(msg); checkMention(msg); }
    else {
      unread[channel] = (unread[channel]||0)+1;
      const b = document.getElementById('badge-'+channel);
      if (b) { b.style.display='flex'; b.textContent=unread[channel]; }
    }
  });

  socket.on('reaction', ({ channel, msgId, emoji, user }) => {
    const msgs = localMessages[channel];
    if (!msgs) return;
    const msg = msgs.find(m=>m.id===msgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(user);
    if (idx===-1) msg.reactions[emoji].push(user);
    else msg.reactions[emoji].splice(idx,1);
    if (channel===currentChannel) updateReactionBar(msgId, msg.reactions);
  });

  socket.on('typing',      ({ name }) => { typingNames[name]=true;  renderTyping(); });
  socket.on('stop-typing', ({ name }) => { delete typingNames[name]; renderTyping(); });

  socket.on('online-users', users => {
    onlineUsers = users;
    document.getElementById('online-badge').textContent = `• ${users.length} online`;
    const list = document.getElementById('online-list');
    list.innerHTML = '';
    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item';
      const isMe = u.name===myName;
      div.innerHTML = `<div class="avatar" style="background:${u.bg};color:${u.color}">${u.name[0].toUpperCase()}</div><span style="font-size:13px">${esc(u.name)}${isMe?' <span style="color:var(--muted);font-size:11px">(tú)</span>':''}</span><div class="dot"></div>`;
      div.onclick = () => { if (!isMe) insertMention(u.name); };
      list.appendChild(div);
    });
  });
}

function setStatus(online) {
  const el = document.getElementById('conn-status');
  el.textContent = online ? '• online' : '• offline';
  el.className   = online ? 'connected' : 'disconnected';
}

function switchChannel(ch) {
  if (socket) socket.emit('join', { channel:ch, name:myName, color:myColor, bg:myBg });
  currentChannel=ch; unread[ch]=0;
  const b = document.getElementById('badge-'+ch);
  if (b) b.style.display='none';
  document.querySelectorAll('.channel').forEach(el=>el.classList.toggle('active', el.textContent.trim().startsWith(ch)));
  document.getElementById('channel-title').textContent = CHANNELS_INFO[ch]?.label||'#'+ch;
  document.getElementById('channel-sub').textContent   = CHANNELS_INFO[ch]?.sub||'';
  renderMessages();
}

function nowTime(){ const d=new Date(); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }

function renderMessages() {
  const c = document.getElementById('messages');
  c.innerHTML = '';
  const msgs = localMessages[currentChannel]||[];
  if (!msgs.length) { c.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;margin:auto;padding:40px 0">No hay nada</div>'; return; }
  const dl = document.createElement('div'); dl.className='day-label'; dl.textContent='Hoy'; c.appendChild(dl);
  let last = null;
  msgs.forEach(m => { buildMsg(c,m,last); last=m.sender; });
  c.scrollTop = c.scrollHeight;
}

function appendMessage(m) {
  const c = document.getElementById('messages');
  const msgs = localMessages[currentChannel];
  const last = msgs.length>1 ? msgs[msgs.length-2].sender : null;
  buildMsg(c,m,last);
  c.scrollTop = c.scrollHeight;
}

function buildMsg(container, m, lastSender) {
  const isOwn   = m.sender===myName;
  const showAv  = lastSender!==m.sender;
  const row     = document.createElement('div');
  row.className = 'msg-row'+(isOwn?' own':'');
  row.dataset.msgId = m.id||'';

  const av = document.createElement('div');
  av.className = 'msg-avatar'+(showAv?'':' ghost');
  if (showAv) { av.textContent=m.sender[0].toUpperCase(); av.style.background=m.bg||'rgba(124,106,247,0.15)'; av.style.color=m.color||'#a78bfa'; }

  const rBtn = document.createElement('div'); rBtn.className='react-btn';
  REACTION_EMOJIS.forEach(em => {
    const b = document.createElement('button'); b.textContent=em; b.title=em;
    b.onclick = e => { e.stopPropagation(); emitReaction(m.id,em); };
    rBtn.appendChild(b);
  });
  row.appendChild(rBtn);

  const wrap   = document.createElement('div'); wrap.className='bubble-wrap';
  const bubble = document.createElement('div');
  bubble.className = 'bubble '+(isOwn?'own':'other');
  bubble.dataset.msgId = m.id||'';

  let html = '';
  if (showAv&&!isOwn) html += `<div class="sender-name" style="color:${m.color||'#a78bfa'}">${esc(m.sender)}</div>`;
  if (m.text) html += renderText(esc(m.text));
  if (m.attachment) {
    const att = m.attachment;
    if (att.type==='image') {
      html += `<img class="msg-image" src="${att.url}" alt="imagen" onclick="openLightbox('${att.url}')" loading="lazy" />`;
    } else {
      html += `<a class="msg-file" href="${att.url}" target="_blank" download="${esc(att.name)}"><span class="msg-file-icon">${fileIcon(att.name)}</span><div><div class="msg-file-name">${esc(att.name)}</div><div class="msg-file-size">${att.size||''}</div></div></a>`;
    }
  }
  bubble.innerHTML = html;

  const meta = document.createElement('div'); meta.className='bubble-meta'; meta.textContent=m.time||'';
  const rBar = document.createElement('div'); rBar.className='reactions-bar'; rBar.id='rbar-'+m.id;
  if (m.reactions) buildReactionPills(rBar, m.reactions, m.id);

  wrap.appendChild(bubble); wrap.appendChild(meta); wrap.appendChild(rBar);
  if (isOwn) { row.appendChild(wrap); row.appendChild(av); }
  else        { row.appendChild(av);  row.appendChild(wrap); }
  container.appendChild(row);
}

function renderText(escaped) {
  return escaped.replace(/@([^\s<]+)/g, (_,n) => `<span class="mention-tag">@${n}</span>`);
}

function checkMention(msg) {
  if (!msg.text) return;
  if (msg.text.toLowerCase().includes('@'+myName.toLowerCase())) {
    setTimeout(() => {
      const b = document.querySelector(`.bubble[data-msg-id="${msg.id}"]`);
      if (b) b.classList.add('mentioned','mention-flash');
    }, 60);
    showBanner(msg.sender, msg.text);
  }
}

function showBanner(sender, text) {
  const banner = document.getElementById('notif-banner');
  const short  = text.length>55 ? text.slice(0,52)+'…' : text;
  document.getElementById('notif-text').innerHTML = `<span class="notif-name">${esc(sender)}</span> te mencionó:<br><span style="color:var(--muted)">${esc(short)}</span>`;
  banner.style.display = 'flex';
  clearTimeout(banner._t);
  banner._t = setTimeout(() => { banner.style.display='none'; }, 4500);
}

function emitReaction(msgId, emoji) { if(socket&&msgId) socket.emit('reaction',{channel:currentChannel,msgId,emoji,user:myName}); }
function updateReactionBar(msgId, reactions) { const b=document.getElementById('rbar-'+msgId); if(b) buildReactionPills(b,reactions,msgId); }
function buildReactionPills(bar, reactions, msgId) {
  bar.innerHTML='';
  for (const [emoji,users] of Object.entries(reactions)) {
    if (!users.length) continue;
    const pill = document.createElement('div');
    pill.className = 'reaction-pill'+(users.includes(myName)?' mine':'');
    pill.title = users.slice(0,5).join(', ')+(users.length>5?` y ${users.length-5} más`:'');
    pill.innerHTML = `${emoji} <span class="rcount">${users.length}</span>`;
    pill.onclick = () => emitReaction(msgId, emoji);
    bar.appendChild(pill);
  }
}

function handleMentionInput() {
  const input=document.getElementById('msg-input'), val=input.value, cursor=input.selectionStart;
  const m=val.slice(0,cursor).match(/@([\w]*)$/);
  if (!m) { closeMentionPopup(); return; }
  const results=onlineUsers.filter(u=>u.name!==myName&&u.name.toLowerCase().startsWith(m[1].toLowerCase()));
  if (!results.length) { closeMentionPopup(); return; }
  const popup=document.getElementById('mention-popup'); popup.innerHTML=''; mentionIdx=-1;
  results.forEach(u => {
    const item=document.createElement('div'); item.className='mention-item';
    item.innerHTML=`<div class="m-avatar" style="background:${u.bg};color:${u.color}">${u.name[0].toUpperCase()}</div><span>${esc(u.name)}</span>`;
    item.onmousedown=e=>{ e.preventDefault(); completeMention(u.name); };
    popup.appendChild(item);
  });
  const rect=input.getBoundingClientRect();
  popup.style.left=rect.left+'px'; popup.style.bottom=(window.innerHeight-rect.top+6)+'px'; popup.style.display='block';
}
function closeMentionPopup(){ document.getElementById('mention-popup').style.display='none'; mentionIdx=-1; }
function completeMention(name) {
  const input=document.getElementById('msg-input'), cursor=input.selectionStart;
  const before=input.value.slice(0,cursor), after=input.value.slice(cursor);
  const nb=before.replace(/@[\w]*$/,'@'+name+' ');
  input.value=nb+after; input.focus(); input.setSelectionRange(nb.length,nb.length); closeMentionPopup();
}
function insertMention(name) {
  const input=document.getElementById('msg-input'), val=input.value;
  input.value=(val&&!val.endsWith(' ')?val+' ':val)+'@'+name+' '; input.focus();
}
document.addEventListener('keydown', e => {
  const popup=document.getElementById('mention-popup');
  if (popup.style.display==='none') return;
  const items=popup.querySelectorAll('.mention-item');
  if (e.key==='ArrowDown'){ e.preventDefault(); mentionIdx=Math.min(mentionIdx+1,items.length-1); items.forEach((el,i)=>el.classList.toggle('active',i===mentionIdx)); }
  else if (e.key==='ArrowUp'){ e.preventDefault(); mentionIdx=Math.max(mentionIdx-1,0); items.forEach((el,i)=>el.classList.toggle('active',i===mentionIdx)); }
  else if (e.key==='Tab'||(e.key==='Enter'&&mentionIdx>=0)){ e.preventDefault(); completeMention(items[mentionIdx].querySelector('span').textContent); }
  else if (e.key==='Escape') closeMentionPopup();
});

function handleFileSelect(e) {
  const file=e.target.files[0]; if(!file) return; e.target.value='';
  if (file.size>10*1024*1024) { alert('Máximo 10MB'); return; }
  pendingFile=file;
  const wrap=document.getElementById('upload-thumb-wrap');
  document.getElementById('upload-name').textContent=file.name;
  document.getElementById('progress-bar').style.width='0%'; wrap.innerHTML='';
  if (file.type.startsWith('image/')) { const img=document.createElement('img'); img.className='upload-thumb'; img.src=URL.createObjectURL(file); wrap.appendChild(img); }
  else { const ic=document.createElement('div'); ic.className='upload-file-icon'; ic.textContent=fileIcon(file.name); wrap.appendChild(ic); }
  document.getElementById('upload-preview').classList.add('active');
}
function cancelUpload() { pendingFile=null; document.getElementById('upload-preview').classList.remove('active'); document.getElementById('progress-bar').style.width='0%'; }
async function uploadCloudinary(file) {
  if (CLOUD_NAME==='TU_CLOUD_NAME') { alert('Configura CLOUD_NAME y UPLOAD_PRESET.'); return null; }
  const fd=new FormData(); fd.append('file',file); fd.append('upload_preset',UPLOAD_PRESET);
  return new Promise((res,rej) => {
    const xhr=new XMLHttpRequest();
    xhr.open('POST',`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
    xhr.upload.onprogress=e=>{ if(e.lengthComputable) document.getElementById('progress-bar').style.width=(e.loaded/e.total*100)+'%'; };
    xhr.onload=()=>{ if(xhr.status===200) res(JSON.parse(xhr.responseText)); else rej(new Error('Error '+xhr.status)); };
    xhr.onerror=()=>rej(new Error('Error de red')); xhr.send(fd);
  });
}
function fmtBytes(b){ return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB'; }
function fileIcon(name){ return ({xlsx:'\u{1F4CA}',xls:'\u{1F4CA}',csv:'\u{1F4CA}',pdf:'\u{1F4C4}',doc:'\u{1F4DD}',docx:'\u{1F4DD}',zip:'\u{1F5DC}\u{FE0F}',mp4:'\u{1F3AC}',mp3:'\u{1F3B5}'})[name.split('.').pop().toLowerCase()]||'\u{1F4CE}'; }

async function sendMessage() {
  const input=document.getElementById('msg-input'), text=input.value.trim();
  if (!text&&!pendingFile) return; if(!socket) return;
  let attachment=null;
  if (pendingFile) {
    const btn=document.querySelector('.send-btn'); btn.disabled=true;
    try {
      const r=await uploadCloudinary(pendingFile); if(!r){btn.disabled=false;return;}
      attachment={ url:r.secure_url, name:pendingFile.name, size:fmtBytes(pendingFile.size), type:pendingFile.type.startsWith('image/')?'image':'file' };
    } catch(err){ alert('Error al subir: '+err.message); btn.disabled=false; return; }
    btn.disabled=false; cancelUpload();
  }
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const outMsg={ id, sender:myName, text, color:myColor, bg:myBg, attachment, time:nowTime(), reactions:{} };
  localMessages[currentChannel].push(outMsg); appendMessage(outMsg);
  socket.emit('message',{ id, channel:currentChannel, sender:myName, text, color:myColor, bg:myBg, attachment });
  input.value=''; closeMentionPopup(); stopTyping();
}

function handleKey(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); } }

function handleTyping(){ if(!isTyping&&socket){isTyping=true;socket.emit('typing',{channel:currentChannel,name:myName});} clearTimeout(typingTimer); typingTimer=setTimeout(stopTyping,2000); }
function stopTyping(){ if(isTyping&&socket){isTyping=false;socket.emit('stop-typing',{channel:currentChannel,name:myName});} }
function renderTyping(){
  const row=document.getElementById('typing-row'), names=Object.keys(typingNames).filter(n=>n!==myName);
  if(!names.length){row.innerHTML='';return;}
  row.innerHTML=`<span style="display:inline-flex;align-items:center;gap:6px">${names.length===1?names[0]:names.join(' y ')} ${names.length===1?'está escribiendo':'están escribiendo'} <span class="typing-dots"><span></span><span></span><span></span></span></span>`;
}

function insertEmoji(){ const e=['\u{1F604}','\u{1F680}','\u{1F4A1}','\u{1F525}','\u{2728}','\u{1F440}','\u{1F3AF}','\u{1F914}','\u{1F60E}','\u{1F44B}'],input=document.getElementById('msg-input'); input.value+=e[Math.floor(Math.random()*e.length)]; input.focus(); }
function openLightbox(url){ document.getElementById('lightbox-img').src=url; document.getElementById('lightbox').style.display='flex'; }
function closeLightbox(){ document.getElementById('lightbox').style.display='none'; }
function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }


