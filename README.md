# Hot Potato React Demo

Player-facing Hot Potato demo with a Vite/React frontend, Netlify Functions backend, and Supabase persistence for real player profiles and friend-sent potatoes.

## Local Development

```powershell
npm install
npm run dev
```

The local app runs at `http://127.0.0.1:5173/`.

## Production Build

```powershell
npm run build
```

Netlify should build the project from this repo root.

## Netlify Settings

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The functions directory is also defined in `netlify.toml`.

## Required Environment Variables

Set these in Netlify:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PUBLIC_SITE_URL=
```

Do not commit real `.env` files. `.env.example` is safe to commit.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor before expecting real players or social potatoes to work.
