import { supabase } from "./supabase";
import type { AbilityKey, ArmorClassData } from "./character";
import {
  SPECIES_DESCRIPTIONS,
  CLASS_DESCRIPTIONS,
  OFFICIAL_BACKGROUND_DESCRIPTIONS,
  LINEAGE_DESCRIPTIONS,
} from "./flavor-text";

export interface SpeciesOption {
  index: string;
  name: string;
  size: string | null;
  speed: number | null;
  traits: { index: string; name: string }[];
  hasSubspecies: boolean;
  isHomebrew: boolean;
  description: string | null;
}

export interface SubspeciesOption {
  index: string;
  name: string;
  speciesIndex: string;
  traits: { index: string; name: string; level?: number }[];
  // Draconic Ancestor subspecies only — the damage type Breath Weapon/
  // Damage Resistance use (Acid/Cold/Fire/Lightning/Poison, per ancestor).
  // null for every other subspecies (Gnomish/Elven Lineage, etc. don't have
  // a single damage type).
  damageType: { index: string; name: string } | null;
  description: string | null;
}

export interface SkillOptionRef {
  index: string;
  name: string;
}

export interface ProficiencyChoice {
  desc: string;
  choose: number;
  options: SkillOptionRef[];
}

export interface ClassOption {
  index: string;
  name: string;
  hitDie: number;
  primaryAbilityDesc: string | null;
  savingThrows: { index: string; name: string }[];
  proficiencyChoices: ProficiencyChoice[];
  startingEquipmentDesc: string | null;
  startingEquipmentFirstOption: EquipmentBundleItem[];
  // null for non-casters. Generic (not Wizard-specific) so the same field
  // works once Sorcerer/Cleric's spellcasting passes happen.
  spellcastingAbility: AbilityKey | null;
  description: string | null;
}

export interface EquipmentBundleItem {
  index: string | null;
  name: string;
  count: number;
  isMoney: boolean;
}

export interface BackgroundOption {
  index: string;
  name: string;
  description: string | null;
  isHomebrew: boolean;
  abilityScores: { index: string; name: string }[];
  feat: { index: string; name: string; note?: string } | null;
  proficiencies: { index: string; name: string }[];
  equipmentDesc: string | null;
  equipmentFirstOption: EquipmentBundleItem[];
}

export interface AbilityScoreInfo {
  index: string;
  name: string;
  fullName: string;
  description: string;
}

export interface WeaponDamage {
  damageDice: string;
  damageType: string | null;
}

export interface EquipmentLookupItem {
  index: string;
  name: string;
  categories: string[] | null;
  armorClass: ArmorClassData | null;
  damage: WeaponDamage | null;
  twoHandedDamage: WeaponDamage | null;
  properties: { index: string; name: string }[];
  mastery: { index: string; name: string } | null;
  weight: number | null;
  cost: { qty: number; unit: string } | null;
  // Only ever set on synthetic entries built by resolveInventoryEquipment
  // (see src/lib/inventory.ts) for a player's custom/found item — real
  // catalog entries from getEquipmentLookup() never set these, so every
  // existing call site that doesn't know about inventory items keeps
  // working unchanged (lookup.attackBonus ?? 0 is always 0 for them).
  attackBonus?: number;
  damageBonus?: number;
}

export interface SkillInfo {
  index: string;
  name: string;
  abilityScore: string;
  description: string;
}

function parseEquipmentOptions(optionsBlock: unknown): EquipmentBundleItem[] {
  const block = optionsBlock as
    | { from?: { options?: unknown[] } }
    | undefined;
  const firstOption = block?.from?.options?.[0] as
    | { option_type?: string; items?: unknown[]; unit?: string; count?: number }
    | undefined;
  if (!firstOption) return [];

  if (firstOption.option_type === "money") {
    return [
      {
        index: null,
        name: `${firstOption.count} ${firstOption.unit?.toUpperCase()}`,
        count: firstOption.count ?? 0,
        isMoney: true,
      },
    ];
  }

  if (firstOption.option_type === "multiple" && Array.isArray(firstOption.items)) {
    return firstOption.items.map((raw) => {
      const item = raw as {
        option_type?: string;
        of?: { index: string; name: string };
        count?: number;
        unit?: string;
        choice?: { from?: { equipment_category?: { name?: string } } };
      };
      if (item.option_type === "money") {
        return {
          index: null,
          name: `${item.count} ${item.unit?.toUpperCase()}`,
          count: item.count ?? 0,
          isMoney: true,
        };
      }
      if (item.option_type === "choice") {
        const categoryName = item.choice?.from?.equipment_category?.name ?? "item";
        return {
          index: null,
          name: `${categoryName} (your choice)`,
          count: 1,
          isMoney: false,
        };
      }
      return {
        index: item.of?.index ?? null,
        name: item.of?.name ?? "Unknown item",
        count: item.count ?? 1,
        isMoney: false,
      };
    });
  }

  return [];
}

// Species (incl. homebrew, same disclosure pattern as backgrounds/feats):
// the free SRD only ships the 9 official 2024 PHB species, so 10 original
// homebrew species (Fairy explicitly requested, plus other well-known D&D
// species missing from the free SRD's roster) are tagged ruleset='homebrew'
// — see CLAUDE.md's "Homebrew species" section and
// supabase/seed/homebrew-species.json for the full writeup.
export async function getSpeciesList(): Promise<SpeciesOption[]> {
  const [{ data: species }, { data: subspecies }] = await Promise.all([
    supabase.from("species").select("index, name, size, speed, ruleset, data").in("ruleset", ["2024", "homebrew"]),
    supabase.from("subspecies").select("species_index").eq("ruleset", "2024"),
  ]);

  const speciesWithSubspecies = new Set((subspecies ?? []).map((s) => s.species_index));

  return (species ?? [])
    .map((s) => {
      const data = s.data as { traits?: { index: string; name: string }[] };
      return {
        index: s.index,
        name: s.name,
        size: s.size,
        speed: s.speed,
        traits: data.traits ?? [],
        hasSubspecies: speciesWithSubspecies.has(s.index),
        isHomebrew: s.ruleset === "homebrew",
        description: SPECIES_DESCRIPTIONS[s.index] ?? null,
      };
    })
    .sort((a, b) => {
      if (a.isHomebrew !== b.isHomebrew) return a.isHomebrew ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

export async function getSubspeciesList(): Promise<SubspeciesOption[]> {
  const { data } = await supabase
    .from("subspecies")
    .select("index, name, species_index, data")
    .eq("ruleset", "2024");

  return (data ?? []).map((s) => {
    const d = s.data as {
      traits?: { index: string; name: string; level?: number }[];
      damage_type?: { index: string; name: string };
    };
    return {
      index: s.index,
      name: s.name,
      speciesIndex: s.species_index ?? "",
      traits: d.traits ?? [],
      damageType: d.damage_type ?? null,
      description: LINEAGE_DESCRIPTIONS[s.index] ?? null,
    };
  });
}

// Trait descriptions, keyed by index — looked up across BOTH species-level
// traits (Darkvision, Fey Ancestry, etc.) and subspecies-level traits
// (Breath Weapon, Elven Lineage, etc.), which is why this fetches the whole
// `traits` table rather than going through species/subspecies. No ruleset
// filter: trait TEXT itself isn't gated by ruleset the way species/
// backgrounds/feats are — a homebrew species' traits live in this same
// table (tagged ruleset='homebrew' on the trait row), and the lookup just
// needs the description regardless of source. A plain object, not a Map —
// Map instances don't survive the Server Component -> Client Component
// props boundary (React's RSC serialization doesn't support them).
export async function getTraitDescriptions(): Promise<Record<string, string>> {
  const { data } = await supabase.from("traits").select("index, data");
  const result: Record<string, string> = {};
  for (const t of data ?? []) {
    const d = t.data as { description?: string };
    if (d.description) result[t.index] = d.description;
  }
  return result;
}

export async function getClassesList(): Promise<ClassOption[]> {
  const { data } = await supabase
    .from("classes")
    .select("index, name, hit_die, data")
    .eq("ruleset", "2024");

  return (data ?? [])
    .map((c) => {
      const d = c.data as {
        primary_ability?: { desc?: string };
        saving_throws?: { index: string; name: string }[];
        proficiency_choices?: {
          desc: string;
          choose: number;
          from?: { options?: { item?: { index: string; name: string } }[] };
        }[];
        starting_equipment_options?: { desc?: string; from?: { options?: unknown[] } }[];
        spellcasting?: { spellcasting_ability?: { index?: string } };
      };
      return {
        index: c.index,
        name: c.name,
        hitDie: c.hit_die ?? 8,
        primaryAbilityDesc: d.primary_ability?.desc ?? null,
        savingThrows: d.saving_throws ?? [],
        proficiencyChoices: (d.proficiency_choices ?? []).map((pc) => ({
          desc: pc.desc,
          choose: pc.choose,
          options: (pc.from?.options ?? [])
            .map((o) => o.item)
            .filter((item): item is SkillOptionRef => Boolean(item)),
        })),
        startingEquipmentDesc: d.starting_equipment_options?.[0]?.desc ?? null,
        startingEquipmentFirstOption: parseEquipmentOptions(d.starting_equipment_options?.[0]),
        spellcastingAbility: (d.spellcasting?.spellcasting_ability?.index as AbilityKey) ?? null,
        description: CLASS_DESCRIPTIONS[c.index] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBackgroundsList(): Promise<BackgroundOption[]> {
  const { data } = await supabase
    .from("backgrounds")
    .select("index, name, ruleset, data")
    .in("ruleset", ["2024", "homebrew"]);

  return (data ?? [])
    .map((b) => {
      const d = b.data as {
        description?: string;
        ability_scores?: { index: string; name: string }[];
        feat?: { index: string; name: string; note?: string };
        proficiencies?: { index: string; name: string }[];
        equipment_options?: { desc?: string; from?: { options?: unknown[] } }[];
      };
      return {
        index: b.index,
        name: b.name,
        description: d.description ?? OFFICIAL_BACKGROUND_DESCRIPTIONS[b.index] ?? null,
        isHomebrew: b.ruleset === "homebrew",
        abilityScores: d.ability_scores ?? [],
        feat: d.feat ?? null,
        proficiencies: d.proficiencies ?? [],
        equipmentDesc: d.equipment_options?.[0]?.desc ?? null,
        equipmentFirstOption: parseEquipmentOptions(d.equipment_options?.[0]),
      };
    })
    .sort((a, b) => {
      if (a.isHomebrew !== b.isHomebrew) return a.isHomebrew ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

export async function getAbilityScoresList(): Promise<AbilityScoreInfo[]> {
  const { data } = await supabase
    .from("ability_scores")
    .select("index, name, data")
    .eq("ruleset", "2024");

  return (data ?? []).map((a) => {
    const d = a.data as { full_name?: string; description?: string };
    return {
      index: a.index,
      name: a.name,
      fullName: d.full_name ?? a.name,
      description: d.description ?? "",
    };
  });
}

export async function getEquipmentLookup(): Promise<Map<string, EquipmentLookupItem>> {
  const { data } = await supabase
    .from("equipment")
    .select("index, name, categories, weight, cost_qty, cost_unit, data")
    .eq("ruleset", "2024");

  const map = new Map<string, EquipmentLookupItem>();
  for (const item of data ?? []) {
    const d = item.data as {
      armor_class?: ArmorClassData;
      damage?: { damage_dice: string; damage_type?: { name: string } };
      two_handed_damage?: { damage_dice: string; damage_type?: { name: string } };
      properties?: { index: string; name: string }[];
      mastery?: { index: string; name: string };
    };
    map.set(item.index, {
      index: item.index,
      name: item.name,
      categories: item.categories,
      armorClass: d.armor_class ?? null,
      damage: d.damage
        ? { damageDice: d.damage.damage_dice, damageType: d.damage.damage_type?.name ?? null }
        : null,
      twoHandedDamage: d.two_handed_damage
        ? {
            damageDice: d.two_handed_damage.damage_dice,
            damageType: d.two_handed_damage.damage_type?.name ?? null,
          }
        : null,
      properties: d.properties ?? [],
      mastery: d.mastery ?? null,
      weight: item.weight != null ? Number(item.weight) : null,
      cost: item.cost_qty != null && item.cost_unit ? { qty: Number(item.cost_qty), unit: item.cost_unit } : null,
    });
  }
  return map;
}

export interface SpellOption {
  index: string;
  name: string;
  level: number;
  school: string | null;
  concentration: boolean;
  ritual: boolean;
  description: string | null;
}

// Spell data only exists in the 2014 ruleset (2024 SRD hasn't published
// spells yet) — close to, but not guaranteed byte-identical to, 2024 spell
// text. Unlike features/subclasses, there's no `class_index` column here, so
// class membership is checked against the nested `data.classes[]` array
// client-side rather than pushed down as a Postgres filter.
export async function getSpellsForClass(classIndex: string): Promise<SpellOption[]> {
  const { data } = await supabase
    .from("spells")
    .select("index, name, level, school, concentration, ritual, data")
    .eq("ruleset", "2014");

  return (data ?? [])
    .filter((s) => {
      const classes = (s.data as { classes?: { index: string }[] }).classes ?? [];
      return classes.some((c) => c.index === classIndex);
    })
    .map((s) => {
      const d = s.data as { desc?: string[] };
      return {
        index: s.index,
        name: s.name,
        level: s.level ?? 0,
        school: s.school,
        concentration: s.concentration ?? false,
        ritual: s.ritual ?? false,
        description: d.desc ? d.desc.join("\n\n") : null,
      };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface ClassFeature {
  index: string;
  name: string;
  level: number;
  description: string | null;
}

export async function getFeaturesForClass(classIndex: string): Promise<ClassFeature[]> {
  const { data } = await supabase
    .from("features")
    .select("index, name, level_index, data")
    .eq("ruleset", "2024")
    .eq("class_index", classIndex);

  return (data ?? [])
    .map((f) => {
      const d = f.data as { description?: string };
      const level = parseInt((f.level_index ?? "").replace(`${classIndex}-`, ""), 10);
      return {
        index: f.index,
        name: f.name,
        level: Number.isFinite(level) ? level : 1,
        description: d.description ?? null,
      };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface SubclassFeature {
  name: string;
  level: number;
  description: string;
}

export interface SubclassOption {
  index: string;
  name: string;
  summary: string | null;
  description: string | null;
  features: SubclassFeature[];
}

// Unlike base class features, subclass features aren't in the shared
// `features` table — they're embedded directly in the subclass's own
// `data.features[]` array.
export async function getSubclassesForClass(classIndex: string): Promise<SubclassOption[]> {
  const { data } = await supabase
    .from("subclasses")
    .select("index, name, data")
    .eq("ruleset", "2024")
    .eq("class_index", classIndex);

  return (data ?? [])
    .map((s) => {
      const d = s.data as {
        summary?: string;
        description?: string;
        features?: { name: string; level: number; description: string }[];
      };
      return {
        index: s.index,
        name: s.name,
        summary: d.summary ?? null,
        description: d.description ?? null,
        features: [...(d.features ?? [])].sort((a, b) => a.level - b.level),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface FeatOption {
  index: string;
  name: string;
  description: string | null;
  isHomebrew: boolean;
}

export async function getGeneralFeatsList(): Promise<FeatOption[]> {
  const { data } = await supabase
    .from("feats")
    .select("index, name, ruleset, data")
    .eq("type", "general")
    .in("ruleset", ["2024", "homebrew"]);

  return (data ?? [])
    .map((f) => {
      const d = f.data as { description?: string };
      return {
        index: f.index,
        name: f.name,
        description: d.description ?? null,
        isHomebrew: f.ruleset === "homebrew",
      };
    })
    .sort((a, b) => {
      if (a.isHomebrew !== b.isHomebrew) return a.isHomebrew ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

// Fighting Style feats (Archery/Defense/Great Weapon Fighting/Two-Weapon
// Fighting) are a real, separate feat category in the SRD data
// (type='fighting-style', distinct from the homebrew general-feat pool
// above) — granted to Fighter/Paladin/Ranger via FIGHTING_STYLE_KNOWN_BY_CLASS
// in character.ts. Only 4 of the real PHB's ~9 styles are in the free SRD;
// unlike backgrounds/general feats, that gap hasn't been homebrew-padded
// (not requested), so this list is shorter than the official one — disclosed
// in CLAUDE.md, not silently presented as complete.
export async function getFightingStyleFeats(): Promise<FeatOption[]> {
  const { data } = await supabase
    .from("feats")
    .select("index, name, data")
    .eq("type", "fighting-style")
    .eq("ruleset", "2024");

  return (data ?? [])
    .map((f) => {
      const d = f.data as { description?: string };
      return {
        index: f.index,
        name: f.name,
        description: d.description ?? null,
        isHomebrew: false,
      };
    })
    .sort((a, b) => {
      if (a.isHomebrew !== b.isHomebrew) return a.isHomebrew ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

export async function getSkillsList(): Promise<SkillInfo[]> {
  const { data } = await supabase
    .from("skills")
    .select("index, name, ability_score, data")
    .eq("ruleset", "2024");

  return (data ?? [])
    .map((s) => {
      const d = s.data as { description?: string };
      return {
        index: s.index,
        name: s.name,
        abilityScore: s.ability_score ?? "str",
        description: d.description ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
