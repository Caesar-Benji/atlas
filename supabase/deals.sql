-- Atlas v74 — Deals: products gathered daily from the shops, their price history, Benji's flags.
-- Written by the `deals-ingest` Edge Function (service role, bearer token in webhook_tokens);
-- read by the app as the signed-in owner (RLS). Run once in the SQL editor / via migration.

create table if not exists public.deal_products (
  id            bigserial primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop          text not null,                 -- 'gant' | 'adidas' | 'ksp' | 'outline' | 'redback' | 'benda' | 'terminalx' | 'nike' | 'mous'
  external_id   text not null,                 -- the shop's own id / sku
  url           text not null,
  title         text not null,
  brand         text,
  category      text,                          -- 'clothes' | 'shoes' | 'hats' | 'bags' | 'watches' | 'audio' | 'desk' | 'apple' | 'lights' | 'other'
  kind          text,                          -- finer: 'polo','shirt','knit','jacket','pants','sneakers','soundbar','dock','keyboard',…
  gender        text default 'men',
  image_url     text,                          -- primary photo
  images        jsonb not null default '[]',   -- every gallery photo url, in the shop's order
  description   text,
  color         text,
  sizes         jsonb not null default '[]',   -- [{"size":"XL","in_stock":true}, …] as the shop reports it
  my_size       boolean,                       -- true when one of Benji's sizes is in stock, null when the shop doesn't say
  attrs         jsonb not null default '{}',   -- the shop's raw attributes / tags / labels, untouched
  currency      text not null default 'ILS',
  score         numeric not null default 0,
  first_seen    date not null default current_date,
  last_seen     date not null default current_date,
  active        boolean not null default true, -- false once a run no longer lists it
  created_at    timestamptz not null default now(),
  unique (user_id, shop, external_id)
);
create index if not exists deal_products_user_active on public.deal_products (user_id, active, score desc);

create table if not exists public.deal_prices (
  product_id    bigint not null references public.deal_products(id) on delete cascade,
  seen_on       date not null default current_date,
  price         numeric not null,
  compare_price numeric,                       -- the shop's "was" price when it shows one
  discount_pct  integer,                       -- round((1 - price/compare_price)*100), null without a compare price
  primary key (product_id, seen_on)
);

create table if not exists public.deal_runs (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  shop          text not null,
  runner        text not null,                 -- 'github' | 'mac'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running', -- 'running' | 'ok' | 'error'
  items_seen    integer default 0,
  items_kept    integer default 0,
  error         text
);
create index if not exists deal_runs_user_shop on public.deal_runs (user_id, shop, started_at desc);

create table if not exists public.deal_flags (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id    bigint not null references public.deal_products(id) on delete cascade,
  flag          text not null check (flag in ('wish','hidden')),
  price_at      numeric,                       -- price when flagged, so the watchlist can show the change
  created_at    timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.deal_products enable row level security;
alter table public.deal_prices   enable row level security;
alter table public.deal_runs     enable row level security;
alter table public.deal_flags    enable row level security;

-- owner-only, same four-policy pattern as the rest of Atlas
do $$
declare t text;
begin
  foreach t in array array['deal_products','deal_runs','deal_flags'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);
    execute format('create policy "%1$s_select" on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "%1$s_insert" on public.%1$s for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_update" on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_delete" on public.%1$s for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- prices belong to the product's owner
drop policy if exists "deal_prices_select" on public.deal_prices;
create policy "deal_prices_select" on public.deal_prices for select to authenticated
  using (exists (select 1 from public.deal_products p where p.id = product_id and p.user_id = auth.uid()));

-- one row per active product: today's price, yesterday's, the lowest ever, the flag
create or replace view public.deal_today with (security_invoker = true) as
select
  p.*,
  c.price, c.compare_price, c.discount_pct, c.seen_on,
  (select d.price from public.deal_prices d where d.product_id = p.id and d.seen_on < c.seen_on order by d.seen_on desc limit 1) as prev_price,
  (select min(d.price) from public.deal_prices d where d.product_id = p.id) as lowest_price,
  (select count(*) from public.deal_prices d where d.product_id = p.id)::int as days_seen,
  f.flag, f.price_at as flag_price,
  (p.attrs->>'on_sale')::boolean as on_sale
from public.deal_products p
join lateral (select * from public.deal_prices d where d.product_id = p.id order by d.seen_on desc limit 1) c on true
left join public.deal_flags f on f.product_id = p.id and f.user_id = p.user_id
where p.active;

-- the GitHub / Mac runners authenticate with a bearer token; its SHA-256 goes here
-- insert into public.webhook_tokens (user_id, label, token_sha256) values ('<uid>', 'github-deals', '<sha>');
