import Link from "next/link";

export default function Characters() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <h1 className="font-heading text-3xl font-bold tracking-wide text-tavern-gold">
          My Characters
        </h1>
        <p className="text-lg text-tavern-muted">
          Your saved characters will appear here once accounts and the character
          builder are live.
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
