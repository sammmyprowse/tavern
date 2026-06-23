-- The party leader (creator) can remove ANY character from their party — composes
-- via OR with the existing "owner can remove their own" policy, so removal is
-- allowed if you're either the character's owner or the party's leader.
create policy "Leader can remove any character from their party" on party_characters
  for delete using (
    auth.uid() = (select created_by from parties where id = party_id)
  );

-- The party leader can rename their party.
create policy "Leader can rename their party" on parties
  for update using (auth.uid() = created_by);
