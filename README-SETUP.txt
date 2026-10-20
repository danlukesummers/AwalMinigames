AWAL Minigames — separate Supabase account and game projects

IMPORTANT: this package is for the ACCOUNT / PREMIUM project only. It does not replace your existing game Supabase client.

PROJECT A — EXISTING GAME BACKEND (leave unchanged)
- Project URL: https://birqqkztlmrcmxzgmzdh.supabase.co
- Keep your existing supabase-client.js exactly as it is. It imports createClient and exports `supabase` for the multiplayer game code.
- Keep your existing lobbies and lobby_progress tables, columns, RLS policies and realtime setup. Do not run the account SQL in this project.
- The SQL you supplied for current_word_index, time_limit, round_started_at and lobby_progress is a game-project migration; it is not mixed into the account schema here.

PROJECT B — ACCOUNT / PREMIUM BACKEND (new auth system)
- Project URL: https://deaofitkmcwiovxwurzl.supabase.co
- Run account-supabase-setup.sql in THIS project's Supabase Dashboard > SQL Editor.
- Configure Auth URL settings for https://awal-minigames.vercel.app and allow https://awal-minigames.vercel.app/**.
- Enable the Email provider.

FILES TO ADD / REPLACE IN YOUR WEBSITE REPOSITORY
1. Replace the existing login.html with this package's login.html.
2. Add account-supabase-client.js (note the name: do not overwrite your existing supabase-client.js).
3. Add auth.js.
4. Add reset-password.html.
5. Add admin.html and admin.js.
6. Add api/redeem-invite.js.
7. Add api/admin/invitations.js.
8. Keep your existing main.js, styles.css and game supabase-client.js unchanged.
9. Run account-supabase-setup.sql ONLY in project deaofitkmcwiovxwurzl.
10. Add the environment variables from VERCEL-ENV.txt to Vercel and redeploy.

VERCEL ENVIRONMENT VARIABLES
- SUPABASE_URL = account project URL (deaofitkmcwiovxwurzl)
- SUPABASE_PUBLISHABLE_KEY = publishable key for account project
- SUPABASE_SERVICE_ROLE_KEY = secret service-role key for account project (Vercel only; never browser code)
- ADMIN_EMAIL = the exact email address you use as the admin account
- SITE_URL = https://awal-minigames.vercel.app

FIRST USE
1. Create a user account with the email you chose for ADMIN_EMAIL and confirm it if prompted.
2. Open https://awal-minigames.vercel.app/admin.html and log in.
3. Generate Unlimited or Academy invitation links and save/copy the link immediately; full tokens are shown only once.
4. Recipients sign up or log in through the link; the invite redemption endpoint applies the invited plan to their account profile.

LIMITATIONS / NOTES
- Google sign-in is intentionally inactive until Google OAuth is configured.
- This stores plan entitlement in the account project's user_profiles table. Existing game features do not automatically become paywalled; integration with paid-only features is a separate task.
- Supabase's default email sender is rate-limited; configure custom SMTP before broad public signup.
- Keep the game and account project keys distinct. Never place the account project's service-role key in browser files or commit it to the repository.
