-- Suspended cards stay in the deck, with their progress, but leave the review queue until unsuspended.
alter table public.cards add column suspended boolean not null default false;
