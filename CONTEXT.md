# Context

## Project Summary
Insta-ntiate is being explored as a consumer product for personal Instagram users. The core idea is to help users back up, search, and rediscover their saved and liked Instagram posts and reels.

The current product direction is not to build around official Instagram API access, because current consumer access to saved and liked content is likely too restricted for the intended use case. Instead, the current working direction is to use the user's own logged-in browser session through a browser extension and sync data into a web app.

## Current Product Thesis
The product value is not just "fetch my Instagram saves." The stronger value proposition is:
- create a searchable backup of saved and liked posts
- enable text and semantic search across a large personal archive
- support visual search over videos and images
- enrich content with OCR, transcript extraction, embeddings, and LLM-generated summaries/tags

The collector layer is now multi-source.
The web app is the product.

## Current Decisions

### User Type
- Personal Instagram users
- Each user operates only on their own Instagram account

### Product Surface
- Primary user-facing app: web app
- Primary data collection layer: browser extension
- Mobile app: not in scope for the initial version
- Current implementation style: Next.js web app plus Chrome extension
- The homepage is intended to stay search-first and low-noise.
- Detailed collector setup now lives on a separate page.

### Sync Model
- Preferred: near-real-time or periodic sync from the user's active browser environment
- Avoid: manual one-by-one sharing of reels/posts
- Fallback: Instagram data export import for bootstrap or backfill
- Current implementation: manual platform-selected sync inside the Chrome extension, with auto sync behind an explicit checkbox
- Current extension path: scrape from currently open, logged-in platform tabs for the selected socials

### Data Access Direction
- Do not rely on official Instagram APIs for consumer saved/liked content
- Do not make server-side login scraping the primary architecture
- Prefer collection from the user's existing authenticated browser session
- Apply the same local-browser collection philosophy across other supported web socials where practical

## Why We Rejected Other Primary Directions

### Official API First
This does not appear to match the product requirement of reading personal users' saved and liked Instagram content.

### Instagram Data Export First
This is useful as a backup import path, but not as the main experience because:
- it is not real-time
- it requires an archive request flow
- it is heavier than the desired product UX

### Server-Side Login Scraping First
This is possible but currently not preferred because it creates:
- higher detection risk
- centralized credential/session handling burden
- more brittle ops and scaling
- more friction from checkpoints, 2FA, and suspicious-login flows

## Browser Extension Direction
The extension-based direction is currently the preferred approach because it:
- works from the user's own logged-in browser context
- avoids storing user passwords on our servers
- reduces repeated centralized login automation
- fits a consumer product better than server-hosted browser bots
- can support periodic sync while the browser is available

## What Has Been Built

### Web App
- A modern Next.js landing page and archive viewer now exist.
- The web app includes:
  - search-first dashboard
  - platform sector cards
  - direct archive reading from the app's local API store
  - multi-format import path
  - secondary collectors page for verbose setup and integration detail

### Extension
- A Chrome Manifest V3 extension now exists in `extension/`.
- Current behavior:
  - supports manual sync from the popup
  - lets the user choose which socials to scrape
  - keeps auto sync as opt-in only
  - scrapes currently open platform tabs rather than assuming Instagram-only background sync
  - pushes the archive into the local app endpoint and can still export JSON manually

### Supported Socials
- Instagram
- WhatsApp
- Slack
- Discord
- Telegram
- LinkedIn
- Reddit

### Current Limitation
- This remains selector-driven and should be treated as a working prototype, not a hardened collector.
- Real DOM validation is still required on each supported platform.
- Imports are strongest today for Instagram, WhatsApp, and Slack; the rest currently depend on live web capture.

### Current Working State
- The local development workflow assumes the Next.js app is running on `http://localhost:3000`.
- The extension attempts to push harvested archive data directly to `http://localhost:3000/api/archive`.
- JSON export still exists as a fallback debug path.
- Instagram sync now also attempts to hydrate reel detail pages and persist downloaded reel assets locally under `public/downloads/instagram-media/` with a manifest.
- The options UI now exposes copy actions for the archive payload, debug logs, and discovered collections.
- The main unstable area is cross-platform selector reliability inside the extension collectors.

## Important Product Assumptions
- Users are comfortable installing a browser extension
- Users will grant browser permissions needed for sync
- Background or startup sync can happen without significantly disturbing browsing
- We may be able to open hidden/background tabs if browser platform behavior allows it
- If fully hidden sync is not reliable, the UX must gracefully fall back to explicit sync or low-friction visible sync

## Questions We Still Need to Resolve
- Can the extension automatically begin sync when the browser launches?
- Can sync run in a non-disruptive way, such as in a background or non-focused tab, without interrupting the user?
- Which Instagram surfaces are stable and practical to capture:
  - saved posts
  - saved collections
  - liked posts
  - reels
  - post detail pages
- How much media should we cache locally beyond Instagram reel downloads during development?
- What is the smallest useful searchable schema for V1?
- How do we handle deleted posts, unavailable media, or changed collection membership?

## Team Working Model
The team currently has three members and wants better project continuity and traceability. The intent of these markdown files is to serve as living project memory:
- `CHANGELOG.md` tracks decisions and milestones
- `CONTEXT.md` tracks current understanding and assumptions
- `SYSTEM_ARCHITECTURE.md` tracks implementation shape and technical direction
- `AGENTS.md` acts as the repository operating prompt for downstream agents

## Immediate Next Step
The next concrete build step after this checkpoint should be live validation in Chrome against a real logged-in Instagram session:
- verify each supported social against a real logged-in browser tab
- refine selectors for platform-specific text extraction
- verify WhatsApp and Slack imports against real export payloads
- decide whether bookmarklet support should also be generalized beyond Instagram
