@AGENTS.md

# Tavern — D&D 5e Character Builder

## Stack
- Next.js (App Router, TypeScript), Tailwind CSS v4, Supabase (PostgreSQL)
- Hosted on Vercel, repo at github.com/sammmyprowse/tavern

## Design
- Dark parchment aesthetic: bg #0f1215, gold #b9933f, oxblood #7c241a
- Cinzel for headings (font-heading), EB Garamond for body (font-body)
- Every interactive element opens a detail panel explaining the rules
- Mobile-first: phone tab bar at ≤600px, no horizontal overflow

## Key conventions
- AC is dynamic (computed from equipped gear, never stored flat)
- Weapon masteries (Topple/Vex/Graze) are a core feature
- Client state in localStorage (play sheet), character data in Supabase
- SRD content from 5e-database project — open licence, free to use

## Supabase
- Project ref: xvqcirkatcetasluvmyb (Sydney ap-southeast-2)
- Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
