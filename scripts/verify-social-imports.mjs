import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  parseSlackJsonExport,
  parseSlackZipExport,
  parseWhatsAppExportText
} from "../lib/social-import.js";

function verifyWhatsApp() {
  const archive = parseWhatsAppExportText(
    "24/05/2026, 10:31 AM - Pranav: hello there\n24/05/2026, 10:32 AM - Harshita: checking export\ncontinued line",
    "Chat with Team.txt"
  );

  assert.equal(archive.collections.length, 1);
  assert.equal(archive.posts.length, 2);
  assert.equal(archive.posts[0].platform, "whatsapp");
  assert.match(archive.posts[1].textContent, /continued line/);
}

function verifySlackJson() {
  const archive = parseSlackJsonExport(
    [
      {
        ts: "1716514410.000200",
        text: "shipping multi-social sync",
        user: "U123",
        username: "team-bot"
      }
    ],
    "product-room.json"
  );

  assert.equal(archive.collections.length, 1);
  assert.equal(archive.posts.length, 1);
  assert.equal(archive.posts[0].platform, "slack");
  assert.match(archive.posts[0].textContent, /multi-social sync/);
}

function verifySlackZip() {
  const zip = zipSync({
    "general/2026-05-24.json": strToU8(
      JSON.stringify([
        {
          ts: "1716514410.000200",
          text: "zip export message",
          user: "U123",
          username: "zip-bot"
        }
      ])
    ),
    "channels.json": strToU8(JSON.stringify([{ name: "general" }]))
  });

  const archive = parseSlackZipExport(zip);
  assert.equal(archive.collections.length, 1);
  assert.equal(archive.posts.length, 1);
  assert.equal(archive.posts[0].platform, "slack");
  assert.match(archive.notes[0], /Slack export ZIP/);
}

verifyWhatsApp();
verifySlackJson();
verifySlackZip();

console.log("Verified WhatsApp and Slack import parsers.");
