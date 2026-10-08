/* AWAL Minigames -- Two Truths and One Lie: shared rules + shared player UI.
   Loaded by BOTH two-truths.html (teacher) and join.html (students).

   THEME: "The Interrogation Room" -- case-file exhibits, a polygraph strip and TRUE / LIE stamps.

   MODES
     class : every student tells once; the rest of the class clicks the lie. Teacher hosts.
     duel  : head to head -- Teacher vs a student, or Student vs student. Both tell once;
             the other player clicks the lie.
   INPUT
     written : players type their three statements.
     spoken  : players tap the mic and the browser transcribes what they say (Web Speech API);
               they can fix the text before submitting.

   PHASES: writing -> questions -> voting -> reveal -> (next teller) -> final   ('again' restarts)
   SCORING: +1 for each guesser who clicks the lie; the teller gets +1 for each guesser fooled. */

const TT_MAX_LEN = 140;
const TT_LETTERS = ['A', 'B', 'C'];
const TT_TEACHER_ID = 'teacher';

function ttShuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ttEsc(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ======================= RULES ======================= */

// opts: { mode:'class'|'duel', input:'written'|'spoken', speechLang, players:[{id,name}], duel:[idA,idB] }
function ttNewState(opts){
  const names = {}, scores = {};
  opts.players.forEach(p => { names[p.id] = p.name; scores[p.id] = 0; });
  const mode = opts.mode === 'duel' ? 'duel' : 'class';
  const participants = mode === 'duel' ? opts.duel.slice(0, 2) : opts.players.map(p => p.id);
  return {
    game: 'two-truths',
    version: 2,
    mode,
    input: opts.input === 'spoken' ? 'spoken' : 'written',
    speechLang: opts.speechLang || 'en-US',
    phase: 'writing',
    names,
    scores,
    participants,         // who writes statements (class: all students, duel: the two duelists)
    submissions: {},      // playerId -> { texts:[3], lie:0..2 }
    order: [],            // teller order
    current: 0,
    display: null,        // { texts:[3 shuffled], lie } for the current teller
    votes: {},            // guesserId -> clicked index
    results: [],          // { teller, texts, lie, correct:[ids], fooled:[ids] }
    ended: false
  };
}

function ttCleanTexts(texts){
  if(!Array.isArray(texts) || texts.length !== 3) return null;
  const clean = texts.map(t => String(t || '').trim().replace(/\s+/g, ' ').slice(0, TT_MAX_LEN));
  return clean.every(t => t.length > 0) ? clean : null;
}

function ttBuildDisplay(sub){
  const order = ttShuffle([0, 1, 2]);
  return { texts: order.map(i => sub.texts[i]), lie: order.indexOf(sub.lie) };
}

function ttStoryteller(state){ return state.order[state.current]; }

// Guessers = everyone who can click the lie this round.
function ttVoterIds(state){
  const pool = state.mode === 'duel' ? state.participants : Object.keys(state.names);
  return pool.filter(id => id !== ttStoryteller(state));
}

function ttReadyToStart(state){
  if(state.mode === 'duel') return state.participants.every(id => !!state.submissions[id]);
  return Object.keys(state.submissions).length >= 2;
}

function ttDoReveal(s){
  const teller = ttStoryteller(s);
  const correct = [], fooled = [];
  Object.keys(s.votes).forEach(v => { (s.votes[v] === s.display.lie ? correct : fooled).push(v); });
  correct.forEach(v => { s.scores[v] = (s.scores[v] || 0) + 1; });
  s.scores[teller] = (s.scores[teller] || 0) + fooled.length;
  s.results.push({ teller, texts: s.display.texts, lie: s.display.lie, correct, fooled });
  s.phase = 'reveal';
}

// action: {type:'submit', playerId, texts, lie} | {type:'start'} | {type:'vote_open'}
//       | {type:'vote', playerId, index} | {type:'reveal'} | {type:'next'} | {type:'again'} | {type:'end'}
function ttApply(state, action){
  const s = {
    ...state,
    submissions: { ...state.submissions },
    votes: { ...state.votes },
    scores: { ...state.scores },
    results: [...state.results]
  };

  switch(action.type){
    case 'submit': {
      if(s.phase !== 'writing' || !s.participants.includes(action.playerId)) return state;
      const texts = ttCleanTexts(action.texts);
      const lie = Number(action.lie);
      if(!texts || ![0, 1, 2].includes(lie)) return state;
      s.submissions[action.playerId] = { texts, lie };
      return s;
    }
    case 'start': {
      if(s.phase !== 'writing' || !ttReadyToStart(s)) return state;
      s.order = ttShuffle(Object.keys(s.submissions));
      s.current = 0;
      s.display = ttBuildDisplay(s.submissions[s.order[0]]);
      s.votes = {};
      s.phase = 'questions';
      return s;
    }
    case 'vote_open': {
      if(s.phase !== 'questions') return state;
      s.phase = 'voting';
      return s;
    }
    case 'vote': {
      if(s.phase !== 'voting') return state;
      const idx = Number(action.index);
      if(![0, 1, 2].includes(idx)) return state;
      if(!ttVoterIds(s).includes(action.playerId)) return state;
      s.votes[action.playerId] = idx;
      // Head to head: the guesser's click is the answer -- reveal straight away.
      if(s.mode === 'duel' && ttVoterIds(s).every(id => s.votes[id] !== undefined)) ttDoReveal(s);
      return s;
    }
    case 'reveal': {
      if(s.phase !== 'voting' && s.phase !== 'questions') return state;
      ttDoReveal(s);
      return s;
    }
    case 'next': {
      if(s.phase !== 'reveal') return state;
      if(s.current + 1 < s.order.length){
        s.current++;
        s.display = ttBuildDisplay(s.submissions[s.order[s.current]]);
        s.votes = {};
        s.phase = 'questions';
      } else {
        s.phase = 'final';
        s.ended = true;
      }
      return s;
    }
    case 'again': {          // same players, fresh statements, scores carry over
      if(s.phase !== 'final') return state;
      s.phase = 'writing';
      s.submissions = {};
      s.order = [];
      s.current = 0;
      s.display = null;
      s.votes = {};
      s.results = [];
      s.ended = false;
      return s;
    }
    case 'end': {
      if(s.phase === 'final') return state;
      s.phase = 'final';
      s.ended = true;
      return s;
    }
    default:
      return state;
  }
}

function ttLeaderboard(state){
  const ids = state.mode === 'duel' ? state.participants : Object.keys(state.names);
  return ids
    .map(id => ({ id, name: state.names[id], score: state.scores[id] || 0 }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
}

/* ======================= SPEECH TRANSCRIPTION ======================= */

let ttRec = null, ttRecIdx = null;

function ttMicSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

function ttSetMicStatus(msg, bad){
  const el = document.getElementById('tt-mic-status');
  if(!el) return;
  el.textContent = msg || '';
  el.style.color = bad ? '#FF6B6B' : '#B9AD93';
}

function ttStopDictation(){
  if(ttRec){ try { ttRec.onend = null; ttRec.stop(); } catch(e) {} }
  ttRec = null; ttRecIdx = null;
}

function ttDictate(i){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    ttSetMicStatus("This browser can't transcribe speech. Please type instead (Chrome, Edge and Safari work).", true);
    return;
  }
  const wasSame = (ttRecIdx === i);
  if(ttRec){
    const btnOld = document.getElementById('tt-mic-' + ttRecIdx);
    if(btnOld) btnOld.classList.remove('listening');
    ttStopDictation();
    if(wasSame){ ttSetMicStatus(''); return; }   // tapping the mic again = stop
  }

  const lang = (window.__ttLast && window.__ttLast.gs && window.__ttLast.gs.speechLang) || 'en-US';
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  const input = document.getElementById('tt-in-' + i);
  const btn = document.getElementById('tt-mic-' + i);

  rec.onstart = () => { if(btn) btn.classList.add('listening'); ttSetMicStatus('🎙 Listening… say your statement'); };
  rec.onresult = (e) => {
    let text = '';
    for(let k = 0; k < e.results.length; k++) text += e.results[k][0].transcript;
    text = text.trim();
    if(input && text) input.value = (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, TT_MAX_LEN);
  };
  rec.onerror = (e) => {
    const map = {
      'not-allowed': 'Microphone is blocked. Allow the microphone for this site, or type instead.',
      'service-not-allowed': 'Microphone is blocked. Allow the microphone for this site, or type instead.',
      'no-speech': "I didn't hear anything. Tap the mic and try again.",
      'audio-capture': 'No microphone found. Please type instead.',
      'network': 'Transcription needs an internet connection.'
    };
    ttSetMicStatus(map[e.error] || 'Transcription stopped. Tap the mic to try again.', true);
  };
  rec.onend = () => {
    if(btn) btn.classList.remove('listening');
    ttRec = null; ttRecIdx = null;
    const el = document.getElementById('tt-mic-status');
    if(el && el.textContent.indexOf('Listening') !== -1) ttSetMicStatus('✓ Check the text — you can edit it before submitting.');
  };

  ttRec = rec; ttRecIdx = i;
  try { rec.start(); } catch(e) { ttSetMicStatus('Could not start the microphone. Tap the mic again.', true); }
}

/* ======================= STYLES (injected once; used by both pages) ======================= */

function ttInjectStyles(){
  if(typeof document === 'undefined' || document.getElementById('tt-shared-styles')) return;

  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap';
  document.head.appendChild(font);

  const st = document.createElement('style');
  st.id = 'tt-shared-styles';
  st.textContent = `
    .tt-stage{background:radial-gradient(ellipse at 50% -15%, rgba(255,176,32,0.24), transparent 62%), #14110F; border:2px solid #3A3027; border-radius:18px; padding:22px 20px; color:#EFE6D0; font-family:'Space Grotesk',sans-serif; text-align:left;}
    .tt-stage *{box-sizing:border-box;}
    .tt-kicker{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:0.16em; color:#FFB020; font-weight:700; text-transform:uppercase;}
    .tt-title{font-family:'Bungee',sans-serif; font-size:24px; color:#F3E9D2; margin:4px 0 6px; line-height:1.15;}
    .tt-sub{color:#B9AD93; font-size:14px; line-height:1.5; margin-bottom:12px;}
    .tt-sub b, .tt-sub strong{color:#F3E9D2;}

    .tt-poly{position:relative; margin:12px 0 4px; border:1px solid #3A3027; border-radius:8px; background:rgba(255,176,32,0.05); overflow:hidden;}
    .tt-poly svg{display:block; width:100%; height:40px;}
    .tt-poly polyline{fill:none; stroke:#FFB020; stroke-width:2; vector-effect:non-scaling-stroke; stroke-linejoin:round;}
    .tt-poly-g{animation:ttScan 2.6s linear infinite;}
    .tt-poly-label{position:absolute; top:5px; left:10px; font-family:'Space Mono',monospace; font-size:9.5px; letter-spacing:0.14em; color:#FFB020; font-weight:700; background:#14110F; padding:1px 6px; border-radius:4px; z-index:1;}
    @keyframes ttScan{to{transform:translateX(-200px);}}

    .tt-ex-list{display:flex; flex-direction:column; gap:16px; margin:20px 0 12px;}
    .tt-ex{position:relative; background:#F3E9D2; color:#1B1A17; border-radius:4px; padding:17px 20px 18px; font-family:'Special Elite','Courier New',monospace; font-size:18px; line-height:1.4; box-shadow:0 8px 18px rgba(0,0,0,0.5); background-image:repeating-linear-gradient(transparent, transparent 27px, rgba(0,0,0,0.055) 28px); min-height:76px;}
    .tt-ex:nth-child(1){transform:rotate(-0.7deg);} .tt-ex:nth-child(2){transform:rotate(0.6deg);} .tt-ex:nth-child(3){transform:rotate(-0.4deg);}
    .tt-ex::before{content:''; position:absolute; top:-9px; left:50%; width:74px; height:18px; transform:translateX(-50%) rotate(-2deg); background:rgba(255,176,32,0.6); border-radius:2px;}
    .tt-ex-tab{font-family:'Space Mono',monospace; font-weight:800; font-size:11px; letter-spacing:0.16em; color:#8A6D2B; margin-bottom:6px;}
    .tt-ex-text{padding-right:70px; word-break:break-word;}
    .tt-ex-votes{position:absolute; right:16px; top:14px; font-family:'Space Mono',monospace; font-size:11.5px; font-weight:800; color:#6B5A30;}
    .tt-ex.pick{cursor:pointer; transition:transform .12s ease, box-shadow .12s ease;}
    .tt-ex.pick:hover{transform:translateY(-3px) rotate(0deg); box-shadow:0 0 0 3px #FFB020, 0 12px 22px rgba(0,0,0,0.55);}
    .tt-ex.selected{box-shadow:0 0 0 4px #FFB020, 0 0 26px rgba(255,176,32,0.65);}
    .tt-ex.selected .tt-ex-tab::after{content:'  ◉ ACCUSED'; color:#D7263D;}
    .tt-ex.mine-lie{outline:3px dashed #D7263D; outline-offset:3px;}
    .tt-ex.lie-card{animation:ttShake .45s .35s;}
    .tt-stamp{position:absolute; right:14px; bottom:10px; font-family:'Bungee',sans-serif; font-size:26px; padding:1px 12px; border:4px double; border-radius:6px; transform:rotate(-12deg); animation:ttStamp .5s cubic-bezier(.2,1.6,.4,1) both; mix-blend-mode:multiply;}
    .tt-stamp.truth{color:#23814A; border-color:#23814A;} .tt-stamp.lie{color:#D7263D; border-color:#D7263D;}
    @keyframes ttStamp{from{transform:rotate(-12deg) scale(2.6); opacity:0;} to{transform:rotate(-12deg) scale(1); opacity:0.92;}}
    @keyframes ttShake{0%,100%{translate:0 0;} 25%{translate:-6px 0;} 50%{translate:6px 0;} 75%{translate:-4px 0;}}

    .tt-btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; background:#FFB020; color:#14110F; border:none; border-radius:10px; padding:13px 22px; font-family:'Space Mono',monospace; font-weight:800; font-size:13.5px; letter-spacing:0.04em; text-transform:uppercase; cursor:pointer; transition:transform .1s ease, filter .1s ease;}
    .tt-btn:hover:not(:disabled){transform:translateY(-1px); filter:brightness(1.08);}
    .tt-btn:disabled{opacity:0.4; cursor:not-allowed;}
    .tt-btn.ghost{background:transparent; color:#FFB020; border:2px solid #FFB020;}
    .tt-btn.red{background:#D7263D; color:#fff;}
    .tt-btn.block{width:100%;}
    .tt-actions{display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;}

    .tt-row{display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:rgba(243,233,210,0.06); border:1px solid #3A3027; border-radius:12px; padding:12px; margin-bottom:12px;}
    .tt-row-label{font-family:'Space Mono',monospace; font-weight:800; font-size:11px; letter-spacing:0.14em; color:#FFB020; width:78px; flex-shrink:0;}
    .tt-row-main{display:flex; gap:8px; align-items:center; flex:1; min-width:200px;}
    .tt-row input[type=text]{flex:1; min-width:0; padding:12px 14px; border-radius:10px; border:2px solid #4A3F33; background:#F3E9D2; color:#1B1A17; font-family:'Special Elite','Courier New',monospace; font-size:16px;}
    .tt-row input[type=text]:focus{outline:none; border-color:#FFB020; box-shadow:0 0 0 3px rgba(255,176,32,0.3);}
    .tt-mic{width:46px; height:46px; flex-shrink:0; border-radius:50%; border:2px solid #FFB020; background:transparent; color:#FFB020; font-size:20px; cursor:pointer;}
    .tt-mic.listening{background:#D7263D; border-color:#D7263D; color:#fff; animation:ttPulse 1s ease-in-out infinite;}
    @keyframes ttPulse{0%,100%{box-shadow:0 0 0 0 rgba(215,38,61,0.6);} 50%{box-shadow:0 0 0 10px rgba(215,38,61,0);}}
    .tt-lie-toggle{display:flex; align-items:center; cursor:pointer; flex-shrink:0;}
    .tt-lie-toggle input{position:absolute; opacity:0; pointer-events:none;}
    .tt-lie-toggle span{font-family:'Bungee',sans-serif; font-size:13px; padding:7px 12px; border:3px double #6B5A44; border-radius:6px; color:#6B5A44; transition:all .15s ease;}
    .tt-lie-toggle input:checked + span{color:#D7263D; border-color:#D7263D; background:rgba(215,38,61,0.12); transform:rotate(-4deg);}
    .tt-error{color:#FF6B6B; font-size:13px; margin:2px 0 8px; display:none;}
    .tt-mic-status{font-family:'Space Mono',monospace; font-size:12px; color:#B9AD93; min-height:18px; margin:2px 0 10px;}

    .tt-chips{display:flex; flex-wrap:wrap; gap:10px; margin:14px 0;}
    .tt-chip{display:flex; align-items:center; gap:8px; border:2px solid #4A3F33; border-radius:999px; padding:7px 14px; font-weight:700; font-size:14px; color:#B9AD93;}
    .tt-chip.done{border-color:#23814A; color:#7FE3A5; background:rgba(35,129,74,0.15);}
    .tt-chip .tt-mark{font-family:'Space Mono',monospace;}

    .tt-result{margin-top:14px; padding:14px 16px; border-radius:12px; font-weight:700; font-size:15.5px; text-align:center;}
    .tt-result.good{background:rgba(35,129,74,0.2); color:#7FE3A5; border:1px solid #23814A;}
    .tt-result.bad{background:rgba(215,38,61,0.18); color:#FF8A96; border:1px solid #D7263D;}
    .tt-result.info{background:rgba(243,233,210,0.08); color:#E6DCC4; border:1px solid #3A3027;}

    .tt-score{display:flex; flex-direction:column; gap:8px; margin-top:6px;}
    .tt-score-row{display:flex; align-items:center; gap:10px; background:rgba(243,233,210,0.07); border:1px solid #3A3027; border-radius:10px; padding:10px 14px; font-size:14px;}
    .tt-dot{width:10px; height:10px; border-radius:50%; flex-shrink:0;}
    .tt-score-name{font-weight:700; color:#F3E9D2;}
    .tt-score-num{margin-left:auto; font-family:'Space Mono',monospace; font-weight:800; color:#FFB020; font-size:16px;}
    .tt-block-label{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:0.14em; color:#FFB020; font-weight:700; margin:22px 0 4px; text-transform:uppercase;}
  `;
  document.head.appendChild(st);
}
ttInjectStyles();

/* ======================= SHARED PLAYER / STAGE UI ======================= */

function ttPolygraphHTML(label){
  const unit = [[0,20],[18,20],[26,5],[36,35],[46,20],[80,20],[90,12],[100,28],[110,20],[200,20]];
  const pts = [];
  for(let k = 0; k < 4; k++) unit.forEach(p => pts.push((p[0] + k * 200) + ',' + p[1]));
  return '<div class="tt-poly"><span class="tt-poly-label">' + label + '</span>' +
    '<svg viewBox="0 0 400 40" preserveAspectRatio="none"><g class="tt-poly-g"><polyline points="' + pts.join(' ') + '"/></g></svg></div>';
}

// o: { revealed, pick, selected, myLie }
function ttExhibitsHTML(gs, o){
  o = o || {};
  const d = gs.display;
  const tally = [0, 0, 0];
  Object.values(gs.votes || {}).forEach(v => { if(tally[v] !== undefined) tally[v]++; });

  return '<div class="tt-ex-list">' + d.texts.map((text, i) => {
    let cls = 'tt-ex', extra = '', attrs = '';
    if(o.revealed){
      const isLie = i === d.lie;
      if(isLie) cls += ' lie-card';
      extra = '<div class="tt-ex-votes">' + tally[i] + ' vote' + (tally[i] === 1 ? '' : 's') + '</div>' +
              '<div class="tt-stamp ' + (isLie ? 'lie' : 'truth') + '">' + (isLie ? 'LIE' : 'TRUE') + '</div>';
    } else {
      if(o.pick){ cls += ' pick'; attrs = ' onclick="ttPick(' + i + ')"'; }
      if(o.selected === i) cls += ' selected';
      if(o.myLie === i){ cls += ' mine-lie'; extra = '<div class="tt-ex-votes" style="color:#D7263D;">YOUR LIE</div>'; }
    }
    return '<div class="' + cls + '"' + attrs + '><div class="tt-ex-tab">EXHIBIT ' + TT_LETTERS[i] + '</div>' +
           '<div class="tt-ex-text">' + ttEsc(text) + '</div>' + extra + '</div>';
  }).join('') + '</div>';
}

function ttScoreboardHTML(gs, colorOf){
  return '<div class="tt-score">' + ttLeaderboard(gs).map(p =>
    '<div class="tt-score-row"><span class="tt-dot" style="background:' + colorOf(p.id) + ';"></span>' +
    '<span class="tt-score-name">' + ttEsc(p.name) + '</span><span class="tt-score-num">' + p.score + '</span></div>'
  ).join('') + '</div>';
}

// el: container. me: the viewing player's id, or null for the host/projector view.
// A (actions): { submit(texts, lie), vote(index), openVoting(), colorOf(id) }
function ttRenderPlayer(el, gs, me, A){
  A = A || {};
  window.__ttLast = { el, gs, me, A };

  const colorOf = A.colorOf || (() => '#FFB020');
  const nameOf = (id) => (gs.names && gs.names[id]) || 'a player';
  const isParticipant = !!me && gs.participants.includes(me);
  const spoken = gs.input === 'spoken';
  let html = '';

  if(gs.phase !== 'writing'){ ttStopDictation(); el._ttEditing = false; }

  /* ---------- writing ---------- */
  if(gs.phase === 'writing'){
    const mine = me ? gs.submissions[me] : null;
    const showForm = isParticipant && (!mine || el._ttEditing);
    const key = 'writing:' + (me || 'host') + ':' + (showForm ? 'form' : (isParticipant ? 'done' : 'watch'));
    if(showForm && el.dataset.ttKey === key) return;          // never wipe what someone is typing
    el.dataset.ttKey = key;

    if(showForm){
      const pre = mine || { texts: ['', '', ''], lie: -1 };
      html += '<div class="tt-kicker">Case file · new subject</div>';
      html += '<div class="tt-title">' + (spoken ? 'Say 2 truths and 1 lie' : 'Write 2 truths and 1 lie') + '</div>';
      html += '<p class="tt-sub">' + (spoken
        ? 'Tap the <b>🎙 mic</b> next to each exhibit and say a statement about yourself. We\'ll type it for you — fix any mistakes. Then mark <b>THE LIE</b>.'
        : 'Write three things about yourself. Mark which one is <b>THE LIE</b>. Make it hard to spot!') + '</p>';
      if(spoken) html += '<div class="tt-mic-status" id="tt-mic-status">' + (ttMicSupported() ? '' : "This browser can't transcribe speech — please type your statements (Chrome, Edge and Safari work).") + '</div>';
      html += [0, 1, 2].map(i =>
        '<div class="tt-row"><div class="tt-row-label">EXHIBIT ' + TT_LETTERS[i] + '</div>' +
        '<div class="tt-row-main"><input type="text" id="tt-in-' + i + '" maxlength="' + TT_MAX_LEN + '" placeholder="' + (spoken ? 'Tap the mic and speak…' : 'Statement ' + (i + 1)) + '" autocomplete="off" value="' + ttEsc(pre.texts[i]) + '">' +
        (spoken ? '<button type="button" class="tt-mic" id="tt-mic-' + i + '" onclick="ttDictate(' + i + ')" title="Speak this statement">🎙</button>' : '') + '</div>' +
        '<label class="tt-lie-toggle"><input type="radio" name="tt-lie" value="' + i + '"' + (pre.lie === i ? ' checked' : '') + '><span>THE LIE</span></label></div>'
      ).join('');
      html += '<div class="tt-error" id="tt-form-err"></div>';
      html += '<button class="tt-btn block" id="tt-form-submit" onclick="ttFormSubmit()">🗂 File my statements</button>';
    } else if(isParticipant){
      html += '<div class="tt-kicker">File submitted ✓</div><div class="tt-title">You\'re all set</div>';
      html += '<p class="tt-sub">Waiting for ' + (gs.mode === 'duel' ? 'your opponent' : 'the others') + '…</p>';
      html += ttReadyChipsHTML(gs);
      html += '<div class="tt-actions"><button class="tt-btn ghost" onclick="ttEditSubmission()">✏️ Edit my statements</button></div>';
    } else {
      html += '<div class="tt-kicker">The case files are being prepared</div><div class="tt-title">' + (gs.mode === 'duel' ? 'Head to head' : 'Everyone is writing') + '</div>';
      html += '<p class="tt-sub">' + (gs.mode === 'duel'
        ? ttEsc(gs.participants.map(nameOf).join(' vs ')) + ' are getting ready.'
        : 'Students are ' + (spoken ? 'recording' : 'writing') + ' their statements.') + '</p>';
      html += ttReadyChipsHTML(gs);
    }
    el.innerHTML = html;
    return;
  }

  el.dataset.ttKey = '';

  /* ---------- final ---------- */
  if(gs.phase === 'final'){
    const board = ttLeaderboard(gs);
    const top = board[0];
    const draw = board.length > 1 && board[0].score === board[1].score;
    html += '<div class="tt-kicker">Case closed</div><div class="tt-title">' + (draw ? "It's a draw!" : (top ? ttEsc(top.name) + ' wins!' : 'Game over')) + '</div>';
    if(me && !draw && top){
      html += '<p class="tt-sub">' + (top.id === me ? '🏆 You cracked the case.' : 'Great game — you finished #' + (board.findIndex(p => p.id === me) + 1) + '.') + '</p>';
    }
    html += ttScoreboardHTML(gs, colorOf);
    el.innerHTML = html;
    return;
  }

  /* ---------- questions / voting / reveal ---------- */
  const teller = ttStoryteller(gs);
  const voters = ttVoterIds(gs);
  const iAmTeller = me === teller;
  const iAmGuesser = !!me && voters.includes(me);
  const voted = voters.filter(id => gs.votes[id] !== undefined).length;
  const duel = gs.mode === 'duel';
  const guessersLabel = duel ? ttEsc(voters.map(nameOf).join(', ')) : 'the class';

  if(gs.phase === 'questions'){
    el._ttPick = undefined;
    html += '<div class="tt-kicker">The interrogation · ' + (gs.current + 1) + ' of ' + gs.order.length + '</div>';
    html += '<div class="tt-title">' + (iAmTeller ? "You're in the hot seat" : ttEsc(nameOf(teller)) + ' is in the hot seat') + '</div>';
    html += ttPolygraphHTML('POLYGRAPH ACTIVE');
    if(iAmTeller){
      html += '<p class="tt-sub">' + guessersLabel + ' will ask you follow-up questions <b>out loud</b>. Answer so they can\'t tell which one is your lie.</p>';
      html += ttExhibitsHTML(gs, { myLie: gs.display.lie });
    } else {
      html += '<p class="tt-sub">Ask ' + ttEsc(nameOf(teller)) + ' follow-up questions <b>out loud</b> — “When did that happen?” “Who was there?” Then find the lie.</p>';
      html += ttExhibitsHTML(gs, {});
      if(duel && iAmGuesser) html += '<div class="tt-actions"><button class="tt-btn block" onclick="ttOpenVotingClick()">⚖️ I\'m ready to guess</button></div>';
    }
  } else if(gs.phase === 'voting'){
    html += '<div class="tt-kicker">The accusation</div>';
    html += '<div class="tt-title">' + (iAmGuesser ? 'Which one is the lie?' : 'The accusation') + '</div>';
    html += ttPolygraphHTML('ANALYSING…');
    if(iAmGuesser){
      const myVote = gs.votes[me];
      const sel = duel ? el._ttPick : myVote;
      html += '<p class="tt-sub">' + (duel ? 'Click the exhibit you think is the lie, then lock in your accusation.' : 'Click the exhibit you think is the lie. You can change your answer until the reveal.') + '</p>';
      html += ttExhibitsHTML(gs, { pick: true, selected: sel });
      if(duel) html += '<div class="tt-actions"><button class="tt-btn red block" onclick="ttLockIn()"' + (sel === undefined ? ' disabled' : '') + '>🔒 Lock in my accusation</button></div>';
      else if(myVote !== undefined) html += '<div class="tt-result info">Answer locked in ✓ — waiting for the reveal</div>';
    } else {
      html += '<p class="tt-sub">' + (iAmTeller ? 'Hold your nerve… ' : '') + voted + ' of ' + voters.length + ' have answered.</p>';
      html += ttExhibitsHTML(gs, { myLie: iAmTeller ? gs.display.lie : undefined });
    }
  } else if(gs.phase === 'reveal'){
    const r = gs.results[gs.results.length - 1];
    html += '<div class="tt-kicker">The verdict</div><div class="tt-title">Exhibit ' + TT_LETTERS[gs.display.lie] + ' was the lie!</div>';
    html += ttExhibitsHTML(gs, { revealed: true });
    const names = (ids) => ids.length ? ids.map(nameOf).join(', ') : 'nobody';
    if(iAmTeller){
      html += '<div class="tt-result ' + (r.fooled.length ? 'good' : 'info') + '">You fooled ' + r.fooled.length + ' player' + (r.fooled.length === 1 ? '' : 's') + (r.fooled.length ? ' (+' + r.fooled.length + ')' : '') + '</div>';
    } else if(r.correct.includes(me)){
      html += '<div class="tt-result good">🎯 You spotted the lie! +1</div>';
    } else if(r.fooled.includes(me)){
      html += '<div class="tt-result bad">😅 ' + ttEsc(nameOf(teller)) + ' fooled you!</div>';
    } else {
      html += '<div class="tt-result info">✓ Spotted it: ' + ttEsc(names(r.correct)) + ' &nbsp;·&nbsp; ✗ Fooled: ' + ttEsc(names(r.fooled)) + '</div>';
    }
  }

  html += '<div class="tt-block-label">Scoreboard</div>' + ttScoreboardHTML(gs, colorOf);
  el.innerHTML = html;
}

function ttReadyChipsHTML(gs){
  return '<div class="tt-chips">' + gs.participants.map(id => {
    const done = !!gs.submissions[id];
    return '<div class="tt-chip' + (done ? ' done' : '') + '"><span class="tt-mark">' + (done ? '✓' : '…') + '</span>' + ttEsc(gs.names[id] || 'Player') + '</div>';
  }).join('') + '</div>';
}

/* ---- handlers called from the rendered HTML ---- */

function ttRerender(){
  const L = window.__ttLast;
  if(L) ttRenderPlayer(L.el, L.gs, L.me, L.A);
}

function ttPick(i){
  const L = window.__ttLast;
  if(!L) return;
  if(L.gs.mode === 'duel'){ L.el._ttPick = i; ttRerender(); }
  else if(L.A.vote) L.A.vote(i);
}

function ttLockIn(){
  const L = window.__ttLast;
  if(L && L.el._ttPick !== undefined && L.A.vote) L.A.vote(L.el._ttPick);
}

function ttOpenVotingClick(){
  const L = window.__ttLast;
  if(L && L.A.openVoting) L.A.openVoting();
}

function ttEditSubmission(){
  const L = window.__ttLast;
  if(!L) return;
  L.el._ttEditing = true;
  L.el.dataset.ttKey = '';
  ttRerender();
}

async function ttFormSubmit(){
  const L = window.__ttLast;
  if(!L) return;
  ttStopDictation();
  const err = document.getElementById('tt-form-err');
  const texts = [0, 1, 2].map(i => (document.getElementById('tt-in-' + i).value || '').trim());
  const lieEl = document.querySelector('input[name="tt-lie"]:checked');
  err.style.display = 'none';
  if(texts.some(t => !t)){ err.textContent = 'Please fill in all three exhibits.'; err.style.display = 'block'; return; }
  if(!lieEl){ err.textContent = 'Mark which exhibit is THE LIE.'; err.style.display = 'block'; return; }

  const btn = document.getElementById('tt-form-submit');
  if(btn) btn.disabled = true;
  L.el._ttEditing = false;
  const ok = await L.A.submit(texts, Number(lieEl.value));
  if(!ok && btn) btn.disabled = false;
}
