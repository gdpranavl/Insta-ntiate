const $ = (id) => document.getElementById(id);

let cachedSettings = null;
let platforms = [];

async function bootstrap() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok) {
    setStatus("footerStatus", "Could not load collector settings.", "err");
    return;
  }

  cachedSettings = response.settings;
  platforms = response.platforms || [];
  hydrateForm();
  renderPlatforms();
  renderLastRun(response.syncRun, response.archive);
}

function hydrateForm() {
  $("endpoint").value = cachedSettings.appEndpoint || "";
  $("enableAutoSync").checked = Boolean(cachedSettings.enableAutoSync);
  $("interval").value = cachedSettings.syncIntervalMinutes || 60;
}

function renderPlatforms() {
  const list = $("platformList");
  list.innerHTML = "";
  const selected = new Set(cachedSettings.selectedPlatforms || []);

  for (const platform of platforms) {
    const row = document.createElement("label");
    row.className = `item${selected.has(platform.id) ? " checked" : ""}`;
    row.innerHTML = `
      <input type="checkbox" class="pick" data-id="${platform.id}" ${selected.has(platform.id) ? "checked" : ""} />
      <span class="title">${escapeHtml(platform.label)}</span>
      <span class="meta">${escapeHtml(platform.sector || platform.kind || "")}</span>
    `;
    list.appendChild(row);
    row.addEventListener("change", () => {
      row.classList.toggle("checked", row.querySelector(".pick").checked);
    });
  }
}

function renderLastRun(syncRun, archive) {
  if (!syncRun) {
    setStatus("runStatus", "No sync yet.", "");
    return;
  }

  if (syncRun.status === "failed") {
    setStatus("runStatus", syncRun.errors?.[0] || "Last sync failed.", "err");
    return;
  }

  const platformsCaptured = archive?.summary?.platformsCaptured?.length || 0;
  setStatus(
    "runStatus",
    `Last sync captured ${archive?.summary?.postsCaptured || 0} item(s) across ${platformsCaptured} platform(s).`,
    "ok"
  );
}

$("save").addEventListener("click", async () => {
  const selectedPlatforms = Array.from(document.querySelectorAll(".pick:checked")).map((checkbox) => checkbox.dataset.id);
  const nextSettings = {
    appEndpoint: $("endpoint").value.trim() || "http://localhost:3000/api/archive",
    enableAutoSync: $("enableAutoSync").checked,
    syncIntervalMinutes: Math.max(5, Math.min(720, Number($("interval").value) || 60)),
    selectedPlatforms
  };

  const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: nextSettings });
  if (!response?.ok) {
    setStatus("footerStatus", response?.error || "Could not save collector settings.", "err");
    return;
  }

  cachedSettings = response.settings;
  setStatus("footerStatus", "Settings saved.", "ok");
});

$("syncNow").addEventListener("click", async () => {
  setStatus("footerStatus", "Running manual sync across selected platforms...");
  const response = await chrome.runtime.sendMessage({ type: "RUN_SYNC", trigger: "options-page" });
  if (!response?.ok) {
    setStatus("footerStatus", response?.error || "Manual sync failed.", "err");
    return;
  }

  const archive = response.result;
  setStatus(
    "footerStatus",
    `Synced ${archive.summary.postsCaptured} item(s) from ${(archive.summary.platformsCaptured || []).length} platform(s).`,
    "ok"
  );
  renderLastRun(archive.syncRun, archive);
});

function setStatus(id, text, kind) {
  const element = $(id);
  element.textContent = text;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

bootstrap();
