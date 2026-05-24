(function bootstrapCollector() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();

async function handleMessage(message) {
  if (message?.type === "COLLECT_PLATFORM_PAGE") {
    return collectCurrentPage(message.platform, message.settings || {});
  }
  throw new Error("Unsupported collector command.");
}

async function collectCurrentPage(platform, settings = {}) {
  await settlePage();
  console.log("[Insta-ntiate][content] collectCurrentPage", { platform, path: location.pathname, settings });

  if (platform === "instagram") {
    return collectInstagram(settings);
  }
  if (platform === "whatsapp") {
    return collectWhatsApp();
  }
  if (platform === "slack") {
    return collectSlack();
  }
  if (platform === "discord") {
    return collectDiscord();
  }
  if (platform === "telegram") {
    return collectTelegram();
  }
  if (platform === "linkedin") {
    return collectLinkedIn();
  }
  if (platform === "reddit") {
    return collectReddit();
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function collectInstagram(settings = {}) {
  console.log("[Insta-ntiate][content] collectInstagram:start", { path: location.pathname, settings });
  const scopes = settings.enabledScopes || { saved: true, liked: false, history: false };
  const username = detectInstagramUsername();
  const savedPathInfo = parseInstagramSavedPath(location.pathname);
  if (savedPathInfo.mode === "collection") {
    if (!scopes.saved) {
      return {
        sourceAccount: { username: username || "", lastSyncedAt: new Date().toISOString() },
        collections: [],
        posts: [],
        memberships: [],
        notes: ["Instagram saved scope disabled in settings."],
        warnings: []
      };
    }
    const title = readText("h1, h2") || savedPathInfo.collectionTitle || "Saved collection";
    const collectionId = makeId("instagram", title);
    let posts = Array.from(document.querySelectorAll("article a[href*='/p/'], article a[href*='/reel/'], a[href*='/p/'], a[href*='/reel/']"))
      .map((anchor, index) => {
        const url = normalizeUrl(anchor.href);
        const shortcode = extractShortcode(url);
        const caption = anchor.querySelector("img")?.alt || "";
        const post = {
          id: makeId("instagram", shortcode || url),
          platform: "instagram",
          entityType: /\/reel\//.test(url) ? "reel" : "post",
          shortcode,
          canonicalUrl: url,
          creatorHandle: "",
          authorName: "",
          caption,
          textContent: caption,
          mediaType: /\/reel\//.test(url) ? "video" : "image",
          thumbnailUrl: anchor.querySelector("img")?.src || "",
          videoUrl: "",
          capturedAt: new Date().toISOString(),
          enrichments: {},
          rank: index + 1
        };
        return applyExtractionSettings(post, settings.extractionFields);
      })
      .filter(uniqueById);

    // determine limit: try to find a matching selectedCollections entry
    let limit = 30;
    if (Array.isArray(settings.selectedCollections) && settings.selectedCollections.length) {
      const found = settings.selectedCollections.find((c) => c.id === collectionId) || null;
      if (found && typeof found.reelCount === 'number') {
        limit = Math.max(0, Math.min(200, found.reelCount));
      }
    }
    if (!limit && typeof settings.reelCount === 'number') {
      limit = Math.max(0, Math.min(200, settings.reelCount));
    }
    posts = posts.slice(0, limit || 30);
    console.log("[Insta-ntiate][content] collectInstagram:collection", {
      username,
      title,
      collectionId,
      totalPosts: posts.length,
      limit
    });

    return buildFragment({
      platform: "instagram",
      collectionId,
      collectionTitle: title,
      collectionKind: "collection",
      collectionUrl: normalizeUrl(location.href),
      posts,
      note: `Instagram collection scraped from ${normalizeUrl(location.href)}.`,
      username
    });
  }

  if (/\/(p|reel)\//.test(location.pathname)) {
    const post = collectInstagramPost(settings);
    return buildFragment({
      platform: "instagram",
      collectionId: makeId("instagram", "single-post"),
      collectionTitle: "Instagram direct captures",
      collectionKind: "captures",
      collectionUrl: "https://www.instagram.com/",
      posts: [post],
      note: "Instagram post captured from current page.",
      username
    });
  }

  const overviewCollections = await collectInstagramSavedOverviewCollections();

  console.log("[Insta-ntiate][content] collectInstagram:overview", {
    username,
    collectionCount: overviewCollections.length
  });

  return {
    sourceAccount: { username: username || "", lastSyncedAt: new Date().toISOString() },
    collections: overviewCollections,
    posts: [],
    memberships: [],
    notes: ["Instagram saved overview captured from the current page."],
    warnings: overviewCollections.length ? [] : ["Instagram page did not contain a saved collection or direct post."]
  };
}

async function collectInstagramSavedOverviewCollections() {
  const discovered = new Map();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const batch = Array.from(document.querySelectorAll("a[href*='/saved/']"))
      .map((anchor, index) => {
        const url = normalizeUrl(anchor.href);
        const title = (anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || "Saved collection").trim();
        return {
          id: makeId("instagram", url || title || `${attempt}-${index}`),
          platform: "instagram",
          title,
          url,
          kind: "collection",
          position: index + 1,
          capturedAt: new Date().toISOString()
        };
      })
      .filter((collection) => collection.url && !/\/saved\/?$/.test(collection.url));

    for (const collection of batch) {
      const key = collection.url || collection.id;
      if (!discovered.has(key)) {
        discovered.set(key, collection);
      }
    }

    const beforeScrollCount = discovered.size;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    await delay(900);
    window.scrollTo({ top: 0, behavior: "instant" });
    await delay(500);

    const afterScrollBatch = Array.from(document.querySelectorAll("a[href*='/saved/']"))
      .map((anchor, index) => {
        const url = normalizeUrl(anchor.href);
        const title = (anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || "Saved collection").trim();
        return {
          id: makeId("instagram", url || title || `post-scroll-${attempt}-${index}`),
          platform: "instagram",
          title,
          url,
          kind: "collection",
          position: index + 1,
          capturedAt: new Date().toISOString()
        };
      })
      .filter((collection) => collection.url && !/\/saved\/?$/.test(collection.url));

    for (const collection of afterScrollBatch) {
      const key = collection.url || collection.id;
      if (!discovered.has(key)) {
        discovered.set(key, collection);
      }
    }

    if (discovered.size === beforeScrollCount) {
      break;
    }
  }

  // Run a second full sweep after the initial scroll pass to catch collections
  // that appear only after Instagram stabilizes the saved page DOM.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    await delay(1100);
    window.scrollTo({ top: 0, behavior: "instant" });
    await delay(700);

    const batch = Array.from(document.querySelectorAll("a[href*='/saved/']"))
      .map((anchor, index) => {
        const url = normalizeUrl(anchor.href);
        const title = (anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || "Saved collection").trim();
        return {
          id: makeId("instagram", url || title || `stability-${attempt}-${index}`),
          platform: "instagram",
          title,
          url,
          kind: "collection",
          position: index + 1,
          capturedAt: new Date().toISOString()
        };
      })
      .filter((collection) => collection.url && !/\/saved\/?$/.test(collection.url));

    for (const collection of batch) {
      const key = collection.url || collection.id;
      if (!discovered.has(key)) {
        discovered.set(key, collection);
      }
    }
  }

  return Array.from(discovered.values()).slice(0, 100);
}

function parseInstagramSavedPath(pathname) {
  const segments = String(pathname || "").split("/").filter(Boolean);
  const savedIndex = segments.findIndex((segment) => segment === "saved");
  if (savedIndex < 0) {
    return { mode: "none", collectionTitle: "" };
  }

  const hasCollectionSegment = segments.length >= savedIndex + 2;
  if (!hasCollectionSegment) {
    return { mode: "overview", collectionTitle: "" };
  }

  const rawTitle = decodeURIComponent(segments[savedIndex + 1] || "").replace(/-/g, " ").trim();
  const collectionTitle = rawTitle
    ? rawTitle.replace(/\b\w/g, (char) => char.toUpperCase())
    : "Saved collection";

  return { mode: "collection", collectionTitle };
}

function collectInstagramPost(settings = {}) {
  const ogDescription = meta("og:description");
  const creator = (ogDescription.match(/@([a-z0-9._]+)/i) || [])[1] || "";
  const caption = ogDescription
    .replace(/^[^:]+:\s*/, "")
    .replace(/\s*-\s*Instagram.*$/i, "")
    .trim();
  const url = normalizeUrl(location.href);
  const shortcode = extractShortcode(url);
  const obj = {
    id: makeId("instagram", shortcode || url),
    platform: "instagram",
    entityType: /\/reel\//.test(url) ? "reel" : "post",
    shortcode,
    canonicalUrl: url,
    creatorHandle: creator ? `@${creator}` : "",
    authorName: creator ? `@${creator}` : "",
    caption,
    textContent: caption,
    mediaType: meta("og:video") ? "video" : "image",
    thumbnailUrl: meta("og:image"),
    videoUrl: meta("og:video"),
    capturedAt: new Date().toISOString(),
    enrichments: {}
  };
  console.log("[Insta-ntiate][content] collectInstagramPost", {
    shortcode,
    url,
    hasVideo: Boolean(obj.videoUrl)
  });
  return applyExtractionSettings(obj, settings.extractionFields);
}

function applyExtractionSettings(post, extraction = {}) {
  const enabled = {
    id: extraction.id !== false,
    link: extraction.link !== false,
    caption: extraction.caption !== false,
    comments: extraction.comments === true,
    description: extraction.description !== false,
    audio: extraction.audio === true
  };

  const sanitized = { ...post };
  // id is required for merge/membership; keep it but allow redaction of display fields.
  if (!enabled.link) {
    sanitized.shortcode = "";
    sanitized.canonicalUrl = "";
  }
  if (!enabled.caption) {
    sanitized.caption = "";
    sanitized.textContent = "";
  }
  if (!enabled.description) {
    delete sanitized.description;
  }
  if (!enabled.audio) {
    delete sanitized.audio;
  }
  if (!enabled.comments) {
    delete sanitized.topComments;
  }

  return sanitized;
}

function collectWhatsApp() {
  const title = readText("header [title], header span[dir='auto']") || "WhatsApp chat";
  const collectionId = makeId("whatsapp", title);
  const messages = Array.from(document.querySelectorAll("[data-pre-plain-text]"))
    .map((node, index) => {
      const pre = node.getAttribute("data-pre-plain-text") || "";
      const sender = (pre.match(/\]\s([^:]+):/) || [])[1] || "Unknown sender";
      const textNode = node.querySelector(".selectable-text, .copyable-text");
      const text = textNode?.innerText?.trim() || "";
      const stamp = (pre.match(/\[(.+?)\]/) || [])[1] || `${index}`;
      return {
        id: makeId("whatsapp", `${title}-${stamp}-${text.slice(0, 32)}`),
        platform: "whatsapp",
        entityType: "message",
        shortcode: "",
        canonicalUrl: "",
        creatorHandle: sender,
        authorName: sender,
        caption: text,
        textContent: text,
        mediaType: "text",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((message) => message.textContent)
    .slice(-120);

  return buildFragment({
    platform: "whatsapp",
    collectionId,
    collectionTitle: title,
    collectionKind: "chat",
    collectionUrl: normalizeUrl(location.href),
    posts: messages,
    note: "WhatsApp Web chat captured from the current page."
  });
}

function collectSlack() {
  const title = readText("[data-qa='channel_name_header'], [data-qa='channel_header_title']") || "Slack channel";
  const collectionId = makeId("slack", title);
  const posts = Array.from(document.querySelectorAll("[data-qa='virtual-list-item']"))
    .map((node, index) => {
      const sender = readTextWithin(node, "[data-qa='message_sender_name'], [data-qa='message_sender']") || "Unknown sender";
      const text = readTextWithin(node, "[data-qa='message-text'], [data-qa='message-text-content']") || "";
      return {
        id: makeId("slack", `${title}-${index}-${text.slice(0, 32)}`),
        platform: "slack",
        entityType: "message",
        shortcode: "",
        canonicalUrl: "",
        creatorHandle: sender,
        authorName: sender,
        caption: text,
        textContent: text,
        mediaType: "text",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((message) => message.textContent)
    .slice(-120);

  return buildFragment({
    platform: "slack",
    collectionId,
    collectionTitle: title,
    collectionKind: "channel",
    collectionUrl: normalizeUrl(location.href),
    posts,
    note: "Slack messages captured from the current page."
  });
}

function collectDiscord() {
  const title = readText("[data-list-id='chat-messages'] ~ h1, h1[class*='title']") || "Discord channel";
  const collectionId = makeId("discord", title);
  const posts = Array.from(document.querySelectorAll("[id^='chat-messages-']"))
    .map((node, index) => {
      const sender = readTextWithin(node, "h3 span, [class*='username']") || "Unknown sender";
      const text = readTextWithin(node, "[class*='messageContent'], [class*='markup']") || "";
      return {
        id: makeId("discord", `${title}-${index}-${text.slice(0, 32)}`),
        platform: "discord",
        entityType: "message",
        shortcode: "",
        canonicalUrl: "",
        creatorHandle: sender,
        authorName: sender,
        caption: text,
        textContent: text,
        mediaType: "text",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((message) => message.textContent)
    .slice(-120);

  return buildFragment({
    platform: "discord",
    collectionId,
    collectionTitle: title,
    collectionKind: "channel",
    collectionUrl: normalizeUrl(location.href),
    posts,
    note: "Discord messages captured from the current page."
  });
}

function collectTelegram() {
  const title = readText("header h3, .topbar-title, .chat-info-wrapper") || "Telegram chat";
  const collectionId = makeId("telegram", title);
  const posts = Array.from(document.querySelectorAll(".message, .Message"))
    .map((node, index) => {
      const sender = readTextWithin(node, ".sender-title, .message-title, .UserTitle") || "Unknown sender";
      const text = readTextWithin(node, ".text-content, .text-content-inner, .message-text, .text") || "";
      return {
        id: makeId("telegram", `${title}-${index}-${text.slice(0, 32)}`),
        platform: "telegram",
        entityType: "message",
        shortcode: "",
        canonicalUrl: "",
        creatorHandle: sender,
        authorName: sender,
        caption: text,
        textContent: text,
        mediaType: "text",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((message) => message.textContent)
    .slice(-120);

  return buildFragment({
    platform: "telegram",
    collectionId,
    collectionTitle: title,
    collectionKind: "chat",
    collectionUrl: normalizeUrl(location.href),
    posts,
    note: "Telegram Web chat captured from the current page."
  });
}

function collectLinkedIn() {
  const collectionId = makeId("linkedin", "feed");
  const posts = Array.from(document.querySelectorAll("main article"))
    .map((node, index) => {
      const author = readTextWithin(node, ".update-components-actor__name, .feed-shared-actor__name") || "LinkedIn author";
      const text = readTextWithin(node, ".update-components-text, .feed-shared-update-v2__description") || "";
      const link = node.querySelector("a[href*='/feed/update/']")?.href || "";
      return {
        id: makeId("linkedin", link || `${author}-${index}-${text.slice(0, 32)}`),
        platform: "linkedin",
        entityType: "post",
        shortcode: "",
        canonicalUrl: normalizeUrl(link),
        creatorHandle: author,
        authorName: author,
        caption: text,
        textContent: text,
        mediaType: "mixed",
        thumbnailUrl: node.querySelector("img")?.src || "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((post) => post.textContent || post.canonicalUrl)
    .slice(0, 40);

  return buildFragment({
    platform: "linkedin",
    collectionId,
    collectionTitle: "LinkedIn feed",
    collectionKind: "feed",
    collectionUrl: normalizeUrl(location.href),
    posts,
    note: "LinkedIn feed posts captured from the current page."
  });
}

function collectReddit() {
  const title = readText("h1") || "Reddit feed";
  const collectionId = makeId("reddit", title);
  const posts = Array.from(document.querySelectorAll("shreddit-post, article"))
    .map((node, index) => {
      const heading = readTextWithin(node, "h3, [slot='title']") || "Reddit post";
      const body = readTextWithin(node, "[slot='text-body'], [data-click-id='text']") || "";
      const author = readTextWithin(node, "a[href*='/user/'], [slot='authorName']") || "u/unknown";
      const link = node.querySelector("a[href*='/comments/']")?.href || "";
      return {
        id: makeId("reddit", link || `${heading}-${index}`),
        platform: "reddit",
        entityType: "post",
        shortcode: "",
        canonicalUrl: normalizeUrl(link),
        creatorHandle: author,
        authorName: author,
        caption: `${heading}\n${body}`.trim(),
        textContent: `${heading}\n${body}`.trim(),
        mediaType: "mixed",
        thumbnailUrl: node.querySelector("img")?.src || "",
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        enrichments: {}
      };
    })
    .filter((post) => post.textContent || post.canonicalUrl)
    .slice(0, 40);

  return buildFragment({
    platform: "reddit",
    collectionId,
    collectionTitle: title,
    collectionKind: "subreddit",
    collectionUrl: normalizeUrl(location.href),
    posts,
    note: "Reddit posts captured from the current page."
  });
}

function buildFragment({ platform, collectionId, collectionTitle, collectionKind, collectionUrl, posts, note, username }) {
  const now = new Date().toISOString();
  const safePosts = posts || [];
  return {
    sourceAccount: {
      username: username || "",
      lastSyncedAt: now
    },
    collections: [
      {
        id: collectionId,
        platform,
        title: collectionTitle,
        url: collectionUrl,
        kind: collectionKind,
        position: 1,
        capturedAt: now
      }
    ],
    posts: safePosts,
    memberships: safePosts.map((post, index) => ({
      collectionId,
      postId: post.id,
      rank: index + 1,
      capturedAt: post.capturedAt || now
    })),
    notes: [note],
    warnings: safePosts.length ? [] : [`${platform} page did not expose any capturable items.`]
  };
}

function meta(property) {
  return document.querySelector(`meta[property="${property}"]`)?.content?.trim() || "";
}

function readText(selector) {
  const node = document.querySelector(selector);
  return node?.textContent?.trim() || "";
}

function readTextWithin(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function normalizeUrl(href) {
  try {
    const url = new URL(href || location.href, location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return href || "";
  }
}

function extractShortcode(href) {
  const match = String(href || "").match(/\/(p|reel|tv)\/([^/?#]+)/i);
  return match?.[2] || "";
}

function detectInstagramUsername() {
  // Try to read from path if available (/{username}/saved/...)
  const segments = location.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[1] === "saved") {
    return segments[0];
  }

  // Profile pages sometimes include profile:username
  const profileMeta = document.querySelector('meta[property="profile:username"]')?.content?.trim();
  if (profileMeta) {
    return profileMeta;
  }

  // Fallback: scan scripts for viewer username
  const scripts = Array.from(document.scripts || []);
  for (const script of scripts) {
    const text = script.textContent || "";
    let match = text.match(/"viewer"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
    match = text.match(/"username"\s*:\s*"([a-z0-9._]+)"\s*,\s*"id"\s*:\s*"\d+"/i);
    if (match?.[1]) return match[1];
  }

  return "";
}

function makeId(platform, seed) {
  return `${platform}:${String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)}`;
}

function uniqueById(item, index, list) {
  return list.findIndex((candidate) => candidate.id === item.id) === index;
}

async function settlePage() {
  await delay(1400);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
