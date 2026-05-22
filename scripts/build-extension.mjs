import { readFile, readdir, mkdir, rm, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const root = process.cwd();
const sourceDir = path.join(root, "extension");
const publicDownloads = path.join(root, "public", "downloads");
const unpackedDir = path.join(publicDownloads, "insta-ntiate-extension-unpacked");
const zipPath = path.join(publicDownloads, "insta-ntiate-extension.zip");
const legacyDownloads = path.join(root, "downloads");

async function listFilesRecursive(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)));
    } else {
      out.push({ rel, full });
    }
  }
  return out;
}

async function build() {
  if (!existsSync(sourceDir)) {
    console.error(`No extension/ source at ${sourceDir}`);
    process.exitCode = 1;
    return;
  }

  await rm(publicDownloads, { recursive: true, force: true });
  await mkdir(publicDownloads, { recursive: true });

  await cp(sourceDir, unpackedDir, { recursive: true });

  const files = await listFilesRecursive(sourceDir);
  const zipPayload = {};
  for (const file of files) {
    const bytes = await readFile(file.full);
    zipPayload[file.rel.replace(/\\/g, "/")] = new Uint8Array(bytes);
  }
  const zipped = zipSync(zipPayload, { level: 9 });
  await writeFile(zipPath, zipped);

  if (existsSync(legacyDownloads)) {
    await rm(legacyDownloads, { recursive: true, force: true });
    console.log("Removed legacy top-level downloads/ (single source of truth is extension/).");
  }

  console.log(`Built extension distribution:`);
  console.log(`  unpacked: ${path.relative(root, unpackedDir)}`);
  console.log(`  zip:      ${path.relative(root, zipPath)} (${(zipped.byteLength / 1024).toFixed(1)} KB)`);
  console.log(`  source files: ${files.length}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
