/* AWAL Minigames -- Guest Onboarding Flow (Hangman Single Test Room) */

function showGuestSection(section) {
  document.getElementById('guest-flow-overlay').style.display = 'block';
  ['guest-lobby', 'guest-room', 'guest-done'].forEach(id => {
    const el = document.getElementById('page-' + id);
    if (el) el.style.display = (id === section) ? 'block' : 'none';
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function closeGuestFlow() {
  document.getElementById('guest-flow-overlay').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ============ SINGLE GAME CONFIGURATION ============ */
const GUEST_GAMES = {
  'hangman': { 
    name: 'Hangman', 
    icon: '💀', 
    bg: '#FFE0DD', 
    url: '/hangman.html' 
  }
};

let guestSession = null;

function openGuestLobby() {
  showGuestSection('guest-lobby');
}

function guestRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Initiates the Hangman guest trial room.
 * Restricted Access Mode: Bypasses multi-game selector and sets up trial constraints.
 */
function selectGuestGame(gameId = 'hangman') {
  const game = GUEST_GAMES['hangman']; // Enforce Hangman
  const roomCode = guestRoomCode();

  guestSession = {
    gameId: 'hangman',
    game,
    roomCode,
    studentLink: window.location.origin + '/join.html?code=' + roomCode,
    creditsUsed: 1,
    creditsMax: 1,
    studentJoined: false,
    restrictedMode: true
  };

  // Update Trial Room UI Elements
  document.getElementById('room-icon').textContent = game.icon;
  document.getElementById('room-icon').style.background = game.bg;
  document.getElementById('room-game-name').textContent = game.name + ' (Trial Room)';
  document.getElementById('room-code').textContent = roomCode;
  document.getElementById('room-link').textContent = guestSession.studentLink;

  document.getElementById('status-dot').classList.remove('joined');
  document.getElementById('status-text').textContent = 'Waiting for student to join…';
  
  const simBtn = document.getElementById('simulate-join-btn');
  if (simBtn) simBtn.style.display = 'block';

  document.getElementById('guest-dot').classList.remove('exhausted');
  document.getElementById('guest-bar-text').textContent = 'GUEST MODE: 1 / 1 Free Hangman Trial Active';

  showGuestSection('guest-room');
}

function copyGuestLink() {
  if (!guestSession) return;
  navigator.clipboard.writeText(guestSession.studentLink).then(() => {
    const btn = document.getElementById('copy-btn');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }).catch(() => {});
}

function simulateGuestJoin() {
  if (!guestSession) return;
  guestSession.studentJoined = true;
  
  document.getElementById('status-dot').classList.add('joined');
  document.getElementById('status-text').textContent = 'A student has joined the Hangman room 🎉';
  
  const simBtn = document.getElementById('simulate-join-btn');
  if (simBtn) simBtn.style.display = 'none';
}

/**
 * Launches the restricted Hangman instance in guest mode.
 */
function launchGuestGame() {
  if (!guestSession) return;
  // Redirect to hangman.html with guest parameters enabled
  window.location.href = `${GUEST_GAMES.hangman.url}?room=${guestSession.roomCode}&mode=guest&restricted=true`;
}

function endGuestTrial() {
  document.getElementById('guest-dot').classList.add('exhausted');
  document.getElementById('guest-bar-text').textContent = 'GUEST MODE: 1 / 1 Free Hangman Trial Used';
  openSignupModal();
}

/* ============ SIGNUP & AUTHENTICATION MODAL ============ */
function openSignupModal() {
  document.getElementById('signup-modal').classList.add('open');
}

function closeSignupModal() {
  document.getElementById('signup-modal').classList.remove('open');
}

function googleGuestSignUp() {
  completeGuestSignUp({ name: 'Jane Rivera' });
}

function clearGuestErrors() {
  ['name', 'email', 'password', 'terms'].forEach(k => {
    const f = document.getElementById('mfield-' + k);
    if (f) f.classList.remove('error');
    const el = document.getElementById('merror-' + k);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

function showGuestError(key, message) {
  const field = document.getElementById('mfield-' + key);
  if (field) field.classList.add('error');
  const el = document.getElementById('merror-' + key);
  if (el) { el.style.display = 'block'; el.textContent = message; }
}

function handleGuestSignUp(e) {
  e.preventDefault();
  clearGuestErrors();

  const name = document.getElementById('minput-name').value.trim();
  const email = document.getElementById('minput-email').value.trim();
  const password = document.getElementById('minput-password').value;
  const terms = document.getElementById('minput-terms').checked;

  let valid = true;
  if (!name) { showGuestError('name', 'Enter your full name.'); valid = false; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { showGuestError('email', 'Enter a valid email address.'); valid = false; }
  if (password.length < 8) { showGuestError('password', 'Use at least 8 characters.'); valid = false; }
  if (!terms) { showGuestError('terms', 'You need to accept the terms to continue.'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('guest-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creating account…';

  setTimeout(() => {
    completeGuestSignUp({ name });
    btn.disabled = false;
    btn.textContent = 'Create Free Account (Get 5 Credits/mo)';
  }, 500);
}

function completeGuestSignUp(user) {
  closeSignupModal();
  const firstName = (user.name || 'there').split(' ')[0];
  document.getElementById('guest-done-heading').textContent = 'Welcome to AWAL, ' + firstName + '!';
  showGuestSection('guest-done');
}
