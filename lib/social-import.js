import { unzipSync, strFromU8 } from "fflate";
import { parseExportPayload as parseInstagramExportPayload } from "./ig-data-export.js";
import { makePlatformId, slugify } from "./platforms.js";

export async function parseSocialImportPayload({ buffer, filename }) {
  const lowerName = (filename || "").toLowerCase();

  if (lowerName.endsWith(".zip")) {
    if (looksLikeSlackZip(buffer)) {
      return parseSlackZipExport(buffer, filename);
    }
    return parseInstagramExportPayload({ buffer, filename });
  }

  if (lowerName.endsWith(".txt")) {
    return parseWhatsAppExportText(new TextDecoder().decode(buffer), filename);
  }

  if (lowerName.endsWith(".json")) {
    const text = new TextDecoder().decode(buffer);
    const json = JSON.parse(text);
    if (looksLikeArchiveJson(json)) {
      return normalizeArchive(json);
    }
    if (looksLikeSlackJson(json, filename)) {
      return parseSlackJsonExport(json, filename);
    }
    return parseInstagramExportPayload({ buffer, filename });
  }

  if (/whatsapp/i.test(lowerName)) {
    return parseWhatsAppExportText(new TextDecoder().decode(buffer), filename);
  }

  throw new Error("Unsupported import. Use an Instagram export ZIP/JSON, Slack export ZIP/JSON, WhatsApp chat TXT, or an Insta-ntiate archive JSON.");
}

export function parseWhatsAppExportText(text, filename) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(Boolean);

  const chatTitle = deriveChatTitle(filename);
  const collectionId = makePlatformId("whatsapp", chatTitle);
  const posts = [];
  const memberships = [];
  let currentMessage = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const parsed = parseWhatsAppLine(line);
    if (!parsed) {
      if (currentMessage) {
        currentMessage.caption = `${currentMessage.caption}\n${line}`.trim();
        currentMessage.textContent = currentMessage.caption;
      }
      continue;
    }

    const id = makePlatformId(
      "whatsapp",
      `${parsed.timestamp}-${parsed.sender}-${parsed.message.slice(0, 40)}`
    );

    currentMessage = {
      id,
      platform: "whatsapp",
      entityType: "message",
      shortcode: id,
      canonicalUrl: "",
      creatorHandle: parsed.sender,
      authorName: parsed.sender,
      caption: parsed.message,
      textContent: parsed.message,
      mediaType: "text",
      thumbnailUrl: "",
      videoUrl: "",
      capturedAt: parsed.isoTimestamp,
      enrichments: {}
    };

    posts.push(currentMessage);
    memberships.push({
      collectionId,
      postId: id,
      rank: posts.length,
      capturedAt: parsed.isoTimestamp
    });
  }

  return buildArchive({
    platform: "whatsapp",
    collectionTitle: chatTitle,
    collectionId,
    sourceLabel: "WhatsApp exported chat",
    posts,
    memberships
  });
}

export function parseSlackJsonExport(json, filename) {
  const inferredChannel = slugify((filename || "").replace(/\.json$/i, "")) || "slack-channel";
  const collectionId = makePlatformId("slack", inferredChannel);
  const posts = [];
  const memberships = [];
  const items = Array.isArray(json) ? json : json.messages || [];

  for (const item of items) {
    const ts = slackTimestampToIso(item.ts);
    const text = typeof item.text === "string" ? item.text : "";
    const sender = item.user_profile?.real_name || item.username || item.user || "Unknown sender";
    const id = makePlatformId("slack", `${item.client_msg_id || item.ts || text.slice(0, 40)}`);

    posts.push({
      id,
      platform: "slack",
      entityType: "message",
      shortcode: id,
      canonicalUrl: "",
      creatorHandle: sender,
      authorName: sender,
      caption: text,
      textContent: text,
      mediaType: "text",
      thumbnailUrl: "",
      videoUrl: "",
      capturedAt: ts,
      enrichments: {}
    });
    memberships.push({
      collectionId,
      postId: id,
      rank: posts.length,
      capturedAt: ts
    });
  }

  return buildArchive({
    platform: "slack",
    collectionTitle: inferredChannel.replace(/-/g, " "),
    collectionId,
    sourceLabel: "Slack export JSON",
    posts,
    memberships
  });
}

export function parseSlackZipExport(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const entries = unzipSync(bytes);
  const posts = [];
  const memberships = [];
  const collections = new Map();

  for (const [name, data] of Object.entries(entries)) {
    if (!/\.json$/i.test(name) || /users\.json$/i.test(name) || /channels\.json$/i.test(name)) {
      continue;
    }

    const channelMatch = name.match(/^([^/\\]+)[/\\].+\.json$/);
    if (!channelMatch) {
      continue;
    }

    const channelName = channelMatch[1];
    const collectionId = makePlatformId("slack", channelName);
    if (!collections.has(collectionId)) {
      collections.set(collectionId, {
        id: collectionId,
        platform: "slack",
        title: channelName,
        url: "",
        kind: "channel",
        position: collections.size + 1,
        capturedAt: new Date().toISOString()
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(strFromU8(data));
    } catch {
      continue;
    }

    for (const item of Array.isArray(parsed) ? parsed : []) {
      const ts = slackTimestampToIso(item.ts);
      const text = typeof item.text === "string" ? item.text : "";
      const sender = item.user_profile?.real_name || item.username || item.user || "Unknown sender";
      const id = makePlatformId("slack", `${item.client_msg_id || item.ts || text.slice(0, 40)}`);
      posts.push({
        id,
        platform: "slack",
        entityType: "message",
        shortcode: id,
        canonicalUrl: "",
        creatorHandle: sender,
        authorName: sender,
        caption: text,
        textContent: text,
        mediaType: "text",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: ts,
        enrichments: {}
      });
      memberships.push({
        collectionId,
        postId: id,
        rank: memberships.filter((membership) => membership.collectionId === collectionId).length + 1,
        capturedAt: ts
      });
    }
  }

  return {
    sourceAccount: { username: "", lastSyncedAt: new Date().toISOString() },
    syncRun: { trigger: "slack-export-zip", status: "completed", completedAt: new Date().toISOString() },
    collections: Array.from(collections.values()),
    posts: dedupePosts(posts),
    memberships: dedupeMemberships(memberships),
    summary: {
      collectionsCaptured: collections.size,
      postsCaptured: dedupePosts(posts).length
    },
    notes: ["Imported from Slack export ZIP."],
    warnings: []
  };
}

function buildArchive({ platform, collectionTitle, collectionId, sourceLabel, posts, memberships }) {
  const now = new Date().toISOString();
  return {
    sourceAccount: { username: "", lastSyncedAt: now },
    syncRun: { trigger: `${platform}-import`, status: "completed", completedAt: now },
    collections: [
      {
        id: collectionId,
        platform,
        title: collectionTitle,
        url: "",
        kind: "thread",
        position: 1,
        capturedAt: now
      }
    ],
    posts: dedupePosts(posts),
    memberships: dedupeMemberships(memberships),
    summary: {
      collectionsCaptured: 1,
      postsCaptured: dedupePosts(posts).length
    },
    notes: [`Imported from ${sourceLabel}.`],
    warnings: []
  };
}

function deriveChatTitle(filename) {
  return (filename || "whatsapp-chat.txt")
    .replace(/\.[^.]+$/, "")
    .replace(/^chat with /i, "")
    .replace(/[_-]+/g, " ")
    .trim() || "WhatsApp chat";
}

function parseWhatsAppLine(line) {
  const modernMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[APMapm]{0,2})\s*-\s*([^:]+):\s*(.*)$/);
  const bracketMatch = line.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[APMapm]{0,2})\]\s*([^:]+):\s*(.*)$/);
  const match = modernMatch || bracketMatch;
  if (!match) {
    return null;
  }

  const [, datePart, timePart, senderRaw, messageRaw] = match;
  const isoTimestamp = toIsoDate(datePart, timePart);
  return {
    timestamp: `${datePart} ${timePart}`,
    isoTimestamp,
    sender: senderRaw.trim(),
    message: messageRaw.trim()
  };
}

function toIsoDate(datePart, timePart) {
  const normalized = `${datePart} ${timePart}`.replace(/\s+/g, " ").trim();
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return new Date().toISOString();
}

function looksLikeSlackZip(buffer) {
  try {
    const entries = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), {
      filter: (file) => /(^|[/\\])channels\.json$/i.test(file.name) || /(^|[/\\]).+[/\\].+\.json$/i.test(file.name)
    });
    return Object.keys(entries).length > 0;
  } catch {
    return false;
  }
}

function looksLikeArchiveJson(json) {
  return Boolean(json && typeof json === "object" && Array.isArray(json.posts) && Array.isArray(json.collections));
}

function looksLikeSlackJson(json, filename) {
  return /slack/i.test(filename || "") || (Array.isArray(json) && json.every((item) => typeof item === "object" && "text" in item));
}

function normalizeArchive(input) {
  return {
    ...input,
    posts: (input.posts || []).map((post) => ({
      ...post,
      platform: post.platform || inferPlatformFromUrl(post.canonicalUrl),
      textContent: post.textContent || post.caption || "",
      entityType: post.entityType || "post",
      enrichments: post.enrichments || {}
    })),
    collections: (input.collections || []).map((collection) => ({
      ...collection,
      platform: collection.platform || inferPlatformFromUrl(collection.url)
    }))
  };
}

function inferPlatformFromUrl(url) {
  const href = String(url || "");
  if (/instagram\.com/i.test(href)) return "instagram";
  if (/whatsapp\.com/i.test(href)) return "whatsapp";
  if (/slack\.com/i.test(href)) return "slack";
  if (/discord/i.test(href)) return "discord";
  if (/telegram\.org/i.test(href)) return "telegram";
  if (/linkedin\.com/i.test(href)) return "linkedin";
  if (/reddit\.com/i.test(href)) return "reddit";
  return "instagram";
}

function slackTimestampToIso(ts) {
  const numeric = Number(ts);
  if (Number.isFinite(numeric)) {
    return new Date(numeric * 1000).toISOString();
  }
  return new Date().toISOString();
}

function dedupePosts(posts) {
  const map = new Map();
  for (const post of posts) {
    if (post?.id && !map.has(post.id)) {
      map.set(post.id, post);
    }
  }
  return Array.from(map.values());
}

function dedupeMemberships(memberships) {
  const seen = new Set();
  const output = [];
  for (const membership of memberships) {
    const key = `${membership.collectionId}::${membership.postId}`;
    if (!membership.collectionId || !membership.postId || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(membership);
  }
  return output;
}
