/* ==========================================================================
   AWAL AUDIO MANAGER
   Handles web audio playback for lobby events and minigame sound effects.
   ========================================================================== */

(function () {
  'use strict';

  // Sound Library Configuration
  // Update these paths to point to your actual audio assets in your repository
  const SOUND_PATHS = {
    // Global Lobby Sounds
    playerJoin: '/sounds/player-join.mp3',
    playerLeave: '/sounds/player-leave.mp3',

    // Hangman Game Sounds
    correctGuess: '/sounds/correct.mp3',
    incorrectGuess: '/sounds/incorrect.mp3',
    gameWin: '/sounds/win.mp3',
    gameLose: '/sounds/lose.mp3'
  };

  // Internal State
  const audioCache = {};
  let globalVolume = 0.5; // Default 50% volume
  let isMuted = false;
  let isAudioUnlocked = false;

  // Preload Audio Assets
  Object.keys(SOUND_PATHS).forEach((key) => {
    const audio = new Audio(SOUND_PATHS[key]);
    audio.preload = 'auto';
    audioCache[key] = audio;
  });

  /**
   * Unlocks Web Audio on the first user interaction to satisfy browser autoplay policies.
   */
  function unlockAudio() {
    if (isAudioUnlocked) return;

    // Create a temporary silent play attempt to unlock the audio context
    const unlockPromise = Object.values(audioCache)[0]?.play();
    if (unlockPromise !== undefined) {
      unlockPromise
        .then(() => {
          Object.values(audioCache)[0].pause();
          Object.values(audioCache)[0].currentTime = 0;
          isAudioUnlocked = true;
          cleanupUnlockListeners();
        })
        .catch(() => {
          // Interaction required before browser allows playback
        });
    }
  }

  function cleanupUnlockListeners() {
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  }

  // Attach global user gesture listeners
  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });

  /**
   * Plays a sound effect by key.
   * @param {string} soundKey - Key corresponding to the sound in SOUND_PATHS.
   */
  function playAwalSound(soundKey) {
    if (isMuted) return;

    const sound = audioCache[soundKey];
    if (!sound) {
      console.warn(`[AwalAudio] Sound key "${soundKey}" not found.`);
      return;
    }

    // Reset playback position so rapid successive calls re-trigger immediately
    sound.currentTime = 0;
    sound.volume = globalVolume;

    sound.play().catch((err) => {
      console.warn(`[AwalAudio] Playback blocked for "${soundKey}":`, err);
    });
  }

  /**
   * Set global volume for all sound effects.
   * @param {number} level - Volume level between 0.0 and 1.0.
   */
  function setAwalVolume(level) {
    globalVolume = Math.max(0, Math.min(1, level));
  }

  /**
   * Toggle mute state for all sound effects.
   * @param {boolean} [forceState] - Optional explicit boolean state.
   */
  function toggleAwalMute(forceState) {
    isMuted = typeof forceState === 'boolean' ? forceState : !isMuted;
    return isMuted;
  }

  // Expose public methods globally
  window.playAwalSound = playAwalSound;
  window.setAwalVolume = setAwalVolume;
  window.toggleAwalMute = toggleAwalMute;
})();
