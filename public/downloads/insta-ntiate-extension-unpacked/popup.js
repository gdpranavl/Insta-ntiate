const statusText = document.getElementById("statusText");
const statusDetail = document.getElementById("statusDetail");

document.getElementById("syncBtn").addEventListener("click", async () => {
  setStatus("Running", "Opening Instagram in background tabs.");
  const response = await chrome.runtime.sendMessage({ type: "RUN_SYNC", trigger: "popup" });
  if (!response?.ok) {
    setStatus("Failed", response?.error || "Sync failed.");
    return;
  }
  const a = response.result;
  setStatus("Synced", `Captured ${a.summary.postsCaptured} posts across ${a.summary.collectionsCaptured} collection(s).`);
});

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.();
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok || !response.archive) {
    setStatus("No archive", "Sync first, then export.");
    return;
  }
  const json = JSON.stringify(response.archive, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "insta-ntiate-archive.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Exported", "Archive JSON downloaded.");
});

hydrate();

async function hydrate() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok) return;
  const run = response.syncRun;
  if (!run) {
    setStatus("Idle", "No sync yet.");
    return;
  }
  const at = run.completedAt ? new Date(run.completedAt).toLocaleTimeString() : "—";
  if (run.status === "failed") {
    setStatus("Failed", run.errors?.[0] || "Last run failed.");
  } else {
    setStatus(capitalize(run.status), `Last run ${at} · ${response.archive?.summary?.postsCaptured || 0} posts.`);
  }
}

function setStatus(title, detail) {
  statusText.textContent = title;
  statusDetail.textContent = detail;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "Unknown";
}
