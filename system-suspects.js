/* AWAL Minigames -- System Suspects (teacher side). Only loaded on system-suspects.html.
   Depends on system-suspects-core.js (shared board generation + game rules). */

const gwCfg = { traceLimit: 0, turnTimeLimit: 0 }; // traceLimit 0 = unlimited questions

const gwView = {
  mode: null,          // 'solo' | 'classroom'
  gs: null,            // current game_state
  suspects: [],        // built from gs.seed
  students: [],        // [{id, name}]
  prevEliminated: [],  // to animate newly eliminated cards
  lobby: null
};

let gwLobbyChannel = null;
let gwPresenceChannel = null;
let gwTimerHandle = null;

function gwSound(name){ if(window.AwalSounds) AwalSounds.play(name); }
function gwEl(id){ return document.getElementById(id); }

/* ============ SETUP ============ */

function gwUpdateTraceLimit(v){ gwCfg.traceLimit = parseInt(v, 10) || 0; }
function gwUpdateTimeLimit(v){ gwCfg.turnTimeLimit = parseInt(v, 10) || 0; }

function gwShow(which){
  ['gw-setup', 'gw-room', 'gw-play'].forEach(id => { gwEl(id).style.display = (id === which) ? 'block' : 'none'; });
}

function gwStartSolo(){
  gwView.mode = 'solo';
  gwLoadState(gwNewGameState(['solo'], gwCfg.traceLimit, 0));
  gwShow('gw-play');
  gwRender();
}

function gwLoadState(gs){
  gwView.gs = gs;
  if(!gwView.suspects.length || gwView.suspectsSeed !== gs.seed){
    gwView.suspects = gwSuspectsFromSeed(gs.seed);
    gwView.suspectsSeed = gs.seed;
    gwView.prevEliminated = [];
  }
}

/* ============ CLASSROOM ROOM ============ */

async function gwCreateRoom(){
  const errEl = gwEl('gw-setup-error');
  errEl.style.display = 'none';

  gwView.mode = 'classroom';
  gwView.students = [];
  gwShow('gw-room');
  gwEl('gw-room-code').textContent = '••••••';
  gwEl('gw-room-link').textContent = 'Creating room…';
  gwEl('gw-begin-btn').disabled = true;
  gwRenderRoster();

  let tries = 0;
  while(!window.LobbySupabase && tries < 40){ await new Promise(r => setTimeout(r, 50)); tries++; }
  if(!window.LobbySupabase){
    gwEl('gw-room-link').textContent = 'Lobby client not ready. Please go back and try again.';
    return;
  }

  // Some Supabase tables only accept known values in lobbies.game (check constraint / enum).
  // Try our own game type first; if the database rejects it, fall back to one it already
  // accepts. The real game is identified by game_state.game, so the students' page routes correctly either way.
  let lobby = await window.LobbySupabase.createLobby('system-suspects', gwCfg.turnTimeLimit);
  if(!lobby){
    console.warn('[System Suspects] createLobby failed with game="system-suspects":', window.LobbySupabase.lastError, '-- retrying with game="word-association"');
    lobby = await window.LobbySupabase.createLobby('word-association', gwCfg.turnTimeLimit);
  }
  if(!lobby){
    const why = window.LobbySupabase.lastError ? ' (' + window.LobbySupabase.lastError + ')' : '';
    gwEl('gw-room-link').textContent = 'Could not create the room' + why + '. Check your connection and try again.';
    return;
  }

  gwView.lobby = lobby;
  gwEl('gw-room-code').textContent = lobby.code;
  gwEl('gw-room-link').textContent = window.location.origin + '/join.html?code=' + lobby.code;

  gwPresenceChannel = window.LobbySupabase.watchPresence(lobby.id, gwHandleStudentLeft);

  gwLobbyChannel = window.LobbySupabase.subscribeToLobby(lobby.id, (updated) => {
    gwView.lobby = updated;

    const prevIds = gwView.students.map(s => s.id);
    const newIds = (updated.players || []).map(p => p.id);
    if(newIds.some(id => !prevIds.includes(id))) gwSound('join');
    else if(prevIds.some(id => !newIds.includes(id))) gwSound('leave');

    gwView.students = (updated.players || []).map(p => ({ id: p.id, name: p.name }));

    if(gwEl('gw-room').style.display !== 'none'){
      gwRenderRoster();
    } else if(updated.status === 'playing' && updated.game_state && updated.game_state.seed !== undefined){
      gwLoadState(updated.game_state);
      gwRender();
    }
  });
}

function gwCopyRoomLink(){
  const link = gwEl('gw-room-link').textContent;
  navigator.clipboard.writeText(link).then(() => {
    const btn = gwEl('gw-room-copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }).catch(() => {});
}

function gwRenderRoster(){
  const wrap = gwEl('gw-roster');
  const count = gwView.students.length;
  let html = gwView.students.map(s => '<span class="gw-chip">' + gwEsc(s.name) + '</span>').join('');
  if(!count) html = '<span class="gw-chip empty">Waiting for students…</span>';
  wrap.innerHTML = html;

  const btn = gwEl('gw-begin-btn');
  btn.disabled = count < 1;
  btn.textContent = count < 1
    ? '▶ Need at least 1 student (0 joined)'
    : '▶ Begin case (' + count + ' student' + (count === 1 ? '' : 's') + ' joined)';
}

function gwEsc(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function gwHandleStudentLeft(playerId){
  setTimeout(async () => {
    const lobby = gwView.lobby;
    if(!lobby || !window.LobbySupabase || lobby.status !== 'waiting') return;
    if(window.LobbySupabase.isPresent(gwPresenceChannel, playerId)) return;
    await window.LobbySupabase.leaveLobby(lobby.id, playerId);
  }, 4000);
}

async function gwBeginRound(){
  if(!gwView.lobby || gwView.students.length < 1) return;

  const order = gwView.students.map(s => s.id);
  const gs = gwNewGameState(order, gwCfg.traceLimit, gwCfg.turnTimeLimit);

  const started = await window.LobbySupabase.startWordAssociationGame(gwView.lobby.id, gs, gwCfg.turnTimeLimit);
  if(started) gwView.lobby = started;

  gwLoadState(gs);
  gwShow('gw-play');
  gwRender();
}

/* ============ RENDER ============ */

function gwNameFor(id){
  const s = gwView.students.find(x => x.id === id);
  return s ? s.name : 'Player';
}

function gwRender(){
  const gs = gwView.gs;
  if(!gs) return;
  const solo = gwView.mode === 'solo';
  const target = gwView.suspects[gs.targetIndex];

  // turn bar
  const turnEl = gwEl('gw-turn');
  if(gs.ended) turnEl.textContent = gs.result === 'win' ? '✓ CASE CLOSED' : '✕ CASE FAILED';
  else if(solo) turnEl.textContent = 'YOUR MOVE';
  else turnEl.textContent = '▶ ' + gwNameFor(gs.order[gs.turnIndex]).toUpperCase() + "'S TURN";

  // question deck: full bank in solo mode, just the asked questions when the class is playing
  const deck = gwEl('gw-qdeck-buttons');
  const outOfQs = gwOutOfQuestions(gs);
  if(solo){
    gwEl('gw-qdeck-label').textContent = 'ASK A QUESTION';
    deck.innerHTML = GW_CATEGORIES.map(cat =>
      '<div class="gw-cat"><span class="gw-cat-label">' + cat.label + '</span>' +
      GW_QUESTIONS.filter(q => q.cat === cat.id).map(q => {
        const disabled = gs.askedTraits.includes(q.id) || outOfQs || gs.ended;
        return '<button class="gw-qbtn" ' + (disabled ? 'disabled ' : '') + 'onclick="gwSoloAsk(\'' + q.id + '\')">[' + q.label + ']</button>';
      }).join('') + '</div>'
    ).join('');
  } else {
    gwEl('gw-qdeck-label').textContent = 'QUESTIONS ASKED BY THE CLASS';
    deck.innerHTML = '<div class="gw-cat">' + (gs.askedTraits.length
      ? gs.askedTraits.map(id => '<span class="gw-asked-chip">' + gwFindQuestion(id).label + '</span>').join('')
      : '<span class="gw-asked-chip" style="border-color:rgba(228,255,251,0.25); color:rgba(228,255,251,0.45);">none yet</span>') + '</div>';
  }

  gwEl('gw-protocol-list').innerHTML = gs.askedTraits.length
    ? gs.askedTraits.map(id => '<li class="pending">[' + gwFindQuestion(id).label + ']</li>').join('')
    : '<li class="pending">— none yet —</li>';
  gwEl('gw-traces').textContent = gs.traceLimit > 0 ? gs.tracesLeft : '∞';

  // grid (animate cards eliminated since the last render)
  const grid = gwEl('gw-grid');
  grid.classList.toggle('gw-view-only', !solo);
  const fresh = gs.eliminated.filter(i => !gwView.prevEliminated.includes(i));
  grid.innerHTML = gwView.suspects.map((s, i) => {
    const out = gs.eliminated.includes(i);
    const glitch = fresh.includes(i);
    return '<div class="gw-card' + (out && !glitch ? ' gw-out' : '') + (glitch ? ' gw-glitching' : '') + '" id="' + s.id + '">' +
      '<div class="gw-avatar-wrap">' + gwBuildAvatarSVG(s) + '</div>' +
      '<div class="gw-code">' + s.code + '</div>' +
      '<button class="gw-elim-btn" onclick="gwManualEliminate(' + i + ')">ELIMINATE</button>' +
    '</div>';
  }).join('');
  if(fresh.length){
    setTimeout(() => {
      fresh.forEach(i => {
        const el = gwEl(gwView.suspects[i].id);
        if(el){ el.classList.remove('gw-glitching'); el.classList.add('gw-out'); }
      });
    }, 350);
    gwSound(gs.result === 'loss' ? 'incorrectAnswer' : 'correctLetter');
  }
  gwView.prevEliminated = gs.eliminated.slice();

  // log
  const log = gwEl('gw-log');
  log.innerHTML = gs.log.map(e =>
    '<div class="gw-log-entry"><b>Q:</b> ' + gwEsc(e.q) + '<span class="gw-log-a">A: ' + gwEsc(e.a) + '</span></div>'
  ).join('');
  log.scrollTop = log.scrollHeight;

  // target profile: hidden until the round ends
  const box = gwEl('gw-target-box');
  const codeEl = gwEl('gw-target-code');
  if(gs.ended){
    box.innerHTML = gwBuildAvatarSVG(target);
    codeEl.textContent = target.code;
    codeEl.classList.add('revealed');
  } else {
    box.innerHTML = '<svg class="gw-target-silhouette" viewBox="0 0 24 24" fill="rgba(228,255,251,0.15)"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-9 2.2-9 6v2h18v-2c0-3.8-4.6-6-9-6Z"/></svg>';
    codeEl.textContent = '???-??';
    codeEl.classList.remove('revealed');
  }

  gwEl('gw-win-code').textContent = target.code;
  gwEl('gw-result-win').classList.toggle('show', gs.ended && gs.result === 'win');
  gwEl('gw-result-loss').classList.toggle('show', gs.ended && gs.result === 'loss');

  // buttons
  gwEl('gw-skip-btn').style.display = (!solo && !gs.ended) ? 'inline-flex' : 'none';
  const nextBtn = gwEl('gw-next-btn');
  nextBtn.style.display = 'inline-flex';
  nextBtn.textContent = gs.ended ? (solo ? '↻ New Round' : '↻ Finish & set up a new case') : (solo ? '↻ New Round' : '■ End case');

  gwStartTimer();
}

/* ============ TURN TIMER (classroom) ============ */

function gwStopTimer(){ if(gwTimerHandle){ clearInterval(gwTimerHandle); gwTimerHandle = null; } }

function gwStartTimer(){
  gwStopTimer();
  const timerEl = gwEl('gw-timer');
  const gs = gwView.gs;
  const lobby = gwView.lobby;

  if(gwView.mode !== 'classroom' || !lobby || gs.ended){ timerEl.textContent = ''; return; }

  const limit = Number(lobby.time_limit || gs.turnTimeLimit || 0);
  const startedAt = lobby.round_started_at;
  if(!limit || !startedAt){ timerEl.textContent = 'No time limit'; timerEl.classList.remove('hot'); return; }

  let handled = false;
  const tick = () => {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const remaining = Math.max(0, limit - elapsed);
    timerEl.textContent = '⏱ ' + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
    timerEl.classList.toggle('hot', remaining <= 5);
    if(remaining <= 0 && !handled){
      handled = true;
      gwStopTimer();
      gwSkipTurn(true);
    }
  };
  tick();
  gwTimerHandle = setInterval(tick, 250);
}

/* ============ ACTIONS ============ */

function gwSoloAsk(key){
  if(gwView.mode !== 'solo') return;
  gwLoadState(gwApply(gwView.gs, gwView.suspects, { type: 'ask', key }));
  gwRender();
}

function gwManualEliminate(index){
  if(gwView.mode !== 'solo') return; // in class, students make the moves
  gwLoadState(gwApply(gwView.gs, gwView.suspects, { type: 'eliminate', index }));
  gwRender();
}

async function gwSkipTurn(auto){
  if(gwView.mode !== 'classroom' || !gwView.lobby || gwView.gs.ended) return;

  const expectedTurn = gwView.gs.turnIndex;
  const expectedLog = gwView.gs.log.length;

  const updated = await window.LobbySupabase.updateGameState(gwView.lobby.id, (s) => {
    if(s.ended) return s;
    // someone already moved while we were waiting -> don't skip an extra player
    if(s.turnIndex !== expectedTurn || (s.log || []).length !== expectedLog) return s;
    const name = gwNameFor((s.order || [])[s.turnIndex]);
    return gwApply(s, gwView.suspects, { type: 'skip', playerName: name });
  });

  if(updated){
    gwView.lobby = updated;
    gwLoadState(updated.game_state);
    gwSound(auto ? 'incorrectAnswer' : 'leave');
    gwRender();
  }
}

async function gwNextRound(){
  if(gwView.mode === 'solo'){
    gwLoadState(gwNewGameState(['solo'], gwCfg.traceLimit, 0));
    gwRender();
    return;
  }
  // classroom: close this room, back to setup for a fresh case
  gwStopTimer();
  if(gwView.lobby && window.LobbySupabase){
    await window.LobbySupabase.endWordAssociationGame(gwView.lobby.id);
  }
  gwResetToSetup();
}

function gwResetToSetup(){
  gwStopTimer();
  if(window.LobbySupabase){
    if(gwLobbyChannel){ window.LobbySupabase.unsubscribe(gwLobbyChannel); gwLobbyChannel = null; }
    if(gwPresenceChannel){ window.LobbySupabase.unsubscribe(gwPresenceChannel); gwPresenceChannel = null; }
  }
  gwView.lobby = null;
  gwView.gs = null;
  gwView.mode = null;
  gwView.students = [];
  gwView.suspects = [];
  gwView.prevEliminated = [];
  gwShow('gw-setup');
}

// Page starts on the setup screen (classroom room or solo practice).
gwShow('gw-setup');
