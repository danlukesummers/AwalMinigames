// lobby.js
//
// Real live-lobby logic backed by Supabase (replaces the old client-only
// simulation). This is an ES module (needed for the `import` below), but
// hangman.js and join.html's inline script are plain classic scripts --
// classic scripts can't `import` anything. So this file exposes everything
// through `window.LobbySupabase`, which those classic scripts call instead.
//
// Load order doesn't matter much here: this is a <script type="module">,
// which browsers always defer until after the HTML is parsed, and every
// function below is only ever actually invoked later, in response to a user
// action (clicking "Create room", clicking "Join") -- by which time this
// module has long finished loading.

import { supabase } from './supabase-client.js';

function generateLobbyCode(){
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function makePlayerId(){
  if(window.crypto && typeof window.crypto.randomUUID === 'function'){
    return window.crypto.randomUUID();
  }
  // fallback for older browsers without crypto.randomUUID
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
  return data; // { id, code, game, status, players, words, current_word_index, created_at }
}

async function startLobbyGame(lobbyId, words){
  const { error } = await supabase
    .from('lobbies')
    .update({ status: 'playing', words: words || [] })
    .eq('id', lobbyId);

  if(error){
    console.error('[LobbySupabase] startLobbyGame error:', error);
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
  return data; // null if no lobby matches that code
}

async function joinLobby(lobbyId, playerName){
  // Fetch-then-append-then-write. This is fine at classroom scale (a
  // handful of students joining over a few seconds), but it is NOT
  // race-safe: two students submitting in the exact same instant could
  // both read the same `players` array and overwrite each other's entry.
  // For anything beyond a small live classroom, replace this with a
  // Postgres function (RPC) that does the append atomically in one
  // statement, e.g.:
  //
  //   update lobbies set players = players || jsonb_build_array(...)
  //   where id = ...
  //
  // called via `supabase.rpc('join_lobby', { lobby_id, player_name })`.
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

/* ============ SHARED: realtime ============ */

// Fires `onUpdate(newRow)` any time this lobby's row changes (a student
// joining changes `players`; the teacher starting the round changes
// `status`). Both the teacher view and the student view use this same
// function -- they just react to different fields in the payload.
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
  createLobby,
  startLobbyGame,
  findLobbyByCode,
  joinLobby,
  subscribeToLobby,
  unsubscribe,
};
