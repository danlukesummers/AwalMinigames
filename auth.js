/* AWAL Minigames authentication: email/password, password reset, and invite redemption. */
(function(){
  const client = window.awalSupabase;
  if(!client) return;
  const $ = (id) => document.getElementById(id);
  const message = $('auth-message');
  const query = new URLSearchParams(window.location.search);
  const inviteToken = query.get('invite');
  const nextPage = ['admin.html','games.html'].includes(query.get('next')) ? query.get('next') : 'games.html';
  const redirectUrl = (path) => window.location.origin + '/' + path;
  function showMessage(text, kind){
    if(!message) return;
    message.textContent = text;
    message.className = 'auth-message ' + (kind || 'info');
    message.style.display = 'block';
  }
  function setBusy(button, busy, label){
    if(!button) return;
    if(busy){ button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = label || 'Please wait…'; }
    else { button.disabled = false; if(button.dataset.originalText) button.textContent = button.dataset.originalText; }
  }
  async function redeemInvite(accessToken){
    if(!inviteToken) return true;
    const response = await fetch('/api/redeem-invite', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + accessToken },
      body: JSON.stringify({ token: inviteToken })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(data.error || 'This invitation could not be redeemed.');
    showMessage('Invitation accepted! Your ' + (data.plan === 'academy' ? 'Academy' : 'Unlimited') + ' access is active.', 'success');
    return true;
  }
  async function afterAuth(session){
    if(inviteToken){
      await redeemInvite(session.access_token);
      window.location.href = nextPage;
      return;
    }
    window.location.href = nextPage;
  }
  const loginButton = $('login-submit');
  const signupButton = $('signup-submit');
  if(inviteToken){
    const signupTab = document.querySelectorAll('.tabs button')[1];
    if(signupTab && typeof window.setTab === 'function') window.setTab(signupTab, 'signup');
    showMessage('You have a Premium invitation. Create an account or log in with the email you want to use, and the invitation will be applied.', 'info');
  }
  if(loginButton) loginButton.addEventListener('click', async function(){
    const email = $('l-email').value.trim();
    const password = $('l-pass').value;
    if(!email || !password){ showMessage('Enter your email address and password.', 'error'); return; }
    setBusy(loginButton, true, 'Logging in…');
    try{
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if(error) throw error;
      await afterAuth(data.session);
    }catch(error){ showMessage(error.message || 'Unable to log in. Please try again.', 'error'); }
    finally{ setBusy(loginButton, false); }
  });
  if(signupButton) signupButton.addEventListener('click', async function(){
    const name = $('s-name').value.trim();
    const email = $('s-email').value.trim();
    const password = $('s-pass').value;
    if(!name || !email || !password){ showMessage('Complete your name, email address and password.', 'error'); return; }
    if(password.length < 8){ showMessage('Your password must be at least 8 characters long.', 'error'); return; }
    setBusy(signupButton, true, 'Creating account…');
    try{
      const emailRedirectTo = redirectUrl('login.html') + (inviteToken ? '?invite=' + encodeURIComponent(inviteToken) : '');
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo }
      });
      if(error) throw error;
      if(data.session){ await afterAuth(data.session); }
      else showMessage('Account created. Check your email and click the confirmation link, then log in here to finish activating your account' + (inviteToken ? ' and apply your Premium invitation.' : '.'), 'success');
    }catch(error){ showMessage(error.message || 'Unable to create your account. Please try again.', 'error'); }
    finally{ setBusy(signupButton, false); }
  });
  const forgot = $('forgot-password');
  if(forgot) forgot.addEventListener('click', async function(event){
    event.preventDefault();
    const email = $('l-email').value.trim();
    if(!email){ showMessage('Enter your email address above first, then click Forgot password.', 'error'); return; }
    try{
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('reset-password.html') });
      if(error) throw error;
      showMessage('If an account exists for that email, a password-reset link will be sent. Check your inbox.', 'success');
    }catch(error){ showMessage(error.message || 'Could not send the reset email.', 'error'); }
  });
  document.querySelectorAll('[data-google-auth]').forEach(button => button.addEventListener('click', () => {
    showMessage('Google sign-in is not enabled yet. Please use email and password for now.', 'info');
  }));
})();
