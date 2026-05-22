const syncButton = document.getElementById("sync-button");
const exportButton = document.getElementById("export-button");
const intervalInput = document.getElementById("interval-input");
const saveIntervalButton = document.getElementById("save-interval-button");
const statusText = document.getElementById("status-text");
const statusDetail = document.getElementById("status-detail");

syncButton.addEventListener("click", async () => {
  setStatus("Running", "Opening Instagram saved collections in background tabs.");

  const response = await chrome.runtime.sendMessage({ type: "RUN_SYNC" });

  if (!response?.ok) {
    setStatus("Failed", response?.error || "Sync failed.");
    return;
  }

  const archive = response.result;
  const collectionCount = archive.collections?.length || 0;
  const postCount = archive.posts?.length || 0;
  setStatus("Completed", `Captured ${collectionCount} collections and ${postCount} posts.`);
});

exportButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_ARCHIVE" });

  if (!response?.ok || !response.archive) {
    setStatus("No archive", "Run a sync before exporting.");
    return;
  }

  if (!response.archive.posts?.length) {
    setStatus("No data", "The last sync did not capture any posts, so nothing useful was exported.");
    return;
  }

  const json = JSON.stringify(response.archive, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "insta-ntiate-archive.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Exported", "Archive JSON downloaded.");
});

saveIntervalButton.addEventListener("click", async () => {
  const minutes = Number(intervalInput.value);
  const response = await chrome.runtime.sendMessage({
    type: "SET_SYNC_INTERVAL",
    minutes,
  });

  if (!response?.ok) {
    setStatus("Timer error", response?.error || "Could not save interval.");
    return;
  }

  intervalInput.value = String(response.settings.syncIntervalMinutes);
  setStatus("Timer saved", `Auto-sync interval set to ${response.settings.syncIntervalMinutes} minutes.`);
});

hydrateStatus();
hydrateSettings();

function hydrateStatus() {
  chrome.storage.local.get(["syncRun", "archive"], (items) => {
    const run = items.syncRun;
    if (!run) {
      return;
    }

    const archive = items.archive;
    const detail =
      run.status === "completed"
        ? `Last completed at ${new Date(run.completedAt).toLocaleString()} with ${archive?.summary?.postsCaptured || 0} posts.`
        : run.errors?.[0] || "Last run did not complete.";

    setStatus(capitalize(run.status), detail);
  });
}

function hydrateSettings() {
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    if (!response?.ok) {
      return;
    }

    intervalInput.value = String(response.settings.syncIntervalMinutes);
  });
}

function setStatus(title, detail) {
  statusText.textContent = title;
  statusDetail.textContent = detail;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "Unknown";
}
