/* AWAL Minigames -- Interactive Whiteboard (teacher + students, realtime).
   Loaded by whiteboard.html after lobby.js (which creates the shared Supabase client).

   SYNC: Supabase Realtime *Broadcast* only -- no tables. Every message is
         channel.send({ type:'broadcast', event:'draw_event', payload }) on channel "wb-<6-digit code>".
         Presence is used to know who is in the room (and whether the teacher is online).

   BOARD MODEL: one ordered list of small objects, identical on every device:
     s = pen/eraser stroke   r = rectangle   c = circle   l = line   i = image   t = text box
   Payload kinds (payload.k):
     seg   a batch of new points for a stroke being drawn (pen strokes stream live, ~14 msgs/s)
     add   a finished object (shape, text box, image *metadata*)
     img   one chunk of an image's data (images are JPEG-compressed + split into ~38 KB chunks)
     upd   change some fields of an object (move / resize / edit text / restyle)
     del   remove an object          clr   clear the board (teacher)
     cfg   teacher settings: { draw: students may draw, bg: 'paper' | 'grid' | 'dark' }
     hello a newcomer asks for the board     snap   board snapshot (sent in small parts)

   Layout: the board is a fixed 1600x1000 logical canvas, scaled/panned to fit every screen. */

(() => {
'use strict';

/* ============================== constants ============================== */
const BOARD_W = 1600, BOARD_H = 1000;
const EVENT = 'draw_event';
const MAX_MSG_CHARS = 38000;     // keep each broadcast well under Supabase's per-message size limit
const SEND_GAP_MS = 28;          // <= ~35 messages/second from one device
const STROKE_FLUSH_MS = 70;      // how often live stroke points are sent
const MIN_POINT_DIST = 1.4;      // ignore pointer jitter (logical px)
const MAX_STROKE_POINTS = 2400;  // long strokes are continued as a new stroke (keeps messages small)
const TEXT_SIZES = { s: 24, m: 38, l: 64 };
const COLORS = ['#111827', '#FFFFFF', '#E5484D', '#F28C28', '#F5C518', '#2FA35A', '#3B82F6', '#8B5CD6', '#C837E8', '#4DD8F0'];
const PEER_COLORS = ['#C837E8', '#4DD8F0', '#FFD23F', '#2FA35A', '#F28C28', '#3B82F6', '#E5484D', '#8B5CD6'];
const LS_LAST = 'awal-wb-last', LS_NAME = 'awal-wb-name', LS_BOARD = 'awal-wb-';

const ICONS = {
  select: '<path d="M5 3l14 8-7 2-3 7z"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/><path d="M14 7l3 3"/>',
  eraser: '<path d="M4.5 14.5l9-9 6 6-7 7H8z"/><path d="M9 10l6 6"/><path d="M13 19h7"/>',
  line: '<path d="M5 19L19 5"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="2"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V11m0-3.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-.5a6 6 0 01-4.7-2.3L4.5 14a1.5 1.5 0 012.3-1.9L8 13.5z"/>',
  undo: '<path d="M9 6L4 11l5 5"/><path d="M4 11h9a5 5 0 010 10h-3"/>',
  redo: '<path d="M15 6l5 5-5 5"/><path d="M20 11h-9a5 5 0 000 10h3"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l5-5 4 4 2-2 3 3"/>',
  zin: '<circle cx="11" cy="11" r="6"/><path d="M21 21l-5-5M11 8v6M8 11h6"/>',
  zout: '<circle cx="11" cy="11" r="6"/><path d="M21 21l-5-5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  save: '<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M16 6a3 3 0 010 6M18 20a5 5 0 00-3-4.6"/>',
  exit: '<path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/>'
};

/* ============================== helpers ============================== */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 2) / 2;                     // halves keep messages small but lines smooth
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c);
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; };

function iconSVG(name){
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ============================== state ============================== */
const S = {
  role: null,                    // 't' teacher | 's' student
  id: uid(), name: '', code: '',
  client: null, channel: null, ready: false, synced: false,
  objs: [], byId: new Map(),
  imgEls: new Map(), imgData: new Map(), imgParts: new Map(), textEls: new Map(),
  cfg: { draw: true, bg: 'paper' },
  tool: 'pen', color: '#111827', size: 4, fill: false,
  text: { sz: 'm', b: false, i: false, ul: false, st: false, al: 'l' },
  view: { k: 1, x: 0, y: 0 }, autoFit: true,
  undo: [], redo: [], seq: 0,
  sel: null, selText: null,
  cur: null, drag: null, preview: null, hover: null, space: false, gestured: false,
  q: [], pumping: false,
  peers: new Map(), peersSeen: false
};

let R = 1, mainCanvas, ovlCanvas, mainCtx, ovlCtx, viewEl, stageEl, textsEl;
const ptrs = new Map();          // active pointers (for pinch-zoom)
let gesture = null;

const newId = () => S.id + '-' + (++S.seq).toString(36);
const canDraw = () => S.role === 't' || S.cfg.draw;
const canModify = (o) => S.role === 't' || (!!o && o.u === S.id);
const eraserSize = () => clamp(S.size * 4, 12, 120);

/* ---------- validation of everything that arrives over the network ---------- */
function cleanObj(o){
  if(!o || typeof o !== 'object' || typeof o.id !== 'string' || o.id.length > 48) return null;
  const base = { id: o.id, t: o.t, u: typeof o.u === 'string' ? o.u.slice(0, 48) : '' };
  switch(o.t){
    case 's': {
      if(!Array.isArray(o.p)) return null;
      const p = [];
      for(let i = 0; i < o.p.length && i < MAX_STROKE_POINTS * 2 + 2; i++){ const v = Number(o.p[i]); p.push(Number.isFinite(v) ? v : 0); }
      if(p.length % 2) p.pop();
      return Object.assign(base, { c: isHex(o.c) ? o.c : '#111827', w: num(o.w, 0.5, 160, 4), e: o.e ? 1 : 0, p });
    }
    case 'r': return Object.assign(base, { x: num(o.x, -9e3, 9e3, 0), y: num(o.y, -9e3, 9e3, 0), w: num(o.w, 0, 9e3, 0), h: num(o.h, 0, 9e3, 0), c: isHex(o.c) ? o.c : '#111827', sw: num(o.sw, 0.5, 160, 4), f: o.f ? 1 : 0 });
    case 'c': return Object.assign(base, { x: num(o.x, -9e3, 9e3, 0), y: num(o.y, -9e3, 9e3, 0), r: num(o.r, 0, 9e3, 0), c: isHex(o.c) ? o.c : '#111827', sw: num(o.sw, 0.5, 160, 4), f: o.f ? 1 : 0 });
    case 'l': return Object.assign(base, { x1: num(o.x1, -9e3, 9e3, 0), y1: num(o.y1, -9e3, 9e3, 0), x2: num(o.x2, -9e3, 9e3, 0), y2: num(o.y2, -9e3, 9e3, 0), c: isHex(o.c) ? o.c : '#111827', sw: num(o.sw, 0.5, 160, 4) });
    case 'i': return Object.assign(base, { x: num(o.x, -9e3, 9e3, 0), y: num(o.y, -9e3, 9e3, 0), w: num(o.w, 10, 9e3, 100), h: num(o.h, 10, 9e3, 100) });
    case 't': return Object.assign(base, {
      x: num(o.x, -9e3, 9e3, 0), y: num(o.y, -9e3, 9e3, 0), w: num(o.w, 120, 1600, 380),
      txt: typeof o.txt === 'string' ? o.txt.slice(0, 5000) : '',
      sz: ['s', 'm', 'l'].includes(o.sz) ? o.sz : 'm', b: !!o.b, i: !!o.i, ul: !!o.ul, st: !!o.st,
      al: ['l', 'c', 'r'].includes(o.al) ? o.al : 'l', c: isHex(o.c) ? o.c : '#111827'
    });
    default: return null;
  }
}

function cleanPatch(o, p){
  const out = {};
  if(!p || typeof p !== 'object') return out;
  if(o.t === 'i'){
    ['x', 'y'].forEach((k) => { if(k in p) out[k] = num(p[k], -9e3, 9e3, o[k]); });
    ['w', 'h'].forEach((k) => { if(k in p) out[k] = num(p[k], 10, 9e3, o[k]); });
  } else if(o.t === 't'){
    ['x', 'y'].forEach((k) => { if(k in p) out[k] = num(p[k], -9e3, 9e3, o[k]); });
    if('w' in p) out.w = num(p.w, 120, 1600, o.w);
    if('txt' in p) out.txt = typeof p.txt === 'string' ? p.txt.slice(0, 5000) : o.txt;
    if('sz' in p && ['s', 'm', 'l'].includes(p.sz)) out.sz = p.sz;
    ['b', 'i', 'ul', 'st'].forEach((k) => { if(k in p) out[k] = !!p[k]; });
    if('al' in p && ['l', 'c', 'r'].includes(p.al)) out.al = p.al;
    if('c' in p && isHex(p.c)) out.c = p.c;
  }
  return out;
}

const wire = (o) => { const w = {}; Object.keys(o).forEach((k) => { if(k[0] !== '_') w[k] = o[k]; }); return w; };

/* ============================== toast / status ============================== */
let toastTimer = null;
function toast(msg){
  const el = $('wb-toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function setStatus(kind, text){
  $('wb-dot').className = 'wb-dot' + (kind === 'live' ? '' : kind === 'off' ? ' off' : ' wait');
  $('wb-status-text').textContent = text;
}

/* ============================== landing + connection ============================== */
function landError(msg){ $('wb-land-error').textContent = msg || ''; }

async function getClient(){
  for(let i = 0; i < 100; i++){
    if(window.LobbySupabase && window.LobbySupabase.client) return window.LobbySupabase.client;
    await sleep(50);
  }
  return null;
}

function setBusy(on){
  ['wb-host-btn', 'wb-join-btn', 'wb-resume-btn'].forEach((id) => { const b = $(id); if(b) b.disabled = on; });
}

function readName(inputId, fallback){
  const v = ($(inputId).value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  try { localStorage.setItem(LS_NAME, v); } catch(e) { /* ignore */ }
  return v || fallback;
}

// Opens (and subscribes to) the Broadcast + Presence channel for a room.
function openChannel(code){
  return new Promise((resolve, reject) => {
    let first = true;
    const ch = S.client.channel('wb-' + code, { config: { broadcast: { self: false, ack: false }, presence: { key: S.id } } });
    ch.on('broadcast', { event: EVENT }, (msg) => { try { onMessage(msg.payload); } catch(e) { console.error('[Whiteboard] message error', e); } });
    ch.on('presence', { event: 'sync' }, () => onPresence());
    ch.subscribe((status) => {
      if(status === 'SUBSCRIBED'){
        if(first){ first = false; resolve(ch); }
        else { setStatus('live', 'Live'); trackPresence().then(() => requestBoard()); }   // reconnected
      } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
        if(first){ first = false; reject(new Error(status)); }
        else setStatus('off', 'Reconnecting…');
      }
    });
    S.channel = ch;
  });
}

function trackPresence(){
  if(!S.channel) return Promise.resolve();
  return Promise.resolve(S.channel.track({ id: S.id, role: S.role, name: S.name })).catch(() => {});
}

function presenceMetas(){
  const out = [];
  const st = S.channel ? S.channel.presenceState() : {};
  Object.keys(st).forEach((key) => { const m = st[key] && st[key][0]; if(m) out.push({ key, role: m.role, name: m.name || 'Guest' }); });
  return out;
}

async function leaveChannel(){
  const ch = S.channel;
  S.channel = null;
  if(ch){
    try { await ch.unsubscribe(); } catch(e) { /* ignore */ }
    try { if(S.client) S.client.removeChannel(ch); } catch(e) { /* ignore */ }
  }
}

const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

async function startHost(resumeCode){
  landError('');
  setBusy(true);
  try {
    S.client = await getClient();
    if(!S.client){ landError('The realtime connection is not available. Check that lobby.js loads on this page.'); return; }
    S.role = 't';
    S.name = readName('wb-host-name', 'Teacher');

    let ok = false;
    for(let attempt = 0; attempt < (resumeCode ? 1 : 6) && !ok; attempt++){
      const code = resumeCode || genCode();
      await openChannel(code);
      await sleep(700);                                        // let the first presence sync arrive
      if(presenceMetas().some((m) => m.role === 't')){         // another teacher already uses this code
        await leaveChannel();
        if(resumeCode){ landError('That board is already open in another tab or device.'); return; }
        continue;
      }
      S.code = code; ok = true;
    }
    if(!ok){ landError('Could not reserve a room code. Please try again.'); return; }

    if(resumeCode){ const saved = loadLocal(resumeCode); if(saved) applySaved(saved); }
    enterBoard();
    await trackPresence();
    S.synced = true;
    if(S.objs.length === 0) requestBoard();                    // students may still hold the board (teacher refreshed)
    else send({ k: 'hello', r: 't', has: 1 });
    send({ k: 'cfg', draw: S.cfg.draw, bg: S.cfg.bg });
  } catch(e) {
    console.error('[Whiteboard] host failed', e);
    landError('Could not start the board (' + (e && e.message ? e.message : 'connection problem') + '). Please try again.');
    await leaveChannel();
  } finally {
    setBusy(false);
  }
}

async function startJoin(){
  landError('');
  const code = ($('wb-join-code').value || '').trim();
  if(!/^\d{6}$/.test(code)){ landError('Enter the 6-digit room code from your teacher.'); return; }
  if(!($('wb-join-name').value || '').trim()){ landError('Please enter your name so your teacher can see who you are.'); return; }
  setBusy(true);
  try {
    S.client = await getClient();
    if(!S.client){ landError('The realtime connection is not available. Check that lobby.js loads on this page.'); return; }
    S.role = 's';
    S.name = readName('wb-join-name', 'Student');
    S.code = code;
    await openChannel(code);
    await trackPresence();

    // The room exists only while its teacher is online: wait briefly for the teacher's presence.
    let found = false;
    for(let i = 0; i < 18 && !found; i++){ found = presenceMetas().some((m) => m.role === 't'); if(!found) await sleep(250); }
    if(!found){
      await leaveChannel();
      landError('No board found with that code. Check the code, and make sure your teacher has started the board.');
      return;
    }
    enterBoard();
    requestBoard();
  } catch(e) {
    console.error('[Whiteboard] join failed', e);
    landError('Could not join the board (' + (e && e.message ? e.message : 'connection problem') + '). Please try again.');
    await leaveChannel();
  } finally {
    setBusy(false);
  }
}

/* ============================== canvas rendering ============================== */
function setupCanvases(){
  mainCanvas = $('wb-main-canvas'); ovlCanvas = $('wb-ovl-canvas');
  viewEl = $('wb-view'); stageEl = $('wb-stage'); textsEl = $('wb-texts');
  R = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  [mainCanvas, ovlCanvas].forEach((c) => { c.width = BOARD_W * R; c.height = BOARD_H * R; c.style.width = BOARD_W + 'px'; c.style.height = BOARD_H + 'px'; });
  mainCtx = mainCanvas.getContext('2d'); ovlCtx = ovlCanvas.getContext('2d');
  mainCtx.setTransform(R, 0, 0, R, 0, 0); ovlCtx.setTransform(R, 0, 0, R, 0, 0);
}

function strokeStyleFor(ctx, o){
  ctx.globalCompositeOperation = o.e ? 'destination-out' : 'source-over';   // eraser = see-through stroke
  ctx.strokeStyle = o.e ? '#000' : o.c;
  ctx.fillStyle = o.e ? '#000' : o.c;
  ctx.lineWidth = o.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawStroke(ctx, o){
  const p = o.p, n = p.length / 2;
  if(n < 1) return;
  ctx.save();
  strokeStyleFor(ctx, o);
  if(n === 1){
    ctx.beginPath(); ctx.arc(p[0], p[1], o.w / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    if(n === 2){ ctx.lineTo(p[2], p[3]); }
    else {
      for(let i = 1; i < n - 1; i++){
        ctx.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
      }
      ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Fast path while a stroke is still being drawn: only paint the newest segments.
function drawStrokeTail(ctx, o, fromPt){
  const p = o.p, n = p.length / 2;
  if(n < 1) return;
  ctx.save();
  strokeStyleFor(ctx, o);
  if(n === 1){ ctx.beginPath(); ctx.arc(p[0], p[1], o.w / 2, 0, Math.PI * 2); ctx.fill(); }
  else {
    const a = Math.max(0, fromPt - 1);
    ctx.beginPath(); ctx.moveTo(p[2 * a], p[2 * a + 1]);
    for(let i = a + 1; i < n; i++) ctx.lineTo(p[2 * i], p[2 * i + 1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObj(ctx, o){
  switch(o.t){
    case 's': drawStroke(ctx, o); break;
    case 'r':
    case 'c': {
      ctx.save();
      ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.sw; ctx.lineJoin = 'round';
      ctx.beginPath();
      if(o.t === 'r') ctx.rect(o.x, o.y, o.w, o.h); else ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      if(o.f){ ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'l':
      ctx.save();
      ctx.strokeStyle = o.c; ctx.lineWidth = o.sw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      ctx.restore();
      break;
    case 'i': {
      const img = S.imgEls.get(o.id);
      if(img && img.complete && img.naturalWidth) ctx.drawImage(img, o.x, o.y, o.w, o.h);
      else { // placeholder while the picture is still arriving
        ctx.save(); ctx.fillStyle = 'rgba(120,110,150,0.15)'; ctx.strokeStyle = 'rgba(120,110,150,0.6)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
        ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h); ctx.restore();
      }
      break;
    }
    default: break;
  }
}

function redraw(){
  mainCtx.clearRect(0, 0, BOARD_W, BOARD_H);
  for(const o of S.objs) if(o.t !== 't') drawObj(mainCtx, o);
  drawOverlay();
}

let redrawQueued = false;
function scheduleRedraw(){
  if(redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => { redrawQueued = false; redraw(); });
}

let overlayQueued = false;
function scheduleOverlay(){
  if(overlayQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() => { overlayQueued = false; drawOverlay(); });
}

// Overlay = things that are not part of the shared board: shape preview, image selection, brush ring.
function drawOverlay(){
  if(!ovlCtx) return;
  ovlCtx.clearRect(0, 0, BOARD_W, BOARD_H);
  if(S.preview) drawObj(ovlCtx, S.preview);

  const sel = S.sel && S.byId.get(S.sel);
  if(sel && sel.t === 'i'){
    const k = S.view.k || 1;
    ovlCtx.save();
    ovlCtx.strokeStyle = '#C837E8'; ovlCtx.lineWidth = 2.5 / k; ovlCtx.setLineDash([8 / k, 6 / k]);
    ovlCtx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    ovlCtx.setLineDash([]);
    if(canModify(sel)){
      const hs = 16 / k;
      ovlCtx.fillStyle = '#C837E8'; ovlCtx.strokeStyle = '#fff'; ovlCtx.lineWidth = 2.5 / k;
      ovlCtx.beginPath(); ovlCtx.rect(sel.x + sel.w - hs / 2, sel.y + sel.h - hs / 2, hs, hs); ovlCtx.fill(); ovlCtx.stroke();
    }
    ovlCtx.restore();
  }

  if(S.hover && (S.tool === 'pen' || S.tool === 'eraser') && canDraw() && !ptrs.size){
    const k = S.view.k || 1;
    const rad = (S.tool === 'eraser' ? eraserSize() : S.size) / 2;
    ovlCtx.save();
    ovlCtx.lineWidth = 1.5 / k;
    ovlCtx.strokeStyle = S.tool === 'eraser' ? '#1E1B2E' : (S.color === '#FFFFFF' ? '#1E1B2E' : S.color);
    if(S.tool === 'eraser') ovlCtx.setLineDash([5 / k, 4 / k]);
    ovlCtx.beginPath(); ovlCtx.arc(S.hover.x, S.hover.y, Math.max(rad, 1.5 / k), 0, Math.PI * 2); ovlCtx.stroke();
    ovlCtx.restore();
  }
}

/* ============================== objects (shared list) ============================== */
function addObj(o){
  if(S.byId.has(o.id)) return false;
  S.objs.push(o);
  S.byId.set(o.id, o);
  if(o.t === 't') createTextEl(o);
  if(o.t === 'i'){ const d = S.imgData.get(o.id); if(d && !S.imgEls.has(o.id)) loadImageEl(o.id, d); }
  return true;
}

function removeObj(id){
  const o = S.byId.get(id);
  if(!o) return null;
  S.byId.delete(id);
  const i = S.objs.indexOf(o);
  if(i >= 0) S.objs.splice(i, 1);
  if(o.t === 't'){ const el = S.textEls.get(id); if(el) el.remove(); S.textEls.delete(id); }
  else scheduleRedraw();
  if(o.t === 'i') S.imgEls.delete(id);
  if(S.sel === id) S.sel = null;
  if(S.selText === id) S.selText = null;
  return o;
}

function clearAllLocal(){
  S.textEls.forEach((el) => el.remove());
  S.textEls.clear(); S.objs = []; S.byId.clear();
  S.imgEls.clear(); S.imgData.clear(); S.imgParts.clear();
  S.sel = null; S.selText = null; S.cur = null; S.drag = null; S.preview = null;
  S.undo = []; S.redo = [];
  redraw();
}

function undo(){
  while(S.undo.length){
    const id = S.undo.pop();
    const o = S.byId.get(id);
    if(!o || !canModify(o)) continue;
    removeObj(id);
    send({ k: 'del', id });
    S.redo.push(o);
    persist(); refreshOptions();
    return;
  }
  toast('Nothing to undo');
}

function redo(){
  const o = S.redo.pop();
  if(!o){ toast('Nothing to redo'); return; }
  if(!canDraw()){ S.redo.push(o); toast('The teacher has paused drawing'); return; }
  addObj(o);
  S.undo.push(o.id);
  scheduleRedraw();
  send({ k: 'add', o: wire(o) });
  if(o.t === 'i' && S.imgData.get(o.id)) sendImageChunks(o.id, S.imgData.get(o.id));
  persist(); refreshOptions();
}

function requireDraw(){
  if(canDraw()) return true;
  toast('The teacher has paused drawing');
  return false;
}

/* ============================== text boxes (DOM, one per text object) ============================== */
function autosizeText(o){
  const el = S.textEls.get(o.id);
  if(!el) return;
  const ta = el.querySelector('textarea');
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight || 0) + 'px';
}

function styleTextEl(o){
  const el = S.textEls.get(o.id);
  if(!el) return;
  const ta = el.querySelector('textarea');
  el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; el.style.width = o.w + 'px';
  ta.style.fontSize = TEXT_SIZES[o.sz] + 'px';
  ta.style.color = o.c;
  ta.style.fontWeight = o.b ? '700' : '400';
  ta.style.fontStyle = o.i ? 'italic' : 'normal';
  ta.style.textDecoration = [o.ul ? 'underline' : '', o.st ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  ta.style.textAlign = { l: 'left', c: 'center', r: 'right' }[o.al];
  if(document.activeElement !== ta && ta.value !== o.txt) ta.value = o.txt;
  const mine = canModify(o);
  ta.readOnly = !mine;
  el.classList.toggle('mine', mine);
  autosizeText(o);
}

function selectText(id){
  S.selText = id;
  S.sel = null;
  S.textEls.forEach((el, k) => el.classList.toggle('sel', k === id));
  const o = S.byId.get(id);
  if(o){ S.text.sz = o.sz; S.text.b = o.b; S.text.i = o.i; S.text.ul = o.ul; S.text.st = o.st; S.text.al = o.al; }
  refreshOptions();
}

function scheduleTextSend(o){
  clearTimeout(o._tm);
  o._tm = setTimeout(() => sendText(o), 350);
}

function sendText(o){
  if(!S.byId.has(o.id)) return;
  clearTimeout(o._tm);
  if(!o._sent){
    if(!o.txt.trim()) return;                                  // empty boxes stay private until they have content
    send({ k: 'add', o: wire(o) });
    o._sent = true;
    S.undo.push(o.id); S.redo = [];
  } else {
    send({ k: 'upd', id: o.id, p: { txt: o.txt } });
  }
  persist();
}

function commitText(o){
  if(!o.txt.trim()){
    removeObj(o.id);
    if(o._sent) send({ k: 'del', id: o.id });
    persist(); refreshOptions();
    return;
  }
  sendText(o);
}

function startTextDrag(e, id, mode){
  const o = S.byId.get(id);
  if(!o || !canModify(o)) return;
  e.preventDefault(); e.stopPropagation();
  const target = e.currentTarget;
  try { target.setPointerCapture(e.pointerId); } catch(err) { /* ignore */ }
  const sx = e.clientX, sy = e.clientY, ox = o.x, oy = o.y, ow = o.w;
  selectText(id);
  const move = (ev) => {
    const dx = (ev.clientX - sx) / S.view.k, dy = (ev.clientY - sy) / S.view.k;
    if(mode === 'move'){ o.x = r1(clamp(ox + dx, -200, BOARD_W - 40)); o.y = r1(clamp(oy + dy, -60, BOARD_H - 20)); }
    else o.w = r1(clamp(ow + dx, 120, 1600));
    styleTextEl(o);
    sendThrottled('t-' + id, { k: 'upd', id, p: mode === 'move' ? { x: o.x, y: o.y } : { w: o.w } }, 100);
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    flushThrottled('t-' + id);
    persist();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

function createTextEl(o){
  if(S.textEls.has(o.id)) return;
  const el = document.createElement('div');
  el.className = 'wb-text';
  el.dataset.id = o.id;
  el.innerHTML = '<div class="wb-text-bar"><span class="wb-grip" title="Drag to move">⠿</span><button type="button" class="wb-text-del" title="Delete this text">×</button></div>' +
    '<textarea spellcheck="false" rows="1" aria-label="Text box"></textarea><span class="wb-text-rs" title="Drag to resize"></span>';
  textsEl.appendChild(el);
  S.textEls.set(o.id, el);

  const ta = el.querySelector('textarea');
  ta.addEventListener('input', () => {
    const cur = S.byId.get(o.id); if(!cur) return;
    cur.txt = ta.value.slice(0, 5000);
    autosizeText(cur); scheduleTextSend(cur);
  });
  ta.addEventListener('focus', () => selectText(o.id));
  ta.addEventListener('blur', () => { const cur = S.byId.get(o.id); if(cur) commitText(cur); });
  ta.addEventListener('keydown', (e) => { if(e.key === 'Escape') ta.blur(); });

  el.querySelector('.wb-grip').addEventListener('pointerdown', (e) => startTextDrag(e, o.id, 'move'));
  el.querySelector('.wb-text-rs').addEventListener('pointerdown', (e) => startTextDrag(e, o.id, 'resize'));
  el.querySelector('.wb-text-del').addEventListener('click', () => {
    if(!S.byId.get(o.id)) return;
    removeObj(o.id);
    send({ k: 'del', id: o.id });
    persist(); refreshOptions();
  });
  styleTextEl(o);
}

function createTextAt(x, y, txt, width){
  const o = {
    id: newId(), t: 't', u: S.id,
    x: r1(clamp(x, 0, BOARD_W - 160)), y: r1(clamp(y, 0, BOARD_H - 70)), w: width || 380, txt: txt || '',
    sz: S.text.sz, b: S.text.b, i: S.text.i, ul: S.text.ul, st: S.text.st, al: S.text.al, c: S.color
  };
  addObj(o);
  S.redo = [];
  if(o.txt){ sendText(o); return o; }
  S.textEls.get(o.id).querySelector('textarea').focus();
  return o;
}

/* ============================== images ============================== */
function loadImageEl(id, src){
  if(typeof src !== 'string' || src.indexOf('data:image/') !== 0) return;
  const img = new Image();
  img.onload = () => scheduleRedraw();
  img.src = src;
  S.imgEls.set(id, img);
}

// Screenshots can be huge: shrink + JPEG-compress until each picture is a few hundred KB at most.
function encodeImage(img){
  const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
  const tries = [[1280, 0.82], [1100, 0.7], [900, 0.6], [720, 0.5], [560, 0.45]];
  let out = null;
  for(let t = 0; t < tries.length; t++){
    const sc = Math.min(1, tries[t][0] / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * sc)), h = Math.max(1, Math.round(nh * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', tries[t][1]);
    out = { data, w: nw, h: nh };
    if(data.length <= 420000) break;
  }
  return out;
}

async function addImageFromBlob(blob, cx, cy){
  if(!blob || !/^image\//.test(blob.type)) return;
  if(!requireDraw()) return;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad image')); im.src = url; });
    const enc = encodeImage(img);
    const sc = Math.min(1, 760 / enc.w, 560 / enc.h);
    const w = Math.max(20, Math.round(enc.w * sc)), h = Math.max(20, Math.round(enc.h * sc));
    const o = { id: newId(), t: 'i', u: S.id, x: r1(clamp(cx - w / 2, 0, Math.max(0, BOARD_W - w))), y: r1(clamp(cy - h / 2, 0, Math.max(0, BOARD_H - h))), w, h };
    S.imgData.set(o.id, enc.data);
    loadImageEl(o.id, enc.data);
    addObj(o);
    S.undo.push(o.id); S.redo = [];
    scheduleRedraw();
    send({ k: 'add', o: wire(o) });
    sendImageChunks(o.id, enc.data);
    persist();
  } catch(e) {
    toast("That image couldn't be added.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sendImageChunks(id, data, to){
  if(!data) return;
  const n = Math.ceil(data.length / MAX_MSG_CHARS);
  for(let i = 0; i < n; i++){
    const m = { k: 'img', id, i, n, d: data.slice(i * MAX_MSG_CHARS, (i + 1) * MAX_MSG_CHARS) };
    if(to) m.to = to;
    send(m);
  }
}

function onImgChunk(p){
  if(typeof p.id !== 'string' || p.id.length > 48 || typeof p.d !== 'string') return;
  if(p.to && p.to !== S.id) return;
  if(S.imgData.has(p.id)) return;                              // already complete
  const n = Math.floor(Number(p.n)), i = Math.floor(Number(p.i));
  if(!(n >= 1 && n <= 60) || !(i >= 0 && i < n)) return;
  if(i === 0 && p.d.indexOf('data:image/') !== 0) return;
  let st = S.imgParts.get(p.id);
  if(!st){
    if(S.imgParts.size >= 40) return;
    st = { n, parts: new Array(n), got: 0 };
    S.imgParts.set(p.id, st);
  }
  if(st.n !== n) return;
  if(st.parts[i] === undefined){ st.parts[i] = p.d; st.got++; }
  if(st.got === st.n){
    S.imgParts.delete(p.id);
    const data = st.parts.join('');
    if(data.indexOf('data:image/') !== 0) return;
    S.imgData.set(p.id, data);
    if(S.byId.has(p.id)) loadImageEl(p.id, data);
  }
}

/* ============================== view (zoom / pan) ============================== */
function applyView(){
  stageEl.style.transform = 'translate(' + S.view.x + 'px,' + S.view.y + 'px) scale(' + S.view.k + ')';
  const z = $('wb-zoom-val');
  if(z) z.textContent = Math.round(S.view.k * 100) + '%';
  scheduleOverlay();
}

function fitView(){
  const r = viewEl.getBoundingClientRect();
  if(!r.width || !r.height) return;
  const k = clamp(Math.min((r.width - 24) / BOARD_W, (r.height - 24) / BOARD_H), 0.1, 3);
  S.view = { k, x: (r.width - BOARD_W * k) / 2, y: (r.height - BOARD_H * k) / 2 };
  S.autoFit = true;
  applyView();
}

function zoomAt(cx, cy, factor){
  const k0 = S.view.k, k1 = clamp(k0 * factor, 0.15, 4);
  const bx = (cx - S.view.x) / k0, by = (cy - S.view.y) / k0;
  S.view = { k: k1, x: cx - bx * k1, y: cy - by * k1 };
  S.autoFit = false;
  applyView();
}

function zoomCenter(factor){
  const r = viewEl.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, factor);
}

function viewCenterBoard(){
  const r = viewEl.getBoundingClientRect();
  return { x: clamp((r.width / 2 - S.view.x) / S.view.k, 0, BOARD_W), y: clamp((r.height / 2 - S.view.y) / S.view.k, 0, BOARD_H) };
}

function viewPoint(e){
  const r = viewEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function toBoard(e){
  const v = viewPoint(e);
  return { x: (v.x - S.view.x) / S.view.k, y: (v.y - S.view.y) / S.view.k };
}

function gestureStart(){
  const pts = Array.from(ptrs.values());
  if(pts.length < 2) return;
  const a = pts[0], b = pts[1];
  gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, k: S.view.k, x: S.view.x, y: S.view.y };
  S.autoFit = false;
}

function gestureMove(){
  const pts = Array.from(ptrs.values());
  if(!gesture || pts.length < 2) return;
  const a = pts[0], b = pts[1];
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const k1 = clamp(gesture.k * d / gesture.d, 0.15, 4);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const bx = (gesture.mx - gesture.x) / gesture.k, by = (gesture.my - gesture.y) / gesture.k;
  S.view = { k: k1, x: mx - bx * k1, y: my - by * k1 };
  applyView();
}

/* ============================== drawing tools ============================== */
function startStroke(p){
  const eraser = S.tool === 'eraser';
  const o = { id: newId(), t: 's', u: S.id, c: S.color, w: eraser ? eraserSize() : S.size, e: eraser ? 1 : 0, p: [r1(p.x), r1(p.y)] };
  addObj(o);
  S.undo.push(o.id); S.redo = [];
  S.cur = { o, batch: [o.p[0], o.p[1]], first: true, timer: setInterval(() => flushStroke(false), STROKE_FLUSH_MS) };
  drawStrokeTail(mainCtx, o, 0);
}

function extendStroke(p){
  const c = S.cur;
  if(!c) return;
  const o = c.o, n = o.p.length;
  const x = r1(p.x), y = r1(p.y);
  const lx = o.p[n - 2], ly = o.p[n - 1];
  if(Math.hypot(x - lx, y - ly) < MIN_POINT_DIST) return;
  if(n >= MAX_STROKE_POINTS * 2){          // very long stroke: carry on as a fresh stroke so messages stay small
    endStroke();
    startStroke({ x: lx, y: ly });
    extendStroke(p);
    return;
  }
  o.p.push(x, y);
  c.batch.push(x, y);
  drawStrokeTail(mainCtx, o, o.p.length / 2 - 1);
}

function flushStroke(fin){
  const c = S.cur;
  if(!c) return;
  if(!c.batch.length && !fin) return;
  const m = { k: 'seg', id: c.o.id, a: c.batch, fin: fin ? 1 : 0 };
  if(c.first){ m.s = { c: c.o.c, w: c.o.w, e: c.o.e }; c.first = false; }
  c.batch = [];
  send(m);
}

function endStroke(){
  const c = S.cur;
  if(!c) return;
  flushStroke(true);
  clearInterval(c.timer);
  S.cur = null;
  redraw();                                // repaint with smoothing so every device looks identical
  persist();
  refreshOptions();
}

function buildShape(tool, x0, y0, p, shift){
  let x1 = p.x, y1 = p.y;
  if(tool === 'line'){
    if(shift){ const dx = x1 - x0, dy = y1 - y0, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); x1 = x0 + Math.cos(a) * len; y1 = y0 + Math.sin(a) * len; }
    return { t: 'l', x1: r1(x0), y1: r1(y0), x2: r1(x1), y2: r1(y1) };
  }
  if(tool === 'rect'){
    let w = x1 - x0, h = y1 - y0;
    if(shift){ const m = Math.max(Math.abs(w), Math.abs(h)); w = (w < 0 ? -1 : 1) * m; h = (h < 0 ? -1 : 1) * m; }
    return { t: 'r', x: r1(Math.min(x0, x0 + w)), y: r1(Math.min(y0, y0 + h)), w: r1(Math.abs(w)), h: r1(Math.abs(h)) };
  }
  const dx = x1 - x0, dy = y1 - y0, side = Math.max(Math.abs(dx), Math.abs(dy));   // circle: inscribed in the dragged square
  return { t: 'c', x: r1(x0 + (dx < 0 ? -1 : 1) * side / 2), y: r1(y0 + (dy < 0 ? -1 : 1) * side / 2), r: r1(side / 2) };
}

function shapeObj(tool, d, p, shift){
  const s = buildShape(tool, d.x0, d.y0, p, shift);
  return Object.assign(s, { id: 'preview', u: S.id, c: S.color, sw: S.size, f: S.fill && tool !== 'line' ? 1 : 0 });
}

function commitShape(p, shift, d){
  S.preview = null;
  const o = shapeObj(S.tool, d, p, shift);
  const tiny = (o.t === 'l' && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4) || (o.t === 'r' && o.w < 3 && o.h < 3) || (o.t === 'c' && o.r < 2);
  if(tiny){ drawOverlay(); return; }
  o.id = newId();
  addObj(o);
  drawObj(mainCtx, o);
  S.undo.push(o.id); S.redo = [];
  send({ k: 'add', o: wire(o) });
  persist(); refreshOptions(); drawOverlay();
}

/* ---------- select / move / resize images ---------- */
function hitImage(p){
  for(let i = S.objs.length - 1; i >= 0; i--){
    const o = S.objs[i];
    if(o.t === 'i' && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h) return o;
  }
  return null;
}

function nearHandle(o, p){
  const t = 20 / S.view.k;
  return Math.abs(p.x - (o.x + o.w)) <= t && Math.abs(p.y - (o.y + o.h)) <= t;
}

function clearTextSelection(){
  S.selText = null;
  S.textEls.forEach((el) => el.classList.remove('sel'));
}

function selectDown(p){
  clearTextSelection();
  const cur = S.sel && S.byId.get(S.sel);
  if(cur && cur.t === 'i' && canModify(cur) && nearHandle(cur, p)){
    S.drag = { type: 'imgresize', id: cur.id, ratio: cur.h / cur.w };
    return;
  }
  const hit = hitImage(p);
  S.sel = hit ? hit.id : null;
  if(hit && canModify(hit)) S.drag = { type: 'imgmove', id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
  drawOverlay(); refreshOptions();
}

function deleteSelected(){
  const id = S.sel;
  const o = id && S.byId.get(id);
  if(!o || !canModify(o)) return;
  removeObj(id);
  send({ k: 'del', id });
  S.redo.push(o);
  drawOverlay(); persist(); refreshOptions();
}

/* ============================== pointer handling ============================== */
function abortCurrent(){
  if(S.cur) endStroke();
  S.drag = null; S.preview = null;
  viewEl.classList.remove('panning');
  drawOverlay();
}

function blurActiveText(){
  const a = document.activeElement;
  if(a && a.tagName === 'TEXTAREA' && a.closest('.wb-text')) a.blur();
}

function onPointerDown(e){
  if(!S.ready) return;
  if(e.target.closest && e.target.closest('.wb-text')) return;             // text boxes handle themselves
  try { viewEl.setPointerCapture(e.pointerId); } catch(err) { /* ignore */ }
  const vp = viewPoint(e);
  ptrs.set(e.pointerId, { x: vp.x, y: vp.y, type: e.pointerType });

  if(e.pointerType === 'touch' && ptrs.size === 2){ abortCurrent(); S.gestured = true; gestureStart(); return; }
  if(ptrs.size > 1) return;
  S.gestured = false;
  blurActiveText();

  const panBtn = e.button === 1 || e.button === 2;
  if(S.tool === 'hand' || S.space || panBtn){
    S.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y };
    S.autoFit = false;
    viewEl.classList.add('panning');
    e.preventDefault();
    return;
  }
  if(e.pointerType === 'mouse' && e.button !== 0) return;

  const p = toBoard(e);
  S.hover = p;
  if(S.tool === 'pen' || S.tool === 'eraser'){ if(!requireDraw()) return; e.preventDefault(); startStroke(p); }
  else if(S.tool === 'line' || S.tool === 'rect' || S.tool === 'circle'){ if(!requireDraw()) return; e.preventDefault(); S.drag = { type: 'shape', x0: p.x, y0: p.y }; }
  else if(S.tool === 'select'){ selectDown(p); }
  else if(S.tool === 'text'){ clearTextSelection(); refreshOptions(); }
}

function onPointerMove(e){
  const prev = ptrs.get(e.pointerId);
  if(prev){ const vp = viewPoint(e); ptrs.set(e.pointerId, { x: vp.x, y: vp.y, type: prev.type }); }
  if(gesture && ptrs.size >= 2){ gestureMove(); return; }

  const p = toBoard(e);
  S.hover = p;
  const d = S.drag;

  if(S.cur){
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    (evs && evs.length ? evs : [e]).forEach((ev) => extendStroke(toBoard(ev)));
    return;
  }
  if(!d){ scheduleOverlay(); return; }

  if(d.type === 'pan'){
    S.view.x = d.vx + (e.clientX - d.sx);
    S.view.y = d.vy + (e.clientY - d.sy);
    applyView();
  } else if(d.type === 'shape'){
    S.preview = shapeObj(S.tool, d, p, e.shiftKey);
    scheduleOverlay();
  } else if(d.type === 'imgmove'){
    const o = S.byId.get(d.id); if(!o) return;
    o.x = r1(p.x - d.dx); o.y = r1(p.y - d.dy);
    scheduleRedraw();
    sendThrottled('i-' + d.id, { k: 'upd', id: d.id, p: { x: o.x, y: o.y } }, 100);
  } else if(d.type === 'imgresize'){
    const o = S.byId.get(d.id); if(!o) return;
    o.w = r1(Math.max(40, p.x - o.x)); o.h = r1(o.w * d.ratio);
    scheduleRedraw();
    sendThrottled('i-' + d.id, { k: 'upd', id: d.id, p: { w: o.w, h: o.h } }, 100);
  }
}

function onPointerUp(e){
  ptrs.delete(e.pointerId);
  if(gesture && ptrs.size < 2) gesture = null;
  if(ptrs.size > 0) return;
  viewEl.classList.remove('panning');
  if(S.cur) endStroke();
  const d = S.drag;
  S.drag = null;
  if(d){
    if(d.type === 'shape'){
      if(e.type === 'pointercancel'){ S.preview = null; drawOverlay(); }
      else commitShape(toBoard(e), e.shiftKey, d);
    } else if(d.type === 'imgmove' || d.type === 'imgresize'){
      flushThrottled('i-' + d.id); persist();
    }
  }
  drawOverlay();
}

function onWheel(e){
  e.preventDefault();
  const v = viewPoint(e);
  if(e.ctrlKey || e.metaKey){ zoomAt(v.x, v.y, Math.exp(-e.deltaY * 0.01)); }
  else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; S.autoFit = false; applyView(); }
}

/* ============================== tools + options bar ============================== */
const DRAW_TOOLS = ['pen', 'eraser', 'line', 'rect', 'circle'];

function setTool(t){
  if(!t) return;
  if((DRAW_TOOLS.includes(t) || t === 'text') && !canDraw()){ toast('The teacher has paused drawing'); return; }
  if(S.cur) endStroke();
  S.tool = t;
  S.drag = null; S.preview = null;
  if(t !== 'select') S.sel = null;
  if(t !== 'text' && t !== 'select') clearTextSelection();
  document.querySelectorAll('#wb-tools [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  viewEl.className = 'wb-view tool-' + t + (S.space ? ' space' : '');
  textsEl.classList.toggle('interactive', t === 'select' || t === 'text');
  refreshOptions();
  drawOverlay();
}

function applyTextPatch(patch){
  Object.keys(patch).forEach((k) => { if(k in S.text) S.text[k] = patch[k]; });
  const o = S.selText && S.byId.get(S.selText);
  if(o && canModify(o)){
    Object.assign(o, patch);
    styleTextEl(o);
    if(o._sent) send({ k: 'upd', id: o.id, p: patch });
    persist();
  }
  refreshOptions();
}

function setColor(c){
  S.color = c;
  const o = S.selText && S.byId.get(S.selText);
  if(o && canModify(o)) applyTextPatch({ c });
  refreshOptions();
}

function refreshOptions(){
  if(!S.ready) return;
  const drawing = DRAW_TOOLS.includes(S.tool);
  $('wb-size-group').hidden = !drawing;
  $('wb-fill-group').hidden = !(S.tool === 'rect' || S.tool === 'circle');
  $('wb-textopts').hidden = !(S.tool === 'text' || !!S.selText);

  document.querySelectorAll('#wb-colors .wb-sw').forEach((b) => b.classList.toggle('active', b.dataset.c.toLowerCase() === S.color.toLowerCase()));
  $('wb-size').value = S.size;
  $('wb-size-val').textContent = S.size;
  const dot = $('wb-size-dot'), dd = clamp(S.tool === 'eraser' ? eraserSize() / 4 : S.size, 2, 24);
  dot.style.width = dd + 'px'; dot.style.height = dd + 'px'; dot.style.background = S.tool === 'eraser' ? '#A79FC0' : S.color;
  $('wb-fill').classList.toggle('active', S.fill);

  document.querySelectorAll('#wb-tsize [data-tsz]').forEach((b) => b.classList.toggle('active', S.text.sz === b.dataset.tsz));
  const keyOf = { b: 'b', i: 'i', u: 'ul', s: 'st' };
  document.querySelectorAll('#wb-tstyle [data-tstyle]').forEach((b) => b.classList.toggle('active', !!S.text[keyOf[b.dataset.tstyle]]));
  document.querySelectorAll('#wb-talign [data-tal]').forEach((b) => b.classList.toggle('active', S.text.al === b.dataset.tal));

  const lock = !canDraw();
  document.querySelectorAll('#wb-tools [data-tool]').forEach((b) => { b.disabled = lock && (DRAW_TOOLS.includes(b.dataset.tool) || b.dataset.tool === 'text'); });
  $('wb-img-btn').disabled = lock;
  $('wb-undo').disabled = lock || !S.undo.some((id) => S.byId.has(id));
  $('wb-redo').disabled = lock || !S.redo.length;
  $('wb-clear').hidden = S.role !== 't';
}

function buildColors(){
  const wrap = $('wb-colors');
  wrap.innerHTML = '';
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wb-sw'; b.dataset.c = c; b.title = c; b.style.background = c;
    b.setAttribute('aria-label', 'Color ' + c);
    b.addEventListener('click', () => setColor(c));
    wrap.appendChild(b);
  });
  const pick = document.createElement('input');
  pick.type = 'color'; pick.className = 'wb-colorpick'; pick.title = 'Custom color'; pick.value = '#C837E8';
  pick.addEventListener('input', () => setColor(pick.value.toUpperCase()));
  wrap.appendChild(pick);
}

function applyCfg(){
  stageEl.className = 'wb-stage bg-' + S.cfg.bg;
  document.querySelectorAll('#wb-bg-seg [data-bg]').forEach((b) => b.classList.toggle('active', b.dataset.bg === S.cfg.bg));
  $('wb-allow-draw').checked = !!S.cfg.draw;
  // keep the default pen visible on the chosen background
  if(S.cfg.bg === 'dark' && S.color === '#111827') S.color = '#FFFFFF';
  if(S.cfg.bg !== 'dark' && S.color === '#FFFFFF') S.color = '#111827';
  updateBanner();
  if(!canDraw() && (DRAW_TOOLS.includes(S.tool) || S.tool === 'text')){ if(S.cur) endStroke(); S.tool = 'hand'; setTool('hand'); }
  refreshOptions();
  redraw();
}

function updateBanner(){
  const b = $('wb-banner');
  const teacherOnline = S.role === 't' || S.peers.size === 0 || Array.from(S.peers.values()).some((p) => p.role === 't');
  let msg = '';
  if(!teacherOnline) msg = '⚠ Your teacher is offline. The board will come back when they return.';
  else if(!canDraw()) msg = '🔒 The teacher has paused drawing. You can still watch and zoom.';
  b.textContent = msg;
  b.hidden = !msg;
}

function bindOptions(){
  const noBlur = (e) => { if(e.target.closest('button')) e.preventDefault(); };   // keep the text cursor when using the toolbar
  $('wb-options').addEventListener('mousedown', noBlur);
  $('wb-options').addEventListener('pointerdown', (e) => { if(e.target.closest('button')) e.preventDefault(); });

  $('wb-size').addEventListener('input', (e) => { S.size = clamp(parseInt(e.target.value, 10) || 4, 1, 24); refreshOptions(); drawOverlay(); });
  $('wb-fill').addEventListener('click', () => { S.fill = !S.fill; refreshOptions(); });
  document.querySelectorAll('#wb-tsize [data-tsz]').forEach((b) => b.addEventListener('click', () => applyTextPatch({ sz: b.dataset.tsz })));
  const keyOf = { b: 'b', i: 'i', u: 'ul', s: 'st' };
  document.querySelectorAll('#wb-tstyle [data-tstyle]').forEach((b) => b.addEventListener('click', () => { const k = keyOf[b.dataset.tstyle]; applyTextPatch({ [k]: !S.text[k] }); }));
  document.querySelectorAll('#wb-talign [data-tal]').forEach((b) => b.addEventListener('click', () => applyTextPatch({ al: b.dataset.tal })));

  document.querySelectorAll('#wb-tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('wb-img-btn').addEventListener('click', () => { if(requireDraw()) $('wb-file').click(); });
  $('wb-file').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const c = viewCenterBoard();
    for(let i = 0; i < files.length; i++) await addImageFromBlob(files[i], c.x + i * 30, c.y + i * 30);
  });

  $('wb-undo').addEventListener('click', undo);
  $('wb-redo').addEventListener('click', redo);
  $('wb-clear').addEventListener('click', () => {
    if(S.role !== 't') return;
    if(!window.confirm('Clear the whole board for everyone?')) return;
    clearAllLocal(); send({ k: 'clr' }); persist(); refreshOptions();
  });

  $('wb-zin').addEventListener('click', () => zoomCenter(1.25));
  $('wb-zout').addEventListener('click', () => zoomCenter(0.8));
  $('wb-fit').addEventListener('click', fitView);

  $('wb-allow-draw').addEventListener('change', (e) => setCfg({ draw: e.target.checked }));
  document.querySelectorAll('#wb-bg-seg [data-bg]').forEach((b) => b.addEventListener('click', () => setCfg({ bg: b.dataset.bg })));

  $('wb-peers-btn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('wb-peers-panel'); p.hidden = !p.hidden; });
  document.addEventListener('click', (e) => { if(!e.target.closest('.wb-peers-wrap')) $('wb-peers-panel').hidden = true; });
  $('wb-room-chip').addEventListener('click', copyLink);
  $('wb-save-btn').addEventListener('click', exportPNG);
  $('wb-leave-btn').addEventListener('click', leaveBoard);
}

function joinLink(){ return location.origin + location.pathname + '?code=' + S.code; }

async function copyLink(){
  const link = joinLink();
  try { await navigator.clipboard.writeText(link); toast('Student link copied!'); }
  catch(e) { window.prompt('Copy this student link:', link); }
}

async function leaveBoard(){
  if(S.role === 't' && !window.confirm('Close the board for everyone?')) return;
  if(S.role === 't') saveLocal();
  await leaveChannel();
  location.href = location.pathname;
}

/* ============================== paste, drop, keyboard ============================== */
function bindInput(){
  viewEl.addEventListener('pointerdown', onPointerDown);
  viewEl.addEventListener('pointermove', onPointerMove);
  viewEl.addEventListener('pointerup', onPointerUp);
  viewEl.addEventListener('pointercancel', onPointerUp);
  viewEl.addEventListener('pointerleave', () => { S.hover = null; scheduleOverlay(); });
  viewEl.addEventListener('contextmenu', (e) => e.preventDefault());
  viewEl.addEventListener('wheel', onWheel, { passive: false });

  // Text tool: a click on empty board drops a new editable text box there.
  viewEl.addEventListener('click', (e) => {
    if(S.tool !== 'text' || !S.ready) return;
    if(S.gestured){ S.gestured = false; return; }
    if(e.target.closest && e.target.closest('.wb-text')) return;
    if(!requireDraw()) return;
    const p = toBoard(e);
    createTextAt(p.x, p.y);
  });

  document.addEventListener('paste', (e) => {
    if(!S.ready) return;
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;   // normal paste inside a text box
    const cd = e.clipboardData;
    if(!cd) return;
    const imgs = [];
    Array.from(cd.files || []).forEach((f) => { if(/^image\//.test(f.type)) imgs.push(f); });
    if(!imgs.length) Array.from(cd.items || []).forEach((it) => { if(it.kind === 'file' && /^image\//.test(it.type)){ const f = it.getAsFile(); if(f) imgs.push(f); } });
    const c = viewCenterBoard();
    if(imgs.length){
      e.preventDefault();
      imgs.forEach((f, i) => addImageFromBlob(f, c.x + i * 30, c.y + i * 30));
      return;
    }
    const text = cd.getData('text/plain');
    if(text && text.trim()){
      e.preventDefault();
      if(!requireDraw()) return;
      createTextAt(c.x - 240, c.y - 40, text.slice(0, 5000), 480);
      toast('Text pasted onto the board');
    }
  });

  const wrap = $('wb-viewwrap');
  let dragDepth = 0;
  wrap.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; wrap.classList.add('dragover'); });
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); });
  wrap.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if(!dragDepth) wrap.classList.remove('dragover'); });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; wrap.classList.remove('dragover');
    if(!S.ready) return;
    const p = toBoard(e);
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => /^image\//.test(f.type));
    if(files.length){ files.forEach((f, i) => addImageFromBlob(f, p.x + i * 30, p.y + i * 30)); return; }
    const text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if(text && text.trim() && requireDraw()) createTextAt(p.x, p.y, text.slice(0, 5000), 420);
  });

  document.addEventListener('keydown', (e) => {
    if(!S.ready) return;
    const el = e.target, tag = el && el.tagName;
    const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'color', 'file'].includes(el.type)) || (el && el.isContentEditable);
    if(typing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if(key === ' '){ if(!S.space){ S.space = true; viewEl.classList.add('space'); } e.preventDefault(); return; }
    if(mod && key === 'z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
    if(mod && key === 'y'){ e.preventDefault(); redo(); return; }
    if(mod) return;
    if(key === 'Delete' || key === 'Backspace'){ if(S.sel){ e.preventDefault(); deleteSelected(); } return; }
    if(key === 'Escape'){ S.sel = null; clearTextSelection(); drawOverlay(); refreshOptions(); return; }
    const map = { v: 'select', p: 'pen', e: 'eraser', l: 'line', r: 'rect', c: 'circle', t: 'text', h: 'hand' };
    if(map[key]){ setTool(map[key]); return; }
    if(key === '+' || key === '='){ zoomCenter(1.25); return; }
    if(key === '-' || key === '_'){ zoomCenter(0.8); return; }
    if(key === '0'){ fitView(); return; }
  });
  document.addEventListener('keyup', (e) => { if(e.key === ' '){ S.space = false; viewEl.classList.remove('space'); } });

  window.addEventListener('resize', () => { setHeaderVar(); if(S.ready && S.autoFit) fitView(); });
}

/* ============================== sending ============================== */
S.qb = [];                                                     // bulk queue (image chunks, snapshots) -- always yields to live drawing

function send(payload){
  if(!S.channel) return;
  payload.u = S.id;
  (payload.k === 'img' || payload.k === 'snap' ? S.qb : S.q).push(payload);
  pump();
}

function pump(){
  if(S.pumping) return;
  S.pumping = true;
  (async () => {
    while(S.q.length || S.qb.length){
      const m = S.q.length ? S.q.shift() : S.qb.shift();
      if(!S.channel){ S.q.length = 0; S.qb.length = 0; break; }
      try { await S.channel.send({ type: 'broadcast', event: EVENT, payload: m }); } catch(e) { /* dropped message: next snapshot/seg repairs it */ }
      await sleep(SEND_GAP_MS);
    }
    S.pumping = false;
  })();
}

const thr = new Map();
function sendThrottled(key, payload, ms){
  const t = thr.get(key) || { last: 0, timer: null, payload: null };
  t.payload = payload; thr.set(key, t);
  const now = Date.now();
  if(now - t.last >= ms){ t.last = now; send(t.payload); t.payload = null; }
  else if(!t.timer){
    t.timer = setTimeout(() => { t.timer = null; if(t.payload){ t.last = Date.now(); send(t.payload); t.payload = null; } }, ms - (now - t.last));
  }
}
function flushThrottled(key){
  const t = thr.get(key);
  if(!t) return;
  if(t.timer){ clearTimeout(t.timer); t.timer = null; }
  if(t.payload){ t.last = Date.now(); send(t.payload); t.payload = null; }
}

/* ============================== receiving ============================== */
function isTeacherPeer(u){ const m = S.peers.get(u); return !!m && m.role === 't'; }

function onMessage(p){
  if(!p || typeof p !== 'object' || !S.ready || typeof p.k !== 'string') return;
  if(p.u === S.id) return;
  switch(p.k){
    case 'seg': onSeg(p); break;
    case 'add': onAdd(p); break;
    case 'img': onImgChunk(p); break;
    case 'upd': onUpd(p); break;
    case 'del': onDel(p); break;
    case 'clr': if(isTeacherPeer(p.u)){ clearAllLocal(); refreshOptions(); toast('The teacher cleared the board'); } break;
    case 'cfg': if(isTeacherPeer(p.u)) onCfg(p); break;
    case 'hello': onHello(p); break;
    case 'snap': onSnap(p); break;
    default: break;
  }
}

function onSeg(p){
  if(typeof p.id !== 'string' || p.id.length > 48 || !Array.isArray(p.a)) return;
  let o = S.byId.get(p.id);
  if(!o){
    o = cleanObj({ id: p.id, t: 's', u: p.u, c: p.s && p.s.c, w: p.s && p.s.w, e: p.s && p.s.e, p: [] });
    if(!o) return;
    addObj(o);
  } else if(o.t !== 's' || o.u !== p.u) return;
  const from = o.p.length / 2;
  for(let i = 0; i + 1 < p.a.length && o.p.length < MAX_STROKE_POINTS * 2 + 2; i += 2){
    const x = Number(p.a[i]), y = Number(p.a[i + 1]);
    if(Number.isFinite(x) && Number.isFinite(y)) o.p.push(x, y);
  }
  if(o.p.length / 2 > from) drawStrokeTail(mainCtx, o, from);
  if(p.fin) scheduleRedraw();
}

function onAdd(p){
  const c = cleanObj(p.o);
  if(!c || S.byId.has(c.id)) return;
  c.u = typeof p.u === 'string' ? p.u : '';
  if(c.t === 't') c._sent = true;
  addObj(c);
  scheduleRedraw();
}

function onUpd(p){
  const o = S.byId.get(p.id);
  if(!o || !(o.u === p.u || isTeacherPeer(p.u))) return;
  const patch = cleanPatch(o, p.p);
  if(o.t === 't' && 'txt' in patch){
    const el = S.textEls.get(o.id);
    if(el && document.activeElement === el.querySelector('textarea')) delete patch.txt;   // never overwrite what I'm typing
  }
  Object.assign(o, patch);
  if(o.t === 't') styleTextEl(o); else scheduleRedraw();
}

function onDel(p){
  const o = S.byId.get(p.id);
  if(!o || !(o.u === p.u || isTeacherPeer(p.u))) return;
  removeObj(p.id);
  refreshOptions();
}

function onCfg(p){
  S.cfg.draw = p.draw !== false;
  S.cfg.bg = ['paper', 'grid', 'dark'].includes(p.bg) ? p.bg : 'paper';
  applyCfg();
}

function setCfg(patch){
  if(S.role !== 't') return;
  Object.assign(S.cfg, patch);
  applyCfg();
  send({ k: 'cfg', draw: S.cfg.draw, bg: S.cfg.bg });
  persist();
}

/* ---------- late joiners: ask for the board, receive it in small parts ---------- */
function requestBoard(){
  if(!S.channel) return;
  S.synced = false;
  const syncing = $('wb-syncing');
  let tries = 0;
  const max = S.role === 't' ? 2 : 6;
  if(S.role === 's') syncing.hidden = false;
  const ask = () => {
    if(S.synced || tries >= max || !S.channel){ syncing.hidden = true; if(!S.synced && S.role === 't') S.synced = true; return; }
    tries++;
    send({ k: 'hello', r: S.role, nm: S.name });
    setTimeout(ask, 2200);
  };
  ask();
}

const lastSnapTo = new Map();
function onHello(p){
  if(!S.synced && S.role !== 't') return;                      // nothing to share yet
  if(p.r === 't'){                                             // the teacher came back: the first student (alphabetically) helps
    if(p.has || S.role !== 's') return;
    const studs = presenceMetas().filter((m) => m.role === 's').map((m) => m.key).sort();
    if(studs[0] !== S.id) return;
  } else if(S.role !== 't') return;                            // students ask the teacher
  const now = Date.now();
  if(now - (lastSnapTo.get(p.u) || 0) < 6000) return;          // don't resend the whole board to the same person repeatedly
  lastSnapTo.set(p.u, now);
  setTimeout(() => sendSnapshot(p.u), 150);
}

function sendSnapshot(to){
  const parts = [];
  let cur = [], len = 0;
  S.objs.forEach((o) => {
    const w = wire(o), size = JSON.stringify(w).length;
    if(len + size > MAX_MSG_CHARS && cur.length){ parts.push(cur); cur = []; len = 0; }
    cur.push(w); len += size;
  });
  if(cur.length || !parts.length) parts.push(cur);
  parts.forEach((objs, i) => {
    const m = { k: 'snap', to, i, n: parts.length, objs };
    if(i === 0) m.cfg = { draw: S.cfg.draw, bg: S.cfg.bg };
    send(m);
  });
  S.objs.forEach((o) => { if(o.t === 'i' && S.imgData.get(o.id)) sendImageChunks(o.id, S.imgData.get(o.id), to); });
}

function onSnap(p){
  if(p.to && p.to !== S.id) return;
  if(!Array.isArray(p.objs)) return;
  const i = Math.floor(Number(p.i)) || 0;
  if(S.role === 't' && S.objs.length > 0) return;              // a teacher that already has a board keeps it
  if(i === 0 && !S.synced && S.role === 's') clearAllLocal(); // first part replaces whatever a reconnecting student had
  S.synced = true;
  $('wb-syncing').hidden = true;
  p.objs.forEach((o) => {
    const c = cleanObj(o);
    if(!c || S.byId.has(c.id)) return;
    if(c.t === 't') c._sent = true;
    addObj(c);
  });
  if(i === 0 && p.cfg && isTeacherPeer(p.u)) onCfg(p.cfg);
  scheduleRedraw();
}

/* ============================== presence ============================== */
function onPresence(){
  const next = new Map();
  presenceMetas().forEach((m) => next.set(m.key, m));
  if(S.peersSeen && S.role === 't' && next.size <= 12){
    next.forEach((m, k) => { if(!S.peers.has(k) && k !== S.id) toast(m.name + ' joined'); });
  }
  S.peers = next;
  S.peersSeen = true;
  renderPeers();
  if(S.ready) updateBanner();
}

function peerColor(key){
  let h = 0;
  for(let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

function renderPeers(){
  const list = Array.from(S.peers.entries()).sort((a, b) => (a[1].role === 't' ? -1 : 0) - (b[1].role === 't' ? -1 : 0) || a[1].name.localeCompare(b[1].name));
  $('wb-peers-count').textContent = list.length || 1;
  $('wb-peers-list').innerHTML = list.map(([key, m]) =>
    '<div class="wb-peer"><i style="background:' + peerColor(key) + ';"></i>' + esc(m.name) +
    '<small>' + (key === S.id ? 'YOU' : m.role === 't' ? 'TEACHER' : '') + '</small></div>'
  ).join('') || '<div class="wb-peer">Just you</div>';
}

/* ============================== teacher autosave (so a refresh doesn't lose the board) ============================== */
let persistTimer = null;
function persist(){
  if(S.role !== 't') return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(saveLocal, 1500);
}

function saveLocal(){
  if(S.role !== 't' || !S.code) return;
  const objs = S.objs.map(wire);
  const imgs = {};
  S.imgData.forEach((v, k) => { if(S.byId.has(k)) imgs[k] = v; });
  const write = (withImgs) => localStorage.setItem(LS_BOARD + S.code, JSON.stringify({ t: Date.now(), code: S.code, cfg: S.cfg, objs, imgs: withImgs ? imgs : {} }));
  try {
    try { write(true); } catch(e) { write(false); }              // storage full: keep the drawing, drop the pictures
    localStorage.setItem(LS_LAST, JSON.stringify({ code: S.code, t: Date.now() }));
  } catch(e) { /* storage unavailable: autosave is a convenience only */ }
}

function loadLocal(code){
  try {
    const d = JSON.parse(localStorage.getItem(LS_BOARD + code) || 'null');
    if(!d || Date.now() - d.t > 12 * 3600 * 1000) return null;
    return d;
  } catch(e) { return null; }
}

function applySaved(d){
  if(d.cfg){ S.cfg.draw = d.cfg.draw !== false; S.cfg.bg = ['paper', 'grid', 'dark'].includes(d.cfg.bg) ? d.cfg.bg : 'paper'; }
  Object.keys(d.imgs || {}).forEach((k) => { if(typeof d.imgs[k] === 'string' && d.imgs[k].indexOf('data:image/') === 0) S.imgData.set(k, d.imgs[k]); });
  (d.objs || []).forEach((o) => {
    const c = cleanObj(o);
    if(!c) return;
    if(c.t === 't') c._sent = true;
    addObj(c);
  });
  redraw();
}

/* ============================== export ============================== */
function drawTextToCanvas(x, o){
  const size = TEXT_SIZES[o.sz], lh = size * 1.25, maxW = o.w - 16;
  x.save();
  x.font = (o.i ? 'italic ' : '') + (o.b ? '700 ' : '400 ') + size + 'px "Space Grotesk", sans-serif';
  x.fillStyle = o.c; x.strokeStyle = o.c; x.textBaseline = 'alphabetic';
  const lines = [];
  o.txt.split('\n').forEach((par) => {
    if(par === ''){ lines.push(''); return; }
    let line = '';
    par.split(' ').forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if(x.measureText(test).width > maxW && line){ lines.push(line); line = word; } else line = test;
    });
    lines.push(line);
  });
  let yy = o.y + 6;
  lines.forEach((line) => {
    const w = x.measureText(line).width;
    const lx = o.al === 'c' ? o.x + o.w / 2 - w / 2 : o.al === 'r' ? o.x + o.w - 8 - w : o.x + 8;
    const base = yy + (lh - size) / 2 + size * 0.82;
    x.fillText(line, lx, base);
    x.lineWidth = Math.max(1, size / 16);
    if(o.ul){ x.beginPath(); x.moveTo(lx, base + size * 0.1); x.lineTo(lx + w, base + size * 0.1); x.stroke(); }
    if(o.st){ x.beginPath(); x.moveTo(lx, base - size * 0.3); x.lineTo(lx + w, base - size * 0.3); x.stroke(); }
    yy += lh;
  });
  x.restore();
}

function exportPNG(){
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = BOARD_W * scale; c.height = BOARD_H * scale;
  const x = c.getContext('2d');
  x.scale(scale, scale);
  x.fillStyle = S.cfg.bg === 'dark' ? '#15121F' : '#FFFFFF';
  x.fillRect(0, 0, BOARD_W, BOARD_H);
  if(S.cfg.bg === 'grid'){
    x.strokeStyle = 'rgba(30,27,46,0.10)'; x.lineWidth = 1;
    for(let g = 0; g <= BOARD_W; g += 40){ x.beginPath(); x.moveTo(g + 0.5, 0); x.lineTo(g + 0.5, BOARD_H); x.stroke(); }
    for(let g = 0; g <= BOARD_H; g += 40){ x.beginPath(); x.moveTo(0, g + 0.5); x.lineTo(BOARD_W, g + 0.5); x.stroke(); }
  }
  x.drawImage(mainCanvas, 0, 0, BOARD_W, BOARD_H);
  S.objs.forEach((o) => { if(o.t === 't') drawTextToCanvas(x, o); });
  c.toBlob((blob) => {
    if(!blob){ toast("Couldn't save the image."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'whiteboard-' + S.code + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

/* ============================== enter the board + boot ============================== */
function setHeaderVar(){
  const h = document.querySelector('header');
  const v = h ? Math.round(h.getBoundingClientRect().height) : 72;
  document.documentElement.style.setProperty('--hdr', (v || 72) + 'px');
}

function enterBoard(){
  $('wb-landing').hidden = true;
  $('wb-app').hidden = false;
  document.body.classList.add('wb-active');
  $('wb-role').textContent = S.role === 't' ? 'TEACHER' : 'STUDENT';
  $('wb-role').className = 'wb-role' + (S.role === 's' ? ' s' : '');
  $('wb-room-code').textContent = S.code;
  $('wb-teacher-ctl').hidden = S.role !== 't';
  S.ready = true;
  setStatus('live', 'Live');
  setHeaderVar();
  setTool('pen');
  applyCfg();
  renderPeers();
  fitView();
  redraw();
  setTimeout(() => { if(S.autoFit) fitView(); }, 120);        // layout may settle after the first paint
}

function boot(){
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = iconSVG(el.dataset.icon); });
  setupCanvases();
  buildColors();
  bindOptions();
  bindInput();
  setHeaderVar();

  let saved = '';
  try { saved = localStorage.getItem(LS_NAME) || ''; } catch(e) { /* ignore */ }
  $('wb-host-name').value = saved;
  $('wb-join-name').value = saved;

  const code = new URLSearchParams(location.search).get('code') || '';
  if(/^\d{6}$/.test(code)){
    $('wb-join-code').value = code;
    $('wb-card-join').classList.add('highlight');
    (saved ? $('wb-join-btn') : $('wb-join-name')).focus();
  }

  $('wb-join-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('wb-host-btn').addEventListener('click', () => startHost());
  $('wb-join-btn').addEventListener('click', startJoin);
  ['wb-join-code', 'wb-join-name'].forEach((id) => $(id).addEventListener('keydown', (e) => { if(e.key === 'Enter') startJoin(); }));
  $('wb-host-name').addEventListener('keydown', (e) => { if(e.key === 'Enter') startHost(); });

  try {
    const last = JSON.parse(localStorage.getItem(LS_LAST) || 'null');
    if(last && last.code && loadLocal(last.code)){
      const b = $('wb-resume-btn');
      b.textContent = '↻ Resume my last board (' + last.code + ')';
      b.hidden = false;
      b.addEventListener('click', () => startHost(last.code));
    }
  } catch(e) { /* ignore */ }

  const saveNow = () => { if(S.role === 't') saveLocal(); };
  window.addEventListener('beforeunload', saveNow);
  window.addEventListener('pagehide', saveNow);
}

if(window.__WB_TEST__){ window.__WB_TEST__.api = { S, startHost, startJoin, send, onMessage, setTool, setColor, redraw, undo, redo, createTextAt, addImageFromBlob, buildShape, exportPNG, applyTextPatch, setCfg, toBoard, fitView, flushStroke }; }

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})();
