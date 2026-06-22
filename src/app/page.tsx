import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="flex max-w-2xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="font-heading text-5xl font-bold tracking-wide text-tavern-gold sm:text-6xl">
            Tavern
          </h1>
          <p className="font-heading text-lg tracking-widest text-tavern-muted uppercase">
            D&D 5e Character Builder
          </p>
        </div>

        <p className="max-w-md text-xl leading-relaxed text-tavern-text">
          Build, save, and play your characters for free. All SRD content, no
          paywalls, no book purchases.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/builder"
            className="rounded-lg bg-tavern-oxblood px-8 py-3 font-heading text-sm font-bold tracking-widest text-tavern-parchment uppercase transition-colors hover:bg-tavern-oxblood-light"
          >
            Create a Character
          </Link>
          <Link
            href="/characters"
            className="rounded-lg border border-tavern-border px-8 py-3 font-heading text-sm font-bold tracking-widest text-tavern-muted uppercase transition-colors hover:border-tavern-gold hover:text-tavern-gold"
          >
            My Characters
          </Link>
        </div>

        <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Races", desc: "Choose your lineage" },
            { label: "Classes", desc: "Pick your path" },
            { label: "Spells", desc: "Browse the arcane" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-tavern-border bg-tavern-card p-5"
            >
              <h3 className="font-heading text-sm font-bold tracking-wider text-tavern-gold-light">
                {item.label}
              </h3>
              <p className="mt-1 text-sm text-tavern-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
