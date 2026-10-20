AWAL Minigames auth + invitation setup

Files to add/replace in your existing website repository:
- Replace login.html with this folder's login.html
- Add supabase-client.js
- Add auth.js
- Add reset-password.html
- Add admin.html
- Add admin.js
- Add api/redeem-invite.js
- Add api/admin/invitations.js
- Run supabase-setup.sql once in Supabase Dashboard > SQL Editor
- Add the environment variables from VERCEL-ENV.txt to Vercel and redeploy

Supabase Auth settings:
- Site URL: https://awal-minigames.vercel.app
- Redirect URL: https://awal-minigames.vercel.app/**
- Email provider enabled; email confirmation can remain enabled.

How to use:
1. Visit login.html and create an account with your chosen admin email.
2. Confirm the email if Supabase asks you to.
3. Add that exact email as ADMIN_EMAIL in Vercel; set the other server environment variables, including the service-role key, and redeploy.
4. Visit https://awal-minigames.vercel.app/admin.html and log in.
5. Generate Unlimited or Academy invitation links and copy each link immediately. The full token is intentionally only shown once.
6. Send the link to the recipient. They can sign up or log in; after authentication the invite is redeemed and their user_profiles.plan becomes unlimited or academy.

Notes:
- This keeps main.js and styles.css unchanged.
- Google buttons intentionally show a message until Google OAuth is configured in Supabase.
- The database records the user's plan, but the existing games/pricing UI must separately consult user_profiles.plan before unlocking any paid-only game features. This setup does not silently alter game rules or billing UI.
- Supabase's built-in email sender is rate-limited; configure custom SMTP before broad public signup.
