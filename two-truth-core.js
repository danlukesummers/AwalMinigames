/* AWAL Minigames -- Two Truths and One Lie: shared rules.
   Loaded by BOTH two-truths.html (teacher) and join.html (students).

   Flow (phase):  writing -> questions -> voting -> reveal -> (next storyteller) -> final
   - writing:   every student writes 2 truths + 1 lie about themselves
   - questions: one storyteller at a time; the class asks follow-up questions OUT LOUD
   - voting:    everyone else votes for the statement they think is the lie
   - reveal:    the lie is shown; points are awarded
   Scoring: +1 for each voter who spots the lie; the storyteller gets +1 for each voter they fooled. */

const TT_MAX_LEN = 140;

function ttShuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// players: [{id, name}]
function ttNewState(players, discussSeconds){
  const names = {}, scores = {};
  players.forEach(p => { names[p.id] = p.name; scores[p.id] = 0; });
  return {
    game: 'two-truths',
    version: 1,
    phase: 'writing',
    names,
    scores,
    submissions: {},      // playerId -> { texts:[3], lie:0..2 }
    order: [],            // storyteller order (ids who submitted)
    current: 0,
    display: null,        // { texts:[3 shuffled], lie: index } for the current storyteller
    votes: {},            // voterId -> displayed index
    results: [],          // per round: { storyteller, texts, lie, correct:[ids], fooled:[ids] }
    discussSeconds: discussSeconds || 0,
    ended: false
  };
}

function ttCleanTexts(texts){
  if(!Array.isArray(texts) || texts.length !== 3) return null;
  const clean = texts.map(t => String(t || '').trim().replace(/\s+/g, ' ').slice(0, TT_MAX_LEN));
  return clean.every(t => t.length > 0) ? clean : null;
}

function ttBuildDisplay(sub){
  const order = ttShuffle([0, 1, 2]);       // new display position -> original index
  return { texts: order.map(i => sub.texts[i]), lie: order.indexOf(sub.lie) };
}

function ttStoryteller(state){ return state.order[state.current]; }

// Voters = everyone in the room except the storyteller.
function ttVoterIds(state){
  const st = ttStoryteller(state);
  return Object.keys(state.names).filter(id => id !== st);
}

// action: {type:'submit', playerId, texts, lie} | {type:'start'} | {type:'vote_open'}
//       | {type:'vote', playerId, index} | {type:'reveal'} | {type:'next'} | {type:'end'}
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
      if(s.phase !== 'writing' || !s.names[action.playerId]) return state;
      const texts = ttCleanTexts(action.texts);
      const lie = Number(action.lie);
      if(!texts || ![0, 1, 2].includes(lie)) return state;
      s.submissions[action.playerId] = { texts, lie };
      return s;
    }
    case 'start': {
      if(s.phase !== 'writing') return state;
      const ids = Object.keys(s.submissions);
      if(ids.length < 2) return state;
      s.order = ttShuffle(ids);
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
      return s;
    }
    case 'reveal': {
      if(s.phase !== 'voting' && s.phase !== 'questions') return state;
      const st = ttStoryteller(s);
      const correct = [], fooled = [];
      Object.keys(s.votes).forEach(v => { (s.votes[v] === s.display.lie ? correct : fooled).push(v); });
      correct.forEach(v => { s.scores[v] = (s.scores[v] || 0) + 1; });
      s.scores[st] = (s.scores[st] || 0) + fooled.length;
      s.results.push({ storyteller: st, texts: s.display.texts, lie: s.display.lie, correct, fooled });
      s.phase = 'reveal';
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
  return Object.keys(state.names)
    .map(id => ({ id, name: state.names[id], score: state.scores[id] || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
