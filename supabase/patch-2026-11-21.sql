-- Arizona Pet Waste: texts that send on their own (Twilio), November 21, 2026.
-- Safe to run more than once. It only adds: no column, row or rule that the live site uses today is changed or removed.
-- Run this BEFORE the code that sends texts goes live.

-- What Twilio calls the message, why a text failed, and when the phone got it.
alter table public.messages add column if not exists provider_id text;
alter table public.messages add column if not exists error text;
alter table public.messages add column if not exists delivered_at timestamptz;
create index if not exists messages_provider_idx on public.messages (provider_id);
create index if not exists messages_customer_idx on public.messages (customer_id, created_at desc);

-- Two more states: the phone got the text, and a text a customer sent to us.
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('queued', 'sent', 'delivered', 'skipped', 'failed', 'received'));

-- When a customer replied STOP. START only turns texts back on for someone who had stopped.
alter table public.customers add column if not exists texts_stopped_at timestamptz;

-- The schedule is a day AND a time (Joe, November 21, 2026). The office sets both in the Field App, and that is what
-- tells the customer. service_time is the time on the service day ("10:30"), service_time2 the time on the second day
-- of a twice a week plan (empty means the same time). visit_time is a change for that one visit.
alter table public.customers add column if not exists service_time text check (service_time is null or service_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.customers add column if not exists service_time2 text check (service_time2 is null or service_time2 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.stops add column if not exists visit_time text check (visit_time is null or visit_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
