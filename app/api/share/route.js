import { NextResponse } from "next/server";
import { mergeIntoArchive } from "@/lib/archive-store";
import { corsHeaders, getAppOrigin } from "@/lib/config";

function withCors(response, origin) {
  for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
  return response;
}

export async function OPTIONS(request) {
  return withCors(new NextResponse(null, { status: 204 }), request.headers.get("origin") || "");
}

export async function GET(request) {
  const url = new URL(request.url);
  const shared = url.searchParams.get("url") || url.searchParams.get("text") || "";
  return handleSharedUrl(shared);
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  let shared = "";
  let title = "";
  let text = "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    shared = body.url || body.text || "";
    title = body.title || "";
    text = body.text || "";
  } else {
    const form = await request.formData().catch(() => null);
    if (form) {
      shared = form.get("url")?.toString() || form.get("text")?.toString() || "";
      title = form.get("title")?.toString() || "";
      text = form.get("text")?.toString() || "";
    }
  }

  return handleSharedUrl(shared, { title, text });
}

async function handleSharedUrl(shared, extra = {}) {
  const igMatch = String(shared || "").match(/https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([^/?#]+)/i);
  if (!igMatch) {
    return NextResponse.redirect(`${getAppOrigin()}/?shared=invalid`, 303);
  }
  const [fullUrl, kind, shortcode] = igMatch;
  const canonicalUrl = `https://www.instagram.com/${kind}/${shortcode}/`;
  const now = new Date().toISOString();

  await mergeIntoArchive({
    sourceAccount: { username: "", lastSyncedAt: now },
    syncRun: { trigger: "share-target", status: "completed", completedAt: now },
    collections: [],
    posts: [
      {
        id: shortcode,
        shortcode,
        canonicalUrl,
        creatorHandle: "",
        caption: extra.text || "",
        mediaType: kind === "reel" ? "video" : "image",
        thumbnailUrl: "",
        videoUrl: "",
        capturedAt: now,
        enrichments: {},
        source: "share-target",
        sharedTitle: extra.title || ""
      }
    ],
    memberships: [],
    notes: ["Saved via mobile share sheet."]
  });

  return NextResponse.redirect(`${getAppOrigin()}/?shared=ok&id=${encodeURIComponent(shortcode)}`, 303);
}
