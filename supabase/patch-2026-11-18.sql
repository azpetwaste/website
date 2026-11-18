-- Nov 18, 2026. Run once in the Supabase SQL Editor (safe to run again). It is also inside crm.sql.
-- 1. Who runs a route. A scooper always does. An owner or office person does when this is on.
alter table public.staff add column if not exists scoops boolean not null default false;
update public.staff set scoops = true where role = 'scooper' and not scoops;
-- 2. The first time a lead left New, so the Leads screen can show how fast the office reached them.
alter table public.leads add column if not exists contacted_at timestamptz;
