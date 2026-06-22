import Link from "next/link";

export default function Builder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
          Character Builder
        </h1>
        <p className="text-lg text-tavern-muted">
          The step-by-step character creator is coming soon. Race, class,
          abilities, background — all the choices, explained as you go.
        </p>
        <Link
          href="/"
          className="font-heading text-sm tracking-widest text-tavern-gold-light uppercase hover:text-tavern-gold"
        >
          &larr; Back to Tavern
        </Link>
      </div>
    </div>
  );
}
