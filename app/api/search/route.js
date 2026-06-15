import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readArchive } from "@/lib/archive-store";

export async function POST(request) {
  let query;
  try {
    ({ query } = await request.json());
  } catch {
    return NextResponse.json({ ids: [], error: "Invalid JSON body" }, { status: 400 });
  }
  if (!query?.trim()) return NextResponse.json({ ids: [], error: "Empty query" });

  const archive = await readArchive();
  if (!archive?.posts?.length) return NextResponse.json({ ids: [], error: "No posts in archive" });

  const client = new Anthropic();

  // Build a compact index — id → searchable text
  const posts = archive.posts.map((p) => ({
    id: p.id,
    text: [p.creatorHandle, p.caption, ...(p.hashtags || []), ...(p.semanticTags || []), p.summary || ""]
      .filter(Boolean).join(" ").slice(0, 400),
  }));

  const postBlock = posts.map((p) => `ID:${p.id} | ${p.text}`).join("\n");

  let message;
  try {
    message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a search engine for a user's saved Instagram posts. Return the IDs of posts that match the query, ranked best-first.

IMPORTANT: Only use IDs that appear exactly as listed below. Return raw JSON only — no markdown, no explanation.

Query: "${query}"

Available posts:
${postBlock}

Required output format (raw JSON, nothing else):
{"ids":["exact-id-1","exact-id-2"]}

If nothing matches, return: {"ids":[]}`,
      }],
    });
  } catch (error) {
    return NextResponse.json({ ids: [], error: `AI request failed: ${error.message}` }, { status: 502 });
  }

  const raw = message.content[0]?.text?.trim() ?? "";

  // Strip markdown code fences if Claude wraps its response
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Validate — only return IDs that actually exist in the archive
    const validIds = new Set(archive.posts.map((p) => p.id));
    const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((id) => validIds.has(id)) : [];
    return NextResponse.json({ ids });
  } catch {
    // Last resort: extract anything that looks like an ID from the raw text
    const validIds = new Set(archive.posts.map((p) => p.id));
    const found = [...raw.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((id) => validIds.has(id));
    return NextResponse.json({ ids: found });
  }
}
