-- Arizona Pet Waste: the house's confirmed pin, November 24, 2026.
-- Safe to run more than once. It only adds one empty column: nothing the live site uses today is changed or removed.
-- Joe, Nov 24, 2026: "My tech hit Get Directions, and it was trying to take him on a wild goose chase."
-- pin_at is when the crew's own GPS confirmed where the house is (the truck parked there and the visit was finished).
-- The Directions button drives to a confirmed pin. A house with no pin_at still gets its full address.
alter table public.customers add column if not exists pin_at timestamptz;
