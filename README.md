# Tavern

A free D&D 5e character builder. Build, save, and play your characters — all SRD content, no paywalls.

## Stack

- **Frontend:** Next.js (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
