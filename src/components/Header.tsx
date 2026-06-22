import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { signOut } from "@/app/login/actions";

export default async function Header() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between border-b border-tavern-border px-6 py-4">
      <Link href="/" className="font-heading text-lg font-bold tracking-wide text-tavern-gold">
        Tavern
      </Link>

      {data.user ? (
        <div className="flex items-center gap-4">
          <Link
            href="/characters"
            className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-gold-light"
          >
            My Characters
          </Link>
          <span className="text-sm text-tavern-muted">{data.user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="font-heading text-xs tracking-widest text-tavern-muted uppercase hover:text-tavern-oxblood-light"
            >
              Sign Out
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="font-heading text-xs tracking-widest text-tavern-gold-light uppercase hover:text-tavern-gold"
        >
          Sign In
        </Link>
      )}
    </header>
  );
}
