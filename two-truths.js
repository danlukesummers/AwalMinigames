/* AWAL Minigames -- Two Truths and One Lie (teacher side). Only loaded on two-truths.html.
   Depends on two-truths-core.js (rules).  The teacher hosts: students write and vote on their
   own devices; the teacher's screen is the projected "stage" that moves the game along. */

const ttCfg = { discussSeconds: 0 };

const ttView = {
  gs: null,        // current game_state
  lobby: null,
  students: [],    // [{id, name, color}]
  busy: false
};

let ttLobbyChannel = null;
let ttPresenceChannel = null;
let ttTimerHandle = null;

function ttSound(name){ if(window.AwalSounds) AwalSounds.play(name); }
function ttEl(id){ return document.getElementById(id); }
function ttEsc(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============ SETUP + ROOM ============ */

function ttUpdateDiscuss(v){ ttCfg.discussSeconds = parseInt(v, 10) || 0; }

function ttShow(which){
  ['tt-setup', 'tt-room', 'tt-play'].forEach(id => { ttEl(id).style.display = (id === which) ? 'block' : 'none'; });
}

async function ttCreateRoom(){
  ttEl('tt-setup-error').style.display = 'none';
  ttView.students = [];
  ttShow('tt-room');
  ttEl('tt-room-code').textContent = '••••';
  ttEl('tt-room-link').textContent = 'Creating room…';
  ttEl('tt-begin-btn').disabled = true;
  ttRenderRoster();

  let tries = 0;
  while(!window.LobbySupabase && tries < 40){ await new Promise(r => setTimeout(r, 50)); tries++; }
  if(!window.LobbySupabase){
    ttEl('tt-room-link').textContent = 'Lobby client not ready. Please go back and try again.';
    return;
  }

  // If the lobbies.game column only accepts known values, fall back to one it accepts.
  // The real game is identified by game_state.game, so students are routed correctly either way.
  let lobby = await window.LobbySupabase.createLobby('two-truths', 0);
  if(!lobby){
    console.warn('[Two Truths] createLobby failed with game="two-truths":', window.LobbySupabase.lastError, '-- retrying with game="word-association"');
    lobby = await window.LobbySupabase.createLobby('word-association', 0);
  }
  if(!lobby){
    const why = window.LobbySupabase.lastError ? ' (' + window.LobbySupabase.lastError + ')' : '';
    ttEl('tt-room-link').textContent = 'Could not create the room' + why + '. Check your connection and try again.';
    return;
  }

  ttView.lobby = lobby;
  ttEl('tt-room-code').textContent = lobby.code;
  ttEl('tt-room-link').textContent = window.location.origin + '/join.html?code=' + lobby.code;

  ttPresenceChannel = window.LobbySupabase.watchPresence(lobby.id, ttHandleStudentLeft);

  ttLobbyChannel = window.LobbySupabase.subscribeToLobby(lobby.id, (updated) => {
    ttView.lobby = updated;

    const prevIds = ttView.students.map(s => s.id);
    const newIds = (updated.players || []).map(p => p.id);
    if(newIds.some(id => !prevIds.includes(id))) ttSound('join');
    else if(prevIds.some(id => !newIds.includes(id))) ttSound('leave');

    ttView.students = (updated.players || []).map(p => ({ id: p.id, name: p.name, color: p.color }));

    if(ttEl('tt-room').style.display !== 'none'){
      ttRenderRoster();
    } else if(updated.status === 'playing' && updated.game_state && updated.game_state.game === 'two-truths'){
      ttView.gs = updated.game_state;
      ttRender();
    }
  });
}

function ttCopyRoomLink(){
  navigator.clipboard.writeText(ttEl('tt-room-link').textContent).then(() => {
    const btn = ttEl('tt-room-copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }).catch(() => {});
}

function ttRenderRoster(){
  const count = ttView.students.length;
  let html = '';
  const seats = Math.max(4, count);
  for(let i = 0; i < seats; i++){
    const st = ttView.students[i];
    if(st){
      html += '<div class="wa-seat filled"><div class="wa-seat-avatar" style="background:' + (st.color || '#888') + ';">' +
        ttEsc((st.name || '?').charAt(0).toUpperCase()) + '</div><div class="wa-seat-name">' + ttEsc(st.name) + '</div></div>';
    } else {
      html += '<div class="wa-seat"><div class="wa-seat-name" style="opacity:0.6;">Waiting for a player…</div></div>';
    }
  }
  ttEl('tt-roster').innerHTML = html;

  const btn = ttEl('tt-begin-btn');
  btn.disabled = count < 2;
  btn.textContent = count < 2
    ? '▶ Need at least 2 students (' + count + ' joined)'
    : '▶ Start (' + count + ' students joined)';
}

function ttHandleStudentLeft(playerId){
  setTimeout(async () => {
    const lobby = ttView.lobby;
    if(!lobby || !window.LobbySupabase || lobby.status !== 'waiting') return;
    if(window.LobbySupabase.isPresent(ttPresenceChannel, playerId)) return;
    await window.LobbySupabase.leaveLobby(lobby.id, playerId);
  }, 4000);
}

async function ttBegin(){
  if(!ttView.lobby || ttView.students.length < 2) return;
  const gs = ttNewState(ttView.students.map(s => ({ id: s.id, name: s.name })), ttCfg.discussSeconds);
  const started = await window.LobbySupabase.startWordAssociationGame(ttView.lobby.id, gs, 0);
  if(started) ttView.lobby = started;
  ttView.gs = gs;
  ttShow('tt-play');
  ttRender();
}

/* ============ RENDER ============ */

function ttName(id){ return (ttView.gs.names && ttView.gs.names[id]) || 'Player'; }
function ttColorOf(id){
  const st = ttView.students.find(s => s.id === id);
  return (st && st.color) || '#888';
}

function ttStatementsHTML(gs, revealed){
  const display = gs.display;
  const tally = [0, 0, 0];
  Object.values(gs.votes || {}).forEach(v => { if(tally[v] !== undefined) tally[v]++; });
  return display.texts.map((text, i) => {
    let cls = 'tt-st', tag = '', votes = '';
    if(revealed){
      const isLie = i === display.lie;
      cls += isLie ? ' lie' : ' truth';
      tag = '<span class="tt-tag">' + (isLie ? '✗ LIE' : '✓ TRUE') + '</span>';
      votes = '<span class="tt-votes">' + tally[i] + ' vote' + (tally[i] === 1 ? '' : 's') + '</span>';
    }
    return '<div class="' + cls + '"><span class="tt-n">' + (i + 1) + '</span><span>' + ttEsc(text) + '</span>' + votes + tag + '</div>';
  }).join('');
}

function ttScoreRowsHTML(gs){
  return ttLeaderboard(gs).map(p =>
    '<div class="wa-score-row"><span class="wa-score-dot" style="background:' + ttColorOf(p.id) + ';"></span>' +
    '<span class="wa-score-name">' + ttEsc(p.name) + '</span><span class="wa-score-num">' + p.score + '</span></div>'
  ).join('');
}

function ttRender(){
  const gs = ttView.gs;
  if(!gs) return;

  ttEl('tt-sec-writing').style.display = gs.phase === 'writing' ? 'block' : 'none';
  ttEl('tt-sec-story').style.display = ['questions', 'voting', 'reveal'].includes(gs.phase) ? 'block' : 'none';
  ttEl('tt-sec-final').style.display = gs.phase === 'final' ? 'block' : 'none';
  ttEl('tt-end-btn').style.display = gs.phase === 'final' ? 'none' : 'inline-flex';

  if(gs.phase === 'writing'){
    const ids = Object.keys(gs.names);
    ttEl('tt-write-chips').innerHTML = ids.map(id => {
      const done = !!gs.submissions[id];
      return '<div class="tt-chip' + (done ? ' done' : '') + '"><span class="tt-mark">' + (done ? '✓' : '…') + '</span>' + ttEsc(gs.names[id]) + '</div>';
    }).join('');
    const n = Object.keys(gs.submissions).length;
    const btn = ttEl('tt-start-btn');
    btn.disabled = n < 2;
    btn.textContent = n < 2 ? '▶ Waiting for at least 2 students (' + n + ' ready)' : '▶ Start the first round (' + n + ' ready)';
    ttStopTimer();
    return;
  }

  if(gs.phase === 'final'){
    ttStopTimer();
    const board = ttLeaderboard(gs);
    ttEl('tt-final-board').innerHTML = ttScoreRowsHTML(gs);
    ttEl('tt-final-line').textContent = board.length ? board[0].name + ' wins with ' + board[0].score + ' point' + (board[0].score === 1 ? '' : 's') + '!' : '';
    return;
  }

  // questions / voting / reveal
  const st = ttStoryteller(gs);
  const voters = ttVoterIds(gs);
  const voted = voters.filter(id => gs.votes[id] !== undefined).length;
  const revealed = gs.phase === 'reveal';

  ttEl('tt-who').textContent = ttName(st) + "'s statements (" + (gs.current + 1) + ' of ' + gs.order.length + ')';
  ttEl('tt-statements').innerHTML = ttStatementsHTML(gs, revealed);
  ttEl('tt-scoreboard').innerHTML = ttScoreRowsHTML(gs);

  const label = ttEl('tt-phase-label'), instr = ttEl('tt-instruction'), note = ttEl('tt-note'), mainBtn = ttEl('tt-main-btn');
  note.textContent = '';

  if(gs.phase === 'questions'){
    label.textContent = '❓ ASK FOLLOW-UP QUESTIONS';
    instr.textContent = 'Ask ' + ttName(st) + ' questions out loud, e.g. “When did that happen?” “Who were you with?”';
    mainBtn.textContent = '🗳 Open voting';
    mainBtn.disabled = false;
  } else if(gs.phase === 'voting'){
    label.textContent = '🗳 VOTE NOW';
    instr.textContent = 'Which one is the lie? Vote on your device.';
    note.textContent = voted + ' / ' + voters.length + ' voted' + (voted === voters.length ? ' — everyone has voted!' : '');
    mainBtn.textContent = '👀 Reveal the lie';
    mainBtn.disabled = false;
  } else {
    const r = gs.results[gs.results.length - 1];
    label.textContent = '🎭 THE REVEAL';
    instr.textContent = 'Statement ' + (gs.display.lie + 1) + ' was the lie!';
    const names = (ids) => ids.length ? ids.map(ttName).join(', ') : 'nobody';
    note.innerHTML = '✓ Spotted it: <strong>' + ttEsc(names(r.correct)) + '</strong><br>✗ Fooled: <strong>' + ttEsc(names(r.fooled)) + '</strong>';
    const last = gs.current + 1 >= gs.order.length;
    mainBtn.textContent = last ? '🏆 See final results' : '➡ Next student';
    mainBtn.disabled = false;
  }

  ttStartTimer();
}

/* ============ QUESTION TIMER ============ */

function ttStopTimer(){ if(ttTimerHandle){ clearInterval(ttTimerHandle); ttTimerHandle = null; } }

function ttStartTimer(){
  ttStopTimer();
  const el = ttEl('tt-timer');
  const gs = ttView.gs, lobby = ttView.lobby;
  el.textContent = '';
  el.classList.remove('hot');

  if(!gs || gs.phase !== 'questions' || !gs.discussSeconds || !lobby || !lobby.round_started_at) return;

  const limit = gs.discussSeconds;
  const startedAt = new Date(lobby.round_started_at).getTime();
  let fired = false;

  const tick = () => {
    const remaining = Math.max(0, limit - Math.floor((Date.now() - startedAt) / 1000));
    el.textContent = '⏱ ' + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
    el.classList.toggle('hot', remaining <= 10);
    if(remaining <= 0 && !fired){
      fired = true;
      ttStopTimer();
      ttSend({ type: 'vote_open' });   // time's up -> open voting automatically
    }
  };
  tick();
  ttTimerHandle = setInterval(tick, 250);
}

/* ============ ACTIONS ============ */

// Guarded so a double click (or the timer firing as you click) can't skip a phase.
async function ttSend(action){
  if(ttView.busy || !ttView.lobby || !ttView.gs) return null;
  ttView.busy = true;
  const expectedPhase = ttView.gs.phase;
  const expectedCurrent = ttView.gs.current;

  const updated = await window.LobbySupabase.updateGameState(ttView.lobby.id, (s) => {
    if(s.phase !== expectedPhase || s.current !== expectedCurrent) return s;
    return ttApply(s, action);
  });

  ttView.busy = false;
  if(updated){
    ttView.lobby = updated;
    ttView.gs = updated.game_state;
    ttRender();
  }
  return updated;
}

async function ttStartRound(){
  const updated = await ttSend({ type: 'start' });
  if(updated) ttSound('join');
}

async function ttMainAction(){
  const phase = ttView.gs.phase;
  if(phase === 'questions'){ await ttSend({ type: 'vote_open' }); }
  else if(phase === 'voting'){
    const updated = await ttSend({ type: 'reveal' });
    if(updated) ttSound('correctAnswer');
  }
  else if(phase === 'reveal'){ await ttSend({ type: 'next' }); }
}

async function ttEndEarly(){
  if(!window.confirm('End the game now and show the final scores?')) return;
  await ttSend({ type: 'end' });
}

async function ttPlayAgain(){
  ttStopTimer();
  if(ttView.lobby && window.LobbySupabase){
    await window.LobbySupabase.endWordAssociationGame(ttView.lobby.id);
    if(ttLobbyChannel){ window.LobbySupabase.unsubscribe(ttLobbyChannel); ttLobbyChannel = null; }
    if(ttPresenceChannel){ window.LobbySupabase.unsubscribe(ttPresenceChannel); ttPresenceChannel = null; }
  }
  ttView.lobby = null;
  ttView.gs = null;
  ttView.students = [];
  ttShow('tt-setup');
}

ttShow('tt-setup');
