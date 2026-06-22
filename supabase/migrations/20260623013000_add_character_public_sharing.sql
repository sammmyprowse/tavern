alter table characters add column is_public boolean not null default false;

create policy "Public characters are viewable by anyone" on characters
  for select using (is_public = true);
