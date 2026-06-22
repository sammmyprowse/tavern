create table characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on characters (user_id);

alter table characters enable row level security;

create policy "Users can view their own characters" on characters
  for select using (auth.uid() = user_id);

create policy "Users can insert their own characters" on characters
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own characters" on characters
  for update using (auth.uid() = user_id);

create policy "Users can delete their own characters" on characters
  for delete using (auth.uid() = user_id);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security invoker set search_path = '';

create trigger characters_updated_at
  before update on characters
  for each row
  execute function update_updated_at_column();
