"use client";

import { useEffect, useRef, useState } from "react";

interface SectionNavProps {
  sections: { id: string; label: string }[];
}

export default function SectionNav({ sections }: SectionNavProps) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // PlaySheet builds `sections` as a fresh array literal every render, so
  // depending on the array reference itself would tear down and recreate
  // the observer on every unrelated state change anywhere in that large
  // component. This string is stable unless the actual set of sections
  // changes (e.g. a level-up unlocks Spells), which is the only time the
  // observer actually needs to be rebuilt.
  const sectionIds = sections.map((s) => s.id).join(",");

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Scroll-spy: highlight whichever section is currently passing through a
  // thin detection band near the top of the viewport (just below the
  // sticky nav itself), tracked incrementally since IntersectionObserver's
  // callback only reports entries that changed, not every observed
  // element — so a running Map of "currently intersecting" entries is
  // needed to correctly pick the topmost one at any given moment.
  useEffect(() => {
    const intersecting = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.set(entry.target.id, entry);
          else intersecting.delete(entry.target.id);
        }
        if (intersecting.size === 0) return;
        const topmost = [...intersecting.values()].reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds]);

  // Keeps the active pill visible within the nav's own horizontal scroll
  // — without this, scroll-spy could highlight an item currently scrolled
  // out of view, defeating the point. inline:"center" shifts the strip
  // sideways; block:"nearest" is there so this never also tries to
  // scroll the page vertically (the nav itself is always on-screen, so
  // "nearest" is always a no-op for the vertical axis).
  useEffect(() => {
    if (!activeId) return;
    buttonRefs.current[activeId]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeId]);

  return (
    <div className="sticky top-0 z-30 -mx-4 mt-4 border-y border-tavern-border bg-tavern-bg sm:-mx-8">
      <div className="relative">
        <div className="scrollbar-hide flex gap-2 overflow-x-auto px-4 py-2 sm:px-8">
          {sections.map((section) => (
            <button
              key={section.id}
              ref={(el) => {
                buttonRefs.current[section.id] = el;
              }}
              onClick={() => scrollTo(section.id)}
              className={`shrink-0 rounded-md border px-3 py-1 text-xs font-bold tracking-wide uppercase transition-colors ${
                activeId === section.id
                  ? "border-tavern-gold bg-tavern-card text-tavern-gold-light"
                  : "border-tavern-border text-tavern-muted hover:border-tavern-gold-light hover:text-tavern-gold-light"
              }`}
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
