/* AWAL Minigames -- Hangman game logic. Only loaded on hangman.html. */
/* ============ HANGMAN BETA ============ */
const HG_BANK = {
  general: ["banana","umbrella","bicycle","mountain","kitchen","elephant","holiday","sandwich","airport","calendar","hospital","pyjamas","dolphin","backpack","library","weather","birthday","suitcase","envelope","volcano"]
};

// Hints dictionary for word definitions
const HG_HINTS = {
  "banana": "A yellow tropical fruit rich in potassium.",
  "umbrella": "Used to stay dry when it rains.",
  "bicycle": "A two-wheeled vehicle you pedal.",
  "mountain": "A very tall, steep natural elevation of the earth.",
  "kitchen": "The room in a house where food is cooked.",
  "elephant": "The largest living land mammal, known for its trunk.",
  "holiday": "A time of rest or vacation away from school/work.",
  "sandwich": "Food placed between two slices of bread.",
  "airport": "A complex where airplanes take off and land.",
  "calendar": "A chart showing days, weeks, and months of a year.",
  "hospital": "An institution where sick or injured people receive medical care.",
  "pyjamas": "Clothes worn for sleeping.",
  "dolphin": "An intelligent marine mammal with a curved beak.",
  "backpack": "A bag carried on your back using straps.",
  "library": "A place containing books and resources to read or borrow.",
  "weather": "The day-to-day state of the atmosphere (rain, heat, wind).",
  "birthday": "The anniversary of the day on which a person was born.",
  "suitcase": "A luggage case used to pack clothes for traveling.",
  "envelope": "A paper container used to enclose letters.",
  "volcano": "A mountain with a crater that spews lava and ash."
};

const hgState = {
  plan: 'free',
  maxWords: 4,
  count: 4,
  source: 'random',
  words: [],
  aiWords: [],
  idx: 0,
  score: 0,
  guessed: [],
  misses: 0,
  roundEnded: false,
  timeLimit: 0,
  aiHints: {},
  aiHintsKey: ''
};

const HG_PARTS = ['head','body','arm-l','arm-r','leg-l','leg-r'];

function hgGetHintForWord(word) {
  if (!word) return '';
  return (hgState.aiHints && hgState.aiHints[word]) || HG_HINTS[word] || ('Starts with "' + word.charAt(0).toUpperCase() + '" and ends with "' + word.charAt(word.length - 1).toUpperCase() + '".');
}

/* ============ AI HINTS (simple A1) ============ */
async function hgFetchAIHints(words){
  hgState.aiHints = {};
  const key = words.join(',');
  hgState.aiHintsKey = key;

  try{
    const res = await fetch('/api/generate-hints', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ words })
    });

    if(!res.ok) throw new Error('Server responded ' + res.status);

    const data = await res.json();

    if(hgState.aiHintsKey !== key) return;

    if(data && data.hints && typeof data.hints === 'object'){
      hgState.aiHints = data.hints;
      const preview = document.getElementById('hg-dash-hint-display');
      const current = hgState.words[hgState.idx];
      if(preview && current) preview.textContent = 'Current Hint Preview: ' + hgGetHintForWord(current);
    }
  } catch(e) {
    console.warn('[hgFetchAIHints] using built-in hints instead:', e);
  }
}

function hgSetPlan(plan){
  hgState.plan = plan;
  hgState.maxWords = plan === 'paid' ? 12 : 4;
  document.getElementById('hg-plan-free')?.classList.toggle('active', plan === 'free');
  document.getElementById('hg-plan-paid')?.classList.toggle('active', plan === 'paid');
  const slider = document.getElementById('hg-count');
  if (slider) {
    slider.max = hgState.maxWords;
    if(parseInt(slider.value, 10) > hgState.maxWords) slider.value = hgState.maxWords;
    hgUpdateCount(slider.value);
  }
  hgApplyPlanGating();
}

function hgApplyPlanGating(){
  const isPaid = hgState.plan === 'paid';
  const aiCard = document.getElementById('hg-src-ai');
  aiCard?.classList.toggle('locked', !isPaid);
  const lockNote = document.getElementById('hg-src-ai-lock');
  if(lockNote) lockNote.style.display = isPaid ? 'none' : 'block';
  if(!isPaid && hgState.source === 'ai') hgSetSource('random');
}

function hgUpdateCount(v){
  hgState.count = parseInt(v, 10);
  const label = document.getElementById('hg-count-label');
  const randomCount = document.getElementById('hg-rand-count');
  const teacherNeed = document.getElementById('hg-teacher-need');

  if(label) label.textContent = v;
  if(randomCount) randomCount.textContent = v;
  if(teacherNeed) teacherNeed.textContent = v;

  hgCheckTeacherWords();
}
  hgCheckTeacherWords();
}

function hgUpdateTimeLimit(v){
  hgState.timeLimit = parseInt(v, 10) || 0;
}

function hgSetSource(src){
  if(src === 'ai' && hgState.plan !== 'paid'){
    const err = document.getElementById('hg-start-error');
    if (err) {
      err.textContent = '✨ AI topic generator is a paid feature. Switch the demo account toggle to "Paid" to try it.';
      err.style.display = 'block';
    }
    return;
  }

  const err = document.getElementById('hg-start-error');
  if (err) err.style.display = 'none';
  hgState.source = src;

  ['random','teacher','ai'].forEach(s => {
    document.getElementById('hg-src-' + s)?.classList.toggle('active', s === src);
    const panel = document.getElementById('hg-src-panel-' + s);
    if (panel) panel.style.display = s === src ? 'block' : 'none';
  });
}

document.getElementById('hg-teacher-words')?.addEventListener('input', hgCheckTeacherWords);

function hgCheckTeacherWords(){
  const ta = document.getElementById('hg-teacher-words');
  if(!ta) return;
  const words = ta.value.split(/[\n,]+/).map(w => w.trim()).filter(Boolean);
  const statusEl = document.getElementById('hg-teacher-status');
  if (statusEl) statusEl.textContent = words.length + ' of ' + hgState.count + ' words entered';
}

async function hgGenerateAI(){
  if(hgState.plan !== 'paid'){
    const statusEl0 = document.getElementById('hg-ai-status');
    if (statusEl0) {
      statusEl0.textContent = 'AI generation is a paid feature -- switch the demo toggle to "Paid" first.';
      statusEl0.style.color = 'var(--coral-deep)';
    }
    return;
  }

  const topic = document.getElementById('hg-ai-topic')?.value.trim();
  const level = document.getElementById('hg-ai-level')?.value;
  const statusEl = document.getElementById('hg-ai-status');
  const btn = document.getElementById('hg-ai-btn');

  if(!topic){
    if (statusEl) {
      statusEl.textContent = 'Enter a topic first.';
      statusEl.style.color = 'var(--coral-deep)';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }

  if (statusEl) {
    statusEl.style.color = 'var(--ink-soft)';
    statusEl.textContent = 'Asking AI for ' + hgState.count + ' ' + level + '-level words about "' + topic + '"…';
  }

  let words = [];

  try{
    const res = await fetch('/api/generate-words',{
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({topic, level, count: hgState.count})
    });
    if(!res.ok) throw new Error('Server responded ' + res.status);
    const data = await res.json();

    if(Array.isArray(data.words) && data.words.length){
      words = data.words
        .map(w => String(w).toLowerCase().replace(/[^a-z]/g,''))
        .filter(Boolean)
        .slice(0, hgState.count);
    }
  } catch(e) {
    console.error('[hgGenerateAI] error:', e);
    words = [];
  }

  if(words.length < hgState.count){
    const pool = HG_BANK.general.filter(w => !words.includes(w));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    while(words.length < hgState.count && shuffled.length) words.push(shuffled.pop());
    if (statusEl) statusEl.textContent = 'Generated ' + hgState.count + ' words for "' + topic + '" (' + level + ') — some filled from our offline bank.';
  } else if (statusEl) {
    statusEl.textContent = 'Generated ' + hgState.count + ' words for "' + topic + '" (' + level + ').';
  }

  if (statusEl) statusEl.style.color = 'var(--teal-deep)';
  hgState.aiWords = words;
  const preview = document.getElementById('hg-ai-preview');
  if (preview) preview.innerHTML = words.map(w => '<span>' + w + '</span>').join('');

  if (btn) {
    btn.disabled = false;
    btn.textContent = '✨ Regenerate words';
  }
}

function hgStartGame(solo){
  const errEl = document.getElementById('hg-start-error');
  if (errEl) errEl.style.display = 'none';
  let words = [];

  if(hgState.source === 'random'){
    const shuffled = [...HG_BANK.general].sort(() => Math.random() - 0.5);
    words = shuffled.slice(0, hgState.count);
  } else if(hgState.source === 'teacher'){
    const ta = document.getElementById('hg-teacher-words');
    words = ta ? ta.value.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(Boolean) : [];

    if(words.length !== hgState.count){
      if (errEl) {
        errEl.textContent = 'Please enter exactly ' + hgState.count + ' words (you have ' + words.length + ').';
        errEl.style.display = 'block';
      }
      return;
    }
    if(words.some(w => !/^[a-z]+$/.test(w))){
      if (errEl) {
        errEl.textContent = 'Words should only contain letters, separated by commas or lines.';
        errEl.style.display = 'block';
      }
      return;
    }
  } else if(hgState.source === 'ai'){
    words = hgState.aiWords || [];
    if(words.length < hgState.count){
      if (errEl) {
        errEl.textContent = 'Generate your AI word list first.';
        errEl.style.display = 'block';
      }
      return;
    }
    words = words.slice(0, hgState.count);
  }

  hgState.words = words;
  hgState.idx = 0;
  hgState.score = 0;
  hgState.roundEnded = false;
  hgFetchAIHints(words);

  const wordTotal = document.getElementById('hg-word-total');
  const setup = document.getElementById('hg-setup');
  const summary = document.getElementById('hg-summary');
  if(wordTotal) wordTotal.textContent = words.length;
  if(setup) setup.style.display = 'none';
  if(summary) summary.style.display = 'none';

  if(solo){
    const play = document.getElementById('hg-play');
    if(play) play.style.display = 'block';
    hgLoadWord();
  } else {
    hgOpenRoom();
  }
}

function hgLoadWord(){
  hgState.guessed = [];
  hgState.misses = 0;
  hgState.roundEnded = false;

  const wordIdx = document.getElementById('hg-word-idx');
  const score = document.getElementById('hg-score');
  const misses = document.getElementById('hg-misses');
  const fb = document.getElementById('hg-feedback');
  const nextWrap = document.getElementById('hg-next-wrap');

  if(wordIdx) wordIdx.textContent = hgState.idx + 1;
  if(score) score.textContent = hgState.score;
  if(misses) misses.textContent = '0';
  if(fb) {
    fb.textContent = '';
    fb.className = 'hg-feedback';
  }
  if(nextWrap) nextWrap.style.display = 'none';

  const hintBtn = document.getElementById('hg-hint-btn');
  const hintText = document.getElementById('hg-hint-text');
  if(hintBtn) hintBtn.disabled = false;
  if(hintText){
    hintText.style.display = 'none';
    hintText.textContent = '';
  }

  HG_PARTS.forEach(p => {
    const el = document.getElementById('hg-part-' + p);
    if(el) el.style.display = 'none';
  });

  hgRenderWord();
  hgRenderKeyboard();
}

function hgShowHint(customHintText){
  const currentWord = hgState.words[hgState.idx];
  const hintTextEl = document.getElementById('hg-hint-text');
  const hintBtnEl = document.getElementById('hg-hint-btn');
  const hint = customHintText || hgGetHintForWord(currentWord);

  if(hintTextEl){
    hintTextEl.textContent = '💡 Hint: ' + hint;
    hintTextEl.style.display = 'inline-block';
    hintTextEl.classList.remove('hg-hint-pop');
    void hintTextEl.offsetWidth;
    hintTextEl.classList.add('hg-hint-pop');
  }
  if(hintBtnEl) hintBtnEl.disabled = true;
}

async function hgSendBroadcastHint(event){
  if(!hgLobby) return;
  const currentWord = hgState.words[hgState.idx];
  const hint = hgGetHintForWord(currentWord);
  const btn = event?.currentTarget || event?.target;
  if(btn) btn.disabled = true;

  if (window.LobbySupabase && window.LobbySupabase.setLobbyHint) {
    const success = await window.LobbySupabase.setLobbyHint(hgLobby.id, hint);
    if (success && btn) {
      const orig = btn.textContent;
      btn.textContent = 'Hint Broadcasted ✓';
      setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
      }, 2000);
    } else if (btn) {
      btn.disabled = false;
    }
  } else if (btn) {
    btn.disabled = false;
  }
}

function hgRenderWord(){
  const word = hgState.words[hgState.idx] || '';
  const el = document.getElementById('hg-word-display');
  if(!el) return;
  el.innerHTML = word.split('').map(ch => {
    const found = hgState.guessed.includes(ch);
    return '<div class="hg-letter-box" style="' + hgLetterStyle(found ? 'found' : 'hidden') + '">' + (found ? ch : '') + '</div>';
  }).join('');
}

function hgLetterStyle(state){
  if(state === 'found') return 'background:#39FF14;color:#0b0b0b;border-color:#39FF14;';
  if(state === 'missed') return 'background:#FF4B4B;color:#fff;border-color:#FF4B4B;';
  return 'background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.2);';
}

function hgRenderKeyboard(){
  const keyboard = document.getElementById('hg-keyboard');
  if(!keyboard) return;
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  keyboard.innerHTML = letters.map(ch => {
    const used = hgState.guessed.includes(ch);
    const disabled = used || hgState.roundEnded;
    return '<button class="hg-key" ' + (disabled ? 'disabled' : '') + ' onclick="hgGuessLetter(\'' + ch + '\')">' + ch.toUpperCase() + '</button>';
  }).join('');
}

function hgGuessLetter(letter){
  if(hgState.roundEnded || hgState.guessed.includes(letter)) return;
  const word = hgState.words[hgState.idx];
  if(!word) return;

  hgState.guessed.push(letter);
  const correct = word.includes(letter);
  if(correct){
    hgState.score += 10;
    AwalSounds.play('correctLetter');
  } else {
    hgState.misses++;
    AwalSounds.play('incorrectLetter');
  }

  const missesEl = document.getElementById('hg-misses');
  const scoreEl = document.getElementById('hg-score');
  if(missesEl) missesEl.textContent = hgState.misses;
  if(scoreEl) scoreEl.textContent = hgState.score;

  hgRenderWord();
  hgRenderKeyboard();

  if([...word].every(ch => hgState.guessed.includes(ch))){
    hgEndRound(true);
  } else if(hgState.misses >= 6){
    hgEndRound(false);
  }
}

function hgEndRound(won){
  if(hgState.roundEnded) return;
  hgState.roundEnded = true;
  const word = hgState.words[hgState.idx];
  const feedback = document.getElementById('hg-feedback');
  const nextWrap = document.getElementById('hg-next-wrap');
  const hintBtn = document.getElementById('hg-hint-btn');

  if(hintBtn) hintBtn.disabled = true;
  hgRenderKeyboard();

  if(won){
    if(feedback){
      feedback.textContent = '🎉 Correct! The word was ' + word.toUpperCase() + '.';
      feedback.className = 'hg-feedback win';
    }
    AwalSounds.play('correctAnswer');
  } else {
    if(feedback){
      feedback.textContent = 'The word was ' + word.toUpperCase() + '. Better luck next time!';
      feedback.className = 'hg-feedback lose';
    }
    hgRevealWord(word);
    AwalSounds.play('incorrectAnswer');
  }

  if(nextWrap) nextWrap.style.display = 'block';
}

function hgRevealWord(word){
  const el = document.getElementById('hg-word-display');
  if(!el) return;
  el.innerHTML = word.split('').map(ch => {
    const found = hgState.guessed.includes(ch);
    return '<div class="hg-letter-box" style="' + hgLetterStyle(found ? 'found' : 'missed') + '">' + ch + '</div>';
  }).join('');
}

function hgNextWord(){
  if(!hgState.roundEnded) return;
  if(hgState.idx >= hgState.words.length - 1){
    hgShowSummary();
    return;
  }
  hgState.idx++;
  hgLoadWord();
}

function hgShowSummary(){
  const play = document.getElementById('hg-play');
  const summary = document.getElementById('hg-summary');
  const finalScore = document.getElementById('hg-final-score');
  const finalTotal = document.getElementById('hg-final-total');
  if(play) play.style.display = 'none';
  if(summary){
    summary.hidden = false;
    summary.style.setProperty('display', 'block', 'important');
  }
  if(finalScore) finalScore.textContent = hgState.score;
  if(finalTotal) finalTotal.textContent = hgState.words.length;
}

function hgResetToSetup(){
  hgStopDashboardTimer();
  hgState.roundEnded = false;

  ['hg-play','hg-summary','hg-room','hg-dashboard'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });

  if(hgProgressChannel && window.LobbySupabase){
    window.LobbySupabase.unsubscribe(hgProgressChannel);
    hgProgressChannel = null;
  }
  if(hgLobbyChannel && window.LobbySupabase){
    window.LobbySupabase.unsubscribe(hgLobbyChannel);
    hgLobbyChannel = null;
  }
  if(hgPresenceChannel && window.LobbySupabase){
    window.LobbySupabase.unsubscribe(hgPresenceChannel);
    hgPresenceChannel = null;
  }

  hgLobby = null;
  const setup = document.getElementById('hg-setup');
  if(setup) setup.style.display = 'block';
}

/* ============ CLASSROOM ROOM MODE ============ */
const HG_STUDENT_COLORS = ['#00F3FF','#39FF14','#A855F7','#FFB020','#FF4B4B','#FFD23F'];
const hgRoom = { code: null, students: [] };

let hgLobby = null;
let hgLobbyChannel = null;
let hgProgressChannel = null;
let hgPresenceChannel = null;
let hgDashboardTimer = null;
let hgTimerExpiryHandled = false;

function hgStopDashboardTimer(){
  if(hgDashboardTimer){
    clearInterval(hgDashboardTimer);
    hgDashboardTimer = null;
  }
}

function hgFormatTime(seconds){
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins + ':' + String(secs).padStart(2, '0');
}

async function hgOpenRoom(){
  hgRoom.students = [];
  const codeEl = document.getElementById('hg-room-code');
  const linkEl = document.getElementById('hg-room-link');
  const roomEl = document.getElementById('hg-room');
  const beginBtn = document.getElementById('hg-begin-btn');

  if(codeEl) codeEl.textContent = '••••••';
  if(linkEl) linkEl.textContent = 'Creating room…';
  if(roomEl) roomEl.style.display = 'block';
  if(beginBtn) beginBtn.disabled = true;
  hgRenderRoster();

  if(!window.LobbySupabase){
    let tries = 0;
    while(!window.LobbySupabase && tries < 40){
      await new Promise(r => setTimeout(r, 50));
      tries++;
    }
  }

  if(!window.LobbySupabase){
    if(linkEl) linkEl.textContent = 'Lobby client not ready. Please try again.';
    return;
  }

  const lobby = await window.LobbySupabase.createLobby('hangman', hgState.timeLimit);
  if(!lobby){
    if(linkEl) linkEl.textContent = 'Could not create the room -- check your connection and try again.';
    return;
  }

  hgLobby = lobby;
  hgRoom.code = lobby.code;
  if(codeEl) codeEl.textContent = lobby.code;
  if(linkEl) linkEl.textContent = window.location.origin + '/join.html?code=' + lobby.code;

  if(hgPresenceChannel) window.LobbySupabase.unsubscribe(hgPresenceChannel);
  hgPresenceChannel = window.LobbySupabase.watchPresence(lobby.id, hgHandleStudentLeft);
  if(hgLobbyChannel) window.LobbySupabase.unsubscribe(hgLobbyChannel);

  hgLobbyChannel = window.LobbySupabase.subscribeToLobby(lobby.id, updatedLobby => {
    hgLobby = updatedLobby;
    const prevIds = hgRoom.students.map(s => s.id);
    const newIds = (updatedLobby.players || []).map(p => p.id);
    if(newIds.some(id => !prevIds.includes(id))) AwalSounds.play('join');
    else if(prevIds.some(id => !newIds.includes(id))) AwalSounds.play('leave');

    hgRoom.students = (updatedLobby.players || []).map((p, i) => ({
      id: p.id,
      name: p.name,
      color: HG_STUDENT_COLORS[i % HG_STUDENT_COLORS.length],
      guessed: [],
      misses: 0,
      done: false,
      won: false
    }));
    hgRenderRoster();
  });
}

function hgCopyRoomLink(){
  const link = document.getElementById('hg-room-link')?.textContent || '';
  if(!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('hg-room-copy-btn');
    if(!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }).catch(() => {});
}

function hgRenderRoster(){
  const wrap = document.getElementById('hg-roster');
  if(!wrap) return;
  let html = '';
  const count = hgRoom.students.length;
  const displayCount = Math.max(4, count);

  for(let i = 0; i < displayCount; i++){
    const student = hgRoom.students[i];
    if(student){
      const initial = student.name ? student.name.charAt(0).toUpperCase() : '?';
      html += '<div class="hg-seat filled"><div class="hg-seat-avatar" style="background:' + student.color + ';">' + initial + '</div><div class="hg-seat-name">' + student.name + '</div></div>';
    } else {
      html += '<div class="hg-seat"><div class="hg-seat-name" style="opacity:0.6;">Waiting for a student…</div></div>';
    }
  }
  wrap.innerHTML = html;
  const beginBtn = document.getElementById('hg-begin-btn');
  if(beginBtn){
    beginBtn.disabled = count === 0;
    beginBtn.textContent = '▶ Begin round (' + count + ' student' + (count === 1 ? '' : 's') + ' joined)';
  }
}

async function hgBeginRound(){
  if(hgRoom.students.length === 0) return;
  const room = document.getElementById('hg-room');
  const dashboard = document.getElementById('hg-dashboard');
  if(room) room.style.display = 'none';
  if(dashboard) dashboard.style.display = 'block';

  const total = document.getElementById('hg-dash-word-total');
  if(total) total.textContent = hgState.words.length;

  if(hgLobby && window.LobbySupabase){
    const startedLobby = await window.LobbySupabase.startLobbyGame(hgLobby.id, hgState.words, hgState.timeLimit);
    if(startedLobby) hgLobby = startedLobby;
  }

  hgState.idx = 0;
  if(hgLobby && window.LobbySupabase?.setLobbyWordIndex){
    const updated = await window.LobbySupabase.setLobbyWordIndex(hgLobby.id, 0);
    if(updated) hgLobby = updated;
  }

  hgLoadDashboardWord();
  if(hgLobby && window.LobbySupabase){
    if(hgProgressChannel) window.LobbySupabase.unsubscribe(hgProgressChannel);
    hgProgressChannel = window.LobbySupabase.subscribeToProgress(hgLobby.id, row => hgApplyProgressRow(row));
  }
}

function hgLoadDashboardWord(){
  const word = hgState.words[hgState.idx];
  if(!word) return;

  hgState.roundEnded = false;
  hgTimerExpiryHandled = false;
  hgStopDashboardTimer();

  const wordIdx = document.getElementById('hg-dash-word-idx');
  const wordLen = document.getElementById('hg-dash-word-len');
  const nextBtn = document.getElementById('hg-dash-next-btn');
  if(wordIdx) wordIdx.textContent = hgState.idx + 1;
  if(wordLen) wordLen.textContent = word.length;
  if(nextBtn) nextBtn.style.display = 'none';

  let hintWrap = document.getElementById('hg-dash-hint-wrap');
  if(!hintWrap){
    hintWrap = document.createElement('div');
    hintWrap.id = 'hg-dash-hint-wrap';
    hintWrap.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;';
    const gridContainer = document.getElementById('hg-dash-grid');
    if(gridContainer && gridContainer.parentNode) gridContainer.parentNode.insertBefore(hintWrap, gridContainer);
    else document.getElementById('hg-dashboard')?.appendChild(hintWrap);
  }

  hintWrap.innerHTML = '<button id="hg-dash-hint-btn" class="btn btn-ghost btn-sm">💡 Broadcast Hint to Class</button><span id="hg-dash-hint-display" style="font-size:0.9rem;opacity:0.7;font-family:monospace;"></span>';
  const hintBtn = document.getElementById('hg-dash-hint-btn');
  if(hintBtn) hintBtn.onclick = hgSendBroadcastHint;
  const hintDisplay = document.getElementById('hg-dash-hint-display');
  if(hintDisplay) hintDisplay.textContent = 'Current Hint Preview: ' + hgGetHintForWord(word);

  hgRoom.students.forEach(s => {
    s.guessed = [];
    s.misses = 0;
    s.done = false;
    s.won = false;
  });

  const grid = document.getElementById('hg-dash-grid');
  if(grid){
    grid.innerHTML = hgRoom.students.map(s => {
      const initial = s.name ? s.name.charAt(0).toUpperCase() : '?';
      return '<div class="hg-dash-card" id="' + s.id + '">' +
        '<div class="hg-dash-head"><div class="hg-dash-avatar" style="background:' + s.color + ';" tabindex="0" aria-label="' + s.name + '">' + initial + '</div>' +
        '<div class="hg-dash-name">' + s.name + '</div><div class="hg-dash-status" id="' + s.id + '-status">guessing…</div></div>' +
        '<div class="hg-dash-word" id="' + s.id + '-word"></div><div class="hg-dash-guesses" id="' + s.id + '-guesses"></div>' +
        '<div class="hg-dash-misses"><span id="' + s.id + '-misses">0</span> / 6 wrong guesses</div></div>';
    }).join('');
  }

  hgRoom.students.forEach(s => hgRenderDashboardCard(s, word));
  hgStartDashboardTimer();

  if(hgLobby && window.LobbySupabase?.fetchProgress){
    window.LobbySupabase.fetchProgress(hgLobby.id, hgState.idx).then(rows => {
      if(Array.isArray(rows)) rows.forEach(row => hgApplyProgressRow(row));
    }).catch(err => console.error('[hgLoadDashboardWord] fetchProgress error:', err));
  }
}

function hgApplyProgressRow(row){
  const student = hgRoom.students.find(s => s.id === row.player_id);
  if(!student || student.done) return;
  const word = hgState.words[hgState.idx];
  const prevGuessCount = (student.guessed || []).length;
  const prevMisses = student.misses || 0;
  student.guessed = row.guessed || [];
  student.misses = row.misses || 0;

  if(!row.done && student.guessed.length > prevGuessCount){
    AwalSounds.play(student.misses > prevMisses ? 'incorrectLetter' : 'correctLetter');
  }

  hgRenderDashboardCard(student, word);
  if(row.done) hgFinishStudent(student, !!row.won, word);
}

function hgRenderDashboardCard(student, word){
  const wordEl = document.getElementById(student.id + '-word');
  if(!wordEl) return;
  const lost = student.done && !student.won;
  wordEl.innerHTML = word
