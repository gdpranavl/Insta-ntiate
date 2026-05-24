import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const mediaDirectory = path.join(process.cwd(), "public", "downloads", "instagram-media");
const manifestFile = path.join(mediaDirectory, "manifest.json");

export async function persistInstagramMedia(archive) {
  const nextArchive = cloneArchive(archive);
  const warnings = new Set(Array.isArray(nextArchive.warnings) ? nextArchive.warnings : []);
  const manifest = await readManifest();
  const manifestByPostId = new Map((manifest.items || []).map((item) => [item.postId, item]));

  await mkdir(mediaDirectory, { recursive: true });

  let downloaded = 0;
  let skipped = 0;

  for (const post of nextArchive.posts || []) {
    if (!isInstagramVideoCandidate(post)) {
      continue;
    }

    const existing = manifestByPostId.get(post.id);
    if (existing && existing.relativePath && existsSync(path.join(process.cwd(), existing.relativePath))) {
      ensureEnrichment(post, existing);
      skipped += 1;
      continue;
    }

    try {
      const resolved = await resolveVideoSource(post);
      if (!resolved.videoUrl) {
        warnings.add(`Could not resolve video URL for ${post.canonicalUrl || post.id}.`);
        continue;
      }

      const fileName = buildFileName(post, resolved.videoUrl);
      const absolutePath = path.join(mediaDirectory, fileName);
      const relativePath = path.posix.join("public", "downloads", "instagram-media", fileName);

      if (!existsSync(absolutePath)) {
        await downloadToFile(resolved.videoUrl, absolutePath, resolved.referer || post.canonicalUrl || "");
      }

      const entry = {
        postId: post.id,
        shortcode: post.shortcode || "",
        canonicalUrl: post.canonicalUrl || "",
        sourcePageUrl: resolved.sourcePageUrl || post.canonicalUrl || "",
        sourceVideoUrl: resolved.videoUrl,
        relativePath,
        downloadedAt: new Date().toISOString()
      };

      manifest.items = [...(manifest.items || []).filter((item) => item.postId !== post.id), entry];
      ensureEnrichment(post, entry);
      downloaded += 1;
    } catch (error) {
      warnings.add(`Instagram video download failed for ${post.canonicalUrl || post.id}: ${error.message}`);
    }
  }

  await writeManifest(manifest);

  nextArchive.mediaAssets = manifest.items || [];
  nextArchive.warnings = Array.from(new Set([...(nextArchive.warnings || []), ...warnings]));

  return {
    archive: nextArchive,
    summary: {
      downloaded,
      skipped,
      totalTracked: manifest.items.length
    }
  };
}

async function resolveVideoSource(post) {
  const directVideoUrl = normalizeUrl(post.videoUrl || "", post.canonicalUrl || "");
  if (directVideoUrl) {
    return { videoUrl: directVideoUrl, sourcePageUrl: post.canonicalUrl || "", referer: post.canonicalUrl || "" };
  }

  const pageUrl = post.canonicalUrl || "";
  if (!pageUrl) {
    return { videoUrl: "", sourcePageUrl: "", referer: "" };
  }

  const response = await fetch(pageUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`page request failed (${response.status})`);
  }

  const html = await response.text();
  const videoUrl = extractVideoUrlFromHtml(html, pageUrl);
  return { videoUrl, sourcePageUrl: pageUrl, referer: pageUrl };
}

function extractVideoUrlFromHtml(html, pageUrl) {
  const candidates = [
    /<meta[^>]+property=["']og:video(?:[:]?url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
    /"video_url"\s*:\s*"([^"]+)"/i
  ];

  for (const regex of candidates) {
    const match = String(html || "").match(regex);
    if (match?.[1]) {
      return normalizeUrl(decodeHtmlEntities(match[1]), pageUrl);
    }
  }

  return "";
}

async function downloadToFile(url, destination, referer) {
  const response = await fetch(url, {
    headers: referer ? { referer } : undefined
  });

  if (!response.ok || !response.body) {
    throw new Error(`video request failed (${response.status})`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

function isInstagramVideoCandidate(post) {
  return Boolean(
    post &&
      post.platform === "instagram" &&
      (post.entityType === "reel" || post.mediaType === "video" || /\/reel\//.test(post.canonicalUrl || "") || post.videoUrl)
  );
}

function ensureEnrichment(post, entry) {
  post.enrichments = {
    ...(post.enrichments || {}),
    localMediaPath: entry.relativePath,
    localMediaDownloadedAt: entry.downloadedAt,
    sourceVideoUrl: entry.sourceVideoUrl || post.videoUrl || ""
  };
  if (!post.videoUrl && entry.sourceVideoUrl) {
    post.videoUrl = entry.sourceVideoUrl;
  }
}

function buildFileName(post, videoUrl) {
  const base = [post.shortcode, post.id, deriveNameFromUrl(videoUrl)].filter(Boolean).join("-");
  return `${sanitizeFilePart(base || `instagram-${Date.now()}`)}.mp4`;
}

function deriveNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const tail = path.basename(parsed.pathname).replace(/\.[a-z0-9]+$/i, "");
    return tail || "video";
  } catch {
    return "video";
  }
}

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeUrl(value, base = "") {
  if (!value) return "";
  try {
    return new URL(value, base || undefined).toString();
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cloneArchive(archive) {
  return JSON.parse(JSON.stringify(archive || {}));
}

async function readManifest() {
  try {
    const raw = await readFile(manifestFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}

async function writeManifest(manifest) {
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");
}