# Changelog

## 2026-05-24

### Added
- Expanded the archive model from Instagram-only items to multi-social items with platform-aware metadata.
- Added support for seven platform sectors:
  - Instagram
  - WhatsApp
  - Slack
  - Discord
  - Telegram
  - LinkedIn
  - Reddit
- Added multi-source import parsing for WhatsApp TXT, Slack ZIP/JSON, and archive JSON.
- Added a dedicated `/collectors` page for detailed setup and collector guidance.
- Added parser verification via `npm run test:imports`.

### Changed
- Reworked the extension from Instagram-only background sync into manual-first, platform-selectable sync.
- Moved auto sync behind an explicit checkbox instead of making it the default path.
- Simplified the homepage into a quieter search-first dashboard.
- Expanded the extension content script and manifest to support multiple social web apps.

### Verified
- `npm run test:imports`
- `npm run build`

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
