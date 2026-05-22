(function bootstrap() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();

async function handleMessage(message) {
  if (message?.type === "SCRAPE_USERNAME") {
    await settlePage();
    return { username: readUsername() };
  }
  if (message?.type === "SCRAPE_SAVED_OVERVIEW") {
    await settlePage();
    await autoScroll(4);
    return { username: readUsername(), collections: collectCollectionCards() };
  }
  if (message?.type === "SCRAPE_COLLECTION_DETAIL") {
    await settlePage();
    await autoScroll(5);
    return scrapeCollectionDetail(message.collection, message.postLimit || 0);
  }
  if (message?.type === "SCRAPE_POST_DETAIL") {
    await settlePage();
    return scrapePostDetail(message.post, message.collectionTitle);
  }
  throw new Error("Unsupported scrape command.");
}

function readUsername() {
  const match = document.documentElement.innerHTML.match(/"viewer":\s*\{[^}]*"username":"([^"]+)"/);
  if (match?.[1]) return match[1];
  const alt = document.documentElement.innerHTML.match(/"username":"([^"]+)"/);
  return alt?.[1] || "";
}

function collectCollectionCards() {
  const anchors = Array.from(document.querySelectorAll(
    "a[href*='/saved/'], a[href*='/your_activity/interactions/saved/']"
  ));
  return anchors
    .map((anchor) => ({
      url: anchor.href,
      title: anchor.textContent?.trim() || anchor.getAttribute("aria-label") || "",
      thumb: anchor.querySelector("img")?.src || ""
    }))
    .filter((item) => item.url)
    .filter((item) => !/\/saved\/?$/.test(item.url))
    .filter((item) => !/your_activity\/?(?:$|interactions\/?$)/.test(item.url))
    .map((item) => ({
      id: slugify(item.title || item.url),
      title: item.title || "Untitled",
      url: item.url,
      thumb: item.thumb
    }))
    .filter((item, index, list) => list.findIndex((entry) => entry.url === item.url) === index);
}

async function scrapeCollectionDetail(collection, postLimit) {
  const nodes = Array.from(document.querySelectorAll("a[href*='/p/'], a[href*='/reel/']"));
  const uniqueLinks = [];
  const seen = new Set();
  for (const node of nodes) {
    const href = normalizeUrl(node.href);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    uniqueLinks.push(href);
    if (postLimit && uniqueLinks.length >= postLimit) break;
  }
  const posts = uniqueLinks.map((href, index) => ({
    id: extractShortcode(href),
    shortcode: extractShortcode(href),
    canonicalUrl: href,
    rank: index + 1
  }));
  return { collection: { id: collection.id, title: collection.title, url: collection.url, position: collection.position }, posts };
}

async function scrapePostDetail(post, collectionTitle) {
  const ogImage = readMetaContent("og:image");
  const ogVideo = readMetaContent("og:video");
  const ogDescription = readMetaContent("og:description");
  const metaDescription = document.querySelector('meta[name="description"]')?.content?.trim() || "";
  const media = readBestMediaCandidate();
  const handle =
    readCreatorHandle() ||
    readHandleFromDescription(metaDescription) ||
    readHandleFromDescription(ogDescription) ||
    readAuthorFromJsonLd() ||
    "";
  const caption =
    readCaptionFromJson() ||
    readCaptionFromDescription(metaDescription) ||
    readCaptionFromDescription(ogDescription) ||
    "";
  return {
    id: post.id,
    shortcode: post.shortcode,
    canonicalUrl: normalizeUrl(post.canonicalUrl),
    creatorHandle: handle,
    caption,
    mediaType: ogVideo || media.videoUrl ? "video" : "image",
    thumbnailUrl: media.thumbnailUrl || ogImage || "",
    videoUrl: media.videoUrl || ogVideo || "",
    capturedAt: new Date().toISOString(),
    rank: post.rank,
    collectionTitle,
    enrichments: {}
  };
}

function readCreatorHandle() {
  const heading = document.querySelector("header a[href^='/'], header h2 a[href^='/']");
  const value = heading?.textContent?.trim();
  return value ? `@${value.replace(/^@/, "")}` : "";
}

function readMetaContent(property) {
  return (
    document.querySelector(`meta[property="${property}"]`)?.content?.trim() ||
    document.querySelector(`meta[name="${property}"]`)?.content?.trim() ||
    ""
  );
}

function readBestMediaCandidate() {
  const video = document.querySelector("video");
  const img = document.querySelector("article img") || document.querySelector("img");
  return {
    videoUrl: video?.currentSrc || video?.src || "",
    thumbnailUrl: img?.currentSrc || img?.src || ""
  };
}

function readAuthorFromJsonLd() {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script?.textContent) return "";
  try {
    const parsed = JSON.parse(script.textContent);
    const name = parsed?.author?.alternateName || parsed?.author?.name;
    return name ? `@${String(name).replace(/^@/, "")}` : "";
  } catch { return ""; }
}

function readCaptionFromJson() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]'));
  for (const script of scripts) {
    const text = script.textContent || "";
    const tryFields = [/"caption":\s*"((?:\\.|[^"\\])*)"/, /"accessibility_caption":\s*"((?:\\.|[^"\\])*)"/, /"text":\s*"((?:\\.|[^"\\])*)"/];
    for (const re of tryFields) {
      const match = text.match(re);
      if (match?.[1]) {
        try { return JSON.parse(`"${match[1]}"`).slice(0, 1200); }
        catch { return match[1].slice(0, 1200); }
      }
    }
  }
  return "";
}

function readHandleFromDescription(text) {
  if (!text) return "";
  const match = text.match(/@([a-z0-9._]+)/i);
  return match?.[1] ? `@${match[1]}` : "";
}

function readCaptionFromDescription(text) {
  if (!text) return "";
  return text.replace(/^[\s\S]*?:\s*/, "").replace(/\s*-\s*Instagram.*$/i, "").trim().slice(0, 1200);
}

function normalizeUrl(href) {
  try { const url = new URL(href); return `${url.origin}${url.pathname}`; }
  catch { return href; }
}

function extractShortcode(href) {
  const match = href.match(/\/(p|reel|tv)\/([^/?#]+)/i);
  return match?.[2] || slugify(href);
}

async function settlePage() {
  await delay(3000);
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function autoScroll(rounds) {
  for (let i = 0; i < rounds; i += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await delay(900);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  await delay(400);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
