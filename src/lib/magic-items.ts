// Magic items are a separate concept from the equipment/inventory system —
// most (262 in the SRD) have no real "base mundane item" to anchor to at
// all (a Cloak of Protection isn't a buffed Cloak; a Bag of Holding isn't
// a buffed Backpack). Every magic item's mechanics also live in free-text
// prose (data.desc), never structured fields like equipment's damage/
// armor_class — so unlike InventoryItem there's nothing to auto-derive a
// category or stat block from. A magic item is either anchored to a real
// magic_items SRD row (magicItemIndex set, for flavor/rarity/attunement/
// real description) or fully homebrew (magicItemIndex null, e.g. "Ol'Greg's
// Loin Cloth" — a real item from the user's own campaign, not in any
// sourcebook), with the player filling in whatever bonus/effect applies.
export interface MagicItem {
  id: string;
  magicItemIndex: string | null;
  // Required (non-empty) when magicItemIndex is null — nothing to fall
  // back on for a homebrew item. Optional override otherwise, same as
  // InventoryItem.customName.
  customName: string | null;
  count: number;
  // The only bonus that auto-applies — summed directly into computed AC
  // when equipped (see PlaySheet.tsx). Everything else a magic item might
  // do (attack/damage bonuses, resistance, utility effects) goes in notes
  // as freeform text: unlike a mundane weapon, a worn magic item isn't
  // anchored to one specific weapon, so there's no unambiguous "which
  // attack does this buff" answer to auto-apply a number to.
  acBonus: number;
  notes: string | null;
}

export function emptyMagicItem(magicItemIndex: string | null): MagicItem {
  return {
    id: crypto.randomUUID(),
    magicItemIndex,
    customName: null,
    count: 1,
    acBonus: 0,
    notes: null,
  };
}
