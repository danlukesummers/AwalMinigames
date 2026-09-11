/* AWAL Minigames -- shared across every page: nav dropdown, FAQ/pricing/login/terms
   toggles, and the single source of truth for the game catalog (GAME_LIBRARY). */

  let gdHideTimeout;
  function showGamesDrop(){
    clearTimeout(gdHideTimeout);
    const el = document.getElementById('games-drop');
    if(el) el.classList.add('open');
  }
  function scheduleHideGamesDrop(){
    gdHideTimeout = setTimeout(() => {
      const el = document.getElementById('games-drop');
      if(el) el.classList.remove('open');
    }, 200);
  }
  function cancelHideGamesDrop(){ clearTimeout(gdHideTimeout); }

  function toggleFaq(el){
    const item = el.parentElement;
    const wasOpen = item.classList.contains('open');
    item.parentElement.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if(!wasOpen) item.classList.add('open');
  }
  function setBilling(btn, mode){
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const price = document.getElementById('pop-price');
    const period = document.getElementById('pop-period');
    const note = document.getElementById('pop-note');
    const cta = document.getElementById('pop-cta');
    if(mode === 'annual'){
      price.innerHTML = '€2<span style="font-size:16px;font-weight:600;">/mo</span>';
      period.textContent = '€24 billed yearly';
      note.textContent = 'Save 33% — billed once a year';
      cta.textContent = 'Get Annual — €2/mo';
    } else {
      price.textContent = '€3';
      period.textContent = 'per month';
      note.textContent = 'For teachers running regular classes';
      cta.textContent = 'Go Unlimited Monthly';
    }
  }
  function setDoc(btn, mode){
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('doc-terms').style.display = mode === 'terms' ? 'block' : 'none';
    document.getElementById('doc-privacy').style.display = mode === 'privacy' ? 'block' : 'none';
    document.getElementById('toc-terms').style.display = mode === 'terms' ? 'block' : 'none';
    document.getElementById('toc-privacy').style.display = mode === 'privacy' ? 'block' : 'none';
  }
  function setTab(btn, mode){
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('login-form').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = mode === 'signup' ? 'block' : 'none';
  }

  // all CTA buttons that say "Start Free" / "Start Playing Free" / etc route to login
  document.querySelectorAll('.btn').forEach(b => {
    const t = b.textContent.trim();
    if(!b.hasAttribute('onclick') && (t.includes('Start') || t.includes('Unlimited') || t.includes('Annual') || t.includes('Create') || t.includes('Log in') || t.includes('account'))){
      if(b.closest('#page-login')) return;
      b.style.cursor = 'pointer';
      b.addEventListener('click', () => { window.location.href = 'login.html'; });
    }
  });


  /* ============ GAME LIBRARY: single source of truth ============ */
  /* Every game's visual identity (icon, colors, tagline) lives here once,
     and renders into three places: the logo hover dropdown, the always-
     visible home page carousel, and the Game Library grid. */
  const GAME_LIBRARY = [
    { id:'hangman',    name:'Interactive Hangman',    short:'Hangman',        icon:'<img src="assets/icons/hangman.svg" alt="Hangman" class="game-icon-svg">', tint:'#DFF7FC', accent:'#00B8C4', tagline:'A fast, interactive vocabulary guessing game.', status:'beta', onClick:"window.location.href='hangman.html';" },
    { id:'guess-who',  name:'System Suspects',         short:'Sys. Suspects',  icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12S5.6 5.5 12 5.5 22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>', tint:'#DFF7FC', accent:'#00B8C4', tagline:'Isolate the target signal before you run out of moves.', status:'beta',
      onClick:"window.location.href='system-suspects.html';" },
    { id:'pictionary', name:'Multiplayer Pictionary',  short:'Pictionary',     icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.2L15.8 5 19 8.2 8.2 19 4 20Z"/><path d="M13.3 6.7l3 3"/></svg>', tint:'#EDE7FC', accent:'#6D4FE0', tagline:'One word. Six players. Total chaos.', status:'soon' },
    { id:'trivia',     name:'Team Trivia',             short:'Team Trivia',    icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v3.2a5 5 0 0 1-10 0V4Z"/><path d="M7 5.2H4.3v1.8a3 3 0 0 0 3 3M17 5.2h2.7V7a3 3 0 0 1-3 3"/><path d="M12 12.2V16M9.3 20h5.4M10 16h4v4h-4z"/></svg>', tint:'#FCE4F4', accent:'#D6317F', tagline:'The Baamboozle alternative that builds itself.', status:'soon' },
    { id:'word-search',name:'Word Search',             short:'Word Search',    icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="10" height="10" rx="1"/><path d="M6.2 6.2h3.6M6.2 9.4h3.6"/><circle cx="16.5" cy="16.5" r="4"/><path d="M19.6 19.6L22 22"/></svg>', tint:'#E1F7FA', accent:'#1B93B8', tagline:'Vocabulary, consolidated together.', status:'soon' },
    { id:'crossword',  name:'Crossword',               short:'Crossword',      icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>', tint:'#EFE9FC', accent:'#7C5CFA', tagline:'Intersecting words, one shared grid.', status:'soon' },
    { id:'spin-wheel', name:'Spin the Wheel',          short:'Spin the Wheel', icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 0 1 13-5"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5"/><path d="M17.5 3.2V7h-3.8M6.5 20.8V17h3.8"/></svg>', tint:'#FCE9FC', accent:'#A855C4', tagline:'Random picks. Zero awkward silence.', status:'soon' },
    { id:'two-truths', name:'Two Truths and One Lie',  short:'Two Truths',     icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9.5L5 20v-4H4V5Z"/><path d="M10.3 9.6a1.8 1.8 0 1 1 2.6 1.6c-.8.4-1.1.8-1.1 1.6"/><circle cx="12" cy="14.7" r="0.15" fill="currentColor" stroke="none"/></svg>', tint:'#E6E4FC', accent:'#5B4FCF', tagline:'Spot the fib, practice the follow-up questions.', status:'soon' },
    { id:'whiteboard', name:'Interactive Whiteboard',  short:'Whiteboard',     icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8 20l4-4 4 4M12 16.5V20"/></svg>', tint:'#EDEAF7', accent:'#6B6480', tagline:'Your always-on shared canvas.', status:'soon' },
  ];

  function renderGamesDropdown(){
    const track = document.getElementById('games-drop-track');
    if(!track) return;
    const cardHtml = (g) => {
      const liveCls = g.status === 'beta' ? ' live' : '';
      const clickAttr = g.status === 'beta' ? ` onclick="${g.onClick}"` : '';
      const statusHtml = g.status === 'beta' ? '<span class="beta">Beta</span>' : '<span class="soon">Coming soon</span>';
      return `<div class="game-drop-card${liveCls}"${clickAttr}><div class="gd-icon" style="background:${g.tint}; color:${g.accent};">${g.icon}</div><div class="gd-text"><h4>${g.name}</h4>${statusHtml}</div></div>`;
    };
    const once = GAME_LIBRARY.map(cardHtml).join('');
    track.innerHTML = once + once; // duplicated for the seamless marquee loop
  }

  function renderHomeCarousel(){
    const track = document.getElementById('home-carousel-track');
    if(!track) return;
    const chipHtml = (g) => {
      const statusCls = g.status === 'beta' ? 'live' : 'soon';
      const statusLabel = g.status === 'beta' ? 'BETA' : 'SOON';
      const clickAttr = g.status === 'beta' ? ` onclick="${g.onClick}" style="cursor:pointer;"` : '';
      return `<div class="hc-card"${clickAttr}><div class="hc-icon" style="background:${g.accent}; color:#F5F3FA;">${g.icon}</div><span class="hc-name">${g.short}</span><span class="hc-status ${statusCls}">${statusLabel}</span></div>`;
    };
    const once = GAME_LIBRARY.map(chipHtml).join('');
    track.innerHTML = once + once;
  }

  function renderGameLibrary(){
    const grid = document.getElementById('game-library-grid');
    if(!grid) return;
    grid.innerHTML = GAME_LIBRARY.map((g) => {
      const active = g.status === 'beta';
      const activeCls = active ? 'active' : 'disabled';
      const clickAttr = active ? ` onclick="${g.onClick}"` : '';
      const statusLabel = active ? 'PLAY NOW' : 'COMING SOON';
      const statusClass = active ? 'play' : 'soon';
      return `<article class="game-card ${activeCls}"${clickAttr}>
        <div class="gc-top" style="background:${g.tint};">
          <div class="gc-icon" style="background:${g.accent}; color:#F5F3FA;">${g.icon}</div>
          ${active ? '<span class="gc-live">LIVE BETA</span>' : ''}
        </div>
        <div class="gc-body">
          <h2>${g.name}</h2>
          <p class="gc-tag">${g.tagline}</p>
          <div class="gc-footer">
            <span class="gc-status ${statusClass}">${statusLabel}</span>
            ${active ? '<span class="gc-arrow">→</span>' : '<span class="gc-arrow muted">→</span>'}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  renderGamesDropdown();
  renderHomeCarousel();
  renderGameLibrary();
