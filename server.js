import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import svgCaptcha from 'svg-captcha';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const upload = multer({ dest: uploadsDir, limits: { fileSize: 20 * 1024 * 1024 } });

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return {}; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function getRooms() { return readJSON(ROOMS_FILE); }
function saveRooms(r) { writeJSON(ROOMS_FILE, r); }
function getMessages() { return readJSON(MESSAGES_FILE); }
function saveMessages(m) { writeJSON(MESSAGES_FILE, m); }

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  const rooms = getRooms();
  const messages = getMessages();
  let changed = false;
  for (const id in rooms) {
    if (rooms[id].expires_at < now) {
      if (messages[id]) {
        for (const msg of messages[id]) {
          if (msg.type === 'image') {
            const fp = path.join(uploadsDir, msg.content);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          }
        }
      }
      delete rooms[id]; delete messages[id]; changed = true;
    }
  }
  if (changed) { saveRooms(rooms); saveMessages(messages); }
}, 3600000);

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/captcha', (req, res) => {
  const captcha = svgCaptcha.create({ size: 4, noise: 2, color: true, background: '#faf5ef' });
  res.json({ svg: captcha.data, token: captcha.text.toLowerCase() });
});

app.post('/api/rooms', (req, res) => {
  const { name, password, captchaToken, captchaInput } = req.body;
  if (!captchaInput || captchaInput.toLowerCase() !== captchaToken) return res.status(400).json({ error: 'captcha_invalid' });
  const id = uuidv4().slice(0, 8);
  const rooms = getRooms();
  rooms[id] = { name: name || '', password: password || '', created_at: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 86400 };
  saveRooms(rooms);
  res.json({ id, name: name || '', hasPassword: !!password });
});

app.post('/api/rooms/:id/join', (req, res) => {
  const rooms = getRooms();
  const room = rooms[req.params.id];
  if (!room || room.expires_at < Math.floor(Date.now() / 1000)) return res.status(404).json({ error: 'room_not_found' });
  if (room.password && room.password !== (req.body.password || '')) return res.status(403).json({ error: 'wrong_password' });
  const messages = getMessages();
  const msgs = messages[req.params.id] || [];
  res.json({ room: { id: req.params.id, name: room.name, expiresAt: room.expires_at }, messages: msgs.slice(-200) });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const ext = path.extname(req.file.originalname) || '.jpg';
  const newName = req.file.filename + ext;
  fs.renameSync(req.file.path, path.join(uploadsDir, newName));
  res.json({ filename: newName });
});

const HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zal — временные комнаты</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#faf5ef;--bg2:#ffffff;--text:#1a1a1a;--text2:#6b6158;--orange:#FF6B35;--orange2:#FF8C42;
  --orange3:#FFA94D;--border:#e8ddd0;--msg-other:#ffffff;--msg-mine:#FFF3EB;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.04);--shadow:0 4px 24px rgba(0,0,0,0.06);
  --shadow-lg:0 12px 40px rgba(0,0,0,0.1);--radius:24px;--radius-sm:14px;--radius-xs:10px;
  --font:'Inter',system-ui,sans-serif;--transition:0.25s cubic-bezier(0.4,0,0.2,1);
}
.dark{--bg:#141210;--bg2:#1e1b18;--text:#f0e8de;--text2:#9b8e80;--border:#2a2520;--msg-other:#1e1b18;--msg-mine:#2d2015;--shadow-sm:0 1px 3px rgba(0,0,0,0.2);--shadow:0 4px 24px rgba(0,0,0,0.3);--shadow-lg:0 12px 40px rgba(0,0,0,0.4)}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;background-image:radial-gradient(ellipse at 50% 0%,var(--orange)05,transparent 60%),radial-gradient(ellipse at 80% 100%,var(--orange3)05,transparent 50%);background-attachment:fixed}
.hidden{display:none!important}
.app-container{width:100%;max-width:900px;margin:0 auto;padding:24px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 28px;border:none;border-radius:var(--radius-xs);font-size:14px;font-weight:600;cursor:pointer;transition:all var(--transition);font-family:var(--font);letter-spacing:-0.01em;position:relative;overflow:hidden}
.btn-primary{background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;box-shadow:0 4px 16px rgba(255,107,53,0.3)}
.btn-primary:hover{box-shadow:0 6px 24px rgba(255,107,53,0.45);transform:translateY(-2px)}
.btn-primary:active{transform:scale(0.97)}
.btn-secondary{background:var(--bg2);color:var(--text);border:1.5px solid var(--border);box-shadow:var(--shadow-sm)}
.btn-secondary:hover{border-color:var(--orange);box-shadow:var(--shadow);transform:translateY(-1px)}
.btn-sm{padding:8px 16px;font-size:13px;border-radius:8px}
.btn-icon{width:40px;height:40px;padding:0;border-radius:12px;font-size:18px}
input{width:100%;padding:13px 16px;border:1.5px solid var(--border);border-radius:var(--radius-xs);font-size:14px;font-family:var(--font);background:var(--bg2);color:var(--text);transition:all var(--transition);outline:none}
input:focus{border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,107,53,0.1)}
.card{background:var(--bg2);border-radius:var(--radius);padding:32px;box-shadow:var(--shadow);border:1px solid var(--border);backdrop-filter:blur(10px)}
.card-header{text-align:center;margin-bottom:28px}
.card-header h1{font-size:28px;font-weight:800;letter-spacing:-0.02em;margin-bottom:6px;background:linear-gradient(135deg,var(--orange),var(--orange3));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.card-header p{color:var(--text2);font-size:14px;line-height:1.5;max-width:400px;margin:0 auto}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gap-sm{margin-top:8px}
.gap{margin-top:14px}
.gap-lg{margin-top:24px}
label{font-size:12px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.03em}
.captcha-box{display:flex;align-items:center;gap:12px;margin:14px 0;padding:12px;background:var(--bg);border-radius:var(--radius-xs);border:1px dashed var(--border)}
.captcha-box svg{border-radius:8px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;background:linear-gradient(135deg,var(--orange),var(--orange2));color:#fff;box-shadow:0 2px 8px rgba(255,107,53,0.25)}
.badge::before{content:'';width:7px;height:7px;border-radius:50%;background:#fff;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}

/* Логотип */
.logo-3d{width:64px;height:64px;margin:0 auto 16px;perspective:400px}
.logo-cube{width:100%;height:100%;position:relative;transform-style:preserve-3d;animation:rotateCube 8s infinite linear}
.logo-face{position:absolute;width:64px;height:64px;border-radius:14px;background:linear-gradient(135deg,var(--orange),var(--orange3));opacity:0.85;box-shadow:0 8px 32px rgba(255,107,53,0.4);border:2px solid rgba(255,255,255,0.3)}
.logo-face:nth-child(1){transform:rotateY(0deg) translateZ(32px)}
.logo-face:nth-child(2){transform:rotateY(90deg) translateZ(32px)}
.logo-face:nth-child(3){transform:rotateY(180deg) translateZ(32px)}
.logo-face:nth-child(4){transform:rotateY(270deg) translateZ(32px)}
.logo-face:nth-child(5){transform:rotateX(90deg) translateZ(32px)}
.logo-face:nth-child(6){transform:rotateX(-90deg) translateZ(32px)}
@keyframes rotateCube{from{transform:rotateX(-20deg) rotateY(0deg)}to{transform:rotateX(-20deg) rotateY(360deg)}}

/* Чат */
.chat-container{display:flex;flex-direction:column;height:calc(100vh - 48px);max-height:800px;background:var(--bg2);border-radius:var(--radius);box-shadow:var(--shadow-lg);border:1px solid var(--border);overflow:hidden}
.chat-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;gap:12px}
.chat-header h2{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.chat-header-actions{display:flex;gap:8px;flex-shrink:0}
.chat-msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.chat-msgs::-webkit-scrollbar{width:5px}
.chat-msgs::-webkit-scrollbar-track{background:transparent}
.chat-msgs::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px}
.chat-msgs::-webkit-scrollbar-thumb:hover{background:var(--orange)}
.msg{display:flex;gap:10px;max-width:70%;animation:fadeIn 0.3s ease}
.msg.mine{align-self:flex-end;flex-direction:row-reverse}
.msg-avatar{width:34px;height:34px;border-radius:10px;flex-shrink:0;overflow:hidden;box-shadow:var(--shadow-sm)}
.msg-bubble{padding:10px 15px;border-radius:var(--radius-xs);font-size:14px;line-height:1.45;word-break:break-word;position:relative;box-shadow:var(--shadow-sm)}
.msg.other .msg-bubble{background:var(--msg-other);border:1px solid var(--border)}
.msg.mine .msg-bubble{background:var(--msg-mine);border:1px solid rgba(255,107,53,0.2)}
.msg-nick{font-size:11px;font-weight:700;color:var(--orange);margin-bottom:3px}
.msg-time{font-size:10px;color:var(--text2);margin-top:5px;text-align:right}
.msg img{max-width:280px;max-height:280px;border-radius:10px;cursor:pointer;transition:transform 0.2s}
.msg img:hover{transform:scale(1.02)}
.chat-input{padding:14px 20px;background:var(--bg2);border-top:1px solid var(--border);flex-shrink:0}
.chat-input .row{gap:8px}
.chat-input input{flex:1;border-radius:24px;padding:12px 18px;background:var(--bg);border:1.5px solid transparent}
.chat-input input:focus{border-color:var(--orange);background:var(--bg2)}
.typing{font-size:12px;color:var(--text2);padding:6px 20px;font-style:italic;flex-shrink:0;display:flex;align-items:center;gap:6px}
.typing-dots{display:flex;gap:3px}
.typing-dots span{width:5px;height:5px;border-radius:50%;background:var(--orange);animation:bounce 1.2s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(4px);animation:fadeIn 0.2s}
.modal{background:var(--bg2);border-radius:var(--radius);padding:28px;width:100%;max-width:380px;box-shadow:var(--shadow-lg);border:1px solid var(--border)}
.modal h3{font-size:18px;font-weight:700;margin-bottom:18px}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* Десктоп */
@media(min-width:640px){
  .chat-container{height:calc(100vh - 48px);max-height:750px;border-radius:var(--radius)}
  .msg{max-width:60%}
}
@media(max-width:480px){
  .app-container{padding:12px}
  .card{padding:20px}
  .card-header h1{font-size:22px}
  .msg{max-width:85%}
  .msg img{max-width:200px;max-height:200px}
  .chat-header{padding:12px 14px}
  .chat-input{padding:10px 14px}
}
</style>
</head>
<body>

<div id="screenHome" class="app-container">
  <div class="card">
    <div class="card-header">
      <div class="logo-3d"><div class="logo-cube"><div class="logo-face"></div><div class="logo-face"></div><div class="logo-face"></div><div class="logo-face"></div><div class="logo-face"></div><div class="logo-face"></div></div></div>
      <h1>Zal</h1>
      <p data-i18n="tagline">Временные комнаты для быстрых обсуждений. Создай комнату, пригласи друзей, через 24 часа всё исчезнет.</p>
    </div>
    <div class="row gap" style="justify-content:center">
      <button class="btn btn-primary" onclick="showCreate()" data-i18n="createRoom">Создать комнату</button>
      <input type="text" id="joinId" placeholder="Код комнаты" maxlength="8" style="width:130px;text-align:center">
      <button class="btn btn-secondary" onclick="joinRoom()" data-i18n="join">Войти</button>
    </div>
    <div class="row gap" style="justify-content:center">
      <button class="btn btn-sm btn-secondary" onclick="toggleTheme()" data-i18n="theme">🌓 Тема</button>
      <select id="langSelect" onchange="setLang(this.value)" style="padding:9px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-family:var(--font);font-size:13px;cursor:pointer">
        <option value="ru">Русский</option><option value="en">English</option>
      </select>
    </div>
  </div>
</div>

<div id="screenCreate" class="app-container hidden">
  <div class="card">
    <div class="card-header"><h1 data-i18n="newRoom">Новая комната</h1></div>
    <label data-i18n="roomName">Название (необязательно)</label>
    <input type="text" id="roomName" placeholder="Вечерний движ" maxlength="30">
    <label data-i18n="roomPass" style="margin-top:14px">Пароль (необязательно)</label>
    <input type="text" id="roomPass" placeholder="••••••" maxlength="20">
    <div class="captcha-box"><div id="captchaSvg"></div><input type="text" id="captchaInput" placeholder="Код" maxlength="6" style="width:100px;text-align:center"></div>
    <div class="row gap"><button class="btn btn-primary" onclick="createRoom()" data-i18n="create">Создать</button><button class="btn btn-secondary" onclick="showHome()" data-i18n="back">Назад</button></div>
  </div>
</div>

<div id="screenChat" class="app-container hidden">
  <div class="chat-container">
    <div class="chat-header">
      <h2 id="chatTitle">Комната</h2>
      <span class="badge" id="onlineCount">1</span>
      <div class="chat-header-actions">
        <button class="btn btn-sm btn-secondary" onclick="openSettings()">⚙️</button>
        <button class="btn btn-sm btn-secondary" onclick="leaveRoom()" data-i18n="leave">Выйти</button>
      </div>
    </div>
    <div class="typing hidden" id="typingIndicator"><div class="typing-dots"><span></span><span></span><span></span></div><span id="typingText"></span></div>
    <div class="chat-msgs" id="chatMessages"></div>
    <div class="chat-input">
      <div class="row">
        <input type="text" id="msgInput" placeholder="Сообщение..." data-i18n-placeholder="msgPlaceholder" autocomplete="off">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="attachImage()" title="Фото">📷</button>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="sendLocation()" title="Гео">📍</button>
        <button class="btn btn-sm btn-primary btn-icon" onclick="sendMsg()" title="Отправить">➤</button>
      </div>
      <input type="file" id="fileInput" accept="image/*" class="hidden" onchange="uploadImage()">
    </div>
  </div>
</div>

<div id="modalSettings" class="modal-overlay hidden" onclick="if(event.target===this)closeSettings()">
  <div class="modal">
    <h3 data-i18n="settings">Настройки</h3>
    <label data-i18n="theme">Тема</label>
    <select id="themeSelect" onchange="setTheme(this.value)" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-family:var(--font);font-size:14px;cursor:pointer">
      <option value="light" data-i18n="themeLight">Светлая</option><option value="dark" data-i18n="themeDark">Тёмная</option>
    </select>
    <label style="margin-top:14px" data-i18n="language">Язык</label>
    <select id="settingsLangSelect" onchange="setLang(this.value)" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-family:var(--font);font-size:14px;cursor:pointer">
      <option value="ru">Русский</option><option value="en">English</option>
    </select>
    <div class="gap"><button class="btn btn-primary" onclick="closeSettings()" data-i18n="close" style="width:100%">Закрыть</button></div>
  </div>
</div>

<div id="modalPassword" class="modal-overlay hidden" onclick="if(event.target===this)closePassword()">
  <div class="modal">
    <h3 data-i18n="passRequired">Требуется пароль</h3>
    <input type="password" id="passwordInput" placeholder="Пароль">
    <div class="row gap"><button class="btn btn-primary" onclick="submitPassword()" data-i18n="enter">Войти</button><button class="btn btn-secondary" onclick="closePassword()" data-i18n="cancel">Отмена</button></div>
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const i18n={ru:{tagline:"Временные комнаты для быстрых обсуждений. Создай комнату, пригласи друзей, через 24 часа всё исчезнет.",createRoom:"Создать комнату",join:"Войти",theme:"🌓 Тема",newRoom:"Новая комната",roomName:"Название (необязательно)",roomPass:"Пароль (необязательно)",create:"Создать",back:"Назад",leave:"Выйти",settings:"Настройки",themeLight:"Светлая",themeDark:"Тёмная",language:"Язык",close:"Закрыть",passRequired:"Требуется пароль",enter:"Войти",cancel:"Отмена",msgPlaceholder:"Сообщение...",online:"онлайн",typing:"печатает...",captchaInvalid:"Неверная капча",roomNotFound:"Комната не найдена",wrongPass:"Неверный пароль",location:"Моё местоположение",copied:"Ссылка скопирована!",fileTooBig:"Файл больше 20 MB",geoNotSupported:"Геолокация не поддерживается",geoError:"Не удалось получить местоположение"},en:{tagline:"Temporary rooms for quick discussions. Create a room, invite friends, everything disappears in 24 hours.",createRoom:"Create Room",join:"Join",theme:"🌓 Theme",newRoom:"New Room",roomName:"Name (optional)",roomPass:"Password (optional)",create:"Create",back:"Back",leave:"Leave",settings:"Settings",themeLight:"Light",themeDark:"Dark",language:"Language",close:"Close",passRequired:"Password Required",enter:"Enter",cancel:"Cancel",msgPlaceholder:"Message...",online:"online",typing:"typing...",captchaInvalid:"Invalid captcha",roomNotFound:"Room not found",wrongPass:"Wrong password",location:"My location",copied:"Link copied!",fileTooBig:"File exceeds 20 MB",geoNotSupported:"Geolocation not supported",geoError:"Could not get location"}};
let currentLang=(navigator.language||"ru").split("-")[0];if(!i18n[currentLang])currentLang="ru";
function t(key){return i18n[currentLang][key]||key}
function applyLang(){document.documentElement.lang=currentLang;document.querySelectorAll("[data-i18n]").forEach(el=>{if(el.hasAttribute("data-i18n-placeholder"))el.placeholder=t(el.getAttribute("data-i18n-placeholder"));else el.textContent=t(el.getAttribute("data-i18n"))});document.getElementById("langSelect").value=currentLang;document.getElementById("settingsLangSelect").value=currentLang}
function setLang(lang){currentLang=lang;localStorage.setItem("zal_lang",lang);applyLang()}
function applyTheme(theme){document.body.classList.toggle("dark",theme==="dark");document.getElementById("themeSelect").value=theme}
function toggleTheme(){const t=document.body.classList.contains("dark")?"light":"dark";applyTheme(t);localStorage.setItem("zal_theme",t)}
function setTheme(t){applyTheme(t);localStorage.setItem("zal_theme",t)}
const savedLang=localStorage.getItem("zal_lang");if(savedLang&&i18n[savedLang])currentLang=savedLang;applyLang();
const savedTheme=localStorage.getItem("zal_theme")||"light";applyTheme(savedTheme);
let socket=null,roomId=null,userId=null,userNick=null,userAvatar=null,captchaToken="",typingTimer=null,typingTimeout=null,pendingRoomId=null;
function showHome(){hideAll();document.getElementById("screenHome").classList.remove("hidden")}
function showCreate(){hideAll();document.getElementById("screenCreate").classList.remove("hidden");loadCaptcha()}
function showChat(){hideAll();document.getElementById("screenChat").classList.remove("hidden")}
function hideAll(){["screenHome","screenCreate","screenChat"].forEach(id=>document.getElementById(id).classList.add("hidden"))}
async function loadCaptcha(){const r=await fetch("/api/captcha");const d=await r.json();captchaToken=d.token;document.getElementById("captchaSvg").innerHTML=d.svg}
async function createRoom(){const name=document.getElementById("roomName").value.trim();const password=document.getElementById("roomPass").value.trim();const ci=document.getElementById("captchaInput").value.trim();const r=await fetch("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,password,captchaToken,captchaInput:ci})});const d=await r.json();if(r.status!==200){alert(t(d.error));loadCaptcha();return}roomId=d.id;connectSocket();showChat();document.getElementById("chatTitle").textContent=d.name||"#"+d.id;history.pushState({},"","/?room="+d.id);const url=location.origin+"/?room="+d.id;navigator.clipboard.writeText(url).then(()=>alert(t("copied"))).catch(()=>prompt(t("copied"),url))}
async function joinRoom(rc,pass){const id=rc||document.getElementById("joinId").value.trim();if(!id)return;const r=await fetch("/api/rooms/"+id+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pass||""})});const d=await r.json();if(r.status===403){pendingRoomId=id;document.getElementById("modalPassword").classList.remove("hidden");document.getElementById("passwordInput").value="";document.getElementById("passwordInput").focus();return}if(r.status!==200){alert(t(d.error));return}roomId=id;connectSocket();showChat();document.getElementById("chatTitle").textContent=d.room.name||"#"+d.room.id;history.pushState({},"","/?room="+id);d.messages.forEach(m=>addMessageToChat(m))}
function submitPassword(){const p=document.getElementById("passwordInput").value;document.getElementById("modalPassword").classList.add("hidden");joinRoom(pendingRoomId,p)}
function closePassword(){document.getElementById("modalPassword").classList.add("hidden")}
function generateAvatarLocal(seed){const c=["#FF6B35","#FF8C42","#FFA94D","#FFD166","#06D6A0","#118AB2","#073B4C","#EF476F","#8338EC","#3A86FF"];let h=0;for(let i=0;i<seed.length;i++){h=((h<<5)-h)+seed.charCodeAt(i);h|=0}const col=c[Math.abs(h)%c.length];const sh=["circle","rect","polygon","diamond"];const shape=sh[Math.abs(h*7)%sh.length];let s='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="'+col+'" opacity="0.15"/>';if(shape==="circle")s+='<circle cx="20" cy="20" r="12" fill="'+col+'" opacity="0.7"/>';else if(shape==="rect")s+='<rect x="9" y="9" width="22" height="22" rx="4" fill="'+col+'" opacity="0.7"/>';else if(shape==="polygon")s+='<polygon points="20,7 33,30 7,30" fill="'+col+'" opacity="0.7"/>';else s+='<rect x="9" y="9" width="22" height="22" rx="4" fill="'+col+'" opacity="0.7" transform="rotate(45 20 20)"/>';s+='</svg>';return"data:image/svg+xml;base64,"+btoa(s)}
function getRandomNick(){const a=["Синий","Красный","Зелёный","Фиолетовый","Оранжевый","Белый","Чёрный","Жёлтый","Голубой","Розовый"];const n=["Кот","Пёс","Слон","Ворон","Лис","Кит","Тигр","Филин","Ёж","Бобр"];return a[Math.floor(Math.random()*a.length)]+" "+n[Math.floor(Math.random()*n.length)]}
function playSound(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type="sine";o.frequency.value=800;g.gain.value=0.08;o.start();o.stop(ctx.currentTime+0.06)}catch(e){}}
function connectSocket(){userId="u_"+Date.now()+"_"+Math.random().toString(36).slice(2,6);userNick=getRandomNick();userAvatar=generateAvatarLocal(userId);socket=io();socket.emit("join",{roomId,userId,nick:userNick,avatar:userAvatar});socket.on("message",msg=>{addMessageToChat(msg);playSound()});socket.on("userJoined",d=>updateOnlineCount(d.count));socket.on("userLeft",d=>updateOnlineCount(d.count));socket.on("onlineCount",d=>updateOnlineCount(d.count));socket.on("typing",d=>{if(d.userId!==userId){document.getElementById("typingText").textContent=d.nick+" "+t("typing");document.getElementById("typingIndicator").classList.remove("hidden");clearTimeout(typingTimer);typingTimer=setTimeout(()=>document.getElementById("typingIndicator").classList.add("hidden"),2000)}});socket.on("kicked",()=>{alert("Вас удалили из комнаты.");leaveRoom()})}
function sendMsg(){const inp=document.getElementById("msgInput");const text=inp.value.trim();if(!text||!socket)return;socket.emit("message",{type:"text",content:text});inp.value="";socket.emit("stopTyping")}
function sendLocation(){if(!navigator.geolocation){alert(t("geoNotSupported"));return}navigator.geolocation.getCurrentPosition(pos=>{const link="https://www.google.com/maps?q="+pos.coords.latitude+","+pos.coords.longitude;if(socket)socket.emit("message",{type:"location",content:link})},()=>alert(t("geoError")),{enableHighAccuracy:true,timeout:10000,maximumAge:0})}
function attachImage(){document.getElementById("fileInput").click()}
async function uploadImage(){const file=document.getElementById("fileInput").files[0];if(!file)return;if(file.size>20*1024*1024){alert(t("fileTooBig"));return}const fd=new FormData();fd.append("image",file);fd.append("roomId",roomId);const r=await fetch("/api/upload",{method:"POST",body:fd});const d=await r.json();if(d.filename&&socket)socket.emit("message",{type:"image",content:d.filename});document.getElementById("fileInput").value=""}
function leaveRoom(){if(socket){socket.emit("leave");socket.disconnect();socket=null}roomId=null;document.getElementById("chatMessages").innerHTML="";document.getElementById("typingIndicator").classList.add("hidden");showHome();history.pushState({},"","/")}
function openSettings(){document.getElementById("modalSettings").classList.remove("hidden")}
function closeSettings(){document.getElementById("modalSettings").classList.add("hidden")}
function updateOnlineCount(count){document.getElementById("onlineCount").textContent=count+" "+t("online")}
function addMessageToChat(msg){const container=document.getElementById("chatMessages");const isMine=msg.sender_id===userId;const div=document.createElement("div");div.className="msg "+(isMine?"mine":"other");let ah='<div class="msg-avatar"><img src="'+(msg.sender_avatar||generateAvatarLocal(msg.sender_id||"x"))+'" width="34" height="34" style="border-radius:10px"></div>';let bh="";if(!isMine)bh+='<div class="msg-nick">'+(msg.sender_nick||"Гость")+"</div>";if(msg.type==="image")bh+='<img src="/uploads/'+msg.content+'" loading="lazy" onclick="window.open(this.src)">';else if(msg.type==="location")bh+='<a href="'+msg.content+'" target="_blank" rel="noopener" style="color:var(--orange);text-decoration:none;font-weight:500">📍 '+t("location")+"</a>";else bh+=msg.content.replace(/</g,"&lt;").replace(/>/g,"&gt;");const time=new Date(msg.created_at*1000);bh+='<div class="msg-time">'+time.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+"</div>";div.innerHTML=ah+'<div class="msg-bubble">'+bh+"</div>";container.appendChild(div);container.scrollTop=container.scrollHeight}
document.getElementById("msgInput").addEventListener("input",()=>{if(!socket)return;socket.emit("typing");clearTimeout(typingTimeout);typingTimeout=setTimeout(()=>socket.emit("stopTyping"),1500)});
document.getElementById("msgInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendMsg()});
const urlParams=new URLSearchParams(window.location.search);
if(urlParams.has("room")){const r=urlParams.get("room");const p=urlParams.get("p")||"";document.getElementById("joinId").value=r;if(p)joinRoom(r,p);else joinRoom(r)}
</script>
</body>
</html>`;

app.get('/', (req, res) => { res.send(HTML); });
app.get('/room/:id', (req, res) => { res.redirect('/?room=' + req.params.id); });

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;
  socket.on('join', (data) => {
    currentRoom = data.roomId; currentUser = { id: data.userId, nick: data.nick, avatar: data.avatar };
    socket.join(data.roomId);
    const rooms = getRooms(); if (!rooms[data.roomId]) { socket.emit('kicked'); return; }
    const clients = io.sockets.adapter.rooms.get(data.roomId);
    const count = clients ? clients.size : 0;
    io.to(data.roomId).emit('userJoined', { userId: data.userId, nick: data.nick, count });
    socket.emit('onlineCount', { count });
  });
  socket.on('message', (data) => {
    if (!currentRoom || !currentUser) return;
    const msg = { type: data.type || 'text', content: data.content, sender_id: currentUser.id, sender_nick: currentUser.nick, sender_avatar: currentUser.avatar, created_at: Math.floor(Date.now() / 1000) };
    const messages = getMessages(); if (!messages[currentRoom]) messages[currentRoom] = [];
    messages[currentRoom].push(msg); saveMessages(messages);
    io.to(currentRoom).emit('message', msg);
  });
  socket.on('typing', () => { if (!currentRoom || !currentUser) return; socket.to(currentRoom).emit('typing', { userId: currentUser.id, nick: currentUser.nick }); });
  socket.on('stopTyping', () => {});
  socket.on('leave', () => {
    if (currentRoom) { socket.leave(currentRoom); const clients = io.sockets.adapter.rooms.get(currentRoom); const count = clients ? clients.size : 0; io.to(currentRoom).emit('userLeft', { userId: currentUser?.id, count }); }
  });
  socket.on('disconnect', () => {
    if (currentRoom) { const clients = io.sockets.adapter.rooms.get(currentRoom); const count = clients ? clients.size : 0; io.to(currentRoom).emit('userLeft', { userId: currentUser?.id, count }); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('⚡ Zal запущен на http://localhost:' + PORT));