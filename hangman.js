/* AWAL Minigames -- Hangman game logic. Only loaded on hangman.html. */

  /* ============ HANGMAN BETA ============ */
  const HG_BANK = {
    general: ["banana","umbrella","bicycle","mountain","kitchen","elephant","holiday","sandwich","airport","calendar","hospital","pyjamas","dolphin","backpack","library","weather","birthday","suitcase","envelope","volcano"]
  };
  const hgState = {
    plan: 'free',
    maxWords: 6,
    count: 6,
    source: 'random',
    words: [],
    idx: 0,
    score: 0,
    guessed: [],
    misses: 0
  };

  function hgSetPlan(plan){
    hgState.plan = plan;
    hgState.maxWords = plan === 'paid' ? 12 : 6;
    document.getElementById('hg-plan-free').classList.toggle('active', plan === 'free');
    document.getElementById('hg-plan-paid').classList.toggle('active', plan === 'paid');
    const slider = document.getElementById('hg-count');
    slider.max = hgState.maxWords;
    if(parseInt(slider.value) > hgState.maxWords){ slider.value = hgState.maxWords; }
    hgUpdateCount(slider.value);
  }

  function hgUpdateCount(v){
    hgState.count = parseInt(v);
    document.getElementById('hg-count-label').textContent = v;
    document.getElementById('hg-rand-count').textContent = v;
    document.getElementById('hg-teacher-need').textContent = v;
    hgCheckTeacherWords();
  }

  function hgSetSource(src){
    hgState.source = src;
    ['random','teacher','ai'].forEach(s => {
      document.getElementById('hg-src-' + s).classList.toggle('active', s === src);
      document.getElementById('hg-src-panel-' + s).style.display = s === src ? 'block' : 'none';
    });
  }

  document.getElementById('hg-teacher-words') && document.getElementById('hg-teacher-words').addEventListener('input', hgCheckTeacherWords);
  function hgCheckTeacherWords(){
    const ta = document.getElementById('hg-teacher-words');
    if(!ta) return;
    const words = ta.value.split('\\n').map(w => w.trim()).filter(Boolean);
    document.getElementById('hg-teacher-status').textContent = words.length + ' of ' + hgState.count + ' words entered';
  }

  async function hgGenerateAI(){
    const topic = document.getElementById('hg-ai-topic').value.trim();
    const level = document.getElementById('hg-ai-level').value;
    const statusEl = document.getElementById('hg-ai-status');
    const btn = document.getElementById('hg-ai-btn');
    if(!topic){ statusEl.textContent = 'Enter a topic first.'; statusEl.style.color = 'var(--coral-deep)'; return; }
    btn.disabled = true; btn.textContent = 'Generating…';
    statusEl.style.color = 'var(--ink-soft)';
    statusEl.textContent = 'Asking AI for ' + hgState.count + ' ' + level + '-level words about "' + topic + '"…';
    let words = [];
    try{
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{role:'user', content:
            'Generate exactly ' + hgState.count + ' single English vocabulary words appropriate for CEFR level ' + level +
            ' ESL students, on the topic of "' + topic + '". Words only, no phrases, no punctuation. ' +
            'Respond ONLY with a JSON array of lowercase strings, nothing else, no markdown fences.'}]
        })
      });
      const data = await res.json();
      const text = (data.content || []).map(b => b.text || '').join('');
      const clean = text.replace(/```json|```/g,'').trim();
      const parsed = JSON.parse(clean);
      if(Array.isArray(parsed) && parsed.length){
        words = parsed.map(w => String(w).toLowerCase().replace(/[^a-z]/g,'')).filter(Boolean).slice(0, hgState.count);
      }
    } catch(e){
      words = [];
    }
    if(words.length < hgState.count){
      // fallback: pad with shuffled bank words so the demo always works offline
      const pool = HG_BANK.general.filter(w => !words.includes(w));
      const shuffled = pool.sort(() => Math.random() - 0.5);
      while(words.length < hgState.count && shuffled.length){
        words.push(shuffled.pop());
      }
      statusEl.textContent = 'Generated ' + hgState.count + ' words for "' + topic + '" (' + level + ') — some filled from our offline bank.';
    } else {
      statusEl.textContent = 'Generated ' + hgState.count + ' words for "' + topic + '" (' + level + ').';
    }
    statusEl.style.color = 'var(--teal-deep)';
    hgState.aiWords = words;
    const preview = document.getElementById('hg-ai-preview');
    preview.innerHTML = words.map(w => '<span>' + w + '</span>').join('');
    btn.disabled = false; btn.textContent = '✨ Regenerate words';
  }

  function hgStartGame(solo){
    const errEl = document.getElementById('hg-start-error');
    errEl.style.display = 'none';
    let words = [];

    if(hgState.source === 'random'){
      const shuffled = [...HG_BANK.general].sort(() => Math.random() - 0.5);
      words = shuffled.slice(0, hgState.count);
    } else if(hgState.source === 'teacher'){
      const ta = document.getElementById('hg-teacher-words');
      words = ta.value.split('\\n').map(w => w.trim().toLowerCase()).filter(Boolean);
      if(words.length !== hgState.count){
        errEl.textContent = 'Please enter exactly ' + hgState.count + ' words (you have ' + words.length + ').';
        errEl.style.display = 'block';
        return;
      }
      if(words.some(w => !/^[a-z]+$/.test(w))){
        errEl.textContent = 'Words should only contain letters, one per line.';
        errEl.style.display = 'block';
        return;
      }
    } else if(hgState.source === 'ai'){
      words = hgState.aiWords || [];
      if(words.length < hgState.count){
        errEl.textContent = 'Generate your AI word list first.';
        errEl.style.display = 'block';
        return;
      }
      words = words.slice(0, hgState.count);
    }

    hgState.words = words;
    hgState.idx = 0;
    hgState.score = 0;
    document.getElementById('hg-word-total').textContent = words.length;
    document.getElementById('hg-setup').style.display = 'none';
    document.getElementById('hg-summary').style.display = 'none';

    if(solo){
      document.getElementById('hg-play').style.display = 'block';
      hgLoadWord();
    } else {
      hgOpenRoom();
    }
  }


  function hgLoadWord(){
    hgState.guessed = [];
    hgState.misses = 0;
    document.getElementById('hg-word-idx').textContent = hgState.idx + 1;
    document.getElementById('hg-score').textContent = hgState.score;
    document.getElementById('hg-misses').textContent = '0';
    document.getElementById('hg-feedback').textContent = '';
    document.getElementById('hg-feedback').className = 'hg-feedback';
    document.getElementById('hg-next-wrap').style.display = 'none';
    ['head','body','arm-l','arm-r','leg-l','leg-r'].forEach(p => {
      document.getElementById('hg-part-' + p).style.display = 'none';
    });
    hgRenderWord();
    hgRenderKeyboard();
  }

  function hgRenderWord(){
    const word = hgState.words[hgState.idx];
    const wrap = document.getElementById('hg-word-display');
    wrap.innerHTML = word.split('').map(ch => {
      const shown = hgState.guessed.includes(ch);
      return '<div class="hg-letter-box">' + (shown ? ch : '') + '</div>';
    }).join('');
  }

  function hgRenderKeyboard(){
    const kb = document.getElementById('hg-keyboard');
    kb.innerHTML = '';
    'abcdefghijklmnopqrstuvwxyz'.split('').forEach(letter => {
      const btn = document.createElement('button');
      btn.className = 'hg-key';
      btn.textContent = letter;
      btn.onclick = () => hgGuess(letter, btn);
      kb.appendChild(btn);
    });
  }

  const HG_PARTS = ['head','body','arm-l','arm-r','leg-l','leg-r'];

  function hgGuess(letter, btn){
    if(hgState.guessed.includes(letter)) return;
    hgState.guessed.push(letter);
    const word = hgState.words[hgState.idx];

    if(word.includes(letter)){
      btn.classList.add('correct');
      btn.disabled = true;
      hgRenderWord();
      const solved = word.split('').every(ch => hgState.guessed.includes(ch));
      if(solved){
        hgState.score++;
        hgWordEnd(true);
      }
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      hgState.misses++;
      document.getElementById('hg-misses').textContent = hgState.misses;
      const partId = HG_PARTS[hgState.misses - 1];
      if(partId) document.getElementById('hg-part-' + partId).style.display = 'block';
      if(hgState.misses >= 6){
        hgWordEnd(false);
      }
    }
  }

  function hgWordEnd(won){
    document.querySelectorAll('.hg-key').forEach(k => k.disabled = true);
    const fb = document.getElementById('hg-feedback');
    const word = hgState.words[hgState.idx];
    const wordWrap = document.getElementById('hg-word-display').parentElement;
    if(won){
      fb.textContent = '🎉 Correct! The word was "' + word + '"';
      fb.className = 'hg-feedback win';
      hgPlayWinAnimation(wordWrap);
    } else {
      // reveal the word
      document.getElementById('hg-word-display').innerHTML = word.split('').map(ch => '<div class="hg-letter-box">' + ch + '</div>').join('');
      fb.textContent = '💀 Out of guesses. The word was "' + word + '"';
      fb.className = 'hg-feedback lose';
      hgPlayLoseAnimation(wordWrap);
    }
    const isLast = hgState.idx >= hgState.words.length - 1;
    const nextBtn = document.getElementById('hg-next-btn');
    nextBtn.textContent = isLast ? 'See results →' : 'Next word →';
    document.getElementById('hg-next-wrap').style.display = 'block';
  }

  // Shared win/lose animation helpers -- used by solo play and every
  // dashboard student card. `container` needs position:relative (or already
  // has it via its own class) so the confetti/flash overlays sit correctly.
  function hgPlayWinAnimation(container){
    container.classList.add('hg-anim-win');
    setTimeout(() => container.classList.remove('hg-anim-win'), 550);

    const wrap = document.createElement('div');
    wrap.className = 'hg-confetti-wrap';
    const colors = ['#FF4B4B', '#39FF14', '#00F3FF', '#FFD23F', '#A855F7'];
    for(let i = 0; i < 18; i++){
      const piece = document.createElement('span');
      piece.className = 'hg-confetti';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.25) + 's';
      piece.style.animationDuration = (0.9 + Math.random() * 0.5) + 's';
      wrap.appendChild(piece);
    }
    container.style.position = container.style.position || 'relative';
    container.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1600);
  }

  function hgPlayLoseAnimation(container){
    container.classList.add('hg-anim-lose');
    setTimeout(() => container.classList.remove('hg-anim-lose'), 500);

    const flash = document.createElement('div');
    flash.className = 'hg-lose-flash';
    container.style.position = container.style.position || 'relative';
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 550);
  }

  function hgNextWord(){
    if(hgState.idx >= hgState.words.length - 1){
      hgShowSummary();
      return;
    }
    hgState.idx++;
    hgLoadWord();
  }

  function hgShowSummary(){
    document.getElementById('hg-play').style.display = 'none';
    document.getElementById('hg-summary').style.display = 'block';
    document.getElementById('hg-final-score').textContent = hgState.score;
    document.getElementById('hg-final-total').textContent = hgState.words.length;
  }

  function hgResetToSetup(){
    document.getElementById('hg-play').style.display = 'none';
    document.getElementById('hg-summary').style.display = 'none';
    document.getElementById('hg-room').style.display = 'none';
    document.getElementById('hg-dashboard').style.display = 'none';
    if(hgProgressChannel && window.LobbySupabase){
      window.LobbySupabase.unsubscribe(hgProgressChannel);
      hgProgressChannel = null;
    }
    if(hgLobbyChannel && window.LobbySupabase){
      window.LobbySupabase.unsubscribe(hgLobbyChannel);
      hgLobbyChannel = null;
    }
    hgLobby = null;
    document.getElementById('hg-setup').style.display = 'block';
  }


  /* ============ CLASSROOM ROOM MODE ============ */
  /* Live classroom rooms are backed by real Supabase tables + Realtime (see
     supabase-client.js, lobby.js, and the schema files). Room creation,
     joining, and gameplay are all genuinely real now:

     - A student on a different device typing in the room code actually
       joins this exact room and the teacher sees them appear live.
     - Once "Begin round" is clicked, each student plays the word on their
       OWN device (see join.html), and every letter they guess is written to
       the `lobby_progress` table in Supabase.
     - This dashboard subscribes to that same table and renders whichever
       student's card just changed -- there is no bot standing in for
       anyone anymore.
     - "Next word" advances `lobbies.current_word_index`, which every
       student's browser is also watching, so the whole class moves on
       together. */

  const HG_STUDENT_COLORS = ['#00F3FF', '#39FF14', '#A855F7', '#FFB020'];
  const hgRoom = {
    code: null,
    students: [], // { id, name, color, guessed:[], misses:0, done:false, won:false }
  };
  let hgLobby = null;          // the Supabase row for this room: { id, code, status, players, words, current_word_index, ... }
  let hgLobbyChannel = null;   // realtime subscription on the lobby row itself (players joining, round starting)
  let hgProgressChannel = null; // realtime subscription on lobby_progress (live per-student guesses)

  async function hgOpenRoom(){
    hgRoom.students = [];
    document.getElementById('hg-room-code').textContent = '••••••';
    document.getElementById('hg-room-link').textContent = 'Creating room…';
    document.getElementById('hg-room').style.display = 'block';
    document.getElementById('hg-begin-btn').disabled = true;
    hgRenderRoster();

    if(!window.LobbySupabase){
      // lobby.js is a module and browsers defer those -- in the extremely
      // unlikely case this fires before it's finished loading, wait for it.
      await new Promise(resolve => {
        const check = setInterval(() => {
          if(window.LobbySupabase){ clearInterval(check); resolve(); }
        }, 50);
      });
    }

    const lobby = await window.LobbySupabase.createLobby('hangman');
    if(!lobby){
      document.getElementById('hg-room-link').textContent =
        'Could not create the room -- check your connection and try again.';
      return;
    }

    hgLobby = lobby;
    document.getElementById('hg-room-code').textContent = lobby.code;
    document.getElementById('hg-room-link').textContent =
      window.location.origin + '/join.html?code=' + lobby.code;

    if(hgLobbyChannel){
      window.LobbySupabase.unsubscribe(hgLobbyChannel);
    }
    hgLobbyChannel = window.LobbySupabase.subscribeToLobby(lobby.id, (updatedLobby) => {
      hgRoom.students = (updatedLobby.players || []).map((p, i) => ({
        id: p.id,
        name: p.name,
        color: HG_STUDENT_COLORS[i % HG_STUDENT_COLORS.length],
        guessed: [],
        misses: 0,
        done: false,
        won: false,
      }));
      hgRenderRoster();
    });
  }

  function hgCopyRoomLink(){
    const link = document.getElementById('hg-room-link').textContent;
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('hg-room-copy-btn');
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = original; }, 1600);
    }).catch(() => {});
  }

  function hgRenderRoster(){
    const wrap = document.getElementById('hg-roster');
    let html = '';
    for(let i = 0; i < 4; i++){
      const student = hgRoom.students[i];
      if(student){
        html += '<div class="hg-seat filled">' +
          '<div class="hg-seat-avatar" style="background:' + student.color + ';">' + student.name.charAt(0).toUpperCase() + '</div>' +
          '<div class="hg-seat-name">' + student.name + '</div>' +
        '</div>';
      } else {
        html += '<div class="hg-seat">' +
          '<div class="hg-seat-name" style="opacity:0.6;">Waiting for a student…</div>' +
        '</div>';
      }
    }
    wrap.innerHTML = html;

    const count = hgRoom.students.length;
    const beginBtn = document.getElementById('hg-begin-btn');
    beginBtn.disabled = count === 0;
    beginBtn.textContent = '▶ Begin round (' + count + ' student' + (count === 1 ? '' : 's') + ' joined)';
  }

  async function hgBeginRound(){
    if(hgRoom.students.length === 0) return;
    document.getElementById('hg-room').style.display = 'none';
    document.getElementById('hg-dashboard').style.display = 'block';
    document.getElementById('hg-dash-word-total').textContent = hgState.words.length;

    if(hgLobby){
      await window.LobbySupabase.startLobbyGame(hgLobby.id, hgState.words);
    }

    if(hgProgressChannel){
      window.LobbySupabase.unsubscribe(hgProgressChannel);
    }
    if(hgLobby){
      hgProgressChannel = window.LobbySupabase.subscribeToProgress(hgLobby.id, (row) => {
        if(!row || row.word_index !== hgState.idx) return;
        hgApplyProgressRow(row);
      });
    }

    hgLoadDashboardWord();
  }

  function hgLoadDashboardWord(){
    const word = hgState.words[hgState.idx];
    document.getElementById('hg-dash-word-idx').textContent = hgState.idx + 1;
    document.getElementById('hg-dash-word-len').textContent = word.length;
    document.getElementById('hg-dash-next-btn').style.display = 'none';

    hgRoom.students.forEach(s => {
      s.guessed = [];
      s.misses = 0;
      s.done = false;
      s.won = false;
    });

    const grid = document.getElementById('hg-dash-grid');
    grid.innerHTML = hgRoom.students.map(s =>
      '<div class="hg-dash-card" id="' + s.id + '">' +
        '<div class="hg-dash-head">' +
          '<div class="hg-dash-avatar" style="background:' + s.color + ';">' + s.name.charAt(s.name.length - 1) + '</div>' +
          '<div class="hg-dash-name">' + s.name + '</div>' +
          '<div class="hg-dash-status" id="' + s.id + '-status">guessing…</div>' +
        '</div>' +
        '<div class="hg-dash-word" id="' + s.id + '-word"></div>' +
        '<div class="hg-dash-guesses" id="' + s.id + '-guesses"></div>' +
        '<div class="hg-dash-misses"><span id="' + s.id + '-misses">0</span> / 6 wrong guesses</div>' +
      '</div>'
    ).join('');

    hgRoom.students.forEach(s => hgRenderDashboardCard(s, word));

    // Catch up on anything that already landed before this subscription/
    // render happened (e.g. a very fast student). The live subscription
    // above keeps everything correct after this point regardless.
    if(hgLobby){
      window.LobbySupabase.fetchProgress(hgLobby.id, hgState.idx).then(rows => {
        rows.forEach(row => hgApplyProgressRow(row));
      });
    }
  }

  // Applies one student's live progress row (from Supabase) onto their
  // dashboard card. This is what replaces the old bot simulation.
  function hgApplyProgressRow(row){
    const student = hgRoom.students.find(s => s.id === row.player_id);
    if(!student || student.done) return;
    const word = hgState.words[hgState.idx];

    student.guessed = row.guessed || [];
    student.misses = row.misses || 0;
    hgRenderDashboardCard(student, word);

    if(row.done){
      hgFinishStudent(student, !!row.won, word);
    }
  }

  function hgRenderDashboardCard(student, word){
    const wordEl = document.getElementById(student.id + '-word');
    wordEl.innerHTML = word.split('').map(ch =>
      '<div class="hg-dash-letter">' + (student.guessed.includes(ch) ? ch : '') + '</div>'
    ).join('');
    document.getElementById(student.id + '-guesses').textContent =
      student.guessed.length ? 'Guesses: ' + student.guessed.join(', ').toUpperCase() : '';
    document.getElementById(student.id + '-misses').textContent = student.misses;
  }

  function hgFinishStudent(student, won, word){
    student.done = true;
    student.won = won;
    const card = document.getElementById(student.id);
    const statusEl = document.getElementById(student.id + '-status');
    if(won){
      card.classList.add('hg-won');
      statusEl.textContent = 'SOLVED ✓';
      hgPlayWinAnimation(card);
    } else {
      card.classList.add('hg-lost');
      statusEl.textContent = 'OUT OF GUESSES';
      document.getElementById(student.id + '-word').innerHTML =
        word.split('').map(ch => '<div class="hg-dash-letter">' + ch + '</div>').join('');
      hgPlayLoseAnimation(card);
    }
    if(hgRoom.students.every(s => s.done)){
      const isLast = hgState.idx >= hgState.words.length - 1;
      const nextBtn = document.getElementById('hg-dash-next-btn');
      nextBtn.textContent = isLast ? 'See results →' : 'Next word →';
      nextBtn.style.display = 'inline-flex';
    }
  }

  async function hgDashNextWord(){
    if(hgState.idx >= hgState.words.length - 1){
      document.getElementById('hg-dashboard').style.display = 'none';
      document.getElementById('hg-summary').style.display = 'block';
      const winners = hgRoom.students.filter(s => s.won).length;
      document.getElementById('hg-summary-line').innerHTML =
        'Round complete! <strong>' + winners + '</strong> of <strong>' + hgRoom.students.length + '</strong> students solved the final word.';
      document.getElementById('hg-summary-note').textContent =
        'Start a new room when you are ready for another round.';
      if(hgProgressChannel){
        window.LobbySupabase.unsubscribe(hgProgressChannel);
        hgProgressChannel = null;
      }
      return;
    }
    hgState.idx++;
    if(hgLobby){
      await window.LobbySupabase.setLobbyWordIndex(hgLobby.id, hgState.idx);
    }
    hgLoadDashboardWord();
  }
