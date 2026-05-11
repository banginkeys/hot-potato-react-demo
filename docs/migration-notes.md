# Hot Potato React Demo

This folder is the production-track React/Vite version of the player demo.

The original standalone HTML demo is still the reference file:

`C:\Users\Botman\Documents\Hot Potato\Test Dashboard\Game Demo\hot-potato-playable-demo-v9.html`

## Run Locally

From this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Then open:

`http://127.0.0.1:5173/`

If npm is blocked from writing to AppData inside Codex, use a local cache:

```powershell
npm.cmd install --cache .\.npm-cache
```

Inside the current Codex sandbox, Vite may still fail with `spawn EPERM` because Vite/esbuild tries to start helper processes. That is a sandbox restriction, not a project source error. On a normal local terminal, the same `npm.cmd run dev` command should start the app at port 5173.

## Asset Strategy

The Vite app uses the existing shared asset folder instead of duplicating large images and videos:

`C:\Users\Botman\Documents\Hot Potato\Test Dashboard\Game Demo\Assets`

That folder is mounted through `vite.config.js` as Vite's `publicDir`, so React can load assets like avatars, transparent potatoes, and ad videos from root-relative URLs.

## Current Scope

This is a first React port of the core player loop:

- new player avatar and username onboarding
- demo wallet connection
- rewarded ads for Tots
- converting Tots into Spud at Risk
- one active Hot Potato at a time
- hold/pass/explosion loop
- Spud Sac safety flow
- sponsor breaks while a potato keeps cooking
- equipment purchases and use
- SPUD activity readout
- contextual onboarding coach popups

The standalone v9 file still contains the richer one-file animation/sound experiments. Those can now be ported into React one feature at a time instead of continuing to grow the single HTML file.
