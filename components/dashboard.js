"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";

const demoArchive = {
  sourceAccount: { username: "demo.user", lastSyncedAt: "2026-05-22T18:30:00.000Z" },
  collections: [
    { id: "c1", title: "Design Boards", url: "https://instagram.com/saved/design-boards", position: 1 },
    { id: "c2", title: "Travel Ideas", url: "https://instagram.com/saved/travel-ideas", position: 2 },
  ],
  posts: [
    {
      id: "p1", shortcode: "ABC123", canonicalUrl: "https://instagram.com/p/ABC123/",
      creatorHandle: "@studiolens",
      caption: "Warm terracotta interiors and layered daylight references. #interiordesign #terracotta #homedecor",
      hashtags: ["#interiordesign", "#terracotta", "#homedecor"],
      semanticTags: ["interior design", "home decor", "aesthetic", "terracotta", "inspiration"],
      mediaType: "image",
      thumbnailUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
      videoUrl: "", capturedAt: "2026-05-22T18:31:00.000Z",
    },
    {
      id: "p2", shortcode: "DEF456", canonicalUrl: "https://instagram.com/reel/DEF456/",
      creatorHandle: "@packlight",
      caption: "Mountain cabin reel with packing list overlays and travel hooks. #travel #packinglist #mountainlife",
      hashtags: ["#travel", "#packinglist", "#mountainlife"],
      semanticTags: ["travel tips", "packing", "mountain", "cabin", "travel"],
      mediaType: "video",
      thumbnailUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
      videoUrl: "https://example.com/demo-video.mp4", capturedAt: "2026-05-22T18:31:00.000Z",
    },
  ],
  memberships: [
    { collectionId: "c1", postId: "p1", rank: 1 },
    { collectionId: "c2", postId: "p2", rank: 1 },
  ],
  summary: { collectionsCaptured: 2, postsCaptured: 2 },
};

export function Dashboard({ initialArchive }) {
  // ── Core state ──
  const [archive, setArchive] = useState(initialArchive);
  const [status, setStatus] = useState("");
  const [summarizing, setSummarizing] = useState(new Set());
  const [bulkProgress, setBulkProgress] = useState(null);

  // ── Filter state ──
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [activeTopicTag, setActiveTopicTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── AI search state ──
  const [aiQuery, setAiQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResultIds, setAiResultIds] = useState(null);

  // ── View / UX state ──
  const [activeView, setActiveView] = useState("archive");
  const [similarBase, setSimilarBase] = useState(null);
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  // ── Pause polling while the user is mid-edit so a disk read can't clobber an
  //    in-flight note/summary or close an open note editor. ──
  const skipPollRef = useRef(false);
  useEffect(() => {
    skipPollRef.current = noteEditId !== null || summarizing.size > 0 || bulkProgress !== null;
  }, [noteEditId, summarizing, bulkProgress]);

  // ── Poll for archive updates every 4s ──
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch("/api/archive", { cache: "no-store" });
        if (!res.ok) return;
        const { archive: next } = await res.json();
        if (next && !skipPollRef.current) setArchive(next);
      } catch {}
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived data ──
  const cards = useMemo(() => {
    const collections = archive?.collections || [];
    const posts = archive?.posts || [];
    const memberships = archive?.memberships || [];
    const collectionMap = new Map(collections.map((c) => [c.id, c]));
    const membershipsByPost = new Map();
    memberships.forEach((m) => {
      const list = membershipsByPost.get(m.postId) || [];
      const col = collectionMap.get(m.collectionId);
      list.push(col?.title || "Untitled collection");
      membershipsByPost.set(m.postId, list);
    });
    return posts.map((post) => ({ ...post, collections: membershipsByPost.get(post.id) || [] }));
  }, [archive]);

  const creators = useMemo(() => {
    const handles = cards.map((c) => c.creatorHandle).filter((h) => h && h.trim());
    return [...new Set(handles)].sort();
  }, [cards]);

  const collectionTitles = useMemo(() => {
    return [...new Set((archive?.collections || []).map((c) => c.title).filter(Boolean))].sort();
  }, [archive]);

  const topicTags = useMemo(() => {
    const freq = {};
    for (const card of cards) {
      for (const tag of card.semanticTags || []) {
        freq[tag] = (freq[tag] || 0) + 1;
      }
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([tag]) => tag);
  }, [cards]);

  const filteredCards = useMemo(() => {
    // Similar mode overrides everything
    if (similarBase) {
      const baseTags = new Set(similarBase.semanticTags || []);
      return cards
        .filter((c) => c.id !== similarBase.id && (c.semanticTags || []).some((t) => baseTags.has(t)))
        .map((c) => ({ ...c, _sim: (c.semanticTags || []).filter((t) => baseTags.has(t)).length }))
        .sort((a, b) => b._sim - a._sim);
    }

    // AI search mode overrides sort/keyword filter
    if (aiMode && aiResultIds) {
      const idOrder = new Map(aiResultIds.map((id, i) => [id, i]));
      return cards
        .filter((c) => idOrder.has(c.id))
        .sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
    }

    let result = cards;

    if (mediaFilter === "reels") result = result.filter((c) => c.mediaType === "video");
    else if (mediaFilter === "posts") result = result.filter((c) => c.mediaType !== "video");

    if (creatorFilter) result = result.filter((c) => c.creatorHandle === creatorFilter);
    if (collectionFilter) result = result.filter((c) => (c.collections || []).includes(collectionFilter));
    if (activeTopicTag) result = result.filter((c) => (c.semanticTags || []).includes(activeTopicTag));

    if (dateFrom) result = result.filter((c) => c.capturedAt && c.capturedAt.slice(0, 10) >= dateFrom);
    if (dateTo) result = result.filter((c) => c.capturedAt && c.capturedAt.slice(0, 10) <= dateTo);

    const lower = query.trim().toLowerCase();
    if (lower) {
      result = result.filter((c) =>
        [c.caption, c.creatorHandle, c.canonicalUrl, ...(c.collections || []), ...(c.hashtags || []), ...(c.semanticTags || []), c.note || ""]
          .join(" ").toLowerCase().includes(lower)
      );
    }

    result = [...result];
    if (sortBy === "newest") result.sort((a, b) => new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0));
    else if (sortBy === "oldest") result.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0));
    else if (sortBy === "creator") result.sort((a, b) => (a.creatorHandle || "").localeCompare(b.creatorHandle || ""));

    return result;
  }, [cards, query, mediaFilter, creatorFilter, collectionFilter, activeTopicTag, sortBy, aiMode, aiResultIds, dateFrom, dateTo, similarBase]);

  const stats = useMemo(() => {
    if (!cards.length) return null;
    const creatorCounts = {};
    const hashtagCounts = {};
    const tagCounts = {};
    let reels = 0, posts = 0;
    for (const c of cards) {
      if (c.mediaType === "video") reels++; else posts++;
      if (c.creatorHandle) creatorCounts[c.creatorHandle] = (creatorCounts[c.creatorHandle] || 0) + 1;
      for (const h of (c.hashtags || [])) hashtagCounts[h] = (hashtagCounts[h] || 0) + 1;
      for (const t of (c.semanticTags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    return {
      reels,
      posts,
      topCreators: Object.entries(creatorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topHashtags: Object.entries(hashtagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15),
      topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15),
    };
  }, [cards]);

  // ── Actions ──
  async function importArchive(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const text = await file.text();
      const nextArchive = JSON.parse(text);
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextArchive),
      });
      if (!res.ok) throw new Error("Upload failed");
      setArchive(nextArchive);
      setStatus("Archive imported.");
    } catch {
      setStatus("Could not import that archive JSON.");
    }
  }

  async function clearArchive() {
    await fetch("/api/archive", { method: "DELETE" });
    setArchive(null);
    setQuery("");
    setCreatorFilter("");
    setCollectionFilter("");
    setActiveTopicTag("");
    setAiMode(false);
    setAiResultIds(null);
    setAiQuery("");
    setSimilarBase(null);
    setDateFrom("");
    setDateTo("");
    setStatus("Stored archive cleared.");
  }

  async function loadDemo() {
    await fetch("/api/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoArchive),
    });
    setArchive(demoArchive);
    setStatus("Demo archive loaded.");
  }

  async function summarizeReel(postId) {
    setSummarizing((prev) => new Set(prev).add(postId));
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summarize failed");
      setArchive((prev) => ({
        ...prev,
        posts: prev.posts.map((p) =>
          p.id === postId ? { ...p, summary: data.summary, semanticTags: data.semanticTags || p.semanticTags } : p
        ),
      }));
    } catch (err) {
      setStatus(`Could not summarize: ${err.message}`);
    } finally {
      setSummarizing((prev) => { const next = new Set(prev); next.delete(postId); return next; });
    }
  }

  async function bulkSummarize() {
    const toProcess = cards.filter((c) => c.mediaType === "video" && !c.summary);
    if (!toProcess.length) return;
    setBulkProgress({ done: 0, total: toProcess.length });
    for (let i = 0; i < toProcess.length; i++) {
      await summarizeReel(toProcess[i].id);
      setBulkProgress({ done: i + 1, total: toProcess.length });
    }
    setBulkProgress(null);
    setStatus(`Summarized ${toProcess.length} reels.`);
  }

  async function runAiSearch() {
    if (!aiQuery.trim() || aiSearching) return;
    setAiSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`AI search failed: ${data.error || `HTTP ${res.status}`}`);
        return;
      }
      setAiResultIds(data.ids || []);
      setAiMode(true);
    } catch (err) {
      setStatus(`AI search failed: ${err.message}`);
    } finally {
      setAiSearching(false);
    }
  }

  function clearAiSearch() {
    setAiMode(false);
    setAiResultIds(null);
    setAiQuery("");
  }

  async function saveNote(postId) {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, note: noteDraft }),
    });
    setArchive((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => p.id === postId ? { ...p, note: noteDraft } : p),
    }));
    setNoteEditId(null);
  }

  function startEditNote(card) {
    setNoteEditId(card.id);
    setNoteDraft(card.note || "");
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(filteredCards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "insta-ntiate-export.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const cols = ["id", "creatorHandle", "mediaType", "caption", "hashtags", "semanticTags", "summary", "note", "capturedAt", "canonicalUrl"];
    const csvCell = (value) => {
      let s = String(Array.isArray(value) ? value.join(";") : value ?? "");
      // Neutralize spreadsheet formula injection (leading =, +, -, @, tab, CR)
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filteredCards.map((c) => cols.map((k) => csvCell(c[k])).join(","));
    const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "insta-ntiate-export.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const postCount = archive?.posts?.length || 0;
  const collectionCount = archive?.collections?.length || 0;
  const reelCount = (archive?.posts || []).filter((p) => p.mediaType === "video").length;
  const unsummarizedCount = cards.filter((c) => c.mediaType === "video" && !c.summary).length;
  const syncStamp = archive?.sourceAccount?.lastSyncedAt || archive?.syncRun?.completedAt;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <nav className={styles.topbar}>
          <div className={styles.brand}>
            <img className={styles.brandMark} src="/icon.svg" alt="Insta-ntiate" width={52} height={52} />
            <div>
              <p className={styles.eyebrow}>Saved Search Layer</p>
              <h1>Insta-ntiate</h1>
            </div>
          </div>
          <div className={styles.heroActions}>
            <a className={styles.button} href="/downloads/insta-ntiate-extension.zip">Download Extension ZIP</a>
            <a className={styles.buttonSecondary} href="/downloads/insta-ntiate-extension-unpacked/manifest.json" target="_blank" rel="noreferrer">
              Open Unpacked Manifest
            </a>
          </div>
        </nav>

        <section className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Instagram saves, indexed from your own browser session.</p>
            <h2 className={styles.heroTitle}>
              Search saved reels and posts,
              <span> without the manual export loop.</span>
            </h2>
            <p className={styles.lead}>
              The extension syncs your saved collections into a local archive. Search by caption, creator, hashtag, or AI-generated topic tags — and get Claude summaries for any reel.
            </p>
            <div className={styles.heroActions}>
              <label className={styles.buttonSecondary}>
                Import JSON Fallback
                <input hidden type="file" accept=".json,application/json" onChange={importArchive} />
              </label>
              <button className={styles.buttonGhost} type="button" onClick={loadDemo}>Load Demo Data</button>
            </div>
          </div>

          <aside className={styles.heroCard}>
            <p className={styles.eyebrow}>Current collector limits</p>
            <div className={styles.metricRow}>
              <div>
                <span className={styles.metricNumber}>20</span>
                <span className={styles.metricLabel}>Collections scraped</span>
              </div>
              <div>
                <span className={styles.metricNumber}>25</span>
                <span className={styles.metricLabel}>Posts per collection</span>
              </div>
            </div>
            <ul className={styles.featureList}>
              <li>Runs from your logged-in Chrome Instagram session</li>
              <li>Caption, hashtag, and AI topic tag search</li>
              <li>Claude summaries for every reel on demand</li>
            </ul>
          </aside>
        </section>
      </header>

      <main>
        <section className={styles.panel}>
          <div className={styles.tabRow}>
            <button
              className={activeView === "archive" ? styles.tabActive : styles.tab}
              type="button"
              onClick={() => setActiveView("archive")}
            >
              Archive
            </button>
            <button
              className={activeView === "stats" ? styles.tabActive : styles.tab}
              type="button"
              onClick={() => setActiveView("stats")}
            >
              Stats
            </button>
          </div>

          {activeView === "archive" && (
            <>
              <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                  <p className={styles.sectionTag}>Archive</p>
                  <h3>Your saved posts</h3>
                </div>
                <div className={styles.toolbarActions}>
                  <div className={styles.filterPills}>
                    {["all", "reels", "posts"].map((f) => (
                      <button
                        key={f}
                        className={mediaFilter === f ? styles.filterPillActive : styles.filterPill}
                        type="button"
                        onClick={() => setMediaFilter(f)}
                      >
                        {f === "all" ? "All" : f === "reels" ? "Reels" : "Posts"}
                      </button>
                    ))}
                  </div>

                  <input
                    className={styles.searchInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search captions, creators, topics..."
                    type="search"
                    disabled={aiMode || !!similarBase}
                  />

                  <select
                    className={styles.selectControl}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    disabled={aiMode || !!similarBase}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="creator">By creator</option>
                  </select>

                  {creators.length > 0 && (
                    <select
                      className={styles.selectControl}
                      value={creatorFilter}
                      onChange={(e) => setCreatorFilter(e.target.value)}
                    >
                      <option value="">All creators</option>
                      {creators.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}

                  {collectionTitles.length > 0 && (
                    <select
                      className={styles.selectControl}
                      value={collectionFilter}
                      onChange={(e) => setCollectionFilter(e.target.value)}
                    >
                      <option value="">All collections</option>
                      {collectionTitles.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}

                  <button className={styles.buttonGhost} type="button" onClick={clearArchive}>Clear</button>
                </div>
              </div>

              {/* Date range + Export row */}
              <div className={styles.toolRow}>
                <div className={styles.dateRange}>
                  <span className={styles.dateLabel}>From</span>
                  <input
                    className={styles.dateInput}
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className={styles.dateLabel}>to</span>
                  <input
                    className={styles.dateInput}
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                  {(dateFrom || dateTo) && (
                    <button className={styles.clearBtn} type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                      × clear dates
                    </button>
                  )}
                </div>
                <div className={styles.exportBtns}>
                  <button className={styles.exportBtn} type="button" onClick={exportJSON} disabled={!filteredCards.length}>
                    Export JSON
                  </button>
                  <button className={styles.exportBtn} type="button" onClick={exportCSV} disabled={!filteredCards.length}>
                    Export CSV
                  </button>
                </div>
              </div>

              {/* AI Search bar */}
              <div className={styles.aiSearchBar}>
                <input
                  className={styles.aiSearchInput}
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runAiSearch()}
                  placeholder="AI search: describe what you're looking for — e.g. travel reels from beaches…"
                  type="text"
                  disabled={!!similarBase}
                />
                <button
                  className={styles.aiSearchBtn}
                  type="button"
                  onClick={runAiSearch}
                  disabled={aiSearching || !aiQuery.trim() || !!similarBase}
                >
                  {aiSearching ? "Searching…" : "AI Search"}
                </button>
                {aiMode && (
                  <button className={styles.clearBtn} type="button" onClick={clearAiSearch}>
                    × clear
                  </button>
                )}
              </div>

              {/* Topic cloud */}
              {topicTags.length > 0 && (
                <div className={styles.topicCloud}>
                  <span className={styles.topicCloudLabel}>Topics</span>
                  {topicTags.map((tag) => (
                    <button
                      key={tag}
                      className={activeTopicTag === tag ? styles.topicChipActive : styles.topicChip}
                      type="button"
                      onClick={() => setActiveTopicTag(activeTopicTag === tag ? "" : tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Context banners */}
              {similarBase && (
                <div className={styles.ctxBanner}>
                  <span>Posts similar to <strong>{similarBase.creatorHandle || similarBase.id}</strong></span>
                  <button className={styles.clearBtn} type="button" onClick={() => setSimilarBase(null)}>
                    × back to all
                  </button>
                </div>
              )}
              {aiMode && aiResultIds && (
                <div className={styles.ctxBannerOrange}>
                  <span>AI found <strong>{filteredCards.length}</strong> posts matching &ldquo;{aiQuery}&rdquo;</span>
                </div>
              )}

              <div className={styles.storageNote}>
                <div className={styles.storageNoteInner}>
                  <p>{status || "The app reads the latest archive from its local API store. New syncs appear automatically."}</p>
                  {unsummarizedCount > 0 && (
                    <button
                      className={styles.bulkButton}
                      type="button"
                      disabled={bulkProgress !== null}
                      onClick={bulkSummarize}
                    >
                      {bulkProgress
                        ? `Summarizing ${bulkProgress.done} / ${bulkProgress.total}…`
                        : `Summarize all reels (${unsummarizedCount} remaining)`}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Collections</span>
                  <strong>{collectionCount}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Posts</span>
                  <strong>{postCount}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Reels</span>
                  <strong>{reelCount}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Last Sync</span>
                  <strong suppressHydrationWarning>{syncStamp ? formatDate(syncStamp) : "Waiting for sync"}</strong>
                </article>
              </div>

              {!archive || filteredCards.length === 0 ? (
                <div className={styles.emptyState}>
                  <h4>
                    {!archive
                      ? "No archive synced yet"
                      : aiMode
                      ? "No AI matches found"
                      : similarBase
                      ? "No similar posts found"
                      : "No matching posts"}
                  </h4>
                  <p>
                    {!archive
                      ? "Run a sync from the extension. This page will update once data arrives."
                      : aiMode
                      ? "Try rephrasing your query — e.g. be more specific about the topic or creator."
                      : similarBase
                      ? "This post has no overlapping semantic tags with others. Try summarizing more reels first."
                      : "Try a different search term, filter, or topic tag."}
                  </p>
                </div>
              ) : (
                <div className={styles.resultsGrid}>
                  {filteredCards.map((card) => (
                    <article className={styles.resultCard} key={card.id}>
                      <div className={styles.cardImage}>
                        {card.mediaType === "video" && <span className={styles.reelBadge}>Reel</span>}
                        {card.thumbnailUrl ? <img src={card.thumbnailUrl} alt={card.caption || "Saved post thumbnail"} /> : null}
                      </div>
                      <div className={styles.cardBody}>
                        <div className={styles.chipRow}>
                          {(card.collections || []).map((col) => (
                            <span className={styles.chip} key={`${card.id}-${col}`}>{col}</span>
                          ))}
                        </div>
                        <h4>{card.creatorHandle || "Unknown creator"}</h4>
                        <p className={styles.resultMeta}>{card.caption || "No caption captured."}</p>

                        {(card.hashtags || []).length > 0 && (
                          <div className={styles.hashtagRow}>
                            {card.hashtags.slice(0, 6).map((tag) => (
                              <button className={styles.hashtagPill} key={`${card.id}-${tag}`} type="button" onClick={() => setQuery(tag)}>
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}

                        {(card.semanticTags || []).length > 0 && (
                          <div className={styles.semanticTagRow}>
                            {card.semanticTags.map((tag) => (
                              <button
                                className={activeTopicTag === tag ? styles.semanticTagActive : styles.semanticTag}
                                key={`${card.id}-st-${tag}`}
                                type="button"
                                onClick={() => setActiveTopicTag(activeTopicTag === tag ? "" : tag)}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}

                        {card.summary && (
                          <div className={styles.summaryBox}>
                            <p className={styles.summaryBoxLabel}>AI Summary</p>
                            <p className={styles.summaryText}>{card.summary}</p>
                          </div>
                        )}

                        {noteEditId === card.id ? (
                          <div className={styles.noteEditor}>
                            <textarea
                              className={styles.noteTextarea}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Add your note…"
                              rows={3}
                              autoFocus
                            />
                            <div className={styles.noteActions}>
                              <button className={styles.noteSave} type="button" onClick={() => saveNote(card.id)}>Save</button>
                              <button className={styles.noteCancel} type="button" onClick={() => setNoteEditId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : card.note ? (
                          <div className={styles.noteBox}>
                            <p className={styles.noteBoxLabel}>Your note</p>
                            <p className={styles.noteText}>{card.note}</p>
                          </div>
                        ) : null}

                        <div className={styles.linkRow}>
                          <a className={styles.smallLink} href={card.canonicalUrl} target="_blank" rel="noreferrer">
                            Open Post
                          </a>
                          {card.mediaType === "video" && (
                            <button
                              className={styles.smallLink}
                              type="button"
                              disabled={summarizing.has(card.id)}
                              onClick={() => summarizeReel(card.id)}
                            >
                              {summarizing.has(card.id) ? "Summarizing…" : card.summary ? "Re-summarize" : "Summarize"}
                            </button>
                          )}
                          {(card.semanticTags || []).length > 0 && (
                            <button
                              className={styles.smallLink}
                              type="button"
                              onClick={() => { clearAiSearch(); setSimilarBase(card); }}
                            >
                              Similar
                            </button>
                          )}
                          <button
                            className={styles.smallLink}
                            type="button"
                            onClick={() => startEditNote(card)}
                          >
                            {card.note ? "Edit note" : "Add note"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === "stats" && (
            <div className={styles.statsPanel}>
              {!stats ? (
                <div className={styles.emptyState}>
                  <h4>No data yet</h4>
                  <p>Sync or load demo data first to see stats.</p>
                </div>
              ) : (
                <>
                  <div className={styles.summaryGrid} style={{ marginTop: 24 }}>
                    <article className={styles.summaryCard}>
                      <span className={styles.summaryLabel}>Total Posts</span>
                      <strong>{stats.posts + stats.reels}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className={styles.summaryLabel}>Reels</span>
                      <strong>{stats.reels}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className={styles.summaryLabel}>Static Posts</span>
                      <strong>{stats.posts}</strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className={styles.summaryLabel}>Unique Creators</span>
                      <strong>{stats.topCreators.length}</strong>
                    </article>
                  </div>

                  <div className={styles.statsGrid}>
                    <div className={styles.statSection}>
                      <h4>Top Creators</h4>
                      {stats.topCreators.length === 0 ? <p className={styles.subtle}>No creator data.</p> : (
                        <div className={styles.barChart}>
                          {stats.topCreators.map(([handle, count]) => (
                            <div className={styles.barRow} key={handle}>
                              <span className={styles.barLabel}>{handle}</span>
                              <div className={styles.barTrack}>
                                <div className={styles.bar} style={{ width: `${(count / stats.topCreators[0][1]) * 100}%` }} />
                              </div>
                              <span className={styles.barCount}>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.statSection}>
                      <h4>Top Hashtags</h4>
                      {stats.topHashtags.length === 0 ? <p className={styles.subtle}>No hashtag data.</p> : (
                        <div className={styles.barChart}>
                          {stats.topHashtags.map(([tag, count]) => (
                            <div className={styles.barRow} key={tag}>
                              <span className={styles.barLabel}>{tag}</span>
                              <div className={styles.barTrack}>
                                <div className={styles.bar} style={{ width: `${(count / stats.topHashtags[0][1]) * 100}%` }} />
                              </div>
                              <span className={styles.barCount}>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.statSection}>
                      <h4>Top AI Topics</h4>
                      {stats.topTags.length === 0 ? <p className={styles.subtle}>Summarize reels to generate topics.</p> : (
                        <div className={styles.barChart}>
                          {stats.topTags.map(([tag, count]) => (
                            <div className={styles.barRow} key={tag}>
                              <span className={styles.barLabel}>{tag}</span>
                              <div className={styles.barTrack}>
                                <div className={styles.barOrange} style={{ width: `${(count / stats.topTags[0][1]) * 100}%` }} />
                              </div>
                              <span className={styles.barCount}>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
