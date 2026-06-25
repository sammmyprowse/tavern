"use client";

interface SectionNavProps {
  sections: { id: string; label: string }[];
}

export default function SectionNav({ sections }: SectionNavProps) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 mt-4 border-y border-tavern-border bg-tavern-bg sm:-mx-8">
      <div className="relative">
        <div className="scrollbar-hide flex gap-2 overflow-x-auto px-4 py-2 sm:px-8">
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
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-tavern-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-tavern-bg to-transparent" />
      </div>
    </div>
  );
}
