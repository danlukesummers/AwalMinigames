/* AWAL Minigames -- Two Truths and One Lie (teacher side). Only loaded on two-truths.html.
   Depends on two-truths-core.js (rules + shared player UI).

   The teacher can HOST (class mode / watching a student duel) or PLAY (head to head: "me vs a student").
   When the teacher plays, they get exactly the same screens as a student on this page. */

const ttCfg = {
  mode: 'class',          // 'class' | 'duel'
  input: 'written',       // 'written' | 'spoken'
  speechLang: 'en-US',
  duelType: 'teacher',    // 'teacher' (me vs a student) | 'students' (student vs student)
  duelA: '',
  duelB: ''
};

const ttView = { gs: null, lobby: null, students: [], busy: false };

let ttLobbyChannel = null;
let ttPresenceChannel = null;

function ttSound(name){ if(window.AwalSounds) AwalSounds.play(name); }
function ttEl(id){ return document.getElementById(id); }

/* ============ SETUP ============ */

function ttSetActive(onId, offId){ ttEl(onId).classList.add('active'); ttEl(offId).classList.remove('active'); }

function ttSetMode(m){
  ttCfg.mode = m;
  ttSetActive(m === 'class' ? 'tt-mode-class' : 'tt-mode-duel', m === 'class' ? 'tt-mode-duel' : 'tt-mode-class');
  ttEl('tt-mode-hint').textContent = m === 'class'
    ? 'Every student takes a turn in the hot seat. The rest of the class clicks the lie.'
    : 'Two players. Teacher vs a student, or student vs student. Each tells once and the other clicks the lie.';
}

function ttSetInput(i){
  ttCfg.input = i;
  ttSetActive(i === 'written' ? 'tt-input-written' : 'tt-input-spoken', i === 'written' ? 'tt-input-spoken' : 'tt-input-written');
  ttEl('tt-lang-field').style.display = i === 'spoken' ? 'block' : 'none';
}

function ttSetLang(v){ ttCfg.speechLang = v; }

function ttShow(which){
  ttEl('tt-setup-wrap').style.display = which === 'setup' ? 'block' : 'none';
  ttEl('tt-room-wrap').style.display = which === 'room' ? 'block' : 'none';
  ttEl('tt-play').style.display = which === 'play' ? 'block' : 'none';
}

/* ============ ROOM ============ */

async function ttCreateRoom(){
  ttEl('tt-setup-error').style.display = 'none';
  ttView.students = [];
  ttShow('room');
  ttEl('tt-room-code').textContent = '••••';
  ttEl('tt-room-link').textContent = 'Creating room…';
  ttEl('tt-begin-btn').disabled = true;
  ttEl('tt-duel-box').style.display = ttCfg.mode === 'duel' ? 'block' : 'none';
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

    if(ttEl('tt-room-wrap').style.display !== 'none'){
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

function ttHandleStudentLeft(playerId){
  setTimeout(async () => {
    const lobby = ttView.lobby;
    if(!lobby || !window.LobbySupabase || lobby.status !== 'waiting') return;
    if(window.LobbySupabase.isPresent(ttPresenceChannel, playerId)) return;
    await window.LobbySupabase.leaveLobby(lobby.id, playerId);
  }, 4000);
}

function ttSetDuelType(t){
  ttCfg.duelType = t;
  ttSetActive(t === 'teacher' ? 'tt-duel-teacher' : 'tt-duel-students', t === 'teacher' ? 'tt-duel-students' : 'tt-duel-teacher');
  ttRenderRoster();
}

function ttPickPlayer(which, id){
  if(which === 'A') ttCfg.duelA = id; else ttCfg.duelB = id;
  ttUpdateBeginBtn();
}

function ttFillSelect(selId, selected, excludeId){
  const sel = ttEl(selId);
  const opts = ['<option value="">— choose a student —</option>'].concat(
    ttView.students.filter(s => s.id !== excludeId).map(s =>
      '<option value="' + ttEsc(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' + ttEsc(s.name) + '</option>')
  );
  sel.innerHTML = opts.join('');
}

function ttRenderRoster(){
  const count = ttView.students.length;
  let html = ttView.students.map(st =>
    '<div class="tt-seat"><div class="tt-seat-av" style="background:' + (st.color || '#888') + ';">' + ttEsc((st.name || '?').charAt(0).toUpperCase()) + '</div>' + ttEsc(st.name) + '</div>'
  ).join('');
  if(!count) html = '<div class="tt-seat empty">Waiting for students…</div>';
  ttEl('tt-roster').innerHTML = html;

  if(ttCfg.mode === 'duel'){
    // drop picks that left the room
    if(!ttView.students.some(s => s.id === ttCfg.duelA)) ttCfg.duelA = '';
    if(!ttView.students.some(s => s.id === ttCfg.duelB)) ttCfg.duelB = '';
    const studentsVs = ttCfg.duelType === 'students';
    ttEl('tt-pick-b-wrap').style.display = studentsVs ? 'block' : 'none';
    ttEl('tt-pick-a-label').textContent = studentsVs ? 'STUDENT 1' : 'STUDENT';
    ttFillSelect('tt-pick-a', ttCfg.duelA, studentsVs ? ttCfg.duelB : null);
    if(studentsVs) ttFillSelect('tt-pick-b', ttCfg.duelB, ttCfg.duelA);
  }
  ttUpdateBeginBtn();
}

function ttUpdateBeginBtn(){
  const btn = ttEl('tt-begin-btn');
  const count = ttView.students.length;
  let ok = false, label = '';

  if(ttCfg.mode === 'class'){
    ok = count >= 2;
    label = ok ? '▶ Start (' + count + ' students)' : '▶ Need at least 2 students (' + count + ' joined)';
  } else if(ttCfg.duelType === 'teacher'){
    ok = !!ttCfg.duelA;
    label = ok ? '▶ Start: you vs ' + ttStudentName(ttCfg.duelA) : '▶ Choose your opponent';
  } else {
    ok = !!ttCfg.duelA && !!ttCfg.duelB && ttCfg.duelA !== ttCfg.duelB;
    label = ok ? '▶ Start: ' + ttStudentName(ttCfg.duelA) + ' vs ' + ttStudentName(ttCfg.duelB) : '▶ Choose two students';
  }
  btn.disabled = !ok;
  btn.textContent = label;
}

function ttStudentName(id){
  const s = ttView.students.find(x => x.id === id);
  return s ? s.name : 'Student';
}

async function ttBegin(){
  if(!ttView.lobby || ttEl('tt-begin-btn').disabled) return;

  const players = ttView.students.map(s => ({ id: s.id, name: s.name }));
  let duel = null;

  if(ttCfg.mode === 'duel'){
    if(ttCfg.duelType === 'teacher'){
      players.push({ id: TT_TEACHER_ID, name: 'Teacher' });
      duel = [TT_TEACHER_ID, ttCfg.duelA];
    } else {
      duel = [ttCfg.duelA, ttCfg.duelB];
    }
  }

  const gs = ttNewState({ mode: ttCfg.mode, input: ttCfg.input, speechLang: ttCfg.speechLang, players, duel });
  const started = await window.LobbySupabase.startWordAssociationGame(ttView.lobby.id, gs, 0);
  if(started) ttView.lobby = started;
  ttView.gs = gs;
  ttShow('play');
  ttRender();
}

/* ============ PLAY ============ */

function ttColorOf(id){
  const st = ttView.students.find(s => s.id === id);
  return (st && st.color) || '#FFB020';
}

// What the teacher can do as a PLAYER (only when they're one of the two duelists).
const ttHostActions = {
  submit: (texts, lie) => ttSend({ type: 'submit', playerId: TT_TEACHER_ID, texts, lie }),
  vote: (index) => ttSend({ type: 'vote', playerId: TT_TEACHER_ID, index }),
  openVoting: () => ttSend({ type: 'vote_open' }),
  colorOf: (id) => ttColorOf(id)
};

function ttRender(){
  const gs = ttView.gs;
  if(!gs) return;

  const me = gs.participants.includes(TT_TEACHER_ID) ? TT_TEACHER_ID : null;
  ttRenderPlayer(ttEl('tt-stage'), gs, me, ttHostActions);
  ttRenderHostBar(gs);
}

function ttRenderHostBar(gs){
  const main = ttEl('tt-host-main');
  const sub = ttEl('tt-host-sub');
  main.style.display = 'inline-flex';
  main.disabled = false;
  sub.style.display = 'inline-flex';
  sub.textContent = '■ End game';

  if(gs.phase === 'writing'){
    const ready = ttReadyToStart(gs);
    main.textContent = ready ? '▶ Start the interrogation' : (gs.mode === 'duel' ? '⏳ Waiting for both players' : '⏳ Need at least 2 files');
    main.disabled = !ready;
  } else if(gs.phase === 'questions'){
    main.textContent = '⚖️ Open the vote';
  } else if(gs.phase === 'voting'){
    if(gs.mode === 'duel'){ main.style.display = 'none'; }   // the guesser's click reveals
    else main.textContent = '👀 Reveal the lie';
  } else if(gs.phase === 'reveal'){
    main.textContent = gs.current + 1 >= gs.order.length ? '🏆 Final results' : '➡ Next in the hot seat';
  } else if(gs.phase === 'final'){
    main.textContent = '🔁 Play again (same players)';
    sub.textContent = '✕ Close room';
  }
}

async function ttHostMain(){
  const gs = ttView.gs;
  if(!gs) return;
  if(gs.phase === 'writing') await ttSend({ type: 'start' });
  else if(gs.phase === 'questions') await ttSend({ type: 'vote_open' });
  else if(gs.phase === 'voting'){ const u = await ttSend({ type: 'reveal' }); if(u) ttSound('correctAnswer'); }
  else if(gs.phase === 'reveal') await ttSend({ type: 'next' });
  else if(gs.phase === 'final') await ttSend({ type: 'again' });
}

async function ttHostSub(){
  const gs = ttView.gs;
  if(!gs) return;
  if(gs.phase === 'final'){ await ttCloseRoom(); return; }
  if(!window.confirm('End the game now and show the final scores?')) return;
  await ttSend({ type: 'end' });
}

// Guarded so a double click can't skip a phase. (Submissions are allowed to interleave.)
async function ttSend(action){
  if(ttView.busy || !ttView.lobby || !ttView.gs) return null;
  ttView.busy = true;
  const expectedPhase = ttView.gs.phase;
  const expectedCurrent = ttView.gs.current;

  const updated = await window.LobbySupabase.updateGameState(ttView.lobby.id, (s) => {
    if(s.phase !== expectedPhase) return s;
    if(action.type !== 'submit' && s.current !== expectedCurrent) return s;
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

async function ttCloseRoom(){
  if(ttView.lobby && window.LobbySupabase){
    await window.LobbySupabase.endWordAssociationGame(ttView.lobby.id);
    if(ttLobbyChannel){ window.LobbySupabase.unsubscribe(ttLobbyChannel); ttLobbyChannel = null; }
    if(ttPresenceChannel){ window.LobbySupabase.unsubscribe(ttPresenceChannel); ttPresenceChannel = null; }
  }
  ttView.lobby = null;
  ttView.gs = null;
  ttView.students = [];
  ttCfg.duelA = ''; ttCfg.duelB = '';
  ttEl('tt-stage').dataset.ttKey = '';
  ttShow('setup');
}

ttShow('setup');
