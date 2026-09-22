// lobby.js
// Real live-lobby logic backed by Supabase.

import { supabase } from './supabase-client.js';

let lastError = null;
function recordError(where, error){
  console.error('[LobbySupabase] ' + where + ' error:', error);
  lastError = (error && (error.message || error.details || error.hint)) || String(error);
  if (window.LobbySupabase) window.LobbySupabase.lastError = lastError;
}

function generateLobbyCode(){
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function makePlayerId(){
  if(window.crypto && typeof window.crypto.randomUUID === 'function'){
    return window.crypto.randomUUID();
  }
  return 'player-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// Runs a write. If Supabase says a column doesn't exist in the table,
// that field is removed from the payload and the write is retried.
async function safeWrite(build, payload){
  const body = { ...payload };
  for(let i = 0; i < 8; i++){
    const result = await build(body);
    const error = result.error;
    if(!error) return result;

    const msg = error.message || '';
    const match = msg.match(/'([^']+)' column/) || msg.match(/column "?([a-z_]+)"?/i);
    const col = match && match[1];
    if(col && Object.prototype.hasOwnProperty.call(body, col)){
      console.warn('[LobbySupabase] column "' + col + '" missing in table, retrying without it');
      delete body[col];
      continue;
    }
    return result;
  }
  return { data: null, error: { message: 'Too many missing columns' } };
}

/* ============ TEACHER ============ */

async function createLobby(game, timeLimit){
  for(let attempt = 0; attempt < 3; attempt++){
    const code = generateLobbyCode();
    const { data, error } = await safeWrite(
      (p) => supabase.from('lobbies').insert(p).select().single(),
      {
        code,
        game: game || 'hangman',
        status: 'waiting',
        players: [],
        time_limit: Number(timeLimit) || 0
      }
    );

    if(!error) return data;

    // 23505 = code already used -> try a new one
    if(error.code === '23505') continue;

    recordError('createLobby', error);
    return null;
  }
  return null;
}

async function startLobbyGame(lobbyId, words, timeLimit){
  const roundStartedAt = new Date().toISOString();

  const { data, error } = await safeWrite(
    (p) => supabase.from('lobbies').update(p).eq('id', lobbyId).select().single(),
    {
      status: 'playing',
      words: words || [],
      current_word_index: 0,
      current_hint: null,
      time_limit: Number(timeLimit) || 0,
      round_started_at: roundStartedAt
    }
  );

  if(error){
    recordError('startLobbyGame', error);
    return null;
  }
  return data;
}

async function setLobbyWordIndex(lobbyId, wordIndex){
  const roundStartedAt = new Date().toISOString();

  const { data, error } = await safeWrite(
    (p) => supabase.from('lobbies').update(p).eq('id', lobbyId).select().single(),
    {
      current_word_index: wordIndex,
      current_hint: null,
      round_started_at: roundStartedAt
    }
  );

  if(error){
    recordError('setLobbyWordIndex', error);
    return null;
  }
  return data;
}

async function setLobbyHint(lobbyId, hintText){
  const { error } = await safeWrite(
    (p) => supabase.from('lobbies').update(p).eq('id', lobbyId),
    { current_hint: hintText }
  );

  if(error){
    recordError('setLobbyHint', error);
    return false;
  }
  return true;
}

/* ============ STUDENT ============ */

async function findLobbyByCode(code){
  const { data, error } = await supabase
    .from('lobbies')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if(error){
    recordError('findLobbyByCode', error);
    return null;
  }
  return data;
}

async function joinLobby(lobbyId, playerName){
  const { data: lobby, error: fetchError } = await supabase
    .from('lobbies')
    .select('players')
    .eq('id', lobbyId)
    .single();

  if(fetchError){
    recordError('joinLobby fetch', fetchError);
    return null;
  }

  const player = { id: makePlayerId(), name: playerName };
  const updatedPlayers = [...(lobby.players || []), player];

  const { error: updateError } = await supabase
    .from('lobbies')
    .update({ players: updatedPlayers })
    .eq('id', lobbyId);

  if(updateError){
    recordError('joinLobby update', updateError);
    return null;
  }
  return player;
}

// Removes a player from the lobby's players list (used when a student leaves
// while the room is still waiting). The lobby UPDATE it triggers refreshes
// the teacher's roster automatically.
async function leaveLobby(lobbyId, playerId){
  const { data: lobby, error: fetchError } = await supabase
    .from('lobbies')
    .select('players')
    .eq('id', lobbyId)
    .single();

  if(fetchError){
    recordError('leaveLobby fetch', fetchError);
    return false;
  }

  const updatedPlayers = (lobby.players || []).filter(p => p.id !== playerId);

  const { error: updateError } = await supabase
    .from('lobbies')
    .update({ players: updatedPlayers })
    .eq('id', lobbyId);

  if(updateError){
    recordError('leaveLobby update', updateError);
    return false;
  }
  return true;
}

/* ============ PRESENCE: knows when a student closes their tab ============ */

function trackPresence(lobbyId, player){
  const channel = supabase.channel('presence-' + lobbyId, {
    config: { presence: { key: player.id } }
  });

  channel.subscribe(async (status) => {
    if(status === 'SUBSCRIBED'){
      await channel.track({ name: player.name, online_at: new Date().toISOString() });
    }
  });

  return channel;
}

function watchPresence(lobbyId, onLeave){
  const channel = supabase.channel('presence-' + lobbyId, {
    config: { presence: { key: 'teacher-' + makePlayerId() } }
  });

  channel
    .on('presence', { event: 'leave' }, ({ key }) => onLeave(key))
    .subscribe();

  return channel;
}

function isPresent(channel, playerId){
  if(!channel) return false;
  const state = channel.presenceState();
  return Object.prototype.hasOwnProperty.call(state, playerId);
}

/* ============ SHARED: per-student live guessing progress (Hangman) ============ */

async function upsertProgress(lobbyId, playerId, playerName, wordIndex, guessed, misses, done, won){
  const { error } = await supabase
    .from('lobby_progress')
    .upsert({
      lobby_id: lobbyId,
      player_id: playerId,
      player_name: playerName,
      word_index: wordIndex,
      guessed,
      misses,
      done,
      won,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lobby_id,player_id,word_index' });

  if(error){
    recordError('upsertProgress', error);
    return false;
  }
  return true;
}

async function fetchProgress(lobbyId, wordIndex){
  const { data, error } = await supabase
    .from('lobby_progress')
    .select('*')
    .eq('lobby_id', lobbyId)
    .eq('word_index', wordIndex);

  if(error){
    recordError('fetchProgress', error);
    return [];
  }
  return data;
}

function subscribeToProgress(lobbyId, onChange){
  const channel = supabase
    .channel('progress-' + lobbyId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lobby_progress', filter: 'lobby_id=eq.' + lobbyId },
      (payload) => onChange(payload.new || payload.old)
    )
    .subscribe();
  return channel;
}

/* ============ WORD ASSOCIATION: shared game_state blob on lobbies ============ */
// Word Association is turn-based, so (unlike Hangman) all the live state --
// turn order, whose turn it is, the growing chain, scores -- lives in one
// place: lobbies.game_state. Every client subscribes to the lobby row
// (subscribeToLobby, below) and re-renders from game_state. Nothing here
// touches Hangman's columns or lobby_progress.

async function startWordAssociationGame(lobbyId, initialState, timeLimit){
  const roundStartedAt = new Date().toISOString();

  const { data, error } = await safeWrite(
    (p) => supabase.from('lobbies').update(p).eq('id', lobbyId).select().single(),
    {
      status: 'playing',
      game_state: initialState,
      time_limit: Number(timeLimit) || 0,
      round_started_at: roundStartedAt
    }
  );

  if(error){
    recordError('startWordAssociationGame', error);
    return null;
  }
  return data;
}

// Reads the current game_state, applies patchFn to it, and writes the
// result back, also stamping round_started_at -- this is what gives every
// new turn a fresh timer window for free. Not transactional (same trust
// model as the rest of this file): fine for a live classroom room where
// only the player whose turn it is should be writing at any moment.
async function updateGameState(lobbyId, patchFn){
  const { data: lobby, error: fetchError } = await supabase
    .from('lobbies')
    .select('game_state')
    .eq('id', lobbyId)
    .single();

  if(fetchError){
    recordError('updateGameState fetch', fetchError);
    return null;
  }

  const nextState = patchFn(lobby.game_state || {});

  const { data, error } = await supabase
    .from('lobbies')
    .update({ game_state: nextState, round_started_at: new Date().toISOString() })
    .eq('id', lobbyId)
    .select()
    .single();

  if(error){
    recordError('updateGameState update', error);
    return null;
  }
  return data;
}

async function endWordAssociationGame(lobbyId){
  const { data, error } = await supabase
    .from('lobbies')
    .update({ status: 'completed' })
    .eq('id', lobbyId)
    .select()
    .single();

  if(error){
    recordError('endWordAssociationGame', error);
    return null;
  }
  return data;
}

/* ============ SHARED: realtime ============ */

function subscribeToLobby(lobbyId, onUpdate){
  const channel = supabase
    .channel('lobby-' + lobbyId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: 'id=eq.' + lobbyId },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
  return channel;
}

function unsubscribe(channel){
  if(channel) supabase.removeChannel(channel);
}

window.LobbySupabase = {
  client: supabase,
  lastError: null,
  createLobby,
  startLobbyGame,
  setLobbyWordIndex,
  setLobbyHint,
  findLobbyByCode,
  joinLobby,
  leaveLobby,
  trackPresence,
  watchPresence,
  isPresent,
  upsertProgress,
  fetchProgress,
  subscribeToProgress,
  startWordAssociationGame,
  updateGameState,
  endWordAssociationGame,
  subscribeToLobby,
  unsubscribe
};
