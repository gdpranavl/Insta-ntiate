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

The extension is the collector.
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

### Sync Model
- Preferred: near-real-time or periodic sync from the user's active browser environment
- Avoid: manual one-by-one sharing of reels/posts
- Fallback: Instagram data export import for bootstrap or backfill
- Current V1 implementation: startup/manual/background-alarm sync inside the Chrome extension, pushing the latest archive into the local Next app API on `localhost:3000`

### Data Access Direction
- Do not rely on official Instagram APIs for consumer saved/liked content
- Do not make server-side login scraping the primary architecture
- Prefer collection from the user's existing authenticated browser session

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
  - extension ZIP download call-to-action
  - direct archive reading from the app's local API store
  - archive JSON import as fallback
  - searchable saved-post cards
  - summary metrics for collections, posts, videos, and last sync time

### Extension
- A Chrome Manifest V3 extension now exists in `extension/`.
- Current behavior:
  - starts from Chrome lifecycle events and alarms
  - supports manual sync from the popup
  - attempts Instagram saved-page access with route fallback
  - captures the first two collections
  - captures the first five posts in each collection
  - opens each post/reel in a background tab for deeper metadata extraction
  - stores link, creator, caption, thumbnail, and video URL when exposed
  - pushes the archive into the local app endpoint and can still export JSON manually

### Current Limitation
- This first implementation is selector-driven and should be treated as a working prototype, not a hardened collector.
- Real Instagram DOM validation is still required.
- Video capture is best-effort only because Instagram may not expose stable direct video URLs in page markup.

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
- Do we store only metadata first, or also cache media assets?
- What is the smallest useful searchable schema for V1?
- How do we handle deleted posts, unavailable media, or changed collection membership?

## Team Working Model
The team currently has three members and wants better project continuity and traceability. The intent of these markdown files is to serve as living project memory:
- `CHANGELOG.md` tracks decisions and milestones
- `CONTEXT.md` tracks current understanding and assumptions
- `SYSTEM_ARCHITECTURE.md` tracks implementation shape and technical direction
- `AGENTS.md` acts as the repository operating prompt for downstream agents
- `HANDOFF.md` acts as the current-state baton pass for the next agent/session

## Immediate Next Step
The next concrete build step after this checkpoint should be live validation in Chrome against a real logged-in Instagram session:
- verify saved-page routes
- refine selectors for collection and post extraction
- confirm whether inactive-tab sync works consistently
- verify whether direct video URLs are exposed often enough to be useful
