"use client";

import { useState } from "react";
import {
  PERSONALITY_QUESTIONS,
  type PersonalityAnswers,
  type PersonalityQuestion,
} from "@/lib/personality";

const GROUPS: PersonalityQuestion["group"][] = ["Personality", "Backstory", "Appearance"];

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? "border-tavern-gold bg-tavern-bg text-tavern-text"
          : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
      }`}
    >
      <span
        className={`h-3 w-3 flex-shrink-0 rounded-full border ${
          selected ? "border-tavern-gold bg-tavern-gold" : "border-tavern-border"
        }`}
      />
      {label}
    </button>
  );
}

function QuestionRow({
  question,
  value,
  onChange,
}: {
  question: PersonalityQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  // `mode` is decided ONCE at mount from the incoming value, then only
  // ever changed by an explicit click — never re-derived from `value` on
  // later renders. It has to work this way: once a detail gets folded
  // into the committed string (see changeDetail below), that combined
  // text no longer matches any curated option verbatim. Re-checking
  // "does value match a curated option" on every render would flip mode
  // to "custom" the instant the player typed the first character of a
  // detail, wiping out the detail input and showing an empty custom box
  // instead (a real bug caught live — see CLAUDE.md).
  const initialIsCustom = value !== "None" && !question.options.includes(value);
  const [mode, setMode] = useState<"picked" | "custom">(initialIsCustom ? "custom" : "picked");
  const [pickedOption, setPickedOption] = useState(initialIsCustom ? "None" : value);
  const [detail, setDetail] = useState("");
  const [customDraft, setCustomDraft] = useState(initialIsCustom ? value : "");

  const showCustomInput = mode === "custom";
  const showDetailInput = mode === "picked" && pickedOption !== "None";

  function selectOption(option: string) {
    setMode("picked");
    setPickedOption(option);
    setDetail("");
    onChange(option);
  }

  function startCustom() {
    setMode("custom");
  }

  function changeDetail(text: string) {
    setDetail(text);
    onChange(text.trim() ? `${pickedOption} Specifically: ${text.trim()}` : pickedOption);
  }

  return (
    <div className="rounded-lg border border-tavern-border bg-tavern-bg/40 p-4">
      <h4 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">
        {question.label}
      </h4>
      {question.description && (
        <p className="mt-1 text-xs text-tavern-muted">{question.description}</p>
      )}
      <div className="mt-3 space-y-1.5">
        {[...question.options, "None"].map((option) => (
          <OptionRow
            key={option}
            label={option}
            selected={!showCustomInput && pickedOption === option}
            onClick={() => selectOption(option)}
          />
        ))}
        <OptionRow label="Write your own…" selected={showCustomInput} onClick={startCustom} />
      </div>
      {showDetailInput && (
        <input
          type="text"
          value={detail}
          onChange={(e) => changeDetail(e.target.value)}
          maxLength={150}
          placeholder="Add specifics — who, what, where? (optional)"
          className="mt-2 ml-[1.4rem] w-[calc(100%-1.4rem)] rounded-md border border-tavern-border bg-tavern-bg px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
        />
      )}
      {showCustomInput && (
        <input
          type="text"
          autoFocus
          value={customDraft}
          onChange={(e) => {
            setCustomDraft(e.target.value);
            onChange(e.target.value);
          }}
          maxLength={300}
          placeholder="Write your own…"
          className="mt-2 ml-[1.4rem] w-[calc(100%-1.4rem)] rounded-md border border-tavern-border bg-tavern-bg px-3 py-1.5 text-sm text-tavern-text placeholder:text-tavern-muted/50"
        />
      )}
    </div>
  );
}

interface PersonalityQuestionnaireProps {
  personality: PersonalityAnswers;
  onChange: (key: keyof PersonalityAnswers, value: string) => void;
}

// Shared by the builder's PersonalityStep and the play sheet's editable
// CharacterPersonality section — same question set and interaction model
// in both places, just different surrounding chrome (gate screen + Next
// button in the builder, an Edit/Save toggle on the play sheet).
export default function PersonalityQuestionnaire({ personality, onChange }: PersonalityQuestionnaireProps) {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <div key={group}>
          <h3 className="font-heading text-xs font-bold tracking-wider text-tavern-muted uppercase">
            {group}
          </h3>
          <div className="mt-3 space-y-3">
            {PERSONALITY_QUESTIONS.filter((q) => q.group === group).map((q) => (
              <QuestionRow
                key={q.key}
                question={q}
                value={personality[q.key]}
                onChange={(value) => onChange(q.key, value)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
