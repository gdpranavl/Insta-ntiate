"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";

const POLL_INTERVALS_MS = [4000, 12000, 60000];
const NO_CHANGE_STEPS_PER_STAGE = 3;
const RELATIVE_TICK_MS = 30000;
const VIEWED_KEY = "instantiate-viewed";
const THEME_KEY = "instantiate-theme";

export function Dashboard({ initialArchive, appOrigin, bookmarkletHref }) {
  const [archive, setArchive] = useState(initialArchive);
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [selectedCollections, setSelectedCollections] = useState(() => new Set());
  const [activePost, setActivePost] = useState(null);
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRediscover, setShowRediscover] = useState(false);
  const [rediscoverPost, setRediscoverPost] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [installEvent, setInstallEvent] = useState(null);
  const [bookmarkletWiggling, setBookmarkletWiggling] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const searchRef = useRef(null);
  const lastSerializedRef = useRef(JSON.stringify(initialArchive || null));
  const noChangeCountRef = useRef(0);
  const viewedRef = useRef(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) || "dark";
      setTheme(stored);
    } catch {}
    try {
      const v = JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]");
      viewedRef.current = new Set(v);
    } catch {}
    const seen = sessionStorage.getItem("instantiate-bookmarklet-wiggle-shown");
    if (!seen) {
      setBookmarkletWiggling(true);
      sessionStorage.setItem("instantiate-bookmarklet-wiggle-shown", "1");
      setTimeout(() => setBookmarkletWiggling(false), 3000);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 4500);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    let timeoutId = null;
    let cancelled = false;
    const stageMs = () => {
      const stage = Math.min(POLL_INTERVALS_MS.length - 1, Math.floor(noChangeCountRef.current / NO_CHANGE_STEPS_PER_STAGE));
      return POLL_INTERVALS_MS[stage];
    };
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        timeoutId = window.setTimeout(tick, POLL_INTERVALS_MS[POLL_INTERVALS_MS.length - 1]);
        return;
      }
      try {
        const res = await fetch("/api/archive", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const next = data.archive ?? null;
          const serialized = JSON.stringify(next);
          if (serialized !== lastSerializedRef.current) {
            lastSerializedRef.current = serialized;
            noChangeCountRef.current = 0;
            applyArchiveTransition(next, setArchive);
          } else {
            noChangeCountRef.current += 1;
          }
        }
      } catch {
        noChangeCountRef.current += 1;
      }
      if (!cancelled) timeoutId = window.setTimeout(tick, stageMs());
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timeoutId);
        noChangeCountRef.current = 0;
        timeoutId = window.setTimeout(tick, 200);
      }
    };
    timeoutId = window.setTimeout(tick, POLL_INTERVALS_MS[0]);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        setSpotlightOpen(true);
        return;
      }
      if (event.key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      if (event.key === "Escape") {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showRediscover) { setShowRediscover(false); return; }
        if (activePost) { setActivePost(null); return; }
        if (spotlightOpen) { setSpotlightOpen(false); searchRef.current?.blur(); return; }
        if (query) setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePost, query, showShortcuts, showRediscover, spotlightOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared");
    if (shared === "ok") setStatus({ tone: "info", text: "Saved from share sheet to your archive." });
    if (shared === "invalid") setStatus({ tone: "warn", text: "That share didn't include an Instagram URL." });
    if (params.get("bookmarklet") === "needs-instagram") setStatus({ tone: "warn", text: "Open Instagram first, then click the bookmark." });
    if (params.get("rediscover") === "1") triggerRediscover();
    if (shared || params.get("bookmarklet") || params.get("rediscover")) {
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const applyTheme = useCallback((next) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    } catch {}
  }, []);

  const cards = useMemo(() => {
    const collections = archive?.collections || [];
    const posts = archive?.posts || [];
    const memberships = archive?.memberships || [];
    const collectionMap = new Map(collections.map((c) => [c.id, c]));
    const byPost = new Map();
    for (const m of memberships) {
      const list = byPost.get(m.postId) || [];
      const c = collectionMap.get(m.collectionId);
      if (c) list.push(c);
      byPost.set(m.postId, list);
    }
    return posts.map((post) => ({ ...post, collections: byPost.get(post.id) || [] }));
  }, [archive]);

  const collectionFacets = useMemo(() => {
    const counts = new Map();
    for (const card of cards) {
      for (const collection of card.collections) {
        const current = counts.get(collection.id) || { collection, count: 0 };
        current.count += 1;
        counts.set(collection.id, current);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [cards]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (mediaFilter !== "all") {
        const isVideo = card.mediaType === "video" || Boolean(card.videoUrl);
        if (mediaFilter === "video" && !isVideo) return false;
        if (mediaFilter === "image" && isVideo) return false;
      }
      if (selectedCollections.size > 0) {
        const ids = new Set(card.collections.map((c) => c.id));
        let match = false;
        for (const id of selectedCollections) if (ids.has(id)) { match = true; break; }
        if (!match) return false;
      }
      if (!q) return true;
      const haystack = [
        card.caption, card.creatorHandle, card.canonicalUrl, card.shortcode,
        ...card.collections.map((c) => c.title)
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [cards, query, mediaFilter, selectedCollections]);

  const spotlightResults = useMemo(() => {
    if (!query.trim()) return [];
    return filteredCards.slice(0, 6);
  }, [filteredCards, query]);

  useEffect(() => { setSpotlightIndex(0); }, [spotlightResults.length, query]);

  const postCount = archive?.posts?.length || 0;
  const collectionCount = archive?.collections?.length || 0;
  const videoCount = (archive?.posts || []).filter((p) => p.mediaType === "video" || Boolean(p.videoUrl)).length;
  const lastSyncedAt = archive?.sourceAccount?.lastSyncedAt || archive?.syncRun?.completedAt || null;
  const syncStatus = archive?.syncRun?.status || (archive ? "completed" : "idle");
  const health = computeHealth(syncStatus, lastSyncedAt, now);
  const relativeSync = lastSyncedAt ? relativeTime(lastSyncedAt, now) : "never";

  const toggleCollection = useCallback((id) => {
    setSelectedCollections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const setFilterWithTransition = useCallback((updater) => {
    if (typeof document !== "undefined" && document.startViewTransition) {
      document.startViewTransition(() => updater());
    } else {
      updater();
    }
  }, []);

  const clearArchive = useCallback(async () => {
    await fetch("/api/archive", { method: "DELETE" });
    setArchive(null);
    setQuery("");
    setSelectedCollections(new Set());
    lastSerializedRef.current = JSON.stringify(null);
    setStatus({ tone: "info", text: "Local archive cleared." });
  }, []);

  const loadDemo = useCallback(async () => {
    try {
      const res = await fetch("/demo-archive.json", { cache: "no-store" });
      const demo = await res.json();
      await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demo)
      });
      setArchive(demo);
      lastSerializedRef.current = JSON.stringify(demo);
      setStatus({ tone: "info", text: "Demo archive loaded." });
    } catch {
      setStatus({ tone: "warn", text: "Could not load demo." });
    }
  }, []);

  const importJsonInline = useCallback(async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setArchive(data.archive);
      lastSerializedRef.current = JSON.stringify(data.archive);
      setStatus({ tone: "info", text: `Imported · ${data.summary.posts} posts across ${data.summary.collections} collection(s).` });
    } catch (error) {
      setStatus({ tone: "warn", text: error.message });
    } finally {
      event.target.value = "";
    }
  }, []);

  const onDrop = useCallback(async (event) => {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setArchive(data.archive);
      lastSerializedRef.current = JSON.stringify(data.archive);
      setStatus({ tone: "info", text: `Imported · ${data.summary.posts} posts across ${data.summary.collections} collection(s).` });
    } catch (error) {
      setStatus({ tone: "warn", text: error.message });
    }
  }, []);

  const onBookmarkletClick = useCallback((event) => {
    event.preventDefault();
    setStatus({ tone: "info", text: "Drag the button to your bookmarks bar instead of clicking. Then visit Instagram and click the bookmark." });
  }, []);

  const triggerRediscover = useCallback(() => {
    if (!cards.length) {
      setStatus({ tone: "warn", text: "No archive yet — sync something first." });
      return;
    }
    const candidates = cards.filter((c) => !viewedRef.current.has(c.id));
    const pool = candidates.length ? candidates : cards;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    viewedRef.current.add(pick.id);
    try {
      localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(viewedRef.current).slice(-200)));
    } catch {}
    setRediscoverPost(pick);
    setShowRediscover(true);
  }, [cards]);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") {
      setStatus({ tone: "info", text: "Installed. Look for the Insta-ntiate icon on your home screen." });
    }
  }, [installEvent]);

  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function applyArchiveTransition(next, setter) {
    if (typeof document !== "undefined" && document.startViewTransition) {
      document.startViewTransition(() => setter(next));
    } else {
      setter(next);
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <span className={styles.brandMarkLetter}>IN</span>
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Insta-ntiate</span>
            <span className={styles.brandTag}>Saved · Searchable</span>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Primary">
          <button type="button" className={`${styles.navLink} ${styles.navLinkActive}`}>Dashboard</button>
          <button type="button" className={styles.navLink} onClick={() => scrollTo("setup")}>Setup</button>
          <button type="button" className={styles.navLink} onClick={() => scrollTo("advanced")}>Advanced</button>
        </nav>
        <div className={styles.topbarCta}>
          {installEvent ? (
            <button type="button" className={styles.installPrompt} onClick={promptInstall}>
              Install
            </button>
          ) : null}
          <div className={styles.themeMenu} role="group" aria-label="Theme">
            {[
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.themeOption} ${theme === opt.id ? styles.themeOptionActive : ""}`}
                onClick={() => applyTheme(opt.id)}
                aria-label={`Use ${opt.id} theme`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.iconBtn} onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
            ?
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className={styles.heroInner}>
          <div>
            <span className={styles.heroEyebrow}>
              <span className={styles.heroEyebrowDot} />
              Zero-install · synced {relativeSync}
            </span>
            <h1 className={styles.heroTitle}>
              Find that one reel<em>you saved three months ago.</em>
            </h1>
            <p className={styles.heroLead}>
              Drag the button below to your bookmarks bar. Open Instagram, hit the bookmark,
              pick what to save. Or share reels from your phone, or drop your Instagram data
              export here. No extension required.
            </p>
            <div className={styles.heroActions}>
              <BookmarkletAnchor
                bookmarkletHref={bookmarkletHref}
                className={`${styles.bookmarklet} ${bookmarkletWiggling ? styles.bookmarkletWiggle : ""}`}
                onClick={onBookmarkletClick}
                title="Drag this to your bookmarks bar"
              >
                Drag to bookmarks
                <span className={styles.bookmarkletHint}>Drag me up to your bookmarks bar</span>
              </BookmarkletAnchor>
              <label className={`${styles.btn} ${styles.btnGhost}`}>
                Upload IG export
                <input hidden type="file" accept=".zip,.json" onChange={importJsonInline} />
              </label>
              <button type="button" className={`${styles.btn} ${styles.btnText}`} onClick={loadDemo}>
                Try demo →
              </button>
            </div>
          </div>
          <aside className={styles.heroSide}>
            <span className={`${styles.healthPill} ${healthClass(health, styles)}`}>
              <span className={styles.healthDot} />
              {health.label}
            </span>
            <div className={styles.heroSideRow}>
              <span>Account</span>
              <span>{archive?.sourceAccount?.username ? `@${archive.sourceAccount.username.replace(/^@/, "")}` : "—"}</span>
            </div>
            <div className={styles.heroSideRow}>
              <span>Last sync</span>
              <span>{relativeSync}</span>
            </div>
            <div className={styles.heroSideRow}>
              <span>Endpoint</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>{appOrigin}</span>
            </div>
            <div className={styles.heroSideRow}>
              <span>Scope</span>
              <span>user-picked</span>
            </div>
          </aside>
        </div>
      </section>

      <div className={styles.sectionLabel}>
        <span className={styles.sectionLabelText}>Overview</span>
        <span className={styles.sectionLabelLine} />
      </div>

      <section className={styles.stats}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Posts</span>
          <strong className={styles.statValue}>{postCount}</strong>
          <span className={styles.statHint}>across all sources</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Collections</span>
          <strong className={styles.statValue}>{collectionCount}</strong>
          <span className={styles.statHint}>captured so far</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Reels & videos</span>
          <strong className={styles.statValue}>{videoCount}</strong>
          <span className={styles.statHint}>with captured media</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Filtered</span>
          <strong className={styles.statValue}>{filteredCards.length}</strong>
          <span className={styles.statHint}>matching current search</span>
        </article>
      </section>

      <div className={styles.sectionLabel}>
        <span className={styles.sectionLabelText}>Archive</span>
        <span className={styles.sectionLabelLine} />
      </div>

      <section className={styles.toolbar} aria-label="Search and filters">
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden><SearchGlyph /></span>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSpotlightOpen(true); }}
            onFocus={() => setSpotlightOpen(true)}
            onBlur={() => window.setTimeout(() => setSpotlightOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSpotlightIndex((i) => Math.min(spotlightResults.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSpotlightIndex((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && spotlightResults[spotlightIndex]) {
                e.preventDefault();
                setActivePost(spotlightResults[spotlightIndex]);
                setSpotlightOpen(false);
              }
            }}
            placeholder="Search captions, creators, collections…"
            aria-label="Search saved posts"
          />
          <kbd className={styles.searchKbd}>⌘K</kbd>
          {spotlightOpen && query.trim() ? (
            <div className={styles.spotlight}>
              {spotlightResults.length === 0 ? (
                <div className={styles.spotlightEmpty}>No matches for "{query}".</div>
              ) : (
                spotlightResults.map((card, idx) => (
                  <div
                    key={card.id}
                    className={`${styles.spotlightRow} ${idx === spotlightIndex ? styles.spotlightRowActive : ""}`}
                    onMouseEnter={() => setSpotlightIndex(idx)}
                    onMouseDown={(e) => { e.preventDefault(); setActivePost(card); setSpotlightOpen(false); }}
                  >
                    {card.thumbnailUrl ? (
                      <img className={styles.spotlightThumb} src={card.thumbnailUrl} alt="" />
                    ) : (
                      <div className={styles.spotlightThumb} />
                    )}
                    <div className={styles.spotlightMeta}>
                      <span className={styles.spotlightCreator}>{card.creatorHandle || "Unknown creator"}</span>
                      <span className={styles.spotlightCaption}>{card.caption || "No caption"}</span>
                    </div>
                    <span className={styles.spotlightKind}>{(card.mediaType === "video" || card.videoUrl) ? "REEL" : "POST"}</span>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
        <div className={styles.filterRow}>
          {[
            { id: "all", label: "All" },
            { id: "image", label: "Posts" },
            { id: "video", label: "Reels" }
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`${styles.chip} ${mediaFilter === opt.id ? styles.chipActive : ""}`}
              onClick={() => setFilterWithTransition(() => setMediaFilter(opt.id))}
            >
              {opt.label}
            </button>
          ))}
          {collectionFacets.slice(0, 6).map(({ collection, count }) => (
            <button
              key={collection.id}
              type="button"
              className={`${styles.chip} ${selectedCollections.has(collection.id) ? styles.chipActive : ""}`}
              onClick={() => setFilterWithTransition(() => toggleCollection(collection.id))}
            >
              {collection.title || "Untitled"}
              <span className={styles.chipCount}>{count}</span>
            </button>
          ))}
          <div className={styles.toolbarSpacer} />
          {cards.length > 0 ? (
            <button type="button" className={`${styles.chip}`} onClick={triggerRediscover} title="Surface a random post you haven't seen recently">
              Rediscover
            </button>
          ) : null}
          {archive ? (
            <button type="button" className={`${styles.btn} ${styles.btnText}`} onClick={clearArchive}>Clear</button>
          ) : null}
        </div>
      </section>

      {status ? (
        <div className={`${styles.banner} ${status.tone === "info" ? styles.bannerInfo : status.tone === "bad" ? styles.bannerBad : ""}`} role="status">
          {status.text}
        </div>
      ) : null}

      {!archive ? (
        <section
          className={`${styles.empty} ${dropActive ? styles.dropZoneActive : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
          onDragLeave={() => setDropActive(false)}
          onDrop={onDrop}
        >
          <h2 className={styles.emptyTitle}>No archive yet — three ways in</h2>
          <p className={styles.emptySub}>
            Drop your Instagram data export anywhere on this page, or use one of the
            zero-install paths below. The dashboard updates live as data arrives.
          </p>
          <div className={styles.emptyCards}>
            <BookmarkletAnchor
              bookmarkletHref={bookmarkletHref}
              className={styles.emptyCard}
              onClick={onBookmarkletClick}
              title="Drag me to your bookmarks bar"
            >
              <span className={styles.emptyCardIndex}>1</span>
              <span className={styles.emptyCardTitle}>Drag the bookmarklet</span>
              <span className={styles.emptyCardCopy}>
                Drag this card up to your bookmarks bar. Visit Instagram saved pages,
                click the bookmark, pick what to save. Works in any Chromium browser.
              </span>
            </BookmarkletAnchor>
            <label className={styles.emptyCard}>
              <span className={styles.emptyCardIndex}>2</span>
              <span className={styles.emptyCardTitle}>Drop your IG data export</span>
              <span className={styles.emptyCardCopy}>
                Already requested your Instagram data? Drop the ZIP (or the saved_posts.json
                inside) here and we'll parse your entire history in one shot.
              </span>
              <input hidden type="file" accept=".zip,.json" onChange={importJsonInline} />
            </label>
            <div
              className={styles.emptyCard}
              role="button"
              tabIndex={0}
              onClick={loadDemo}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadDemo(); } }}
            >
              <span className={styles.emptyCardIndex}>3</span>
              <span className={styles.emptyCardTitle}>Try the demo</span>
              <span className={styles.emptyCardCopy}>
                Load a small fake archive into the local store so you can feel out search,
                filters, lightbox, rediscover, and the keyboard shortcuts.
              </span>
            </div>
          </div>
        </section>
      ) : filteredCards.length === 0 ? (
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>No matches</h2>
          <p className={styles.emptySub}>
            Nothing in your archive matches this combination. Try clearing chips, broaden the
            query, or capture more posts via the bookmarklet.
          </p>
        </section>
      ) : (
        <div className={styles.gridWrap}>
          <div className={styles.grid}>
            {filteredCards.map((card) => (
              <Card key={card.id} card={card} onOpen={() => { viewedRef.current.add(card.id); setActivePost(card); }} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.sectionLabel}>
        <span className={styles.sectionLabelText}>Setup</span>
        <span className={styles.sectionLabelLine} />
      </div>

      <section id="setup" className={styles.setup}>
        <div className={styles.setupHeader}>
          <h2>Three zero-install paths.</h2>
          <a className={`${styles.btn} ${styles.btnGhost}`} href="https://www.instagram.com/download/request/" target="_blank" rel="noreferrer">
            Request IG data
          </a>
        </div>
        <div className={styles.steps}>
          <article className={styles.step}>
            <span className={styles.stepIndex}>desktop</span>
            <h3 className={styles.stepTitle}>Bookmarklet (one drag)</h3>
            <p className={styles.stepCopy}>
              Drag the chrome button up there to your bookmarks bar. Visit your Instagram saved
              page, click the bookmark, a floating panel asks which collections to save. Each
              click merges into your archive.
            </p>
            <div className={styles.stepNote}>POSTs to <code>{appOrigin}/api/archive</code></div>
          </article>
          <article className={styles.step}>
            <span className={styles.stepIndex}>mobile</span>
            <h3 className={styles.stepTitle}>Add to Home Screen + share sheet</h3>
            <p className={styles.stepCopy}>
              Open this page on your phone, tap "Add to Home Screen". When you share a reel
              from Instagram, Insta-ntiate appears in the share sheet — one tap saves it.
              Needs HTTPS in production, works on localhost during dev.
            </p>
            <div className={styles.stepNote}>Receives at <code>POST /api/share</code></div>
          </article>
          <article className={styles.step}>
            <span className={styles.stepIndex}>history</span>
            <h3 className={styles.stepTitle}>Instagram data export</h3>
            <p className={styles.stepCopy}>
              The cleanest backfill. Request your data from Instagram → wait for the email →
              drop the ZIP into this page. Captures everything you've ever saved, no scraping
              fragility, no caps.
            </p>
            <div className={styles.stepNote}>Parsed at <code>POST /api/import</code></div>
          </article>
        </div>
      </section>

      <details id="advanced" className={styles.disclosure}>
        <summary className={styles.disclosureSummary}>
          <div>
            <h3>Advanced — scheduled background sync (extension)</h3>
            <p>For users who want set-and-forget mirroring. Power-user opt-in, not the default.</p>
          </div>
          <span className={styles.disclosureChevron}>⌄</span>
        </summary>
        <div className={styles.disclosureBody}>
          <p>
            The Chrome extension lets you schedule periodic background syncs. It opens your IG
            saved page in non-focused tabs at a configurable interval, scrapes the collections
            you've selected, and POSTs to <code>{appOrigin}/api/archive</code>. You auto-detect
            your IG username from the active session and pick exactly which collections to
            include in the extension's settings page.
          </p>
          <h4>Install (developer mode, until we publish to the Chrome Web Store)</h4>
          <ol>
            <li>Download: <a href="/downloads/insta-ntiate-extension.zip">insta-ntiate-extension.zip</a></li>
            <li>Unzip locally.</li>
            <li>Open <code>chrome://extensions</code>, enable "Developer mode", click "Load unpacked", pick the folder.</li>
            <li>The extension opens its settings page on first install. Pick which collections to sync, set the interval, save.</li>
          </ol>
          <p>
            <strong>Heads up:</strong> this path has more friction than the bookmarklet. It's
            here for people who genuinely want scheduled syncs while their browser is open.
            We'll publish to the Chrome Web Store later for 1-click install.
          </p>
        </div>
      </details>

      <section className={styles.metaFooter} aria-label="Project metadata">
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Product</span>
          <span className={styles.metaValue}>Insta-ntiate</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Style</span>
          <span className={styles.metaValue}>Personal Archive</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Classification</span>
          <span className={styles.metaValue}>Web · PWA · Extension</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Designed by</span>
          <span className={styles.metaValue}>Team YouLeft</span>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Prototype build · {appOrigin}</span>
        <span>v0.3 · {new Date(now).getFullYear()}</span>
      </footer>

      {activePost ? (
        <Lightbox post={activePost} now={now} onClose={() => setActivePost(null)} />
      ) : null}

      {showRediscover && rediscoverPost ? (
        <div className={styles.modalBackdrop} onClick={() => setShowRediscover(false)}>
          <div className={styles.lightbox} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rediscover">
            <button type="button" className={styles.lightboxClose} onClick={() => setShowRediscover(false)} aria-label="Close">✕</button>
            <div className={styles.lightboxMedia}>
              {rediscoverPost.thumbnailUrl ? (
                <img src={rediscoverPost.thumbnailUrl} alt={rediscoverPost.caption || "Saved post"} />
              ) : (
                <div className={styles.cardMediaPlaceholder}>No media captured</div>
              )}
            </div>
            <div className={styles.lightboxBody}>
              <span className={styles.lightboxMeta}>REDISCOVER · {rediscoverPost.shortcode}</span>
              <div className={styles.lightboxCreator}>{rediscoverPost.creatorHandle || "Unknown creator"}</div>
              {rediscoverPost.caption ? (
                <p className={styles.lightboxCaption}>{rediscoverPost.caption}</p>
              ) : (
                <p className={styles.lightboxCaption} style={{ color: "var(--ink-faint)" }}>No caption captured for this post.</p>
              )}
              <div className={styles.lightboxLinks}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={triggerRediscover}>Another one</button>
                {rediscoverPost.canonicalUrl ? (
                  <a className={`${styles.btn} ${styles.btnGhost}`} href={rediscoverPost.canonicalUrl} target="_blank" rel="noreferrer">Open on Instagram ↗</a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showShortcuts ? (
        <div className={styles.modalBackdrop} onClick={() => setShowShortcuts(false)}>
          <div className={styles.shortcutsModal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <div className={styles.shortcutsTitle}>Keyboard shortcuts</div>
            <div className={styles.shortcutList}>
              {[
                { label: "Focus search / open spotlight", keys: ["⌘", "K"] },
                { label: "Navigate spotlight results", keys: ["↑", "↓"] },
                { label: "Open highlighted post", keys: ["Enter"] },
                { label: "Show this panel", keys: ["?"] },
                { label: "Close any modal / clear search", keys: ["Esc"] },
                { label: "Surface a random saved post", keys: ["Rediscover"] }
              ].map((s) => (
                <div key={s.label} className={styles.shortcutItem}>
                  <span>{s.label}</span>
                  <span className={styles.shortcutKeys}>
                    {s.keys.map((k) => <span key={k} className={styles.shortcutKey}>{k}</span>)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ card, onOpen }) {
  const isVideo = card.mediaType === "video" || Boolean(card.videoUrl);
  return (
    <article
      className={styles.card}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Open details for post by ${card.creatorHandle || "unknown creator"}`}
    >
      <div className={styles.cardMedia}>
        {card.thumbnailUrl ? (
          <img src={card.thumbnailUrl} alt={card.caption ? card.caption.slice(0, 80) : "Saved post"} loading="lazy" />
        ) : (
          <div className={styles.cardMediaPlaceholder}>{card.canonicalUrl ? "Open to fetch thumbnail" : "No thumbnail captured"}</div>
        )}
        <span className={`${styles.cardBadge} ${isVideo ? styles.cardBadgeVideo : ""}`}>{isVideo ? "Reel" : "Post"}</span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardCreator}>{card.creatorHandle || "Unknown creator"}</div>
        {card.caption ? <p className={styles.cardCaption}>{card.caption}</p> : null}
        {card.collections.length ? (
          <div className={styles.cardCollections}>
            {card.collections.map((c) => (
              <span key={c.id} className={styles.cardCollection}>{c.title || "Untitled"}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Lightbox({ post, now, onClose }) {
  const isVideo = post.mediaType === "video" || Boolean(post.videoUrl);
  const captured = post.capturedAt ? relativeTime(post.capturedAt, now) : null;
  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <div className={styles.lightbox} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Saved post details">
        <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Close">✕</button>
        <div className={styles.lightboxMedia}>
          {post.thumbnailUrl ? (
            <img src={post.thumbnailUrl} alt={post.caption || "Saved post"} />
          ) : (
            <div className={styles.cardMediaPlaceholder}>No media captured</div>
          )}
        </div>
        <div className={styles.lightboxBody}>
          <span className={styles.lightboxMeta}>
            {isVideo ? "REEL" : "POST"} · {post.shortcode || "—"}{captured ? ` · captured ${captured}` : ""}
          </span>
          <div className={styles.lightboxCreator}>{post.creatorHandle || "Unknown creator"}</div>
          {post.caption ? (
            <p className={styles.lightboxCaption}>{post.caption}</p>
          ) : (
            <p className={styles.lightboxCaption} style={{ color: "var(--ink-faint)" }}>No caption was captured for this post.</p>
          )}
          {post.collections?.length ? (
            <div className={styles.lightboxRow}>
              <span className={styles.lightboxLabel}>Lives in</span>
              <div className={styles.cardCollections}>
                {post.collections.map((c) => (
                  <span key={c.id} className={styles.cardCollection}>{c.title || "Untitled"}</span>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.lightboxRow}>
            <span className={styles.lightboxLabel}>Links</span>
            <div className={styles.lightboxLinks}>
              {post.canonicalUrl ? (
                <a className={`${styles.btn} ${styles.btnGhost}`} href={post.canonicalUrl} target="_blank" rel="noreferrer">Open on Instagram ↗</a>
              ) : null}
              {post.videoUrl ? (
                <a className={`${styles.btn} ${styles.btnGhost}`} href={post.videoUrl} target="_blank" rel="noreferrer">Direct video ↗</a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookmarkletAnchor({ bookmarkletHref, className, onClick, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && bookmarkletHref) {
      ref.current.setAttribute("href", bookmarkletHref);
    }
  }, [bookmarkletHref]);
  return (
    <a
      ref={ref}
      className={className}
      draggable
      onClick={onClick}
      title={title}
    >
      {children}
    </a>
  );
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function computeHealth(status, lastSyncedAt, now) {
  if (status === "running") return { id: "running", label: "Sync running…" };
  if (status === "failed") return { id: "bad", label: "Last sync failed" };
  if (!lastSyncedAt) return { id: "idle", label: "Idle · waiting for first sync" };
  const t = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(t)) return { id: "idle", label: "Unknown sync state" };
  const ageMs = now - t;
  const hour = 60 * 60 * 1000;
  if (ageMs < hour) return { id: "fresh", label: "Fresh · synced this hour" };
  if (ageMs < 24 * hour) return { id: "stale", label: "Synced today" };
  return { id: "stale", label: "Stale · sync soon" };
}

function healthClass(health, styles) {
  if (health.id === "fresh") return styles.healthFresh;
  if (health.id === "stale") return styles.healthStale;
  if (health.id === "bad") return styles.healthBad;
  if (health.id === "running") return styles.healthRunning;
  return styles.healthIdle;
}

function relativeTime(value, now) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "unknown";
  const diff = Math.max(0, now - t);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(t));
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
