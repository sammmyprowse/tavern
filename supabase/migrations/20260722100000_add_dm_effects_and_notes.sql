-- DM Tier 2: DM-pushed character effects + per-character DM notes.
--
-- character_effects is the bridge between the DM screen and each player's
-- play sheet: the party leader inserts rows (a condition, a freeform effect,
-- or a rest prompt), the character's owner sees them on their sheet — live,
-- via Supabase Realtime — and either side can clear them. Play state itself
-- stays client-side localStorage; these rows are prompts/reminders layered on
-- top, never a server-side mutation of the player's sheet.

create table character_effects (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  -- 'condition' (one of the 15 standard conditions), 'effect' (freeform
  -- DM-authored text), or 'rest' (a Short/Long Rest call the player applies).
  kind text not null check (kind in ('condition', 'effect', 'rest')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on character_effects (character_id);
create index on character_effects (party_id);

alter table character_effects enable row level security;

-- Only the party's leader can push an effect, and only onto a character that
-- is actually in that party at the time.
create policy "Leader can apply effects to party characters" on character_effects
  for insert with check (
    auth.uid() = created_by
    and auth.uid() = (select created_by from parties where id = party_id)
    and exists (
      select 1 from party_characters pc
      where pc.party_id = character_effects.party_id
        and pc.character_id = character_effects.character_id
    )
  );

-- Visible to the character's owner and to the leader who applied it (two
-- permissive policies, OR'd by Postgres like every other multi-policy table
-- in this schema).
create policy "Owner can view effects on their characters" on character_effects
  for select using (
    auth.uid() = (select user_id from characters where id = character_id)
  );

create policy "Leader can view effects they applied" on character_effects
  for select using (auth.uid() = created_by);

-- Either side can clear an effect: the owner dismisses it from their sheet,
-- the DM withdraws it from the DM screen.
create policy "Owner can dismiss effects on their characters" on character_effects
  for delete using (
    auth.uid() = (select user_id from characters where id = character_id)
  );

create policy "Leader can remove effects they applied" on character_effects
  for delete using (auth.uid() = created_by);

-- Realtime: the play sheet subscribes to postgres_changes filtered by
-- character_id. REPLICA IDENTITY FULL so DELETE events still carry the old
-- row (without it they only carry the primary key, and the character_id
-- filter would silently drop them).
alter table character_effects replica identity full;
alter publication supabase_realtime add table character_effects;

-- Per-character DM notes, private to the party leader — players never see
-- them (no owner-side policy at all, unlike character_effects).
create table party_character_notes (
  party_id uuid not null references parties(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (party_id, character_id)
);

alter table party_character_notes enable row level security;

create policy "Leader can manage their party notes" on party_character_notes
  for all using (
    auth.uid() = created_by
    and auth.uid() = (select created_by from parties where id = party_id)
  )
  with check (
    auth.uid() = created_by
    and auth.uid() = (select created_by from parties where id = party_id)
  );
