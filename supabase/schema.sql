-- Arizona Pet Waste database.
-- Run once: Supabase dashboard > SQL Editor > New query > paste all of this > Run.
-- Only the website server (secret key) writes. A signed in customer can read their own row.

create table if not exists public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  phone text,
  address text,
  zip text,
  area text,
  plan text check (plan in ('week', 'twice', 'eow')),
  dogs int check (dogs between 1 and 20),
  first_visit date,
  gate_code text,
  gate_notes text,
  dog_names text,
  problem_spots text,
  skip_spray boolean not null default false,
  texts_visit boolean not null default false,
  texts_deals boolean not null default false,
  status text not null default 'new',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_stripe_customer_idx on public.customers (stripe_customer_id);
create index if not exists customers_first_visit_idx on public.customers (first_visit);
alter table public.customers enable row level security;
drop policy if exists "customers read own row" on public.customers;
create policy "customers read own row" on public.customers
  for select to authenticated using ((select auth.uid()) = id);

-- Every text consent yes or no, with the exact words the person saw. Keep this for carrier and TCPA records.
create table if not exists public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  phone text,
  kind text not null,
  granted boolean not null,
  text_shown text not null,
  page text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.consent_log enable row level security;

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null,
  zip text,
  ip text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;

-- Handy view for the owner: who is booked and when they start.
create or replace view public.route_sheet with (security_invoker = true) as
  select first_visit, name, phone, address, zip, area, plan, dogs, gate_code, gate_notes, dog_names, problem_spots, skip_spray, texts_visit, status
  from public.customers
  where status in ('trialing', 'active', 'past_due')
  order by first_visit, zip, address;
