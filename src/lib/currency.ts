import type { EquipmentBundleItem } from "./srd";

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export const EMPTY_CURRENCY: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

// Order matches the denomination boxes on the official 5e character sheet
// (low to high value) — familiar layout rather than an arbitrary one.
export const CURRENCY_ORDER: { key: keyof Currency; label: string }[] = [
  { key: "cp", label: "Copper" },
  { key: "sp", label: "Silver" },
  { key: "ep", label: "Electrum" },
  { key: "gp", label: "Gold" },
  { key: "pp", label: "Platinum" },
];

// Starting money from class/background equipment choices already flows
// into ownedEquipment as isMoney entries (e.g. {name: "5 GP", count: 5,
// isMoney: true}) — they were already being computed, just silently
// filtered out of the Equipment card's display (`!item.isMoney`) with
// nowhere else to go. Used as the starting point only when a character
// has never had its currency explicitly saved (characters.currency is
// still null) — once a player edits any amount, the saved value becomes
// authoritative and this never runs again for that character.
export function deriveStartingCurrency(ownedEquipment: EquipmentBundleItem[]): Currency {
  const currency = { ...EMPTY_CURRENCY };
  for (const item of ownedEquipment) {
    if (!item.isMoney) continue;
    const unit = item.name.split(" ").pop()?.toLowerCase();
    if (unit && unit in currency) {
      currency[unit as keyof Currency] += item.count;
    }
  }
  return currency;
}
