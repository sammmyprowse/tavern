// Original one-line flavor descriptions for species and classes, written
// for Tavern. Backgrounds ship with real narrative description text in
// the underlying SRD dataset (see getBackgroundsList in srd.ts) — species
// and classes don't; their SRD data is purely mechanical (size/speed/
// traits, hit die/proficiencies/saving throws). These fill that gap so
// all three builder steps can show *something* beyond stats, but unlike
// backgrounds' descriptions, this text isn't sourced from anywhere —
// it's short original framing of well-known, generic archetypes, not a
// paraphrase of any specific copyrighted book text.
export const SPECIES_DESCRIPTIONS: Record<string, string> = {
  dragonborn:
    "Born of dragon blood, proud and honor-bound, with a breath weapon and resilience that echo their draconic ancestry.",
  dwarf:
    "Stout and steadfast, raised in stone halls and mining traditions, known for endurance and an unshakeable sense of loyalty.",
  elf: "Graceful and long-lived, attuned to magic and the natural world, with senses and reflexes sharper than most.",
  gnome:
    "Small, clever, and endlessly curious, with a knack for invention, illusion, and finding the fun in everything.",
  goliath:
    "Towering mountain-folk shaped by harsh peaks and trial by endurance, valuing competition and personal achievement.",
  halfling:
    "Small, practical, and quietly brave, with an uncanny luck that gets them out of trouble as often as it gets them into it.",
  human: "Adaptable and ambitious above all else, humans carve out a place anywhere through sheer versatility and drive.",
  orc: "Powerful and tireless, with a culture built on endurance and resolve that lets them push through where others would fall.",
  tiefling:
    "Marked by an infernal bloodline, tieflings carry an otherworldly presence and a will tempered by being misjudged.",
  aasimar:
    "Touched by the upper planes, Aasimar carry a literal inner light and a divine purpose, whether they asked for one or not.",
  centaur:
    "Half humanoid, half steed, centaurs are swift wanderers with deep ties to nature and an unhurried, grounded wisdom.",
  changeling:
    "Shapeshifters who can take on nearly any face, changelings learn early that identity is something you choose, not something you're given.",
  fairy: "Tiny, winged, and touched by the feywild, fairies see the world as equal parts wonder and mischief.",
  goblin:
    "Small, scrappy, and quick on their feet, goblins survive — and thrive — through cunning rather than brute strength.",
  owlin:
    "Feathered folk with the silent flight and keen night vision of an owl, equally at home watching from above or striking unseen.",
  satyr:
    "Wild, joyful, and impossible to pin down, satyrs bring a fey love of music, revelry, and freedom wherever they go.",
  shifter:
    "Carrying a trace of lycanthropic blood, shifters can call on bestial instincts and senses without ever losing themselves to them.",
  tabaxi:
    "Restless and curious cat-folk, driven by an insatiable need to see what's over the next horizon — and what's hiding in the shadows.",
  tortle: "Patient, principled, and built like a walking fortress, tortles wander the world at their own unbothered pace.",
};

export const CLASS_DESCRIPTIONS: Record<string, string> = {
  barbarian: "Channels raw fury into unstoppable momentum, shrugging off pain and danger that would drop anyone else.",
  bard: "Weaves magic through music, words, and performance, inspiring allies and unraveling problems with as much wit as spellcraft.",
  cleric: "Channels divine power granted by a god or domain, equally capable of mending the wounded and smiting the wicked.",
  druid: "Draws power from the natural world itself, able to call on primal magic or take the shape of a beast entirely.",
  fighter: "Masters the fundamentals of combat better than anyone — weapons, tactics, and sheer relentless action in a fight.",
  monk: "Turns body and spirit into a weapon through rigorous discipline, striking with supernatural speed and precision.",
  paladin: "Binds magic to an unbreakable oath, fighting for a cause with equal parts steel and conviction.",
  ranger: "Master of the wilds and the hunt, blending martial skill with nature magic to track down anything, anywhere.",
  rogue: "Thrives on precision, misdirection, and striking exactly where it hurts most before anyone sees it coming.",
  sorcerer:
    "Magic isn't studied, it's innate — sorcerers bend raw, unpredictable power to their will through sheer force of self.",
  warlock:
    "Trades power for a pact with something vast and otherworldly, wielding borrowed magic that always comes with strings attached.",
  wizard: "Magic as a science: studied, recorded, and perfected, with a spellbook full of solutions to nearly any problem.",
};

// Same gap, same treatment, one level down — subspecies/lineage options
// (Draconic Ancestor, Elven Lineage, etc.) have no description field in
// the raw data either. Grounded in the classic, widely-known color/type
// associations (black dragons and acid swamps, frost giants and cold
// endurance, etc.) rather than invented from nothing, but still original
// phrasing, not a paraphrase of specific book text.
export const LINEAGE_DESCRIPTIONS: Record<string, string> = {
  "draconic-ancestor-black": "Hails from acid-scarred swamps and bogs, with a corrosive breath to match.",
  "draconic-ancestor-blue": "Hails from sun-scoured deserts, calling down lightning like distant thunderheads.",
  "draconic-ancestor-brass": "Hails from sweltering deserts, talkative and fond of a good, long story.",
  "draconic-ancestor-bronze": "Hails from coastal waters, drawn to storms and the open sea.",
  "draconic-ancestor-copper": "Hails from rocky hills and canyons, sharp-tongued and quick with a joke.",
  "draconic-ancestor-gold": "Hails from a noble, honor-bound line, holding themselves to the highest standard.",
  "draconic-ancestor-green": "Hails from dense forests, as cunning and patient as the woods themselves.",
  "draconic-ancestor-red": "Hails from volcanic peaks, proud and fierce, with fire in their blood.",
  "draconic-ancestor-silver": "Hails from high mountain peaks, fiercely protective of those they call kin.",
  "draconic-ancestor-white": "Hails from frozen wastes, blunt and instinctual, built for survival over subtlety.",
  "elven-lineage-drow": "Descended from the Underdark's elves, at home in darkness and shadow.",
  "elven-lineage-high-elf": "Descended from elves steeped in arcane study, with a cantrip always close at hand.",
  "elven-lineage-wood-elf": "Descended from elves of the deep forest, swift and at home in the wild.",
  "gnomish-lineage-forest-gnome": "Hails from woodland warrens, with a natural rapport for small forest creatures.",
  "gnomish-lineage-rock-gnome": "Hails from hillside burrows, endlessly tinkering with gadgets and gears.",
  "giant-ancestry-clouds-jaunt": "Carries the cloud giants' gift for closing distance in the blink of an eye.",
  "giant-ancestry-fires-burn": "Carries the fire giants' resilience, searing back at whatever burns them.",
  "giant-ancestry-frosts-chill": "Carries the frost giants' endurance, shrugging off cold that would stop others cold.",
  "giant-ancestry-hills-tumble": "Carries the hill giants' sheer bulk, turning a hard fall into someone else's problem.",
  "giant-ancestry-stones-endurance": "Carries the stone giants' toughness, soaking up a hit before it really lands.",
  "giant-ancestry-storms-thunder": "Carries the storm giants' command of thunder, answering force with force.",
  "fiendish-legacy-abyssal": "Bloodline traces to the Abyss, with a demonic temper simmering close to the surface.",
  "fiendish-legacy-chthonic": "Bloodline traces to the realms of the dead, touched by necrotic power.",
  "fiendish-legacy-infernal": "Bloodline traces to the Nine Hells, carrying a devil's fire and cunning.",
};

// The 12 homebrew backgrounds already carry real description text inside
// their own data (written when they were authored) — getBackgroundsList
// reads that directly. The 4 official SRD backgrounds have the same gap
// species/classes do (no narrative text in the underlying dataset at
// all), so this fills in just those four as a fallback.
export const OFFICIAL_BACKGROUND_DESCRIPTIONS: Record<string, string> = {
  acolyte:
    "You spent your early life in service to a temple, learning devotion and ritual before you ever picked up a blade.",
  criminal:
    "You've made your living on the wrong side of the law, and you learned to think fast and trust slowly because of it.",
  sage: "You've spent more time with books than people, chasing knowledge most would call useless — until it isn't.",
  soldier:
    "You served in an army, following orders and giving them, and the discipline never quite left you once the fighting stopped.",
};
