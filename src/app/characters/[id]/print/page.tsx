import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  getSpeciesList,
  getSubspeciesList,
  getClassesList,
  getBackgroundsList,
  getSkillsList,
  getEquipmentLookup,
  getFeaturesForClass,
  getSpellsForClass,
} from "@/lib/srd";
import { normalizeDraft, orderedClasses, formatModifier, type CharacterDraft } from "@/lib/character";
import { buildCharacterSheet, resolveWeapons, computeAC } from "@/lib/character-sheet";
import {
  getUserBackgrounds,
  getUserSpecies,
  getUserSpells,
  getUserClasses,
} from "@/app/homebrew/actions";
import PrintButton from "@/components/playsheet/PrintButton";

export const metadata = { title: "Print Character — Tavern" };

export default async function PrintCharacter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: userData },
    { data: character },
    species,
    subspecies,
    classes,
    backgrounds,
    skills,
    equipment,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("characters").select("id, user_id, draft").eq("id", id).maybeSingle(),
    getSpeciesList(),
    getSubspeciesList(),
    getClassesList(),
    getBackgroundsList(),
    getSkillsList(),
    getEquipmentLookup(),
  ]);

  if (!character) {
    return (
      <div className="p-8 text-center text-tavern-muted">
        Character not found. <Link href="/characters" className="underline">Back</Link>
      </div>
    );
  }

  // Same load-boundary handling as the play sheet: normalizeDraft (EMPTY_DRAFT
  // merge + multiclass backfill for legacy rows) and the owner's homebrew
  // content merged into the SRD refs, so a character built on a homebrew
  // species/background/class prints correctly.
  const isOwner = userData.user?.id === character.user_id;
  const [userBackgrounds, userSpecies, userSpells, userClasses] = isOwner
    ? await Promise.all([getUserBackgrounds(), getUserSpecies(), getUserSpells(), getUserClasses()])
    : [[], [], [], []];

  const draft = normalizeDraft(character.draft as unknown as CharacterDraft);
  const sheet = buildCharacterSheet(draft, {
    species: [...species, ...userSpecies],
    subspecies,
    classes: [...classes, ...userClasses],
    backgrounds: [...backgrounds, ...userBackgrounds],
    skills,
  });
  if (!sheet) {
    return <div className="p-8 text-center text-tavern-muted">Couldn&apos;t build this character.</div>;
  }

  // Features and spells fetched per class the character has levels in (a
  // multiclass printout shows both classes' features, each capped at that
  // class's own level), plus homebrew class features / spells for the owner.
  const classList = orderedClasses(draft);
  const perClass = await Promise.all(
    classList.map(async (c) => ({
      classIndex: c.classIndex,
      features: await getFeaturesForClass(c.classIndex),
      spells: await getSpellsForClass(c.classIndex),
    })),
  );
  const features = [
    ...perClass.flatMap((p) =>
      p.features.filter((f) => f.level <= (sheet.classLevels[p.classIndex] ?? 0)),
    ),
    ...userClasses.flatMap((uc) =>
      uc.features.filter((f) => f.level <= (sheet.classLevels[uc.index] ?? 0)),
    ),
  ];
  const classSpells = [...perClass.flatMap((p) => p.spells), ...userSpells];

  const weapons = resolveWeapons(
    sheet.ownedEquipment,
    equipment,
    sheet.modifiers,
    sheet.proficiencyBonus,
  );

  // Printout AC assumes the character is wearing/wielding all their starting
  // armor & shield (the play sheet tracks live equip toggles; a printout can't).
  const allOwnedIndexes = new Set(
    sheet.ownedEquipment.map((i) => i.index).filter((i): i is string => Boolean(i)),
  );
  const unarmoredDefenseBonus =
    (sheet.classLevels["barbarian"] ?? 0) > 0
      ? sheet.modifiers.con
      : (sheet.classLevels["monk"] ?? 0) > 0
        ? sheet.modifiers.wis
        : 0;
  const ac = computeAC(
    sheet.ownedEquipment,
    equipment,
    allOwnedIndexes,
    sheet.modifiers.dex,
    draft.fightingStyleChoices.includes("defense"),
    unarmoredDefenseBonus,
    sheet.naturalArmorAC,
  );

  const spellNameByIndex = new Map(classSpells.map((s) => [s.index, s.name]));
  // Primary class spells live in the legacy flat arrays; each additional
  // class's in its keyed bucket — union them for the printout.
  const allCantrips = [
    ...draft.knownCantrips,
    ...Object.values(draft.classCantrips ?? {}).flat(),
  ];
  const allPrepared = [
    ...draft.preparedSpells,
    ...Object.values(draft.classPreparedSpells ?? {}).flat(),
  ];
  const cantripNames = allCantrips.map((i) => spellNameByIndex.get(i) ?? i);
  const preparedNames = allPrepared.map((i) => spellNameByIndex.get(i) ?? i);
  // Already filtered per owning class's level above.
  const featureNames = features.map((f) => f.name);
  const equipmentNames = sheet.ownedEquipment
    .filter((i) => !i.isMoney && i.name)
    .map((i) => (i.count > 1 ? `${i.count}× ${i.name}` : i.name));

  // Single class: "Fighter". Multiclass: "Fighter 5 / Wizard 3".
  const classLabel =
    sheet.classes.length > 1
      ? sheet.classes.map((c) => `${c.className} ${c.level}`).join(" / ")
      : sheet.className;
  const hitDiceLabel = sheet.hitDicePool.map((h) => `${h.count}d${h.die}`).join(", ");
  const subtitleBits = [
    `Level ${sheet.level}`,
    sheet.subspeciesName ? `${sheet.speciesName} (${sheet.subspeciesName})` : sheet.speciesName,
    classLabel,
    sheet.backgroundName,
  ];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-4 break-inside-avoid">
      <h2 className="mb-1 border-b border-black/40 pb-0.5 text-sm font-bold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-6 text-black print:p-0">
      <style>{`@media print { @page { margin: 1.5cm; } body { background: white; } }`}</style>

      <PrintButton />

      <header className="mb-4 border-b-2 border-black pb-2">
        <h1 className="text-2xl font-bold">{sheet.name || "Unnamed"}</h1>
        <p className="text-sm">{subtitleBits.join(" — ")}</p>
      </header>

      {/* Core stats */}
      <div className="mb-4 grid grid-cols-4 gap-2 text-center sm:grid-cols-8">
        {[
          ["AC", ac],
          ["HP", sheet.maxHpValue],
          ["Init", formatModifier(sheet.initiative)],
          ["Speed", sheet.speed ?? "—"],
          ["Prof", formatModifier(sheet.proficiencyBonus)],
          ["Pass. Perc", sheet.passivePerception],
          ["Hit Dice", hitDiceLabel],
          ...(sheet.spellSaveDC != null ? [["Spell DC", sheet.spellSaveDC] as const] : []),
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-black/40 p-1">
            <div className="text-[9px] uppercase">{label}</div>
            <div className="text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Abilities + saves */}
        <Section title="Ability Scores & Saves">
          <table className="w-full text-sm">
            <tbody>
              {sheet.savingThrows.map((save) => {
                const score = sheet.finalScores[save.ability];
                const mod = sheet.modifiers[save.ability];
                return (
                  <tr key={save.ability} className="border-b border-black/10">
                    <td className="py-0.5 font-bold uppercase">{save.ability}</td>
                    <td className="py-0.5 text-center">{score}</td>
                    <td className="py-0.5 text-center">{formatModifier(mod)}</td>
                    <td className="py-0.5 text-right">
                      Save {formatModifier(save.bonus)} {save.proficient ? "●" : "○"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* Skills */}
        <Section title="Skills">
          <table className="w-full text-xs">
            <tbody>
              {sheet.skills.map((skill) => (
                <tr key={skill.index} className="border-b border-black/10">
                  <td className="py-0.5">
                    {skill.expertise ? "◆" : skill.proficient ? "●" : "○"} {skill.name}
                    <span className="ml-1 opacity-60">({skill.ability.toUpperCase()})</span>
                  </td>
                  <td className="py-0.5 text-right font-bold">{formatModifier(skill.bonus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Attacks */}
      {weapons.length > 0 && (
        <Section title="Attacks">
          <table className="w-full text-sm">
            <tbody>
              {weapons.map((w, i) => (
                <tr key={`${w.index}-${i}`} className="border-b border-black/10">
                  <td className="py-0.5 font-bold">{w.name}</td>
                  <td className="py-0.5 text-center">{formatModifier(w.attackBonus)} to hit</td>
                  <td className="py-0.5 text-right">
                    {w.damageDice} {formatModifier(w.damageBonus)} {w.damageType ?? ""}
                    {w.range ? ` · ${w.range}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Spellcasting */}
      {sheet.spellcastingAbility && (
        <Section title="Spellcasting">
          <p className="text-sm">
            Spell Save DC {sheet.spellSaveDC} · Spell Attack {formatModifier(sheet.spellAttackBonus ?? 0)}
          </p>
          {sheet.spellSlots.some((n) => n > 0) && (
            <p className="mt-1 text-sm">
              Slots:{" "}
              {sheet.spellSlots
                .map((n, i) => (n > 0 ? `L${i + 1}: ${n}` : null))
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {cantripNames.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="font-bold">Cantrips:</span> {cantripNames.join(", ")}
            </p>
          )}
          {preparedNames.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="font-bold">Prepared:</span> {preparedNames.join(", ")}
            </p>
          )}
        </Section>
      )}

      {/* Features */}
      {featureNames.length > 0 && (
        <Section title="Features & Traits">
          <p className="text-sm">{featureNames.join(" · ")}</p>
        </Section>
      )}

      {/* Equipment */}
      {equipmentNames.length > 0 && (
        <Section title="Equipment">
          <p className="text-sm">{equipmentNames.join(" · ")}</p>
        </Section>
      )}

      <p className="print:hidden mt-6 text-center text-xs text-tavern-muted">
        <Link href={`/characters/${id}`} className="underline">
          ← Back to play sheet
        </Link>
      </p>
    </div>
  );
}
