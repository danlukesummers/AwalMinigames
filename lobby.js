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

/* ============ TEACHER ============ */

async function createLobby(game, timeLimit){
  // retry a few times in case a random code collides
  for(let attempt = 0; attempt < 3; attempt++){
    const code = generateLobbyCode();
    const { data, error } = await supabase
      .from('lobbies')
      .insert({
        code,
        game: game || 'hangman',
        status: 'waiting',
        players: [],
        time_limit: Number(timeLimit) || 0
      })
      .select()
      .single();

    if(!error) return data;

    // 23505 = unique violation (code already used) -> try a new code
    if(error.code === '23505') continue;

    recordError('createLobby', error);
    return null;
  }
  return null;
}

async function startLobbyGame(lobbyId, words, timeLimit){
  const roundStartedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('lobbies')
    .update({
      status: 'playing',
      words: words || [],
      current_word_index: 0,
      current_hint: null,
      time_limit: Number(timeLimit) || 0,
      round_started_at: roundStartedAt
    })
    .eq('id', lobbyId)
    .select()
    .single();

  if(error){
    recordError('startLobbyGame', error);
    return null;
  }
  return data;
}

async function setLobbyWordIndex(lobbyId, wordIndex){
  const roundStartedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('lobbies')
    .update({
      current_word_index: wordIndex,
      current_hint: null,
      round_started_at: roundStartedAt
    })
    .eq('id', lobbyId)
    .select()
    .single();

  if(error){
    recordError('setLobbyWordIndex', error);
    return null;
  }
  return data;
}

async function setLobbyHint(lobbyId, hintText){
  const { error } = await supabase
    .from('lobbies')
    .update({ current_hint: hintText })
    .eq('id', lobbyId);

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

/* ============ SHARED: per-student live guessing progress ============ */

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
  upsertProgress,
  fetchProgress,
  subscribeToProgress,
  subscribeToLobby,
  unsubscribe
};
