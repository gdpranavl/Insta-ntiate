import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data");
const archiveFile = path.join(dataDirectory, "archive.json");

export async function readArchive() {
  try {
    const contents = await readFile(archiveFile, "utf8");
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

export async function writeArchive(archive) {
  await mkdir(dataDirectory, { recursive: true });
  const tmp = `${archiveFile}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(archive, null, 2), "utf8");
  await rename(tmp, archiveFile);
}

export async function clearArchive() {
  await rm(archiveFile, { force: true });
}

export async function mergeIntoArchive(incoming) {
  const existing = (await readArchive()) || emptyArchive();
  const merged = mergeArchives(existing, incoming);
  await writeArchive(merged);
  return merged;
}

export function emptyArchive() {
  return {
    sourceAccount: { username: "", lastSyncedAt: null },
    syncRun: null,
    collections: [],
    posts: [],
    memberships: [],
    mediaAssets: [],
    summary: { collectionsCaptured: 0, postsCaptured: 0 },
    notes: [],
    warnings: []
  };
}

export function mergeArchives(base, incoming) {
  if (!incoming || typeof incoming !== "object") return base;
  const collections = mergeById(base.collections || [], incoming.collections || []);
  const posts = mergeById(base.posts || [], incoming.posts || []);
  const memberships = mergeMemberships(base.memberships || [], incoming.memberships || []);
  const mediaAssets = mergeMediaAssets(base.mediaAssets || [], incoming.mediaAssets || []);
  return {
    sourceAccount: incoming.sourceAccount || base.sourceAccount,
    syncRun: incoming.syncRun || base.syncRun,
    collections,
    posts,
    memberships,
    mediaAssets,
    summary: {
      collectionsCaptured: collections.length,
      postsCaptured: posts.length
    },
    notes: dedupeStrings([...(base.notes || []), ...(incoming.notes || [])]),
    warnings: dedupeStrings([...(base.warnings || []), ...(incoming.warnings || [])])
  };
}

function mergeById(left, right) {
  const map = new Map();
  for (const item of left) {
    if (item && item.id) map.set(item.id, { ...item });
  }
  for (const item of right) {
    if (!item || !item.id) continue;
    const prev = map.get(item.id);
    map.set(
      item.id,
      prev
        ? {
            ...prev,
            ...item,
            textContent: item.textContent || item.caption || prev.textContent || prev.caption || "",
            authorName: item.authorName || item.creatorHandle || prev.authorName || prev.creatorHandle || "",
            enrichments: { ...(prev.enrichments || {}), ...(item.enrichments || {}) }
          }
        : { ...item }
    );
  }
  return Array.from(map.values());
}

function mergeMemberships(left, right) {
  const seen = new Set();
  const out = [];
  for (const list of [left, right]) {
    for (const m of list) {
      if (!m || !m.collectionId || !m.postId) continue;
      const key = `${m.collectionId}::${m.postId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function mergeMediaAssets(left, right) {
  const map = new Map();
  for (const asset of left) {
    if (asset && asset.postId) {
      map.set(asset.postId, { ...asset });
    }
  }
  for (const asset of right) {
    if (!asset || !asset.postId) continue;
    const prev = map.get(asset.postId);
    map.set(asset.postId, prev ? { ...prev, ...asset } : { ...asset });
  }
  return Array.from(map.values());
}

function dedupeStrings(list) {
  return Array.from(new Set(list.filter(Boolean)));
}
