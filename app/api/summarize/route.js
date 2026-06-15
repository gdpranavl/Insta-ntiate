import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readArchive, patchPost } from "@/lib/archive-store";

export async function POST(request) {
  let postId;
  try {
    ({ postId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!postId || typeof postId !== "string") {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const archive = await readArchive();
  const post = archive?.posts?.find((p) => p.id === postId);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const client = new Anthropic();
  const content = [];

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  if (post.thumbnailUrl) {
    // Attaching the thumbnail is best-effort. A timeout, a non-image response
    // (expired Instagram CDN URLs often 200 with an HTML login page), an
    // unsupported subtype, or an oversized body all fall through to a
    // text-only summary instead of failing the whole request.
    try {
      const imgRes = await fetch(post.thumbnailUrl, { signal: AbortSignal.timeout(8000) });
      const contentType = (imgRes.headers.get("content-type") || "").split(";")[0].trim();
      const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      const declaredLen = Number(imgRes.headers.get("content-length") || 0);
      if (imgRes.ok && supported.includes(contentType) && declaredLen <= MAX_IMAGE_BYTES) {
        const imgBuf = await imgRes.arrayBuffer();
        if (imgBuf.byteLength <= MAX_IMAGE_BYTES) {
          const b64 = Buffer.from(imgBuf).toString("base64");
          content.push({
            type: "image",
            source: { type: "base64", media_type: contentType, data: b64 },
          });
        }
      }
    } catch (_error) {}
  }

  const lines = [
    `Analyse this saved Instagram reel. Respond with ONLY valid JSON — no markdown, no extra text — in this exact shape:
{"summary":"2-3 sentences describing what the reel shows and what it is about. Be direct and descriptive.","tags":["concept1","concept2","concept3","concept4","concept5"]}

Tags should be 5-8 short concept/theme labels (e.g. "morning routine", "travel tips", "yoga", "recipe", "outfit inspo", "productivity", "aesthetic", "fitness", "cooking", "motivation") that let users find this reel by idea, not just keyword.`,
  ];
  if (post.creatorHandle) lines.push(`Creator: ${post.creatorHandle}`);
  if (post.caption) lines.push(`Caption: "${post.caption.slice(0, 800)}"`);
  if (post.hashtags?.length) lines.push(`Hashtags: ${post.hashtags.slice(0, 10).join(" ")}`);

  content.push({ type: "text", text: lines.join("\n") });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    return NextResponse.json({ error: `AI request failed: ${error.message}` }, { status: 502 });
  }

  let summary = "";
  let semanticTags = [];

  // Extract the text block once, safely, so the fallback never re-throws.
  const rawText = (message.content.find((b) => b.type === "text")?.text ?? "").trim();
  try {
    const parsed = JSON.parse(rawText);
    summary = parsed.summary || "";
    semanticTags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase()) : [];
  } catch (_parseError) {
    summary = rawText;
  }

  await patchPost(postId, { summary, semanticTags });

  return NextResponse.json({ summary, semanticTags });
}
