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

## Character-sheet computation (`src/lib/character-sheet.ts`)
Shared module — both `ReviewStep` (builder preview) and `PlaySheet` (the dynamic
sheet) resolve a `CharacterDraft` through `buildCharacterSheet()` rather than each
having their own copy of the derivation logic. If you add a new derived stat, add it
here once, not in both call sites.

**The "skill-" prefix trap:** the `proficiencies` table uses prefixed indexes
("skill-athletics") to reference skills; the `skills` table itself uses the bare
index ("athletics"). `draft.skillChoices` and `background.proficiencies` are
proficiency-table refs (prefixed); `refs.skills[].index` is bare. Always strip the
prefix (`.replace(/^skill-/, "")`) before comparing — `buildCharacterSheet` does this
when building the `proficientSkills` set. Got this wrong once already during the
ReviewStep refactor (skills silently showed as non-proficient); the play sheet's full
skill list is what surfaced it, since ReviewStep only showed 2 chosen skill names and
didn't expose enough surface area to catch the bug visually.

Crit damage: roll the weapon's dice twice (`doubleDiceNotation`), add the ability
modifier **once**, not twice. The modifier must travel with the `DiceLogEntry`
(`critDamageBonus`) since the crit-confirm tap happens in a later render than the
original attack roll — don't try to recompute it by re-deriving the weapon at that
point, the entry needs to carry everything it needs to resolve itself.

## Play sheet (`/characters/[id]`, `src/components/playsheet/`)
Dynamic generalization of the original hand-built Angrenor HTML sheet. Per-character
play state (HP, temp HP, hit dice used, death saves, equipped items, roll mode)
persists to localStorage keyed by `tavern_play_${characterId}` — separate from the
character's saved build (which lives in Supabase). Dice log is session-only, not
persisted (resets on reload — this is intentional, not a gap).

**Deferred / not yet built** (don't assume these work — verify against
`PlaySheet.tsx` before telling a user they exist):
- Fighting Styles (e.g. Defense +1 AC) — not modeled at all yet
- Class-specific resources beyond Hit Dice + Death Saves (Second Wind, Rage, Spell
  Slots, etc.) — only universal resources are tracked
- Species/subspecies-trait-granted skill proficiencies (e.g. a trait granting
  Perception proficiency) — only class-chosen + background-granted skills count
  toward `proficient`
- Custom item/weapon builder
- The rich per-element "explain the rule" detail panels from the original sheet —
  current version just shows computed numbers
- Mobile phone-tab-bar navigation — responsive stacking only for now
- Light/dark theme toggle — the whole app is dark-only by design already (unlike the
  original standalone sheet, which needed its own theme system)

These are why a generated sheet's AC/HP can legitimately differ from a hand-built
reference sheet for the same concept character (e.g. Angrenor) — it's not a
calculation bug, it's uncovered class/feat content.

## Public share links
`characters.is_public` (boolean, default false) + a second permissive RLS SELECT
policy ("Public characters are viewable by anyone", `is_public = true`) — Postgres
OR's multiple permissive policies together, so a row is visible if EITHER the owner
policy OR the public policy matches. INSERT/UPDATE/DELETE stay owner-only
(`auth.uid() = user_id`); sharing only ever widens read access, never write access.
Migration at `supabase/migrations/20260623013000_add_character_public_sharing.sql`.

The character's own UUID `id` doubles as the unguessable share token — no separate
token column. `/characters/[id]/page.tsx` no longer hard-requires sign-in: it queries
the row (RLS decides visibility for owner/public/neither), then separately checks
`userData.user?.id === character.user_id` to compute `isOwner` for UI purposes only
(showing the `ShareControl` toggle, hiding the read-only notice). "Not found" is the
single response for "doesn't exist", "exists but private and not yours", and "exists
but you're not signed in" — collapsing these is deliberate, not an oversight: a
distinct "this is private" message would leak that a given ID corresponds to a real
private character.

`setCharacterPublic` (`src/app/characters/actions.ts`) double-enforces ownership: the
Server Action filters `.eq("user_id", userData.user.id)` itself, AND the UPDATE RLS
policy would reject a forged request anyway even if that filter were ever removed.
Verified by testing three identities against one private character: owner (sees it),
a second signed-in user (404), and signed-out/anonymous (404) — only flipping
`is_public` changes the latter two from 404 to a working read-only sheet.

Non-owners get a full *working* sheet, not a stripped-down preview — dice
rolls/HP/equip-toggle all function normally for them. This is safe because none of it
writes back to Supabase; the play sheet's entire interactive state is
client-side-only localStorage (see "Play sheet" above), so a stranger playing with
someone else's public character can't affect the owner's actual data.

## Parties (`/parties`, `/parties/[id]`, `src/app/parties/actions.ts`)
A party is a named group whose own UUID is its share link (same token model as
character sharing). `parties` (id, name, created_by) + `party_characters` join table
(party_id, character_id) — many-to-many, a character can be in multiple parties.

Adding a THIRD permissive SELECT policy on `characters` ("in a party → visible to
anyone", `exists` against `party_characters`) makes party membership work via the
*existing* character play-sheet route with no changes needed there — visibility is
just "owner OR public OR party-member," all three OR'd by Postgres automatically.
Write access (insert/update/delete on `characters` itself) is untouched by any of
this; you can only add your OWN characters to a party (`party_characters` insert
policy checks `characters.user_id`), never someone else's, even if you created the
party.

**Leader:** `parties.created_by` doubles as "the leader," no separate role column.
Two leader-only capabilities, both via a second permissive policy that ORs with the
member-scoped one rather than replacing it:
- Remove ANY character from the party (`party_characters` DELETE: "owner of the
  character" OR "leader of the party" — two separate policies, RLS ORs them). The
  `removeCharacterFromParty` action has no explicit ownership check of its own; it
  relies entirely on this OR composition, same character used both ways depending
  on who's calling it.
- Rename the party (`parties` UPDATE, leader-only — members can't rename).
No "kick a member's account" concept exists — leadership control is scoped to
characters and the party's own name, not to membership in some broader sense.
Leadership itself isn't transferable for now (whoever created it leads it,
permanently) — don't add transfer logic unless asked.

**Real bug this surfaced, worth re-reading before adding a 4th permissive SELECT
policy to `characters`:** `/characters/page.tsx` ("My Characters") queried
`characters` with NO `user_id` filter, trusting RLS alone to scope it to "mine." That
was fine with one owner-only policy, but the moment a second/third permissive policy
existed, the *same unfiltered query* started returning OTHER people's
public/party-shared characters too — Bob's "My Characters" page showed Alice's
private character the instant her character joined a party with one of Bob's
characters in it. Fixed by adding an explicit `.eq("user_id", userData.user.id)` —
**"My Characters" means owned-by-me, which is a stricter condition than
"visible-to-me," and must never be expressed by omitting a filter and hoping RLS
happens to land on the right set.** Audited every other `characters` query in the
codebase for the same mistake (none had it) — re-run that audit if you add another
permissive policy here. Caught by testing with two real separate accounts, not by
reading the policy SQL — the bug was in application code, not in Postgres.
