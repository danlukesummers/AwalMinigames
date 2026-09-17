// lobby.js
// Real live-lobby logic backed by Supabase.

import { supabase } from './supabase-client.js';

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

async function createLobby(game){
  const code = generateLobbyCode();
  const { data, error } = await supabase
    .from('lobbies')
    .insert({ code, game: game || 'hangman', status: 'waiting', players: [] })
    .select()
    .single();

  if(error){
    console.error('[LobbySupabase] createLobby error:', error);
    return null;
  }
  return data;
}

async function startLobbyGame(lobbyId, words){
  const { error } = await supabase
    .from('lobbies')
    .update({ status: 'playing', words: words || [], current_word_index: 0, current_hint: null })
    .eq('id', lobbyId);

  if(error){
    console.error('[LobbySupabase] startLobbyGame error:', error);
    return false;
  }
  return true;
}

async function setLobbyWordIndex(lobbyId, wordIndex){
  const { error } = await supabase
    .from('lobbies')
    .update({ current_word_index: wordIndex, current_hint: null })
    .eq('id', lobbyId);

  if(error){
    console.error('[LobbySupabase] setLobbyWordIndex error:', error);
    return false;
  }
  return true;
}

async function setLobbyHint(lobbyId, hintText){
  const { error } = await supabase
    .from('lobbies')
    .update({ current_hint: hintText })
    .eq('id', lobbyId);

  if(error){
    console.error('[LobbySupabase] setLobbyHint error:', error);
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
    console.error('[LobbySupabase] findLobbyByCode error:', error);
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
    console.error('[LobbySupabase] joinLobby fetch error:', fetchError);
    return null;
  }

  const player = { id: makePlayerId(), name: playerName };
  const updatedPlayers = [...(lobby.players || []), player];

  const { error: updateError } = await supabase
    .from('lobbies')
    .update({ players: updatedPlayers })
    .eq('id', lobbyId);

  if(updateError){
    console.error('[LobbySupabase] joinLobby update error:', updateError);
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
    console.error('[LobbySupabase] upsertProgress error:', error);
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
    console.error('[LobbySupabase] fetchProgress error:', error);
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
  unsubscribe,
};
