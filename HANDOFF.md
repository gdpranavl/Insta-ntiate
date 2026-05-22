# Handoff

## Current State
- The app is now a Next.js project with an app-router frontend and a local archive API at `/api/archive`.
- The Chrome extension can scrape the first two saved collections and the first five posts in each collection.
- The extension attempts to push the harvested archive directly to `http://localhost:3000/api/archive`.
- JSON export still exists as a fallback debug path.

## What Works
- `npm install`
- `npm run build`
- local archive persistence through `data/archive.json` during development
- ZIP and unpacked extension packaging under `downloads/` and `public/downloads/`

## What Is Fragile
- Instagram saved-page routes may vary by account/session
- DOM selectors for collections and posts are brittle
- creator/caption extraction depends on what Instagram exposes in DOM and metadata
- direct video URLs may be missing or ephemeral
- the extension currently uses hard-coded username fallback: `thegdpranavl`

## Last Significant Change
- Migrated the app from static HTML to Next.js
- Switched the primary flow from manual JSON import to direct extension-to-localhost archive push
- Changed scraping from shallow collection-page extraction to deeper post-detail extraction

## Recommended Next Step
- Run the Next app locally with `npm run dev`
- Reload the unpacked extension in Chrome
- Test one real saved reel flow end-to-end
- Inspect which creator/caption fields still come back empty
- Tune selectors or metadata parsing against the live Instagram DOM

## Validation Performed
- `npm install`
- `npm run build`
- `node --check extension\\background.js`
- `node --check extension\\content.js`
- `node --check extension\\popup.js`

## If Another Agent Picks This Up
- Start with `AGENTS.md`
- Then read `CONTEXT.md`, `SYSTEM_ARCHITECTURE.md`, `CHANGELOG.md`, and this file
- Trust the code over docs if there is drift, then repair the docs before finishing
