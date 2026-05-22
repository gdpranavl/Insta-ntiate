import { unzipSync, strFromU8 } from "fflate";

export async function parseExportPayload({ buffer, filename }) {
  const lowerName = (filename || "").toLowerCase();
  if (lowerName.endsWith(".zip")) {
    return parseZipExport(buffer);
  }
  if (lowerName.endsWith(".json")) {
    const text = new TextDecoder().decode(buffer);
    return parseSingleJson(text, filename);
  }
  return parseSingleJson(new TextDecoder().decode(buffer), filename);
}

function parseZipExport(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const entries = unzipSync(bytes, {
    filter: (file) => /saved[_\-/]/i.test(file.name) && file.name.endsWith(".json")
  });
  let savedPosts = null;
  let savedCollections = null;
  for (const [name, data] of Object.entries(entries)) {
    const text = strFromU8(data);
    try {
      const json = JSON.parse(text);
      if (/saved_posts/.test(name)) savedPosts = json;
      else if (/saved_collections/.test(name)) savedCollections = json;
    } catch {
      // ignore non-json
    }
  }
  return normalizeExport({ savedPosts, savedCollections, source: "ig-data-export-zip" });
}

function parseSingleJson(text, filename) {
  const json = JSON.parse(text);
  if (json.collections && json.posts) {
    return normalizeArchive(json);
  }
  const looksLikeSavedPosts = json.saved_saved_media || json.saved_posts || json.savedPosts;
  if (looksLikeSavedPosts) {
    return normalizeExport({ savedPosts: json, source: "ig-data-export-json" });
  }
  if (/saved_collections/i.test(filename || "")) {
    return normalizeExport({ savedCollections: json, source: "ig-data-export-json" });
  }
  throw new Error("Unrecognised file. Expected an Instagram data export ZIP, a saved_posts.json, or an Insta-ntiate archive JSON.");
}

function normalizeArchive(input) {
  return {
    ...input,
    posts: (input.posts || []).map((p) => ({ ...p, enrichments: p.enrichments || {} }))
  };
}

function normalizeExport({ savedPosts, savedCollections, source }) {
  const posts = [];
  const collections = [];
  const memberships = [];
  const seenPosts = new Set();
  const now = new Date().toISOString();

  const postEntries = extractPostEntries(savedPosts);
  for (const entry of postEntries) {
    const id = entry.shortcode;
    if (!id || seenPosts.has(id)) continue;
    seenPosts.add(id);
    posts.push({
      id,
      shortcode: id,
      canonicalUrl: entry.url,
      creatorHandle: entry.creator ? `@${entry.creator.replace(/^@/, "")}` : "",
      caption: "",
      mediaType: /\/reel\//i.test(entry.url) ? "video" : "image",
      thumbnailUrl: "",
      videoUrl: "",
      capturedAt: entry.savedAt || now,
      enrichments: {},
      source
    });
  }

  const collectionEntries = extractCollectionEntries(savedCollections);
  for (const entry of collectionEntries) {
    const id = slugify(entry.title || entry.name || "collection");
    collections.push({
      id,
      title: entry.title || entry.name || "Untitled",
      url: entry.url || "",
      position: collections.length + 1,
      capturedAt: now
    });
    for (const postRef of entry.posts || []) {
      const shortcode = extractShortcode(postRef);
      if (!shortcode) continue;
      memberships.push({ collectionId: id, postId: shortcode, rank: 1, capturedAt: now });
      if (!seenPosts.has(shortcode)) {
        seenPosts.add(shortcode);
        posts.push({
          id: shortcode,
          shortcode,
          canonicalUrl: postRef,
          creatorHandle: "",
          caption: "",
          mediaType: /\/reel\//i.test(postRef) ? "video" : "image",
          thumbnailUrl: "",
          videoUrl: "",
          capturedAt: now,
          enrichments: {},
          source
        });
      }
    }
  }

  return {
    sourceAccount: { username: "", lastSyncedAt: now },
    syncRun: { trigger: source, status: "completed", completedAt: now },
    collections,
    posts,
    memberships,
    summary: { collectionsCaptured: collections.length, postsCaptured: posts.length },
    notes: [`Imported from Instagram data export (${source}).`],
    warnings: []
  };
}

function extractPostEntries(savedPosts) {
  if (!savedPosts) return [];
  const list =
    savedPosts.saved_saved_media ||
    savedPosts.saved_posts ||
    savedPosts.savedPosts ||
    (Array.isArray(savedPosts) ? savedPosts : []);
  const out = [];
  for (const item of list) {
    const data = item?.string_map_data || item?.stringMapData || item;
    const candidate =
      data?.["Saved on"] ||
      data?.["saved_on"] ||
      data?.SavedOn ||
      item;
    const href = candidate?.href || item?.href || item?.url;
    if (!href) continue;
    const ts = candidate?.timestamp || item?.timestamp;
    out.push({
      url: href,
      shortcode: extractShortcode(href),
      creator: item?.title || "",
      savedAt: ts ? new Date(Number(ts) * 1000).toISOString() : null
    });
  }
  return out;
}

function extractCollectionEntries(savedCollections) {
  if (!savedCollections) return [];
  const list =
    savedCollections.saved_saved_collections ||
    savedCollections.saved_collections ||
    savedCollections.savedCollections ||
    (Array.isArray(savedCollections) ? savedCollections : []);
  const out = [];
  for (const item of list) {
    const title = item?.title || item?.name || item?.collection_name;
    const links = [];
    if (Array.isArray(item?.media_map_data)) {
      for (const m of item.media_map_data) {
        if (m?.href) links.push(m.href);
      }
    }
    if (Array.isArray(item?.media)) {
      for (const m of item.media) {
        const href = m?.uri || m?.url || m?.href;
        if (href) links.push(href);
      }
    }
    out.push({ title, name: item?.name, url: "", posts: links });
  }
  return out;
}

function extractShortcode(href) {
  if (!href) return "";
  const m = String(href).match(/\/(p|reel|tv)\/([^/?#]+)/i);
  return m ? m[2] : slugify(href);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
