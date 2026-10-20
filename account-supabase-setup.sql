-- AWAL Minigames authentication and Premium invitations.
-- Run once in Supabase Dashboard > SQL Editor.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  plan text not null default 'free' check (plan in ('free','unlimited','academy')),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile" on public.user_profiles
  for select to authenticated using (auth.uid() = id);

create or replace function public.handle_new_awal_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, plan)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name',''), 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_awal on auth.users;
create trigger on_auth_user_created_awal
  after insert on auth.users
  for each row execute procedure public.handle_new_awal_user();

create table if not exists public.premium_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  plan text not null check (plan in ('unlimited','academy')),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.premium_invites enable row level security;
-- No client policies: invite rows are accessible only to server endpoints using the service-role key.

create or replace function public.redeem_premium_invite(p_token_hash text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare invite_row public.premium_invites%rowtype;
begin
  select * into invite_row
  from public.premium_invites
  where token_hash = p_token_hash
  for update;

  if not found then raise exception 'Invitation is invalid.'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then raise exception 'Invitation has expired.'; end if;
  if invite_row.max_uses is not null and invite_row.uses >= invite_row.max_uses then raise exception 'Invitation has already reached its use limit.'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'User account not found.'; end if;

  insert into public.user_profiles (id, plan, updated_at)
  values (p_user_id, invite_row.plan, now())
  on conflict (id) do update set plan = excluded.plan, updated_at = now();

  update public.premium_invites set uses = uses + 1 where id = invite_row.id;
  return jsonb_build_object('ok', true, 'plan', invite_row.plan);
end;
$$;
revoke all on function public.redeem_premium_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_premium_invite(text, uuid) to service_role;
