import { NextResponse } from "next/server";
import { clearArchive, mergeIntoArchive, readArchive, writeArchive } from "@/lib/archive-store";
import { persistInstagramMedia } from "@/lib/instagram-media-store";
import { MAX_ARCHIVE_BYTES, corsHeaders } from "@/lib/config";

export const runtime = "nodejs";

function withCors(response, origin) {
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

export async function OPTIONS(request) {
  return withCors(new NextResponse(null, { status: 204 }), request.headers.get("origin") || "");
}

export async function GET(request) {
  const archive = await readArchive();
  return withCors(NextResponse.json({ archive }), request.headers.get("origin") || "");
}

export async function POST(request) {
  const origin = request.headers.get("origin") || "";
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_ARCHIVE_BYTES) {
    return withCors(NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 }), origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }), origin);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return withCors(NextResponse.json({ ok: false, error: "Body must be an object" }, { status: 400 }), origin);
  }

  const mode = request.headers.get("x-instantiate-mode") || "replace";
  const archive = normalizeIncoming(body);

  if (mode === "merge") {
    const merged = await mergeIntoArchive(archive);
    const mediaResult = await persistInstagramMedia(merged);
    const enriched = mediaResult.archive;
    await writeArchive(enriched);
    return withCors(NextResponse.json({ ok: true, archive: enriched, media: mediaResult.summary }), origin);
  }

  await writeArchive(archive);
  const mediaResult = await persistInstagramMedia(archive);
  const enriched = mediaResult.archive;
  await writeArchive(enriched);
  return withCors(NextResponse.json({ ok: true, archive: enriched, media: mediaResult.summary }), origin);
}

export async function DELETE(request) {
  await clearArchive();
  return withCors(NextResponse.json({ ok: true }), request.headers.get("origin") || "");
}

function normalizeIncoming(input) {
  return {
    sourceAccount: input.sourceAccount || { username: "", lastSyncedAt: new Date().toISOString() },
    syncRun: input.syncRun || null,
    collections: (Array.isArray(input.collections) ? input.collections : []).map((collection) => ({
      ...collection,
      platform: collection.platform || "instagram",
      kind: collection.kind || "collection"
    })),
    posts: (Array.isArray(input.posts) ? input.posts : []).map((p) => ({
      ...p,
      platform: p.platform || "instagram",
      entityType: p.entityType || "post",
      textContent: p.textContent || p.caption || "",
      authorName: p.authorName || p.creatorHandle || "",
      enrichments: p.enrichments || {}
    })),
    memberships: Array.isArray(input.memberships) ? input.memberships : [],
    summary: input.summary || {
      collectionsCaptured: (input.collections || []).length,
      postsCaptured: (input.posts || []).length
    },
    notes: Array.isArray(input.notes) ? input.notes : [],
    warnings: Array.isArray(input.warnings) ? input.warnings : []
  };
}
