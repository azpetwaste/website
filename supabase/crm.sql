-- Arizona Pet Waste field desk (crew app, office, truck link).
-- Run once AFTER schema.sql: Supabase dashboard > SQL Editor > New query > paste all of this > Run. Safe to run again.
-- Only the website server (secret key) reads or writes these tables. Row level security is on with no public rules,
-- so a browser with the public key cannot read any of it.

-- Team. Only emails on this list can get a staff sign in code.
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique,
  name text not null,
  phone text,
  role text not null default 'scooper' check (role in ('owner', 'office', 'scooper')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

-- The first owner. Change the email if the owner signs in with a different one.
insert into public.staff (email, name, role) values ('info@arizonapetwaste.com', 'Joe', 'owner') on conflict (email) do nothing;

-- Default service day for each area (0 Sunday to 6 Saturday). New sign ups in that area get this day.
create table if not exists public.area_days (
  area text primary key,
  day smallint not null check (day between 0 and 6),
  updated_at timestamptz not null default now()
);
alter table public.area_days enable row level security;

-- Route fields on each customer.
alter table public.customers add column if not exists lat double precision;
alter table public.customers add column if not exists lng double precision;
alter table public.customers add column if not exists service_day smallint check (service_day between 0 and 6);
alter table public.customers add column if not exists service_day2 smallint check (service_day2 between 0 and 6);
alter table public.customers add column if not exists eow_week smallint check (eow_week in (0, 1));
alter table public.customers add column if not exists stop_order int;
alter table public.customers add column if not exists scooper_id uuid references public.staff (id) on delete set null;
alter table public.customers add column if not exists pause_from date;
alter table public.customers add column if not exists pause_until date;
alter table public.customers add column if not exists office_notes text;
-- Dates the customer skipped from My Yard (4 free skips a year).
alter table public.customers add column if not exists skips date[] not null default '{}';
create index if not exists customers_service_day_idx on public.customers (service_day);

-- One route per scooper per day.
create table if not exists public.routes (
  id bigint generated always as identity primary key,
  day date not null,
  staff_id uuid not null references public.staff (id) on delete cascade,
  status text not null default 'planned' check (status in ('planned', 'live', 'done')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (day, staff_id)
);
alter table public.routes enable row level security;

-- One stop per customer per visit day.
create table if not exists public.stops (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  day date not null,
  position int not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled', 'on_the_way', 'here', 'done', 'skipped', 'cant')),
  reason text,
  note text,
  photo_path text,
  no_photo boolean not null default false,
  code text not null unique,
  on_way_at timestamptz,
  arrived_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (day, customer_id)
);
create index if not exists stops_route_idx on public.stops (route_id, position);
create index if not exists stops_customer_idx on public.stops (customer_id, day desc);
alter table public.stops enable row level security;

-- GPS points while a route is live. Kept 30 days (the night before run deletes older points).
create table if not exists public.positions (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  speed real,
  heading real,
  at timestamptz not null default now()
);
create index if not exists positions_route_idx on public.positions (route_id, at desc);
alter table public.positions enable row level security;

-- Every text and email we send or plan to send. Until Twilio is approved, texts wait here as "queued"
-- and staff send them from the business phone with one tap, then mark them sent.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  customer_id uuid references public.customers (id) on delete set null,
  stop_id bigint references public.stops (id) on delete set null,
  kind text not null,
  channel text not null default 'sms' check (channel in ('sms', 'email')),
  to_addr text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  sent_by uuid references public.staff (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_status_idx on public.messages (status, created_at);
alter table public.messages enable row level security;

-- Waitlist, sign up requests and commercial quote requests in one list.
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  kind text not null default 'waitlist' check (kind in ('waitlist', 'signup_request', 'commercial', 'phone')),
  name text,
  email text,
  phone text,
  address text,
  zip text,
  details text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status, created_at desc);
alter table public.leads enable row level security;

-- Copy the waitlist into leads once, so the office sees everyone who already joined.
insert into public.leads (kind, name, email, phone, address, zip, details, created_at)
select 'waitlist', w.name, w.email, w.phone, w.address, w.zip, case when w.texts_ok then 'Text when we start there' else null end, w.created_at
from public.waitlist w
where not exists (select 1 from public.leads l where l.kind = 'waitlist' and l.created_at = w.created_at and coalesce(l.phone, '') = coalesce(w.phone, ''));

-- Private bucket for gate photos. Customers see a photo only through a link that expires.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gate-photos', 'gate-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Live map on the truck link: cached road route and traffic arrival time per stop, and the scooper's location consent.
alter table public.stops add column if not exists eta_at timestamptz;
alter table public.stops add column if not exists route_polyline text;
alter table public.stops add column if not exists route_at timestamptz;
alter table public.stops add column if not exists route_meters int;
alter table public.staff add column if not exists location_ok_at timestamptz;

-- Crash log. Server errors and crashes in the crew app or on a truck link. The office reads it on the Health tab.
create table if not exists public.errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null,
  path text,
  message text not null,
  detail text
);
create index if not exists errors_at_idx on public.errors (at desc);
alter table public.errors enable row level security;

-- Office settings saved from the Schedule tab: yards one scooper does in a day, and the days we scoop.
create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
