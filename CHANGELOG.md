# Changelog

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
