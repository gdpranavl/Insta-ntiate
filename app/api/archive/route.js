import { NextResponse } from "next/server";
import { clearArchive, readArchive, writeArchive } from "@/lib/archive-store";

export async function GET() {
  const archive = await readArchive();
  return NextResponse.json({ archive });
}

export async function POST(request) {
  const archive = await request.json();
  await writeArchive(archive);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearArchive();
  return NextResponse.json({ ok: true });
}
