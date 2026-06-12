"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [archive, setArchive] = useState(initialArchive);
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [activeTopicTag, setActiveTopicTag] = useState("");
  const [status, setStatus] = useState("");
  const [summarizing, setSummarizing] = useState(new Set());
  const [bulkProgress, setBulkProgress] = useState(null);

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch("/api/archive", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.archive) setArchive(payload.archive);
      } catch (_error) {}
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, []);

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

  const topicTags = useMemo(() => {
    const freq = {};
    for (const card of cards) {
      for (const tag of card.semanticTags || []) {
        freq[tag] = (freq[tag] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([tag]) => tag);
  }, [cards]);

  const filteredCards = useMemo(() => {
    let result = cards;

    if (mediaFilter === "reels") result = result.filter((c) => c.mediaType === "video");
    else if (mediaFilter === "posts") result = result.filter((c) => c.mediaType !== "video");

    if (creatorFilter) result = result.filter((c) => c.creatorHandle === creatorFilter);

    if (activeTopicTag) {
      result = result.filter((c) => (c.semanticTags || []).includes(activeTopicTag));
    }

    const lower = query.trim().toLowerCase();
    if (lower) {
      result = result.filter((c) =>
        [c.caption, c.creatorHandle, c.canonicalUrl, ...(c.collections || []), ...(c.hashtags || []), ...(c.semanticTags || [])]
          .join(" ")
          .toLowerCase()
          .includes(lower)
      );
    }

    result = [...result];
    if (sortBy === "newest") result.sort((a, b) => new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0));
    else if (sortBy === "oldest") result.sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0));
    else if (sortBy === "creator") result.sort((a, b) => (a.creatorHandle || "").localeCompare(b.creatorHandle || ""));

    return result;
  }, [cards, query, mediaFilter, creatorFilter, activeTopicTag, sortBy]);

  async function importArchive(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const text = await file.text();
      const nextArchive = JSON.parse(text);
      const response = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextArchive),
      });
      if (!response.ok) throw new Error("Upload failed");
      setArchive(nextArchive);
      setStatus("Archive imported.");
    } catch (_error) {
      setStatus("Could not import that archive JSON.");
    }
  }

  async function clearArchive() {
    await fetch("/api/archive", { method: "DELETE" });
    setArchive(null);
    setQuery("");
    setCreatorFilter("");
    setActiveTopicTag("");
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
      setArchive((prev) => {
        if (!prev?.posts) return prev;
        return {
          ...prev,
          posts: prev.posts.map((p) =>
            p.id === postId ? { ...p, summary: data.summary, semanticTags: data.semanticTags || p.semanticTags } : p
          ),
        };
      });
    } catch (err) {
      setStatus(`Could not summarize: ${err.message}`);
    } finally {
      setSummarizing((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
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
            <span className={styles.brandMark}>IN</span>
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
                    {f === "all" ? "All" : f === "reels" ? "Reels only" : "Posts only"}
                  </button>
                ))}
              </div>

              <input
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search captions, creators, topics..."
                type="search"
              />

              <select
                className={styles.selectControl}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
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
                  {creators.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              <button className={styles.buttonGhost} type="button" onClick={clearArchive}>Clear</button>
            </div>
          </div>

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
                    ? `Summarizing ${bulkProgress.done} / ${bulkProgress.total}...`
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
              <strong>{syncStamp ? formatDate(syncStamp) : "Waiting for sync"}</strong>
            </article>
          </div>

          {!archive || filteredCards.length === 0 ? (
            <div className={styles.emptyState}>
              <h4>{archive ? "No matching posts" : "No archive synced yet"}</h4>
              <p>
                {archive
                  ? "Try a different search term, filter, or topic tag."
                  : "Run a sync from the extension. This page will update once data arrives."}
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
                          {summarizing.has(card.id) ? "Summarizing..." : card.summary ? "Re-summarize" : "Summarize"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
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
