create extension if not exists pgcrypto;

create table if not exists public.social_potatoes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tainted', 'golden')),
  from_name text not null default 'A friend',
  target_handle text,
  target_name text,
  claimed_at timestamptz,
  claimed_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists social_potatoes_created_at_idx
  on public.social_potatoes (created_at desc);

create index if not exists social_potatoes_claimed_at_idx
  on public.social_potatoes (claimed_at);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  handle text not null unique,
  avatar_id integer not null default 0,
  wallet text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists players_last_seen_at_idx
  on public.players (last_seen_at desc);
