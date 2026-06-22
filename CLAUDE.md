@AGENTS.md

# Tavern — D&D 5e Character Builder

## Stack
- Next.js (App Router, TypeScript), Tailwind CSS v4, Supabase (PostgreSQL)
- Hosted on Vercel, repo at github.com/sammmyprowse/tavern

## Design
- Dark parchment aesthetic: bg #0f1215, gold #b9933f, oxblood #7c241a
- Cinzel for headings (font-heading), EB Garamond for body (font-body)
- Every interactive element opens a detail panel explaining the rules
- Mobile-first: phone tab bar at ≤600px, no horizontal overflow

## Key conventions
- AC is dynamic (computed from equipped gear, never stored flat)
- Weapon masteries (Topple/Vex/Graze) are a core feature
- Client state in localStorage (play sheet), character data in Supabase
- SRD content from 5e-database project — open licence, free to use

## Supabase
- Project ref: xvqcirkatcetasluvmyb (Sydney ap-southeast-2)
- Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- Typed client at `src/lib/supabase.ts`, types generated into `src/lib/database.types.ts`
  (regenerate via Supabase MCP `generate_typescript_types` after schema changes)

## SRD content tables (public.*, all RLS read-only)
27 tables loaded from 5e-bits/5e-database, one per content category: ability_scores,
alignments, backgrounds, classes, conditions, damage_types, equipment_categories,
equipment, feats, features, languages, magic_items, magic_schools, monsters, poisons,
proficiencies, skills, species, subclasses, subspecies, traits,
weapon_mastery_properties, weapon_properties, spells, levels, rule_sections, rules.

Every table shares the same shape: `ruleset` ('2024' or '2014'), `index` (slug,
e.g. "battleaxe"), `name`, `data` (jsonb — full original record), plus a few
extracted columns per table for filtering (e.g. `equipment.cost_qty/weight`,
`spells.level/school`, `classes.hit_die`). Primary key is `(ruleset, index)`.

Primary ruleset is **2024** (current SRD). `spells`, `levels`, `rule_sections`,
`rules` are 2014-only — the 2024 SRD doesn't publish these yet. `monsters` holds
both: the 3 official 2024 stat blocks plus the full 334-monster 2014 list (the
2024 SRD's monster list is intentionally tiny). Query `where ruleset = '2024'`
by default and fall back to '2014' for the supplement-only tables.

Migration recorded at `supabase/migrations/20260622122024_create_srd_content_tables.sql`.
