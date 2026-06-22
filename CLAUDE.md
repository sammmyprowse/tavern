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

## Homebrew content — IMPORTANT, read before touching backgrounds/feats/etc.
The free 2024 SRD only ships 4 backgrounds (Acolyte, Criminal, Sage, Soldier) — the
other 12 PHB backgrounds (Farmer, Artisan, Charlatan, Entertainer, Guard, Guide,
Hermit, Merchant, Noble, Sailor, Scribe, Wayfarer) are licensed Player's Handbook
content, NOT covered by the open SRD licence. They are NOT in 5e-bits/5e-database
for that reason, and must never be reproduced from WotC's actual text — that would
contradict Tavern's whole premise ("not a licensed product, not selling books") and
create real copyright exposure.

Those 12 are instead original homebrew: same mechanical shape (2 skills + 1 tool +
3-ability bonus choice + Origin feat from the 4 available in the SRD: Alert, Magic
Initiate, Savage Attacker, Skilled), but own flavor text and own grants — not copied
from any sourcebook. Stored in `backgrounds` with `ruleset = 'homebrew'` (vs '2024'
for the official 4), source JSON at `supabase/seed/homebrew-backgrounds.json`.
`getBackgroundsList()` in `src/lib/srd.ts` fetches both rulesets and exposes
`isHomebrew` — the UI (`BackgroundStep`, `ReviewStep`) must always visibly tag
homebrew entries as homebrew. Never silently blend them in as if official.

If extending this pattern to other content types (e.g. more feats), follow the same
rule: original mechanics/wording only, tagged `ruleset = 'homebrew'`, never a
reproduction of paid sourcebook text.

## Auth
Email + password via Supabase Auth (OAuth deferred until provider credentials exist —
see project memory). Uses `@supabase/ssr`, NOT the plain `@supabase/supabase-js`
client, for anything session-aware:
- `src/lib/supabase-browser.ts` — browser client, for Client Components
- `src/lib/supabase-server.ts` — server client (cookie-based), for Server
  Components/Server Actions that need the current user
- `src/proxy.ts` — refreshes the session cookie on every request. This is Next.js
  16's renamed `middleware.ts` (the "middleware" file convention is deprecated in
  favor of "proxy" — see AGENTS.md, this project tracks Next.js canary/latest
  breaking changes). Exported function is `proxy`, not `middleware`.
- `src/lib/supabase.ts` (the original plain client) stays in use for anonymous SRD
  reference reads — those tables are public and don't need session awareness.

Sign-up/in/out lives at `/login` (`src/app/login/`), Server Actions in
`src/app/login/actions.ts`. Email confirmation is ON for this project — signUp()
returns no session until confirmed; the UI handles both cases (immediate session vs
"check your email") rather than assuming one.

`Header` (`src/components/Header.tsx`, in root layout) shows sign-in state
everywhere. Adding it made the whole app dynamic (every route went from ○ Static to
ƒ Dynamic at build) since auth state can't be known at build time — expected, not a
regression.

## Characters table
`characters` (user_id → auth.users, name, draft jsonb, created_at, updated_at) with
RLS so users can only see/edit their own rows. `draft` stores the same
`CharacterDraft` shape the builder wizard uses — no separate save-format translation.
Save action at `src/app/builder/actions.ts` (`saveCharacter`), list page at
`src/app/characters/page.tsx`. Migration at
`supabase/migrations/20260622213000_create_characters_table.sql`.

Casting `CharacterDraft` ⇄ the generated `Json` type needs `as unknown as X` — a
plain TS interface doesn't structurally satisfy `Json`'s index signature even though
every field is JSON-safe. Known/expected, not a bug to "fix" by loosening types.
