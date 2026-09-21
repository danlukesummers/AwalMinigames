/* ==========================================================================
   AWAL MINIGAMES — GUEST FLOW & DEMO PRICING LOCK
   ========================================================================== */

let guestState = {
  game: 'guess-who',
  roomCode: '0000',
  studentJoined: false,
  isDemoActive: false
};

/**
 * Open the Guest Lobby Overlay & lock Demo Pricing
 */
function openGuestLobby() {
  const overlay = document.getElementById('guest-flow-overlay');
  if (overlay) {
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }
  
  guestState.isDemoActive = true;
  updateDemoPricingCard(true);
  showGuestPage('page-guest-lobby');
}

/**
 * Close Guest Flow Overlay
 */
function closeGuestFlow() {
  const overlay = document.getElementById('guest-flow-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

/**
 * Switch sub-pages within the Guest Overlay
 */
function showGuestPage(pageId) {
  const pages = ['page-guest-lobby', 'page-guest-room', 'page-guest-done'];
  pages.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === pageId) ? 'block' : 'none';
  });
}

/**
 * Select game & create room
 */
function selectGuestGame(gameKey) {
  guestState.game = gameKey;
  
  // Generate random 4-digit code
  guestState.roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  
  // Update UI Elements
  const roomCodeEl = document.getElementById('room-code');
  const roomLinkEl = document.getElementById('room-link');
  const roomGameNameEl = document.getElementById('room-game-name');
  const roomIconEl = document.getElementById('room-icon');
  
  if (roomCodeEl) roomCodeEl.innerText = guestState.roomCode;
  if (roomLinkEl) roomLinkEl.innerText = `https://awalminigames.com/join/${guestState.roomCode}`;
  
  const gameInfo = getGameDetails(gameKey);
  if (roomGameNameEl) roomGameNameEl.innerText = gameInfo.name;
  if (roomIconEl) roomIconEl.innerText = gameInfo.icon;
  
  // Reset student join status
  guestState.studentJoined = false;
  updateJoinStatusUI(false);
  
  showGuestPage('page-guest-room');
}

/**
 * Helper to get game metadata
 */
function getGameDetails(key) {
  const games = {
    'guess-who': { name: 'Guess Who', icon: '🕵️' },
    'pictionary': { name: 'Pictionary', icon: '🎨' },
    'hangman': { name: 'Hangman', icon: '🔤' },
    'impostor': { name: 'The Impostor', icon: '🎭' }
  };
  return games[key] || { name: 'Minigame', icon: '🎮' };
}

/**
 * Copy room link to clipboard
 */
function copyGuestLink() {
  const linkText = document.getElementById('room-link')?.innerText;
  if (!linkText) return;
  
  navigator.clipboard.writeText(linkText).then(() => {
    const btn = document.getElementById('copy-btn');
    if (btn) {
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = 'Copy'; }, 2000);
    }
  });
}

/**
 * Simulate student joining (For Demo/Testing)
 */
function simulateGuestJoin() {
  guestState.studentJoined = true;
  updateJoinStatusUI(true);
}

function updateJoinStatusUI(joined) {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  if (statusDot && statusText) {
    if (joined) {
      statusDot.style.background = '#10B981'; // Green
      statusText.innerText = 'Student joined! Ready to play.';
    } else {
      statusDot.style.background = '#F59E0B'; // Amber
      statusText.innerText = 'Waiting for student to join…';
    }
  }
}

/**
 * Launch live game session
 */
function launchGuestGame() {
  if (guestState.game === 'hangman') {
    window.location.href = `hangman.html?room=${guestState.roomCode}&guest=true`;
  } else {
    alert(`Launching demo room for ${getGameDetails(guestState.game).name}!`);
  }
}

/**
 * End trial game & trigger conversion modal
 */
function endGuestTrial() {
  guestState.isDemoActive = false;
  updateDemoPricingCard(false);
  
  const modal = document.getElementById('signup-modal');
  if (modal) {
    modal.classList.add('open');
  } else {
    showGuestPage('page-guest-done');
  }
}

/**
 * Toggle Locked/Unlocked State on Pricing Card
 */
function updateDemoPricingCard(isLocked) {
  const demoCard = document.getElementById('demo-price-card');
  const demoBtn = document.getElementById('demo-plan-btn');

  if (!demoCard || !demoBtn) return;

  if (isLocked) {
    demoCard.classList.add('locked');
    demoBtn.disabled = true;
    demoBtn.innerText = 'Currently In Demo';
    demoBtn.className = 'btn btn-disabled btn-block';
  } else {
    demoCard.classList.remove('locked');
    demoBtn.disabled = false;
    demoBtn.innerText = 'Try Demo Free';
    demoBtn.className = 'btn btn-ghost btn-block';
    demoBtn.onclick = () => openGuestLobby();
  }
}

/**
 * Modal & Sign Up Handlers
 */
function closeSignupModal() {
  const modal = document.getElementById('signup-modal');
  if (modal) modal.classList.remove('open');
  showGuestPage('page-guest-done');
}

function googleGuestSignUp() {
  alert('Redirecting to Google authentication…');
  closeSignupModal();
}

function handleGuestSignUp(event) {
  event.preventDefault();
  
  const name = document.getElementById('minput-name')?.value.trim();
  const email = document.getElementById('minput-email')?.value.trim();
  const password = document.getElementById('minput-password')?.value;
  const terms = document.getElementById('minput-terms')?.checked;
  
  if (!name || !email || !password || !terms) {
    alert('Please complete all required fields and accept the Terms.');
    return;
  }
  
  closeSignupModal();
}
