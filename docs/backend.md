# Hot Potato Backend MVP

This demo uses Netlify Functions for a small server layer and Supabase/Postgres for persistence.

## What It Stores First

- Friend-sent social potatoes.
- Whether a social potato link has already been claimed.
- Sender name and intended target handle/name.
- Real player profiles.
- Friend links between players.
- Hidden message text for Pigeon Potatoes.

This is intentionally small. The current player wallet, SPUD pile, gear, and tutorial progress still run locally in the browser demo.

## Netlify Environment Variables

Set these in Netlify under Site configuration -> Environment variables:

```text
SUPABASE_URL=your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
PUBLIC_SITE_URL=https://your-netlify-site.netlify.app
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in React code. It belongs only in Netlify environment variables.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run `supabase/schema.sql` from this repo.
4. Copy the project URL and service role key into Netlify environment variables.
5. Redeploy the Netlify site.

## Endpoints

`GET /.netlify/functions/backend-health`

Returns whether Supabase is configured.

`POST /.netlify/functions/players-upsert`

Creates or updates the current demo player's public profile.

```json
{
  "id": "stable-browser-player-id",
  "username": "SpudRunner",
  "avatarId": 2,
  "wallet": "0xSPUD...DEMO"
}
```

`GET /.netlify/functions/players-list?playerId=<player-id>`

Returns only the current player's friends. No fake users or global player directory entries are returned.

`GET /.netlify/functions/players-search?q=<username>&playerId=<player-id>`

Searches real usernames so the current player can add a friend.

`POST /.netlify/functions/friends-add`

Adds a mutual friend link.

```json
{
  "playerId": "current-player-id",
  "friendId": "other-player-id"
}
```

`POST /.netlify/functions/social-potatoes-create`

Creates a shareable friend potato link.

```json
{
  "kind": "pigeon",
  "fromName": "SpudRunner",
  "targetHandle": "@real-friend-abc12",
  "targetName": "RealFriend",
  "message": "This note pops out when the potato resolves."
}
```

`GET /.netlify/functions/social-potatoes-claim?id=<uuid>`

Claims a friend potato link once and returns the potato type to the game.

## Local Behavior

When Supabase is not configured, the frontend keeps using the older URL-only demo links. That means local testing still works, but deployed friend links only become reliable after Supabase is connected.
