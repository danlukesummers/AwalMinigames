/* AWAL Minigames -- System Suspects (Guess Who) game logic. Only loaded on system-suspects.html. */

  /* ============ SYSTEM SUSPECTS (Guess Who beta) ============ */
  /* Procedural pixel-avatar generator: every suspect is built from a small
     set of boolean/enum traits, rendered as layered SVG rects on a 10x13
     pixel grid. No external image assets. */

  const GW_SKIN_TONES = ['#F5D0A9', '#E8B896', '#C68863', '#8D5524', '#5C3A21'];
  const GW_HAIR_COLORS = ['#1A1A1A', '#3B2414', '#5C3317', '#722F37'];
  const GW_GREY_HAIR = '#B8B8C0';
  const GW_HAT_COLORS = ['#00F3FF', '#39FF14', '#A855F7', '#FFB020', '#FF3B6B'];
  const GW_APPAREL = [
    { name: 'CYAN', hex: '#00F3FF' }, { name: 'LIME', hex: '#39FF14' },
    { name: 'VIOLET', hex: '#A855F7' }, { name: 'AMBER', hex: '#FFB020' },
  ];

  // The 6 interrogation traits. Each maps to a boolean field on the suspect object.
  const GW_TRAITS = [
    { key: 'hasHat',      label: 'HAT' },
    { key: 'hasGlasses',  label: 'GLASSES' },
    { key: 'hasBeard',    label: 'BEARD' },
    { key: 'hasGreyHair', label: 'GREY HAIR' },
    { key: 'hasNecklace', label: 'NECKLACE' },
    { key: 'isWoman',     label: 'WOMAN' },
  ];
  const GW_TRACE_LIMIT = 4; // fewer attempts than traits available -> real strategic choice
  const GW_GRID_SIZE = 16;

  const gwState = {
    suspects: [],
    targetId: null,
    round: 1,
    wins: 0,
    tracesLeft: GW_TRACE_LIMIT,
    askedTraits: new Set(),
    gameOver: false,
  };

  function gwRandomCode(usedCodes){
    const letters = 'BCDFGHJKLMNPQRSTVWXZ';
    let code;
    do {
      if (Math.random() < 0.3){
        code = 'AGENT-' + letters[Math.floor(Math.random() * letters.length)];
      } else {
        code = 'SUSPECT-' + (Math.floor(Math.random() * 9) + 1);
      }
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  }

  function gwGenerateSuspect(id, usedCodes){
    const isWoman = Math.random() < 0.5;
    const bald = Math.random() < 0.18;
    const hairLenBias = isWoman ? 0.7 : 0.35;
    const hairLength = bald ? null : (Math.random() < hairLenBias ? 'long' : 'short');
    const hasGreyHair = !bald && Math.random() < 0.28;
    const hairColor = hasGreyHair ? GW_GREY_HAIR : GW_HAIR_COLORS[Math.floor(Math.random() * GW_HAIR_COLORS.length)];
    const hasBeard = Math.random() < 0.3;
    const hasGlasses = Math.random() < 0.3;
    const hasHat = Math.random() < 0.25;
    const hasNecklace = Math.random() < 0.25;
    const skin = GW_SKIN_TONES[Math.floor(Math.random() * GW_SKIN_TONES.length)];
    const hatColor = GW_HAT_COLORS[Math.floor(Math.random() * GW_HAT_COLORS.length)];
    const necklaceColor = Math.random() < 0.5 ? '#FFD700' : '#C0C0C0';
    const apparel = GW_APPAREL[Math.floor(Math.random() * GW_APPAREL.length)];

    return {
      id, code: gwRandomCode(usedCodes),
      isWoman, bald, hairLength, hasGreyHair, hairColor,
      hasBeard, hasGlasses, hasHat, hasNecklace,
      skin, hatColor, necklaceColor, apparel,
      eliminated: false,
    };
  }

  // Pixel grid: 10 cols x 13 rows, 4 units per cell -> viewBox 0 0 40 52
  function gwPx(col, row, color, w, h){
    w = w || 1; h = h || 1;
    return '<rect x="' + (col * 4) + '" y="' + (row * 4) + '" width="' + (w * 4) + '" height="' + (h * 4) + '" fill="' + color + '"/>';
  }

  function gwBuildAvatarSVG(s){
    let svg = '';
    // shirt (rows 9-11, tapering wider toward the bottom)
    svg += gwPx(2, 9, s.apparel.hex, 6, 1);
    svg += gwPx(1, 10, s.apparel.hex, 8, 1);
    svg += gwPx(0, 11, s.apparel.hex, 10, 1);
    // neck
    svg += gwPx(4, 8, s.skin, 2, 1);
    // head block
    svg += gwPx(2, 2, s.skin, 6, 6);
    // hair (drawn after skin so it overlays the top/side edges)
    if (!s.bald){
      svg += gwPx(2, 1, s.hairColor, 6, 1); // top cap
      const sideRows = s.hairLength === 'long' ? 4 : 1;
      svg += gwPx(2, 2, s.hairColor, 1, sideRows);
      svg += gwPx(7, 2, s.hairColor, 1, sideRows);
    }
    // eyes
    svg += gwPx(3, 4, '#1A1A1A', 1, 1);
    svg += gwPx(6, 4, '#1A1A1A', 1, 1);
    // glasses (outlined lenses + bridge, drawn over the eyes)
    if (s.hasGlasses){
      svg += '<rect x="7" y="14" width="9" height="7" fill="none" stroke="#E4FFFB" stroke-width="1.4"/>';
      svg += '<rect x="23" y="14" width="9" height="7" fill="none" stroke="#E4FFFB" stroke-width="1.4"/>';
      svg += gwPx(4, 4, '#E4FFFB', 2, 0.35);
    }
    // mouth
    svg += gwPx(4, 6, '#1A1A1A', 2, 1);
    // beard (chin row + jaw sides, drawn after mouth)
    if (s.hasBeard){
      svg += gwPx(2, 7, s.hairColor, 1, 1);
      svg += gwPx(7, 7, s.hairColor, 1, 1);
      svg += gwPx(3, 7, s.hairColor, 4, 1);
    }
    // necklace (overlays the neck)
    if (s.hasNecklace){
      svg += gwPx(4, 8, s.necklaceColor, 2, 1);
    }
    // hat (drawn last, sits on top of hair)
    if (s.hasHat){
      svg += gwPx(1, 0, s.hatColor, 8, 1);
      svg += gwPx(2, 1, s.hatColor, 6, 1);
    }
    return '<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' + svg + '</svg>';
  }

  function gwStartRound(){
    const usedCodes = new Set();
    gwState.suspects = [];
    for (let i = 0; i < GW_GRID_SIZE; i++){
      gwState.suspects.push(gwGenerateSuspect('gw-s' + i, usedCodes));
    }
    gwState.targetId = gwState.suspects[Math.floor(Math.random() * gwState.suspects.length)].id;
    gwState.tracesLeft = GW_TRACE_LIMIT;
    gwState.askedTraits = new Set();
    gwState.gameOver = false;

    document.getElementById('gw-log').innerHTML = '';
    document.getElementById('gw-result-win').classList.remove('show');
    document.getElementById('gw-result-loss').classList.remove('show');
    document.getElementById('gw-next-btn').style.display = 'none';
    document.getElementById('gw-target-box').classList.remove('revealed');
    document.getElementById('gw-target-box').innerHTML = '<svg class="gw-target-silhouette" viewBox="0 0 24 24" fill="rgba(228,255,251,0.15)"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-9 2.2-9 6v2h18v-2c0-3.8-4.6-6-9-6Z"/></svg>';
    document.getElementById('gw-target-code').textContent = '???-??';
    document.getElementById('gw-target-code').classList.remove('revealed');

    gwRenderQuestionDeck();
    gwRenderProtocolList();
    gwRenderGrid();
    gwUpdateTraceCounter();
  }

  function gwRenderQuestionDeck(){
    const wrap = document.getElementById('gw-qdeck-buttons');
    wrap.innerHTML = GW_TRAITS.map(t =>
      '<button class="gw-qbtn" id="gw-qbtn-' + t.key + '" onclick="gwAskTrait(\'' + t.key + '\')">[' + t.label + ']</button>'
    ).join('');
  }

  function gwRenderProtocolList(){
    const list = document.getElementById('gw-protocol-list');
    list.innerHTML = GW_TRAITS.map(t =>
      '<li id="gw-protocol-' + t.key + '" class="pending">[' + t.label + ']</li>'
    ).join('');
  }

  function gwUpdateTraceCounter(){
    document.getElementById('gw-traces').textContent = gwState.tracesLeft;
  }

  function gwRenderGrid(){
    const grid = document.getElementById('gw-grid');
    grid.innerHTML = gwState.suspects.map(s => (
      '<div class="gw-card' + (s.eliminated ? ' gw-out' : '') + '" id="' + s.id + '">' +
        '<div class="gw-avatar-wrap">' + gwBuildAvatarSVG(s) + '</div>' +
        '<div class="gw-code">' + s.code + '</div>' +
        '<button class="gw-elim-btn" onclick="gwManualEliminate(\'' + s.id + '\')">ELIMINATE</button>' +
      '</div>'
    )).join('');
  }

  function gwLog(question, answer){
    const log = document.getElementById('gw-log');
    const entry = document.createElement('div');
    entry.className = 'gw-log-entry';
    entry.innerHTML = '<b>Q:</b> ' + question + '<span class="gw-log-a">A: ' + answer + '</span>';
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  function gwGlitchOut(suspect){
    suspect.eliminated = true;
    const el = document.getElementById(suspect.id);
    if (el){
      el.classList.add('gw-glitching');
      setTimeout(() => {
        el.classList.remove('gw-glitching');
        el.classList.add('gw-out');
      }, 350);
    }
  }

  function gwAskTrait(key){
    if (gwState.gameOver || gwState.tracesLeft <= 0 || gwState.askedTraits.has(key)) return;

    const target = gwState.suspects.find(s => s.id === gwState.targetId);
    const targetHasIt = !!target[key];
    const trait = GW_TRAITS.find(t => t.key === key);

    gwState.tracesLeft--;
    gwState.askedTraits.add(key);
    document.getElementById('gw-qbtn-' + key).disabled = true;
    document.getElementById('gw-protocol-' + key).classList.remove('pending');

    let eliminatedCount = 0;
    gwState.suspects.forEach(s => {
      if (!s.eliminated && s.id !== gwState.targetId && !!s[key] !== targetHasIt){
        gwGlitchOut(s);
        eliminatedCount++;
      }
    });

    gwLog('Does your suspect have ' + trait.label.toLowerCase() + '?', (targetHasIt ? 'YES' : 'NO') + '. (' + eliminatedCount + ' suspects eliminated)');
    gwUpdateTraceCounter();

    if (gwState.tracesLeft <= 0){
      GW_TRAITS.forEach(t => {
        const btn = document.getElementById('gw-qbtn-' + t.key);
        if (btn) btn.disabled = true;
      });
    }

    setTimeout(gwCheckWin, 380);
  }

  function gwManualEliminate(id){
    if (gwState.gameOver) return;
    const suspect = gwState.suspects.find(s => s.id === id);
    if (!suspect || suspect.eliminated) return;

    gwGlitchOut(suspect);

    if (id === gwState.targetId){
      gwEndRound(false);
      return;
    }
    gwCheckWin();
  }

  function gwCheckWin(){
    if (gwState.gameOver) return;
    const active = gwState.suspects.filter(s => !s.eliminated);
    if (active.length === 1 && active[0].id === gwState.targetId){
      gwEndRound(true);
    }
  }

  function gwEndRound(won){
    gwState.gameOver = true;
    GW_TRAITS.forEach(t => {
      const btn = document.getElementById('gw-qbtn-' + t.key);
      if (btn) btn.disabled = true;
    });
    document.getElementById('gw-next-btn').style.display = 'inline-flex';

    const target = gwState.suspects.find(s => s.id === gwState.targetId);
    const targetBox = document.getElementById('gw-target-box');
    targetBox.innerHTML = gwBuildAvatarSVG(target);
    const codeEl = document.getElementById('gw-target-code');
    codeEl.textContent = target.code;
    codeEl.classList.add('revealed');

    if (won){
      gwState.wins++;
      document.getElementById('gw-win-code').textContent = target.code;
      document.getElementById('gw-result-win').classList.add('show');
      gwLog('Round result', 'TARGET ISOLATED — ' + target.code + ' CONFIRMED');
    } else {
      document.getElementById('gw-result-loss').classList.add('show');
      gwLog('Round result', 'TARGET PURGED IN ERROR');
    }
  }

  function gwNextRound(){
    gwState.round++;
    gwStartRound();
  }

  function gwResetGame(){
    gwState.round = 1;
    gwState.wins = 0;
    gwStartRound();
  }



// This file is only ever loaded on system-suspects.html, so start the first round immediately.
gwResetGame();
