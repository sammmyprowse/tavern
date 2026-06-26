import { formatModifier } from "./character";
import type { EquipmentLookupItem, MagicItemLookupEntry } from "./srd";
import type { InventoryItem } from "./inventory";
import type { MagicItem } from "./magic-items";

// A handful of items have no `description`/`utilize` AND no damage/AC of
// their own (ammunition, spellcasting foci) — too small a list to be
// worth a per-item homebrew pass, but still mysterious to a new player
// ("what does a Wand actually do?"). One generic, factual line per
// category, not narrative flavor, so it doesn't need the same
// homebrew-disclosure treatment as backgrounds/feats/species do.
const CATEGORY_FALLBACK_NOTE: Record<string, string> = {
  ammunition:
    "Ammunition for a matching ranged weapon — expended when fired; you need a quiver or container to carry it.",
  "arcane-foci": "A spellcasting focus — cast spells through it instead of needing a free hand for materials.",
  "druidic-foci": "A spellcasting focus — cast spells through it instead of needing a free hand for materials.",
};

// Shared by both the starting-equipment list and the found/custom list on
// the play sheet's Equipment card — same underlying EquipmentLookupItem,
// just optionally paired with the InventoryItem that carries a custom
// item's bonuses/notes on top of it. Returns plain display lines rather
// than JSX so both call sites can render them identically without
// duplicating the formatting logic.
export function equipmentDetailLines(lookup: EquipmentLookupItem | undefined, invItem?: InventoryItem): string[] {
  if (!lookup) return [];
  const lines: string[] = [];

  // What it actually DOES, before the dry stat lines — real SRD prose for
  // gear/tools/packs (e.g. Dungeoneer's Pack's contents, Healer's Kit's
  // stabilize action); weapons/armor are self-explanatory from their own
  // stats below and never have this field set.
  if (lookup.description) {
    lines.push(lookup.description);
  } else if (!lookup.damage && !lookup.armorClass) {
    const fallback = (lookup.categories ?? []).map((c) => CATEGORY_FALLBACK_NOTE[c]).find(Boolean);
    if (fallback) lines.push(fallback);
  }
  if (lookup.utilize?.length) {
    lines.push(`Use: ${lookup.utilize.map((u) => `${u.name} (DC ${u.dc} ${u.ability})`).join("; ")}`);
  }

  if (lookup.damage) {
    lines.push(
      `Damage: ${lookup.damage.damageDice}${lookup.damage.damageType ? ` ${lookup.damage.damageType}` : ""}`,
    );
  }
  if (lookup.twoHandedDamage) {
    lines.push(
      `Two-handed: ${lookup.twoHandedDamage.damageDice}${
        lookup.twoHandedDamage.damageType ? ` ${lookup.twoHandedDamage.damageType}` : ""
      }`,
    );
  }
  if (lookup.armorClass) {
    const { base, dex_bonus, max_bonus } = lookup.armorClass;
    const dexNote = dex_bonus ? ` + Dex modifier${max_bonus != null ? ` (max ${max_bonus})` : ""}` : "";
    lines.push(`Armor Class: ${base}${dexNote}`);
  }
  if (lookup.properties.length > 0) {
    lines.push(`Properties: ${lookup.properties.map((p) => p.name).join(", ")}`);
  }
  if (lookup.mastery) {
    lines.push(`Mastery: ${lookup.mastery.name}`);
  }
  if (lookup.weight != null) {
    lines.push(`Weight: ${lookup.weight} lb`);
  }
  if (lookup.cost) {
    lines.push(`Cost: ${lookup.cost.qty} ${lookup.cost.unit.toUpperCase()}`);
  }

  if (invItem) {
    const bonusParts = [
      invItem.attackBonus ? `${formatModifier(invItem.attackBonus)} Attack` : null,
      invItem.damageBonus ? `${formatModifier(invItem.damageBonus)} Damage` : null,
      invItem.acBonus ? `${formatModifier(invItem.acBonus)} AC` : null,
    ].filter((p): p is string => Boolean(p));
    if (bonusParts.length > 0) lines.push(`Bonus: ${bonusParts.join(", ")}`);
    if (invItem.bonusDamageDice) {
      lines.push(
        `Bonus damage: +${invItem.bonusDamageDice}${
          invItem.bonusDamageCondition ? ` ${invItem.bonusDamageCondition}` : ""
        }`,
      );
    }
    if (invItem.notes) lines.push(`Notes: ${invItem.notes}`);
  }

  return lines;
}

// Magic items have no structured stats to format — every real one's
// mechanics live in free-text prose (lookup.description), not fields
// like equipment's damage/armor_class — so this is mostly just
// surfacing that prose plus the reference metadata (rarity/attunement)
// alongside whatever bonus/notes the player entered. lookup is undefined
// for a fully homebrew item (no magicItemIndex) — only magicItem.notes
// carries the effect description in that case.
export function magicItemDetailLines(lookup: MagicItemLookupEntry | undefined, magicItem?: MagicItem): string[] {
  const lines: string[] = [];

  if (lookup) {
    if (lookup.rarity) lines.push(`Rarity: ${lookup.rarity}`);
    if (lookup.requiresAttunement) lines.push("Requires Attunement");
    if (lookup.description) lines.push(lookup.description);
  }

  if (magicItem) {
    if (magicItem.acBonus) lines.push(`Bonus: ${formatModifier(magicItem.acBonus)} AC`);
    if (magicItem.notes) lines.push(`Effect: ${magicItem.notes}`);
  }

  return lines;
}
