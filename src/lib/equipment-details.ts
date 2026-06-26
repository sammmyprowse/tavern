import { formatModifier } from "./character";
import type { EquipmentLookupItem } from "./srd";
import type { InventoryItem } from "./inventory";

// Shared by both the starting-equipment list and the found/custom list on
// the play sheet's Equipment card — same underlying EquipmentLookupItem,
// just optionally paired with the InventoryItem that carries a custom
// item's bonuses/notes on top of it. Returns plain display lines rather
// than JSX so both call sites can render them identically without
// duplicating the formatting logic.
export function equipmentDetailLines(lookup: EquipmentLookupItem | undefined, invItem?: InventoryItem): string[] {
  if (!lookup) return [];
  const lines: string[] = [];

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
    if (invItem.notes) lines.push(`Notes: ${invItem.notes}`);
  }

  return lines;
}
