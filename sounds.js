/* AWAL Minigames -- shared sound effects.
   Load with <script src="sounds.js"></script> BEFORE a game's own script.
   Use anywhere:  AwalSounds.play('correctLetter');

   File names are case-sensitive on GitHub Pages and most servers, so they
   must match the files in your /sounds folder exactly.
   To add a new sound: drop the file in /sounds and add one line below. */
const AwalSounds = (function () {
  const BASE = 'sounds/';

  const FILES = {
    correctLetter:   'correct_letter.mp3',
    incorrectLetter: 'incorrect_letter.mp3',
    correctAnswer:   'correct_answer.mp3',
    incorrectAnswer: 'Incorrect_answer.mp3',
    join:            'join_lobby.mp3',
    leave:           'leave_lobby.mp3'
  };

  const audio = {};
  Object.keys(FILES).forEach(function (name) {
    const a = new Audio(BASE + FILES[name]);
    a.preload = 'auto';
    audio[name] = a;
  });

  let muted = false;

  function play(name) {
    if (muted) return;
    const a = audio[name];
    if (!a) { console.warn('[AwalSounds] unknown sound:', name); return; }
    try {
      a.currentTime = 0; // restart if already playing
      const p = a.play();
      if (p && p.catch) p.catch(function () {}); // ignore autoplay blocks
    } catch (e) {}
  }

  // Call once inside a user click/tap so mobile browsers allow later sounds.
  function unlock() {
    Object.keys(audio).forEach(function (name) {
      const a = audio[name];
      try {
        const wasMuted = a.muted;
        a.muted = true;
        const p = a.play();
        const reset = function () { a.pause(); a.currentTime = 0; a.muted = wasMuted; };
        if (p && p.then) p.then(reset).catch(function () { a.muted = wasMuted; });
        else reset();
      } catch (e) {}
    });
  }

  function setMuted(value) { muted = !!value; }
  function isMuted() { return muted; }

  return { play: play, unlock: unlock, setMuted: setMuted, isMuted: isMuted };
})();
