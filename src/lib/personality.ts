import type { CharacterSheet } from "./character-sheet";

export interface PersonalityAnswers {
  positiveTrait: string;
  negativeTrait: string;
  heroicTrait: string;
  destructiveTrait: string;
  flaw: string;
  backstory: string;
  motivation: string;
  bond: string;
  appearance: string;
}

export const EMPTY_PERSONALITY: PersonalityAnswers = {
  positiveTrait: "None",
  negativeTrait: "None",
  heroicTrait: "None",
  destructiveTrait: "None",
  flaw: "None",
  backstory: "None",
  motivation: "None",
  bond: "None",
  appearance: "None",
};

export interface PersonalityQuestion {
  key: keyof PersonalityAnswers;
  label: string;
  description: string;
  group: "Personality" | "Backstory" | "Appearance";
  options: string[];
}

// Original content written for Tavern — pure flavor, never read by
// buildCharacterSheet() or anything else mechanical. Negative Trait and
// Flaw look similar at a glance but aim at different things: Negative
// Trait is a passive personality quirk, Flaw is an active compulsion that
// creates recurring trouble. Destructive Trait is in-fiction social
// damage (grudges, distrust, manipulation) — broader than any one example.
export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  {
    key: "positiveTrait",
    label: "Positive Trait",
    description: "A likable quality that makes them easy to root for.",
    group: "Personality",
    options: [
      "I'm fiercely loyal to those who earn my trust.",
      "I always look for the best in people.",
      "I keep my word, no matter the cost.",
      "I'm quick to laugh and even quicker to forgive.",
      "I'll give my last coin to someone who needs it more.",
      "I face danger calmly, for the sake of those who can't.",
    ],
  },
  {
    key: "negativeTrait",
    label: "Negative Trait",
    description: "A personality quirk or flaw — not necessarily harmful to others, just human.",
    group: "Personality",
    options: [
      "I'm stubborn to a fault — I rarely admit when I'm wrong.",
      "I have a habit of overpromising and underdelivering.",
      "I'm vain about my appearance or reputation.",
      "I can't resist a wager, even when I can't afford to lose.",
      "I'm quick to judge people before I know them.",
      "I hoard things I don't need, just in case.",
    ],
  },
  {
    key: "heroicTrait",
    label: "Heroic Trait",
    description: "A quality or past deed that shows real courage or selflessness.",
    group: "Personality",
    options: [
      "I once stood alone against overwhelming odds to protect a stranger.",
      "I can't walk away from someone in trouble, even at my own expense.",
      "I gave up something precious to save someone else.",
      "I've sworn an oath I intend to keep, whatever it costs me.",
      "I run toward danger when others run from it.",
      "I forgave someone who wronged me greatly, and it changed me.",
    ],
  },
  {
    key: "destructiveTrait",
    label: "Destructive Trait",
    description:
      "An in-fiction social flaw for roleplay — a grudge, a prejudice, a habit that damages relationships. About your character, not any real group.",
    group: "Personality",
    options: [
      "I hold a deep grudge against a person, group, or place from my past.",
      "I lie reflexively, even when the truth would serve me better.",
      "I distrust an entire people or profession because of one bad experience.",
      "I manipulate the people closest to me without meaning to.",
      "I pick fights I can't win out of pride.",
      "I burn bridges when I feel betrayed, and I feel betrayed often.",
    ],
  },
  {
    key: "flaw",
    label: "Flaw",
    description:
      "A compulsion or vice that causes recurring trouble — different from Negative Trait, which is more passive.",
    group: "Personality",
    options: [
      "I can't resist taking something that isn't mine, even when it's pointless or risky.",
      "I lie compulsively, even about things that don't matter.",
      "I have a vice or addiction I can't fully control.",
      "I freeze or panic when things go wrong, even in small ways.",
      "I physically can't keep a secret, no matter how hard I try.",
      "I have to win — every game, every argument, every time.",
    ],
  },
  {
    key: "backstory",
    label: "Backstory / Origin",
    description: "What happened before the story starts — where they're from and what shaped them.",
    group: "Backstory",
    options: [
      "Orphaned or abandoned young, raised by strangers or no one at all.",
      "Fled a war, disaster, or downfall that destroyed their home.",
      "Cast out or exiled by the community that raised them.",
      "Left a comfortable, ordinary life seeking something more.",
      "Apprenticed or trained under a mentor who shaped who they became.",
      "Born into hardship and clawed their way out of it.",
    ],
  },
  {
    key: "motivation",
    label: "Motivation / Goal",
    description: "What they're actually chasing on this adventure, deep down.",
    group: "Backstory",
    options: [
      "Searching for someone they lost — or someone who left.",
      "Chasing glory and a name people will remember.",
      "Trying to pay off a debt, a favor, or a wrong they owe.",
      "Running from something — the law, a person, or their past.",
      "Seeking redemption for something they've done.",
      "Simply curious — chasing the next horizon for its own sake.",
    ],
  },
  {
    key: "bond",
    label: "Bond",
    description: "A person, place, or thing they care about enough to risk everything for.",
    group: "Backstory",
    options: [
      "A family member or mentor they're desperate to protect or impress.",
      "A hometown or community they hope to return to one day.",
      "An old friend or rival whose fate is tangled with their own.",
      "A keepsake or relic tied to someone they've lost.",
      "A debt of honor to someone who once saved their life.",
      "A promise made to someone who's no longer there to collect it.",
    ],
  },
  {
    key: "appearance",
    label: "Appearance Details",
    description:
      "Purely visual flavor for the AI art prompt — won't add, remove, or change anything in your inventory.",
    group: "Appearance",
    options: [
      "A notable scar, old injury, or asymmetry.",
      "An unusual eye color, marking, or feature tied to their heritage.",
      "A signature look they're known for — a color, fabric, or style, regardless of what's practical.",
      "Visible signs of their trade — calloused hands, ink stains, tool-worn fingers.",
      "A tattoo, brand, or marking with a story behind it.",
      "A particular way they carry themselves — a limp, a slouch, unshakeable poise.",
    ],
  },
];

function abilityLine(sheet: CharacterSheet): string {
  const order: (keyof CharacterSheet["finalScores"])[] = ["str", "dex", "con", "int", "wis", "cha"];
  return order
    .map((a) => {
      const score = sheet.finalScores[a];
      const mod = sheet.modifiers[a];
      return `${a.toUpperCase()} ${score} (${mod >= 0 ? "+" : ""}${mod})`;
    })
    .join(", ");
}

function trainedSkillsLine(sheet: CharacterSheet): string {
  const trained = sheet.skills.filter((s) => s.proficient);
  if (trained.length === 0) return "No trained skills.";
  return trained
    .map((s) => `${s.name} (${s.bonus >= 0 ? "+" : ""}${s.bonus}${s.expertise ? ", expertise" : ""})`)
    .join(", ");
}

// Assembles a copy-pasteable brief for an external AI tool (image + text
// generation) — always built fresh from the LIVE character sheet, never
// frozen at creation time, so it stays accurate as the character levels
// up. The instructions deliberately ask the AI to reconcile rather than
// ignore contradictions between claimed personality and actual stats —
// the whole point of including the stat block at all.
export function buildPersonalityPrompt(sheet: CharacterSheet, personality: PersonalityAnswers): string {
  const lines: string[] = [];

  lines.push(
    "Generate both a backstory and a portrait image for this Dungeons & Dragons character, " +
      "in this one response — don't ask any follow-up questions first.",
  );
  lines.push("");
  lines.push("CHARACTER SHEET (for grounding — reconcile against the personality section below)");
  lines.push(`Name: ${sheet.name}`);
  lines.push(`Species: ${sheet.subspeciesName ?? sheet.speciesName}`);
  lines.push(`Class: ${sheet.className}, Level ${sheet.level}`);
  lines.push(`Background: ${sheet.backgroundName}`);
  lines.push(`Ability Scores: ${abilityLine(sheet)}`);
  lines.push(`Trained Skills: ${trainedSkillsLine(sheet)}`);
  lines.push(`Passive Perception: ${sheet.passivePerception}`);
  lines.push("");
  lines.push("PERSONALITY & BACKSTORY (as described by the player)");
  for (const q of PERSONALITY_QUESTIONS) {
    lines.push(`${q.label}: ${personality[q.key]}`);
  }
  lines.push("");
  lines.push("INSTRUCTIONS");
  lines.push(
    "1. Write a short (2-4 paragraph) backstory in narrative prose, no more than 2000 characters.",
  );
  lines.push(
    "2. Generate a portrait image of this character — actually create it with your image " +
      "generation capability, don't just describe what it would look like. Use a square (1:1) " +
      "aspect ratio so it fits neatly in a circular profile frame. Base it on the species/class/" +
      "background above plus the Appearance Details below (physical features, gear, pose, " +
      "setting, mood).",
  );
  lines.push(
    "3. If anything in the personality/backstory section conflicts with the character's actual " +
      "stats or skills above (for example, a claimed skill they have no proficiency in), don't " +
      "ignore it — work the contradiction into the story in a flavorful way: self-perception, " +
      "exaggeration, a running joke, or an aspiration not yet earned.",
  );
  lines.push(
    '4. Categories marked "None" weren\'t given an answer — invent something fitting, or leave them out.',
  );

  return lines.join("\n");
}
