const statusText = document.getElementById("statusText");
const statusDetail = document.getElementById("statusDetail");
const selectedPlatforms = document.getElementById("selectedPlatforms");

document.getElementById("syncBtn").addEventListener("click", async () => {
  setStatus("Syncing", "Collecting from the socials you selected in settings.");
  const response = await chrome.runtime.sendMessage({ type: "RUN_SYNC", trigger: "popup" });
  if (!response?.ok) {
    setStatus("Failed", response?.error || "Manual sync failed.");
    return;
  }

  const archive = response.result;
  const platformsCaptured = (archive.summary.platformsCaptured || []).length;
  setStatus("Synced", `${archive.summary.postsCaptured} item(s) from ${platformsCaptured} platform(s).`);
  hydrate();
});

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.();
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok || !response.archive) {
    setStatus("No archive", "Run a manual sync before exporting.");
    return;
  }

  const blob = new Blob([JSON.stringify(response.archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "insta-ntiate-archive.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Exported", "Archive JSON downloaded.");
});

async function hydrate() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok) {
    return;
  }

  const settings = response.settings || {};
  const selected = settings.selectedPlatforms || [];
  selectedPlatforms.textContent = selected.length ? `${selected.length} active` : "none";

  const run = response.syncRun;
  if (!run) {
    setStatus("Idle", "Manual sync is ready. Auto sync is optional.");
    return;
  }

  if (run.status === "failed") {
    setStatus("Failed", run.errors?.[0] || "Last sync failed.");
    return;
  }

  const captured = response.archive?.summary?.postsCaptured || 0;
  setStatus(capitalize(run.status), `Last run captured ${captured} item(s).`);
}

function setStatus(title, detail) {
  statusText.textContent = title;
  statusDetail.textContent = detail;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "Unknown";
}

hydrate();
