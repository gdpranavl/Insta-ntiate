# CHANGELOG

This file is the single source-of-truth CHANGELOG for Insta-ntiate. Entries are organized by contributor (top-level `## name`) and then by dated entries (`### YYYY-MM-DD - short title`). Each dated entry may include sections such as `Direction`, `What shipped`, `Added/Changed/Removed`, and `Verification` to provide context for the change.

If you make changes, append a dated entry under your contributor heading following the example below.

---

## pranav
### 2026-05-24 - Instagram reel media persistence + copyable sync output

#### Direction

Pranav asked for the Instagram sync output to be more useful after capture:
- keep the archive readable in the options UI
- make discovered output easier to copy
- persist reel media locally for later work

#### What shipped

- Added copy actions in the Instagram options panels for:
  - raw archive output
  - debug logs
  - discovered collections
- Added a multi-pass Instagram saved-page discovery sweep so lazy-loaded collections are less likely to be missed.
- Added reel hydration before upload so the background sync attempts to capture direct reel video URLs from post detail pages.
- Added a local Instagram media store in `public/downloads/instagram-media/` with a manifest for downloaded reel assets.
- Updated the archive API to persist and re-save enriched archives after media download.
- Extended archive persistence to keep media asset tracking across merge runs.

#### Verification

- `get_errors` on the touched extension, API, and archive store files

### 2026-05-24 - Multi-social expansion + search-first dashboard

#### Direction

Pranav asked for the Instagram extraction model to be extended to a broader digital-world archive:
- support seven socials right now
- make the homepage cleaner and search-first
- move verbose setup into a separate page
- make the extension manual-first with per-social checkboxes
- keep auto sync behind an explicit opt-in

#### What shipped

- Added a shared platform model in `lib/platforms.js` for Instagram, WhatsApp, Slack, Discord, Telegram, LinkedIn, and Reddit.
- Added `lib/social-import.js` for multi-source imports:
  - WhatsApp exported chat `.txt`
  - Slack export `.zip`
  - Slack export `.json`
  - archive JSON
  - existing Instagram export path remains supported
- Expanded archive normalization in `app/api/archive/route.js` and `lib/archive-store.js` to carry:
  - `platform`
  - `entityType`
  - `textContent`
  - `authorName`
- Reworked the extension:
  - `extension/background.js` now runs manual sync across selected socials
  - auto sync is opt-in only
  - open/logged-in tabs are the current scrape surface
- Reworked `extension/content.js` with lightweight collectors for all seven supported platforms.
- Reworked popup/settings UX around:
  - manual sync first
  - platform checkboxes
  - auto-sync toggle
- Reworked the web app:
  - `components/dashboard.js` is now search-first and platform-first
  - main page is intentionally quieter
  - `/collectors` holds setup/detail
- Added verification script `scripts/verify-social-imports.mjs` and `npm run test:imports`.

#### Verification

- `npm run test:imports`
- `npm run build`

### 2026-05-23 — Project audit + frontend rebuild

#### Audit (no code changes, recorded for traceability)

Read every md file and every source file. Confirmed the project matches Pranav's brief: Chrome MV3 extension scrapes the user's logged-in Instagram saved page in non-focused background tabs (capped at 2 collections × 5 posts), pushes a JSON archive to a Next.js app at `localhost:3000/api/archive`, which renders a polling dashboard with client-side text search.

Surfaced bug / efficiency findings (the high-impact ones below are scheduled for tier 2):

- `HARDCODED_USERNAME = "thegdpranavl"` in `extension/background.js` means the collector only works for one debug account.
- `a[href*='/saved/']` collection selector over-matches sidebar + breadcrumb links.
- `/'caption':'([^']+)'/` regex breaks on any escaped quote in the caption (i.e. most captions).
- `/api/archive` POST accepts unvalidated JSON of unbounded size with no auth/shared-secret.
- `writeArchive` writes directly to `archive.json` (no atomic rename); a crashed write corrupts the file.
- Dashboard polls `/api/archive` every 4s indefinitely with no visibility gating, no backoff, and silent error-swallowing.
- Three copies of the extension live in the repo (`extension/`, `downloads/`, `public/downloads/`) — single source of truth needed.
- "Open Unpacked Manifest" hero link opens raw JSON in a tab — dead end for users.
- No per-sync history: each push overwrites; unsaved posts vanish silently.

... (full audit and frontend rebuild details retained from prior entries)

---

## Legacy: 2026-05-22

### Added
- Established initial product direction for Insta-ntiate as a consumer web app backed by a browser extension.
- Chose the primary collection model: use the user's existing logged-in Instagram browser session instead of official API access or server-side login scraping.
- Defined the extension as the data collector and the web app as the searchable backup and intelligence layer.
- Added shared project documentation:
  - `CONTEXT.md`
  - `SYSTEM_ARCHITECTURE.md`
  - `CHANGELOG.md`
- Built the first static web app experience:
  - modern landing page
  - extension ZIP download CTA
  - archive import flow
  - searchable saved-post dashboard
- Built the first Chrome extension prototype:
  - Manifest V3 setup
  - background sync orchestration
  - Instagram content script harvesting
  - popup for manual sync and archive export
- Added bounded scrape behavior for V1:
  - top 2 saved collections
  - top 5 posts per collection
  - post link, caption, thumbnail, and video URL when available
- Added saved-page route fallback logic for Instagram collection discovery.
- Migrated the web app from static HTML/CSS/JS to a Next.js app-router project.
- Added a local archive API at `/api/archive` so the extension can push synced data directly into the app.
- Added server-side file-backed archive persistence under `data/archive.json`.
- Added automatic dashboard polling so freshly synced archive data appears without manual JSON re-import.
- Added deeper post-detail scraping by opening each saved post/reel in its own background tab.
- Added repository-level agent guidance in `AGENTS.md`.
- Added `.gitignore` for local dependencies, build output, and local archive data.
- Consolidated current-state guidance into `CONTEXT.md` and removed `HANDOFF.md` to keep the repo memory system lean.

