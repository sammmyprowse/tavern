create table parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index on parties (created_by);

create table party_characters (
  party_id uuid not null references parties(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (party_id, character_id)
);

create index on party_characters (character_id);

alter table parties enable row level security;
alter table party_characters enable row level security;

-- A party's UUID is its share token (same model as characters.is_public) — anyone
-- who has the id can see the party and its roster. Only the creator can create or
-- delete the party itself.
create policy "Anyone with the link can view a party" on parties
  for select using (true);

create policy "Users can create parties" on parties
  for insert with check (auth.uid() = created_by);

create policy "Creator can delete their party" on parties
  for delete using (auth.uid() = created_by);

create policy "Anyone with the link can view a party roster" on party_characters
  for select using (true);

-- You can only add/remove YOUR OWN characters to/from a party — never someone
-- else's, even if you created the party.
create policy "Users can add their own characters to a party" on party_characters
  for insert with check (
    auth.uid() = (select user_id from characters where id = character_id)
  );

create policy "Users can remove their own characters from a party" on party_characters
  for delete using (
    auth.uid() = (select user_id from characters where id = character_id)
  );

-- Being a member of any party makes a character visible to anyone — independent
-- of that character's own is_public flag. This is what lets party members see
-- each other's characters via the party link.
create policy "Characters in a party are viewable by anyone" on characters
  for select using (
    exists (select 1 from party_characters pc where pc.character_id = characters.id)
  );
