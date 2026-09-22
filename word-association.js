/* AWAL Minigames -- Word Association game logic. Only loaded on word-association.html. */

const WA_TOPICS = ["ocean","mountain","coffee","bicycle","music","holiday","garden","robot","library","weather","kitchen","airport","festival","forest","internet"];
const WA_STUDENT_COLORS = ['#B6FF3C','#FFB020','#4DD8F0','#FF6FA8','#C837E8','#39FF88'];

const waState = {
  topic: '',
  turnTimeLimit: 0,
  targetChainLength: 10
};

const waRoom = { students: [] };

let waLobby = null;
let waLobbyChannel = null;
let waPresenceChannel = null;
let waDashboardTimer = null;

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
  if(beginBtn){
    beginBtn.disabled = count < 2;
    beginBtn.textContent = count < 2
      ? '▶ Need at least 2 players (' + count + ' joined)'
      : '▶ Begin round (' + count + ' players joined)';
  }
}

async function waBeginRound(){
  if(waRoom.students.length < 2) return;

  document.getElementById('wa-room').style.display = 'none';
  document.getElementById('wa-dashboard').style.display = 'block';

  const initialState = {
    topic: waState.topic,
    order: waRoom.students.map(s => s.id),
    turnIndex: 0,
    chain: [],
    usedWords: [waState.topic],
    scores: Object.fromEntries(waRoom.students.map(s => [s.id, 0])),
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
  const students = waRoom.students;
  const order = state.order || [];
  const currentId = order[state.turnIndex];
  const currentPlayer = students.find(s => s.id === currentId);
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

  const chainWrap = document.getElementById('wa-chain-list');
  if(chainWrap){
    chainWrap.innerHTML = (state.chain || []).slice().reverse().map(link => {
      const player = students.find(s => s.id === link.playerId);
      const color = player ? player.color : 'var(--ink-soft)';
      const label = link.skipped ? '<em>(skipped)</em>' : link.word;
      return '<div class="wa-chain-item"><span class="wa-chain-dot" style="background:' + color + ';"></span>' +
        '<span class="wa-chain-name">' + (player ? player.name : '?') + '</span>' +
        '<span class="wa-chain-word">' + label + '</span></div>';
    }).join('') || '<p style="color:var(--ink-soft); font-size:13px;">No words yet — waiting on the first turn.</p>';
  }

  const scoreWrap = document.getElementById('wa-scoreboard');
  if(scoreWrap){
    const rows = students
      .map(s => ({ ...s, score: (state.scores && state.scores[s.id]) || 0 }))
      .sort((a, b) => b.score - a.score);

    scoreWrap.innerHTML = rows.map(s =>
      '<div class="wa-score-row"><span class="wa-score-dot" style="background:' + s.color + ';"></span>' +
      '<span class="wa-score-name">' + s.name + '</span><span class="wa-score-num">' + s.score + '</span></div>'
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
  const rows = waRoom.students
    .map(s => ({ ...s, score: (state.scores && state.scores[s.id]) || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = rows[0];

  document.getElementById('wa-summary-line').innerHTML = winner
    ? '<strong>' + winner.name + '</strong> kept the chain going the longest, with <strong>' + winner.score + '</strong> word' + (winner.score === 1 ? '' : 's') + '.'
    : 'Round complete!';

  document.getElementById('wa-summary-board').innerHTML = rows.map((s, i) =>
    '<div class="wa-score-row"><span class="wa-score-dot" style="background:' + s.color + ';"></span>' +
    '<span class="wa-score-name">' + (i + 1) + '. ' + s.name + '</span><span class="wa-score-num">' + s.score + '</span></div>'
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
