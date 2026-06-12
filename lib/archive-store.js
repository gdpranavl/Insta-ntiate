import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data");
const archiveFile = path.join(dataDirectory, "archive.json");

export async function readArchive() {
  try {
    const contents = await readFile(archiveFile, "utf8");
    return JSON.parse(contents);
  } catch (_error) {
    return null;
  }
}

export async function writeArchive(archive) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(archiveFile, JSON.stringify(archive, null, 2), "utf8");
}

export async function clearArchive() {
  await rm(archiveFile, { force: true });
}

export async function patchPost(postId, fields) {
  const archive = await readArchive();
  if (!archive?.posts) return;
  const idx = archive.posts.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    archive.posts[idx] = { ...archive.posts[idx], ...fields };
    await writeArchive(archive);
  }
}
