# System Architecture

## Overview
Insta-ntiate is planned as an extension-assisted web application for backing up and searching a user's Instagram saved content, with liked-content capture treated as a secondary capability to validate later.

The system is intentionally split into two product layers:
- the browser extension collects Instagram data from the user's existing logged-in browser session
- the web app stores, presents, and searches the collected archive

This architecture keeps Instagram session activity on the user's machine while letting the product invest in the higher-value layer: backup, search, enrichment, and rediscovery.

## Goals
- capture saved Instagram content without asking the user for Instagram credentials
- support near-real-time or periodic sync while the user's browser is available
- make captured posts searchable by text, creator, collection, and later visual/semantic signals
- keep the first version operationally simple enough for a three-person team

## Non-Goals For V1
- full mobile app support
- true server-side autonomous scraping
- perfect capture of every Instagram surface
- deep multi-user collaboration features

## Product Shape

### Collector
Chrome extension running in the user's own browser session.

### Experience Layer
Web app where the user:
- downloads the extension
- understands sync status
- imports or receives synced data
- searches and reviews saved posts

### Future Intelligence Layer
Optional backend enrichment for:
- OCR
- transcript extraction
- embeddings
- tagging and summarization

## Architectural Principles
- keep Instagram authentication local to the user's browser
- avoid backend password handling
- design sync to be resumable and incremental
- make failure visible instead of hiding it
- preserve enough raw metadata to reprocess later
- prefer stable identifiers over brittle presentation state

## System Components

## 1. Browser Extension

### Responsibilities
- detect the user's logged-in Instagram session
- trigger sync on startup, scheduled intervals, or manual action
- navigate to Instagram saved surfaces in a non-disruptive way
- extract collection and post metadata
- cache results locally
- export structured data for the web app

### Planned Modules
- `service worker`
  - schedules sync
  - opens inactive tabs
  - coordinates scrape steps
  - stores run state in `chrome.storage.local`
- `content script`
  - runs on Instagram pages
  - inspects DOM
  - extracts collection links, post links, captions, and media URLs when available
  - scrolls or paginates within a bounded limit
- `popup UI`
  - lets the user run sync manually
  - shows last sync results
  - lets the user download the current archive JSON
- `shared scraper helpers`
  - normalize URLs
  - sanitize text
  - deduplicate post records

### Sync Triggers
- browser startup
- extension installation or reload
- periodic alarm while Chrome is open
- explicit user action through popup

### Startup Behavior
The extension should be able to start automatically when Chrome starts because the background service worker can be revived by extension lifecycle events and alarms. The important caveat is that "fully headless browsing" is not how Chrome extensions normally operate.

The practical approach is:
- create a non-focused tab or reuse an existing Instagram tab when safe
- keep the tab inactive whenever possible
- wait for page load
- inject or activate content script logic
- close or leave the tab based on debugging mode and reliability

### Why This Is Better Than Server-Side Login Scraping
- user remains in control of the authenticated browser profile
- avoids centralized login sessions from datacenter IPs
- avoids backend custody of Instagram passwords
- reduces platform-risk concentration in one backend process

## 2. Web App

### Responsibilities
- present the product clearly
- provide extension installation/download
- display imported archive data
- allow search and filtering
- explain sync limitations and next steps

### V1 Scope
- landing page with architecture-aware messaging
- extension download CTA
- archive import flow from harvested JSON
- local searchable dashboard
- sync instructions for loading the extension in Chrome

### Later Scope
- account system
- cloud sync ingestion API
- persistent hosted archive
- enrichment job status and history

## 3. Optional Backend

The current implementation can start static-first, but the architecture should assume a future backend.

### Future Responsibilities
- authenticate product users
- receive sync payloads from the extension
- store source records and normalized records
- deduplicate across sync runs
- maintain collection membership history
- run enrichment jobs
- expose search APIs

### Suggested Future Services
- ingestion API
- relational store for entities and sync state
- object storage for downloaded media and thumbnails
- vector index for semantic search
- worker queue for OCR and transcript jobs

## Data Model

## Core Entities

### User
- `id`
- `email` or equivalent product identity
- `createdAt`

### Source Account
- `id`
- `userId`
- `platform = instagram`
- `username`
- `lastSyncedAt`

### Collection
- `id`
- `accountId`
- `title`
- `url`
- `position`
- `capturedAt`

### Post
- `id`
- `shortcode`
- `canonicalUrl`
- `creatorHandle`
- `caption`
- `mediaType`
- `thumbnailUrl`
- `videoUrl`
- `capturedAt`

### Saved Membership
- `id`
- `collectionId`
- `postId`
- `rank`
- `capturedAt`

### Sync Run
- `id`
- `startedAt`
- `completedAt`
- `status`
- `collectionsAttempted`
- `postsCaptured`
- `errors`

## V1 Data Contract
The extension should export one JSON document containing:
- account metadata
- sync metadata
- collections array
- posts array
- membership array
- scrape notes and errors

This lets the web app operate immediately without a backend.

## Sync Strategy

## Phase 1: Collection Discovery
1. Open Instagram saved page.
2. Capture the first one or two visible collections.
3. Persist collection title and URL.

## Phase 2: Collection Harvest
1. Open each selected collection.
2. Capture the first five visible posts.
3. Open each post detail page if needed.
4. Extract:
   - post link
   - caption or visible description
   - thumbnail
   - video URL if exposed in page markup

## Phase 3: Local Packaging
1. Combine all captured entities into one normalized archive.
2. Save archive in `chrome.storage.local`.
3. Expose archive for download from the popup.

## Near-Term Reliability Tactics
- bound scraping depth tightly
- prefer collecting stable URLs before deep media extraction
- mark fields as missing instead of failing whole runs
- keep raw source URLs for later reprocessing

## Sync Modes

### Passive Mode
Capture data only when the user is actively browsing Instagram pages already relevant to saved content.

### Active Background Mode
Create inactive tabs to saved pages and run bounded collection. This is the preferred V1 automation mode.

### Manual Mode
User clicks `Sync now` in the popup if scheduled sync fails or permissions are limited.

## Search Architecture

### V1 Search
Client-side search over imported JSON:
- collection title
- creator handle
- caption text
- post URL

### V2 Search
Hosted search over:
- metadata index
- embeddings
- OCR text
- transcript text
- visual tags

## Failure Modes

### Browser-Level
- Chrome service worker sleeps or restarts
- alarms do not run exactly on schedule
- background tabs are throttled

### Instagram-Level
- page structure changes
- saved page requires new selectors
- media URLs are hidden or expire quickly
- some collections/posts fail to load

### Product-Level
- user expects full automation when only near-real-time is feasible
- imported archives become stale if sync is not run regularly

## Risk Mitigation
- keep selectors centralized
- store scrape diagnostics in every run
- surface sync recency prominently in the web app
- avoid claiming perfect completeness in UX copy
- keep a manual export/import fallback

## Security Considerations
- do not ask for Instagram passwords
- minimize stored data in the extension
- treat harvested archives as sensitive user data
- if a backend is added, encrypt stored artifacts and secure upload endpoints

## V1 Implementation Decision
The first shippable version should be static-first:
- static web app
- Chrome extension
- local archive export/import

This is the fastest path to validating whether the collector works and whether the search experience is valuable before investing in backend complexity.

## Immediate Build Plan
1. Build landing page plus searchable archive UI.
2. Build Chrome extension with bounded collection scrape.
3. Export archive as JSON from the extension.
4. Allow import of that archive into the web app.
5. Iterate on selectors and reliability using a real logged-in Instagram session.
