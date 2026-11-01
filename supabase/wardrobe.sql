-- Wardrobe (v67): pieces and saved outfits. Run once in the Supabase SQL editor.
create table if not exists wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, brand text, kind text not null default 'other',
  color text, color_name text, size text, sku text, source text default 'manual',
  url text, img text, price numeric, bought_on date,
  status text not null default 'active', notes text,
  created_at timestamptz not null default now());
alter table wardrobe_items enable row level security;
create policy "own rows select" on wardrobe_items for select using (auth.uid() = user_id);
create policy "own rows insert" on wardrobe_items for insert with check (auth.uid() = user_id);
create policy "own rows update" on wardrobe_items for update using (auth.uid() = user_id);
create policy "own rows delete" on wardrobe_items for delete using (auth.uid() = user_id);
create table if not exists outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, slots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
alter table outfits enable row level security;
create policy "own rows select" on outfits for select using (auth.uid() = user_id);
create policy "own rows insert" on outfits for insert with check (auth.uid() = user_id);
create policy "own rows update" on outfits for update using (auth.uid() = user_id);
create policy "own rows delete" on outfits for delete using (auth.uid() = user_id);

-- v69: real garment measurements, typed in after taping the piece (null = estimated from the brand chart)
alter table wardrobe_items add column if not exists length_cm numeric, add column if not exists width_cm numeric;
