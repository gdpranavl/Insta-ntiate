import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readArchive, patchPost } from "@/lib/archive-store";

export async function POST(request) {
  const { postId } = await request.json();

  const archive = await readArchive();
  const post = archive?.posts?.find((p) => p.id === postId);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const client = new Anthropic();
  const content = [];

  if (post.thumbnailUrl) {
    try {
      const imgRes = await fetch(post.thumbnailUrl);
      if (imgRes.ok) {
        const imgBuf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(imgBuf).toString("base64");
        const mediaType = imgRes.headers.get("content-type") || "image/jpeg";
        content.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        });
      }
    } catch (_error) {
      // continue without thumbnail
    }
  }

  const parts = ["This is a saved Instagram reel."];
  if (post.creatorHandle) parts.push(`Creator: ${post.creatorHandle}`);
  if (post.caption) parts.push(`Caption: "${post.caption.slice(0, 800)}"`);
  if (post.hashtags?.length) parts.push(`Hashtags: ${post.hashtags.slice(0, 10).join(" ")}`);
  parts.push("Write a concise 2-3 sentence summary of what this reel is about.");

  content.push({ type: "text", text: parts.join("\n") });

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 512,
    messages: [{ role: "user", content }],
  });

  const summary = message.content[0].text;
  await patchPost(postId, { summary });

  return NextResponse.json({ summary });
}
