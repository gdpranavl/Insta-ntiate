import { NextResponse } from "next/server";
import { mergeIntoArchive, writeArchive } from "@/lib/archive-store";
import { corsHeaders, MAX_ARCHIVE_BYTES } from "@/lib/config";
import { parseSocialImportPayload } from "@/lib/social-import";

function withCors(response, origin) {
  for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
  return response;
}

export async function OPTIONS(request) {
  return withCors(new NextResponse(null, { status: 204 }), request.headers.get("origin") || "");
}

export const runtime = "nodejs";

export async function POST(request) {
  const origin = request.headers.get("origin") || "";
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_ARCHIVE_BYTES * 8) {
    return withCors(NextResponse.json({ ok: false, error: "File too large (cap is 80 MB)." }, { status: 413 }), origin);
  }

  let buffer = null;
  let filename = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (file && typeof file !== "string") {
      filename = file.name || "";
      buffer = new Uint8Array(await file.arrayBuffer());
    }
  } catch {
    // fall through
  }

  if (!buffer) {
    try {
      const raw = await request.arrayBuffer();
      buffer = new Uint8Array(raw);
      filename = request.headers.get("x-filename") || "upload.json";
    } catch {
      return withCors(NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 }), origin);
    }
  }

  let archive;
  try {
    archive = await parseSocialImportPayload({ buffer, filename });
  } catch (error) {
    return withCors(NextResponse.json({ ok: false, error: error.message || "Could not parse upload." }, { status: 400 }), origin);
  }

  const mode = request.headers.get("x-instantiate-mode") || "merge";
  const result = mode === "replace"
    ? (await writeArchive(archive), archive)
    : await mergeIntoArchive(archive);

  return withCors(NextResponse.json({
    ok: true,
    archive: result,
    summary: {
      collections: result.collections?.length || 0,
      posts: result.posts?.length || 0
    }
  }), origin);
}
