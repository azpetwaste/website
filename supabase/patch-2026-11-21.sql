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
