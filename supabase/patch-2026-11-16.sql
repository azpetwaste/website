-- Security patch, November 16, 2026. Safe to run more than once. It deletes nothing and changes no customer data.
-- How: Supabase, project arizonapetwaste, SQL Editor, paste this whole file, Run. It takes a second.
-- RUN on the live database on November 16, 2026, 9:40 pm (migration security_patch_2026_11_16). Kept as the record.
-- A new project does not need it: the same lines are in crm.sql.
-- What it does:
--   1. Adds the table the sign in lock counts in (5 wrong codes and that email waits 15 minutes).
--   2. Takes the table rights away from the two public keys, as a second lock behind row level security.
--   3. Adds the skips column My Yard has waited on since November 9.
-- After it runs, open /crew, Health tab: "Lock on wrong sign in codes" reads On.

-- Sign in lock. One row for every "email me a code" request and every code try on a staff email.
-- The server counts them: 5 code tries in 15 minutes, then that email waits. Rows older than two days are cleared
-- by the nightly job. Only the server reads or writes this table.
create table if not exists public.auth_tries (
  id bigint generated always as identity primary key,
  email text not null,
  kind text not null check (kind in ('send', 'try')),
  at timestamptz not null default now()
);
create index if not exists auth_tries_email_at on public.auth_tries (email, kind, at desc);
alter table public.auth_tries enable row level security;

-- Second lock on every table. Row level security already keeps the public keys out: no table has a public policy,
-- and customers can only read their own row. This takes away the table rights too, so a table that is ever left
-- without row level security by mistake is still closed. The website and the apps never read a table from the
-- browser. Everything goes through the server, which uses the service key and is not touched by this.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
    grant select on public.customers to authenticated; -- the "customers read own row" policy still decides which row
  end if;
end $$;


-- My Yard skips (waiting since November 9, 2026). Until this is there, a skip from My Yard falls back to a text.
alter table public.customers add column if not exists skips date[] not null default '{}';
