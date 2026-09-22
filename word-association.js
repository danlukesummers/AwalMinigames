/* AWAL Minigames -- Word Association game logic. Only loaded on word-association.html. */

const WA_TOPICS = ["ocean","mountain","coffee","bicycle","music","holiday","garden","robot","library","weather","kitchen","airport","festival","forest","internet"];
const WA_STUDENT_COLORS = ['#B6FF3C','#FFB020','#4DD8F0','#FF6FA8','#C837E8','#39FF88'];
const WA_TEACHER_COLOR = '#FFD23F';
const WA_TEACHER_ID = 'teacher';

const waState = {
  plan: 'free',
  maxChainLength: 8,
  mode: 'teacher-student',
  topic: '',
  turnTimeLimit: 0,
  targetChainLength: 8
};

const waRoom = { students: [] };

let waLobby = null;
let waLobbyChannel = null;
let waPresenceChannel = null;
let waDashboardTimer = null;

/* ============ PLAN / MODE GATING (mirrors hgSetPlan / hgApplyPlanGating) ============ */

function waSetPlan(plan){
  waState.plan = plan;
  waState.maxChainLength = plan === 'paid' ? 30 : 8;

  document.getElementById('wa-plan-free')?.classList.toggle('active', plan === 'free');
  document.getElementById('wa-plan-paid')?.classList.toggle('active', plan === 'paid');

  const slider = document.getElementById('wa-chain-count');
  if(slider){
    slider.max = waState.maxChainLength;
    if(parseInt(slider.value, 10) > waState.maxChainLength) slider.value = waState.maxChainLength;
    waUpdateChainLength(slider.value);
  }

  waApplyPlanGating();
}

function waApplyPlanGating(){
  const isPaid = waState.plan === 'paid';
  const studentCard = document.getElementById('wa-mode-student');
  studentCard?.classList.toggle('locked', !isPaid);

  const lockNote = document.getElementById('wa-mode-lock');
  if(lockNote) lockNote.style.display = isPaid ? 'none' : 'block';

  if(!isPaid && waState.mode === 'student-student') waSetMode('teacher-student');
}

function waSetMode(mode){
  if(mode === 'student-student' && waState.plan !== 'paid'){
    const err = document.getElementById('wa-start-error');
    if(err){
      err.textContent = '👥 Student vs Student is a paid feature. Switch the demo account toggle to "Paid" to try it.';
      err.style.display = 'block';
    }
    return;
  }

  const err = document.getElementById('wa-start-error');
  if(err) err.style.display = 'none';

  waState.mode = mode;

  document.getElementById('wa-mode-teacher')?.classList.toggle('active', mode === 'teacher-student');
  document.getElementById('wa-mode-student')?.classList.toggle('active', mode === 'student-student');
}

function waRandomTopic(){
  const t = WA_TOPICS[Math.floor(Math.random() * WA_TOPICS.length)];
  const input = document.getElementById('wa-topic-input');
  if(input) input.value = t;
}

function waUpdateChainLength(v){
  waState.targetChainLength = parseInt(v, 10);
  document.getElementById('wa-chain-label').textContent = v;
}

function waUpdateTimeLimit(v){
  waState.turnTimeLimit = parseInt(v, 10) || 0;
}

/* ============ PARTICIPANTS: teacher + joined students, mode-aware ============ */

function waGetParticipants(){
  if(waState.mode === 'teacher-student'){
    return [{ id: WA_TEACHER_ID, name: 'Teacher (You)', color: WA_TEACHER_COLOR, isTeacher: true }, ...waRoom.students];
  }
  return waRoom.students;
}

// Teacher-vs-student: teacher plays every other turn, alternating with each
// student in sequence (teacher, s1, teacher, s2, teacher, s3, ...).
// Student-vs-student: plain round robin through the joined students.
function waBuildOrder(){
  if(waState.mode === 'teacher-student'){
    const seq = [];
    waRoom.students.forEach(s => { seq.push(WA_TEACHER_ID); seq.push(s.id); });
    return seq.length ? seq : [WA_TEACHER_ID];
  }
  return waRoom.students.map(s => s.id);
}

/* ============ ROOM CREATION ============ */

async function waCreateRoom(){
  const errEl = document.getElementById('wa-start-error');
  if(errEl) errEl.style.display = 'none';

  const topic = document.getElementById('wa-topic-input')?.value.trim().toLowerCase();

  if(!topic || !/^[a-z][a-z\s-]*$/.test(topic)){
    if(errEl){
      errEl.textContent = 'Enter a starting word (letters only) or hit "Random".';
      errEl.style.display = 'block';
    }
    return;
  }

  waState.topic = topic;

  document.getElementById('wa-setup').style.display = 'none';
  waOpenRoom();
}

async function waOpenRoom(){
  waRoom.students = [];

  document.getElementById('wa-room-code').textContent = '••••••';
  document.getElementById('wa-room-link').textContent = 'Creating room…';
  document.getElementById('wa-room').style.display = 'block';
  document.getElementById('wa-begin-btn').disabled = true;

  waRenderRoster();

  if(!window.LobbySupabase){
    let tries = 0;
    while(!window.LobbySupabase && tries < 40){
      await new Promise(r => setTimeout(r, 50));
      tries++;
    }
  }

  if(!window.LobbySupabase){
    document.getElementById('wa-room-link').textContent = 'Lobby client not ready. Please try again.';
    return;
  }

  const lobby = await window.LobbySupabase.createLobby('word-association', waState.turnTimeLimit);

  if(!lobby){
    document.getElementById('wa-room-link').textContent = 'Could not create the room -- check your connection and try again.';
    return;
  }

  waLobby = lobby;

  document.getElementById('wa-room-code').textContent = lobby.code;
  document.getElementById('wa-room-link').textContent = window.location.origin + '/join.html?code=' + lobby.code;

  if(waPresenceChannel) window.LobbySupabase.unsubscribe(waPresenceChannel);
  waPresenceChannel = window.LobbySupabase.watchPresence(lobby.id, waHandleStudentLeft);

  if(waLobbyChannel) window.LobbySupabase.unsubscribe(waLobbyChannel);

  waLobbyChannel = window.LobbySupabase.subscribeToLobby(lobby.id, (updatedLobby) => {
    waLobby = updatedLobby;

    const prevIds = waRoom.students.map(s => s.id);
    const newIds = (updatedLobby.players || []).map(p => p.id);

    if(newIds.some(id => !prevIds.includes(id))){
      AwalSounds.play('join');
    } else if(prevIds.some(id => !newIds.includes(id))){
      AwalSounds.play('leave');
    }

    waRoom.students = (updatedLobby.players || []).map((p, i) => ({
      id: p.id,
      name: p.name,
      color: WA_STUDENT_COLORS[i % WA_STUDENT_COLORS.length]
    }));

    if(document.getElementById('wa-room').style.display !== 'none'){
      waRenderRoster();
    } else if(updatedLobby.status === 'playing'){
      waRenderDashboard(updatedLobby);
    }
  });
}

function waCopyRoomLink(){
  const link = document.getElementById('wa-room-link').textContent;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('wa-room-copy-btn');
    if(!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }).catch(() => {});
}

function waMinStudentsNeeded(){
  // Teacher vs Student needs just 1 student (the teacher is the 2nd player).
  // Student vs Student needs 2, since the teacher isn't in the rotation.
  return waState.mode === 'teacher-student' ? 1 : 2;
}

function waRenderRoster(){
  const wrap = document.getElementById('wa-roster');
  if(!wrap) return;

  let html = '';
  const count = waRoom.students.length;
  const displayCount = Math.max(4, count);

  for(let i = 0; i < displayCount; i++){
    const student = waRoom.students[i];
    if(student){
      const initial = student.name ? student.name.charAt(0).toUpperCase() : '?';
      html += '<div class="wa-seat filled">' +
        '<div class="wa-seat-avatar" style="background:' + student.color + ';">' + initial + '</div>' +
        '<div class="wa-seat-name">' + student.name + '</div>' +
      '</div>';
    } else {
      html += '<div class="wa-seat"><div class="wa-seat-name" style="opacity:0.6;">Waiting for a player…</div></div>';
    }
  }

  wrap.innerHTML = html;

  const beginBtn = document.getElementById('wa-begin-btn');
  const minNeeded = waMinStudentsNeeded();

  if(beginBtn){
    beginBtn.disabled = count < minNeeded;
    beginBtn.textContent = count < minNeeded
      ? '▶ Need at least ' + minNeeded + ' student' + (minNeeded === 1 ? '' : 's') + ' (' + count + ' joined)'
      : '▶ Begin round (' + count + ' player' + (count === 1 ? '' : 's') + ' joined)';
  }
}

/* ============ ROUND START ============ */

async function waBeginRound(){
  if(waRoom.students.length < waMinStudentsNeeded()) return;

  document.getElementById('wa-room').style.display = 'none';
  document.getElementById('wa-dashboard').style.display = 'block';

  const order = waBuildOrder();
  const participants = waGetParticipants();

  const initialState = {
    mode: waState.mode,
    topic: waState.topic,
    order,
    turnIndex: 0,
    chain: [],
    usedWords: [waState.topic],
    scores: Object.fromEntries(participants.map(p => [p.id, 0])),
    targetChainLength: waState.targetChainLength,
    turnTimeLimit: waState.turnTimeLimit,
    ended: false
  };

  const started = await window.LobbySupabase.startWordAssociationGame(
    waLobby.id, initialState, waState.turnTimeLimit
  );

  if(started) waLobby = started;

  waRenderDashboard(waLobby);
}

/* ============ DASHBOARD RENDER ============ */

function waStopDashboardTimer(){
  if(waDashboardTimer){ clearInterval(waDashboardTimer); waDashboardTimer = null; }
}

function waFormatTime(seconds){
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins + ':' + String(secs).padStart(2, '0');
}

function waRenderDashboard(lobby){
  const state = lobby.game_state || {};
  const participants = waGetParticipants();
  const order = state.order || [];
  const currentId = order[state.turnIndex];
  const currentPlayer = participants.find(p => p.id === currentId);
  const lastWord = state.chain && state.chain.length
    ? state.chain[state.chain.length - 1].word
    : state.topic;

  document.getElementById('wa-dash-progress').textContent =
    (state.chain ? state.chain.length : 0) + ' / ' + (state.targetChainLength || 0) + ' words';

  document.getElementById('wa-current-word').textContent = (lastWord || '–').toUpperCase();

  const turnBanner = document.getElementById('wa-turn-banner');
  if(turnBanner){
    turnBanner.textContent = currentPlayer ? currentPlayer.name + "'s turn" : '–';
    turnBanner.style.color = currentPlayer ? currentPlayer.color : '';
  }

  // Teacher's own turn is played right here on the dashboard.
  const teacherInputWrap = document.getElementById('wa-teacher-input-wrap');
  if(teacherInputWrap){
    const isTeacherTurn = !state.ended && currentId === WA_TEACHER_ID;
    teacherInputWrap.style.display = isTeacherTurn ? 'block' : 'none';
    if(isTeacherTurn){
      const input = document.getElementById('wa-teacher-word-input');
      if(input && document.activeElement !== input) input.value = '';
      const errEl = document.getElementById('wa-teacher-error');
      if(errEl) errEl.style.display = 'none';
    }
  }

  const chainWrap = document.getElementById('wa-chain-list');
  if(chainWrap){
    chainWrap.innerHTML = (state.chain || []).slice().reverse().map(link => {
      const player = participants.find(p => p.id === link.playerId);
      const color = player ? player.color : 'var(--ink-soft)';
      const label = link.skipped ? '<em>(skipped)</em>' : link.word;
      return '<div class="wa-chain-item"><span class="wa-chain-dot" style="background:' + color + ';"></span>' +
        '<span class="wa-chain-name">' + (player ? player.name : '?') + '</span>' +
        '<span class="wa-chain-word">' + label + '</span></div>';
    }).join('') || '<p style="color:var(--ink-soft); font-size:13px;">No words yet — waiting on the first turn.</p>';
  }

  const scoreWrap = document.getElementById('wa-scoreboard');
  if(scoreWrap){
    const rows = participants
      .map(p => ({ ...p, score: (state.scores && state.scores[p.id]) || 0 }))
      .sort((a, b) => b.score - a.score);

    scoreWrap.innerHTML = rows.map(p =>
      '<div class="wa-score-row"><span class="wa-score-dot" style="background:' + p.color + ';"></span>' +
      '<span class="wa-score-name">' + p.name + '</span><span class="wa-score-num">' + p.score + '</span></div>'
    ).join('');
  }

  const nextBtn = document.getElementById('wa-next-round-btn');
  const skipBtn = document.getElementById('wa-skip-btn');

  if(state.ended){
    waStopDashboardTimer();
    if(nextBtn) nextBtn.style.display = 'inline-flex';
    if(skipBtn) skipBtn.disabled = true;
  } else {
    if(nextBtn) nextBtn.style.display = 'none';
    if(skipBtn) skipBtn.disabled = false;
    waStartDashboardTimer(lobby);
  }
}

function waStartDashboardTimer(lobby){
  waStopDashboardTimer();

  const state = lobby.game_state || {};
  const timerEl = document.getElementById('wa-dash-timer');
  const limit = Number(lobby.time_limit || state.turnTimeLimit || 0);
  const startedAt = lobby.round_started_at;

  if(!timerEl) return;

  if(!limit || !startedAt){
    timerEl.textContent = 'No time limit';
    timerEl.style.color = '';
    return;
  }

  let handledThisTurn = false;

  const tick = () => {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const remaining = Math.max(0, limit - elapsed);

    timerEl.textContent = '⏱ ' + waFormatTime(remaining);
    timerEl.style.color = remaining <= 5 ? 'var(--wa-hot)' : '';

    if(remaining <= 0 && !handledThisTurn){
      handledThisTurn = true;
      waStopDashboardTimer();
      waSkipTurn(true);
    }
  };

  tick();
  waDashboardTimer = setInterval(tick, 250);
}

/* ============ TEACHER SUBMITTING THEIR OWN TURN ============ */

async function waSubmitTeacherWord(){
  const input = document.getElementById('wa-teacher-word-input');
  const errEl = document.getElementById('wa-teacher-error');
  const btn = document.getElementById('wa-teacher-submit-btn');
  const word = input ? input.value.trim().toLowerCase() : '';

  if(errEl) errEl.style.display = 'none';

  if(!word || !/^[a-z][a-z\s-]*$/.test(word)){
    if(errEl){ errEl.textContent = 'Enter a single word (letters only).'; errEl.style.display = 'block'; }
    return;
  }

  const state = waLobby.game_state || {};

  if((state.usedWords || []).includes(word)){
    if(errEl){ errEl.textContent = 'That word has already been used — try another.'; errEl.style.display = 'block'; }
    return;
  }

  if(btn) btn.disabled = true;

  const updated = await window.LobbySupabase.updateGameState(waLobby.id, (s) => {
    if(s.ended) return s;
    const order = s.order || [];
    if(order[s.turnIndex] !== WA_TEACHER_ID) return s;

    const newChain = [...(s.chain || []), { playerId: WA_TEACHER_ID, playerName: 'Teacher', word, ts: Date.now() }];

    return {
      ...s,
      chain: newChain,
      usedWords: [...(s.usedWords || []), word],
      scores: { ...(s.scores || {}), [WA_TEACHER_ID]: ((s.scores && s.scores[WA_TEACHER_ID]) || 0) + 1 },
      turnIndex: (s.turnIndex + 1) % order.length,
      ended: newChain.length >= s.targetChainLength
    };
  });

  if(updated){
    waLobby = updated;
    AwalSounds.play('correctLetter');
    waRenderDashboard(updated);
  } else if(btn){
    btn.disabled = false;
  }
}

/* ============ SKIP / END ============ */

async function waSkipTurn(auto){
  if(!waLobby) return;
  const state = waLobby.game_state || {};
  if(state.ended) return;

  const updated = await window.LobbySupabase.updateGameState(waLobby.id, (s) => {
    if(s.ended) return s;
    const order = s.order || [];
    const currentId = order[s.turnIndex];
    const newChain = [...(s.chain || []), { playerId: currentId, word: null, skipped: true, ts: Date.now() }];
    return {
      ...s,
      chain: newChain,
      turnIndex: (s.turnIndex + 1) % order.length,
      ended: newChain.length >= s.targetChainLength
    };
  });

  if(updated){
    waLobby = updated;
    AwalSounds.play(auto ? 'incorrectAnswer' : 'leave');
    waRenderDashboard(waLobby);
  }
}

async function waEndRound(){
  waStopDashboardTimer();

  if(waLobby){
    const ended = await window.LobbySupabase.endWordAssociationGame(waLobby.id);
    if(ended) waLobby = ended;
  }

  document.getElementById('wa-dashboard').style.display = 'none';
  document.getElementById('wa-summary').style.display = 'block';

  const state = waLobby.game_state || {};
  const participants = waGetParticipants();
  const rows = participants
    .map(p => ({ ...p, score: (state.scores && state.scores[p.id]) || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = rows[0];

  document.getElementById('wa-summary-line').innerHTML = winner
    ? '<strong>' + winner.name + '</strong> kept the chain going the longest, with <strong>' + winner.score + '</strong> word' + (winner.score === 1 ? '' : 's') + '.'
    : 'Round complete!';

  document.getElementById('wa-summary-board').innerHTML = rows.map((p, i) =>
    '<div class="wa-score-row"><span class="wa-score-dot" style="background:' + p.color + ';"></span>' +
    '<span class="wa-score-name">' + (i + 1) + '. ' + p.name + '</span><span class="wa-score-num">' + p.score + '</span></div>'
  ).join('');

  if(waLobbyChannel){ window.LobbySupabase.unsubscribe(waLobbyChannel); waLobbyChannel = null; }
}

function waHandleStudentLeft(playerId){
  setTimeout(async () => {
    if(!waLobby || !window.LobbySupabase) return;
    if(waLobby.status !== 'waiting') return;
    if(window.LobbySupabase.isPresent(waPresenceChannel, playerId)) return;
    await window.LobbySupabase.leaveLobby(waLobby.id, playerId);
  }, 4000);
}

function waResetToSetup(){
  waStopDashboardTimer();

  document.getElementById('wa-room').style.display = 'none';
  document.getElementById('wa-dashboard').style.display = 'none';
  document.getElementById('wa-summary').style.display = 'none';

  if(waLobbyChannel && window.LobbySupabase){ window.LobbySupabase.unsubscribe(waLobbyChannel); waLobbyChannel = null; }
  if(waPresenceChannel && window.LobbySupabase){ window.LobbySupabase.unsubscribe(waPresenceChannel); waPresenceChannel = null; }

  waLobby = null;
  document.getElementById('wa-setup').style.display = 'block';
}
