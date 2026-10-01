/* AWAL Minigames -- System Suspects shared core.
   Loaded by BOTH system-suspects.html (teacher) and join.html (students).
   Boards are generated from a numeric seed, so the teacher and every student
   build the identical 16 suspects from game_state.seed.

   Vocabulary covered: facial expressions, facial features, hair, clothes, accessories. */

const GW_OUTLINE = '#2B1D19';
const GW_SKIN_TONES = ['#FAD9BC', '#F1BE97', '#D99B70', '#B3744A', '#7E4E2F', '#5A361F'];
const GW_EYE_COLORS = ['#5A3A22', '#3A86D6', '#3F9D5B'];
const GW_BGS = ['#9DB8F0', '#F9C0D0', '#A8D8A8', '#FDBA74', '#FBE38A', '#C9B8F5', '#9ED8D0', '#F4A3A3', '#B7E4F5'];
const GW_HAIR = {
  black:  { name: 'black',  hex: '#1F1A17' },
  brown:  { name: 'brown',  hex: '#6B4226' },
  blonde: { name: 'blonde', hex: '#F2C94C' },
  red:    { name: 'red',    hex: '#C8501E' },
  grey:   { name: 'grey',   hex: '#B8B8C2' }
};
const GW_TOP_COLORS = {
  red:    '#E5484D',
  blue:   '#3B82F6',
  green:  '#2FA35A',
  yellow: '#F5C518',
  purple: '#8B5CD6'
};
const GW_ACCENT_COLORS = ['#E5484D', '#3B82F6', '#2FA35A', '#F5C518', '#8B5CD6', '#F28C28', '#1F7A8C'];
const GW_EXPRESSIONS = ['happy', 'angry', 'suspicious', 'crazy', 'surprised', 'sad'];
const GW_TOP_TYPES = ['tshirt', 'sweater', 'shirt', 'hoodie'];
const GW_HAT_TYPES = ['cap', 'beanie', 'fedora', 'beret'];

const GW_GRID_SIZE = 16;

/* ---------- Question bank (what students can ask) ---------- */

const GW_CATEGORIES = [
  { id: 'mood',  label: 'EXPRESSION' },
  { id: 'face',  label: 'FACE' },
  { id: 'hair',  label: 'HAIR' },
  { id: 'top',   label: 'CLOTHES' },
  { id: 'acc',   label: 'ACCESSORIES' }
];

function gwQ(id, cat, label, q, test){ return { id, cat, label, q, test }; }

const GW_QUESTIONS = [
  // expressions
  gwQ('happy',      'mood', 'HAPPY',      'Is your suspect happy?',      s => s.expression === 'happy'),
  gwQ('angry',      'mood', 'ANGRY',      'Is your suspect angry?',      s => s.expression === 'angry'),
  gwQ('suspicious', 'mood', 'SUSPICIOUS', 'Is your suspect suspicious?', s => s.expression === 'suspicious'),
  gwQ('crazy',      'mood', 'CRAZY',      'Is your suspect crazy?',      s => s.expression === 'crazy'),
  gwQ('surprised',  'mood', 'SURPRISED',  'Is your suspect surprised?',  s => s.expression === 'surprised'),
  gwQ('sad',        'mood', 'SAD',        'Is your suspect sad?',        s => s.expression === 'sad'),
  // face
  gwQ('woman',      'face', 'WOMAN',      'Is your suspect a woman?',        s => s.isWoman),
  gwQ('glasses',    'face', 'GLASSES',    'Does your suspect wear glasses?', s => s.hasGlasses),
  gwQ('beard',      'face', 'BEARD',      'Does your suspect have a beard?', s => s.hasBeard),
  gwQ('moustache',  'face', 'MOUSTACHE',  'Does your suspect have a moustache?', s => s.hasMoustache),
  gwQ('freckles',   'face', 'FRECKLES',   'Does your suspect have freckles?', s => s.hasFreckles),
  gwQ('earrings',   'face', 'EARRINGS',   'Is your suspect wearing earrings?', s => s.hasEarrings),
  // hair
  gwQ('hair-black',  'hair', 'BLACK HAIR',  'Does your suspect have black hair?',  s => !s.bald && s.hairKey === 'black'),
  gwQ('hair-brown',  'hair', 'BROWN HAIR',  'Does your suspect have brown hair?',  s => !s.bald && s.hairKey === 'brown'),
  gwQ('hair-blonde', 'hair', 'BLONDE HAIR', 'Does your suspect have blonde hair?', s => !s.bald && s.hairKey === 'blonde'),
  gwQ('hair-red',    'hair', 'RED HAIR',    'Does your suspect have red hair?',    s => !s.bald && s.hairKey === 'red'),
  gwQ('hair-grey',   'hair', 'GREY HAIR',   'Does your suspect have grey hair?',   s => !s.bald && s.hairKey === 'grey'),
  gwQ('hair-long',   'hair', 'LONG HAIR',   'Does your suspect have long hair?',   s => s.hairStyle === 'long'),
  gwQ('hair-short',  'hair', 'SHORT HAIR',  'Does your suspect have short hair?',  s => s.hairStyle === 'short' || s.hairStyle === 'bob'),
  gwQ('hair-curly',  'hair', 'CURLY HAIR',  'Does your suspect have curly hair?',  s => s.hairStyle === 'curly'),
  gwQ('bald',        'hair', 'BALD',        'Is your suspect bald?',               s => s.bald),
  // clothes
  gwQ('tshirt',   'top', 'T-SHIRT', 'Is your suspect wearing a t-shirt?', s => s.topType === 'tshirt'),
  gwQ('sweater',  'top', 'SWEATER', 'Is your suspect wearing a sweater?', s => s.topType === 'sweater'),
  gwQ('shirt',    'top', 'SHIRT',   'Is your suspect wearing a shirt?',   s => s.topType === 'shirt'),
  gwQ('hoodie',   'top', 'HOODIE',  'Is your suspect wearing a hoodie?',  s => s.topType === 'hoodie'),
  gwQ('top-red',    'top', 'RED TOP',    'Is your suspect wearing a red top?',    s => s.topKey === 'red'),
  gwQ('top-blue',   'top', 'BLUE TOP',   'Is your suspect wearing a blue top?',   s => s.topKey === 'blue'),
  gwQ('top-green',  'top', 'GREEN TOP',  'Is your suspect wearing a green top?',  s => s.topKey === 'green'),
  gwQ('top-yellow', 'top', 'YELLOW TOP', 'Is your suspect wearing a yellow top?', s => s.topKey === 'yellow'),
  gwQ('top-purple', 'top', 'PURPLE TOP', 'Is your suspect wearing a purple top?', s => s.topKey === 'purple'),
  // accessories
  gwQ('hat',      'acc', 'HAT',      'Is your suspect wearing a hat?',      s => !!s.hatType),
  gwQ('cap',      'acc', 'CAP',      'Is your suspect wearing a cap?',      s => s.hatType === 'cap'),
  gwQ('beanie',   'acc', 'BEANIE',   'Is your suspect wearing a beanie?',   s => s.hatType === 'beanie'),
  gwQ('fedora',   'acc', 'FEDORA',   'Is your suspect wearing a fedora?',   s => s.hatType === 'fedora'),
  gwQ('beret',    'acc', 'BERET',    'Is your suspect wearing a beret?',    s => s.hatType === 'beret'),
  gwQ('scarf',    'acc', 'SCARF',    'Is your suspect wearing a scarf?',    s => s.hasScarf),
  gwQ('bowtie',   'acc', 'BOW TIE',  'Is your suspect wearing a bow tie?',  s => s.hasBowtie),
  gwQ('necklace', 'acc', 'NECKLACE', 'Is your suspect wearing a necklace?', s => s.hasNecklace)
];

function gwFindQuestion(id){ return GW_QUESTIONS.find(q => q.id === id); }

/* ---------- Seeded generation ---------- */

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

function gwGenerateSuspect(id, rng){
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const keysOf = (obj) => Object.keys(obj);

  const isWoman = rng() < 0.5;
  const hairStyle = isWoman
    ? pick(['long', 'long', 'bob', 'curly', 'short'])
    : pick(['short', 'short', 'curly', 'bald', 'bald']);
  const bald = hairStyle === 'bald';
  const hairKey = pick(keysOf(GW_HAIR));
  const hatType = rng() < 0.25 ? pick(GW_HAT_TYPES) : null;
  const topType = pick(GW_TOP_TYPES);
  const hasScarf = rng() < 0.18 && topType !== 'shirt';
  return {
    id,
    isWoman,
    expression: pick(GW_EXPRESSIONS),
    hairStyle, bald, hairKey,
    hairHex: GW_HAIR[hairKey].hex,
    hasBeard: !isWoman && rng() < 0.3,
    hasMoustache: !isWoman && rng() < 0.28,
    hasGlasses: rng() < 0.32,
    glassesShape: pick(['round', 'square']),
    glassesColor: pick(['#2B1D19', '#E5484D', '#3B82F6']),
    hasFreckles: rng() < 0.22,
    hasEarrings: rng() < (isWoman ? 0.4 : 0.1),
    hatType,
    hatColor: pick(GW_ACCENT_COLORS),
    topType,
    topKey: pick(keysOf(GW_TOP_COLORS)),
    hasScarf,
    scarfColor: pick(GW_ACCENT_COLORS),
    hasBowtie: topType === 'shirt' && rng() < 0.3,
    hasNecklace: !hasScarf && topType !== 'hoodie' && rng() < 0.28,
    skin: pick(GW_SKIN_TONES),
    eyeColor: pick(GW_EYE_COLORS),
    bg: pick(GW_BGS)
  };
}

function gwSignature(s){ return GW_QUESTIONS.map(q => q.test(s) ? '1' : '0').join(''); }

// Every suspect gets a unique answer-pattern, so the target can ALWAYS be
// isolated by questions (important for unlimited-question mode).
function gwSuspectsFromSeed(seed){
  const rng = gwMakeRng(seed);
  const usedCodes = new Set();
  const usedSigs = new Set();
  const list = [];
  for(let i = 0; i < GW_GRID_SIZE; i++){
    let s, tries = 0;
    do { s = gwGenerateSuspect('gw-s' + i, rng); tries++; }
    while(usedSigs.has(gwSignature(s)) && tries < 400);
    usedSigs.add(gwSignature(s));
    s.code = gwRandomCode(usedCodes, rng);
    list.push(s);
  }
  return list;
}

/* ---------- Avatar drawing (illustrated portrait, viewBox 100 x 130) ---------- */

function gwShade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function gwBuildAvatarSVG(s){
  const O = GW_OUTLINE;
  const st = 'stroke="' + O + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
  const skinDark = gwShade(s.skin, -0.22);
  const top = GW_TOP_COLORS[s.topKey];
  const topDark = gwShade(top, -0.25);
  const hair = s.hairHex;
  const hairDark = gwShade(hair, -0.3);
  let v = '';

  // background
  v += '<rect width="100" height="130" fill="' + s.bg + '"/>';

  // hair behind head/shoulders
  if(!s.bald && s.hairStyle === 'long'){
    v += '<path d="M22 52 Q17 100 28 114 L72 114 Q83 100 78 52 Q78 24 50 24 Q22 24 22 52 Z" fill="' + hair + '" ' + st + '/>';
  } else if(!s.bald && s.hairStyle === 'bob'){
    v += '<path d="M24 52 Q19 88 32 94 L68 94 Q81 88 76 52 Q76 24 50 24 Q24 24 24 52 Z" fill="' + hair + '" ' + st + '/>';
  }

  // hoodie hood sits behind the neck
  if(s.topType === 'hoodie'){
    v += '<ellipse cx="50" cy="99" rx="27" ry="12" fill="' + topDark + '" ' + st + '/>';
  }

  // neck
  v += '<rect x="42" y="80" width="16" height="22" rx="4" fill="' + s.skin + '" ' + st + '/>';
  v += '<path d="M42 90 Q50 97 58 90 L58 84 L42 84 Z" fill="' + skinDark + '" opacity="0.55"/>';

  // body (shoulders)
  v += '<path d="M6 130 C8 108 28 99 50 99 C72 99 92 108 94 130 Z" fill="' + top + '" ' + st + '/>';

  // neckline details per top type
  if(s.topType === 'tshirt'){
    v += '<path d="M39 99.5 Q50 114 61 99.5 Z" fill="' + s.skin + '" ' + st + '/>';
    // short sleeve hems
    v += '<path d="M9 120 Q18 111 27 108" fill="none" stroke="' + topDark + '" stroke-width="1.6" stroke-linecap="round"/><path d="M91 120 Q82 111 73 108" fill="none" stroke="' + topDark + '" stroke-width="1.6" stroke-linecap="round"/>';
  } else if(s.topType === 'sweater'){
    v += '<path d="M37 99.5 Q50 116 63 99.5 Q50 106 37 99.5 Z" fill="' + topDark + '" ' + st + '/>';
    v += '<path d="M40 99.5 Q50 112 60 99.5 Z" fill="' + s.skin + '" ' + st + '/>';
    // knit pattern + ribbed hem
    [112, 119].forEach(y => { v += '<path d="M14 ' + y + ' Q50 ' + (y - 4) + ' 86 ' + y + '" fill="none" stroke="' + topDark + '" stroke-width="1" opacity="0.5"/>'; });
    v += '<rect x="6" y="125" width="88" height="5" fill="' + topDark + '" opacity="0.55"/>';
  } else if(s.topType === 'shirt'){
    v += '<path d="M41 99 L50 114 L59 99 Z" fill="' + s.skin + '" ' + st + '/>';
    v += '<path d="M36 98 L50 116 L38 108 Z" fill="#FFFFFF" ' + st + '/>';
    v += '<path d="M64 98 L50 116 L62 108 Z" fill="#FFFFFF" ' + st + '/>';
    v += '<circle cx="50" cy="122" r="1.4" fill="' + topDark + '"/><circle cx="50" cy="128" r="1.4" fill="' + topDark + '"/>';
  } else if(s.topType === 'hoodie'){
    v += '<path d="M41 99.5 Q50 110 59 99.5 Z" fill="' + s.skin + '" ' + st + '/>';
    v += '<path d="M45 106 L44 122" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><path d="M55 106 L56 122" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>';
    v += '<circle cx="44" cy="123" r="1.6" fill="#FFFFFF"/><circle cx="56" cy="123" r="1.6" fill="#FFFFFF"/>';
  }

  // necklace
  if(s.hasNecklace){
    v += '<path d="M41 100 Q50 116 59 100" fill="none" stroke="#E2B100" stroke-width="1.6"/>';
    v += '<circle cx="50" cy="110" r="2.3" fill="#E2B100" stroke="' + O + '" stroke-width="0.8"/>';
  }

  // scarf
  if(s.hasScarf){
    const sc = s.scarfColor, scd = gwShade(sc, -0.25);
    v += '<path d="M33 96 Q50 108 67 96 L69 107 Q50 119 31 107 Z" fill="' + sc + '" ' + st + '/>';
    v += '<path d="M56 110 L69 126 L58 129 L49 114 Z" fill="' + sc + '" ' + st + '/>';
    v += '<path d="M58 118 L64 125 M55 114 L61 121" stroke="' + scd + '" stroke-width="1.6"/>';
  }

  // bow tie
  if(s.hasBowtie){
    v += '<path d="M50 104 L37 97 L37 111 Z" fill="#B3263E" ' + st + '/><path d="M50 104 L63 97 L63 111 Z" fill="#B3263E" ' + st + '/><circle cx="50" cy="104" r="3.2" fill="#8A1C30" ' + st + '/>';
  }

  // ears
  v += '<ellipse cx="25.5" cy="60" rx="4.6" ry="6.5" fill="' + s.skin + '" ' + st + '/>';
  v += '<ellipse cx="74.5" cy="60" rx="4.6" ry="6.5" fill="' + s.skin + '" ' + st + '/>';

  // head
  v += '<ellipse cx="50" cy="58" rx="25" ry="29" fill="' + s.skin + '" ' + st + '/>';

  // blush + freckles
  v += '<circle cx="35" cy="67" r="4.6" fill="#FF6F7F" opacity="0.32"/><circle cx="65" cy="67" r="4.6" fill="#FF6F7F" opacity="0.32"/>';
  if(s.hasFreckles){
    [[33,66],[36,69],[39,66],[61,66],[64,69],[67,66],[36,63],[64,63]].forEach(p => {
      v += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="0.9" fill="#9A5A3C"/>';
    });
  }

  // beard (under the mouth, over the jaw)
  if(s.hasBeard){
    v += '<path d="M25.5 62 Q25 92 50 94 Q75 92 74.5 62 Q71 80 50 80 Q29 80 25.5 62 Z" fill="' + hair + '" ' + st + '/>';
  }

  // nose
  v += '<path d="M50 56 Q46.5 66 51.5 66.5" fill="none" stroke="' + skinDark + '" stroke-width="1.7" stroke-linecap="round"/>';

  // face (eyes / brows / mouth)
  v += gwFace(s, st, skinDark);

  // moustache
  if(s.hasMoustache){
    v += '<path d="M37 68 Q44 62 50 67 Q56 62 63 68 Q57 71.5 50 69 Q43 71.5 37 68 Z" fill="' + hair + '" ' + st + '/>';
  }

  // glasses
  if(s.hasGlasses){
    const gc = s.glassesColor;
    if(s.glassesShape === 'round'){
      v += '<circle cx="40" cy="56" r="9" fill="#FFFFFF" fill-opacity="0.18" stroke="' + gc + '" stroke-width="2.1"/>';
      v += '<circle cx="60" cy="56" r="9" fill="#FFFFFF" fill-opacity="0.18" stroke="' + gc + '" stroke-width="2.1"/>';
    } else {
      v += '<rect x="30.5" y="48.5" width="19" height="15" rx="3.5" fill="#FFFFFF" fill-opacity="0.18" stroke="' + gc + '" stroke-width="2.1"/>';
      v += '<rect x="50.5" y="48.5" width="19" height="15" rx="3.5" fill="#FFFFFF" fill-opacity="0.18" stroke="' + gc + '" stroke-width="2.1"/>';
    }
    v += '<path d="M49 55.5 Q50 54 51 55.5" fill="none" stroke="' + gc + '" stroke-width="2"/>';
    v += '<path d="M31 55 L25 54 M69 55 L75 54" stroke="' + gc + '" stroke-width="1.8"/>';
  }

  // front hair
  if(!s.bald){
    if(s.hairStyle === 'short'){
      v += '<path d="M24.5 54 Q20 26 50 25 Q80 26 75.5 54 Q72 40 62 37 Q50 44 38 37 Q28 40 24.5 54 Z" fill="' + hair + '" ' + st + '/>';
    } else if(s.hairStyle === 'long'){
      v += '<path d="M24.5 56 Q20 26 50 25 Q80 26 75.5 56 Q72 38 50 36 Q28 38 24.5 56 Z" fill="' + hair + '" ' + st + '/>';
    } else if(s.hairStyle === 'bob'){
      v += '<path d="M24.5 58 Q21 25 50 24 Q79 25 75.5 58 L72 40 Q50 34 28 40 Z" fill="' + hair + '" ' + st + '/>';
    } else if(s.hairStyle === 'curly'){
      [[28,40],[36,31],[50,27],[64,31],[72,40],[24,52],[76,52],[43,29],[57,29]].forEach(p => {
        v += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="8.5" fill="' + hair + '" ' + st + '/>';
      });
      v += '<path d="M31 42 Q50 30 69 42 Q50 38 31 42 Z" fill="' + hair + '"/>';
    }
  }

  // earrings
  if(s.hasEarrings){
    v += '<circle cx="25.5" cy="68" r="2.3" fill="#E2B100" stroke="' + O + '" stroke-width="0.8"/><circle cx="74.5" cy="68" r="2.3" fill="#E2B100" stroke="' + O + '" stroke-width="0.8"/>';
  }

  // hats
  if(s.hatType){
    const hc = s.hatColor, hd = gwShade(hc, -0.25);
    if(s.hatType === 'beanie'){
      v += '<path d="M24 47 Q23 20 50 19 Q77 20 76 47 Z" fill="' + hc + '" ' + st + '/>';
      v += '<path d="M23 44 Q50 37 77 44 L77 53 Q50 46 23 53 Z" fill="' + hd + '" ' + st + '/>';
      v += '<circle cx="50" cy="17" r="4.2" fill="' + hd + '" ' + st + '/>';
    } else if(s.hatType === 'cap'){
      v += '<path d="M25 45 Q26 21 51 21 Q75 22 75 45 Z" fill="' + hc + '" ' + st + '/>';
      v += '<path d="M48 41 Q84 36 91 46 Q68 49 47 47 Z" fill="' + hd + '" ' + st + '/>';
      v += '<circle cx="51" cy="20" r="2.2" fill="' + hd + '"/>';
    } else if(s.hatType === 'fedora'){
      v += '<path d="M33 40 Q32 14 50 14 Q68 14 67 40 Z" fill="' + hc + '" ' + st + '/>';
      v += '<path d="M32.5 33 L67.5 33 L67 40 L33 40 Z" fill="' + hd + '" ' + st + '/>';
      v += '<ellipse cx="50" cy="40" rx="35" ry="7.5" fill="' + hc + '" ' + st + '/>';
      v += '<path d="M33 40 Q50 45 67 40" fill="none" stroke="' + hd + '" stroke-width="1.4"/>';
    } else if(s.hatType === 'beret'){
      v += '<g transform="rotate(-9 50 32)"><ellipse cx="48" cy="31" rx="29" ry="12" fill="' + hc + '" ' + st + '/><path d="M25 36 Q48 44 71 36" fill="none" stroke="' + hd + '" stroke-width="1.4"/><circle cx="50" cy="19" r="2.8" fill="' + hd + '" ' + st + '/></g>';
    }
  }

  return '<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">' + v + '</svg>';
}

// Eyes, eyebrows and mouth for each expression.
function gwFace(s, st, skinDark){
  const O = GW_OUTLINE;
  const brow = (d, w) => '<path d="' + d + '" fill="none" stroke="' + (s.bald ? '#3a2a22' : gwShade(s.hairHex, -0.2)) + '" stroke-width="' + (w || 2.6) + '" stroke-linecap="round"/>';
  const eye = (cx, cy, rx, ry, px, py, pr) => {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#FFFFFF" ' + st + '/>' +
      '<circle cx="' + (cx + px) + '" cy="' + (cy + py) + '" r="' + pr + '" fill="' + s.eyeColor + '"/>' +
      '<circle cx="' + (cx + px) + '" cy="' + (cy + py) + '" r="' + (pr * 0.5) + '" fill="#111"/>' +
      '<circle cx="' + (cx + px - pr * 0.35) + '" cy="' + (cy + py - pr * 0.4) + '" r="' + (pr * 0.28) + '" fill="#FFFFFF"/>';
  };
  const lid = (cx, cy, rx, ry) => '<path d="M' + (cx - rx) + ' ' + cy + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (cx + rx) + ' ' + cy + ' Z" fill="' + s.skin + '" ' + st + '/>';
  const darkRed = '#7A1F2B';
  let f = '';

  switch(s.expression){
    case 'happy':
      f += eye(40, 56, 5.2, 5.6, 0, 0.4, 3.1) + eye(60, 56, 5.2, 5.6, 0, 0.4, 3.1);
      f += brow('M33.5 47 Q40 43 46.5 47') + brow('M53.5 47 Q60 43 66.5 47');
      f += '<path d="M39 70 Q50 84 61 70 Q50 73.5 39 70 Z" fill="' + darkRed + '" ' + st + '/>';
      f += '<path d="M41 71 Q50 74.5 59 71 L58 73.5 Q50 77 42 73.5 Z" fill="#FFFFFF"/>';
      f += '<ellipse cx="50" cy="79" rx="4.5" ry="2.4" fill="#E8707A"/>';
      break;
    case 'angry':
      f += eye(40, 57, 4.8, 3.8, 0.8, 0.4, 2.6) + eye(60, 57, 4.8, 3.8, -0.8, 0.4, 2.6);
      f += brow('M32 45 L46.5 51.5', 3.2) + brow('M68 45 L53.5 51.5', 3.2);
      f += '<path d="M41 72 Q50 67 59 72 L58 78 Q50 74.5 42 78 Z" fill="#FFFFFF" ' + st + '/>';
      f += '<path d="M45 70.2 L45 76 M50 69.5 L50 75.5 M55 70.2 L55 76" stroke="' + O + '" stroke-width="0.9"/>';
      break;
    case 'suspicious':
      f += eye(40, 56, 5.2, 5.6, 2.4, 0.8, 3.0) + eye(60, 56, 5.2, 5.6, 2.4, 0.8, 3.0);
      f += lid(40, 56, 5.2, 5.6).replace('A5.2 5.6', 'A5.2 3.6') + lid(60, 56, 5.2, 5.6).replace('A5.2 5.6', 'A5.2 3.6');
      f += brow('M33.5 47.5 L46.5 47.5') + brow('M53.5 44 Q60 39 67 44');
      f += '<path d="M42 73.5 Q50 74.5 58 70.5" fill="none" stroke="' + O + '" stroke-width="2.2" stroke-linecap="round"/>';
      break;
    case 'crazy':
      f += eye(40, 55, 6.8, 7.4, 0.5, -0.5, 2.0) + eye(60, 57, 4.6, 5.0, -1.2, 1.0, 1.7);
      f += brow('M31 41 Q38 34 46.5 43', 2.8) + brow('M54 47 L68 41.5', 3);
      f += '<path d="M35 69 Q50 92 65 69 Q50 74 35 69 Z" fill="' + darkRed + '" ' + st + '/>';
      f += '<path d="M37 70.5 Q50 76 63 70.5 L62 74 Q50 79 38 74 Z" fill="#FFFFFF"/>';
      f += '<ellipse cx="50" cy="83" rx="6" ry="3.4" fill="#E8707A"/>';
      break;
    case 'surprised':
      f += eye(40, 56, 6.0, 7.0, 0, 0, 2.4) + eye(60, 56, 6.0, 7.0, 0, 0, 2.4);
      f += brow('M33 41 Q40 35.5 47 41') + brow('M53 41 Q60 35.5 67 41');
      f += '<ellipse cx="50" cy="75" rx="4.6" ry="6.2" fill="' + darkRed + '" ' + st + '/>';
      f += '<ellipse cx="50" cy="78" rx="2.6" ry="2.2" fill="#E8707A"/>';
      break;
    case 'sad':
      f += eye(40, 57, 5.2, 5.4, 0, 1.5, 3.0) + eye(60, 57, 5.2, 5.4, 0, 1.5, 3.0);
      f += brow('M32.5 49.5 L46.5 44.5', 2.8) + brow('M67.5 49.5 L53.5 44.5', 2.8);
      f += '<path d="M43 77 Q50 69.5 57 77" fill="none" stroke="' + O + '" stroke-width="2.3" stroke-linecap="round"/>';
      f += '<path d="M35.5 63 Q32.5 68 35.5 70 Q38.5 68 35.5 63 Z" fill="#7FC8F8" stroke="' + O + '" stroke-width="0.9"/>';
      break;
  }
  return f;
}

/* ---------- Game state + rules ---------- */

// traceLimit 0 = unlimited questions. `order` = student ids (classroom) or ['solo'].
function gwNewGameState(order, traceLimit, turnTimeLimit){
  const seed = Math.floor(Math.random() * 4294967295);
  return {
    game: 'system-suspects',
    seed,
    targetIndex: Math.floor(Math.random() * GW_GRID_SIZE),
    traceLimit: traceLimit || 0,
    tracesLeft: traceLimit ? traceLimit : null,
    askedTraits: [],         // ids from GW_QUESTIONS
    eliminated: [],          // indexes into the seeded suspect list
    order,
    turnIndex: 0,
    log: [],
    turnTimeLimit: turnTimeLimit || 0,
    ended: false,
    result: null             // 'win' | 'loss'
  };
}

function gwOutOfQuestions(state){
  return state.traceLimit > 0 && state.tracesLeft <= 0;
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
    const question = gwFindQuestion(action.key);
    if(!question || gwOutOfQuestions(s) || s.askedTraits.includes(action.key)) return state;

    const targetHas = !!question.test(target);
    let removed = 0;
    suspects.forEach((sp, i) => {
      if(i !== s.targetIndex && !s.eliminated.includes(i) && !!question.test(sp) !== targetHas){
        s.eliminated.push(i);
        removed++;
      }
    });
    if(s.traceLimit > 0) s.tracesLeft--;
    s.askedTraits.push(action.key);
    s.log.push({ q: tag + question.q,
                 a: (targetHas ? 'YES' : 'NO') + '. (' + removed + ' suspect' + (removed === 1 ? '' : 's') + ' eliminated)' });

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
