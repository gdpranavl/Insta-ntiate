import { NextResponse } from "next/server";
import { patchPost } from "@/lib/archive-store";

export async function POST(request) {
  let postId, note;
  try {
    ({ postId, note } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  await patchPost(postId, { note: note || "" });
  return NextResponse.json({ ok: true });
}
