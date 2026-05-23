"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";

export function Dashboard({ initialArchive, appOrigin }) {
  const [archive, setArchive] = useState(initialArchive);
  const [query, setQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [activeItem, setActiveItem] = useState(null);
  const [status, setStatus] = useState("");
  const pollRef = useRef(JSON.stringify(initialArchive || null));

  useEffect(() => {
    let timeoutId = null;
    let cancelled = false;

    async function poll() {
      if (cancelled) {
        return;
      }

      try {
        const response = await fetch("/api/archive", { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json();
          const serialized = JSON.stringify(payload.archive || null);
          if (serialized !== pollRef.current) {
            pollRef.current = serialized;
            setArchive(payload.archive || null);
          }
        }
      } catch {}

      timeoutId = window.setTimeout(poll, 5000);
    }

    timeoutId = window.setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const cards = useMemo(() => {
    const collections = archive?.collections || [];
    const posts = archive?.posts || [];
    const memberships = archive?.memberships || [];
    const collectionMap = new Map(collections.map((collection) => [collection.id, collection]));
    const membershipsByPost = new Map();

    for (const membership of memberships) {
      const current = membershipsByPost.get(membership.postId) || [];
      const collection = collectionMap.get(membership.collectionId);
      if (collection) {
        current.push(collection);
      }
      membershipsByPost.set(membership.postId, current);
    }

    return posts.map((post) => ({
      ...post,
      collections: membershipsByPost.get(post.id) || [],
      platform: post.platform || "instagram",
      textContent: post.textContent || post.caption || "",
      authorName: post.authorName || post.creatorHandle || "Unknown source"
    }));
  }, [archive]);

  const platformCards = useMemo(() => {
    return SUPPORTED_PLATFORMS.map((platform) => {
      const count = cards.filter((card) => card.platform === platform.id).length;
      return { ...platform, count };
    });
  }, [cards]);

  const filteredCards = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (selectedPlatform !== "all" && card.platform !== selectedPlatform) {
        return false;
      }

      if (!lowered) {
        return true;
      }

      return [
        card.textContent,
        card.authorName,
        card.creatorHandle,
        card.canonicalUrl,
        ...(card.collections || []).map((collection) => collection.title),
        card.platform
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(lowered);
    });
  }, [cards, query, selectedPlatform]);

  const lastSync = archive?.sourceAccount?.lastSyncedAt || archive?.syncRun?.completedAt || "";

  async function importFile(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Import failed.");
      }
      pollRef.current = JSON.stringify(payload.archive || null);
      setArchive(payload.archive || null);
      setStatus(`Imported ${payload.summary.posts} item(s) from uploaded export data.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = "";
    }
  }

  async function clearArchive() {
    await fetch("/api/archive", { method: "DELETE" });
    pollRef.current = JSON.stringify(null);
    setArchive(null);
    setActiveItem(null);
    setStatus("Local archive cleared.");
  }

  return (
    <div className={styles.cleanShell}>
      <header className={styles.cleanHeader}>
        <div>
          <p className={styles.cleanEyebrow}>Digital world archive</p>
          <h1 className={styles.cleanTitle}>Search everything from one place.</h1>
          <p className={styles.cleanLead}>
            Instagram saves, WhatsApp exports, Slack threads, Discord messages, Telegram chats,
            LinkedIn posts, and Reddit finds all land in one searchable surface.
          </p>
        </div>
        <div className={styles.cleanHeaderMeta}>
          <span>Archive endpoint</span>
          <code>{appOrigin}/api/archive</code>
          <span>Last sync</span>
          <strong>{lastSync ? formatDate(lastSync) : "Waiting for first sync"}</strong>
        </div>
      </header>

      <section className={styles.searchBar}>
        <input
          className={styles.searchBarInput}
          type="search"
          placeholder="Search chats, posts, captions, senders, channels, links..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.searchActions}>
          <label className={styles.cleanButtonSecondary}>
            Import export
            <input hidden type="file" accept=".zip,.json,.txt" onChange={importFile} />
          </label>
          <a className={styles.cleanButtonSecondary} href="/collectors">
            Collector setup
          </a>
          {archive ? (
            <button className={styles.cleanButtonGhost} type="button" onClick={clearArchive}>
              Clear archive
            </button>
          ) : null}
        </div>
      </section>

      {status ? <div className={styles.cleanBanner}>{status}</div> : null}

      <section className={styles.platformStrip}>
        <button
          type="button"
          className={`${styles.platformCard} ${selectedPlatform === "all" ? styles.platformCardActive : ""}`}
          onClick={() => setSelectedPlatform("all")}
        >
          <span className={styles.platformLabel}>All sectors</span>
          <strong>{cards.length}</strong>
        </button>
        {platformCards.map((platform) => (
          <button
            key={platform.id}
            type="button"
            className={`${styles.platformCard} ${selectedPlatform === platform.id ? styles.platformCardActive : ""}`}
            onClick={() => setSelectedPlatform(platform.id)}
          >
            <span className={styles.platformLabel}>{platform.label}</span>
            <strong>{platform.count}</strong>
            <span className={styles.platformMeta}>{platform.sector}</span>
          </button>
        ))}
      </section>

      {!archive ? (
        <section className={styles.cleanEmpty}>
          <h2>No archive yet</h2>
          <p>
            Start from the collector page, or import one of the supported export formats here:
            Instagram ZIP/JSON, WhatsApp TXT, Slack ZIP/JSON, or an existing archive JSON.
          </p>
        </section>
      ) : filteredCards.length === 0 ? (
        <section className={styles.cleanEmpty}>
          <h2>No matches</h2>
          <p>Try another search or switch back to a different platform sector.</p>
        </section>
      ) : (
        <section className={styles.cleanGrid}>
          {filteredCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={styles.cleanItemCard}
              onClick={() => setActiveItem(card)}
            >
              <div className={styles.cleanItemTop}>
                <span className={styles.cleanPlatformBadge}>{card.platform}</span>
                <span className={styles.cleanItemType}>{card.entityType || "entry"}</span>
              </div>
              <strong className={styles.cleanItemAuthor}>{card.authorName || card.creatorHandle || "Unknown source"}</strong>
              <p className={styles.cleanItemText}>{card.textContent || "No text captured."}</p>
              <div className={styles.cleanItemFooter}>
                <span>{card.collections?.[0]?.title || "Direct capture"}</span>
                <span>{formatRelative(card.capturedAt)}</span>
              </div>
            </button>
          ))}
        </section>
      )}

      {activeItem ? (
        <div className={styles.cleanModalBackdrop} onClick={() => setActiveItem(null)}>
          <div className={styles.cleanModal} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.cleanModalClose} onClick={() => setActiveItem(null)}>
              x
            </button>
            <div className={styles.cleanModalMeta}>
              <span>{activeItem.platform}</span>
              <span>{activeItem.entityType || "entry"}</span>
              <span>{formatDate(activeItem.capturedAt)}</span>
            </div>
            <h3>{activeItem.authorName || activeItem.creatorHandle || "Unknown source"}</h3>
            <p className={styles.cleanModalText}>{activeItem.textContent || "No text captured."}</p>
            {activeItem.collections?.length ? (
              <div className={styles.cleanCollectionList}>
                {activeItem.collections.map((collection) => (
                  <span key={collection.id} className={styles.cleanCollectionPill}>
                    {collection.title}
                  </span>
                ))}
              </div>
            ) : null}
            {activeItem.canonicalUrl ? (
              <a className={styles.cleanButtonSecondary} href={activeItem.canonicalUrl} target="_blank" rel="noreferrer">
                Open source
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
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

function formatRelative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const deltaMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  return `${Math.round(deltaHours / 24)}d ago`;
}
