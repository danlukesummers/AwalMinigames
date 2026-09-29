/* AWAL Minigames -- System Suspects shared core.
   Loaded by BOTH system-suspects.html (teacher) and join.html (students).
   Boards are generated from a numeric seed, so the teacher and every student
   build the identical 16 suspects from game_state.seed. */

const GW_SKIN_TONES = ['#F5D0A9', '#E8B896', '#C68863', '#8D5524', '#5C3A21'];
const GW_HAIR_COLORS = ['#1A1A1A', '#3B2414', '#5C3317', '#722F37'];
const GW_GREY_HAIR = '#B8B8C0';
const GW_HAT_COLORS = ['#00F3FF', '#39FF14', '#A855F7', '#FFB020', '#FF3B6B'];
const GW_APPAREL = [
  { name: 'CYAN', hex: '#00F3FF' }, { name: 'LIME', hex: '#39FF14' },
  { name: 'VIOLET', hex: '#A855F7' }, { name: 'AMBER', hex: '#FFB020' },
];

const GW_TRAITS = [
  { key: 'hasHat',      label: 'HAT' },
  { key: 'hasGlasses',  label: 'GLASSES' },
  { key: 'hasBeard',    label: 'BEARD' },
  { key: 'hasGreyHair', label: 'GREY HAIR' },
  { key: 'hasNecklace', label: 'NECKLACE' },
  { key: 'isWoman',     label: 'WOMAN' },
];
const GW_GRID_SIZE = 16;

// Small seeded PRNG (mulberry32) so a seed always yields the same board.
function gwMakeRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gwRandomCode(usedCodes, rng){
  const letters = 'BCDFGHJKLMNPQRSTVWXZ';
  let code;
  do {
    code = rng() < 0.3
      ? 'AGENT-' + letters[Math.floor(rng() * letters.length)]
      : 'SUSPECT-' + (Math.floor(rng() * 9) + 1);
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

function gwGenerateSuspect(id, usedCodes, rng){
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const isWoman = rng() < 0.5;
  const bald = rng() < 0.18;
  const hairLength = bald ? null : (rng() < (isWoman ? 0.7 : 0.35) ? 'long' : 'short');
  const hasGreyHair = !bald && rng() < 0.28;
  const hairColor = hasGreyHair ? GW_GREY_HAIR : pick(GW_HAIR_COLORS);
  const hasBeard = rng() < 0.3;
  const hasGlasses = rng() < 0.3;
  const hasHat = rng() < 0.25;
  const hasNecklace = rng() < 0.25;
  const skin = pick(GW_SKIN_TONES);
  const hatColor = pick(GW_HAT_COLORS);
  const necklaceColor = rng() < 0.5 ? '#FFD700' : '#C0C0C0';
  const apparel = pick(GW_APPAREL);
  return {
    id, code: gwRandomCode(usedCodes, rng),
    isWoman, bald, hairLength, hasGreyHair, hairColor,
    hasBeard, hasGlasses, hasHat, hasNecklace,
    skin, hatColor, necklaceColor, apparel
  };
}

function gwSuspectsFromSeed(seed){
  const rng = gwMakeRng(seed);
  const used = new Set();
  const list = [];
  for(let i = 0; i < GW_GRID_SIZE; i++) list.push(gwGenerateSuspect('gw-s' + i, used, rng));
  return list;
}

function gwPx(col, row, color, w, h){
  w = w || 1; h = h || 1;
  return '<rect x="' + (col * 4) + '" y="' + (row * 4) + '" width="' + (w * 4) + '" height="' + (h * 4) + '" fill="' + color + '"/>';
}

function gwBuildAvatarSVG(s){
  let svg = '';
  svg += gwPx(2, 9, s.apparel.hex, 6, 1);
  svg += gwPx(1, 10, s.apparel.hex, 8, 1);
  svg += gwPx(0, 11, s.apparel.hex, 10, 1);
  svg += gwPx(4, 8, s.skin, 2, 1);
  svg += gwPx(2, 2, s.skin, 6, 6);
  if (!s.bald){
    svg += gwPx(2, 1, s.hairColor, 6, 1);
    const sideRows = s.hairLength === 'long' ? 4 : 1;
    svg += gwPx(2, 2, s.hairColor, 1, sideRows);
    svg += gwPx(7, 2, s.hairColor, 1, sideRows);
  }
  svg += gwPx(3, 4, '#1A1A1A', 1, 1);
  svg += gwPx(6, 4, '#1A1A1A', 1, 1);
  if (s.hasGlasses){
    svg += '<rect x="7" y="14" width="9" height="7" fill="none" stroke="#E4FFFB" stroke-width="1.4"/>';
    svg += '<rect x="23" y="14" width="9" height="7" fill="none" stroke="#E4FFFB" stroke-width="1.4"/>';
    svg += gwPx(4, 4, '#E4FFFB', 2, 0.35);
  }
  svg += gwPx(4, 6, '#1A1A1A', 2, 1);
  if (s.hasBeard){
    svg += gwPx(2, 7, s.hairColor, 1, 1);
    svg += gwPx(7, 7, s.hairColor, 1, 1);
    svg += gwPx(3, 7, s.hairColor, 4, 1);
  }
  if (s.hasNecklace) svg += gwPx(4, 8, s.necklaceColor, 2, 1);
  if (s.hasHat){
    svg += gwPx(1, 0, s.hatColor, 8, 1);
    svg += gwPx(2, 1, s.hatColor, 6, 1);
  }
  return '<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' + svg + '</svg>';
}

// Fresh game_state. `order` = student ids (classroom) or ['solo'].
function gwNewGameState(order, traceLimit, turnTimeLimit){
  const seed = Math.floor(Math.random() * 4294967295);
  return {
    game: 'system-suspects',
    seed,
    targetIndex: Math.floor(Math.random() * GW_GRID_SIZE),
    traceLimit,
    tracesLeft: traceLimit,
    askedTraits: [],
    eliminated: [],          // indexes into the seeded suspect list
    order,
    turnIndex: 0,
    log: [],
    turnTimeLimit: turnTimeLimit || 0,
    ended: false,
    result: null             // 'win' | 'loss'
  };
}

// Pure state transition shared by teacher (solo/skip) and students.
// action: {type:'ask', key} | {type:'eliminate', index} | {type:'skip'}, + playerName
function gwApply(state, suspects, action){
  if(state.ended) return state;

  const s = {
    ...state,
    askedTraits: [...(state.askedTraits || [])],
    eliminated: [...(state.eliminated || [])],
    log: [...(state.log || [])]
  };
  const target = suspects[s.targetIndex];
  const tag = action.playerName ? action.playerName + ': ' : '';

  if(action.type === 'ask'){
    const trait = GW_TRAITS.find(t => t.key === action.key);
    if(!trait || s.tracesLeft <= 0 || s.askedTraits.includes(action.key)) return state;

    const targetHas = !!target[action.key];
    let removed = 0;
    suspects.forEach((sp, i) => {
      if(i !== s.targetIndex && !s.eliminated.includes(i) && !!sp[action.key] !== targetHas){
        s.eliminated.push(i);
        removed++;
      }
    });
    s.tracesLeft--;
    s.askedTraits.push(action.key);
    s.log.push({ q: tag + 'Does your suspect have ' + trait.label.toLowerCase() + '?',
                 a: (targetHas ? 'YES' : 'NO') + '. (' + removed + ' suspects eliminated)' });

  } else if(action.type === 'eliminate'){
    const i = action.index;
    if(!suspects[i] || s.eliminated.includes(i)) return state;
    s.eliminated.push(i);
    if(i === s.targetIndex){
      s.ended = true;
      s.result = 'loss';
      s.log.push({ q: tag + 'Eliminate ' + suspects[i].code, a: 'TARGET PURGED IN ERROR' });
    } else {
      s.log.push({ q: tag + 'Eliminate ' + suspects[i].code, a: 'Not the target' });
    }

  } else if(action.type === 'skip'){
    s.log.push({ q: (action.playerName || 'Player') + ' skipped a turn', a: '—' });
  } else {
    return state;
  }

  if(!s.ended && (suspects.length - s.eliminated.length) === 1 && !s.eliminated.includes(s.targetIndex)){
    s.ended = true;
    s.result = 'win';
    s.log.push({ q: 'Round result', a: 'TARGET ISOLATED — ' + target.code + ' CONFIRMED' });
  }

  if(!s.ended){
    const n = (s.order || []).length || 1;
    s.turnIndex = (s.turnIndex + 1) % n;
  }
  return s;
}
