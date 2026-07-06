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

## Leveling (Phase 0 of full 1-20 leveling — user-requested, in progress)
Full roadmap (subclass, ASI/feats, spells, spell slots, class resources) is in
project memory, not here — this section only covers what's actually shipped: core
level tracking, HP-per-level, and feature unlocking.

`CharacterDraft` (`src/lib/character.ts`) gained `level: number` and
`hpRolls: number[]`. Characters are always CREATED at level 1 (the builder wizard
never touches these fields — they just ride along at `EMPTY_DRAFT`'s defaults of
`1`/`[]`); level only ever advances via the play sheet's Level Up control, never
set directly. `hpRolls[0]` is the level-2 HP gain, `hpRolls[1]` is level-3, etc. —
level 1 HP itself is always `hitDie + conMod`, computed fresh, never stored.
`MAX_LEVEL = 20` gates both the Level Up button (hidden, "Maximum level reached"
shown instead) and the server action (rejects if already at 20).

`maxHp(hitDie, conMod, hpRolls)` replaced the old level-1-only `maxHpAtLevelOne`.
`hpGainForLevelUp(hitDie, conMod, roll)` applies the standard 5e floor — HP gained
per level beyond 1 is never less than 1, even for a Wizard/Sorcerer (d6) with a
negative CON mod. `fixedAverageHpGain(hitDie)` (`Math.floor(hitDie/2)+1`) is the
"take average" option; feeding ITS result into `hpGainForLevelUp` as the "roll"
applies the same floor-of-1 protection to the average path too, rather than
duplicating the floor logic at the call site.

**Local draft shadow state, not router.refresh():** `PlaySheet.tsx` shadows the
`draft` prop in `useState` (`currentDraft`) and derives `sheet` from that, not the
prop directly. A successful level-up calls `setCurrentDraft(result.draft)` for an
instant update — same instant-feedback pattern as the rest of the play sheet
(HP/equip toggle), rather than a server round trip.

`levelUpCharacter` (`src/app/characters/actions.ts`) takes an already-resolved
`hpGain: number` — the roll (via the existing dice engine) or the average happens
client-side same as every other dice roll on the sheet (e.g. Spend Hit Die); the
action's only job is to persist `level + 1` and the new `hpRolls` entry to
`characters.draft`, owner-filtered the same way `setCharacterPublic` is. Unlike
HP/temp-HP/death-saves (ephemeral, localStorage-only), level-up is permanent
progression and must hit Supabase.

**Features-by-class** (`getFeaturesForClass` in `src/lib/srd.ts`): the `features`
table has dedicated `class_index`/`level_index` columns (e.g. `level_index =
"fighter-3"`) on top of the usual `ruleset`/`index`/`name`/`data` shape — level is
parsed out of `level_index` by stripping the `"<classIndex>-"` prefix. 231 features
across all 12 classes, already tagged with real unlock levels and full prose in
`data.description` — no new content needed for this part. The play sheet's
Features section filters to `level <= sheet.level` and lets each row expand/collapse
its description independently (per-feature `Set<string>` of expanded indexes).

**Stale-localStorage trap, will recur on every future `CharacterDraft` schema
change:** `BuilderWizard.tsx` hydrates its draft from `localStorage` on mount. It
used to do `setDraft(JSON.parse(saved))` — a straight replace, no merge. The first
time this bit: adding `level`/`hpRolls` to `CharacterDraft` crashed the Review step
(`Cannot read properties of undefined (reading 'reduce')` in `maxHp`) for anyone
with an in-progress draft saved before that change, since the parsed object simply
lacked the new keys. Fixed to `setDraft({ ...EMPTY_DRAFT, ...JSON.parse(saved) })`.
**Any future field added to `CharacterDraft` needs this merge to already be in
place to pick up the new default — it is, but don't replace it with a bare
`JSON.parse` again.** `PlaySheet.tsx`'s own localStorage hydration (`PlayState`)
already merged against `defaultPlayState` from the start, so it never had this bug.
Caught by actually building a character through the wizard in a real browser, not
by build/lint — both were clean the whole time since this was a runtime-only crash
on stale client data, not a type error.

## Leveling (Phase 1 of full 1-20 leveling) — subclass + Cleric/Druid Order choice
`CharacterDraft` gained `subclassIndex: string | null` (set once level >= 3) and
`orderChoice: string | null` (Cleric's Divine Order / Druid's Primal Order, a
level-1 pick that's unrelated to subclass and only applies to those two classes).

**Content-gap decision, asked of and answered by the user before building this:**
the free SRD only has ONE subclass per class (Fighter→Champion, Cleric→Life
Domain, etc.) where the real PHB has 3-4. Rather than auto-assigning it silently
or homebrewing more options immediately, the user chose to ship a real picker UI
now — populated with just the one SRD option, designed to take more options later
— and revisit homebrewing additional subclasses as a separate future decision.
**The "Choose your subclass" panel always shows even when there's only one
option**, with an explicit "more options are coming later" note — don't collapse
this back down to an auto-assign just because there's currently nothing to choose
between.

`getSubclassesForClass` (`src/lib/srd.ts`) reads the `subclasses` table. Unlike
base class features, **subclass features are NOT in the shared `features` table**
— they're embedded directly in each subclass row's own `data.features[]` array
(name/level/description, levels 3/7/10/etc., no `index` field of their own).

**Real duplicate-features bug, caught by browser testing, not build/lint:** for
classes with only one SRD subclass, the source data also flattens some of that
subclass's level-3 features into the *base* `features` table under the parent
class (e.g. Cleric's `features` table already has rows for "Disciple of Life" and
"Preserve Life" — the same names that also appear in `life-domain`'s embedded
`features[]`). Merging both lists naively showed those features twice on the play
sheet. Fixed by deduping the subclass feature list against base feature names
before merging (`PlaySheet.tsx`) — generic by name, not hardcoded per class, since
which features overlap isn't consistent and shouldn't be assumed for the other 11
classes.

`chooseSubclass`/`chooseOriginOrder` (`src/app/characters/actions.ts`) follow the
same owner-gated persist-to-`draft` pattern as `levelUpCharacter`. All three now
share a `loadOwnedDraft`/`saveDraft` pair extracted once a third near-identical
action made the duplicated auth+fetch+ownership-filter preamble worth removing —
add any future per-character mutation action through these rather than
re-inlining the boilerplate.

UI: both pickers are "Pending Choice" panels on the play sheet, independent of the
Level Up control and of each other (`needsOrderChoice` / `needsSubclassChoice`),
shown owner-only, instant-feedback via the same `currentDraft` shadow-state pattern
Phase 0 established. Cleric/Druid's Order choice text is SRD prose split into two
selectable options (verbatim, not paraphrased) since the SRD only stores it as one
prose paragraph naming two sub-choices, not structured data — see `ORDER_CHOICES`
in `src/lib/character.ts`.

## Leveling (Phase 2) — ASI/Feats at levels 4/8/12/16/19
**Content-gap decision — different outcome than backgrounds/subclass:** the free
SRD only has 2 general feats (Ability Score Improvement, Grappler) vs ~20+ in the
real PHB. The user explicitly asked for the real PHB feats reproduced; that was
declined (regular copyright, no "personal use" exception for reproducing a whole
mechanically-dense rules chapter, unlike the openly-licensed SRD) — explained to
them directly rather than silently substituting something else. They chose, when
asked, a full original homebrew set instead: 20 feats at PHB-comparable breadth
and power (`supabase/seed/homebrew-feats.json`, `ruleset='homebrew'`,
`type='general'`), deliberately written with **no flat ability-score-increase
clauses** of their own — that mechanic is reserved for Ability Score Improvement
specifically, the one feat whose entire purpose is the numeric stat change. Every
other feat (Grappler included) is informational/listed only, same treatment as
class and subclass features — consistent with the rest of the app's existing
"real rule, text shown, not yet mechanically simulated" boundary (Fighting
Styles, Rage, etc.), not a new gap introduced by this phase.

`ASI_LEVELS = [4, 8, 12, 16, 19]`, hardcoded — 2024 rules unified every class onto
this same schedule (no more 2014-style bonus ASIs for Fighter/Rogue at different
levels), but like spell slots this repeating pattern isn't structured SRD data;
only the level-4 instance is tagged per class in the `features` table.

`CharacterDraft.featChoices: FeatChoice[]` — one entry per resolved level
(`{level, featIndex, abilityBonus}`). `finalAbilityScores` was generalized from a
single optional bonus to an array (`(AbilityBonusChoice | null)[]`), since a
character can take Ability Score Improvement more than once across different ASI
levels and every instance must stack — background's bonus plus one per ASI pick,
all applied in `character-sheet.ts`. Each final score is clamped to 20 (the real
rule), which matters once background + multiple ASI picks could otherwise stack
past it; the feat-choice picker UI also proactively excludes already-maxed
abilities from its dropdowns so a choice never gets "wasted" on a no-op +1/+2.

**Same duplicate-features bug as Phase 1, different cause:** the base `features`
table has a generic "Ability Score Improvement" marker feature at level 4 for
every class (informational placeholder, present regardless of what's actually
chosen). Once that level's choice resolves, the real pick (which might be
Grappler, a homebrew feat, or ASI itself) needs to replace that generic marker,
not sit next to it. Fixed in `PlaySheet.tsx` by dropping any base feature named
exactly "Ability Score Improvement" whose level has an entry in `featChoices` —
narrower than Phase 1's name-based dedupe (that was about incidental overlap with
subclass content; this is about a generic placeholder always present at level 4
regardless of class or choice). **Any future per-level "you get a choice here"
generic marker in the base features data will hit this same bug shape** — drop
the marker once that level's real choice is resolved, don't just merge and dedupe
by name.

Most feats can only be taken once; Ability Score Improvement is the explicit
exception (its own SRD text says so) and is the only one excluded from the
already-taken filter in both the picker UI and `chooseFeat`'s server-side check.

## Class resources — Rogue (Expertise, Sneak Attack)
First of the class-by-class resource passes (user-prioritized: Rogue, Wizard,
Sorcerer, Cleric next). Unlike the licensing-gapped content (backgrounds,
subclasses, feats), Rogue's resources are pure SRD mechanics with no
content-gap question — both needed hardcoded progressions for the same reason
spell slots will: the SRD's feature text names the mechanic but references an
external table ("as shown in the Sneak Attack column of the Rogue Features
table") that isn't itself in the structured data.

`sneakAttackDice(level)` = `Math.ceil(level / 2)` — the real, unchanged-since-
2014 progression (1d6 at level 1, +1d6 every 2 levels). Exposed on
`CharacterSheet.sneakAttackDice` (null for non-Rogues). Surfaced as a "Roll Xd6"
button in the Attacks section, NOT auto-added to weapon attacks — Sneak Attack's
real conditions (Advantage, or an ally adjacent and no Disadvantage, once per
turn, Finesse/Ranged weapon only) aren't tracked by the sheet, so whether it
applies is the player's judgment call, same as Fighting Style/Second Wind/Rage
text being shown but not auto-applied.

`CharacterDraft.expertiseChoices: string[]` — bare skill indexes with doubled
proficiency bonus. `EXPERTISE_SCHEDULE` (`src/lib/character.ts`) models WHEN and
HOW MANY as milestones (`{level, count}[]`) keyed by class, not hardcoded to
Rogue specifically — Bard gets Expertise too at a higher level in 2024 rules, so
this can extend without a shape change when that class's pass comes up. The
picker only offers skills the character is already proficient in (Expertise
requires existing proficiency) and excludes ones already chosen; `chooseFeat`'s
sibling `chooseExpertise` validates the milestone is reached, not already
resolved, and the right count was submitted — same rigor level as the other
choice actions, not deeper (e.g. it does NOT re-derive proficiency server-side,
consistent with `chooseSubclass` not re-validating its index against the real
subclass list either — this is an owner-only mutation on the player's own
character, not an adversarial multi-tenant boundary).

`ResolvedSkill.expertise: boolean` added alongside `proficient` —
`character-sheet.ts`'s skill bonus calc multiplies proficiency bonus by 2 when
both are true. Skills list shows `••` for Expertise vs `•` for plain
proficiency so the two are visually distinct, not just numerically.

## Pending-choice picker UX — two improvements applied to all pickers
User feedback after Rogue shipped: pickers should explain what each option
actually does, not just name it, and subclass should be prominent on the
sheet once chosen.

**Subclass picker now shows the full feature list, not just the one-line
summary.** Changed from "click a card to immediately choose it" to a
select-then-confirm flow (matching the Feat picker's existing pattern):
clicking a subclass card expands its feature list (name + level, each
independently expandable to full description via the same `expandedFeatures`
Set/`toggleFeature` the Features section already uses, just with a
`picker-${subclassIndex}-${featureName}` key prefix to stay collision-free), a
separate "Confirm {name}" button actually commits it. This was a deliberate
upgrade, not just decoration — once more than one subclass option exists per
class (the open future homebrew question from Phase 1), immediate-commit-on-
click would risk locking in a permanent choice before reading what it does.

**Header now shows "{ClassName} ({SubclassName})" as a prominent subtitle**
directly under the character name (gold-light, bold — between the name and
the smaller "Level X species — background" line), e.g. "Fighter (Champion)".
Shows just the class name before a subclass is chosen. The smaller line below
no longer repeats the class name, to avoid showing it twice.

## Class resources — Wizard spellcasting
Second class-by-class pass (after Rogue), and the first to need real
spellcasting infrastructure — built generically so Sorcerer/Cleric's passes
can reuse it rather than duplicating per class.

**`ClassOption.spellcastingAbility: AbilityKey | null`** (`src/lib/srd.ts`) —
parsed from `classes.data.spellcasting.spellcasting_ability.index`, null for
non-casters. Generic by design, not Wizard-specific.

**Hardcoded math in `character.ts`** (same reasoning as every other hardcoded
table in this app — the SRD's spellcasting text references "the [Class]
Features table" but never ships it as structured data):
- `fullCasterSlots(level)` — the standard 9-level full-caster slot table,
  shared by Bard/Cleric/Druid/Sorcerer/Wizard alike. Half-casters and
  Warlock's Pact Magic use different tables, not modeled yet.
- `preparedSpellCount(level, abilityMod)` = `max(1, level + abilityMod)` —
  the 2024 rules' unified prepared-caster formula (replaces 2014's separate
  fixed tables for Wizard/Cleric/Druid). Cross-checked against the SRD's own
  Wizard text, which uses "choose four spells" as its level-1 example —
  consistent with a +3 INT modifier (1 + 3 = 4).
- `spellSaveDC`/`spellAttackBonus` — standard formulas, no surprises.
- `wizardCantripsKnown(level)` — deliberately NOT named generically. Confirmed
  from Wizard's own spellcasting text (3 at level 1, +1 at level 4, +1 at
  level 10) — don't assume Sorcerer/Cleric match this without checking each
  one's own text when that class's pass comes up.

**`getSpellsForClass(classIndex)`** (`src/lib/srd.ts`) reads the `spells`
table — 2014 ruleset only (2024 SRD hasn't published spells yet; close to but
not guaranteed byte-identical to 2024 spell text). No `class_index` column
here unlike features/subclasses, so class membership is checked against the
nested `data.classes[]` array client-side after fetching the whole ruleset,
not pushed down as a Postgres filter.

**Known cantrips and prepared spells are NOT a permanent choice log** like
feats/subclass/Expertise — 2024 rules let prepared casters swap their list on
every Long Rest, so `CharacterDraft.knownCantrips`/`preparedSpells` are plain
overwritable `string[]`, and `setKnownCantrips`/`setPreparedSpells`
(`src/app/characters/actions.ts`) just replace the array wholesale rather than
append-validate like `chooseFeat`/`chooseExpertise` do.

**Spell slot expenditure is play state, not draft state** — lives in
`PlaySheet`'s local `PlayState.expendedSlots: number[]` (localStorage), not
`CharacterDraft` (Supabase), for the same reason current HP and hit-dice-used
already are: it's moment-to-moment combat bookkeeping that resets every Long
Rest, not a permanent build choice. `longRest()` now also clears
`expendedSlots` alongside its existing HP/death-save resets.

Tested live with INT 16 (not the builder's default +0, deliberately bumped via
SQL for a meaningful test): Spell Save DC 13, Spell Attack +5, 2 level-1 slots,
3 cantrips known, 4 prepared spells — every number matched the formulas
exactly. Verified slot expend/restore and Long Rest, persistence of cantrips/
prepared spells across reload, and that the prepared-spell picker correctly
excludes spells above the character's available slot level.

## Class resources — Sorcerer spellcasting
Third class-by-class pass. Reused every piece of Wizard's spellcasting
infrastructure unchanged (`ClassOption.spellcastingAbility`, `fullCasterSlots`,
`preparedSpellCount`, `spellSaveDC`/`spellAttackBonus`, `getSpellsForClass`,
`setKnownCantrips`/`setPreparedSpells`) — only two things needed to be added,
and both were confirmed from Sorcerer's own SRD text rather than assumed from
Wizard's:

- **2024 rules also moved Sorcerer onto the "prepared spells" model** (2014 had
  Sorcerer use a separate "spells known" mechanic) — confirmed via Sorcerer's
  own spellcasting text ("choose two level 1 Sorcerer spells" at level 1 with a
  +1 CHA modifier example, consistent with `preparedSpellCount`'s
  `level + abilityMod` formula). So `preparedSpellCount` itself needed zero
  changes.
- **`sorcererCantripsKnown(level)`** (`src/lib/character.ts`) — Sorcerer's own
  progression is 4/5/6 at levels 1/4/10, NOT Wizard's 3/4/5. Named explicitly
  per class, same reasoning as `wizardCantripsKnown`. Both are now registered
  in **`CANTRIPS_KNOWN_BY_CLASS: Record<string, (level: number) => number>`**,
  which `character-sheet.ts` looks up generically by `cls.index` instead of
  hardcoding `=== "wizard"` — Cleric's pass just needs to add its own entry.

**Sorcery Points (Font of Magic, from Sorcerer level 2)** — new resource, not
shared with any other class yet:
- `sorceryPointsMax(level) = level >= 2 ? level : 0` (`character.ts`). The SRD
  text only gives the level-2 example ("You have 2 Sorcery Points") rather than
  a full table, but "points equal character level once you have the feature"
  is the real, unchanged 5e rule.
- Tracked as **play state**, not draft state — `PlayState.expendedSorceryPoints`
  (`PlaySheet.tsx`), same treatment as spell slots and current HP: resets on
  Long Rest, never persisted to Supabase. UI is a single bordered row (+/−
  buttons, capped `sm:max-w-[200px]` since it's one pool, not per-level rows
  like Spell Slots) right above Cantrips Known in the Spells section.

**Metamagic options — real schedule, homebrew option list.** Originally
shipped as a disclosed gap (searched the SRD's `feats` table, the `features`
table, and a broad ILIKE search across every table for "metamagic" and found
no structured option data). User later explicitly authorized homebrewing it
("I'm happy for you to homebrew it. Use real stats if you can find them"),
which prompted a second, deeper search before defaulting to original content:

- The `levels` table (2014 ruleset, `class_index='sorcerer'`) has a
  `class_specific.metamagic_known` count per level — real structured data,
  confirming a schedule exists, though its level-16 value turned out to be a
  known off-by-one artifact in that derived field (see below).
- The Sorcerer's own `sorcerer-metamagic` feature row in `features` (2024
  ruleset) gives the authoritative schedule directly in prose: "you gain two
  Metamagic options... You gain two more options at Sorcerer level 10 and two
  more at Sorcerer level 17." This is the real, current (2024) schedule —
  2/4/6, NOT the 2014 levels table's implied 2/3/4 (2024 doubled the level-10
  and level-17 grants). Trusted this features-array-derived schedule over the
  levels table's `metamagic_known` snapshot specifically because the snapshot
  shows 4 a level early (at 16, not 17) while the feature-grant attribution
  (which level 17's `features` array lists "metamagic-3") lines up with the
  well-documented real PHB table (2/10/17) — the same kind of derived-field
  quirk this app already treats `features`-table level attribution as more
  authoritative than for ASI_LEVELS and EXPERTISE_SCHEDULE.
- Checked the actual 5e-bits/5e-database GitHub source (the project's content
  pipeline origin) directly via its file listing for `src/2024/en/` — confirms
  there's no separate "Metamagic Options" JSON resource; the file list matches
  exactly what's already imported. The real option list/effects genuinely
  aren't published as structured open content anywhere in this pipeline.

So: `metamagicKnownMax(level)` in `character.ts` (0 / 2 / 4 / 6 at levels
0-1 / 2-9 / 10-16 / 17+) is real, grounded data. **`METAMAGIC_OPTIONS`** (9
entries, also in `character.ts`) is original homebrew — fresh names, fresh
wording, no reproduction of real option text — written at a comparable
Sorcery Point cost/power band (1-2 points each, one scaling with spell level)
to the genre-standard "spend points to tweak a spell" mechanic. Same
homebrew-when-authorized pattern as the backgrounds and general feats, and
disclosed the same way: a one-line note under the section heading on the play
sheet ("Original homebrew options — the official Metamagic list isn't part of
the free SRD...").

**Modeled as a freely-overwritable list, not the stricter real rule.** The
actual rule lets you replace only one Metamagic option per Sorcerer level
gained — `CharacterDraft.metamagicChoices: string[]` instead just mirrors
`knownCantrips`/`preparedSpells`'s shape (overwrite-the-whole-array, gated
only by `metamagicKnownMax(level)`, via `setMetamagicChoices` in actions.ts).
Deliberate scope simplification: tracking exactly when each option was
learned to enforce a one-swap-per-level cadence would be real complexity for
a feature whose option list is already homebrew, not official.

Tested live with CHA 18 (16 base + Acolyte's +2 background bonus) at level 4:
Spell Save DC 14, Spell Attack +6, 4/3 level-1/2 slots (`fullCasterSlots(4)`),
5 cantrips known (`sorcererCantripsKnown(4)`), 8 prepared spells
(`4 + 4 CHA mod`), Sorcery Points 4/4 (`sorceryPointsMax(4)`) — every number
matched exactly. Verified Sorcery Points expend/restore, boundary clamping at
0 and at max (buttons correctly disable), Long Rest resetting slots + Sorcery
Points + HP together, and the cantrip picker's Save/Cancel flow persisting a
real selection across the generic `setKnownCantrips` action (reused from
Wizard with no Sorcerer-specific changes).

Metamagic tested separately, live, at both ends of its schedule: at level 2,
picker showed "0/2", selecting a 3rd option after 2 was rejected by the UI; at
level 17 (same character, bumped via SQL), picker showed the existing 2 picks
pre-selected against a new "/6" cap, selected 4 more to reach 6, a 7th was
rejected, and the save persisted across a real page reload both times. "Show
details" expansion and the homebrew-disclosure paragraph both rendered
correctly.

## Class resources — Cleric spellcasting (Channel Divinity)
Fourth and last class-by-class pass. Reused the same spellcasting
infrastructure as Wizard/Sorcerer with zero changes beyond a new
`clericCantripsKnown` entry in `CANTRIPS_KNOWN_BY_CLASS` (3/4/5 at levels
1/4/10 — confirmed from Cleric's own SRD text, NOT assumed from Wizard's,
even though the numbers happen to match). WIS, full-list prep via the same
unified `level + ability modifier` formula — confirmed from Cleric's own
"choose four level 1 spells" example, same as Wizard/Sorcerer.

**Channel Divinity is the best-grounded class resource in the app so far —
almost entirely real SRD content, not homebrew.** Unlike Metamagic (where the
SRD only ships the schedule, not the option text), the Cleric's
`cleric-channel-divinity` feature row gives the FULL real mechanics for both
of its base effects directly:
- **Divine Spark**: 1d8 + WIS mod, either heals or forces a CON save for
  Necrotic/Radiant damage (half on success). Scales to 2d8/3d8/4d8 at Cleric
  levels 7/13/18 — confirmed verbatim from the feature text, the same kind of
  clean milestone progression as Sneak Attack's dice. Modeled as
  `divineSparkDice(level)` in `character.ts`, with a "Roll Divine Spark"
  button (mirrors Sneak Attack's roll button) using the dice engine's
  embedded-modifier notation (`rollDice("2d8+5")` — `rollDice` already parses
  a trailing `+N`/`-N`, no new dice-engine code needed).
- **Turn Undead**: Frightens + Incapacitates Undead on a failed WIS save, no
  roll on the Cleric's own part — no button needed, same reasoning as why
  Spell Save DC doesn't get a "roll" button either.
- Both effects' full text, plus the Life Domain subclass's own Channel
  Divinity option (**Preserve Life**, healing = 5× Cleric level split among
  Bloodied creatures), already flow through the existing Features-list
  infrastructure automatically — zero new code needed there, since they're
  real rows in the `features` table the same as every other class feature.

**The charges-per-rest pool, `channelDivinityMax(level)`, is a disclosed
simplification, not the full real table.** The feature text confirms the
base directly ("You can use this class's Channel Divinity twice," from level
2), but only references higher-level increases via "the Channel Divinity
column of the Cleric Features table" without giving those breakpoints in
prose — and the `levels` table (this app's only other structured-data source
for this kind of thing) is 2014 data with a different, lower base (1 use, not
2), so it can't be trusted for 2024's higher breakpoints either. Modeled as a
flat 2 from level 2 up rather than guessing at numbers that aren't checkable
anywhere in this app's data pipeline — a Cleric above roughly level 10 will
see fewer charges here than the real rules eventually grant. This is the
opposite situation from Metamagic: there the schedule was confirmed and the
option list wasn't, so the option list got homebrewed; here the option
effects are fully confirmed and the higher-level schedule isn't, so the
schedule stays conservative instead of being filled in from outside
knowledge or guessed at.

**Channel Divinity is also the app's first Short-Rest-recovered resource.**
Every other tracked resource (HP, hit dice, spell slots, Sorcery Points) only
resets on a Long Rest. Channel Divinity regains 1 use on a Short Rest and all
uses on a Long Rest, so a new `shortRest()` handler was added in
`PlaySheet.tsx` alongside the existing `longRest()` — it touches only
`expendedChannelDivinity`, leaving HP/hit dice/spell slots untouched, which is
the real rule (Short Rest doesn't auto-heal or restore spell slots). The
"Short Rest" button sits next to "Long Rest" in the HP/resources card, gated
on `sheet.channelDivinityMax > 0` for now since Channel Divinity is the only
short-rest resource modeled — generalize the gating if a future class (e.g.
Warlock's Pact Magic) adds a second one.

Tested live with WIS 20 (capped; 16 base + background + an ASI pick) and CON
16 at level 7: Spell Save DC 16, Spell Attack +8, slots 4/3/3/1
(`fullCasterSlots(7)`), 4 cantrips known, 12 prepared spells (`7 + 5 WIS
mod`), Channel Divinity 2/2, Divine Spark rolling `2d8+5` — every number
matched exactly, and the Features list correctly merged Life Domain's
subclass features (Disciple of Life, Preserve Life, Blessed Healer, Blessed
Strikes) with the base Cleric features with no duplicates. Verified Short
Rest regains exactly 1 Channel Divinity charge while leaving a damaged HP
total and an expended spell slot untouched; verified Long Rest still resets
HP, slots, and Channel Divinity together. Bumped to level 18 via SQL and
confirmed Divine Spark scaled to `4d8+5` while Channel Divinity's max
correctly stayed at the disclosed flat 2 (expected, not a bug).

This was built directly from a hand-inserted `characters` row (matching the
exact shape `EMPTY_DRAFT` produces) rather than re-walking the builder wizard
UI — the wizard pathway itself wasn't touched in this pass and was already
proven generic/class-agnostic during the Rogue/Wizard/Sorcerer passes, so the
live-browser verification focused entirely on the actually-new code (Channel
Divinity, Short Rest, Divine Spark, Cleric's own cantrip/prepared numbers).

**All four classes in the user's stated priority order (Rogue → Wizard →
Sorcerer → Cleric) now have their full spellcasting/resources kit.** User then
asked to continue through the rest: Bard, Druid, Paladin, Ranger, Warlock,
Fighter, Barbarian, Monk — tackled in an order that reuses existing infra
most cheaply first (full casters → half-casters → Warlock's unique Pact Magic
→ the three non-casters), continuing piece by piece without re-confirming
between each class, same as the original four.

## Class resources — Bard spellcasting (Bardic Inspiration)
Fifth class-by-class pass, first of the "keep going" extension. Entirely
real SRD content, no homebrew — reused the Wizard/Sorcerer/Cleric
spellcasting infra unchanged (CHA, same unified prepared-spell formula) plus
just a new `bardCantripsKnown` entry (2/3/4 at levels 1/4/10 — confirmed from
Bard's own text, starts at 2 unlike every other class so far).

**Bard's Expertise schedule (2 at level 2, +2 at level 9) needed zero new
code** — `EXPERTISE_SCHEDULE` was already `Record<string, ExpertiseMilestone[]>`
keyed by class index specifically so a second class could extend it later
(see the comment on `EXPERTISE_SCHEDULE` in `character.ts`, written during
the Rogue pass). Adding `bard: [{level:2,count:2},{level:9,count:2}]` was the
entire change; the Expertise picker UI, pending-choice gating, and skill
bonus doubling all already worked correctly the first time, confirmed live.

**Bardic Inspiration** (`character.ts`):
- `bardicInspirationDie(level)`: 6/8/10/12 at levels 1/5/10/15 — confirmed
  verbatim from the feature's own SRD text, the same clean milestone shape as
  Sneak Attack's and Divine Spark's dice.
- `bardicInspirationMax(chaModifier)`: `max(1, chaModifier)` — confirmed from
  "a number of times equal to your Charisma modifier (minimum of once)."
  **Different shape from every other resource-max function so far** (Sorcery
  Points, Channel Divinity) — those are level-only; this one genuinely needs
  the final CHA modifier as an input, so `character-sheet.ts` passes
  `modifiers.cha` rather than `draft.level`.
- No "roll" button — like Spell Save DC and Turn Undead, the die is rolled by
  whoever RECEIVES the inspiration, not the Bard, so there's nothing for the
  Bard's own play sheet to roll.

**Bardic Inspiration's recovery rule changes at level 5 (Font of
Inspiration)**: Long-Rest-only below level 5, Short-OR-Long-Rest from level 5
on. This made `shortRest()` (added during the Cleric pass for Channel
Divinity) genuinely class-and-level-aware rather than a flat decrement:

```ts
function shortRest() {
  const bardFontOfInspiration = sheet?.classIndex === "bard" && sheet.level >= 5;
  setPlay((prev) => ({
    ...prev,
    expendedChannelDivinity: Math.max(0, prev.expendedChannelDivinity - 1),
    expendedBardicInspiration: bardFontOfInspiration ? 0 : prev.expendedBardicInspiration,
  }));
}
```

Also generalized the Short Rest button's visibility from a Cleric-only check
into a `hasShortRestResource` derived boolean
(`sheet.channelDivinityMax > 0 || sheet.bardicInspirationMax > 0`) — the
comment on it already flags that Warlock's Pact Magic will need a third OR
clause when that pass comes up. The button itself stays visible for a Bard
from level 1 (since Bardic Inspiration exists from level 1), even though
`shortRest()` only changes anything from level 5 on — confirmed this
specific behavior live rather than assuming it.

Tested live with CHA 20 (capped) at level 5: Spell Save DC 16, Spell Attack
+8, slots 4/3/2 (`fullCasterSlots(5)`), 3 cantrips known, 10 prepared spells,
Bardic Inspiration 5/5 at a d8 die, Expertise pending-choice at level 2 — all
matched exactly, Features list correctly merged College of Lore's Bonus
Proficiencies/Cutting Words with base Bard features. Verified expend/restore
+ boundary clamping for Bardic Inspiration; verified Short Rest fully resets
it at level 5 (CHA mod dropped to +4 after removing the test ASI pick, die
correctly still d8); then dropped the same character to level 3 via SQL and
confirmed the die became d6, the "or Short Rest" wording disappeared, and a
Short Rest at that level correctly left an expended Bardic Inspiration count
untouched while Long Rest still fully reset it.

## Class resources — Druid spellcasting (Wild Shape)
Sixth class-by-class pass, cheapest one yet. Spellcasting infra reused
unchanged (WIS, same unified prepared-spell formula) plus a new
`druidCantripsKnown` (2/3/4 at 1/4/10 — confirmed from Druid's own text,
same numbers as Bard's but confirmed independently). Druid's Primal Order
(Magician/Warden) was already built during Phase 1's `ORDER_CHOICES` — zero
work needed there, it was already correct.

**Wild Shape is the same shape as Channel Divinity, confirmed base + disclosed
flat simplification for higher levels.** The feature's own SRD text gives the
base directly ("You can use Wild Shape twice... You regain one expended use
when you finish a Short Rest, and you regain all expended uses when you
finish a Long Rest") — same Short/Long Rest split as Cleric's Channel
Divinity. Higher-level increases are referenced via "the Wild Shape column of
the Druid Features table," not given in prose. The feature text DOES give a
different table in full ("Beast Shapes": known forms and max CR by level —
4 forms/CR ¼ at level 2, 6 forms/CR ½ at level 4, 8 forms/CR 1 + Fly Speed at
level 8), but that's a different axis (which beasts you can become) from the
"how many times per rest" axis this app tracks as a resource pool. So
`wildShapeMax(level)` is a flat 2 from level 2 up, same disclosed-gap
reasoning as `channelDivinityMax`.

**Deliberately not modeled: actually becoming a specific beast.** Wild Shape
swaps the character's AC/HP/attacks/skills for a chosen monster's stat block
— a genuinely different, much larger feature (a beast-stat-block picker tied
into the `monsters` table, temporarily overriding half the sheet) than a
resource-pool counter. Out of scope for this pass; the real Known
Forms/Max CR table is already fully visible via the existing Features list
(the Wild Shape feature's own description), so nothing is hidden, it's just
not interactive yet.

No new UI pattern needed — the block is a direct copy of Channel Divinity's
(counter + Short Rest +1 / Long Rest all), and `hasShortRestResource` gained
its third OR clause exactly as predicted when it was written during the Bard
pass.

Tested live with WIS 18 at level 4: Spell Save DC 14, Spell Attack +6, slots
4/3 (`fullCasterSlots(4)`), 3 cantrips known, 8 prepared spells, Wild Shape
2/2 — all matched exactly; subclass and feat pending-choices both appeared
correctly (subclass first becomes available at level 3, same generic
infrastructure as every other class). Verified Wild Shape expend/restore +
boundary clamping, Short Rest regaining exactly 1, and Long Rest fully
resetting it.

**Both Bard and Druid needed zero homebrew** — every number and mechanic
came straight from the SRD's own feature text.

## Class resources — Paladin spellcasting (half-casters, Channel Divinity, Lay on Hands)
Seventh class-by-class pass, first half-caster, and the first pass that
required real refactoring rather than just additive changes — Paladin broke
two assumptions every class so far had quietly shared.

**New shared infrastructure: `halfCasterSlots(level)` / `HALF_CASTER_CLASSES`.**
Paladin (and presumably Ranger) use a slower 9-table than the full-caster one,
capping at 5th-level spells instead of 9th. Confirmed from the 2014 `levels`
table's real per-level `spell_slots_level_N` data for Paladin specifically
(not assumed from outside knowledge of the well-known real progression, even
though the resulting table matches it). `character-sheet.ts` now picks
`halfCasterSlots` vs `fullCasterSlots` via `HALF_CASTER_CLASSES.has(cls.index)`
— a small per-class set, checked fresh for each class as its pass comes up
(only `paladin` is in it right now; don't add `ranger` until that pass
actually confirms it).

**Broke assumption #1: "every caster with cantrips also has prepared spells,
and vice versa."** Paladin has prepared spells but NO cantrips at all
(confirmed — its spellcasting `info` array has no "Cantrips" entry, unlike
every other caster checked so far). The old code gated `preparedSpellsCount`
on `cls.index in CANTRIPS_KNOWN_BY_CLASS`, which would have wrongly hidden
Paladin's prepared spells. Fixed by gating `preparedSpellsCount` on
`spellcastingAbility !== null` instead — confirmed Paladin's prepared-spell
count uses the same unified `level + ability modifier` formula via two
internally-consistent prose examples ("choose two level 1 Paladin spells" at
the level it first gets slots, "level 5 Paladin... six spells" — both
consistent with the formula at different assumed CHA modifiers). Left a
comment flagging that Warlock will need an explicit exclusion from this gate
once that pass confirms Warlock uses fixed known spells instead.

**Broke assumption #2: "Channel Divinity means Cleric's Channel Divinity."**
Paladin has its own Channel Divinity feature — same name, different schedule,
different base options (Divine Sense, not Divine Spark/Turn Undead). Renamed
the Cleric-specific function `channelDivinityMax` → `clericChannelDivinityMax`
and added `paladinChannelDivinityMax` alongside it; `character-sheet.ts`
computes the single generic `channelDivinityMax` sheet field from whichever
one matches `cls.index`. The PlaySheet UI block itself needed zero changes
structurally — it was already generic — except its description text, which
had hardcoded "Divine Spark or Turn Undead." Generalized to "Spend a use for
one of this class's Channel Divinity effects — see Features below," and
gated the "Roll Divine Spark" button on `sheet.divineSparkDice > 0`
specifically (it was previously implicitly Cleric-only via
`channelDivinityMax > 0`, which would have shown a dead button for Paladin).
**Paladin's Channel Divinity schedule is fully confirmed, unlike Cleric's** —
the feature text gives both breakpoints in prose ("You can use this class's
Channel Divinity twice... You gain an additional use when you reach Paladin
level 11"), so no disclosed-gap simplification was needed here at all: 2 from
level 3, 3 from level 11.

**Lay on Hands** (`layOnHandsMax(level) = 5 * level`, confirmed directly) is
shaped differently from every other resource so far — a variable-amount HP
pool (spend any amount to heal a creature for that much), not a fixed "uses"
counter. Modeled with its own `expendedLayOnHands` play-state field and a
Spend/Restore number-input pair mirroring the existing Hurt/Heal pattern
(rather than the +/-1 steppers Sorcery Points etc. use), plus a flat "Cure
Poison (5)" quick-action button for the rule's specific alternate use
("expend 5 Hit Points from the pool... to remove the Poisoned condition").
Long-Rest-only recovery, confirmed — no Short Rest component, unlike Channel
Divinity which sits right next to it in the UI.

Tested live with CHA 18, STR 20, CON 17 at level 11: Spell Save DC 16, Spell
Attack +8, slots 4/3/3 (`halfCasterSlots(11)` — confirmed real half-caster
table), prepared spells 0/15 (`11 + 4 CHA mod`), **no Cantrips Known section
at all** (confirmed absent, not just empty), Channel Divinity 3/3
(`paladinChannelDivinityMax(11)`), Lay on Hands 55/55 (`5 × 11`) — all
matched exactly, Features list correctly merged Oath of Devotion's Sacred
Weapon/Oath spells with base Paladin features including two separate
resolved ASI picks (levels 4 and 8). Verified Lay on Hands Spend/Restore/Cure
Poison; verified Channel Divinity expend/restore; verified Short Rest regains
exactly 1 Channel Divinity charge while leaving Lay on Hands completely
untouched; verified Long Rest fully resets both together. (One testing-only
hiccup along the way: directly mutating a controlled number input's DOM
value via a manual `dispatchEvent` didn't reliably notify React in this
environment, even with the native-setter workaround — switching to the
dedicated `preview_fill` tool resolved it immediately. Not a product bug,
just a reminder to prefer `preview_fill` over manual DOM event dispatch for
text/number inputs specifically; `.value = x` + `dispatchEvent('change')`
continues to work fine for `<select>` elements as used elsewhere in this
session.)

## Class resources — Ranger spellcasting (half-caster, Favored Enemy)
Eighth class-by-class pass, second half-caster — cheap once Paladin's pass
had already built the half-caster infrastructure. `HALF_CASTER_CLASSES` grew
a second entry (`ranger`), confirmed independently from Ranger's own 2014
levels data rather than assumed from sharing an archetype with Paladin — the
table turned out identical, but that was verified, not presumed. Same
"prepared spells but no cantrips at all" shape as Paladin (confirmed from
Ranger's own spellcasting `info` array, which also has no Cantrips entry) —
already handled correctly by the `spellcastingAbility !== null` gate fixed
during the Paladin pass, zero new code needed for that part.

**Ranger's Expertise schedule is split across two separate features** — Deft
Explorer grants Expertise in one skill at level 2, and a standalone
"Expertise" feature grants two more at level 9. Confirmed from each
feature's own text independently (don't assume Deft Explorer's "Expertise"
sub-clause and the later same-named feature share a count). Added as
`EXPERTISE_SCHEDULE.ranger: [{level:2,count:1},{level:9,count:2}]` — zero new
code beyond the schedule entry itself, exactly the reuse this lookup was
built generic for back during the Rogue pass (and already paid off once for
Bard).

**Favored Enemy** (`favoredEnemyMax(level) = level >= 1 ? 2 : 0`) lets a
Ranger cast Hunter's Mark without a spell slot. Same disclosed-flat-base
treatment as Channel Divinity/Wild Shape — the feature text confirms the
base (2, from level 1) but only references higher-level increases via "the
Favored Enemy column of the Ranger Features table" without giving those
breakpoints in prose. Modeled with its own play-state counter, Long-Rest-only
(no Short Rest component, confirmed) — a direct copy of Wild Shape's UI block
minus the Short Rest behavior.

**Deliberately deferred to informational-only (Features list, not
interactive): Hunter's Prey, Defensive Tactics, Tireless, Nature's Veil.**
Hunter's Prey (level 3) and Defensive Tactics (level 7) are each a binary
choice re-pickable on every Short OR Long Rest — a genuinely different
shape from every choice mechanic built so far (Order choices are
permanent-once-picked; Metamagic/cantrips are freely re-settable but not
explicitly "swap on rest"), and would need a new UI pattern to do properly.
Tireless (level 10, temp-HP pool sized by WIS modifier) and Nature's Veil
(level 14, Invisibility uses sized by WIS modifier) are real, confirmed,
cheap-shaped resources, but both gate in deep in the level range and weren't
part of this pass's scope. All four are real SRD content already fully
visible via the existing Features list — nothing is hidden, they're just not
wired to interactive counters/toggles yet. Revisit if higher-level Ranger
play comes up.

Tested live with WIS 20, DEX 18 at level 9: Spell Save DC 17, Spell Attack
+9, slots 4/3/2 (`halfCasterSlots(9)`), prepared spells 0/14 (`9 + 5 WIS
mod`), no Cantrips section, Favored Enemy 2/2 — all matched exactly; Features
list correctly merged Hunter subclass features (Hunter's Lore, Hunter's
Prey) with base Ranger features, and the Expertise pending-choice correctly
showed the level-2 milestone first. Verified Favored Enemy expend/restore +
boundary clamping + Long Rest full reset.

**All four half/full-caster passes beyond the original priority order (Bard,
Druid, Paladin, Ranger) are now done with zero homebrew** — every number and
mechanic for all four came straight from the SRD's own text. Remaining:
Warlock (genuinely different Pact Magic system), then the three non-casters
(Fighter, Barbarian, Monk).

## Class resources — Warlock spellcasting (Pact Magic, Magical Cunning)
Ninth class-by-class pass, and the first genuinely different spellcasting
infrastructure of the project — few slots, but all pinned to one single high
level, recovered on a Short *or* Long Rest instead of Long Rest only, plus a
fixed Prepared Spells table that ignores ability modifier entirely.

**Slot count, slot level, and Prepared Spells count are all modeled as real,
complete, hardcoded-by-level tables — not a disclosed flat-base
simplification** like Channel Divinity/Wild Shape/Favored Enemy. The
difference: those three only ever had a confirmed *base*, with the SRD prose
deferring everything past it to an uncheckable table. Pact Magic's prose
gives two full worked examples that cross-validate both tables directly: "when
you're a level 5 Warlock, you have two level 3 spell slots" (slot count 2,
slot level 3 at level 5) and "When you reach level 6, for example, you learn a
new Warlock spell, which can be of levels 1–3" (slot level is *still* 3 at
level 6, confirming the level-5→6 boundary, and Prepared Spells count steps
by exactly +1 across that same boundary). Both examples matched the 2014
`levels` table's numbers exactly, despite that table being demonstrably stale
elsewhere for this class (see Eldritch Invocations below) — so here, unlike
elsewhere, it's trusted as the real, unchanged-since-2014 progression.
`warlockSlots(level)` returns the same 9-wide padded shape as
`fullCasterSlots`/`halfCasterSlots` (one nonzero entry, at whatever level
Pact Magic currently sits), so the existing generic "iterate spellSlots, skip
zeros" UI needed zero changes. `warlockPreparedSpellsMax(level)` is a flat
lookup table, NOT the generic `preparedSpellCount` (level + ability mod)
formula every other 2024 prepared caster uses — confirmed deliberately rather
than assumed, since plugging in CHA mod would wildly overshoot the real,
much-slower table.

**Cantrips known** (`warlockCantripsKnown`): 2/3/4 at levels 1/4/10, confirmed
from Warlock's own text — same numbers as Bard/Druid, registered into
`CANTRIPS_KNOWN_BY_CLASS` the same way.

**Pact Magic slots recover on a Short Rest, not just a Long Rest** — the
feature's signature trait, confirmed directly ("You regain all expended Pact
Magic spell slots when you finish a Short or Long Rest"). `shortRest()` grew
a `warlockPactMagic` branch that clears `expendedSlots` entirely for this
class only — every other caster's slots are untouched by Short Rest, unchanged
behavior. `hasShortRestResource` grew a fourth clause checking
`sheet.classIndex === "warlock" && sheet.spellSlots.some(n => n > 0)` directly
(no new sheet field needed) so the Short Rest button appears for Warlock from
level 1.

**Magical Cunning** (level 2+): "perform an esoteric rite for 1 minute... you
regain expended Pact Magic spell slots but no more than a number equal to
half your maximum (round up). Once you use this feature, you can't do so
again until you finish a Long Rest." Confirmed directly, fully modeled —
`magicalCunningRegain(maxSlots) = Math.ceil(maxSlots / 2)`. Tracked as a
boolean `usedMagicalCunning` play-state flag (not a counter — it's a single
once-per-Long-Rest trigger), reset by `longRest()` only, never by
`shortRest()`. Its button finds the one nonzero slot-level index in
`spellSlots` and refunds `magicalCunningRegain(...)` against `expendedSlots`
at that index, clamped to 0.

**Deliberately deferred to informational-only (Features list, not
interactive): Eldritch Invocations and Mystic Arcanum.** Eldritch
Invocations' confirmed base is real (1 known at level 1, from "You gain one
invocation of your choice") — but unlike Metamagic's fully-confirmed 2/4/6
schedule, the SRD prose never gives invocation-count breakpoints past level 1,
only "as shown in the Invocations column of the Warlock Features table." The
2014 `levels` table's own invocations_known numbers can't be trusted here
either — it shows the feature starting at level 2 (0 known at level 1), but
2024 confirmed-moved it to level 1, so the whole 2014 column is offset and
stale. Building a "known invocations" picker gated on a confirmed-wrong
flat number (1, forever) would be more misleading than not building one at
all — worse than Channel Divinity/Wild Shape's flat simplifications, which
are at least *correctly* flat at their own confirmed base. The actual
invocation options list (effects, prerequisites) also almost certainly isn't
in this app's SRD data, the same gap Metamagic had — not homebrewed here
given the count problem makes a picker actively wrong rather than just
incomplete. Mystic Arcanum (level 11/13/15/17: one free casting per Long Rest
of a specific 6th/7th/8th/9th-level spell, chosen once and retrainable) is
real and fully confirmed in prose, but is a distinct spell-selection axis
from Prepared Spells (different, higher spell levels than Pact Magic's own
slots ever reach) and wasn't part of this pass's scope. Pact Boon doesn't
exist as a separate 2024 feature at all (confirmed by its absence from the
full Warlock features list — apparently folded into Eldritch Invocations
choices), so there was nothing to build for it. All deferred features are
real SRD content already fully visible via the existing Features list.

Tested live with CHA 20, CON 18 (post-ASI) at level 11, Fiend Patron subclass:
Spell Save DC 17, Spell Attack +9, Spell Slots "Level 5, 3/3" (`warlockSlots(11)`
= 3 slots at slot level 5), Cantrips Known 0/4, Prepared Spells 0/11
(`warlockPreparedSpellsMax(11)`), Magical Cunning "regain 2" — all matched
exactly. Verified: expending slots via the generic stepper; Magical Cunning
regaining exactly `ceil(3/2)=2` slots and then self-disabling ("Used") until
next Long Rest; Short Rest fully restoring all expended Pact Magic slots
while leaving `usedMagicalCunning` untouched; Long Rest resetting both. No
console errors. Features list correctly merged Eldritch Invocations, Pact
Magic, Magical Cunning, and Mystic Arcanum (base) alongside Fiend Patron
subclass features (Dark One's Blessing, Fiend Spells, Dark One's Own Luck,
Contact Patron, Fiendish Resilience), sorted by level.

**With Warlock done, every spellcasting class in the free SRD is now fully
built** (Wizard/Sorcerer/Cleric/Bard/Druid full casters, Paladin/Ranger
half-casters, Warlock's Pact Magic). Remaining: the three non-casters
(Fighter, Barbarian, Monk), then homebrew species.

## Class resources — Fighter (Fighting Style, Second Wind, Action Surge, Indomitable)
Tenth class-by-class pass, first non-caster. No spellcasting at all (`classes`
row confirms `spellcasting: null`), so this pass also surfaced the first
resource that needed to live OUTSIDE the `{sheet.spellcastingAbility && (...)}`
Spells card: Fighting Style.

**Fighting Style turned out to be real, structured SRD content, not a gap** —
a discovery worth flagging since the original Angrenor-sheet comparison (way
back in Phase 0) had flagged "no Fighting Style" as a deferred simplification,
left unaddressed ever since. The `feats` table has a `type` column distinct
from `general` (used by the homebrew general-feat pool): `type='fighting-style'`
covers Archery/Defense/Great Weapon Fighting/Two-Weapon Fighting, each with
`prerequisites.feature_named: "Fighting Style"`. New SRD helper
`getFightingStyleFeats()` (mirrors `getGeneralFeatsList()`, no homebrew
flag needed — all 4 are real). Granted to **three** classes, not just Fighter
— Fighter (1, +1 more at 7), Paladin (2), Ranger (2), all confirmed
independently from each class's own `fighter-fighting-style`/
`paladin-fighting-style`/`ranger-fighting-style` feature rows. Modeled via
`FIGHTING_STYLE_KNOWN_BY_CLASS` (same generic per-class-function-map pattern
as `CANTRIPS_KNOWN_BY_CLASS`/`EXPERTISE_SCHEDULE`), so Paladin/Ranger
characters built in earlier passes get this UI retroactively for free, no
backfill needed. `fightingStyleChoices: string[]` on `CharacterDraft` is
freely overwritable (like `metamagicChoices`) since "Whenever you gain a
[Class] level, you can replace the feat you chose." New picker UI placed as
its OWN card (not inside Spells) right after Skills, gated only on
`fightingStyleKnownMax > 0` — the first resource UI in this app that isn't
nested inside a caster-only or single-class-only block.
**Only 4 of the real PHB's ~9 Fighting Styles are in the free SRD** (no
Blind Fighting/Dueling/Interception/Thrown Weapon Fighting/Unarmed Fighting)
— same shape as the 4/16 backgrounds gap, disclosed in the UI and here, but
NOT homebrew-padded (wasn't asked for this specific gap, unlike Metamagic).

**Two of the four chosen styles are mechanically auto-applied, two are
display-only** — deliberate split by how clean the formula is, same
reasoning as Channel Divinity's Divine Spark (auto-rolled) vs Turn Undead
(informational): **Defense** ("+1 bonus to AC while wearing armor") threads
a new `hasDefenseFightingStyle` param through `computeArmorClass`/`computeAC`,
applied only when actual body armor (not just a shield) is equipped — clean,
unconditional, zero edge cases. **Archery** ("+2 bonus to attack rolls with
Ranged weapons") threads `hasArcheryFightingStyle` through `resolveWeapons`,
adding +2 only when the weapon's own pre-existing `isRanged` check (already
computed for ability-mod selection) is true. **Great Weapon Fighting**
(rerolling 1s/2s on two-handed/versatile melee damage dice) and **Two-Weapon
Fighting** (adding ability mod to an off-hand Light-weapon attack) both need
dice-engine/weapon-property concepts that don't exist yet (a "reroll low
rolls" mode; tracking which attack is the off-hand one) — left display-only
via the Fighting Style card's full real text, same scope-discipline as every
other "too situational to auto-apply" deferral this session. Both new params
default to `false` so the builder's `ReviewStep.tsx` call sites (which predate
Fighting Style and have no such data yet) needed no changes.

**Second Wind, Action Surge, and Indomitable** — three more level-gated
counters, but with a genuinely different trust level per resource thanks to
the 2014 `levels` table's `class_specific` object, which (unlike Channel
Divinity's `levels` row) has dedicated `action_surges`/`indomitable_uses`/
`extra_attacks` fields. **Action Surge and Indomitable get the real, complete
schedule** (`actionSurgeMax`: 1 from level 2, 2 from level 17; `indomitableMax`:
1/2/3 at 9/13/17) because the 2014 table's numbers cross-validate exactly
against the 2024 prose's own breakpoints at every level (0→1 at level 2, 1→2
at 17 for Action Surge; 0→1→2→3 at 9/13/17 for Indomitable) — multiple
independent matches, not just a lucky single data point, so trusted the same
way Warlock's Pact Magic slot table was. **Second Wind stays a disclosed
flat simplification** (`secondWindMax = level >= 1 ? 2 : 0`) because the 2014
table has NO corresponding field for it at all (2014 Second Wind wasn't a
multi-charge resource), so there's nothing to cross-check the SRD prose's
"the Second Wind column of the Fighter Features table" against — same
honest gap as `clericChannelDivinityMax`/`wildShapeMax`/`favoredEnemyMax`.

Second Wind's button (`useSecondWind`) is the first resource action that
rolls dice AND heals AND expends a charge all in one click, rather than
splitting "roll" and "track the charge" into two separate UI affordances like
Channel Divinity's Divine Spark does — justified because Second Wind has
exactly one use for its charge (heal yourself), unlike Channel Divinity's
multiple effects sharing one pool, so there's no ambiguity to preserve by
keeping them separate. Action Surge recovers on a Short OR Long Rest (third
resource with this trait, after Warlock's Pact Magic) — `shortRest()` grew an
unconditional `expendedActionSurge: 0` line (no class check needed, the
`actionSurgeMax > 0` gate at the JSX level already scopes it to Fighter).
Indomitable is Long-Rest-only, same shape as Lay on Hands/Favored Enemy — its
reroll bonus (+Fighter level) is surfaced in the description text but not
auto-applied to an actual save reroll (the player adds it manually using the
existing per-ability Save buttons), consistent with not over-building a
rarely-triggered, manually-resolved mechanic.

**Deliberately deferred to informational-only (Features list, not
interactive): Tactical Mind, Weapon Mastery, Tactical Shift, Studied Attacks,
Survivor, Tactical Master, and the Extra-Attack-count features.** Tactical
Mind (spend a Second Wind charge to boost a failed ability check, but only if
boosting it doesn't help — "if the check still fails, this use isn't
expended") needs the check's result known BEFORE deciding to spend the
charge, a reactive sequencing this app doesn't model for any ability check
anywhere. Weapon Mastery (choosing which 3+ weapon kinds you can use mastery
properties with) is a system-wide 2024 mechanic that hasn't been gated by
class in ANY prior pass — every equipped weapon's mastery property already
displays unconditionally in Attacks, a pre-existing simplification, not new
to Fighter. Extra Attack/Two Extra Attacks/Three Extra Attacks (attack
2×/3×/4× per Attack action) need no new state — this sheet has never modeled
per-turn action economy for any class; the player just clicks the existing
Attack button the right number of times. The rest are passive/conditional
riders with no clean resource shape. All real SRD content, fully visible via
Features.

Tested live with STR 20/CON 18 (post-ASI), DEX 14 at level 9, Champion
subclass, Soldier background (which happens to include a Shortbow, letting
Archery's bonus be verified against a real equipped ranged weapon): AC 16
before any Fighting Style choice (Chain Mail, no Dex bonus), Second Wind
"1d10+9" 2/2, Action Surge 1/1, Indomitable "+9" 1/1, Fighting Style (0/2).
Choosing Defense + Great Weapon Fighting via the picker bumped AC to 17
immediately (auto-applied, no save/reload needed); swapping Great Weapon
Fighting for Archery bumped the equipped Shortbow's attack bonus from +6 to
+8. Verified Use Second Wind rolls 1d10+9 (logged "Second Wind 15" for one
roll), heals current HP, and decrements the counter together; Short Rest
regains exactly 1 Second Wind use and fully resets Action Surge while leaving
Indomitable untouched; Long Rest resets all three plus HP. No console errors.
Re-confirmed the established same-tick-stale-closure testing artifact applies
to picker Save buttons too, not just number inputs: toggling two Fighting
Style selections and clicking Save all in one `preview_eval` call silently
saved the PRE-toggle selection (stale closure) — splitting toggle clicks and
the Save click into separate tool calls fixed it immediately. Testing
methodology note, not a product bug.

## Class resources — Barbarian (Rage, Unarmored Defense, Brutal Strike, Primal Champion)
Eleventh class-by-class pass, second non-caster. The richest resource set of
any class so far, and the first pass that needed a real exception to the
universal ability-score cap.

**Rage** (`rageMax`/`rageDamageBonus`) is a genuinely different confidence
tier from every other resource this session — the 2024 prose gives literally
no concrete number anywhere for either the use-count or the damage bonus
(compare Channel Divinity's confirmed "twice," or Pact Magic's confirmed
worked examples); it only ever says "as shown in the [X] column of the
Barbarian Features table." The 2014 `levels` table's `rage_count`/
`rage_damage_bonus` columns are the ONLY numbers anywhere in this app's
pipeline, with no 2024 text to cross-validate them against the way Action
Surge/Indomitable's columns were confirmed in the Fighter pass. Used as
best-available signal anyway — Rage is too central to Barbarian's identity to
leave at a degenerate flat fallback — but with one deliberate override:
the table's level-20 `rage_count` value (9999, "unlimited Rage," a real
2014 capstone) is NOT carried over, because 2024 demonstrably replaced that
capstone with **Primal Champion** (+4 STR/CON, confirmed directly in prose)
instead — assuming both redesigns coexist would be guessing past what the
data supports. Level 20 continues level 19's value (6) instead. Rage Damage's
column (+2/+3/+4 at 1/9/16) carries no such capstone-redesign risk and is
used as-is.

**Primal Champion (level 20): "Your Strength and Constitution scores
increase by 4, to a maximum of 25."** The first real exception to
`finalAbilityScores`' universal 20-cap. Rather than threading a
Barbarian-aware branch through that shared function (used by every class),
`buildCharacterSheet` applies it as an additive correction right after the
normal capped computation, recomputing `modifiers.str`/`modifiers.con`
immediately after — placed before `maxHpValue`/saves/skills so every
downstream derived number (HP from CON, to-hit/damage from STR, STR/CON
saves) correctly reflects the boost. Only reachable at the literal level
cap, but a real, clean, well-defined rule worth getting right rather than
silently capping at 20 forever for a level-20 Barbarian.

**Unarmored Defense (level 1, always present): "your base Armor Class
equals 10 plus your Dexterity and Constitution modifiers... You can use a
Shield and still gain this benefit."** `computeArmorClass`/`computeAC` grew
a generic `unarmoredDefenseBonus` parameter (an extra ability mod added to
the unarmored 10+DEX base, not Barbarian-specific by name — Monk's own
Unarmored Defense uses WIS for the same shape of bonus, once that class's
pass comes up) rather than a Barbarian-specific branch. Only takes effect in
the existing unarmored branch (no body armor equipped), so passing
`sheet.modifiers.con` unconditionally whenever the class is Barbarian is
safe — an armored Barbarian's AC is computed exactly like any other class's,
correctly ignoring this bonus per the real rule ("while you aren't wearing
any armor"). Barbarian's own starting-equipment option (Greataxe/Handaxes/
Explorer's Pack, no armor at all) meant this was exercised live without
needing to manually unequip anything.

**Rage's damage bonus is mechanically auto-applied to Strength-based weapon
damage — a new shape beyond Fighting Style's auto-apply (Defense/Archery),
because it depends on PLAY STATE (is Rage currently active), not just a
permanent choice.** New boolean `isRaging` in `PlayState`, independent of
`expendedRage` (a Barbarian can have unused Rage left without currently
being enraged). `resolveWeapons` grew a `rageDamageBonusWhileRaging`
parameter, added to `damageBonus` only when `ability === "str"` (Rage's own
text: "When you make an attack using Strength... you gain a bonus to the
damage") — a DEX-based ranged attack from the same character correctly
doesn't get it. This app has no turn/round tracker for any class, so
Rage's real duration/extension rules ("lasts until the end of your next
turn... extend for another round by...") aren't modeled — `isRaging` is a
simple manual toggle (Enter Rage / End Rage buttons) the player flips
themselves, same scope-discipline as not tracking Sneak Attack's "once per
turn." **Enter Rage** combines expending a charge and activating the flag in
one click (mirrors Second Wind's single-action design from the Fighter
pass — Rage, like Second Wind, has exactly one meaningful use for its
charge); **End Rage** clears the flag without refunding the charge (ending
early doesn't un-spend it, per the real rules).

**Brutal Strike** (level 9: 1d10 extra damage; level 17 "Improved": 2d10) —
fully confirmed in prose, modeled as a `brutalStrikeDice(level)` schedule
with a "Roll Xd10" button placed in the Attacks section next to Sneak
Attack's identical-shaped button, not in the Rage card — it's a per-attack
damage roll, not a rest-recovered pool. Deliberately distinct from the 2014
table's `brutal_critical_dice` column, which is the OLD 2014 "Brutal
Critical" mechanic (extra dice only on a confirmed critical hit) — a
different trigger shape entirely, not reused.

**Persistent Rage** (level 15+): "When you roll Initiative, you can regain
all expended uses of Rage... can't do so again until you finish a Long
Rest." This app has no "roll Initiative" action anywhere (Initiative is a
static stat chip, not a button) to hook the real trigger onto, so it's
modeled as a manually-triggered once-per-Long-Rest button instead — same
boolean-flag shape as Warlock's Magical Cunning, gated `sheet.level >= 15`.

**Deliberately deferred to informational-only (Features list, not
interactive): Danger Sense, Reckless Attack, Primal Knowledge, Relentless
Rage, Frenzy, Mindless Rage, Retaliation, Intimidating Presence, Indomitable
Might.** Reckless Attack is a per-turn advantage/disadvantage toggle — this
app already has a generic Roll Mode control (normal/advantage/disadvantage)
in the dice log for exactly this kind of thing, so no Barbarian-specific
state was added; the Features text reminds the player of the real tradeoff
(enemies get Advantage on you too). Relentless Rage (reroll death via a
DC-10-and-rising CON save when dropped to 0 while Raging) would need a
second, Rage-aware death-save system layered on top of the existing plain
Death Saves UI, which doesn't account for it at all — deferred rather than
building a confusing parallel mechanic. Frenzy/Mindless Rage/Retaliation/
Intimidating Presence are Berserker subclass features that either depend on
Reckless Attack's untracked toggle or are purely passive/reactive. All real
SRD content, fully visible via Features (subclass features merge in
automatically, unchanged since Phase 1).

Tested live with STR 20/CON 18 (post-ASI) at level 9, Path of the Berserker
subclass, Goliath species (no armor in Barbarian's own starting-equipment
option, so Unarmored Defense was exercised without manual unequipping): AC
16 (10+2 DEX+4 CON), HP 88/88, Rage "+3 damage" 4/4, Brutal Strike "Roll
1d10". Entering Rage bumped Greataxe (Strength-based) damage from +5 to +8
live with no reload, while Shortbow (Dex-based) correctly stayed at +2,
untouched. Ending Rage reverted the damage bonus without refunding the
charge. Short Rest regained exactly 1 Rage use. No console errors. Did not
re-test Primal Champion live (only reachable at level 20, and this pass's
test character was level 9) — verified by code reading instead; flagged
here as a disclosed gap in live coverage, consistent with always saying so
when something wasn't actually run rather than implying full verification.

## Class resources — Monk (Martial Arts, Focus Points, Unarmored Defense/Movement)
Twelfth and final class-by-class pass, third non-caster. The pass that
exposed a real structural gap: this app's Attacks section only ever resolved
`ownedEquipment` — a Monk's entire combat identity (Unarmed Strike, the
Martial Arts die replacing weapon damage, Dexterous Attacks) isn't equipment
at all, so a Monk would have shown an incomplete or wrong Attacks list
without new plumbing, not just a missing resource counter.

**Martial Arts die, Focus Points (2024's renaming of Ki Points), and
Unarmored Movement bonus are all the same lower-confidence tier as
Barbarian's Rage tables** — the 2024 prose for each gives no concrete
level-tied number anywhere (every reference to "your Martial Arts die" in
OTHER features — Deflect Attacks, Heightened Focus, Wholeness of Body — uses
it generically, never naming a size at a level), so the 2014 `levels`
table's `martial_arts.dice_value`/`ki_points`/`unarmored_movement` columns
are used as best-available signal, same reasoning as Rage. Focus Points
specifically is lower-risk than Rage even without a direct example, though —
its shape ("points equal to class level from level 2 on") is identical to
Sorcery Points' own REAL, confirmed-in-prose formula, making it a
conservative, edition-stable bet rather than a guess.

**Unarmored Defense (10+DEX+WIS while unarmored) reuses the exact generic
`unarmoredDefenseBonus` parameter built during the Barbarian pass** —
confirmation that naming it generically (not `conBonus`) back then was the
right call; Monk's pass needed zero changes to `computeArmorClass` itself,
just a different ability modifier at the call site.

**The real new work: equipped weapons and a synthesized Unarmed Strike both
needed Monk-aware treatment that didn't exist for any other class.**
`resolveWeapons` grew a `monkMartialArtsDie` parameter and a `isMonkWeapon()`
check against the equipment table's own category tags (`simple-melee-weapons`,
or `martial-melee-weapons` + the `light` property) — Martial Arts' own text:
"Simple Melee weapons" or "Martial Melee weapons that have the Light
property." For each qualifying equipped weapon, ability selection folds into
the existing Finesse branch (Dexterous Attacks: pick the higher of DEX/STR,
the same reading already applied to Finesse weapons rather than a forced
DEX-always), and damage dice become `1d${Math.max(weaponDieSize,
martialArtsDie)}` — taking the LARGER of the two rather than always
overriding, so a low-level Monk wielding a Quarterstaff still benefits from
its bigger Versatile die. The **synthetic Unarmed Strike entry** (no
equipment backs it) is built directly in `PlaySheet.tsx` and prepended to
the resolved weapons array — `resolveWeapons` stays equipment-only by
design, so this composition happens at the call site instead. Always shown
once a character is a Monk, without re-checking "not wearing armor/Shield"
against currently-equipped gear — the same simplification level as not
gating Barbarian's Rage on "not wearing Heavy armor" either.

**Unarmored Movement's speed bonus is the first class-resource number to
modify the static Speed stat chip** — computed inline in `PlaySheet.tsx`
(`displaySpeed`) by checking whether ANY equipped item has an `armorClass`
(covers both body armor and shields, matching "not wearing armor or
wielding a Shield" exactly), unlike the Unarmed Strike simplification above:
Speed is a pure display value with nothing else riding on it, so the extra
correctness was cheap. Deliberately did NOT retrofit Barbarian's Fast
Movement (+10 ft while not wearing HEAVY armor specifically) in this same
pass — that needs an armor-WEIGHT-category check this app doesn't have
plumbed yet, a different and larger lift than Monk's simpler "any
armor/shield at all" check; flagged as a clean follow-up, not done
speculatively.

**Wholeness of Body** (level 6: roll Martial Arts die + WIS mod to heal,
uses = WIS mod min 1, Long-Rest-only) is built fully interactive, same
roll+heal+expend-in-one-click shape as Second Wind. **Uncanny Metabolism**
(level 2+: once-per-Long-Rest, regain all Focus Points + heal Monk-level +
Martial-Arts-die) hits the same "no roll-Initiative action exists in this
app" gap as Barbarian's Persistent Rage — modeled the identical way, a
manually-triggered button instead of a real Initiative-roll hook. **Deflect
Attacks** (reduce incoming damage by 1d10+DEX+level) and **Quivering Palm**
(level 17+: flat 10d12 Force damage) are roll-only convenience buttons in
Attacks, mirroring Second Wind/Brutal Strike's pattern — the player applies
Deflect Attacks' result manually against incoming damage, and Quivering
Palm's 4-Focus-Point cost isn't auto-expended (its real trigger is a much
earlier, separate "hit and start the vibrations" action this app doesn't
sequence against a later "end them" action).

**Deliberately deferred to informational-only (Features list, not
interactive): Stunning Strike, Slow Fall, Evasion, Acrobatic Movement,
Heightened Focus, Self-Restoration, Fleet Step, Deflect Energy, Disciplined
Survivor, Perfect Focus, Superior Defense, Empowered Strikes.** Stunning
Strike's Focus Point cost is covered by the generic Focus Points stepper
(no dedicated button, same reasoning as Channel Divinity not getting a
button per effect) — its actual stun EFFECT isn't tracked since this app
has no monster/target state at all. Perfect Focus is a conditional
alternate to Uncanny Metabolism ("when you roll Initiative and DON'T use
Uncanny Metabolism") — deferred rather than building mutual-exclusivity
logic between two already-approximated triggers. The rest are passive,
situational, or reference mechanics (half-damage-on-save, fall damage) this
app doesn't model for any class.

Tested live with DEX 20/WIS 18 (post-ASI) at level 11, Warrior of the Open
Hand subclass: AC 19 (10+5 DEX+4 WIS), Speed 50 (30 base + 20 Unarmored
Movement, no armor/shield equipped), HP 70/70, Focus Points 11/11 (Save DC
16), Wholeness of Body "1d8+4" 4/4, Deflect Attacks "Roll 1d10+16". Attacks
correctly showed Unarmed Strike (1d8, DEX, synthesized) first, then equipped
Spear upgraded from its base 1d6 to 1d8 (Martial Arts die winning) and
switched to DEX-based, Dagger upgraded 1d4→1d8, and Shortbow correctly
UNTOUCHED at 1d6 (ranged weapons don't qualify as Monk weapons). Quivering
Palm's block correctly absent (level 11 < 17). Verified Wholeness of Body
heals+decrements together; Uncanny Metabolism regains all Focus Points and
heals together, then self-disables; Short Rest fully resets Focus Points
while leaving Wholeness of Body and Uncanny Metabolism's flag untouched;
Long Rest resets everything. No console errors.

**All twelve playable classes in the free SRD are now fully built** —
spellcasting (or its absence) and class resources, tested live, documented,
shipped for Wizard/Sorcerer/Cleric/Bard/Druid/Paladin/Ranger/Warlock/
Fighter/Barbarian/Monk plus Rogue (done earlier in the project). Remaining
from the original roadmap: homebrew species (Fairy and others missing from
the free SRD's 9), explicitly pre-authorized by the user.

## Homebrew species
The free SRD only ships the 9 official 2024 PHB species (Dragonborn, Dwarf,
Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling) — same root-cause gap as
backgrounds (4/16) and Fighting Style (4/~9). User explicitly pre-authorized
homebrew here ("happy for these to be homebrew too"), naming Fairy plus "any
others" missing from the roster. Added 10 original homebrew species: Fairy
(explicit request) plus Aasimar, Centaur, Changeling, Goblin, Owlin, Satyr,
Shifter, Tabaxi, Tortle — a varied spread across flight (Fairy, Owlin),
small/sneaky (Goblin, Tabaxi), tanky (Tortle, Centaur), and magical/fey
(Aasimar, Changeling, Satyr, Shifter), comparable in scope to the 12 homebrew
backgrounds. **Original mechanics only, same legal posture as the homebrew
backgrounds/feats** — these are NOT reproductions of the real published
Aasimar/Fairy/Tabaxi/etc. stat blocks from Volo's Guide, Wild Beyond the
Witchlight, or other sourcebooks (those are licensed content with the same
copyright status as the missing PHB backgrounds); each trait here is freshly
written, only the species *concept/name* is drawn from the wider game.

**Source/seed file:** `supabase/seed/homebrew-species.json` — 26 new homebrew
traits (`ruleset='homebrew'` in the `traits` table) plus the 10 species rows
(`ruleset='homebrew'` in `species`). Two traits are deliberately REUSED from
the real SRD rather than duplicated: `darkvision-60` (Goblin, Shifter — the
exact same mechanical effect already shared by Dragonborn/Elf/Gnome/Tiefling)
and `fey-ancestry` (Fairy, via Elf's existing trait — "Advantage on saves to
avoid/end Charmed," an exact match for the flavor). `keen-senses` (Shifter)
also reuses the real Elf trait (skill-proficiency choice) rather than writing
a near-duplicate. Every other trait is original. **Deliberately scoped flat
— no subspecies/lineages** for any of the 10, unlike several real species
(Gnome/Dwarf/Elf/Tiefling/Dragonborn all have 2024 lineage choices) — keeps
the batch bounded, consistent with shipping 1 subclass per class instead of
the real game's 3-4.

**Required one real code change, not just data**: `getSpeciesList()` in
`srd.ts` hardcoded `.eq("ruleset", "2024")` — homebrew species would have
been invisible in the builder without widening it to
`.in("ruleset", ["2024", "homebrew"])`, mirroring `getGeneralFeatsList()`'s
existing pattern exactly. Added `isHomebrew: boolean` to `SpeciesOption`
(same shape as `FeatOption.isHomebrew`) and a new `speciesIsHomebrew` field
on `CharacterSheet` (`buildCharacterSheet` now reads `species.isHomebrew`,
mirroring the existing `backgroundIsHomebrew` plumbing exactly). Surfaced in
three places, matching backgrounds' existing disclosure pattern at each:
`SpeciesStep.tsx`'s species grid (a "Homebrew" badge chip) and its selected-
species trait panel (a one-line disclosure sentence), `ReviewStep.tsx`'s
summary line, and the Play Sheet's header line — all three now show
"SpeciesName (Homebrew)" exactly like backgrounds already did. Did NOT touch
`getSubspeciesList()` — none of the 10 homebrew species have lineages, so its
existing 2024-only filter is still correct as-is.

Tested live end-to-end through the actual builder (not a hand-inserted SQL
character, since this exercises the builder's species list/picker, not just
the play sheet's rendering): confirmed all 19 species appear (9 official
sorted first, 10 homebrew sorted after, each homebrew one badged), selected
Fairy and confirmed its 3 traits (Fairy Flight, Fey Ancestry, Innate Charm)
plus the homebrew disclosure sentence render, walked a full Sorcerer/Sage
build through Class → Abilities → Background, confirmed the Review step
showed "Species: Fairy (Homebrew)", saved, and confirmed the Play Sheet
header showed "Level 1 Fairy (Homebrew) — Sage". No console errors.

**With this, every item in the original full-leveling roadmap is shipped**:
all 12 classes' spellcasting/resources, plus homebrew species filling the
free SRD's species gap. No further roadmap items are queued — see
`project_tavern.md` for what's next if the user opens a new initiative.

## Post-roadmap fixes — Save bug, builder explanations, species traits
Four pieces of user feedback after the roadmap closed, fixed together.

**1. Spell/Metamagic/Fighting-Style picker Save button silently no-opped —
root cause was a stale dev server, not a code bug.** The local dev server
had been running continuously since early in a very long session, through
dozens of hot-reloads as `actions.ts`/`PlaySheet.tsx` were edited across the
Warlock → Monk → homebrew-species passes. Next.js dev mode can let Server
Action references go stale after that many edits — the button still fires,
the action just silently fails. Restarting the dev server (`preview_stop` +
`preview_start`) resolved it; re-tested Cantrips/Prepared Spells/Metamagic
saves afterward, all persisted correctly. Lesson for long sessions: if a
Server Action starts behaving like it's not firing at all (no error, no
effect), restart the dev server before assuming a code regression.

**2. Builder: "Choose Skills" and "Assign Ability Scores" now explain what
each choice does**, not just name it. Both surface REAL SRD data that was
already being fetched but not rendered — not new content. `SkillInfo`
gained a `description` field (`getSkillsList()` already had the row's
`data`, just wasn't selecting/extracting `data.description`) — every skill
already has a real one-line SRD description (e.g. Acrobatics: "Stay on your
feet in a tricky situation, or perform an acrobatic stunt."). `ClassStep.tsx`
now shows each skill option's ability score + description; a general
explainer paragraph above the grid covers what skill proficiency means
mechanically. `AbilitiesStep.tsx` already had `AbilityScoreInfo.description`
fetched (`getAbilityScoresList()`) but wasn't rendering it either — now
shows the real short SRD description ("Physical might" for STR, etc.) plus
two things the real description doesn't cover: a hand-written one-line
combat-relevance note per ability (`ABILITY_COMBAT_NOTES` in
`AbilitiesStep.tsx` — CON governs zero skills despite being the most
important survival stat, so skills alone would undersell it; spellcasting
ability per class confirmed independently while building each class's
resources earlier in this project, not re-derived here) and the real
governed-skills list (derived from `SkillInfo.abilityScore`, not
hand-written). Both steps needed a new `skills` prop threaded through
`BuilderWizard.tsx` (the data was already fetched at the page level and
passed to `ReviewStep`, just not to these two).

**3. Builder Save now redirects straight to the new character's play
sheet.** `saveCharacter()` in `src/app/builder/actions.ts` now does
`.select("id").single()` on the insert and returns `characterId`;
`ReviewStep.tsx` calls `router.push(`/characters/${characterId}`)` on
success instead of showing a static "Saved! View it in My Characters" link
the player had to click through. Removed the now-dead `"saved"` state
branch entirely rather than leaving unreachable code.

**4. Species traits weren't shown ANYWHERE on the play sheet** — a
pre-existing gap noticed once Dragonborn's Breath Weapon/Draconic Flight
were flagged as missing. Two-part fix: a baseline "Species Traits" card
(informational, same collapsible-list pattern as Features) for every
species' base + chosen subspecies traits, PLUS full interactive treatment
for the traits with a clean, resource-shaped mechanic — extended beyond just
Dragonborn to Dwarf/Orc/Goliath for consistency once the pattern existed,
and to the homebrew Tortle for an AC-correctness fix. See the dedicated
"Species traits" section below for full details (sourcing, what's
interactive vs informational-only, and what's deliberately deferred).

## Species traits
Every species/subspecies trait is now real SRD content surfaced on the play
sheet, not just chosen during the builder. Two tiers, same split-by-shape
reasoning used for class resources all session: traits with a clean,
deterministic mechanic get full interactivity; everything else is
informational-only via a new "Species Traits" card (same collapsible-list
pattern as Features).

**Plumbing that didn't exist before this pass:** `species`/`subspecies`
tables only ever exposed `{index, name}` for each trait — the actual
description text lives in a separate `traits` table, never looked up. New
`getTraitDescriptions()` in `srd.ts` fetches the whole table once (~50 rows
incl. homebrew) into a plain `Record<string, string>` — explicitly NOT a
`Map`, since `Map` instances don't survive the Server Component -> Client
Component props boundary (this surfaced as a real bug while building this:
the prop silently became unusable on the client side until switched to a
plain object). `PlaySheet.tsx` merges the chosen species' base traits +
chosen subspecies' traits into one list (subspecies traits can carry their
own `level`, e.g. Elven Lineage's level-3/5 spell unlocks; base species
traits default to level 1), looks up each one's text via the new lookup,
and renders it with the exact same `ClassFeature`-shaped collapsible-row
JSX already used for class Features.

**Dragonborn (the user's example) — fully interactive:**
- **Breath Weapon**: dice scale 1d10 to 4d10 at levels 1/5/11/17 (confirmed
  directly in the trait's own text), uses = Proficiency Bonus, Long-Rest-
  only recovery, DEX save DC = 8+CON mod+Proficiency Bonus. The damage TYPE
  is on the chosen Draconic Ancestor SUBSPECIES, not the base species —
  confirmed independently per ancestor (`subspecies.data.damage_type`), not
  assumed from the ancestor's color/name (e.g. Bronze and Blue are both
  Lightning, not "Bronze gets a bronze-colored damage type"). `SubspeciesOption`
  grew a `damageType` field for this. Roll+expend combined in one click
  (`rollBreathWeapon`), same shape as Second Wind — the save itself isn't
  applied (no target/enemy state to apply it to), just the damage roll and
  the DC for the player to use manually.
- **Draconic Flight** (level 5+): once-per-Long-Rest Bonus Action, Fly Speed
  = Speed, no roll — a simple "mark used" toggle, same shape as Warlock's
  Magical Cunning minus the resource refund.

**Extended to other species once the patterns existed, for consistency —
not separately requested, but cheap once Dragonborn's plumbing was built:**
- **Dwarf — Stonecunning**: Bonus Action for Tremorsense, uses = Proficiency
  Bonus, Long-Rest-only. No roll (Tremorsense itself isn't a numeric effect
  this app tracks) — just a stepper.
- **Orc — Adrenaline Rush**: Bonus Action Dash + flat Temporary Hit Points
  equal to Proficiency Bonus, uses = Proficiency Bonus, recovers on a Short
  OR Long Rest (confirmed "finish a Short or Long Rest" — the same trait
  shape as Action Surge/Focus Points). No roll needed since the temp-HP
  amount is flat and deterministic — grants it and expends a use together.
- **Orc — Relentless Endurance**: "When you are reduced to 0 Hit Points but
  not killed outright, you can drop to 1 instead... until you finish a Long
  Rest." The only species trait that's automatic rather than a button —
  `applyDamage()` checks `sheet.relentlessEnduranceAvailable` and intercepts
  any damage that would drop current HP to 0, dropping it to 1 instead and
  logging "Relentless Endurance" to the dice log. Applied unconditionally
  rather than as a player choice (the real rule frames it as "you can," but
  declining is never correct, so prompting would just be friction). Doesn't
  model the "not killed outright" massive-damage/instant-death exception,
  which this app doesn't track for any class.
- **Goliath — Large Form** (level 5+): same once-per-Long-Rest toggle shape
  as Draconic Flight, no roll.
- **Homebrew Tortle — Natural Armor**: "your base Armor Class is 17" — a
  FLAT REPLACEMENT of the unarmored base, not an additive bonus like every
  other AC modifier built so far (Defense Fighting Style, Barbarian/Monk's
  Unarmored Defense). `computeArmorClass`/`computeAC` grew a
  `flatUnarmoredAC` parameter for this — only takes effect in the existing
  unarmored branch, so a Tortle wearing actual body armor correctly uses
  the armor's own AC instead (matching the real rule, "can't benefit from
  wearing body armor"), confirmed live by equipping/unequipping Chain Mail
  on a Tortle Fighter test character (16 while armored, 17 once unequipped).
  This wasn't part of the user's ask but was a real correctness gap in
  homebrew content already written — fixed alongside the rest rather than
  left broken.

**Deliberately deferred, explicitly NOT built in this pass — each is
substantially bigger than anything above, closer to a full class-resource
pass than a quick addition:**
- **Goliath's Giant Ancestry** (choose 1 of 6 benefits at level 1, then
  uses = Proficiency Bonus 1/Long Rest for whichever was chosen) needs a
  whole new "ancestry choice" picker, similar in shape to Cleric/Druid's
  Divine Order choice but for a species trait.
- **Elf's Elven Lineage, Gnome's Gnomish Lineage, Tiefling's Fiendish
  Legacy** — all three grant a cantrip at level 1 plus a scaling "always
  prepared, cast once free per Long Rest" spell at character levels 3 and 5,
  tied to whichever of 2-3 lineage options was chosen as a SUBSPECIES. This
  is a genuinely different spell-tracking axis from each class's own
  Prepared Spells list (a second, smaller "always prepared" list per
  character, with its own free-cast-per-rest tracking) — real, well-defined
  mechanics, just substantial enough to warrant treating as its own future
  pass rather than bundling in. The lineage CHOICE itself already works
  today via the existing generic subspecies picker (built for Draconic
  Ancestor); only the bonus spellcasting is deferred.
- **Halfling's Luck** — NOTE: this was later actually implemented (see the
  "Audit fixes" section below). `isHalfling` is threaded into `rollD20()`
  everywhere and the dice log shows "(Lucky)" when a natural 1 is rerolled.
  This deferral note is kept for history but no longer accurate.

Tested live: walked a Dragonborn (Draconic Ancestor: Red) through the
ACTUAL builder end-to-end (not a hand-inserted character, to also exercise
the lineage picker and the new skill/ability explanations along the way),
confirmed Breath Weapon showed "Roll 1d10 Fire" with DC 12 at level 1 and
correctly had no Draconic Flight button yet; hand-inserted a level-5 copy
and confirmed Breath Weapon scaled to "Roll 2d10 Fire" / DC 13 / 3 uses and
Draconic Flight appeared and toggled correctly. Separately tested Dwarf
(Stonecunning 2/2 at level 3), Orc (Adrenaline Rush granting exactly 2 temp
HP and expending a use; Relentless Endurance correctly dropping HP to 1
instead of 0 on lethal damage, logged to the dice log), Goliath (Large Form
appearing at level 5), and Tortle (AC 16 with Chain Mail equipped, 17 once
unequipped). No console errors across any of the five test characters.

## Dice Log — generic dice tray
User feedback after the species traits pass: "the log part should have all
the dice shown there too... meant to show the actual dice where the user
can just tap the d20 for example to roll that." Every structured roll
already logged its full dice breakdown (confirmed by reading every
`pushLog` call site in `PlaySheet.tsx` before building anything — this
wasn't a missing-data bug). What was actually missing: a way to roll a die
on its own, untied to any specific check/attack/feature — a classic
tap-a-die dice tray.

Added a row of `d4`/`d6`/`d8`/`d10`/`d12`/`d20`/`d100` buttons to
`DiceLog.tsx` itself, between the existing Roll Mode controls and the
entries list. Only `d20` honors the current Roll Mode (Advantage/
Disadvantage) — confirmed real 5e rule: that mechanic is specific to d20
tests (checks/saves/attacks), not damage or other dice — rolling via the
same `rollD20()` used everywhere else in this app and showing both dice
when in Advantage/Disadvantage mode, exactly like every other d20 roll.
Every other die is a single flat roll via `rollFlatDie()`. The component
needed a new `onRoll: (entry: Omit<DiceLogEntry, "id">) => void` prop —
`PlaySheet.tsx` passes its existing `pushLog` straight through, so
`DiceLog` now owns the generic-roll logic while `PlaySheet` still owns
every feature-specific roll, same division as before.

Tested live: tapped d20 in Normal mode (logged "d20: 8", single roll);
switched to Advantage and tapped d20 again (logged "d20: 12 [12, 4]" —
correctly rolled both and kept the higher); tapped d6 while still in
Advantage mode (logged "d6: 4", a single roll, confirming non-d20 dice
correctly ignore Roll Mode). Screenshot-verified the button row's styling
matches the existing dark-parchment aesthetic. No console errors.

## Character profile: avatar, bio, section nav, delete
User asked for four things in one pass: a profile-picture upload "at the
top," an "About Me" bio shown there too ("kind of like a Facebook profile
but for the dnd character"), a menu to navigate the play sheet's info
cards, and the ability to delete a character (which had no UI anywhere —
confirmed there was already a `"Users can delete their own characters"`
DELETE RLS policy on `characters` sitting unused since the table was
created, so only the Server Action + UI were missing).

Migration `add_character_bio_and_avatar`: `characters` gained `bio text`
and `avatar_url text` (both nullable, presentation metadata like
`is_public`, not part of `CharacterDraft` — never read by
`buildCharacterSheet`). Also creates a public `avatars` Storage bucket
(5MB file size limit, image mime types only) with four RLS policies:
public SELECT, and INSERT/UPDATE/DELETE restricted to
`(storage.foldername(name))[1] = auth.uid()::text` — i.e. each user can
only write inside a folder named after their own user id. Avatars are
stored at `{userId}/{characterId}.{ext}` with `upsert: true`, so
re-uploading a photo for the same character overwrites in place rather
than accumulating orphaned files; a `?t=${Date.now()}` cache-busting
suffix is appended to the stored URL so the browser doesn't keep showing
a stale cached image after a re-upload. `database.types.ts` regenerated
to match.

New components, all under `src/components/playsheet/`:
- `CharacterAvatar.tsx` — a circular image button (initial-letter
  placeholder when no photo). Owner-only click opens a hidden
  `<input type="file" accept="image/*">`; validates type and a 5MB cap
  client-side (the bucket also enforces this server-side — belt and
  suspenders) before uploading via the browser Supabase client and
  persisting the public URL through a new `setCharacterAvatar` action.
  "Remove" sets the URL back to null (does not delete the underlying
  Storage object — an intentional simplification; the orphaned file is
  small, RLS-scoped to that user's folder, and never referenced again).
- `CharacterBio.tsx` — click-to-edit textarea (2000 char cap, matching
  the Server Action's own cap), persisted via `setCharacterBio`. Renders
  nothing for non-owners when empty, rather than showing an empty-state
  prompt that only makes sense for the owner.
- `DeleteCharacterButton.tsx` — a deliberately unobtrusive text link
  (not a prominent button) that expands into an inline "Permanently
  delete {name}? This can't be undone. [Confirm Delete] [Cancel]" bar.
  Calls the new `deleteCharacter` action and redirects to `/characters`
  on success.
- `SectionNav.tsx` — sticky (`top-0`) horizontal pill strip placed right
  under the header, one button per card on the page that's actually
  present for this character (conditional cards like Fighting Style,
  Spells, Species Traits, Features, and Attacks are only listed when
  they'd actually render — computed inline in `PlaySheet.tsx` from the
  same flags those cards already gate on). Each button calls
  `scrollIntoView({behavior:"smooth", block:"start"})` against a plain
  `id` attribute added to each of the 10 card divs.

Three new Server Actions in `src/app/characters/actions.ts`
(`setCharacterBio`, `setCharacterAvatar`, `deleteCharacter`) all follow
the same shape as the existing `setCharacterPublic`: re-check
`auth.getUser()` and scope the mutation by `.eq("user_id", ...)` rather
than trusting the client — `deleteCharacter` doesn't need
`loadOwnedDraft` since it isn't touching the draft, just an
ownership-scoped `.delete()`.

Tested live end-to-end with a disposable test account/character (deleted
afterward) built from a copy of a real Dragonborn Paladin draft shape, so
every conditional nav section (Fighting Style, Spells, Species Traits)
would actually be present:
- Bio: saved, rendered, survived a full page reload.
- Avatar: file inputs can't be scripted for security, so the upload was
  driven by constructing a real `File` + `DataTransfer` and dispatching a
  genuine `change` event at the actual `<input>` — exercising the real
  component end-to-end, not a mocked shortcut. Upload succeeded, the
  `<img>` rendered the real Storage public URL, survived a reload, and
  "Remove" correctly reverted to the placeholder. Separately verified
  Storage RLS directly: uploading to the signed-in user's own folder
  succeeds, uploading to a different folder is rejected with "new row
  violates row-level security policy."
  - this also accidentally fixed a stale local test account that
    couldn't sign in: GoTrue requires `confirmation_token`,
    `recovery_token`, `email_change_token_new`, and `email_change` on
    `auth.users` to be empty strings, not `NULL` — a manually-inserted
    row that leaves them `NULL` fails login with an opaque `{}` client
    error. Worth remembering for any future hand-inserted test account.
- Section nav: clicking a section button scrolls so the target's top
  edge lands at exactly `0` relative to the viewport (confirmed via
  `getBoundingClientRect()`, not just a screenshot — a screenshot taken
  immediately after `click()` can catch the smooth-scroll animation
  mid-flight and look wrong when the resting position is actually
  correct).
- Delete: confirm-bar appears, Cancel dismisses with no mutation
  (verified the row still existed in the DB after Cancel), Confirm
  Delete removes the row and redirects to `/characters` — verified by
  querying the DB directly (row count 0) and confirming the name no
  longer appears in the My Characters list, not just trusting the
  redirect.
- Confirmed RLS still correctly blocks viewing a real, non-public
  character signed in as a different user (tried loading the real
  "Lalala" character while signed in as the test account — got the
  existing "Character Not Found" page, no regression/leak).
No console errors across any of the above.

## Personality & Backstory questionnaire
User's framing: "have like a personality/backstory part to the character
maker... It should be displayed that it will not affect gameplay
mechanics only storytelling/roleplaying... thinking about having a
questionnaire of sorts that users go through to basically generate a
prompt they can put into AI to build a bio and image... should also
include the players stats too so if they say they are a master thief in
their backstory but the stats say the opposite the AI should kind of say
'They have delusions of being a master thief'." Co-designed the question
set with the user in chat before writing any code — 9 questions, grouped
into Personality (Positive/Negative/Heroic/Destructive Trait, Flaw),
Backstory (Origin, Motivation, Bond), and Appearance — each a curated
multiple-choice list (original flavor content, not SRD) plus "Write your
own…" and "None", landing on "short multiple-choice list with free text
option" after iterating past plain free-text and pure-curated alternatives.
Negative Trait vs. Flaw is a deliberate, subtle split (passive personality
quirk vs. active compulsion); Destructive Trait is framed as in-fiction
social damage generally (grudges, distrust, manipulation), not narrowed to
the species-prejudice example the user used to describe it. Appearance
carries its own disclaimer ("won't add, remove, or change anything in
your inventory") after the user specifically flagged that a clothing-style
option could read as implying a real inventory item.

Storage: a new nullable `personality jsonb` column on `characters` —
deliberately NOT folded into `CharacterDraft`/`draft`, mirroring why
bio/avatar_url live outside the draft too: this is presentation flavor
`buildCharacterSheet` never reads, kept structurally separate so that
guarantee doesn't depend on remembering not to read a field. During the
builder it lives in `BuilderWizard.tsx`'s own `personality` state with its
own localStorage key (`tavern_character_personality`, separate from the
draft's key) and rides along in `saveCharacter(draft, personality)` at
Review/Save time; after creation it's edited independently via
`setCharacterPersonality(characterId, personality)` on the play sheet
(same ownership-scoped-update shape as `setCharacterBio`).

Gate screen first ("Bring Your Character to Life" / Let's Do It / Skip
For Now) per the user's own suggestion — states up front that this only
produces a copy-pasteable prompt for an external AI tool, not an in-app
generation, and that it's pure flavor. "Skip For Now" leaves
`personality` null; the step is always advanceable either way (no
required answers — every question defaults to "None"). The question
grid itself (`PersonalityQuestionnaire.tsx`) is a shared component reused
identically by the builder's `PersonalityStep.tsx` and the play sheet's
`CharacterPersonality.tsx` — same questions and interaction model, just
different surrounding chrome (gate + Next button vs. an Edit/Save toggle
on an existing character).

`buildPersonalityPrompt(sheet, personality)` in `src/lib/personality.ts`
assembles the actual prompt from the LIVE `CharacterSheet` (name, species,
class/level, background, all 6 ability scores + modifiers, every
proficient skill with its bonus) plus all 9 answers, plus an instructions
block that explicitly tells the consuming AI to reconcile rather than
ignore contradictions between claimed personality and actual stats/skills
— directly implementing the "delusions of being a master thief" idea.
Always rebuilt fresh from current props, never frozen at creation time,
so it stays accurate after the character levels up. Surfaced on the play
sheet via a "Copy AI Prompt" button (clipboard) plus an optional "Preview
prompt" toggle that shows the exact text inline.

Bug caught during live testing, not before: clicking "Write your own…"
on a question still at its default ("None") did nothing visible — the
first click committed the still-empty custom draft through the parent's
`value || "None"` fallback, which collapsed `isCustomValue` back to false
and hid the input before the player got a chance to type anything. Fixed
by separating "is the committed value custom text" from "is the input
open" into two different pieces of state (`editingCustom` local state,
ORed with the derived `isCustomValue`) so opening the editor never
implicitly commits anything — confirmed fixed by reproducing the original
failure, then reloading and confirming the input now opens and stays open
on the very first click, with typed text correctly committing afterward.

Also hardened `copyPrompt()` with a `.catch()` after live testing
surfaced (via Next.js's dev-mode "N Issues" overlay, not a normal
console.error) that `navigator.clipboard.writeText()` can reject with
`NotAllowedError` — confirmed via the dev server's own terminal log, not
just the browser console — and the component had no failure feedback at
all, identical to a pre-existing gap in `ShareControl.tsx`'s "Copy Share
Link" (not touched — out of scope for this change). The specific
rejection seen during testing was this remote browser-automation
session's document never holding real focus (the same root cause an
explicit `navigator.clipboard.readText()` call surfaced directly as an
error), not a defect reachable by a real user clicking with a real mouse
in a focused tab — but the missing `.catch()` was a real gap regardless of
cause, so it's fixed now: failures show "Couldn't copy automatically —
use Preview prompt and copy it manually" instead of silently doing
nothing.

Tested live end-to-end with a disposable account/character (Human
Fighter, deleted after): full builder walkthrough through the gate
screen, all 9 questions (mixing curated picks and a "Write your own"
custom answer), Review showing "Personality & Backstory: Added", Save
redirecting to the play sheet with all 9 answers rendering correctly,
"Preview prompt" producing exactly the expected text (verified the
master-thief-style scenario directly: a Negative Trait claiming a habit
of taking things, with no Stealth/Sleight of Hand proficiency anywhere in
the Trained Skills line — exactly the contradiction the feature exists to
surface), Edit reopening pre-filled with the saved answers including the
custom text, Cancel correctly discarding an in-progress change, "Remove
entirely" correctly clearing the column back to null (confirmed via direct
DB query, not just the UI), and "+ Add personality & backstory" correctly
reopening the questionnaire from empty. Also reused a real, unmodified
character (Dragonborn Paladin) purely to confirm RLS still blocks a
non-owner, non-public view with no changes made to it. No console errors
after the clipboard fix landed.

## Personality questionnaire UX pass
User feedback after using the feature: the wrapping-pill option grid was
"chaotic to read" for someone who "struggles to focus on that kind of
thing"; the prompt should note it works best with ChatGPT/Gemini/Grok
specifically because they generate images too; and some curated options
are too vague to be useful verbatim — "I distrust an entire people" begs
"who? what?" with no way to answer that without abandoning the quick-pick
for full custom text. They also asked for every question to get a short
description like Destructive Trait already had.

Layout: `PersonalityQuestionnaire.tsx` rebuilt around two changes —
options render as a vertical list (one full-width row each, a small
radio-dot circle for state) instead of a wrapping flex of pill buttons,
and each question is now its own bordered card (`rounded-lg border
border-tavern-bg/40 p-4`) rather than a thin top-border divider between
flowing sections. Both are aimed straight at "chaotic to read" — a
predictable top-to-bottom list and a clear visual boundary per question,
not just a color change.

Descriptions: `PersonalityQuestion` gained a required `description`
field (replacing the optional `note` two questions had); all 9 now carry
one. Destructive Trait's and Appearance's existing text became their
description verbatim — the user said they liked that one specifically,
so it wasn't reworded, just renamed in the data model.

Detail enrichment: selecting any curated (non-None) option reveals an
optional "Add specifics — who, what, where?" input. Typing into it folds
the text into the committed answer as `"<option> Specifically: <detail>"`
— no new field on `PersonalityAnswers`, just a richer string for that
same key. Re-opening Edit later shows the combined sentence as plain
custom text (the curated/detail split is a compose-time UI affordance
only, not preserved structurally) — an intentional simplification, not
an oversight.

Real bug caught live (not before): the first build derived "is this a
curated pick versus custom text" from comparing the live `value` prop
against `question.options` on every render. The moment a detail's first
keystroke folded into the committed string, that combined string no
longer matched any curated option verbatim, so the component flipped to
"custom" mode on its own — hiding the detail input and showing an empty
custom box instead, discarding what looked like a no-op to the player.
Fixed by deciding `mode: "picked" | "custom"` ONCE at mount from the
initial value, as plain local state never re-derived from props
afterward — only explicit clicks change it from then on. Confirmed fixed
by reproducing the original failure on a fresh reload, then re-testing
the exact same sequence (pick a vague option, type a detail, type more)
and watching the option stay selected and the detail persist throughout.
Also re-verified "Write your own" on an unrelated question still works
post-refactor (regression check) — it does, untouched by the fix.

AI tool note added in two places: the builder gate screen ("Works best
with ChatGPT, Google Gemini, or Grok, since they can generate the image
too") and directly above the Copy/Preview buttons on the play sheet,
where it matters most since that's the point of action.

Tested live with a disposable account/character (deleted after):
confirmed the new vertical-list layout and per-question cards render
correctly, confirmed detail enrichment on Destructive Trait survives a
second edit and a full Save→reload→Preview-prompt round trip with the
exact combined text appearing correctly in the generated prompt, and
confirmed "Write your own" still works on a different question in the
same session. No console errors.

User asked whether the prompt could make the AI return the backstory
and the portrait in one go, rather than needing a follow-up step. The
old wording asked the AI to write "a vivid visual description suitable
for an AI image generator" — phrasing that implies handing that
description to a *separate* tool, not generating the image itself in
the same reply. Reworded `buildPersonalityPrompt()` in two places: the
opening line now says "Generate both a backstory and a portrait image
... in this one response — don't ask any follow-up questions first,"
and the instructions are now numbered, with #2 explicitly saying
"actually create it with your image generation capability, don't just
describe what it would look like." Verified live via Preview prompt
that the new wording renders correctly.

## Four small UX fixes
1. **Section nav scrollbar** — "the scroll bar is ugly." Added a
   `.scrollbar-hide` utility in `globals.css` (the standard
   `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`
   pair) applied to `SectionNav.tsx`'s scrollable strip, plus two static
   edge-fade gradients (`bg-gradient-to-r/l from-tavern-bg`) so there's
   still a visual hint the strip scrolls now that the native scrollbar
   chrome is gone. The underlying `overflow-x-auto` is untouched — only
   the scrollbar's own visual track/thumb is hidden, scroll itself
   (wheel, trackpad, touch, drag) still works exactly as before.
2. **Delete on the My Characters list** — previously only existed on the
   play sheet. `DeleteCharacterButton` gained an optional `onDeleted`
   callback (list usage removes the row from local state; play-sheet
   usage, when the prop is omitted, keeps navigating to `/characters`
   since that page's own data is gone). The list page's row markup
   changed from "the whole card is a `<Link>`" to "a `<div>` card
   containing a text-only `<Link>` plus a delete control below it" —
   needed because a `<button>` can't nest inside an `<a>`, and doing it
   this way (rather than absolute-positioning the button into a corner)
   gives the confirm bar room to expand without overflowing the card.
   New `CharacterList.tsx` client component under
   `src/components/characters/` owns this local state; `page.tsx` stays
   a server component that just computes display strings and hands off
   a plain array.
3. **"Skip For Now" did nothing** — a real bug, not a vague complaint.
   `PersonalityStep`'s gate screen calls `onUpdate(null)` for both
   buttons' original code, but the gate screen only ever renders when
   `personality` is ALREADY null — so "Skip For Now" was a true no-op
   state update (`null === null`, React doesn't even re-render). Fixed
   by adding an `onSkip` prop threaded from `BuilderWizard.tsx`'s
   existing `goNext`, called instead of the pointless `onUpdate(null)`.
4. **Species/Class/Background selectors only showed stats, not
   descriptions.** Background already rendered `selected.description`
   — but investigating revealed that field is `null` for all 4 OFFICIAL
   SRD backgrounds (Acolyte/Criminal/Sage/Soldier); it only has real
   text for homebrew ones, because that text was authored alongside
   each homebrew background, not sourced from the open dataset. Species
   and classes don't have any description field in their SRD data
   at all — checked directly via `jsonb_object_keys` before assuming
   otherwise. New `src/lib/flavor-text.ts` holds three original,
   one-line-each lookup maps: `SPECIES_DESCRIPTIONS` (19),
   `CLASS_DESCRIPTIONS` (12), and `OFFICIAL_BACKGROUND_DESCRIPTIONS` (4,
   filling just the gap the homebrew ones don't have). `getSpeciesList`/
   `getClassesList`/`getBackgroundsList` merge these in as a fallback
   (`d.description ?? LOOKUP[index] ?? null`), so the three step
   components' rendering code didn't need new logic — `SpeciesStep`/
   `ClassStep` just gained the same `{selected.description && <p
   className="italic">...}` block `BackgroundStep` already had.
   This is original short flavor text, not paraphrased from any
   specific copyrighted book — same authorship footing as the homebrew
   feats/backgrounds/Metamagic options already in the project.

Tested live end-to-end with a disposable account/character (deleted
after): walked the full builder (Human Wizard, Sage background),
confirmed Species/Class/Background each show their description text in
the same spot relative to the stats panel; confirmed "Skip For Now" now
advances all the way to Review with "Personality & Backstory: Skipped"
showing correctly; confirmed the play sheet's section nav has no visible
scrollbar while `scrollWidth > clientWidth` (so the fix is actually being
exercised, not a no-op test) and still scrolls programmatically;
confirmed Delete on the My Characters list shows the same confirm bar,
removes the row immediately without a page reload, and the row is
actually gone from the database, not just hidden client-side. No console
errors.

## Section nav scroll-spy
Hiding the native scrollbar made the nav "harder to use" per the user —
fair, since the scrollbar was the only signal of "there's more here" and
"where am I." Fix: scroll-spy. `SectionNav.tsx` now tracks an `activeId`
via `IntersectionObserver`, watching all section `id` elements with
`rootMargin: "-15% 0px -75% 0px"` — a thin detection band positioned
15-25% down the viewport, so a section is "active" once it's scrolled
up near the top (clear of the sticky nav itself) rather than the instant
it first appears at the bottom of the screen. The active button gets a
gold border/text instead of the default muted style, and a second effect
calls `scrollIntoView({inline: "center", block: "nearest"})` on the
active button so the nav strip auto-scrolls to keep it visible — without
this, scroll-spy could highlight an item currently scrolled out of the
strip's own view, which would defeat the point.

Implementation note: IntersectionObserver's callback only reports
entries whose state *changed* since the last callback, not every
observed element — so naively using just the latest `entries` array to
pick "the topmost intersecting section" would lose track of sections
that are still intersecting but didn't change state this tick. Fixed by
maintaining a running `Map` of currently-intersecting entries, updated
incrementally (`set` on enter, `delete` on exit) each callback, then
picking the smallest `boundingClientRect.top` from that full map, not
just the latest entries.

Also fixed a real (if non-visible) inefficiency caught while debugging:
`PlaySheet.tsx` builds the `sections` array as a fresh literal on every
render, so depending on the array *reference* in `SectionNav`'s
`useEffect` would tear down and recreate the IntersectionObserver on
every unrelated state change anywhere in that large component (a dice
roll, an HP edit, anything). Fixed by depending on
`sections.map(s => s.id).join(",")` instead — a stable string unless the
actual set of sections changes (e.g. a level-up unlocks Spells).

Debugging note for future reference: a temporary `console.log` inside
the observer callback was the only way to settle two false alarms while
testing this live. First false alarm: checking the active button via
`button.className.includes("border-tavern-gold")` — every button
matched, because the *inactive* style includes
`hover:border-tavern-gold-light`, which contains "border-tavern-gold" as
a literal substring. Fixed the check itself
(`className.split(" ").includes("border-tavern-gold")`), not the
component — there was no real bug. Second false alarm: scrolling to the
Equipment section (near the very bottom of the page) and expecting its
top to land at viewport y=0 — it can't, there isn't enough trailing page
content below it to scroll that far, so it stops short and a different
section legitimately still occupies the detection band. Both are listed
here because they looked exactly like real bugs until checked carefully
— same shape as the same-tick stale-closure and substring-match mistakes
elsewhere in this file.

Tested live: confirmed activeId starts on "Stats" on page load, updates
correctly as different sections (Skills, Species Traits) are scrolled
to the top, the nav strip auto-scrolls to keep the active pill visible
(verified the button's bounding rect falls fully within the scroller's
bounds, not just "looks right" in a screenshot), and confirmed the
near-bottom Equipment/Attacks boundary case behaves correctly given the
actual constraint (not enough page below Equipment to scroll it to the
very top). No console errors.

## Found/custom equipment
User wanted two things that turned out to be one feature: a way to add
standard equipment found on an adventure, and "a comprehensive custom
equipment builder" for DM-granted magic items ("you've found a Goblin
Slayer Sword") with manually-entered bonuses. Asked two scoping
questions before writing anything, since the answers changed the build
significantly: should bonuses auto-apply to Attack/Damage/AC, or just be
recorded for reference (chose auto-apply); should building a custom item
start from a real base item or be a blank form (chose base item). The
"start from a base item" answer unified what looked like two features
into one — browsing the standard catalog and building a magic item are
the exact same flow, just with the bonus fields left at zero or filled
in.

Data model (`src/lib/inventory.ts`): `InventoryItem` is always anchored
to a real `baseIndex` from the equipment table — `{id, baseIndex,
customName, count, attackBonus, damageBonus, acBonus, notes}`. Stored as
a new nullable `characters.inventory` jsonb array, separate top-level
column like bio/avatar_url/personality (not folded into `draft` — same
reasoning as always: presentation/player-added data, not part of the
mechanical build). `setCharacterInventory` is a freely-overwritable
whole-array action, same shape as setMetamagicChoices etc. — the client
manages add/edit/remove as local array ops and sends the full list each
time.

The integration design avoided touching `computeArmorClass` or
`resolveWeapons` for the AC/weapon-resolution logic itself, which
mattered given how much existing behavior depends on those functions
staying correct. `resolveInventoryEquipment()` converts each
`InventoryItem` into a normal `EquipmentBundleItem` (keyed by the item's
own client-generated id, which can't collide with a real SRD index) plus
a *synthetic* entry in a copied `EquipmentLookupItem` map, with the
item's bonuses already baked into that entry's real stats — an armor
bonus adds directly to `armorClass.base` before `computeArmorClass` ever
sees it, so that function needed zero changes. `resolveWeapons` only
needed two `?? 0` additions (`EquipmentLookupItem` gained optional
`attackBonus`/`damageBonus` fields that real catalog entries never set).
Everywhere in `PlaySheet.tsx` that fed `sheet.ownedEquipment` +
`equipmentByIndex` into AC/weapon resolution now feeds
`[...sheet.ownedEquipment, ...inventoryBundleItems]` + the augmented
lookup instead — the equip/unequip toggle (`play.equippedIndexes`,
already localStorage-only) needed no changes either, since inventory
item ids are just more strings in the same Set.

A custom item's category (weapon/armor/shield/other) is derived from
its *base* item's real stats (`base.damage` → weapon, `base.armorClass`
→ armor, `index === "shield"` → shield) rather than asked of the player
— a Longsword is obviously a weapon, no need to make someone declare
that. This also drives which bonus fields the add/edit form shows.
Once a detail is folded into a saved item (e.g. a name + bonus on top of
"longsword"), re-editing shows the real underlying base item's current
fields again — the base is permanent once set; changing it means
removing and re-adding, which was a deliberate scope cut, not an
oversight, given the "start from a base item" flow doesn't really need
mid-life rebasing.

The picker (`InventoryManager.tsx`) loads the full ~182-item catalog
client-side with a search box and five category tabs (All/Weapons/
Armor/Gear/Tools) — checked the actual catalog size before deciding
against pagination; 182 items filtered in a scrollable list is plenty
fast without it.

Tested live end-to-end with a disposable account/character (Human
Fighter, Chain Mail base AC 16, deleted after): added a standard gear
item (Backpack) with zero bonuses to confirm the "ordinary item" path
shows no bonus fields at all; built "Goblin Slayer Sword" on a Longsword
base with +1 attack/+1 damage and confirmed the Attacks card showed
Attack +6 (base +5, correctly +1) immediately, not just on the
inventory row; built "+1 Chain Mail" and confirmed swapping it in for
the real Chain Mail moved AC from 16 to 17; edited the sword's attack
bonus from +1 to +2 and confirmed both the inventory row AND the Attacks
card picked up Attack +7; removed the sword and confirmed it vanished
from both Equipment and the database (not just the UI); reloaded and
confirmed both the DB-backed items and the localStorage-backed equip
states survived; toggled the character public and viewed signed-out to
confirm Add/Edit/Remove are genuinely owner-gated (not just
visually hidden client-side — they don't render at all for a
non-owner). Caught and fixed one real testing mistake along the way:
clicking "Chain Mail" by text match hit the *starting equipment* toggle
button first (same name appears twice — once in owned gear, once in the
picker's search results), silently unequipping the real armor — not a
product bug, but a reminder that name-based button queries need scoping
when the same label can legitimately appear twice on a page. No console
errors.

## Currency tracking
User asked for "currency pouches, gold silver etc... still should be in
the inventory, but separate, maybe 3 main boxes along the top." Before
writing anything, checked `parseEquipmentOptions` in `srd.ts` and
discovered starting money was already being computed correctly the
whole time (class/background equipment choices produce real `isMoney:
true` bundle entries, e.g. `{name: "5 GP", count: 5}`) — the play
sheet's Equipment card was just explicitly filtering them out
(`!item.isMoney`) with nowhere else for them to go. So this wasn't
purely a new feature, it was also a real, previously-shipped bug: every
character's starting gold has been invisible on the play sheet since
the Equipment card was first built.

Went with all 5 standard denominations (CP/SP/EP/GP/PP) rather than
literally 3 — "maybe 3" read as a layout suggestion (a row of boxes),
not a hard cap, and the official 5e character sheet itself shows all 5
in that exact low-to-high order, which `CURRENCY_ORDER` in
`src/lib/currency.ts` matches directly rather than inventing an
ordering. New nullable `characters.currency` jsonb column, same
separate-top-level-column pattern as bio/avatar_url/personality/
inventory.

`deriveStartingCurrency(ownedEquipment)` sums every `isMoney` bundle
item by denomination (parsed from the tail of its `name` string, e.g.
`"5 GP"` → unit `"gp"`) — used as a lazy `useState` initializer only
when `characters.currency` is still null, so it runs once and never
re-derives after a player starts editing their own totals (e.g. it
won't re-sum on a level-up). `CurrencyTracker.tsx` renders the 5 boxes
at the top of the Equipment card as plain number inputs, editable
directly (not a delta/stepper) since currency swings by large,
irregular amounts in actual play, not +/-1 — each box commits to the
server on blur. Inputs are disabled (not hidden) for non-owners, so a
public character's currency is still visible without anyone being able
to edit a number that the server would reject anyway.

Implementation note for the next session: when first wiring this up,
React's `onBlur` lint rule flagged a `useEffect` doing `setDraft(...)`
to resync local input state with the prop value — fixed by adjusting
state during render instead (`if (value !== prevValue) { setPrevValue
(value); setDraft(...) }`), React's documented pattern for exactly this
"local editable copy of a prop" case, since an effect would commit one
extra stale frame and risks a cascading-render error.

Testing note: every "did the save actually fail" alarm during this pass
was actually a check that ran before the async round-trip had time to
finish — confirmed each time by re-querying the DB a few hundred
milliseconds later, or testing blur specifically (a raw `dispatchEvent
(new Event("blur"))` doesn't reliably reach React's delegated listener
since blur doesn't natively bubble; calling the real `.focus()` then
shifting focus to a different element is what actually triggers it
reliably in this harness). Same pattern as several earlier "this looks
broken" false alarms this session — worth checking timing before
concluding a save handler is broken.

Tested live end-to-end with a disposable account/character (Human
Fighter, Soldier background, deleted after): confirmed the previously
-invisible starting gold (18 GP) now renders automatically without any
prior currency ever being saved; edited Gold to 99 and confirmed it
persisted to the database (not just local state) and survived a full
page reload; toggled the character public and viewed signed-out to
confirm the inputs show the real value but are genuinely disabled, not
just visually styled to look disabled. No console errors.

## Five small fixes round
1. **Lineage descriptions.** Same gap as species/class/background before
   — no description field anywhere in the raw subspecies data (Draconic
   Ancestor, Elven Lineage, Giant Ancestry, etc.). `LINEAGE_DESCRIPTIONS`
   in `flavor-text.ts` covers all 24 lineages, grounded in classic,
   widely-known color/type associations (black dragons ↔ acid swamps,
   frost giants ↔ cold endurance) rather than invented from nothing —
   still original phrasing, not paraphrased book text. Wired into
   `SubspeciesOption.description` the same way species/class/background
   already work.
2. **Themed number steppers + scrollbars.** User attached a screenshot
   of the native gray spin-button arrows on a currency box clashing with
   the theme. Native spinners can't be reliably recolored cross-browser
   (the arrow glyph itself isn't a colorable CSS property in most
   engines, and Firefox doesn't expose the pseudo-elements for styling
   at all) — hid them globally instead
   (`input[type=number]::-webkit-inner/outer-spin-button` +
   `-moz-appearance: textfield` in `globals.css`) and built
   `src/components/NumberStepper.tsx`, a fused input + custom ▲/▼ pair
   (gold background, grey arrow, matching what was asked for) used
   everywhere a persistent counter benefits from quick increment/
   decrement: the 5 currency boxes and InventoryManager's Quantity/
   Attack/Damage/AC bonus fields. Deliberately *not* applied to the
   Damage/Heal/Lay-on-Hands inputs on the HP card — those are "type a
   one-off amount and click Apply" fields, not counters, so they just
   lost their spinner with no replacement (a cleaner look for that kind
   of field anyway). Also added a global gold-on-dark `::-webkit-
   scrollbar` rule so every scrollable area in the app picks up the
   theme automatically, not just ones touched individually —
   `.scrollbar-hide` (used by the section nav) still wins where present
   since a class selector beats the universal one.
3. **Draft not clearing after save — a real, longstanding bug.**
   Confirmed by reading `ReviewStep.tsx`'s `handleSave`: on success it
   only ever called `router.push(...)`, never anything that touched
   localStorage. The only code path that cleared the draft was
   `restart()`, bound to the "Start Over" button — which a player who
   just successfully saved and got redirected away would never click.
   Every character saved this entire project left its draft behind,
   silently waiting to confuse the next builder visit (explains why
   manual `localStorage.removeItem` was needed before nearly every test
   character built this session). Fixed with a new `onSaved` prop on
   `ReviewStep`, wired to the existing `restart()` in `BuilderWizard.tsx`
   — called right before the redirect.
4. **Resume-or-restart prompt.** Builder used to silently resume
   whatever was in localStorage with zero acknowledgement, the same
   silent-resume behavior that made bug #3 invisible for so long. Now,
   if a draft with a real species/class/name is found on mount,
   `BuilderWizard` shows an "Unfinished Character" interstitial
   (mirroring the Personality step's gate-screen pattern) naming what it
   found (e.g. "Elf") before either resuming or clearing via the same
   `restart()`. A draft that's still entirely default doesn't trigger
   this — nothing to ask about.
5. **Equipment/inventory item details.** Extended `EquipmentLookupItem`
   with `weight`/`cost` (real dedicated columns on the `equipment`
   table, just never selected before) and added
   `src/lib/equipment-details.ts`'s `equipmentDetailLines()` — one
   shared formatter producing damage/AC/properties/mastery/weight/cost
   lines, used identically by both the starting-equipment list and the
   found/custom list (passing the `InventoryItem` too for custom items
   adds a bonus/notes line on top). Each equipment row's existing
   equip/unequip click target was left untouched — a *separate* ▼/▲
   button reveals the details panel, avoiding any conflict between "tap
   to equip" and "tap to see details" on the same row.

Tested live end-to-end with a disposable account (deleted after): saw
the Elven Lineage descriptions render correctly for all three options;
reloaded mid-draft and confirmed the resume prompt appears naming "Elf",
then separately confirmed both Continue (keeps the draft) and Start
Fresh (clears it, verified via localStorage) work; built and saved a
full character and confirmed `tavern_character_draft` was reset to
`EMPTY_DRAFT` in localStorage immediately after, not just after a
manual Start Over; on the resulting play sheet, confirmed Chain Mail's
and Greatsword's expanded details show their exact real stats (AC 16/
55 lb/75 GP; 2d6 Slashing/Heavy+Two-Handed/Graze/6 lb/50 GP) and that a
freshly-added custom Dagger's details show correctly too (1d4 Piercing/
Finesse+Light+Thrown/Nick/1 lb/2 GP); confirmed the gold-themed stepper
buttons visually replace the native spinner and that clicking them with
real spacing between clicks correctly accumulates (confirmed in the
database, not just the UI) — three clicks fired in the same synchronous
tick under-counted, which is the same already-documented React-batching
artifact from earlier scroll-spy/select testing this session, not a
product bug; the themed scrollbar is visible in every screenshot from
this pass. No console errors.

## Custom equipment: conditional/dice-based bonuses
User feedback on the custom item form (screenshot of "Add Longsword" /
"Goblin Slayer Sword"): unclear how to express something like "an extra
1d6 damage to goblins" — a bonus that's both conditional (only vs. a
specific enemy) and dice-based, neither of which the Attack/Damage
bonus number fields can represent (they're flat integers, always-on).
Two real gaps, not just one: the form didn't say where this kind of
thing belongs, and even Notes — the right place for it — never
surfaced anywhere the player would actually see it mid-combat.

**Form copy clarifies the split.** Added a line under the weapon
Attack/Damage bonus fields in `InventoryManager.tsx`: these are flat
numbers added to every roll automatically; anything conditional or
dice-based belongs in Notes instead. Notes' own label and placeholder
now use the user's exact example (`"+1d6 damage vs goblins"`) rather
than generic "special properties" wording, and say directly that it'll
show on the Attacks card as a reminder but isn't auto-applied.

**Notes now actually reach the Attacks card — previously they only
ever showed in the Equipment list, nowhere near where you'd roll
damage.** Threaded `notes` through the same synthetic-lookup-entry path
the attack/damage bonuses already use (`EquipmentLookupItem.notes?`,
set by `resolveInventoryEquipment()` in `inventory.ts`) into a new
`ResolvedWeapon.notes` field, set by `resolveWeapons()` in
`character-sheet.ts`. `PlaySheet.tsx`'s Attacks card renders it as a
gold-italic line directly under the weapon's damage dice/type/mastery
line — visible at the exact moment it'd matter, not just on the
Equipment row further down the page. Real catalog weapons and the
synthesized Monk Unarmed Strike entry both get `notes: null`, so
nothing changes for them.

Caught and fixed a real authoring bug while writing the new form copy,
before it ever reached a user: `&apos;`/`&#39;` HTML entities only
decode inside JSX text children, not inside a plain JS string used for
an attribute value like `placeholder`. The first two drafts of the
placeholder string would have rendered the literal text `&apos;s` to
every user. Caught by re-reading the diff, not by build/lint (a string
attribute typo like this doesn't fail TypeScript or ESLint) — fixed by
rewording to avoid the apostrophe entirely rather than fighting quote
escaping.

Tested live with a disposable account/character (Human Fighter, Soldier
background, deleted after): confirmed the new form copy renders
correctly (no literal `&apos;`/`&#39;` text, real apostrophes display
correctly in the JSX-text helper paragraph); built "Goblin Slayer
Sword" on a Longsword base with Attack/Damage bonus left at 0 and Notes
set to "+1d6 damage vs goblins"; confirmed the Equipment list's
existing inline bonus/notes line still rendered correctly (regression
check, untouched by this change); equipped it and confirmed the Attacks
card showed "Goblin Slayer Sword — 1d8 +4 Slashing — Sap" with
"+1d6 damage vs goblins" directly underneath in gold italic, Attack +6
(no change from the base Longsword's own +6, confirming the flat bonus
fields and the conditional note are correctly independent of each
other). No console errors.

## Conditional bonus damage as a real mechanic; variant-toggle; item descriptions
User follow-up after the Notes-based fix above, pushing back on it
correctly: a Notes-only treatment of "+1d6 vs goblins" was a workaround,
not a real mechanic. Four pieces in one round, all from the same
feedback message, plus a NumberStepper color bug spotted along the way.

**1. NumberStepper's ▲ button had the wrong text color** — first
misdiagnosed this backwards (changed ▼ to match ▲'s muted gray, when
the user clarified ▼'s dark-on-gold was the one that already looked
right and ▲ was the mismatched one). Both buttons now use
`text-tavern-bg` — a strong dark arrow against the gold background —
not `text-tavern-muted`'s washed-out gray. One-line fix in
`NumberStepper.tsx`, affecting every stepper in the app at once
(currency boxes, inventory quantity/bonus fields) — confirmed via
`preview_inspect`'s computed `color` on both buttons, which now read
the identical `rgb(15, 18, 21)`.

**2. Conditional/dice-based bonus damage is now a real, structured
mechanic — `InventoryItem.bonusDamageDice`/`bonusDamageCondition`, not
freeform Notes text.** `bonusDamageDice` stores plain `NdM` notation
(e.g. `"1d6"`), composed by the UI from a die-size button row (d4-d12,
same control shape as the Dice Log's tap-a-die tray) plus a
`NumberStepper` count — never freehand-typed, so it's always valid
notation, no parsing/validation code needed. `bonusDamageCondition`
stays free text (`"vs goblins"`) since the condition itself is
inherently descriptive and DM-defined; no fixed enum would cover it.
Threaded through the exact same synthetic-lookup-entry path
`attackBonus`/`damageBonus`/`notes` already use (`EquipmentLookupItem`→
`resolveInventoryEquipment`→`ResolvedWeapon` in `character-sheet.ts`),
so `resolveWeapons` needed zero new logic, just two more passthrough
fields.

**Rolling it follows the established Sneak Attack/Brutal Strike
shape** — a standalone "Bonus 1d6" button on the weapon's Attacks-card
row (only rendered when `bonusDamageDice` is set), calling a new
`rollBonusDamage()` in `PlaySheet.tsx` that logs a clearly-separate dice
entry: label `"{weapon} Bonus Damage (vs goblins)"`, detail
`"1d6 [roll] — add to {weapon}'s normal Damage roll"`. Deliberately NOT
auto-summed with the normal Damage roll — this app has no enemy/target
state to check "vs goblins" against, so the player decides when the
condition applies and adds the two numbers themselves, same reasoning
as Sneak Attack's trigger conditions not being tracked either. The
weapon row also shows a gold-italic "+1d6 bonus damage vs goblins" line
unconditionally (so the player knows the button's there without
clicking it first), and the Found/Custom equipment row's inline summary
+ `equipmentDetailLines()` both gained a matching line.

**3. InventoryManager's custom-item fields are now hidden behind a
"+ Add Special Variant" toggle, collapsed by default.** Direct user
ask: people shouldn't be tempted to add a buffed version of an item
when the DM actually gave them a plain one. Only Quantity shows by
default (a totally normal thing to set on an ordinary item); Custom
name, Attack/Damage/AC bonus, Conditional Bonus Damage, and Notes all
move inside the collapsible section. `hasSpecialData(item)` decides the
toggle's initial state when EDITING an existing item — already-special
items open expanded (so editing never hides bonuses the player already
set), plain ones still open collapsed. Confirmed live: a fresh add
shows just Quantity + the toggle; editing "Goblin Slayer Sword"
(customName + bonus damage already set) opened with Special Variant
already expanded and every field correctly pre-filled.

**4. Equipment items now show what they actually DO, not just their
stats — sourced from real SRD data that was already in the database,
unused.** User's example: "Dungeoneer's Pack, no idea what it does."
Checked `jsonb_object_keys` on the `equipment` table before assuming a
homebrew pass was needed (same discipline as every other content-gap
check this project) — 81 of 182 items already have a `data.description`
field with real explanatory prose (Dungeoneer's Pack's full contents
list, Healer's Kit's stabilize action, Climber's Kit's anchor mechanic),
and 36 have `data.utilize` (tools' DC'd actions, e.g. Thieves' Tools'
"Pick a lock (DC 15 DEX)"). Both were being fetched into `data` already
but never selected out — same shape as the weight/cost gap from the
prior round. `EquipmentLookupItem` gained `description`/`utilize`;
`equipmentDetailLines()` now renders description (or utilize) FIRST,
above the dry stat lines, since "what does it do" matters more than
weight/cost for this category of item. Weapons/armor never set this
field — their own stats already answer the question. Only 13 of 182
items have neither description nor stats (ammunition, spellcasting
foci) — too few to justify a homebrew pass, so they get one of two
generic, factual, non-narrative fallback lines keyed by category
(`CATEGORY_FALLBACK_NOTE`) instead — explicitly not the same
homebrew-disclosure treatment as backgrounds/feats/species, since
these are mechanical facts ("ammunition is expended when fired"), not
narrative flavor.

Tested live with a disposable account/character (Human Fighter, Soldier
background, deleted after): confirmed both ▲/▼ stepper buttons compute
to the identical `rgb(154, 144, 128)` text color via `preview_inspect`;
confirmed Dungeoneer's Pack and Healer's Kit both show their real
description text (contents list / stabilize action) when expanded;
built "Goblin Slayer Sword" through the restructured form — confirmed
the default view shows only Quantity, expanded the variant toggle,
picked d6 + count 1 + "vs goblins" via the composer (not free text),
saved, and confirmed the DB row has real `bonusDamageDice: "1d6"` /
`bonusDamageCondition: "vs goblins"` fields, not text buried in
`notes`; equipped it and confirmed the Attacks card showed a third
"Bonus 1d6" button alongside Attack/Damage, clicked it, and confirmed
the dice log entry read "Goblin Slayer Sword Bonus Damage (vs
goblins)... 1d6 [6] — add to Goblin Slayer Sword's normal Damage roll";
reopened Edit and confirmed the Special Variant section opened already
expanded with every field (name, d6, count, condition) correctly
pre-filled. No console errors.

## Magic Items
User question ("shouldn't there be boots or gloves?") led to checking
the `magic_items` table directly rather than answering from memory —
confirmed 5e has no armor "slots" beyond body armor + shield at all,
and mundane boots/gloves/cloaks/helms don't exist in the `equipment`
table either (zero matches). They only exist as 262 real **magic**
items (Boots of Elvenkind, Cloak of Protection, etc.), in a completely
separate table the inventory system never touched. User's follow-up:
build that in, as a second tab next to Add Equipment, with the same
kind of custom builder — including homebrew items with no real-world
equivalent at all (their example: "Ol'Greg's Loin Cloth," a homebrew
+1-resistance item from a past campaign, not in any book).

**Why magic items needed a separate system rather than extending
InventoryItem:** every real magic item's mechanics live in free-text
prose (`data.desc`) — there's no structured `damage`/`armor_class` field
to anchor bonuses to, the way equipment has. More fundamentally, most
magic items (Wondrous Items, Rings, Potions, Wands, Staffs — 191 of
262) have no mundane "base item" at all (a Bag of Holding isn't a
buffed Backpack). New `characters.magic_items jsonb` column, same
separate-top-level-column pattern as inventory/currency/personality.

**`MagicItem`** (`src/lib/magic-items.ts`): `{id, magicItemIndex,
customName, count, acBonus, notes}`. `magicItemIndex` anchors into the
real `magic_items` SRD table for flavor/rarity/attunement/real
description, or is `null` for a fully homebrew item like Ol'Greg's Loin
Cloth — `customName` becomes REQUIRED (validated in the UI, Save
disabled until non-empty) only in that case, since there's no real name
to fall back on. **`acBonus` is deliberately the ONLY auto-applying
number** — summed directly onto the computed AC for every equipped
magic item (`magicItemAcBonus` in `PlaySheet.tsx`, added straight onto
`computeAC(...)`'s result, no changes to `computeArmorClass` itself
needed). Attack/damage bonuses were deliberately NOT given structured
fields the way the equipment custom-builder has them: a worn magic
item isn't anchored to one specific weapon, so unlike a custom sword
there's no unambiguous "which attack does this buff" answer to
auto-apply a number to — Flame Tongue's extra fire damage, a Ring's
passive bonus, etc. all go in `notes` as freeform "Effect" text
instead, same informational-only treatment as dozens of other "real
effect, shown not auto-applied" rules already in this app.

**`getMagicItemLookup()`** (`src/lib/srd.ts`) reads the `magic_items`
table — it has the SAME dedicated `equipment_category`/`rarity`
columns pattern as `equipment`'s `categories`/`weight`/`cost_qty`, just
discovered this session. Real bug caught immediately by live testing,
fixed before anything shipped: the dedicated `equipment_category`
column stores the raw slug (`"wondrous-items"`), not a display label —
the category tabs in `MagicItemManager` compare against display names
(`"Wondrous Items"`), so every tab except "All" would have silently
matched zero items. Fixed with a small `MAGIC_ITEM_CATEGORY_LABELS`
slug→label map in `getMagicItemLookup()` itself, so every consumer
gets the pretty name directly rather than needing to know about the
slug form. Confirmed live afterward: the Rings tab correctly filters
to just Ring of Animal Influence/Djinni Summoning/Elemental Command/
Evasion, etc.

**`MagicItemManager.tsx`** mirrors `InventoryManager.tsx`'s shape
(search + category tabs + add/edit form) but the picker step has a
second, always-visible entry point — **"+ Create Homebrew Magic
Item"** — alongside the real 262-item searchable list, since unlike
equipment there's no mundane fallback to "start from." When a real
item is picked, the form shows a read-only reference block (category —
rarity — Requires Attunement, then the full real description text)
directly above the editable fields, since for a magic item "what does
this do" is the single most useful thing to see while deciding what AC
bonus/notes to fill in — unlike the equipment builder, which only
reveals real stats behind a separate expand click on the LIST view,
not inline in the form itself. No "Special Variant" collapse toggle
here (unlike the equipment builder's restructuring two sections up) —
every magic item IS the special case by definition, there's no "plain
version" to default to, so showing the fields directly isn't the same
cheat-temptation risk that motivated that toggle for mundane gear.

**PlaySheet wiring**: `magicItems` state + `setCharacterMagicItems`
Server Action follow the exact `inventory`/`setCharacterInventory`
shape. Equip state lives in a new `PlayState.equippedMagicItemIndexes`
(localStorage-only, same as `equippedIndexes` — completely separate
Set since magic items are a separate list from `ownedEquipment`/
`inventory`). A "Magic Items" subsection renders under "Found / Custom
Equipment" using the same row shape (equip/stow toggle, Edit/Remove,
expandable details via the new `magicItemDetailLines()` in
`equipment-details.ts`), and "+ Add Magic Item" sits right next to
"+ Add Equipment" rather than replacing it.

Tested live with a disposable account/character (Human Fighter, Soldier
background, deleted after): picked a real item (Cloak of Protection)
from the picker, confirmed its reference block showed "Wondrous Items —
Uncommon (Requires Attunement)" plus the real "+1 bonus to Armor Class
and saving throws" text, set AC bonus to 1, saved, equipped it, and
confirmed AC went from 16 to 17 live; separately created the homebrew
"Ol'Greg's Loin Cloth" with Effect "+1 resistance to necrotic damage" —
confirmed the Save button stayed disabled with a visible validation
message until a name was entered, confirmed the DB row saved with
`magicItemIndex: null` and the real custom name/notes; reopened Edit on
both items and confirmed each correctly pre-filled (reference block for
the real one, plain name+effect for the homebrew one); confirmed the
category tabs filter correctly post-fix. One testing-only false alarm
along the way: editing `srd.ts` while a form was open mid-test
triggered Next.js Fast Refresh to remount the page, which looked like
the form had silently closed/lost its in-progress AC bonus value — it
hadn't; re-checking confirmed the value survived the remount. No
console errors.

## Level Down (undo an accidental Level Up)
User-requested safety net — clicking Level Up is a single button with
no confirm step, so a misclick had no way back. Symmetric counterpart
to `levelUpCharacter`: decrements `level`, pops the last `hpRolls`
entry, and — the part that needed real thought — trims back any
choices that are no longer valid at the lower level, not just the
level number itself.

**`levelDownCharacter`** (`src/app/characters/actions.ts`) follows the
same `loadOwnedDraft`/`saveDraft` shape as every other leveling action,
truncating the END of each append-style list rather than wiping it, so
a level-down from 9 to 8 keeps earlier milestone picks and only drops
whatever the level being removed granted:
- `subclassIndex` → cleared if `newLevel < 3`.
- `featChoices` → filtered to `f.level <= newLevel` (drops an ASI/feat
  picked at exactly the level being removed).
- `expertiseChoices`/`fightingStyleChoices`/`metamagicChoices`/
  `knownCantrips` → sliced to whatever count the class's own schedule
  function (`EXPERTISE_SCHEDULE`, `FIGHTING_STYLE_KNOWN_BY_CLASS`,
  `metamagicKnownMax`, `CANTRIPS_KNOWN_BY_CLASS`) says should be known
  at `newLevel` — all four were already pure functions of level (+
  class for the first two), so no new math, just calling them with one
  level lower.

**Deliberately does NOT truncate `preparedSpells`.** Its cap
(`preparedSpellCount`) needs the character's FINAL ability modifier
(species/background/ASI-adjusted), which isn't derivable in this
action without the SRD species/background lookups it doesn't have
access to — left as a disclosed gap (a prepared list could end up
transiently "over cap" after leveling down past a spellcasting-ability
ASI) rather than guessed at. Same reasoning `chooseSubclass` already
uses for not re-deriving things server-side that the client already
has fully resolved.

**UI**: a small "Accidentally leveled up? Level Down" text link sits
under the main Level Up control (not a prominent button — this is the
rare "oops" path, not a normal leveling action), gated on `sheet.level
> 1` and hidden while the Level Up confirm flow is open. Clicking it
expands the same confirm-bar pattern `DeleteCharacterButton` already
established (inline warning text + Confirm/Cancel) rather than a new
pattern, since this is also a real-data-loss action. `currentHp` is
adjusted symmetrically to `handleLevelUp` — subtracts the popped HP
roll, floored at 0 via `Math.max(0, ...)`, the same floor
`applyDamage` already uses for incoming damage. Logs a dice-log entry
("Level Down → N, -X") so the HP change is visible in context, same as
every other HP-affecting action on this sheet.

Tested live with a disposable Rogue (level 6, Thief subclass, an ASI
feat at level 4, 4 Expertise skills — 2 from the level-1 milestone + 2
from level 6) stepped down one level at a time, checking the DB after
each click: 6→5 correctly truncated Expertise from 4 to 2 (the level-6
milestone no longer qualifies) while keeping the level-4 feat and
subclass; 5→4 correctly kept the feat (4<=4 still holds) and 4→3
correctly dropped it (4<=3 no longer holds); 3→2 correctly cleared
`subclassIndex` to null (and the header lost its "(Thief)" suffix
live); HP tracked exactly right at every step (39→33→27→20→15→10,
matching each popped roll); the Level Down link correctly disappeared
once level 1 was reached. No console errors.

## Homebrew subclasses — full PHB parity (36 new subclasses)
User asked for "more subclasses (homebrew if needed)." Same root-cause
gap as backgrounds (4/16) and Fighting Styles (4/~9): the free SRD
ships exactly 1 subclass per class, the real 2024 PHB ships 4. Asked a
scoping question before writing anything, since the answer changed the
deliverable by 10-30x — full parity (+3 per class, 36 total) vs. a
smaller +1 per class vs. starting with just a few classes. User picked
full parity, the same ambition as every other homebrew pass this
project (species, backgrounds, feats, Metamagic).

**Confirmed before writing a single feature: subclass features get NO
bespoke interactive treatment anywhere in this app, for any of the 12
official subclasses** (checked directly — no hardcoded "19-20 crit"
for Champion, no Frenzy-specific code for Berserker, nothing). Every
subclass feature, official or homebrew, flows through the same generic
Features-list merge that already existed. This made the whole 36-
subclass effort pure CONTENT, not new app code — no new interactive
resources, no new PlaySheet.tsx mechanics beyond what was already
needed to surface the data and badge it as homebrew.

**Naming: original names, not the real PHB ones.** Unlike species
names (Aasimar, Tabaxi, Satyr — generic mythological/genre concepts
not exclusive to WotC) or magic item names (sourced from the actually-
open `magic_items` SRD table), real subclass names like "Battle
Master," "Eldritch Knight," "Circle of the Moon," "Way of Shadow" are
PHB-exclusive distinctive coinages, not generic words or open content —
same legal footing as the 12 missing background names, which also got
entirely original homebrew names rather than reused real ones. All 36
new names are original (e.g. "Path of the Bloodletter" not "Berserker,"
"Duelist"/"Guardian"/"Iron Tactician" instead of Battle Master/
Eldritch Knight/Psi Warrior). **Deliberately avoided giving any
non-caster class (Fighter/Barbarian/Monk) a spellcasting-hybrid
subclass** (no Eldritch-Knight-style "Fighter who casts spells") and
gave Rogue's magic-flavored one (Hexweaver) only at-will, slot-free
cantrip-tier tricks in plain prose — actual spell-slot/prepared-spell
integration for a class with `spellcastingAbility: null` would need
real new infrastructure this pass deliberately stayed out of scope
for, the same reasoning that kept Fighting Style's Great Weapon
Fighting/Two-Weapon Fighting display-only instead of building new
dice-engine support.

**Cadence grounded in the real data, not invented:** before writing
any of the 36, pulled the full feature list + grant levels for all 12
official subclasses (Champion: 3/3/7/10/15/18; Life Domain: 3/3/3/6/17;
Thief: 3/3/9/13/17; etc.) to confirm the real shape — always 2-3
features at level 3, then roughly one every 3-5 levels through
14-20. Every homebrew subclass follows this same real cadence (4-6
features, first 1-2 at level 3) rather than an invented schedule.

Seeded directly via `subclasses` rows (`ruleset='homebrew'`, same
`{summary, description, features:[{name,level,description}]}` shape
the official rows already use) — 3 per class, 36 total:
- Barbarian: Path of the Bloodletter, Path of the Stormcaller, Path of the Unbroken
- Bard: College of the Vanguard, College of Whispers, College of Mirrors
- Cleric: War Domain, Trickery Domain, Storm Domain
- Druid: Circle of the Tide, Circle of the Bloom, Circle of the Wildheart
- Fighter: Iron Tactician, Duelist, Guardian
- Monk: Way of the Shifting Wind, Way of the Iron Soul, Way of the Whispering Blade
- Paladin: Oath of the Stormguard, Oath of the Wanderer, Oath of Judgment
- Ranger: Beastcaller, Shadowstalker, Wayfinder
- Rogue: Shadowstriker, Mindbender, Hexweaver
- Sorcerer: Wildspark Sorcery, Stormborn Sorcery, Starborn Sorcery
- Warlock: Fey Patron, Celestial Patron, Voidborn Patron
- Wizard: Warder, Oracle, Phantasm

**Code changes, mirroring `getSpeciesList`'s/`getGeneralFeatsList`'s
existing official+homebrew pattern exactly:** `getSubclassesForClass`
widened from `.eq("ruleset", "2024")` to `.in("ruleset", ["2024",
"homebrew"])`; `SubclassOption` gained `isHomebrew: boolean`; sort
order changed to official-first-then-homebrew (was a flat alphabetical
sort, which would have interleaved them). Three disclosure points,
matching species' exact pattern: a "Homebrew" badge chip on each
option card in the subclass picker, a one-line "Homebrew subclass —
original content written for Tavern, not part of the official SRD"
sentence on the expanded/selected option, and "(Homebrew)" appended to
the play sheet header's "{ClassName} ({SubclassName})" subtitle.

**Real, previously-invisible bug this surfaced — not a new bug
introduced, a latent one that could never manifest before now.** The
existing subclass-feature dedup (`baseFeatureNames` check, added back
in the original single-subclass-per-class build for cases like Cleric's
"Disciple of Life" appearing in both the base `features` table AND the
subclass's own embedded list) only ever filtered in ONE direction —
removing a chosen subclass's feature if it ALSO leaked into the base
table. It never filtered the other way: a feature that leaked into the
base table but belongs to a DIFFERENT subclass than the one chosen.
This was invisible for the entire project so far because every
class only ever HAD one subclass — a leaked feature like Barbarian's
"Frenzy" always matched whatever was "chosen" by necessity, since
nothing else existed to choose. The instant a real alternative existed
(Path of the Bloodletter), a Barbarian who chose it still saw
Berserker's "Frenzy" phantom-appear in their Features list. Fixed by
also checking each base-table feature's name against the full set of
every subclass option's feature names for that class, only keeping it
if it's either not a subclass-attributed name at all, or it IS the
chosen subclass's own. Confirmed both directions live on the same
character: chose Bloodletter → Frenzy correctly absent, Iron Stomach/
Open Wound present; reset and chose Berserker instead → Frenzy
correctly present, no duplicates either way.

Tested live with a disposable level-3 Barbarian: confirmed all 4
subclass options appear (1 official, 3 homebrew, each homebrew one
badged), expanded Path of the Bloodletter and confirmed the homebrew
disclosure sentence and all 5 features (with real level numbers) and
full description text render correctly, confirmed it persisted to the
DB (`subclassIndex: "path-of-the-bloodletter"`) after confirming,
confirmed the header showed "Barbarian (Path of the Bloodletter —
Homebrew)", and confirmed Features correctly showed Iron Stomach/Open
Wound at level 3 with Frenzy absent — then caught the dedup bug,
fixed it, and re-verified both the Bloodletter and Berserker cases
post-fix as described above. No console errors.

## Weapon Mastery, shield AC bug, mobile currency layout, ability randomize
Four pieces of user feedback in one round: comparing against other D&D
character builders, Fighter (and others) are missing class-specific
builder questions like Weapon Mastery; the currency boxes are
unreadable on a phone; a manually-added custom Shield did nothing to
AC; and an ability-score randomize button would help.

**Weapon Mastery — confirmed real, structured 2024 data covering
exactly 5 classes.** Each class's own `features` row for "Weapon
Mastery" gives a real base count directly: Barbarian 2, Fighter 3,
Paladin/Ranger/Rogue 2 each. Barbarian's text restricts choices to
Simple/Martial MELEE weapons specifically; the other four don't.
Barbarian's and Fighter's text additionally reference "the Weapon
Mastery column of the [Class] Features table" for higher-level
increases — checked the 2014 `levels` table's `class_specific` field
for a cross-check the way Action Surge/Indomitable got one during the
Fighter pass, and confirmed there's nothing there at all (this is a
2024-only mechanic with no 2014 precedent), so those two stay a
disclosed flat count at their level-1 base — same treatment as Channel
Divinity/Wild Shape/Rage. Paladin/Ranger/Rogue's own text never even
references a scaling table, so their counts are genuinely flat
forever, not a gap. New `WEAPON_MASTERY_KNOWN_BY_CLASS` (plain
`Record<string, number>`, not a per-level function like
`FIGHTING_STYLE_KNOWN_BY_CLASS` — there's no real table to encode for
any of the five) and `WEAPON_MASTERY_MELEE_ONLY_CLASSES` in
`character.ts`.

**Shipped as a real builder step, not a play-sheet pending choice —
the user's explicit ask, unlike every other class resource this
project has built so far.** New `weapon-mastery` entry in
`ProgressSteps.tsx`'s `StepId`/`STEPS`, inserted right after Class.
`ProgressSteps` gained an optional `steps` prop (defaults to the full
list) so `BuilderWizard.tsx` can pass a version with that step
filtered out entirely for the 7 classes without the feature, rather
than showing a screen with nothing to choose — `goNext`/`goBack`/
`currentIndex` all operate over this filtered `relevantSteps` list
instead of the raw `STEPS` constant. New
`src/components/builder/steps/WeaponMasteryStep.tsx`: filters
`equipment` to items with a `mastery` property set (and to
`melee-weapons` category for Barbarian specifically), shows each
weapon's real Mastery property name *and* its real description
(`getWeaponMasteryProperties()`, a new `weapon_mastery_properties`
table reader in `srd.ts`) inline so a new player can see what they're
actually choosing, capped at the class's count. `ReviewStep.tsx`
gained a matching summary line, shown only when any choices exist.

**Made the choice actually do something, not just get collected and
ignored — gates which weapon's mastery property shows on the Attacks
card.** `resolveWeapons()` (`character-sheet.ts`) gained a
`masteredWeaponIndexes: Set<string> | null` parameter; a weapon's
`mastery` field is only populated in the result if its base type is in
that set. `null` means "don't gate" — used for every class without the
feature, but ALSO for a class that has it with an empty
`weaponMasteryChoices` (an existing character created before this
shipped), so the fix doesn't silently strip mastery from every
pre-existing Barbarian/Fighter/Paladin/Ranger/Rogue the instant it
ships. Needed one new passthrough field, `EquipmentLookupItem.baseIndex`
— a custom/inventory weapon's synthetic lookup entry has its own
`index` overridden to the player's generated item id (see
`resolveInventoryEquipment`), so checking eligibility against
`lookup.baseIndex ?? lookup.index` is what actually resolves to the
real weapon type either way.

**Added a retroactive picker on the play sheet too, mirroring Fighting
Style's exact card shape** (`Weapon Mastery (N/max)` heading, an Edit
toggle, the same select-up-to-N grid with expandable property
descriptions) — this is how an existing character whose
`weaponMasteryChoices` is empty gets to set it for the first time, the
same "pending choice, but always re-editable" pattern Fighting Style/
Metamagic already established. New `setWeaponMasteryChoices` Server
Action, identical shape to `setFightingStyleChoices`.

**Real, previously-latent crash this surfaced — not specific to
Weapon Mastery, a systemic gap.** `src/app/characters/[id]/page.tsx`
and `actions.ts`'s shared `loadOwnedDraft` both did a bare
`character.draft as unknown as CharacterDraft` cast with no defaults
merged in — unlike the builder wizard's own localStorage hydration,
which has merged against `EMPTY_DRAFT` since the very first
`level`/`hpRolls` field was added specifically to survive this exact
trap (see "Stale-localStorage trap" above). A character saved before
`weaponMasteryChoices` existed has a raw DB row simply missing that
key; `currentDraft.weaponMasteryChoices.length` then throws outright
for that character on load — confirmed live via a hand-inserted draft
matching the exact shape of a real, currently-existing character.
**This was never specific to this feature — any future `CharacterDraft`
field addition would hit the same crash for every character saved
before it shipped**, on both the play sheet page load AND every Server
Action that touches the draft (`levelDownCharacter`'s own
`.slice(...)` calls on several fields would have hit it identically).
Fixed at both load boundaries with the same `{ ...EMPTY_DRAFT,
...rawDraft }` merge the builder wizard already uses, rather than
patching the one field that happened to surface it.

**Shield AC bug — a genuine, separate, longstanding bug, not related
to Weapon Mastery.** `computeArmorClass` (`character.ts`) detected a
shield via `item.index === "shield"` — an exact match against the
literal SRD index. A custom/found shield added through the inventory
system is keyed by its own generated id instead (same `resolveInventoryEquipment`
synthetic-entry mechanism as above), so it could never match — worse,
since it also doesn't match `item.index !== "shield"`'s exclusion in
the `bodyArmor` branch, a custom shield with no other armor equipped
would get *miscategorized as body armor* and computed as if its base
AC of 2 were the character's entire unarmored AC. Fixed by checking
the real `"shields"` category tag instead (confirmed via the real
`equipment` row: `categories: ["armor", "shields"]`), which survives
the synthetic-entry spread untouched since it's never overridden there
— works correctly for both the real SRD Shield and any custom variant
of it.

**Mobile currency layout** — `CurrencyTracker.tsx`'s grid was a flat
`grid-cols-5`, leaving each of the 5 boxes too narrow on a phone for
the NumberStepper's fixed-width arrow column to fit beside the number
without overlapping it. Changed to `grid-cols-3 sm:grid-cols-5`,
matching the same mobile-breakpoint pattern already used everywhere
else in this app (Stats/Abilities grids).

**Ability score randomize** — `AbilitiesStep.tsx` gained a "Randomize"
button that Fisher-Yates shuffles the same six Standard Array values
across the six abilities. This app only supports the Standard Array
method (no point buy or rolled stats anywhere in the builder), so
"randomize" means a random valid distribution of those fixed numbers,
not generating new ones — no new ability-score-generation method was
added.

Tested live end-to-end with a disposable account (deleted after):
walked a full Human Fighter through the actual builder — confirmed the
new "Weapons" step appears in the progress bar only after picking a
class with the feature, picked 3 of 3 (Longsword/Greatsword/Shortbow),
confirmed a 4th option was disabled at the cap, confirmed Review showed
the summary line, saved, and confirmed the Attacks card showed mastery
("Graze"/"Vex") ONLY on the two chosen weapons actually equipped
(Greatsword/Shortbow) while Flail/Javelin/Spear — which have real
mastery properties too — correctly showed none. Separately hand-
inserted an old-style draft missing `weaponMasteryChoices` entirely:
confirmed it crashed before the `EMPTY_DRAFT`-merge fix and loaded
cleanly after, confirmed it showed mastery unconditionally on every
weapon (the intended fallback), then used the play sheet's own Edit
picker to set 3 choices retroactively and confirmed the Attacks card
immediately re-gated to just those three. Added a custom Shield via
the inventory system on the Fighter character (Chain Mail already
equipped, AC 16) and confirmed equipping it correctly brought AC to 18,
not some miscategorized lower number. Resized the preview to a 375px
phone viewport and confirmed the currency boxes render with the
number fully legible and the stepper arrows no longer overlapping it.
Tested Randomize twice in the Abilities step and confirmed two
different valid permutations of the standard array. No console errors
after the draft-merge fix landed (one real crash before it, exactly as
described above).

## Armor mutual exclusivity; unified Equipment list
Two more pieces of feedback right after the round above, both about
Equipment. First: "found the same bug we had with shields, but with
armor" — a custom body armor added via the inventory system also did
nothing to AC. Second: "there is no real reason found/custom equipment
should be separate from the starting inventory — should realistically
be one list you can add to and remove from."

**The armor bug turned out to be a genuinely different root cause from
the shield one, not the same bug recurring.** The shield fix (above)
was a category-matching bug — a custom shield's index was never the
literal string `"shield"`, so it was never recognized as a shield at
all. Reproduced the armor report directly: adding a custom Studded
Leather Armor and equipping it *alone* computed its AC correctly
(12 + Dex = 13) — the category logic itself was fine. The real bug
only showed up with a *second* body armor (the character's starting
Chain Mail) also still marked equipped: `computeArmorClass`
(`character.ts`) picks body armor via `equipped.find(...)` — the
*first* match in a fixed array order (starting equipment always comes
before inventory items in `allOwnedBundleItems`), so Chain Mail always
won regardless of which piece the player most recently equipped or
intended to wear. 5e doesn't let you wear two suits of armor or wield
two shields at once, but nothing previously enforced that — a player
equipping a new found piece without first unequipping the old one
landed in exactly this state. Fixed at the source instead of patching
the AC math: `toggleEquipped` (`PlaySheet.tsx`) now unequips any other
already-equipped item of the same kind (body armor vs. shield, checked
via the same category tag the shield fix uses) the moment a new one is
equipped, so the ambiguous "two equipped" state can't occur in the
first place. Audited the other AC-contributing path while in there —
magic items' AC bonus (`magicItemAcBonus`) is a plain `.reduce()` sum
across every equipped magic item, not a `.find()`, so it was already
safe and needed no change.

**Unified Equipment list.** "Equipment" (starting gear), "Found /
Custom Equipment," and "Magic Items" were three visually separate
list sections with their own headers and `border-t` dividers, even
though equip/unequip and the details toggle already worked identically
across all three underneath. Removed the section headers and dividers
entirely so all three `.map()` calls render as direct siblings in one
shared `space-y-1.5` container — found/custom and magic items now just
appear as more rows in the same list, in the same order as before
(starting equipment first, since that's simply array order, not a
section boundary anymore).

**This also surfaced a real, asymmetric gap worth fixing while
unifying the list: starting equipment had no "Remove" at all**, only
found/custom and magic items did. Starting equipment isn't a deletable
record the way `InventoryItem`/`MagicItem` are — it's derived fresh
from the class/background draft on every render, not stored as
removable state — so a real per-item delete isn't possible without
touching the build itself. Instead, new `PlayState.removedStartingIndexes:
string[]` (localStorage-only, same treatment as `equippedIndexes`)
tracks indexes to hide from the list; `removeStartingItem()` adds to it
and auto-unequips at the same time. Deliberately has no "undo" button
— if removed by mistake, the same item can always be added back via
"+ Add Equipment" since it's just another real catalog lookup at that
point, the same reasoning already used for not needing rebasing on
custom items elsewhere in this system.

Tested live with a disposable Fighter (Chain Mail equipped, AC 16):
unequipped Chain Mail, added a custom Studded Leather Armor, equipped
*only* it, and confirmed AC correctly read 13 — ruling out a
category-matching bug. Re-equipped Chain Mail alongside it and
confirmed AC reverted to 16 (Chain Mail winning), reproducing the real
bug exactly. Toggled Studded Leather Armor off and back on post-fix
and confirmed Chain Mail automatically flipped to Stowed and AC
correctly became 13 — no manual unequip needed. Confirmed the
Equipment card now renders as one continuous list with no section
headers, found/custom and magic item rows sitting at the end with no
visual seam. Clicked Remove on a starting item (Healer's Kit),
confirmed it disappeared, and confirmed it was still gone after a full
page reload (localStorage, not lost on refresh). No console errors.

## Audit fixes — species/class/background completeness pass
A full audit cross-referenced every species/subspecies, class/subclass, and
background against the 2024 rules to find mechanics that existed in the data
or rules but weren't surfaced (or were computed wrong). Fixes, grouped:

**Critical computed-value bugs (numbers were simply wrong):**
- **Dwarven Toughness**: +1 HP per level was never applied. Now added in
  `buildCharacterSheet`'s `maxHpValue` when the `dwarven-toughness` species
  trait is present.
- **Bard Jack of All Trades** (level 2+): half proficiency bonus (rounded
  down) was missing from non-proficient skills. `buildCharacterSheet` now adds
  `floor(profBonus/2)` to every non-proficient, non-expertise skill for Bards
  ≥2 (`jackOfAllTrades` flag drives a one-line note in the Skills card).
- **Feat effects**: Tough/Hardened (+2 HP per level, via `featHpBonus` in
  character.ts — Tough is `2×level`, Hardened is `2×(level−takenLevel+1)` from
  each feat's own text) and Alert (+proficiency bonus to Initiative) are now
  computed. These were collected by the feat picker but never applied.

**Skill-choice sources now tracked** (`CharacterDraft.humanSkillChoice` +
`skilledChoices`, with `setHumanSkillChoice`/`setSkilledChoices` actions): a
combined picker in the Skills card lets a Human (Skillful, 1 skill) and/or any
character with the Skilled feat (3 per time taken) choose skill proficiencies,
which then count toward bonuses, Expertise eligibility, and passive Perception.
Same play-sheet "re-editable pending choice" pattern as Fighting Style/Expertise
(no new builder step).

**New class resources:**
- **Wizard Arcane Recovery**: Wizard added to `hasShortRestResource` (Short
  Rest button now appears); a "Recover" button greedily restores expended
  slots up to `ceil(level/2)` slot-levels (highest first, none above 5th),
  once per day (`usedArcaneRecovery`, reset on Long Rest).
- **Sorcerer Innate Sorcery**: `innateSorceryMax` (2/Long Rest) counter in the
  Spells card.

**Subclass always-prepared spells**: `SUBCLASS_PREPARED_SPELLS` in character.ts
transcribes the spell tables that the SRD jams into subclass feature prose, for
the three official subclasses that grant them — Life Domain (Cleric), Fiend
Patron (Warlock), Draconic Sorcery (Sorcerer). Surfaced as a "Subclass Spells
(Always Prepared)" block in the Spells card with full details + Cast/Attack/
Damage buttons; `subclassPreparedSpells` on the sheet filters to milestones
reached, and page.tsx fetches detail data by slug into a new `subclassSpellData`
prop. **Oath of Devotion (Paladin) is deliberately omitted** — its source
table is garbled in the dataset, so its spells stay visible via the Features
list only rather than risk a wrong list. Homebrew subclasses grant spells in
prose too and aren't transcribed (documented gap). A few 2024-only spells
(Chromatic Orb, Dragon's Breath, Charm Monster, Aura of Life, Summon Dragon)
aren't in the 2014 spell dataset and render as name-only rows.

**Species trait wiring** (all driven off base-species trait indexes, new sheet
fields):
- **Tiefling Otherworldly Presence → Thaumaturgy**: base-species at-will
  cantrip (not a subspecies lineage spell), surfaced in the Lineage Spells
  block via `SPECIES_CANTRIP_SPELL` map + a species-cantrip fetch in page.tsx.
- **Natural weapons** (`SPECIES_NATURAL_WEAPONS`): Tabaxi/Tortle Claws (1d4
  Slashing) and Satyr Ram's Headbutt (1d4 Bludgeoning + push note) synthesized
  as their own Attacks row, same approach as Monk's Unarmed Strike (a Monk of
  these species gets the larger of the natural die vs Martial Arts die, and
  Dexterous Attacks). **Mechanics read from each homebrew trait's own
  description, NOT the real published stat blocks** — e.g. these homebrew
  versions are simpler than WotC's.
- **Interactive once-per-rest traits**: Aasimar Healing Hands (heal `level`
  HP, 1/Long Rest), Goblin Fury of the Small (+`level` damage, 1/Short or Long
  Rest), Shifter Shifting (Temp HP = `level + CON`, 1/Short or Long Rest) —
  resource blocks in the HP/resources card. Again, **homebrew values from the
  trait text** (e.g. Healing Hands heals a flat `level` with no dice roll,
  unlike the real Aasimar's `level`d4).
- **Fairy/Owlin Fly Speed** (`flySpeed`): a stat chip (Fairy = walking Speed,
  Owlin = 30). The "not in Heavy armor" caveat is shown in the trait text but
  not enforced (no armor-weight tracking, same as Barbarian Fast Movement).

**Heroic Inspiration**: a universal toggle chip under the stat bar (2024 core
mechanic, DM-grantable). Human's Resourceful auto-grants it on each Long Rest
(`heroicInspiration` in PlayState; longRest sets it true for Humans, leaves
others' untouched so a DM grant isn't wiped).

**Languages & Proficiencies card**: now always shown (was hidden when a
character had no language/tool choices), always lists **Common**, and the tool
proficiency label is a generic "Tool Proficiency:" instead of the hardcoded
"Gaming Set:" (which was wrong for non-gaming tools).

**Halfling Lucky** was found to be ALREADY implemented (the prior CLAUDE.md
deferral note was stale) — `isHalfling` is threaded into every `rollD20()` and
the dice log shows "(Lucky)".

**Gnomish Lineage cantrips** were found to ALREADY work via the existing
`lineage-spell-*` → at-will-cantrip path (Forest Gnome Minor Illusion, Rock
Gnome Mending render correctly, same path as Tiefling's Chill Touch). The
audit's claim that they needed `LINEAGE_CANTRIP_CLASS` entries was a
misread — that constant is only for the *swappable* High Elf cantrip picker.
**Documented minor content gap**: the real 2024 gnome lineages grant a SECOND
cantrip/spell each (Forest: Speak with Animals; Rock: Prestidigitation) that
isn't in the imported SRD subspecies data — not added here to avoid mutating
SRD-imported rows with homebrew content.

**Weapon/spell range** (separate earlier fix in this session, related): every
weapon attack row and every spell row now shows range, from `data.range`/
`data.throw_range` (equipment) and `data.range` (spells).

Verified live against existing public characters (no console errors): Ophelia
(Tiefling Chthonic Warlock/Fiend Patron L3) showed Thaumaturgy in Lineage
Spells, the Fiend "Subclass Spells (Always Prepared)" block (Burning Hands/
Command/Scorching Ray/Suggestion with details), and the Heroic Inspiration
chip; Fredrick (Dwarf Wizard/Evoker L3) showed Arcane Recovery, the Short Rest
button, and Dwarven Toughness HP. Builder UI wasn't changed (the new skill
pickers live on the play sheet, same pattern as Expertise/Fighting Style).

**Still deferred** (documented, not done): subclass spells for the 36 homebrew
subclasses and Paladin Oath of Devotion; the gnome second-cantrip content gap;
and the larger items the audit reconfirmed (Champion crit range, higher-level
use-count scaling, Ranger Hunter's Prey/Defensive Tactics swap-on-rest, etc.).

## Subclass spell lists — Paladin fix, homebrew parity, gnome cantrips
Follow-up to the audit-fixes pass, closing the documented subclass-spell gaps.

**Paladin Oath of Devotion (the garbled-data fix).** The dataset's "Oath of
Devotion Spells" feature had a mangled, wrong spell table. Researched the
authoritative 2024 SRD 5.2 list (3: Protection from Evil and Good, Shield of
Faith; 5: Aid, Zone of Truth; 9: Beacon of Hope, Dispel Magic; 13: Freedom of
Movement, Guardian of Faith; 17: Commune, Flame Strike), rebuilt the subclass
feature description in the DB (`jsonb_set` on the feature's description), and
added `oath-of-devotion` to `SUBCLASS_PREPARED_SPELLS`. Verified live.

**Homebrew caster subclasses now grant official-depth spell lists.** Every
homebrew caster subclass that should grant always-prepared spells now does, at
the same cadence/depth as the official ones:
- Cleric (war/storm/trickery-domain), Sorcerer (wildspark/stormborn/starborn),
  Warlock (fey/celestial/voidborn-patron): full-caster cadence 3/5/7/9, 2
  spells per tier.
- Paladin (oath-of-the-stormguard/wanderer/judgment): half-caster cadence
  3/5/9/13/17.
- Druid (circle-of-the-tide/bloom/wildheart): full-caster 3/5/7/9. Several
  Druid/Ranger homebrew subclasses already *promised* always-prepared spells
  in prose but with a thin, unwired 2-spell list — those were expanded to full
  depth and actually wired up.
- Ranger (beastcaller/shadowstalker/wayfinder): half-caster 3/5/9/13/17.

Each is added BOTH to `SUBCLASS_PREPARED_SPELLS` in character.ts (drives the
interactive "Subclass Spells (Always Prepared)" block in the Spells card) AND
as a "<Subclass> Spells" feature in the subclass's DB `data.features` array
(shows the table in the Features list), exactly how official subclasses present
them. **All spells are real SRD spells with validated 2014-dataset slugs** —
the Cleric War/Tempest(Storm)/Trickery lists are themselves open SRD content;
the rest are original thematic selections from real spells. Wizard and Bard
homebrew subclasses intentionally get NO spell list — their official 2024
counterparts (Evoker, College of Lore) don't grant one either, so "no list" IS
parity there; their feature sets are already official-comparable in depth
(4-6 substantive features each, confirmed).

DB edits to official-import rows (oath-of-devotion description) and homebrew
subclass rows were done via direct `execute_sql` UPDATEs since there's no seed
file for these — the user explicitly authorized editing the SRD content tables.
If these tables are ever re-imported from 5e-database, re-apply these spell-list
features and the oath-of-devotion description fix.

**Gnome lineage second cantrips.** The imported SRD only had one lineage spell
per gnome lineage; the real 2024 lineages grant two. Added Forest Gnome →
Speak with Animals (a 1st-level spell cast at-will) and Rock Gnome →
Prestidigitation, as new `traits` rows + entries in each subspecies'
`data.traits` array. Because Speak with Animals is at-will but NOT a cantrip,
the lineage at-will spell row's label was made level-aware ("Level 1 · At-will"
vs "Cantrip · At-will") instead of hardcoding "Cantrip".

**Verification note:** the official subclass-spell render path was verified live
(Ophelia, Warlock/Fiend Patron — the "Subclass Spells (Always Prepared)" block
rendered Burning Hands/Command/Scorching Ray/Suggestion correctly; Fredegar,
Paladin/Oath of Devotion — Protection from Evil and Good + Shield of Faith
rendered). The homebrew and gnome additions use the identical map → sheet →
fetch → render path with validated slugs, so they weren't separately live-tested
(no existing character uses a homebrew caster subclass, and the user's own
characters weren't mutated to manufacture one).

## Competitor-gap features (post-audit initiative)
After a research pass comparing Tavern to D&D Beyond / Aurora / Roll20, a set of
missing features was implemented. Each is real, described, and interactive where
a gameplay mechanic is involved (the project's standing bar).

**Ability score methods** (`AbilitiesStep.tsx`): the builder now offers Standard
Array, **Point Buy** (27-point budget, scores 8-15, escalating cost above 13,
live points-remaining), **Rolled** (4d6-drop-lowest ×6, assign from a pool that
handles duplicates), and **Manual** (any 1-30). New `CharacterDraft`
`abilityScoreMethod` + `rolledAbilityPool` (builder-only; buildCharacterSheet
never reads them). Point Buy helpers (`POINT_BUY_*`, `pointBuyCost`,
`pointBuyRemaining`) in character.ts.

**Play-sheet status trackers** (`src/lib/conditions.ts` + PlaySheet "Conditions
& Status" card): **Exhaustion** 0-6 auto-applies −2/level to every d20 roll
(threaded through rollCheck/rollAttack/rollSpellAttack, logged with an
"(Exhaustion −N)" note) and −5 ft/level Speed (displaySpeed); a Long Rest
removes one level. **Conditions** — toggle chips for all 15, each showing its
effect (tracked, not auto-simulated). **Concentration** — a free-text reminder.
All three are localStorage-only PlayState.

**Attunement + encumbrance**: magic items requiring attunement (or homebrew
ones) get an Attune/Attuned toggle capped at 3 (`attunedMagicItemIndexes`);
"Attunement N/3" shown. Encumbrance sums carried weight vs STR×15 and flags
Encumbered. Both in the Equipment card.

**JSON export/import** (`src/lib/character-export.ts`): "Export JSON" on the
play sheet downloads a portable `<name>.tavern.json` (draft + bio/notes/
personality/inventory/currency/magic items; avatar/is_public/party excluded).
"Import from File" on My Characters creates a new character via the
`importCharacter` server action (auth-gated, always inserts). Drafts merge
against EMPTY_DRAFT so older files pick up newer defaults.

**XP tracking** (`XP_THRESHOLDS`, `xpForNextLevel`, `levelForXp`): `CharacterDraft`
`levelingMode` ("milestone"|"xp") + `xp`. The play sheet's owner leveling area
has a Milestone/XP toggle; in XP mode an XP progress bar + Add/Subtract XP gate
the Level Up button on reaching the next threshold. `setLevelingProgress`
persists it.

**Extra Attack / Epic Boons / Campaign Notes**: `attacksPerAction(class, level)`
shows an Extra Attack banner on the Attacks card (Fighter to 4 at L20, martials
to 2 at L5). The 7 real SRD **Epic Boon** feats (`getEpicBoonFeats`,
type='epic-boon') are offered in the play-sheet feat picker at level 19 with
full descriptions, and resolve their name+description in Features (dual
generalFeats/epicBoonFeats lookup). **Campaign Notes** — a new
`characters.notes` column (migration `add_character_notes` + regenerated
types), `setCharacterNotes` action, `CharacterNotes` editable card, included in
JSON export/import.

**Spell compendium** (`/spells`, `getAllSpells`/`CompendiumSpell`,
`SpellCompendium.tsx`): a public reference page — search + filter by level/
school/class, each spell expands to full rules text (casting time, range,
components, material, duration, concentration/ritual, description, At Higher
Levels, class list). A "Spells" link in the header (signed in or out).

**Quick Build / Surprise Me** (`src/lib/quick-build.ts`): a panel on the
builder's first step. `buildQuickDraft` produces a complete valid level-1
draft — ability scores along a per-class priority (2024 recommended arrays),
required skills, background + its ability bonus + tool choice, two non-rare
languages, and weapon mastery for the 5 classes that get it — then drops the
player on Review. Quick Build takes optional species/class/name; Surprise Me
randomizes everything.

**Printable / PDF sheet** (`/characters/[id]/print`, `PrintButton.tsx`): a
clean white-on-black one-page sheet with a "Print / Save as PDF" button firing
`window.print()` (any browser → Save as PDF; no library). Renders core stats
(real computed AC assuming starting armor worn), abilities+saves, skills,
attacks, spellcasting (DC/attack/slots/cantrips/prepared), features, equipment.
"Print / PDF" link next to Export JSON.

**Deliberately still open (large, their own projects):** true **multiclassing**
(single `classIndex` is baked through the entire draft/sheet/builder) and a
**user-facing homebrew content builder** (users can build custom equipment +
magic items today, but not their own species/class/subclass/feat/spell). Both
were scoped but not started — each is a multi-pass effort that changes core
data shapes, and (per this project's habit of asking before large content/
architecture decisions) warrants confirming direction first.

## User homebrew content builder (first increment: custom feats)
The start of letting users create their OWN homebrew (distinct from the
dev-authored homebrew species/backgrounds/subclasses/feats baked into the SRD
tables). Infrastructure is built to extend to more content types.

**Storage:** new `user_content` table — `(id, user_id → auth.users, kind, name,
data jsonb, created_at, updated_at)` with RLS (owner-only, `auth.uid() =
user_id` for ALL). `kind` discriminates content types ('feat' first). Migration
`create_user_content`; types regenerated. Extends to species/subclass/spell/etc
via new `kind` values without a schema change.

**Custom feats** (`/homebrew`, `HomebrewManager.tsx`, `app/homebrew/actions.ts`):
signed-in users create/edit/delete feats (name + full description). Each is
surfaced in the feat picker on that user's OWN characters (page.tsx merges
`getUserFeats()` into `generalFeats`, gated on `isOwner`), tagged Homebrew like
the built-in homebrew feats, and resolves its name+description in the Features
list via the existing generalFeats lookup. A chosen custom feat is recorded as
`user-feat:{id}` (`USER_FEAT_PREFIX`) so it never collides with a real SRD slug.
"Homebrew" link in the header for signed-in users.

**"use server" gotcha:** a `"use server"` file may only export async functions —
the shared `USER_FEAT_PREFIX` const and `UserContentResult` type had to move to
`src/lib/user-content.ts` (tsc doesn't catch this; only the Next/SWC build
does, and the dev server caches the failed parse — a restart was needed to
clear it, same stale-cache pattern noted elsewhere in this file).

**Not yet built (natural next increments, each its own form + picker/sheet
integration):** custom species (traits/ASI/speed → species picker + sheet),
subclasses (features array → subclass picker), spells (full spell shape →
compendium + spell pickers), backgrounds, classes. All auth-gated, so the
create flow can't be exercised in an unauthenticated preview.
