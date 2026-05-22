const $ = (id) => document.getElementById(id);

let cachedSettings = null;
let discoveredCollections = [];

async function bootstrap() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok) {
    setStatus("footerStatus", "Could not load settings.", "err");
    return;
  }
  cachedSettings = response.settings;
  discoveredCollections = response.discovered?.collections || [];
  hydrateForm();
  renderCollections();
}

function hydrateForm() {
  $("endpoint").value = cachedSettings.appEndpoint || "";
  $("username").value = cachedSettings.username || "";
  $("autoDetect").checked = cachedSettings.autoDetectUsername !== false;
  $("perCollection").value = cachedSettings.perCollectionLimit || 0;
  $("totalCap").value = cachedSettings.totalPostLimit || 0;
  $("interval").value = cachedSettings.syncIntervalMinutes || 60;
}

function renderCollections() {
  const list = $("collectionList");
  list.innerHTML = "";
  if (!discoveredCollections.length) return;
  const selected = new Set(cachedSettings.selectedCollections || []);
  const selectAllRow = document.createElement("label");
  selectAllRow.className = "item";
  selectAllRow.innerHTML = `
    <input type="checkbox" id="selectAll" ${selected.size === 0 ? "checked" : ""} />
    <span class="title"><strong>All collections</strong> (default)</span>
  `;
  list.appendChild(selectAllRow);
  selectAllRow.addEventListener("change", () => {
    if ($("selectAll").checked) {
      list.querySelectorAll(".item .pick").forEach((cb) => (cb.checked = false));
      list.querySelectorAll(".item").forEach((item) => item.classList.remove("checked"));
    }
  });

  for (const c of discoveredCollections) {
    const row = document.createElement("label");
    row.className = "item" + (selected.has(c.id) ? " checked" : "");
    row.innerHTML = `
      <input type="checkbox" class="pick" data-id="${c.id}" ${selected.has(c.id) ? "checked" : ""} />
      <span class="title">${escapeHtml(c.title || "Untitled")}</span>
    `;
    list.appendChild(row);
    row.addEventListener("change", () => {
      const cb = row.querySelector(".pick");
      row.classList.toggle("checked", cb.checked);
      const anyChecked = !!list.querySelector(".pick:checked");
      $("selectAll").checked = !anyChecked;
    });
  }
}

$("discover").addEventListener("click", async () => {
  $("discover").disabled = true;
  setStatus("discoverStatus", "Discovering…");
  try {
    const response = await chrome.runtime.sendMessage({ type: "DISCOVER_COLLECTIONS" });
    if (!response?.ok) throw new Error(response?.error || "Discovery failed");
    discoveredCollections = response.payload.collections || [];
    renderCollections();
    setStatus("discoverStatus", `Found ${discoveredCollections.length} collection(s).`, "ok");
  } catch (error) {
    setStatus("discoverStatus", error.message, "err");
  } finally {
    $("discover").disabled = false;
  }
});

$("save").addEventListener("click", async () => {
  const selectAll = $("selectAll");
  const isAll = !selectAll || selectAll.checked;
  const selectedCollections = isAll
    ? null
    : Array.from(document.querySelectorAll(".pick:checked")).map((cb) => cb.dataset.id);

  const next = {
    appEndpoint: $("endpoint").value.trim() || "http://localhost:3000/api/archive",
    username: $("username").value.trim(),
    autoDetectUsername: $("autoDetect").checked,
    selectedCollections,
    perCollectionLimit: Number($("perCollection").value) || 0,
    totalPostLimit: Number($("totalCap").value) || 0,
    syncIntervalMinutes: Math.max(5, Math.min(720, Number($("interval").value) || 60))
  };

  const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: next });
  if (!response?.ok) {
    setStatus("footerStatus", response?.error || "Save failed.", "err");
    return;
  }
  cachedSettings = response.settings;
  setStatus("footerStatus", "Saved.", "ok");
});

$("syncNow").addEventListener("click", async () => {
  setStatus("footerStatus", "Sync started…");
  const response = await chrome.runtime.sendMessage({ type: "RUN_SYNC", trigger: "options-page" });
  if (!response?.ok) {
    setStatus("footerStatus", response?.error || "Sync failed.", "err");
    return;
  }
  const archive = response.result;
  setStatus("footerStatus", `Synced ${archive?.summary?.postsCaptured || 0} posts across ${archive?.summary?.collectionsCaptured || 0} collection(s).`, "ok");
});

function setStatus(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

bootstrap();
