-- D&D 5e SRD reference content tables.
-- Primary ruleset is 2024; spells/levels/rule_sections/rules and a chunk of
-- monsters are 2014-only (not yet published in the 2024 SRD), kept alongside
-- via the `ruleset` column rather than separate tables.

create table ability_scores (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on ability_scores (name);

create table alignments (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on alignments (name);

create table backgrounds (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on backgrounds (name);

create table classes (
  ruleset text not null,
  index text not null,
  name text not null,
  hit_die int,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on classes (name);

create table conditions (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on conditions (name);

create table damage_types (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on damage_types (name);

create table equipment_categories (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on equipment_categories (name);

create table equipment (
  ruleset text not null,
  index text not null,
  name text not null,
  categories text[],
  cost_qty numeric,
  cost_unit text,
  weight numeric,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on equipment (name);
create index equipment_categories_gin on equipment using gin (categories);

create table feats (
  ruleset text not null,
  index text not null,
  name text not null,
  type text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on feats (name);

create table features (
  ruleset text not null,
  index text not null,
  name text not null,
  class_index text,
  level_index text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on features (name);
create index on features (class_index);

create table languages (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on languages (name);

create table magic_items (
  ruleset text not null,
  index text not null,
  name text not null,
  rarity text,
  equipment_category text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on magic_items (name);

create table magic_schools (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on magic_schools (name);

create table monsters (
  ruleset text not null,
  index text not null,
  name text not null,
  type text,
  size text,
  challenge_rating numeric,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on monsters (name);
create index on monsters (challenge_rating);

create table poisons (
  ruleset text not null,
  index text not null,
  name text not null,
  type text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on poisons (name);

create table proficiencies (
  ruleset text not null,
  index text not null,
  name text not null,
  type text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on proficiencies (name);

create table skills (
  ruleset text not null,
  index text not null,
  name text not null,
  ability_score text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on skills (name);

create table species (
  ruleset text not null,
  index text not null,
  name text not null,
  size text,
  speed int,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on species (name);

create table subclasses (
  ruleset text not null,
  index text not null,
  name text not null,
  class_index text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on subclasses (name);
create index on subclasses (class_index);

create table subspecies (
  ruleset text not null,
  index text not null,
  name text not null,
  species_index text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on subspecies (name);
create index on subspecies (species_index);

create table traits (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on traits (name);

create table weapon_mastery_properties (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on weapon_mastery_properties (name);

create table weapon_properties (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on weapon_properties (name);

-- 2014-only supplements (spell list + level progression + core rules text
-- not yet present in the 2024 SRD dataset).

create table spells (
  ruleset text not null,
  index text not null,
  name text not null,
  level int,
  school text,
  concentration boolean,
  ritual boolean,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on spells (name);
create index on spells (level);
create index on spells (school);

create table levels (
  ruleset text not null,
  index text not null,
  name text,
  class_index text,
  level int,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on levels (class_index, level);

create table rule_sections (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on rule_sections (name);

create table rules (
  ruleset text not null,
  index text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ruleset, index)
);
create index on rules (name);

-- All SRD content is public reference data: readable by anyone, writable
-- only via direct SQL/service role (no insert/update/delete policy).
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'ability_scores','alignments','backgrounds','classes','conditions',
    'damage_types','equipment_categories','equipment','feats','features',
    'languages','magic_items','magic_schools','monsters','poisons',
    'proficiencies','skills','species','subclasses','subspecies','traits',
    'weapon_mastery_properties','weapon_properties','spells','levels',
    'rule_sections','rules'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "Public read access" on %I for select using (true)', t);
  end loop;
end $$;
