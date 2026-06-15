import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data");
const archiveFile = path.join(dataDirectory, "archive.json");

export async function readArchive() {
  let contents;
  try {
    contents = await readFile(archiveFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null; // no archive yet — the expected empty state
    throw error; // EACCES / EISDIR / etc. must not be masked as "no data"
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    // Corruption is logged (not silently masked) but degrades to the empty state
    // so the app stays usable instead of crashing.
    console.error(`archive.json is corrupted; treating as empty: ${error.message}`);
    return null;
  }
}

export async function writeArchive(archive) {
  await mkdir(dataDirectory, { recursive: true });
  // Write to a per-call temp file then rename into place. A unique suffix keeps
  // concurrent in-process writes from colliding on a shared temp path, and the
  // rename is retried because on Windows it transiently fails with EPERM/EBUSY
  // when another handle (a reader, the search indexer, antivirus) holds the file.
  const tmpFile = `${archiveFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpFile, JSON.stringify(archive, null, 2), "utf8");
    let lastError;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await rename(tmpFile, archiveFile);
        return;
      } catch (error) {
        if (error.code !== "EPERM" && error.code !== "EACCES" && error.code !== "EBUSY") {
          throw error;
        }
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
      }
    }
    throw lastError;
  } finally {
    await rm(tmpFile, { force: true }).catch(() => {});
  }
}

export async function clearArchive() {
  await rm(archiveFile, { force: true });
}

// Serialize read-modify-write mutations so concurrent note/summary patches can't
// clobber each other (lost update). Returns true if the post was found and saved.
let writeChain = Promise.resolve();

export function patchPost(postId, fields) {
  const run = writeChain.then(async () => {
    const archive = await readArchive();
    if (!archive?.posts) return false;
    const idx = archive.posts.findIndex((p) => p.id === postId);
    if (idx === -1) return false;
    archive.posts[idx] = { ...archive.posts[idx], ...fields };
    await writeArchive(archive);
    return true;
  });
  writeChain = run.then(() => {}, () => {});
  return run;
}
