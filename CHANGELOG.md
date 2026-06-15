# Changelog

## 2026-06-16 — Extension: stop opening a tab per saved post

### Fixed
- The collector opened a brand-new background tab for every collection and every
  post — up to ~500 tabs per sync, which is slow and looks broken. It now reuses a
  single background "worker" tab, navigating it from page to page (`navigateTab`).
- A collection or post that fails to scrape is now skipped and recorded as a
  warning instead of aborting the whole sync.
- Rebuilt both packaged extension copies and zips.

### Verified
- Full web-app test pass: 14/14 API checks (including live Claude search and
  image-summarize) and 7/7 dashboard UI interactions, with no console errors.

## 2026-06-15 — Monochrome (black & white) theme

### Changed
- Recolored the entire web UI to black & white. `globals.css` now uses a white
  background (removed the warm cream/teal/orange gradient wash) and grayscale theme
  variables; `page.module.css` had 52 teal/orange/amber/red values replaced with
  grayscale equivalents (buttons, tabs, chips, the AI search bar, reel badges, stat
  bars, banners). Saved post thumbnails stay in color — they are archived content.
- Recolored the app icon to black & white (black squircle, white "i"/ribbon/spark);
  re-rendered the extension PNGs and rebuilt both packaged copies + zips.
- The in-app header logo now renders the icon (`app/icon.svg`) instead of the old
  "IN" gradient badge.

## 2026-06-15 — Branding: app icon & README

### Added
- New app icon — a mark fusing the letter "i", a bookmark (the save action), and a
  spark dot, on a charcoal squircle with a cream ribbon and a pink accent. Added
  `app/icon.svg` (web-app favicon) and `extension/icon.svg` with rendered PNGs at
  16/32/48/128 under `extension/icons/`. Wired `icons` + `action.default_icon` into
  the extension manifest and both packaged copies; rebuilt both extension `.zip`s.

### Fixed
- `README.md` was stored as UTF-16 and rendered as garbled, spaced-out text on
  GitHub. Rewritten as proper UTF-8 with setup, run, and extension-loading docs.

## 2026-06-15 — Full-repo audit & fixes

A full audit (install / build / lint / run) and code review was run across the
web app and extension. Changes:

### Security
- Stopped tracking `.env.local` (it had been committed with a live
  `ANTHROPIC_API_KEY`) and added `.env*` to `.gitignore`. **The previously
  committed key should be rotated** — it still exists in git history.

### Fixed
- **Broken `lint` script** — Next 16 removed `next lint`. Migrated to the ESLint
  CLI: added `eslint` + `eslint-config-next` flat config (`eslint.config.mjs`) and
  changed the script to `eslint .`. Fixed 2 `react/no-unescaped-entities` errors.
- **Hydration mismatch** on the "Last Sync" card — the server rendered 24-hour
  time and the client rendered locale 12-hour time. Added `suppressHydrationWarning`
  to the timestamp.
- **Broken downloadable extension** — the distributed copies under
  `public/downloads/` and `downloads/` were stale (new `popup.js` paired with old
  `popup.html`, so the popup crashed; also missing the endpoint settings + port
  scan). Re-synced both unpacked copies and rebuilt both `.zip`s from `extension/`.
- **API routes hardened** — `search`, `summarize`, `archive`, and `notes` now
  return `400` on malformed JSON instead of a `500`; the Claude calls in
  `search`/`summarize` are wrapped and return `502` with a message on failure; the
  `summarize` JSON-parse fallback no longer re-throws on an empty/non-text response.
- **Polling no longer clobbers in-flight edits** — the 4s archive poll pauses
  while a note is being edited or a (bulk) summarize is running.
- **Date-range filter** — the `To` date now includes posts on the end-of-day
  boundary (previously excluded by an ISO millisecond string comparison).
- **CSV export** — neutralized spreadsheet formula injection (leading `= + - @`).
- **Atomic archive writes** — `writeArchive` writes a temp file then renames, so a
  concurrent reader never sees a half-written `archive.json`.
- AI search now surfaces a real error instead of `undefined` on a non-OK response;
  entering "Similar" mode clears any active AI search.
- Corrected the `extension/background.js` archive note (it still said "first two
  collections and first five posts"; actual limits are 20 / 25).

### Docs
- Rewrote `README.md` (was UTF-16 and effectively empty) with setup, run, and
  extension-loading instructions.
- Fixed `AGENTS.md` doc links that pointed at non-existent `/D:/YouLeft/` paths.

### Config
- Pinned `turbopack.root` in `next.config.mjs` to silence the multiple-lockfile
  workspace-root warning.

### Known / not changed
- `npm audit` reports 2 moderate `postcss` advisories, but they come from Next 16's
  own bundled `postcss`; the only `npm audit fix --force` path downgrades Next to
  v9, so they are left as-is until Next bumps the dependency.
- `patchPost` still has a read-modify-write race under truly concurrent writes,
  which is acceptable for the local single-user dev flow.

## 2026-06-15

### Added
- **AI natural language search** — orange search bar below the main toolbar. Describe what you want in plain English; Claude Haiku ranks matching posts. Robust parsing strips markdown fences and validates all returned IDs against the live archive so hallucinated IDs never surface.
- **Collection filter** — dropdown next to creator filter; filters cards to a single saved collection using existing membership data (was always available in the data, just had no UI).
- **Find Similar** — "Similar" button on each card; finds posts with overlapping semantic tags sorted by match count. Exit via the banner button.
- **Personal notes** — "Add note" / "Edit note" inline textarea per card; saved to the archive via `/api/notes` and persisted in `data/archive.json`.
- **Date range filter** — From/To date pickers filter cards by their `capturedAt` timestamp.
- **Export filtered results** — Export JSON and Export CSV buttons download the current filtered view (respects AI search, similar mode, and all other active filters).
- **Stats tab** — Archive / Stats tab pair. Stats panel shows total count, reels vs static breakdown, unique creators, top-10 creators by post count, top-15 hashtags, and top-15 AI semantic topics as horizontal bar charts.
- **Context-aware empty states** — distinct messages for: no archive, no AI matches, no similar posts, no keyword matches.
- `POST /api/search` — natural language search route using Claude Haiku; returns post IDs ranked by relevance.
- `POST /api/notes` — saves a personal note to a post via `patchPost`.

### Fixed
- **Extension saved-posts bug** — removed hardcoded `thegdpranavl/saved/` URL from the sync candidate list. Anyone not logged in as that account would fail on the first attempt every time. New order: `your_activity/interactions/saved/` first (correct modern URL), then `/saved/` as legacy fallback.
- **Extension default endpoint** — changed from `localhost:3000` to `localhost:3001` to match the actual Next.js dev server port.
- **Extension manifest host permissions** — added `localhost:3001` and `localhost:3002` so the extension can push regardless of which port Next.js picks.
- **Keyword search now includes notes** — personal note text is included in the keyword search index.
- **Search/sort disabled in AI and similar modes** — keyword input and sort dropdown grey out to avoid confusing mixed-state results.

## 2026-05-24

### Fixed
- Fixed React hydration mismatch warning caused by browser extensions (Kantu, Scribe Recorder) injecting `data-kantu` and `data-scribe-recorder-ready` attributes into the `<html>` tag. Added `suppressHydrationWarning` to the root `<html>` element in `app/layout.js`.

### Changed
- Removed hardcoded `HARDCODED_USERNAME = "thegdpranavl"` from the extension. The extension now detects the actual logged-in Instagram user's username dynamically before syncing.

### Added
- Added login detection to the extension sync flow. Before scraping saved collections, the extension opens `instagram.com` in a background tab and checks if the user is logged in via a new `CHECK_LOGIN` content script handler. If the user is not logged in, the extension opens `instagram.com/accounts/login/` in a foreground tab and surfaces a clear error in the popup.
- Added `checkLoginStatus()` and `readViewerUsername()` functions to `content.js` to read the logged-in username from Instagram's embedded page JSON.
- Added `checkInstagramLogin()` to `background.js` to orchestrate the login check before any sync attempt.
- Added auto port-discovery to `pushArchiveToApp()`. The extension now tries ports 3000 → 3001 → 3002 → 3003 in sequence when pushing the archive to the Next.js app. The first successful port is saved to settings for subsequent syncs. This fixes the common case where Next.js starts on 3001 because 3000 is in use.
- Added `SET_APP_ENDPOINT` message handler to `background.js` and a `setAppEndpoint()` function so the popup can update the target URL.
- Added an app endpoint input field and Save button to the extension popup so users can manually override the target URL (e.g. change 3000 → 3001) without editing code.
- Synced all extension changes to `public/downloads/insta-ntiate-extension-unpacked/` for distribution.

### Decided
- The sync flow must always verify Instagram login status before attempting to scrape. Silent failures due to logged-out sessions are not acceptable.
- The app endpoint should be auto-discovered by port scanning rather than requiring manual configuration.
- The extension popup should expose the current app endpoint and allow users to override it.

### Open Questions
- Whether we should build Phase 1 content enrichment: full caption extraction (no 500-char limit), hashtag extraction, URL extraction from captions, "link in bio" → profile bio link scrape, and `postDate` from JSON-LD.
- Whether to build Phase 2 transcription: pass reel video URLs to OpenAI Whisper or AssemblyAI while CDN URLs are still fresh, store transcripts alongside posts in the archive.
- Instagram CDN video and thumbnail URLs are signed and expire within hours — whether to download and persist media blobs at sync time via `chrome.downloads` or a backend endpoint.

## 2026-05-22

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

### Decided
- The product is for personal Instagram users managing their own accounts.
- The product should prioritize backup, search, and rediscovery of saved and liked Instagram content.
- Real-time or near-real-time sync is preferred over manual import flows.
- A standalone mobile app is not the starting point; the initial build should center on a web app.
- Server-side login scraping is not the primary architecture because it introduces higher account-risk, infrastructure complexity, and trust/security concerns.
- Instagram data export is a fallback and backfill option, not the main user flow.
- The first implementation should be static-first rather than blocked on a backend stack.
- The current local development flow should use Next.js on `localhost:3000` as the primary experience.

### Open Questions
- Whether Instagram likes are practically capturable in the same way as saved posts from the browser session.
- How much sync can be automated from the extension without disrupting the user's browser experience.
- Whether background sync should run only while the browser is open or also on explicit user-triggered sync.
- What level of media capture is needed for V1:
  - metadata only
  - thumbnails
  - direct media files
  - transcript/OCR/visual embeddings
- What legal and operational posture the team wants around scraping resilience and breakage response.
- Which Instagram selectors and routes need to be updated after testing against a real user session.
- Whether we should make the app endpoint configurable beyond the current localhost default.
