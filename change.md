# change.md

This file is the running log of platform changes. Each top-level section is the person whose request drove the change. Within a section, entries are dated and grouped by area.

If you make changes on behalf of someone new, add a new top-level section. If you make changes on behalf of an existing person, append to their section.

---

## harshita
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

Read every md file and every source file. Confirmed the project matches Harshita's brief: Chrome MV3 extension scrapes the user's logged-in Instagram saved page in non-focused background tabs (capped at 2 collections × 5 posts), pushes a JSON archive to a Next.js app at `localhost:3000/api/archive`, which renders a polling dashboard with client-side text search.

Surfaced bug / efficiency findings (the high-impact ones below are scheduled for tier 2):

- `HARDCODED_USERNAME = "thegdpranavl"` in `extension/background.js` means the collector only works for one debug account.
- `a[href*='/saved/']` collection selector over-matches sidebar + breadcrumb links.
- `/"caption":"([^"]+)"/` regex breaks on any escaped quote in the caption (i.e. most captions).
- `/api/archive` POST accepts unvalidated JSON of unbounded size with no auth/shared-secret.
- `writeArchive` writes directly to `archive.json` (no atomic rename); a crashed write corrupts the file.
- Dashboard polls `/api/archive` every 4s indefinitely with no visibility gating, no backoff, and silent error-swallowing.
- Three copies of the extension live in the repo (`extension/`, `downloads/`, `public/downloads/`) — single source of truth needed.
- "Open Unpacked Manifest" hero link opens raw JSON in a tab — dead end for users.
- No per-sync history: each push overwrites; unsaved posts vanish silently.

Architecture alternatives surfaced for later decision: hybrid extension + Instagram Data Export bootstrap (recommended), bookmarklet "lite mode" for zero-install users, desktop app (Tauri/Electron) to remove the visible-tab UX problem, PWA + Web Share Target as a mobile companion. Recommendation: keep extension as primary collector; treat collectors as pluggable, invest the next dev cycle in the search / rediscovery layer.

#### Frontend rebuild — replaced the dashboard, landing, and global styles

Goal: drop the "warm-terracotta Arial" prototype look and ship a cinematic, motion-driven, dark-default UI with real onboarding, real empty states, and the kind of interaction polish a personal-archive product needs.

- `app/globals.css` — full rewrite. Design tokens, Geist via `next/font`, aurora + grain, motion keyframes, base typography.
- `app/layout.js` — Geist Sans/Mono wired in.
- `app/page.module.css` — new layout grid, hero with floating glow, sync-health pill, masonry grid, lightbox.
- `components/dashboard.js` — live relative-time, sync-health pill, ⌘K, filter chips, masonry preserving aspect ratios, lightbox, three-card onboarding empty state, visibility-gated polling with 4s/12s/60s backoff, demo-data extracted to public/.

---

### 2026-05-23 — Plan reset: zero-install collectors, extension demoted

Harshita pushed back on the previous rebuild: the extension is still presented as the primary path, and "if a user can download a ZIP and load an unpacked extension, they can manually check their reels." Friction has to be lower than the behavior the product replaces, otherwise it loses.

Also surfaced: the 2 collections × 5 posts cap I had been quoting back as if it were intentional was just a debug constant. Real product = user picks scope.

Confirmed direction with Harshita:
- Front door = web app, not extension. Bookmarklet (desktop) + PWA share target (mobile) + IG data export upload as the three zero-install collectors.
- Extension stays as opt-in for *scheduled background sync*, hidden under "Advanced."
- Scope is user-controlled: user picks which collections, per-collection caps, total cap.
- Hosting decision deferred but every piece (origin, CORS, archive endpoint) is now config-driven so a hosted deploy is a config flip, not a rewrite.
- Video understanding (transcripts, OCR, embeddings) is the killer feature later — for now, only the schema hooks are in place (`enrichments` field on every post, stub `/api/enrich` returning 501). No backend cost or complexity until we want it.

#### What was built this pass

Whole-codebase rewrite. Logged here as a single shipment.

**New libraries / endpoints**

- `lib/config.js` — `getAppOrigin()`, `getArchiveEndpoint()`, `getBookmarkletEndpoint()`, `getCorsAllowlist()`, `corsHeaders(origin)`, `MAX_ARCHIVE_BYTES`. Driven by `NEXT_PUBLIC_APP_ORIGIN` / `APP_ORIGIN` env vars, defaults to `http://localhost:3000`. **One file to flip when we host.**
- `lib/archive-store.js` — atomic writes (write to `.tmp-pid-timestamp`, then `rename`), `mergeIntoArchive()` (deduplicates posts by id, merges memberships, preserves enrichments across syncs), `emptyArchive()`, `mergeArchives()`. Solves the "each sync overwrites and unsaved posts vanish" bug.
- `lib/bookmarklet-source.js` — exports `getBookmarkletSource({ apiUrl, appUrl })` (raw JS) and `getBookmarkletHref(...)` (minified, URL-encoded, ready for `<a href="javascript:...">`). Source is one file; the `/api/bookmarklet` route and `app/page.js` both read it so they can't drift.
- `lib/ig-data-export.js` — parses Instagram's official data export. Accepts the full ZIP (uses `fflate` to extract `saved_posts.json` + `saved_collections.json` regardless of nesting) OR a raw JSON if user pre-extracted. Normalises into the same archive shape the rest of the app uses.
- `app/api/archive/route.js` — full rewrite. CORS preflight via `OPTIONS`. Allowlist set to current origin + `https://www.instagram.com` + `https://instagram.com` so the bookmarklet (running on IG) can POST. Payload validation: rejects non-objects, oversized bodies (10 MB cap), invalid JSON. Honors `X-Instantiate-Mode: merge` for incremental adds vs full replace. Adds `enrichments: {}` to incoming posts that don't have it.
- `app/api/bookmarklet/route.js` — serves the bookmarklet JS as `application/javascript`. URL baked at runtime from `lib/config`.
- `app/api/share/route.js` — PWA Share Target receiver. Accepts `multipart/form-data`, `application/x-www-form-urlencoded`, or JSON. Validates the URL is an Instagram post/reel, extracts the shortcode, merges into the archive, then HTTP 303 redirect to `/?shared=ok&id=...`. On invalid input, redirects to `/?shared=invalid`.
- `app/api/import/route.js` — accepts the user's IG data export upload. Cap 80 MB. Routes through `parseExportPayload()`. Defaults to merge mode (won't blow away an existing archive).
- `app/api/enrich/route.js` — stub returning HTTP 501 with `{ plannedFeatures: ["audio-transcript", "ocr", "scene-tags", "embeddings"] }`. Schema hook for future video understanding. Costs nothing today.

**PWA scaffolding**

- `app/manifest.js` — Next 16's `manifest` metadata convention. Defines `share_target: { action: "/api/share", method: "POST", params: { url, title, text } }`, `display: "standalone"`, dark theme color, plus a `shortcuts` entry for "Rediscover" (lands on `?rediscover=1`).
- `app/icon.svg` — gradient brand icon, used by the manifest.
- `public/sw.js` — minimal service worker. Caches the shell, network-first for /, leaves /api/* uncached. Required for the install prompt to qualify on Chrome.
- `app/layout.js` — inlines a tiny boot script that reads `localStorage.instantiate-theme` and applies `data-theme` to `<html>` before paint (no flash). Registers `/sw.js` on load. Adds `viewport` export with `themeColor`.

**Bookmarklet collector (the desktop zero-install path)**

The bookmarklet is generated from `lib/bookmarklet-source.js`. The dashboard renders a draggable `<a href="javascript:…">` element so the user drags it once to their bookmarks bar; clicking it shows a "drag me instead" hint.

On click on Instagram, the bookmarklet:
- Detects whether the user is on the saved overview, inside a collection, or on a single post — different UI per page kind.
- Injects a Shadow-DOM floating panel (so Instagram's CSS can't bleed in, and our CSS can't pollute the page).
- On the saved overview: shows the discovered collections with a "select all" toggle and individual checkboxes. User picks scope, hits "Save selected." Posts are then captured the next time the user opens each collection and clicks the bookmark again.
- Inside a collection: previews how many posts are visible, "Save N posts" button.
- On a single post: captures the OG metadata, "Save to archive."
- Live progress bar + log during the POST.
- POSTs with `X-Instantiate-Mode: merge` so multi-page click-throughs build up the archive cumulatively.
- Honest about Instagram being a heavy SPA: doesn't try to navigate behind the user's back; the picker is honest about "this page" being the scope.

**IG Data Export path**

Drop-zone on the empty dashboard accepts the user's `username_data.zip` (or `saved_posts.json`). Parsed by `lib/ig-data-export.js` (`fflate` for ZIP extraction). Merges into the archive. No extension, no scraping, official path, complete historical coverage.

**Extension — demoted + de-hardcoded + de-capped**

- `extension/manifest.json` — version bumped to 0.2.0. Added `options_ui` so the settings page opens in a tab. Loosened `host_permissions` to allow any localhost port.
- `extension/background.js` — complete rewrite. **No more `HARDCODED_USERNAME`** — `detectUsername()` visits `https://www.instagram.com/` in a background tab and reads `"viewer":{"username":"…"}` from the bootstrap data. **No more `COLLECTION_LIMIT` or `POSTS_PER_COLLECTION` constants** — scope is read from `chrome.storage.local.settings.{selectedCollections,perCollectionLimit,totalPostLimit}` with `null`/`0` meaning "everything." Added `DISCOVER_COLLECTIONS` message handler so the options page can ask the extension to enumerate collections without running a full sync. Push uses `X-Instantiate-Mode: merge`. Endpoint URL is now configurable via settings.
- `extension/content.js` — added `SCRAPE_USERNAME` for the discovery step. Tightened collection selector to exclude `/your_activity/` prefix. Better caption regex that handles escaped quotes (`(?:\\.|[^"\\])*` instead of `[^"]+`).
- `extension/options.html` + `options.css` + `options.js` — new settings page. Four cards: connection (endpoint URL), account (username, auto-detect toggle), what to sync (discovery button + collection picker with "select all" + per-collection cap + total cap), schedule (interval).
- `extension/popup.html` + `popup.css` + `popup.js` — redesigned. Status, sync-now, open settings, export. Hint reads: "For one-shot scans, use the bookmarklet on the web app — no install required." Sets expectations honestly.

**Extension distribution — single source of truth**

- `scripts/build-extension.mjs` — new build script. Copies `extension/` → `public/downloads/insta-ntiate-extension-unpacked/`. Zips `extension/` → `public/downloads/insta-ntiate-extension.zip` via `fflate`. Deletes the legacy top-level `downloads/` directory.
- `package.json` — added `predev` and `prebuild` hooks that run this script. So `npm run dev` and `npm run build` always re-emit the distribution from source. Also `npm run build:extension` for manual runs.
- `downloads/` (top-level) — **removed**. Was a duplicate of `public/downloads/`. The repo now has exactly one place where extension source lives (`extension/`) and exactly one place where its distribution lives (`public/downloads/`, auto-regenerated).

**Dashboard rebuild (the front door)**

Replaced wholesale:

- Hero CTA flipped: primary is now a **draggable pink "Drag to bookmarks" button**. Wiggles once on first visit (`sessionStorage` flag) to telegraph the interaction. Click is preventDefault'd with a tooltip explaining the drag. Secondary CTAs: "Upload IG export" (file picker → `/api/import`) and "Try demo →".
- Hero side card shows sync-health pill (idle / running / fresh / stale / failed), account, last sync, configured endpoint, scope mode.
- ⌘K spotlight: instant inline result panel as you type, ↑/↓ to navigate, Enter to open lightbox, Esc to close. Linear/Raycast feel.
- View Transitions: filter chip toggles and polled archive updates use `document.startViewTransition()` where supported. Cards smoothly reflow instead of snapping.
- ✨ Rediscover button: picks a random post the user hasn't viewed recently (tracked in `localStorage.instantiate-viewed`, capped at 200 ids). Modal with the post + "Another one ✨" button. Also wired to the PWA shortcut `?rediscover=1`.
- `?` keyboard shortcuts panel listing every binding.
- Theme toggle (🌙 / ☀) on the topbar. Persisted to localStorage, applied before paint via the inline boot script in layout.js so no flash. Theme switch transitions via CSS variables.
- PWA install prompt: catches `beforeinstallprompt`, surfaces an `📱 Install` chip on the topbar when available.
- URL param handling: `?shared=ok` shows a confirmation banner, `?shared=invalid` shows a warning, `?bookmarklet=needs-instagram` shows a hint, `?rediscover=1` triggers the rediscover modal. URL is cleaned after handling.
- IG export drop zone covers the full empty-state when no archive exists — drag the ZIP anywhere on the empty state and it uploads.
- Setup section rewritten with three step cards (desktop bookmarklet, mobile share-target, IG data export) and a link to Instagram's own data-export request page.
- Extension moved into a collapsed `<details>` "Advanced — scheduled background sync" disclosure at the bottom. Discoverable for power users, invisible to first-timers.
- Dead "Open Unpacked Manifest" link removed.
- Visibility-gated polling with backoff is preserved from the previous pass; now also uses View Transitions on archive change.

**Cards & lightbox**

- Cards: masonry via CSS columns. Use natural aspect ratios for thumbnails so reels (9:16) and posts (1:1) look right.
- Lightbox: full caption (whitespace-preserving), collections it lives in, captured-at relative time, open-on-Instagram + direct-video links.
- Keyboard: Enter / Space opens a card. Esc closes lightbox / clears search / closes modal — first matching one wins.

#### Files added

```
lib/config.js
lib/bookmarklet-source.js
lib/ig-data-export.js
app/api/bookmarklet/route.js
app/api/import/route.js
app/api/share/route.js
app/api/enrich/route.js
app/manifest.js
app/icon.svg
public/sw.js
extension/options.html
extension/options.css
extension/options.js
scripts/build-extension.mjs
```

#### Files modified

```
app/layout.js
app/globals.css (added light theme tokens, view-transition keyframes, wiggle animation)
app/page.module.css (bookmarklet button, drop zone, spotlight, shortcuts modal, theme menu, advanced disclosure, install prompt)
app/page.js (passes appOrigin + bookmarkletHref to dashboard)
components/dashboard.js (rewrite)
app/api/archive/route.js (CORS, OPTIONS, payload validation, merge mode)
lib/archive-store.js (atomic writes, mergeIntoArchive)
extension/manifest.json (v0.2.0, options_ui, host_permissions)
extension/background.js (rewrite)
extension/content.js (rewrite — username detection, better caption regex)
extension/popup.html / popup.css / popup.js (redesigned)
package.json (predev/prebuild hooks, build:extension script, fflate dependency)
```

#### Files removed

```
downloads/  (top-level — was duplicating public/downloads/)
```

#### Dependencies added

- `fflate@^0.8.3` — tiny (~20 KB) ZIP encoder/decoder used by both the IG data-export parser and the extension build script.

#### Wow factors shipped

- ⌘K spotlight search with inline results, keyboard nav, and arrow-key cycling.
- Random "Rediscover ✨" mode tracking viewed posts in localStorage.
- View Transitions on filter changes and polled archive updates (Chrome/Edge; degrades gracefully).
- Theme toggle (dark / light) with no-flash boot script and CSS-variable transitions.
- `?` keyboard shortcuts panel listing every binding.
- Bookmarklet wiggle animation on first visit (sessionStorage-flagged).
- PWA install prompt chip on supported browsers.
- Live "X min ago" relative time ticking every 30s.
- Sync-health pill that transitions through states (idle → running → fresh → stale → failed).

#### Deferred (decided to scope out)

- **Video understanding** (transcripts, OCR, scene tags, embeddings). Right call long-term but expensive to do correctly today. Schema hook (`enrichments` field on every post) + placeholder endpoint (`/api/enrich`) keep the door open without paying any cost.
- **Hosting** — the app is still local-only but every piece (origin, CORS, endpoint URL) is now config-driven. Flipping to Vercel later is a deploy + an env var, not a rewrite.
- **Mobile share target on real phones** — the code is wired and works on localhost desktop testing. Real-phone share requires HTTPS (PWA service worker / share target requirement). Will work the moment the app is hosted.
- **Chrome Web Store submission** for the extension. The bookmarklet covers the zero-install case; CWS submission is power-user polish for the scheduled-sync case.

#### Verification

Build chain:
- `npm install fflate` clean (1 package).
- `npm run build` clean (prebuild emits extension distribution, Next build emits 10 routes including all new ones).

Smoke tests against the running dev server:
- `GET /` → 200, ~52 KB (new dashboard).
- `GET /manifest.webmanifest` → 200 with `share_target` config visible.
- `GET /api/bookmarklet` → 200, ~20 KB of `application/javascript`.
- `GET /icon.svg` → 200.
- `GET /sw.js` → 200.
- `OPTIONS /api/archive` with `Origin: https://www.instagram.com` → 204 with `Access-Control-Allow-Origin: https://www.instagram.com` set (preflight works).
- `POST /api/share` simulating a shared reel URL → 303 redirect to `/?shared=ok&id=ABC999`.
- `GET /api/archive` after share → 1 post present.
- `POST /api/archive` with the demo body in merge mode → archive grew from 1 to 7 posts (share + demo merged, no duplication).
- `POST /api/enrich` → 501 as designed.
- Extension distribution: `public/downloads/insta-ntiate-extension.zip` is 12.6 KB; unpacked folder contains all 9 source files (background, content, manifest, popup × 3, options × 3).

Visual / interaction verification in a real browser was *not* performed in this environment. Things to sanity-check locally before shipping further:
- Bookmarklet drag UX (drag from hero to bookmarks bar; click on Instagram).
- PWA install prompt firing on a supported browser.
- Theme toggle smoothness and no-flash on reload.
- ⌘K spotlight behaviour with empty / populated archive.
- View Transitions on filter change (Chrome/Edge only).
- Rediscover modal randomness with a real archive.
- Mobile PWA install + share-target round-trip (requires HTTPS or localhost on phone — ngrok works during dev).

#### Follow-ups for next pass (not done here)

- Bookmarklet that *also* attempts background fetch of each picked collection's URL via same-origin `fetch`, parses the returned HTML for OG metadata server-side-equivalent. Probably needs IG's GraphQL endpoint to be reliable; reverse-engineering required.
- Wire up actual transcript/OCR/embedding workers behind `/api/enrich`. Likely Whisper API + Tesseract + OpenAI embeddings or local models.
- Per-post "viewed" / "archived" / "reminder" states beyond the current localStorage-backed view-tracking.
- Cross-device sync (requires hosting + auth).
- Cloud-hosted media cache so thumbnails don't 404 when Instagram CDN URLs expire.
- Auto-tagging by content type (recipes / travel / design) via keyword matching, then later via embeddings.

