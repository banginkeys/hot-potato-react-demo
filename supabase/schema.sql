create extension if not exists pgcrypto;

create table if not exists public.social_potatoes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('normal', 'tainted', 'golden', 'pigeon')),
  from_name text not null default 'A friend',
  target_handle text,
  target_name text,
  message text,
  claimed_at timestamptz,
  claimed_by_name text,
  created_at timestamptz not null default now()
);

alter table public.social_potatoes
  add column if not exists message text;

alter table public.social_potatoes
  drop constraint if exists social_potatoes_kind_check;

alter table public.social_potatoes
  add constraint social_potatoes_kind_check
  check (kind in ('normal', 'tainted', 'golden', 'pigeon'));

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
  recovery_code_hash text,
  game_state jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.players
  add column if not exists recovery_code_hash text;

alter table public.players
  add column if not exists game_state jsonb not null default '{}'::jsonb;

create index if not exists players_last_seen_at_idx
  on public.players (last_seen_at desc);

create table if not exists public.player_friends (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  friend_id uuid not null,
  created_at timestamptz not null default now(),
  unique (player_id, friend_id),
  check (player_id <> friend_id)
);

create index if not exists player_friends_player_id_idx
  on public.player_friends (player_id, created_at desc);
