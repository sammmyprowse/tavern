import type { EquipmentBundleItem, EquipmentLookupItem } from "./srd";

// Player-added equipment — either picked straight from the standard
// catalog (every bonus field stays 0/null) or built as a custom/magic
// item on top of a real base item (e.g. "Goblin Slayer Sword" based on
// "longsword" + an attack/damage bonus). Always anchored to a real
// baseIndex rather than being fully freeform, per the chosen "start from
// a base item" flow — it inherits real mechanical stats (damage dice,
// weight, base AC) and only the bonuses need entering by hand.
export interface InventoryItem {
  id: string;
  baseIndex: string;
  customName: string | null;
  count: number;
  attackBonus: number;
  damageBonus: number;
  acBonus: number;
  // Conditional/dice-based extra damage (e.g. "1d6" only "vs goblins") —
  // a real mechanic, not freeform text: rollable on its own from the
  // Attacks card, separate from the always-on attackBonus/damageBonus.
  bonusDamageDice: string | null;
  bonusDamageCondition: string | null;
  notes: string | null;
}

export function emptyInventoryItem(baseIndex: string): InventoryItem {
  return {
    id: crypto.randomUUID(),
    baseIndex,
    customName: null,
    count: 1,
    attackBonus: 0,
    damageBonus: 0,
    acBonus: 0,
    bonusDamageDice: null,
    bonusDamageCondition: null,
    notes: null,
  };
}

export type InventoryItemCategory = "weapon" | "armor" | "shield" | "other";

// Drives which bonus fields the picker/edit form shows — derived from the
// base item's own real stats rather than asked of the player, since the
// base item already implies it (a Longsword is obviously a weapon).
export function categorizeBaseItem(base: EquipmentLookupItem): InventoryItemCategory {
  if (base.damage) return "weapon";
  if (base.index === "shield") return "shield";
  if (base.armorClass) return "armor";
  return "other";
}

export interface ResolvedInventory {
  bundleItems: EquipmentBundleItem[];
  augmentedLookup: Map<string, EquipmentLookupItem>;
}

// Bridges player-added inventory into the exact resolution path starting
// equipment already uses — computeAC/resolveWeapons both key off an
// index into an equipment lookup map, so rather than teaching those
// functions a second, parallel data shape, each inventory item gets a
// synthetic lookup entry (keyed by its own client-generated id, which
// never collides with a real SRD index) with its bonuses already baked
// into the base item's real stats. computeAC needs no changes at all;
// resolveWeapons only needed two `?? 0` additions (see character-sheet.ts).
export function resolveInventoryEquipment(
  inventory: InventoryItem[],
  baseLookup: Map<string, EquipmentLookupItem>,
): ResolvedInventory {
  const augmentedLookup = new Map(baseLookup);
  const bundleItems: EquipmentBundleItem[] = [];

  for (const item of inventory) {
    const base = baseLookup.get(item.baseIndex);
    if (!base) continue;

    const name = item.customName ?? base.name;

    bundleItems.push({
      index: item.id,
      name,
      count: item.count,
      isMoney: false,
    });

    augmentedLookup.set(item.id, {
      ...base,
      index: item.id,
      name,
      armorClass: base.armorClass ? { ...base.armorClass, base: base.armorClass.base + item.acBonus } : null,
      attackBonus: item.attackBonus,
      damageBonus: item.damageBonus,
      bonusDamageDice: item.bonusDamageDice ?? undefined,
      bonusDamageCondition: item.bonusDamageCondition ?? undefined,
      notes: item.notes ?? undefined,
    });
  }

  return { bundleItems, augmentedLookup };
}
