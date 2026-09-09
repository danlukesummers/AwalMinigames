// supabase-client.js
//
// Shared Supabase client used across the site (teacher lobby + student join).
//
// SECURITY NOTE, read before you touch these values:
// The two constants below are your Supabase Project URL and "publishable"
// key (Supabase's current name for what used to be called the "anon" key).
// Unlike your database password or a "service_role" key, the publishable
// key is DESIGNED to be public and shipped inside client-side code --
// Supabase's actual security boundary is the Row Level Security (RLS)
// policies on your tables (see supabase-schema.sql), not secrecy of this
// key. It is safe for this to be visible in your browser's dev tools.
//
// What is NOT safe: your service_role key. That key bypasses RLS entirely
// and must never appear in any file that ships to the browser, ever.
//
// Why this isn't `process.env.*`:
// This project is a plain static site with no build step (no bundler, no
// Next.js, no webpack) -- it's the exact same architecture you've been
// deploying to Vercel as-is. `process.env` is a Node/bundler-time concept
// and does not exist in browser JavaScript; referencing it here would just
// be `undefined` and silently break the whole app. Embedding the
// publishable key directly, as done below, is the correct pattern for a
// zero-build static app. If you later migrate this project to Next.js or
// add a bundler, move these two values into real environment variables at
// that point and inject them at build time instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://birqqkztlmrcmxzgmzdh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oKhe6XZxF9yMRxK6YkuMnw_rLIOXSzp';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
