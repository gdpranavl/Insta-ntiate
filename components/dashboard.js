"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/page.module.css";

const demoArchive = {
  sourceAccount: {
    username: "demo.user",
    lastSyncedAt: "2026-05-22T18:30:00.000Z"
  },
  collections: [
    { id: "c1", title: "Design Boards", url: "https://instagram.com/saved/design-boards", position: 1 },
    { id: "c2", title: "Travel Ideas", url: "https://instagram.com/saved/travel-ideas", position: 2 }
  ],
  posts: [
    {
      id: "p1",
      shortcode: "ABC123",
      canonicalUrl: "https://instagram.com/p/ABC123/",
      creatorHandle: "@studiolens",
      caption: "Warm terracotta interiors and layered daylight references. #interiordesign #terracotta #homedecor",
      hashtags: ["#interiordesign", "#terracotta", "#homedecor"],
      mediaType: "image",
      thumbnailUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
      videoUrl: "",
      capturedAt: "2026-05-22T18:31:00.000Z"
    },
    {
      id: "p2",
      shortcode: "DEF456",
      canonicalUrl: "https://instagram.com/reel/DEF456/",
      creatorHandle: "@packlight",
      caption: "Mountain cabin reel with packing list overlays and travel hooks. #travel #packinglist #mountainlife",
      hashtags: ["#travel", "#packinglist", "#mountainlife"],
      mediaType: "video",
      thumbnailUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
      videoUrl: "https://example.com/demo-video.mp4",
      capturedAt: "2026-05-22T18:31:00.000Z"
    }
  ],
  memberships: [
    { collectionId: "c1", postId: "p1", rank: 1 },
    { collectionId: "c2", postId: "p2", rank: 1 }
  ],
  summary: {
    collectionsCaptured: 2,
    postsCaptured: 2
  }
};

export function Dashboard({ initialArchive }) {
  const [archive, setArchive] = useState(initialArchive);
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [summarizing, setSummarizing] = useState(new Set());

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch("/api/archive", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (payload.archive) {
          setArchive(payload.archive);
        }
      } catch (_error) {
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  const cards = useMemo(() => {
    const collections = archive?.collections || [];
    const posts = archive?.posts || [];
    const memberships = archive?.memberships || [];
    const collectionMap = new Map(collections.map((collection) => [collection.id, collection]));
    const membershipsByPost = new Map();

    memberships.forEach((membership) => {
      const list = membershipsByPost.get(membership.postId) || [];
      const collection = collectionMap.get(membership.collectionId);
      list.push(collection?.title || "Untitled collection");
      membershipsByPost.set(membership.postId, list);
    });

    return posts.map((post) => ({
      ...post,
      collections: membershipsByPost.get(post.id) || []
    }));
  }, [archive]);

  const filteredCards = useMemo(() => {
    let result = cards;

    if (mediaFilter === "reels") {
      result = result.filter((card) => card.mediaType === "video");
    } else if (mediaFilter === "posts") {
      result = result.filter((card) => card.mediaType !== "video");
    }

    const lower = query.trim().toLowerCase();
    if (!lower) {
      return result;
    }

    return result.filter((card) =>
      [
        card.caption,
        card.creatorHandle,
        card.canonicalUrl,
        ...(card.collections || []),
        ...(card.hashtags || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(lower)
    );
  }, [cards, query, mediaFilter]);

  async function importArchive(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const nextArchive = JSON.parse(text);
      const response = await fetch("/api/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(nextArchive)
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setArchive(nextArchive);
      setStatus("Archive imported into the app store.");
    } catch (_error) {
      setStatus("Could not import that archive JSON.");
    }
  }

  async function clearArchive() {
    await fetch("/api/archive", { method: "DELETE" });
    setArchive(null);
    setQuery("");
    setStatus("Stored archive cleared.");
  }

  async function loadDemo() {
    await fetch("/api/archive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(demoArchive)
    });
    setArchive(demoArchive);
    setStatus("Demo archive loaded into the app store.");
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
          posts: prev.posts.map((p) => (p.id === postId ? { ...p, summary: data.summary } : p)),
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

  const postCount = archive?.posts?.length || 0;
  const collectionCount = archive?.collections?.length || 0;
  const reelCount = (archive?.posts || []).filter((post) => post.mediaType === "video").length;
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
            <a className={styles.button} href="/downloads/insta-ntiate-extension.zip">
              Download Extension ZIP
            </a>
            <a
              className={styles.buttonSecondary}
              href="/downloads/insta-ntiate-extension-unpacked/manifest.json"
              target="_blank"
              rel="noreferrer"
            >
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
              The extension now pushes its latest archive into the local app store, and this dashboard
              polls for updates so new syncs show up here automatically while you are developing on localhost.
            </p>
            <div className={styles.heroActions}>
              <label className={styles.buttonSecondary}>
                Import JSON Fallback
                <input hidden type="file" accept=".json,application/json" onChange={importArchive} />
              </label>
              <button className={styles.buttonGhost} type="button" onClick={loadDemo}>
                Load Demo Data
              </button>
            </div>
            <p className={styles.subtle}>
              Direct sync targets `http://localhost:3000/api/archive` by default. JSON import remains as a fallback.
            </p>
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
              <li>Opens each saved post in a background tab to capture metadata</li>
              <li>Pushes the archive into the app so search updates automatically</li>
            </ul>
          </aside>
        </section>
      </header>

      <main>
        <section className={styles.panel}>
          <div>
            <p className={styles.sectionTag}>Workflow</p>
            <h3>How this version works</h3>
          </div>
          <div className={styles.workflow}>
            <article className={styles.workflowCard}>
              <span className={styles.workflowIndex}>01</span>
              <h4>Load extension</h4>
              <p>Use the unpacked folder in Chrome developer mode, then keep localhost running.</p>
            </article>
            <article className={styles.workflowCard}>
              <span className={styles.workflowIndex}>02</span>
              <h4>Sync Instagram</h4>
              <p>The extension visits your saved collections, then opens each saved item for deeper metadata extraction.</p>
            </article>
            <article className={styles.workflowCard}>
              <span className={styles.workflowIndex}>03</span>
              <h4>Search immediately</h4>
              <p>The dashboard keeps polling the local archive endpoint so you do not have to re-import every time.</p>
            </article>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div>
              <p className={styles.sectionTag}>Archive</p>
              <h3>Your saved posts</h3>
            </div>
            <div className={styles.toolbarActions}>
              <div className={styles.filterPills}>
                <button
                  className={mediaFilter === "all" ? styles.filterPillActive : styles.filterPill}
                  type="button"
                  onClick={() => setMediaFilter("all")}
                >
                  All
                </button>
                <button
                  className={mediaFilter === "reels" ? styles.filterPillActive : styles.filterPill}
                  type="button"
                  onClick={() => setMediaFilter("reels")}
                >
                  Reels only
                </button>
                <button
                  className={mediaFilter === "posts" ? styles.filterPillActive : styles.filterPill}
                  type="button"
                  onClick={() => setMediaFilter("posts")}
                >
                  Posts only
                </button>
              </div>
              <input
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search captions, creators, #hashtags..."
                type="search"
              />
              <button className={styles.buttonGhost} type="button" onClick={clearArchive}>
                Clear Archive
              </button>
            </div>
          </div>

          <div className={styles.storageNote}>
            <p>
              {status || "The app reads the latest archive from its local API store. If the extension is running, new syncs will show up here automatically."}
            </p>
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
                  ? "Try another search term, or let the extension run another sync."
                  : "Run a sync from the extension. This page will update once the local archive endpoint receives data."}
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
                      {(card.collections || []).map((collection) => (
                        <span className={styles.chip} key={`${card.id}-${collection}`}>
                          {collection}
                        </span>
                      ))}
                    </div>
                    <h4>{card.creatorHandle || "Unknown creator"}</h4>
                    <p className={styles.resultMeta}>{card.caption || "No visible caption captured."}</p>
                    {(card.hashtags || []).length > 0 && (
                      <div className={styles.hashtagRow}>
                        {card.hashtags.slice(0, 8).map((tag) => (
                          <button
                            className={styles.hashtagPill}
                            key={`${card.id}-${tag}`}
                            type="button"
                            onClick={() => setQuery(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {card.summary && (
                      <div className={styles.summaryBox}>
                        <p className={styles.summaryLabel}>AI Summary</p>
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
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
