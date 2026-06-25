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
