"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { supabase as srd } from "@/lib/supabase";
import type {
  FeatOption,
  SubclassOption,
  BackgroundOption,
  SpeciesOption,
  SpellOption,
  CompendiumSpell,
  ClassOption,
  ClassFeature,
} from "@/lib/srd";
import type { AbilityKey } from "@/lib/character";
import type { Json } from "@/lib/database.types";
import {
  USER_FEAT_PREFIX,
  USER_SUBCLASS_PREFIX,
  USER_BACKGROUND_PREFIX,
  USER_SPECIES_PREFIX,
  USER_SPELL_PREFIX,
  USER_CLASS_PREFIX,
  ABILITY_OPTIONS,
  ORIGIN_FEAT_OPTIONS,
  CLASS_OPTIONS,
  HIT_DIE_OPTIONS,
  type UserContentResult,
  type UserSubclassFeature,
  type UserSpeciesTrait,
  type UserSpellData,
  type UserClassData,
} from "@/lib/user-content";

// ── Shared user_content plumbing ────────────────────────────────────────────
// All six homebrew content types live in the one user_content table, keyed by
// `kind`, owner-scoped by RLS + an explicit user_id filter. Every read/write
// below goes through these helpers — the per-type exports only own their
// validation and shaping. ("use server" only restricts EXPORTED values to
// async functions; these internal helpers are fine.)

interface ContentRow {
  id: string;
  name: string;
  data: Json;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase, userId: data.user.id };
}

// The signed-in user's rows of one kind, name-ordered. [] when signed out.
async function listContent(kind: string): Promise<ContentRow[]> {
  const auth = await requireUser();
  if (!auth) return [];
  const { data } = await auth.supabase
    .from("user_content")
    .select("id, name, data")
    .eq("user_id", auth.userId)
    .eq("kind", kind)
    .order("name");
  return (data ?? []) as ContentRow[];
}

async function insertContent(kind: string, name: string, data: Json): Promise<UserContentResult> {
  const auth = await requireUser();
  if (!auth) return { success: false, error: "You need to sign in." };
  const { error } = await auth.supabase
    .from("user_content")
    .insert({ user_id: auth.userId, kind, name: name.trim(), data });
  if (error) return { success: false, error: error.message };
  revalidatePath("/homebrew");
  return { success: true };
}

async function updateContent(
  kind: string,
  id: string,
  name: string,
  data: Json,
): Promise<UserContentResult> {
  const auth = await requireUser();
  if (!auth) return { success: false, error: "You need to sign in." };
  const { error } = await auth.supabase
    .from("user_content")
    .update({ name: name.trim(), data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("kind", kind);
  if (error) return { success: false, error: error.message };
  revalidatePath("/homebrew");
  return { success: true };
}

async function deleteContent(kind: string, id: string): Promise<UserContentResult> {
  const auth = await requireUser();
  if (!auth) return { success: false, error: "You need to sign in." };
  const { error } = await auth.supabase
    .from("user_content")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("kind", kind);
  if (error) return { success: false, error: error.message };
  revalidatePath("/homebrew");
  return { success: true };
}

const ABILITY_NAME = Object.fromEntries(ABILITY_OPTIONS.map((a) => [a.index, a.name]));
const ORIGIN_FEAT_NAME = Object.fromEntries(ORIGIN_FEAT_OPTIONS.map((f) => [f.index, f.name]));
const CLASS_NAME = Object.fromEntries(CLASS_OPTIONS.map((c) => [c.index, c.name]));

// ── Custom feats (kind='feat') ──────────────────────────────────────────────
// Surfaced in the feat picker on the owner's own characters, tagged homebrew
// like the built-in homebrew feats. Index `user-feat:{id}`.

export async function getUserFeats(): Promise<FeatOption[]> {
  return (await listContent("feat")).map((row) => ({
    index: `${USER_FEAT_PREFIX}${row.id}`,
    name: row.name,
    description: (row.data as { description?: string }).description ?? null,
    isHomebrew: true,
  }));
}

function validateFeat(name: string, description: string): string | null {
  if (!name.trim()) return "Give the feat a name.";
  if (name.length > 100 || description.length > 4000) return "That's too long.";
  return null;
}

export async function createUserFeat(name: string, description: string): Promise<UserContentResult> {
  const err = validateFeat(name, description);
  if (err) return { success: false, error: err };
  return insertContent("feat", name, { description: description.trim() });
}

export async function updateUserFeat(
  id: string,
  name: string,
  description: string,
): Promise<UserContentResult> {
  const err = validateFeat(name, description);
  if (err) return { success: false, error: err };
  return updateContent("feat", id, name, { description: description.trim() });
}

export async function deleteUserFeat(id: string): Promise<UserContentResult> {
  return deleteContent("feat", id);
}

// ── Custom subclasses (kind='subclass') ────────────────────────────────────
// Stored data shape: { classIndex, summary, description, features: [...] }.
// Surfaced in the play sheet's subclass picker for that class on the owner's
// own characters (index `user-subclass:{id}`), tagged homebrew like the
// dev-authored homebrew subclasses.

export interface UserSubclass extends SubclassOption {
  classIndex: string;
}

function sanitizeFeatures(features: unknown): UserSubclassFeature[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((f) => {
      const o = f as { name?: unknown; level?: unknown; description?: unknown };
      const level = Number(o.level);
      return {
        name: typeof o.name === "string" ? o.name.trim().slice(0, 100) : "",
        level: Number.isFinite(level) ? Math.min(20, Math.max(1, Math.round(level))) : 3,
        description: typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "",
      };
    })
    .filter((f) => f.name)
    .slice(0, 20);
}

export async function getUserSubclasses(): Promise<UserSubclass[]> {
  return (await listContent("subclass")).map((row) => {
    const d = row.data as {
      classIndex?: string;
      summary?: string;
      description?: string;
      features?: UserSubclassFeature[];
    };
    return {
      index: `${USER_SUBCLASS_PREFIX}${row.id}`,
      name: row.name,
      classIndex: d.classIndex ?? "",
      summary: d.summary ?? null,
      description: d.description ?? null,
      features: [...(d.features ?? [])].sort((a, b) => a.level - b.level),
      isHomebrew: true,
    };
  });
}

function validateSubclass(
  name: string,
  classIndex: string,
  summary: string,
  description: string,
): string | null {
  if (!name.trim()) return "Give the subclass a name.";
  if (!classIndex) return "Pick which class this subclass is for.";
  if (name.length > 100 || summary.length > 500 || description.length > 4000) {
    return "That's too long.";
  }
  return null;
}

function subclassData(
  classIndex: string,
  summary: string,
  description: string,
  features: UserSubclassFeature[],
): Json {
  return {
    classIndex,
    summary: summary.trim(),
    description: description.trim(),
    features: sanitizeFeatures(features),
  } as unknown as Json;
}

export async function createUserSubclass(
  name: string,
  classIndex: string,
  summary: string,
  description: string,
  features: UserSubclassFeature[],
): Promise<UserContentResult> {
  const err = validateSubclass(name, classIndex, summary, description);
  if (err) return { success: false, error: err };
  return insertContent("subclass", name, subclassData(classIndex, summary, description, features));
}

export async function updateUserSubclass(
  id: string,
  name: string,
  classIndex: string,
  summary: string,
  description: string,
  features: UserSubclassFeature[],
): Promise<UserContentResult> {
  const err = validateSubclass(name, classIndex, summary, description);
  if (err) return { success: false, error: err };
  return updateContent("subclass", id, name, subclassData(classIndex, summary, description, features));
}

export async function deleteUserSubclass(id: string): Promise<UserContentResult> {
  return deleteContent("subclass", id);
}

// ── Custom backgrounds (kind='background') ─────────────────────────────────
// Stored data: { description, skills:[bare skill index], abilities:[3 ability
// indexes], featIndex }. Surfaced in the builder's Background step (and the
// play sheet) for the owner, tagged homebrew. Same mechanical shape as the
// dev-authored homebrew backgrounds (2 skills + a 3-ability bonus choice + an
// Origin feat), minus starting equipment (a disclosed simplification — user
// backgrounds grant no gear/gold).

interface UserBackgroundData {
  description?: string;
  skills?: string[];
  abilities?: string[];
  featIndex?: string;
}

export async function getUserBackgrounds(): Promise<BackgroundOption[]> {
  const rows = await listContent("background");
  if (rows.length === 0) return [];

  // Resolve skill display names and Origin-feat descriptions from the SRD
  // (public reference tables — the anon client, same as srd.ts).
  const skillIndexes = [...new Set(rows.flatMap((r) => (r.data as UserBackgroundData).skills ?? []))];
  const featIndexes = [
    ...new Set(rows.map((r) => (r.data as UserBackgroundData).featIndex).filter(Boolean) as string[]),
  ];
  const [{ data: skillRows }, { data: featRows }] = await Promise.all([
    skillIndexes.length
      ? srd.from("skills").select("index, name").in("index", skillIndexes)
      : Promise.resolve({ data: [] as { index: string; name: string }[] }),
    featIndexes.length
      ? srd.from("feats").select("index, data").in("index", featIndexes)
      : Promise.resolve({ data: [] as { index: string; data: unknown }[] }),
  ]);
  const skillName = new Map((skillRows ?? []).map((s) => [s.index, s.name]));
  const featDesc = new Map(
    (featRows ?? []).map((f) => [f.index, (f.data as { description?: string }).description ?? null]),
  );

  return rows.map((row) => {
    const d = row.data as UserBackgroundData;
    const feat = d.featIndex
      ? {
          index: d.featIndex,
          name: ORIGIN_FEAT_NAME[d.featIndex] ?? d.featIndex,
          description: featDesc.get(d.featIndex) ?? undefined,
        }
      : null;
    return {
      index: `${USER_BACKGROUND_PREFIX}${row.id}`,
      name: row.name,
      description: d.description ?? null,
      isHomebrew: true,
      abilityScores: (d.abilities ?? []).map((a) => ({ index: a, name: ABILITY_NAME[a] ?? a })),
      feat,
      // Proficiencies use the "skill-" prefixed index (buildCharacterSheet
      // strips it) — see the "skill-" prefix trap note in CLAUDE.md.
      proficiencies: (d.skills ?? []).map((s) => ({
        index: `skill-${s}`,
        name: skillName.get(s) ?? s,
      })),
      equipmentDesc: null,
      equipmentFirstOption: [],
      equipmentOptions: [],
      toolProficiencyChoices: [],
    };
  });
}

function validateBackground(
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): string | null {
  if (!name.trim()) return "Give the background a name.";
  if (name.length > 100 || description.length > 4000) return "That's too long.";
  if (skills.length !== 2 || new Set(skills).size !== 2) return "Choose exactly 2 different skills.";
  if (abilities.length !== 3 || new Set(abilities).size !== 3)
    return "Choose exactly 3 different ability scores.";
  if (!featIndex || !ORIGIN_FEAT_NAME[featIndex]) return "Choose an Origin feat.";
  return null;
}

export async function createUserBackground(
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): Promise<UserContentResult> {
  const err = validateBackground(name, description, skills, abilities, featIndex);
  if (err) return { success: false, error: err };
  return insertContent("background", name, {
    description: description.trim(),
    skills,
    abilities,
    featIndex,
  } as unknown as Json);
}

export async function updateUserBackground(
  id: string,
  name: string,
  description: string,
  skills: string[],
  abilities: string[],
  featIndex: string,
): Promise<UserContentResult> {
  const err = validateBackground(name, description, skills, abilities, featIndex);
  if (err) return { success: false, error: err };
  return updateContent("background", id, name, {
    description: description.trim(),
    skills,
    abilities,
    featIndex,
  } as unknown as Json);
}

export async function deleteUserBackground(id: string): Promise<UserContentResult> {
  return deleteContent("background", id);
}

// ── Custom species (kind='species') ────────────────────────────────────────
// Stored data: { description, size, speed, traits:[{name,description}] }.
// Traits get a synthetic per-row index (`user-trait:{rowId}:{i}`); their
// descriptions ride along on the returned option so the play sheet can merge
// them into its traitDescriptions lookup (the SRD keeps trait text in a
// separate `traits` table, which this mirrors). No subspecies/lineages — same
// flat scope as the dev-authored homebrew species. Special-cased trait
// mechanics (Darkvision, Breath Weapon, etc.) don't apply to user traits;
// they're shown in the Species Traits list, not simulated.

// SpeciesOption plus the trait-index → description map for this species.
export type UserSpecies = SpeciesOption & { traitDescriptions: Record<string, string> };

interface UserSpeciesData {
  description?: string;
  size?: string;
  speed?: number;
  traits?: UserSpeciesTrait[];
}

export async function getUserSpecies(): Promise<UserSpecies[]> {
  return (await listContent("species")).map((row) => {
    const d = row.data as UserSpeciesData;
    const rawTraits = d.traits ?? [];
    const traits = rawTraits.map((t, i) => ({ index: `user-trait:${row.id}:${i}`, name: t.name }));
    const traitDescriptions = Object.fromEntries(
      rawTraits.map((t, i) => [`user-trait:${row.id}:${i}`, t.description ?? ""]),
    );
    return {
      index: `${USER_SPECIES_PREFIX}${row.id}`,
      name: row.name,
      size: d.size ?? "Medium",
      speed: typeof d.speed === "number" ? d.speed : 30,
      traits,
      hasSubspecies: false,
      isHomebrew: true,
      description: d.description ?? null,
      traitDescriptions,
    };
  });
}

function sanitizeTraits(traits: unknown): UserSpeciesTrait[] {
  if (!Array.isArray(traits)) return [];
  return traits
    .map((t) => {
      const o = t as { name?: unknown; description?: unknown };
      return {
        name: typeof o.name === "string" ? o.name.trim().slice(0, 100) : "",
        description: typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "",
      };
    })
    .filter((t) => t.name)
    .slice(0, 20);
}

function validateSpecies(name: string, speed: number, size: string): string | null {
  if (!name.trim()) return "Give the species a name.";
  if (name.length > 100) return "That name's too long.";
  if (!Number.isFinite(speed) || speed < 0 || speed > 120) return "Speed must be 0–120 ft.";
  if (!["Small", "Medium", "Large"].includes(size)) return "Pick a valid size.";
  return null;
}

function speciesData(description: string, size: string, speed: number, traits: UserSpeciesTrait[]): Json {
  return {
    description: description.trim().slice(0, 4000),
    size,
    speed,
    traits: sanitizeTraits(traits),
  } as unknown as Json;
}

export async function createUserSpecies(
  name: string,
  description: string,
  size: string,
  speed: number,
  traits: UserSpeciesTrait[],
): Promise<UserContentResult> {
  const err = validateSpecies(name, speed, size);
  if (err) return { success: false, error: err };
  return insertContent("species", name, speciesData(description, size, speed, traits));
}

export async function updateUserSpecies(
  id: string,
  name: string,
  description: string,
  size: string,
  speed: number,
  traits: UserSpeciesTrait[],
): Promise<UserContentResult> {
  const err = validateSpecies(name, speed, size);
  if (err) return { success: false, error: err };
  return updateContent("species", id, name, speciesData(description, size, speed, traits));
}

export async function deleteUserSpecies(id: string): Promise<UserContentResult> {
  return deleteContent("species", id);
}

// ── Custom spells (kind='spell') ───────────────────────────────────────────
// Stored data: the full UserSpellData shape. Merged into getSpellsForClass's
// result (per class the spell lists) on the owner's characters and into the
// /spells compendium for the owner. Index `user-spell:{id}`.

// The play-sheet form: a SpellOption plus the class indexes it belongs to.
export type UserSpell = SpellOption & { classes: string[] };

function toSpellOption(id: string, name: string, d: UserSpellData): UserSpell {
  return {
    index: `${USER_SPELL_PREFIX}${id}`,
    name,
    level: d.level ?? 0,
    school: d.school ?? null,
    concentration: Boolean(d.concentration),
    ritual: Boolean(d.ritual),
    description: d.description ?? null,
    range: d.range ?? null,
    attackType: d.attackType ?? null,
    dcType: d.dcAbility ?? null,
    damageDice: d.damageDice ?? null,
    damageType: d.damageType ?? null,
    cantripScaling: null,
    isHomebrew: true,
    classes: d.classes ?? [],
  };
}

export async function getUserSpells(): Promise<UserSpell[]> {
  return (await listContent("spell")).map((row) =>
    toSpellOption(row.id, row.name, row.data as unknown as UserSpellData),
  );
}

// The owner's homebrew spells as CompendiumSpell rows, for the /spells page.
export async function getUserCompendiumSpells(): Promise<CompendiumSpell[]> {
  return (await listContent("spell")).map((row) => {
    const d = row.data as unknown as UserSpellData;
    return {
      index: `${USER_SPELL_PREFIX}${row.id}`,
      name: row.name,
      level: d.level ?? 0,
      school: d.school ?? null,
      castingTime: d.castingTime || null,
      range: d.range || null,
      components: d.components ?? [],
      material: d.material || null,
      duration: d.duration || null,
      concentration: Boolean(d.concentration),
      ritual: Boolean(d.ritual),
      classes: (d.classes ?? []).map((c) => CLASS_NAME[c] ?? c),
      description: d.description || null,
      higherLevel: d.higherLevel || null,
    };
  });
}

function validateSpell(name: string, data: UserSpellData): string | null {
  if (!name.trim()) return "Give the spell a name.";
  if (name.length > 100) return "That name's too long.";
  if (!Number.isInteger(data.level) || data.level < 0 || data.level > 9)
    return "Level must be 0 (cantrip) to 9.";
  if (!data.classes || data.classes.length === 0)
    return "Choose at least one class that can prepare it.";
  if ((data.description ?? "").length > 4000) return "The description is too long.";
  return null;
}

// Trim/clamp every field to safe bounds before persisting. A homebrew spell
// may target a homebrew class (`user-class:{id}`), so class indexes accept
// either a real SRD class or that prefix.
function cleanSpellData(d: UserSpellData): UserSpellData {
  const s = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    level: Math.min(9, Math.max(0, Math.round(Number(d.level) || 0))),
    school: s(d.school, 40),
    classes: (Array.isArray(d.classes) ? d.classes : []).filter(
      (c) => CLASS_NAME[c] || c.startsWith(USER_CLASS_PREFIX),
    ),
    castingTime: s(d.castingTime),
    range: s(d.range),
    duration: s(d.duration),
    components: (Array.isArray(d.components) ? d.components : []).filter((c) =>
      ["V", "S", "M"].includes(c),
    ),
    material: s(d.material, 500),
    concentration: Boolean(d.concentration),
    ritual: Boolean(d.ritual),
    description: s(d.description, 4000),
    higherLevel: s(d.higherLevel, 2000),
    attackType: d.attackType === "melee" || d.attackType === "ranged" ? d.attackType : null,
    dcAbility: ["str", "dex", "con", "int", "wis", "cha"].includes(d.dcAbility ?? "")
      ? d.dcAbility
      : null,
    damageDice: d.damageDice ? s(d.damageDice, 20) : null,
    damageType: d.damageType ? s(d.damageType, 40) : null,
  };
}

export async function createUserSpell(name: string, data: UserSpellData): Promise<UserContentResult> {
  const clean = cleanSpellData(data);
  const err = validateSpell(name, clean);
  if (err) return { success: false, error: err };
  return insertContent("spell", name, clean as unknown as Json);
}

export async function updateUserSpell(
  id: string,
  name: string,
  data: UserSpellData,
): Promise<UserContentResult> {
  const clean = cleanSpellData(data);
  const err = validateSpell(name, clean);
  if (err) return { success: false, error: err };
  return updateContent("spell", id, name, clean as unknown as Json);
}

export async function deleteUserSpell(id: string): Promise<UserContentResult> {
  return deleteContent("spell", id);
}

// ── Custom classes (kind='class') ──────────────────────────────────────────
// A homebrew class: hit die + two save proficiencies + optional full-caster
// spellcasting + per-level features. Merged into the class list (builder + play
// sheet), and its features into the play sheet's Features list. See UserClassData
// for the scope (no interactive class resources / starting gear / skill grants).

// ClassOption plus the class's per-level features (which the SRD keeps in a
// separate `features` table — this carries them alongside).
export type UserClass = ClassOption & { features: (ClassFeature & { classIndex: string })[] };

export async function getUserClasses(): Promise<UserClass[]> {
  return (await listContent("class")).map((row) => {
    const d = row.data as unknown as UserClassData;
    const index = `${USER_CLASS_PREFIX}${row.id}`;
    const spellcastingAbility =
      d.spellcastingAbility && ABILITY_NAME[d.spellcastingAbility]
        ? (d.spellcastingAbility as AbilityKey)
        : null;
    const features = [...(d.features ?? [])]
      .sort((a, b) => a.level - b.level)
      .map((f, i) => ({
        index: `user-classfeat:${row.id}:${i}`,
        name: f.name,
        level: f.level,
        description: f.description ?? null,
        classIndex: index,
      }));
    return {
      index,
      name: row.name,
      hitDie: HIT_DIE_OPTIONS.includes(d.hitDie) ? d.hitDie : 8,
      primaryAbilityDesc: null,
      savingThrows: (d.savingThrows ?? [])
        .filter((s) => ABILITY_NAME[s])
        .map((s) => ({ index: s, name: ABILITY_NAME[s] })),
      proficiencyChoices: [],
      startingEquipmentDesc: null,
      startingEquipmentFirstOption: [],
      startingEquipmentOptions: [],
      spellcastingAbility,
      description: d.description ?? null,
      features,
    };
  });
}

// Lightweight {index, name} list of the user's homebrew classes — for the
// custom-spell form's class picker (a homebrew spell can target a homebrew
// caster class).
export async function getUserClassOptions(): Promise<{ index: string; name: string }[]> {
  return (await listContent("class")).map((row) => ({
    index: `${USER_CLASS_PREFIX}${row.id}`,
    name: row.name,
  }));
}

function cleanClassData(d: UserClassData): UserClassData {
  const features = (Array.isArray(d.features) ? d.features : [])
    .map((f) => {
      const level = Number(f.level);
      return {
        name: typeof f.name === "string" ? f.name.trim().slice(0, 100) : "",
        level: Number.isFinite(level) ? Math.min(20, Math.max(1, Math.round(level))) : 1,
        description: typeof f.description === "string" ? f.description.trim().slice(0, 4000) : "",
      };
    })
    .filter((f) => f.name)
    .slice(0, 40);
  const saves = (Array.isArray(d.savingThrows) ? d.savingThrows : []).filter((s) =>
    ["str", "dex", "con", "int", "wis", "cha"].includes(s),
  );
  return {
    hitDie: HIT_DIE_OPTIONS.includes(d.hitDie) ? d.hitDie : 8,
    savingThrows: [...new Set(saves)].slice(0, 2),
    spellcastingAbility: ["int", "wis", "cha"].includes(d.spellcastingAbility ?? "")
      ? d.spellcastingAbility
      : null,
    description: typeof d.description === "string" ? d.description.trim().slice(0, 4000) : "",
    features,
  };
}

function validateClass(name: string, d: UserClassData): string | null {
  if (!name.trim()) return "Give the class a name.";
  if (name.length > 100) return "That name's too long.";
  if (d.savingThrows.length !== 2) return "Choose exactly 2 saving throw proficiencies.";
  return null;
}

export async function createUserClass(name: string, data: UserClassData): Promise<UserContentResult> {
  const clean = cleanClassData(data);
  const err = validateClass(name, clean);
  if (err) return { success: false, error: err };
  return insertContent("class", name, clean as unknown as Json);
}

export async function updateUserClass(
  id: string,
  name: string,
  data: UserClassData,
): Promise<UserContentResult> {
  const clean = cleanClassData(data);
  const err = validateClass(name, clean);
  if (err) return { success: false, error: err };
  return updateContent("class", id, name, clean as unknown as Json);
}

export async function deleteUserClass(id: string): Promise<UserContentResult> {
  return deleteContent("class", id);
}
