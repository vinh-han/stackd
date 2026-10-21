-- Stackd schema. Every row belongs to one user (guest or signed up); row-level security limits each user to
-- their own rows, so the browser talks to the database directly with the user's session.

create table public.decks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 200),
  accent_hue smallint not null,
  lang text,
  exam_date timestamptz,
  created_at timestamptz not null default now(),
  -- Target for the (deck_id, user_id) foreign keys below: a row can only point at its own user's deck.
  unique (id, user_id)
);

create table public.sources (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  deck_id uuid not null,
  title text not null,
  kind text not null check (kind in ('text', 'file')),
  chunks text[] not null,
  created_at timestamptz not null default now(),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);

create table public.cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  deck_id uuid not null,
  type text not null check (type in ('qa', 'cloze', 'definition', 'scenario', 'vocab')),
  topic text not null,
  subtopic text,
  front text not null,
  back text not null,
  source_ref text not null,
  source_id uuid references public.sources on delete set null,
  chunk_index int,
  source_quote text,
  -- ts-fsrs card state. `due` is copied out of it so due queries can use an index.
  srs jsonb not null,
  due timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);
create index cards_user_due on public.cards (user_id, due);

-- Every rating, kept for FSRS optimization, history and leech detection. No foreign key to cards:
-- logs outlive a deleted card.
create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null,
  deck_id uuid not null,
  grade smallint not null check (grade between 1 and 4),
  at timestamptz not null default now(),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);
create index review_logs_user_at on public.review_logs (user_id, at);

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  streak jsonb not null default '{"current": 0, "longest": 0, "lastDay": null, "freezes": 0}',
  updated_at timestamptz not null default now()
);

alter table public.decks enable row level security;
alter table public.sources enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.profiles enable row level security;

create policy "own rows" on public.decks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.review_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
