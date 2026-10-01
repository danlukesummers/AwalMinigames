/* AWAL Minigames -- System Suspects (teacher side). Only loaded on system-suspects.html.
   Depends on system-suspects-core.js (board generation, rules, shared board UI).

   Verbal guess-who: everyone gets a secret suspect. Players ask each other
   questions OUT LOUD, fade profiles on their own board, press "Next question",
   and with one profile left drag it onto the Target Profile and press End Case. */

const gwCfg = { teacherPlays: true, turnTimeLimit: 0 };

const gwView = {
  gs: null,          // current game_state
  suspects: [],      // built from gs.seed
  suspectsSeed: null,
  students: [],      // [{id, name}]
  lobby: null,
  busy: false
};

// Per-player, local-only board state (not shared): which profiles I've faded + what I've dragged to the target.
const gwLocal = { faded: new Set(), placed: null, cat: 'mood' };

let gwLobbyChannel = null;
let gwPresenceChannel = null;
let gwTimerHandle = null;

function gwSound(name){ if(window.AwalSounds) AwalSounds.play(name); }
function gwEl(id){ return document.getElementById(id); }
function gwEsc(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function gwMe(){ return gwCfg.teacherPlays ? GW_TEACHER_ID : null; }

/* ============ SETUP ============ */

function gwUpdateTeacherPlays(v){ gwCfg.teacherPlays = (v === 'yes'); }
function gwUpdateTimeLimit(v){ gwCfg.turnTimeLimit = parseInt(v, 10) || 0; }

function gwShow(which){
  ['gw-setup', 'gw-room', 'gw-play'].forEach(id => { gwEl(id).style.display = (id === which) ? 'block' : 'none'; });
}

function gwLoadState(gs){
  gwView.gs = gs;
  if(gwView.suspectsSeed !== gs.seed || !gwView.suspects.length){
    gwView.suspects = gwSuspectsFromSeed(gs.seed);
    gwView.suspectsSeed = gs.seed;
  }
}

/* ============ CLASSROOM ROOM ============ */

async function gwCreateRoom(){
  gwEl('gw-setup-error').style.display = 'none';

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

function gwMinStudents(){ return gwCfg.teacherPlays ? 1 : 2; }

function gwRenderRoster(){
  const count = gwView.students.length;
  const min = gwMinStudents();
  let html = gwCfg.teacherPlays ? '<span class="gw-chip">Teacher (you)</span>' : '';
  html += gwView.students.map(s => '<span class="gw-chip">' + gwEsc(s.name) + '</span>').join('');
  if(!count) html += '<span class="gw-chip empty">Waiting for students…</span>';
  gwEl('gw-roster').innerHTML = html;

  const btn = gwEl('gw-begin-btn');
  btn.disabled = count < min;
  btn.textContent = count < min
    ? '▶ Need at least ' + min + ' student' + (min === 1 ? '' : 's') + ' (' + count + ' joined)'
    : '▶ Begin case (' + (count + (gwCfg.teacherPlays ? 1 : 0)) + ' players)';
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
  if(!gwView.lobby || gwView.students.length < gwMinStudents()) return;

  const players = [];
  if(gwCfg.teacherPlays) players.push({ id: GW_TEACHER_ID, name: 'Teacher' });
  gwView.students.forEach(s => players.push({ id: s.id, name: s.name }));

  const gs = gwNewGameState(players, gwCfg.turnTimeLimit);

  const started = await window.LobbySupabase.startWordAssociationGame(gwView.lobby.id, gs, gwCfg.turnTimeLimit);
  if(started) gwView.lobby = started;

  gwLocal.faded = new Set();
  gwLocal.placed = null;
  gwLoadState(gs);
  gwShow('gw-play');
  gwRenderIdeas();
  gwRender();
}

/* ============ BOARD ============ */

function gwName(id){ return (gwView.gs.names && gwView.gs.names[id]) || 'Player'; }

function gwRemainingIndex(){
  // the single profile left unfaded, or -1 if there isn't exactly one
  const left = [];
  gwView.suspects.forEach((_, i) => { if(!gwLocal.faded.has(i)) left.push(i); });
  return left.length === 1 ? left[0] : -1;
}

function gwState(){
  const gs = gwView.gs;
  const me = gwMe();
  const asker = gs.order[gs.turnIndex];
  const iAmOut = !!me && gs.out.includes(me);
  const myTurn = !!me && !gs.ended && !iAmOut && asker === me;
  return { gs, me, asker, iAmOut, myTurn };
}

function gwRender(){
  const gs = gwView.gs;
  if(!gs) return;
  const { me, asker, iAmOut, myTurn } = gwState();
  const suspects = gwView.suspects;

  if(!myTurn) gwLocal.placed = null;
  if(gwLocal.placed !== null && gwLocal.faded.has(gwLocal.placed)) gwLocal.placed = null;

  // turn bar
  const turnEl = gwEl('gw-turn');
  if(gs.ended){
    turnEl.textContent = '■ CASE CLOSED';
  } else {
    const opp = gwOpponentOf(gs, asker);
    turnEl.textContent = '▶ ' + gwName(asker).toUpperCase() + "'S TURN" + (opp ? ' — ASKING ' + gwName(opp).toUpperCase() : '');
  }

  // my secret suspect
  const secretBox = gwEl('gw-secret-box');
  const secretCode = gwEl('gw-secret-code');
  if(me){
    const mine = suspects[gs.secrets[me]];
    secretBox.innerHTML = '<div class="gw-avatar-wrap" style="margin:0; border-radius:0; height:100%; aspect-ratio:auto; width:100%;">' + gwBuildAvatarSVG(mine) + '</div>';
    secretCode.textContent = mine.code;
    gwEl('gw-secret-hint').innerHTML = 'Keep it secret!<br>The other player must guess it.';
  } else {
    secretBox.textContent = 'HOST VIEW';
    secretCode.innerHTML = '&nbsp;';
    gwEl('gw-secret-hint').innerHTML = 'Students are playing.<br>You can skip a stuck turn.';
  }

  // grid
  const grid = gwEl('gw-grid');
  const dragIdx = (myTurn && gwRemainingIndex() >= 0) ? gwRemainingIndex() : -1;
  grid.classList.toggle('gw-board-static', !me || gs.ended || iAmOut);
  grid.innerHTML = gwCardsHTML(suspects, gwLocal.faded, dragIdx);

  // target profile zone
  const zone = gwEl('gw-zone');
  const placed = gwLocal.placed;
  zone.classList.toggle('filled', placed !== null);
  zone.innerHTML = gwZoneHTML(placed !== null ? suspects[placed] : null);
  gwEl('gw-zone-code').innerHTML = placed !== null ? suspects[placed].code : '&nbsp;';
  gwEl('gw-endcase-btn').disabled = !(myTurn && placed !== null && gwRemainingIndex() === placed);

  // result banner
  const banner = gwEl('gw-result');
  banner.classList.remove('show', 'win', 'loss');
  if(gs.ended){
    banner.classList.add('show', 'win');
    if(gs.guess && gs.guess.correct){
      banner.textContent = '✓ ' + gwName(gs.winnerId).toUpperCase() + ' IDENTIFIED ' + gwName(gs.guess.targetId).toUpperCase() + "'S SUSPECT: " + suspects[gs.guess.index].code;
    } else {
      banner.textContent = gs.winnerId ? '✓ ' + gwName(gs.winnerId).toUpperCase() + ' WINS — LAST PLAYER STANDING' : 'NO WINNER THIS ROUND';
    }
  } else if(iAmOut){
    banner.classList.add('show', 'loss');
    banner.textContent = "✕ WRONG SUSPECT — YOU'RE OUT. KEEP WATCHING!";
  }

  // log
  const log = gwEl('gw-log');
  log.innerHTML = gs.log.map(e =>
    '<div class="gw-log-entry"><b>›</b> ' + gwEsc(e.q) + '<span class="gw-log-a">' + gwEsc(e.a) + '</span></div>'
  ).join('');
  log.scrollTop = log.scrollHeight;

  // controls
  gwEl('gw-next-q-btn').style.display = myTurn ? 'inline-flex' : 'none';
  gwEl('gw-skip-btn').style.display = gs.ended ? 'none' : 'inline-flex';
  gwEl('gw-finish-btn').style.display = 'inline-flex';

  gwStartTimer();
}

function gwRenderIdeas(){
  gwEl('gw-ideas').innerHTML = gwIdeaTabsHTML(gwLocal.cat, 'gwSetIdeaCat') + gwIdeaListHTML(gwLocal.cat);
}
function gwSetIdeaCat(id){ gwLocal.cat = id; gwRenderIdeas(); }

// Board interactions (tap to fade, drag the last suspect to the target)
gwAttachBoardInteractions(gwEl('gw-grid'), gwEl('gw-zone'), {
  canTap: () => { if(!gwView.gs) return false; const st = gwState(); return !!st.me && !gwView.gs.ended && !st.iAmOut; },
  canDrag: (i) => { if(!gwView.gs) return false; const st = gwState(); return st.myTurn && gwRemainingIndex() === i; },
  onTap: (i) => {
    if(gwLocal.faded.has(i)) gwLocal.faded.delete(i); else gwLocal.faded.add(i);
    gwRender();
  },
  onDrop: (i) => { gwLocal.placed = i; gwRender(); },
  onZoneTap: () => {
    if(!gwView.gs) return;
    if(gwLocal.placed !== null){ gwLocal.placed = null; gwRender(); return; }
    const st = gwState();
    const only = gwRemainingIndex();
    if(st.myTurn && only >= 0){ gwLocal.placed = only; gwRender(); }
  }
});

/* ============ TURN TIMER ============ */

function gwStopTimer(){ if(gwTimerHandle){ clearInterval(gwTimerHandle); gwTimerHandle = null; } }

function gwStartTimer(){
  gwStopTimer();
  const timerEl = gwEl('gw-timer');
  const gs = gwView.gs;
  const lobby = gwView.lobby;

  if(!lobby || gs.ended){ timerEl.textContent = ''; return; }

  const limit = Number(lobby.time_limit || gs.turnTimeLimit || 0);
  const startedAt = lobby.round_started_at;
  if(!limit || !startedAt){ timerEl.textContent = ''; timerEl.classList.remove('hot'); return; }

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

// Applies an action to the shared game_state. Guarded so a double-click (or the
// timer firing at the same moment) can't advance the turn twice.
async function gwSend(action){
  if(gwView.busy || !gwView.lobby || !gwView.gs || gwView.gs.ended) return null;
  gwView.busy = true;

  const expectedTurn = gwView.gs.turnIndex;
  const expectedLog = gwView.gs.log.length;

  const updated = await window.LobbySupabase.updateGameState(gwView.lobby.id, (s) => {
    if(s.ended) return s;
    if(s.turnIndex !== expectedTurn || (s.log || []).length !== expectedLog) return s;
    return gwApply(s, gwView.suspects, action);
  });

  gwView.busy = false;
  if(updated){
    gwView.lobby = updated;
    gwLoadState(updated.game_state);
  }
  return updated;
}

async function gwNextQuestion(){
  const st = gwState();
  if(!st.myTurn) return;
  const updated = await gwSend({ type: 'next', playerId: st.me });
  if(updated){ gwSound('correctLetter'); gwRender(); }
}

async function gwEndCase(){
  const st = gwState();
  const placed = gwLocal.placed;
  if(!st.myTurn || placed === null || gwRemainingIndex() !== placed) return;

  const code = gwView.suspects[placed].code;
  if(!window.confirm('End the case with ' + code + '?\nIf this is not the other player\'s suspect, you are out.')) return;

  const updated = await gwSend({ type: 'guess', playerId: st.me, index: placed });
  if(updated){
    gwLocal.placed = null;
    const gs = updated.game_state;
    gwSound(gs.guess && gs.guess.correct ? 'correctAnswer' : 'incorrectAnswer');
    gwRender();
  }
}

async function gwSkipTurn(auto){
  if(!gwView.gs || gwView.gs.ended) return;
  const updated = await gwSend({ type: 'skip' });
  if(updated){ gwSound(auto ? 'incorrectAnswer' : 'leave'); gwRender(); }
}

async function gwFinishCase(){
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
  gwView.students = [];
  gwView.suspects = [];
  gwView.suspectsSeed = null;
  gwLocal.faded = new Set();
  gwLocal.placed = null;
  gwShow('gw-setup');
}

gwShow('gw-setup');
