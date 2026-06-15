import { NextResponse } from "next/server";
import { patchPost } from "@/lib/archive-store";

export async function POST(request) {
  const { postId, note } = await request.json();
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  await patchPost(postId, { note: note || "" });
  return NextResponse.json({ ok: true });
}
