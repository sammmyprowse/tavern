"use client";

import { useState } from "react";
import {
  PERSONALITY_QUESTIONS,
  type PersonalityAnswers,
  type PersonalityQuestion,
} from "@/lib/personality";

const GROUPS: PersonalityQuestion["group"][] = ["Personality", "Backstory", "Appearance"];

function QuestionRow({
  question,
  value,
  onChange,
}: {
  question: PersonalityQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const isCustomValue = value !== "None" && !question.options.includes(value);
  // Separate from isCustomValue so clicking "Write your own…" opens the
  // input immediately, before anything has been typed — committing an
  // empty draft through the parent's `value || "None"` fallback would
  // otherwise collapse isCustomValue back to false and hide the input
  // before the player gets a chance to type anything.
  const [editingCustom, setEditingCustom] = useState(isCustomValue);
  const [customDraft, setCustomDraft] = useState(isCustomValue ? value : "");
  const showCustomInput = editingCustom || isCustomValue;

  return (
    <div className="border-t border-tavern-border pt-4 first:border-t-0 first:pt-0">
      <h4 className="font-heading text-sm font-bold tracking-wide text-tavern-gold-light">
        {question.label}
      </h4>
      {question.note && <p className="mt-1 text-xs text-tavern-muted">{question.note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {[...question.options, "None"].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setEditingCustom(false);
              onChange(option);
            }}
            className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
              !showCustomInput && value === option
                ? "border-tavern-gold bg-tavern-bg text-tavern-text"
                : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
            }`}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEditingCustom(true)}
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
            showCustomInput
              ? "border-tavern-gold bg-tavern-bg text-tavern-text"
              : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light"
          }`}
        >
          Write your own…
        </button>
      </div>
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
          className="mt-2 w-full rounded-md border border-tavern-border bg-tavern-bg px-3 py-2 text-sm text-tavern-text placeholder:text-tavern-muted/50"
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
          <div className="mt-3 space-y-4">
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
