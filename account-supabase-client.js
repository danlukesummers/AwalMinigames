/* AWAL Minigames: public Supabase client. Never put a service-role key here. */
(function(){
  const SUPABASE_URL = 'https://deaofitkmcwiovxwurzl.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7uGsYzWEnISEJJt2v3e36A_PZXMr7cF';
  if(!window.supabase || !window.supabase.createClient){
    console.error('Supabase JS failed to load.');
    return;
  }
  window.awalSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
})();
