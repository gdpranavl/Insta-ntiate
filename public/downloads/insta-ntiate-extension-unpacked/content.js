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
    return collectCurrentPage(message.platform);
  }
  throw new Error("Unsupported collector command.");
}

async function collectCurrentPage(platform) {
  await settlePage();

  if (platform === "instagram") {
    return collectInstagram();
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

function collectInstagram() {
  const path = location.pathname;
  if (/\/saved\/[^/]+\/?$/.test(path)) {
    const title = readText("h1, h2") || "Saved collection";
    const collectionId = makeId("instagram", title);
    const posts = Array.from(document.querySelectorAll("a[href*='/p/'], a[href*='/reel/']"))
      .map((anchor, index) => {
        const url = normalizeUrl(anchor.href);
        const shortcode = extractShortcode(url);
        return {
          id: makeId("instagram", shortcode || url),
          platform: "instagram",
          entityType: /\/reel\//.test(url) ? "reel" : "post",
          shortcode,
          canonicalUrl: url,
          creatorHandle: "",
          authorName: "",
          caption: anchor.querySelector("img")?.alt || "",
          textContent: anchor.querySelector("img")?.alt || "",
          mediaType: /\/reel\//.test(url) ? "video" : "image",
          thumbnailUrl: anchor.querySelector("img")?.src || "",
          videoUrl: "",
          capturedAt: new Date().toISOString(),
          enrichments: {},
          rank: index + 1
        };
      })
      .filter(uniqueById)
      .slice(0, 30);

    return buildFragment({
      platform: "instagram",
      collectionId,
      collectionTitle: title,
      collectionKind: "collection",
      collectionUrl: normalizeUrl(location.href),
      posts,
      note: `Instagram collection scraped from ${normalizeUrl(location.href)}.`
    });
  }

  if (/\/(p|reel)\//.test(path)) {
    const post = collectInstagramPost();
    return buildFragment({
      platform: "instagram",
      collectionId: makeId("instagram", "single-post"),
      collectionTitle: "Instagram direct captures",
      collectionKind: "captures",
      collectionUrl: "https://www.instagram.com/",
      posts: [post],
      note: "Instagram post captured from current page."
    });
  }

  const overviewCollections = Array.from(document.querySelectorAll("a[href*='/saved/']"))
    .map((anchor) => ({
      id: makeId("instagram", anchor.textContent || anchor.href),
      platform: "instagram",
      title: (anchor.textContent || anchor.getAttribute("aria-label") || "Saved collection").trim(),
      url: normalizeUrl(anchor.href),
      kind: "collection",
      position: 1,
      capturedAt: new Date().toISOString()
    }))
    .filter((collection) => collection.url && !/\/saved\/?$/.test(collection.url))
    .filter(uniqueById)
    .slice(0, 20);

  return {
    sourceAccount: { username: "", lastSyncedAt: new Date().toISOString() },
    collections: overviewCollections,
    posts: [],
    memberships: [],
    notes: ["Instagram saved overview captured from the current page."],
    warnings: overviewCollections.length ? [] : ["Instagram page did not contain a saved collection or direct post."]
  };
}

function collectInstagramPost() {
  const ogDescription = meta("og:description");
  const creator = (ogDescription.match(/@([a-z0-9._]+)/i) || [])[1] || "";
  const caption = ogDescription
    .replace(/^[^:]+:\s*/, "")
    .replace(/\s*-\s*Instagram.*$/i, "")
    .trim();
  const url = normalizeUrl(location.href);
  const shortcode = extractShortcode(url);

  return {
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

function buildFragment({ platform, collectionId, collectionTitle, collectionKind, collectionUrl, posts, note }) {
  const now = new Date().toISOString();
  const safePosts = posts || [];
  return {
    sourceAccount: {
      username: "",
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
