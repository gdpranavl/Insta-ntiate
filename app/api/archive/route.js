import { NextResponse } from "next/server";
import { clearArchive, readArchive, writeArchive } from "@/lib/archive-store";

export async function GET() {
  const archive = await readArchive();
  return NextResponse.json({ archive });
}

export async function POST(request) {
  let archive;
  try {
    archive = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
    return NextResponse.json({ error: "Archive must be a JSON object" }, { status: 400 });
  }
  await writeArchive(archive);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearArchive();
  return NextResponse.json({ ok: true });
}
