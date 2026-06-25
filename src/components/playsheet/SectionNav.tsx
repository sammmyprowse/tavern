"use client";

interface SectionNavProps {
  sections: { id: string; label: string }[];
}

export default function SectionNav({ sections }: SectionNavProps) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 mt-4 flex gap-2 overflow-x-auto border-y border-tavern-border bg-tavern-bg px-4 py-2 sm:-mx-8 sm:px-8">
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => scrollTo(section.id)}
          className="shrink-0 rounded-md border border-tavern-border px-3 py-1 text-xs font-bold tracking-wide text-tavern-muted uppercase hover:border-tavern-gold-light hover:text-tavern-gold-light"
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}
