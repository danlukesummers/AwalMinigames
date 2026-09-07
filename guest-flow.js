/* AWAL Minigames -- product-led-growth guest onboarding flow. Only loaded on index.html. */

  // The guest flow lives entirely inside index.html as a full-screen overlay
  // (no separate page/URL needed for it) -- this just shows one of its three
  // sub-sections and hides the other two.
  function showGuestSection(section){
    document.getElementById('guest-flow-overlay').style.display = 'block';
    ['guest-lobby', 'guest-room', 'guest-done'].forEach(id => {
      document.getElementById('page-' + id).style.display = (id === section) ? 'block' : 'none';
    });
    window.scrollTo({top:0, behavior:'instant'});
  }
  function closeGuestFlow(){
    document.getElementById('guest-flow-overlay').style.display = 'none';
    window.scrollTo({top:0, behavior:'instant'});
  }

  /* ============ PLG GUEST FLOW ============ */
  const GUEST_GAMES = {
    'guess-who': { name:'Guess Who', icon:'🕵️', bg:'#FFE7B8' },
    'pictionary': { name:'Pictionary', icon:'🎨', bg:'#D9F5F1' },
    'hangman': { name:'Hangman', icon:'💀', bg:'#FFE0DD' },
    'impostor': { name:'The Impostor', icon:'🎭', bg:'#EAE3FF' },
  };
  let guestSession = null;

  function openGuestLobby(){
    showGuestSection('guest-lobby');
  }

  function guestRoomCode(){
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function selectGuestGame(gameId){
    const game = GUEST_GAMES[gameId];
    const roomCode = guestRoomCode();
    guestSession = {
      gameId, game, roomCode,
      studentLink: 'https://chatterboxgames.app/join/' + roomCode,
      creditsUsed: 1, creditsMax: 1,
      studentJoined: false,
    };
    document.getElementById('room-icon').textContent = game.icon;
    document.getElementById('room-icon').style.background = game.bg;
    document.getElementById('room-game-name').textContent = game.name;
    document.getElementById('room-code').textContent = roomCode;
    document.getElementById('room-link').textContent = guestSession.studentLink;
    document.getElementById('status-dot').classList.remove('joined');
    document.getElementById('status-text').textContent = 'Waiting for student to join…';
    document.getElementById('simulate-join-btn').style.display = 'block';
    document.getElementById('guest-dot').classList.remove('exhausted');
    document.getElementById('guest-bar-text').textContent = 'GUEST MODE: 1 / 1 Free Trial Game Active';
    showGuestSection('guest-room');
  }

  function copyGuestLink(){
    if(!guestSession) return;
    navigator.clipboard.writeText(guestSession.studentLink).then(() => {
      const btn = document.getElementById('copy-btn');
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = original; }, 1600);
    }).catch(() => {});
  }

  function simulateGuestJoin(){
    if(!guestSession) return;
    guestSession.studentJoined = true;
    document.getElementById('status-dot').classList.add('joined');
    document.getElementById('status-text').textContent = 'A student has joined the room 🎉';
    document.getElementById('simulate-join-btn').style.display = 'none';
  }

  function endGuestTrial(){
    document.getElementById('guest-dot').classList.add('exhausted');
    document.getElementById('guest-bar-text').textContent = 'GUEST MODE: 1 / 1 Free Trial Game Used';
    openSignupModal();
  }

  function openSignupModal(){
    document.getElementById('signup-modal').classList.add('open');
  }
  function closeSignupModal(){
    document.getElementById('signup-modal').classList.remove('open');
  }

  function googleGuestSignUp(){
    completeGuestSignUp({ name: 'Jane Rivera' });
  }

  function clearGuestErrors(){
    ['name','email','password','terms'].forEach(k => {
      const f = document.getElementById('mfield-' + k);
      if(f) f.classList.remove('error');
      const el = document.getElementById('merror-' + k);
      if(el){ el.style.display = 'none'; el.textContent = ''; }
    });
  }

  function showGuestError(key, message){
    const field = document.getElementById('mfield-' + key);
    if(field) field.classList.add('error');
    const el = document.getElementById('merror-' + key);
    if(el){ el.style.display = 'block'; el.textContent = message; }
  }

  function handleGuestSignUp(e){
    e.preventDefault();
    clearGuestErrors();

    const name = document.getElementById('minput-name').value.trim();
    const email = document.getElementById('minput-email').value.trim();
    const password = document.getElementById('minput-password').value;
    const terms = document.getElementById('minput-terms').checked;

    let valid = true;
    if(!name){ showGuestError('name', 'Enter your full name.'); valid = false; }
    if(!/^\S+@\S+\.\S+$/.test(email)){ showGuestError('email', 'Enter a valid email address.'); valid = false; }
    if(password.length < 8){ showGuestError('password', 'Use at least 8 characters.'); valid = false; }
    if(!terms){ showGuestError('terms', 'You need to accept the terms to continue.'); valid = false; }
    if(!valid) return;

    const btn = document.getElementById('guest-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    setTimeout(() => {
      completeGuestSignUp({ name });
      btn.disabled = false;
      btn.textContent = 'Create Free Account (Get 5 Credits/mo)';
    }, 500);
  }

  function completeGuestSignUp(user){
    closeSignupModal();
    const firstName = (user.name || 'there').split(' ')[0];
    document.getElementById('guest-done-heading').textContent = 'Welcome to AWAL, ' + firstName + '!';
    showGuestSection('guest-done');
  }
