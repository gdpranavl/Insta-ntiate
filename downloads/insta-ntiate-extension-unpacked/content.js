(function bootstrapContentScript() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();

async function handleMessage(message) {
  if (message?.type === "CHECK_LOGIN") {
    return checkLoginStatus();
  }

  if (message?.type === "SCRAPE_SAVED_OVERVIEW") {
    return scrapeSavedOverview(message.collectionLimit || 2);
  }

  if (message?.type === "SCRAPE_COLLECTION_DETAIL") {
    return scrapeCollectionDetail(message.collection, message.postLimit || 5);
  }

  if (message?.type === "SCRAPE_POST_DETAIL") {
    return scrapePostDetail(message.post, message.collectionTitle);
  }

  throw new Error("Unsupported scrape command.");
}

async function checkLoginStatus() {
  await delay(2500);

  if (window.location.pathname.includes("/accounts/login/") ||
      window.location.pathname.includes("/accounts/emailsignup/")) {
    return { loggedIn: false, username: null };
  }

  const username = readUsername() || readViewerUsername();
  if (username) {
    return { loggedIn: true, username };
  }

  return { loggedIn: false, username: null };
}

function readViewerUsername() {
  const html = document.documentElement.innerHTML;
  const patterns = [
    /"viewer"\s*:\s*\{[^}]*?"username"\s*:\s*"([^"]+)"/,
    /"config"\s*:\s*\{[^}]*?"viewer_id"\s*:\s*"[^"]*"[^}]*?"username"\s*:\s*"([^"]+)"/,
    /"logging_page_id"\s*:\s*"[^"]*profilePage_(\d+)"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

async function scrapeSavedOverview(collectionLimit) {
  await settlePage();
  await autoScroll(2);

  const username = readUsername();
  const collectionCandidates = collectCollectionCards();
  const collections = collectionCandidates.slice(0, collectionLimit).map((item, index) => ({
    id: item.id || `collection-${index + 1}`,
    title: item.title || `Collection ${index + 1}`,
    url: item.url,
    position: index + 1
  }));

  if (!collections.length) {
    throw new Error("No saved collections were found. Make sure Instagram is logged in and the saved page is accessible.");
  }

  return { username, collections };
}

async function scrapeCollectionDetail(collection, postLimit) {
  await settlePage();
  await autoScroll(3);

  const nodes = Array.from(document.querySelectorAll("a[href*='/p/'], a[href*='/reel/']"));
  const uniqueLinks = [];
  const seen = new Set();

  for (const node of nodes) {
    const href = normalizeInstagramUrl(node.href);
    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    uniqueLinks.push(href);
    if (uniqueLinks.length >= postLimit) {
      break;
    }
  }

  const posts = uniqueLinks.map((href, index) => ({
    id: extractShortcode(href),
    shortcode: extractShortcode(href),
    canonicalUrl: href,
    rank: index + 1
  }));

  return {
    collection: {
      id: collection.id,
      title: collection.title,
      url: collection.url,
      position: collection.position
    },
    posts
  };
}

async function scrapePostDetail(post, collectionTitle) {
  await settlePage();

  const metaDescription = readMetaDescription();
  const ogDescription = readMetaContent("og:description");
  const ogImage = readMetaContent("og:image");
  const ogVideo = readMetaContent("og:video");
  const jsonLd = readJsonLd();
  const media = readBestMediaCandidate(0);
  const creatorHandle =
    readCreatorHandle() ||
    readHandleFromMetaDescription(metaDescription) ||
    readHandleFromMetaDescription(ogDescription) ||
    jsonLd.author ||
    "";

  const caption =
    readCaptionFromJsonScripts() ||
    readCaptionFromMetaDescription(metaDescription) ||
    readCaptionFromMetaDescription(ogDescription) ||
    "";

  const hashtags = extractHashtags(caption);

  return {
    id: post.id,
    shortcode: post.shortcode,
    canonicalUrl: normalizeInstagramUrl(post.canonicalUrl),
    creatorHandle,
    caption,
    hashtags,
    mediaType: ogVideo || media.videoUrl ? "video" : "image",
    thumbnailUrl: media.thumbnailUrl || ogImage || "",
    videoUrl: media.videoUrl || ogVideo || "",
    capturedAt: new Date().toISOString(),
    rank: post.rank,
    collectionTitle
  };
}

function collectCollectionCards() {
  const anchors = Array.from(document.querySelectorAll("a[href*='/saved/'], a[href*='/your_activity/interactions/saved/']"));

  return anchors
    .map((anchor) => {
      const href = anchor.href;
      const title = anchor.textContent?.trim() || anchor.getAttribute("aria-label") || "";
      return {
        id: slugify(title || href),
        title,
        url: href
      };
    })
    .filter((item) => item.url)
    .filter((item) => !/\/saved\/?$/.test(item.url))
    .filter(uniqueByUrl);
}

function uniqueByUrl(item, index, list) {
  return list.findIndex((entry) => entry.url === item.url) === index;
}

function readUsername() {
  const match = document.documentElement.innerHTML.match(/"username":"([^"]+)"/);
  return match?.[1] || "";
}

function readCreatorHandle() {
  const heading = document.querySelector("header a[href^='/'], header h2 a[href^='/']");
  const value = heading?.textContent?.trim();
  return value ? `@${value.replace(/^@/, "")}` : "";
}

function readMetaDescription() {
  const meta = document.querySelector('meta[name="description"]');
  return meta?.content?.trim() || "";
}

function readMetaContent(property) {
  return (
    document.querySelector(`meta[property="${property}"]`)?.content?.trim() ||
    document.querySelector(`meta[name="${property}"]`)?.content?.trim() ||
    ""
  );
}

function readBestMediaCandidate(index) {
  const videos = Array.from(document.querySelectorAll("video"));
  const images = Array.from(document.querySelectorAll("img"));
  const video = videos[index] || videos[0];
  const image = images[index + 1] || images[0];

  return {
    videoUrl: video?.currentSrc || video?.src || "",
    thumbnailUrl: image?.currentSrc || image?.src || ""
  };
}

function extractShortcode(href) {
  const match = href.match(/\/(p|reel)\/([^/?#]+)/i);
  return match?.[2] || slugify(href);
}

function readCaptionFromJsonScripts() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]'));

  for (const script of scripts) {
    const text = script.textContent || "";
    const captionMatch = text.match(/"caption":"([^"]+)"/i) || text.match(/"accessibility_caption":"([^"]+)"/i);
    if (captionMatch?.[1]) {
      return decodeEscapedText(captionMatch[1]).slice(0, 2200);
    }
  }

  return "";
}

function readJsonLd() {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script?.textContent) {
    return {};
  }

  try {
    const parsed = JSON.parse(script.textContent);
    const authorName = parsed?.author?.alternateName || parsed?.author?.name || "";
    return {
      author: authorName ? `@${String(authorName).replace(/^@/, "")}` : ""
    };
  } catch (_error) {
    return {};
  }
}

function readHandleFromMetaDescription(text) {
  if (!text) {
    return "";
  }

  const match = text.match(/@([a-z0-9._]+)/i);
  return match?.[1] ? `@${match[1]}` : "";
}

function readCaptionFromMetaDescription(text) {
  if (!text) {
    return "";
  }

  const cleaned = text
    .replace(/^[\s\S]*?:\s*/, "")
    .replace(/\s*-\s*Instagram.*$/i, "")
    .trim();

  return cleaned.slice(0, 2200);
}

function extractHashtags(text) {
  if (!text) {
    return [];
  }
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((tag) => tag.toLowerCase()))];
}

function normalizeInstagramUrl(href) {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}`;
  } catch (_error) {
    return href;
  }
}

function decodeEscapedText(value) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch (_error) {
    return value;
  }
}

async function settlePage() {
  await delay(3200);
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function autoScroll(rounds) {
  for (let index = 0; index < rounds; index += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await delay(1000);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  await delay(500);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
