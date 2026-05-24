const $ = (id) => document.getElementById(id);

let cachedSettings = null;
let platforms = [];
let cachedArchive = null;
let cachedDebugLogs = [];

async function bootstrap() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!response?.ok) {
    setStatus("footerStatus", "Could not load collector settings.", "err");
    return;
  }

  cachedSettings = response.settings;
  cachedArchive = response.lastInstagramOutput || response.archive || null;
  cachedDebugLogs = response.debugLogs || [];
  platforms = response.platforms || [];
  hydrateForm();
  renderPlatforms();
  renderSummary();
  renderLastRun(response.syncRun, response.archive);
}

function hydrateForm() {
  $("endpoint").value = cachedSettings.appEndpoint || "";
  $("enableAutoSync").checked = Boolean(cachedSettings.enableAutoSync);
  $("interval").value = cachedSettings.syncIntervalMinutes || 60;
}

function renderSummary() {
  $("platformCount").textContent = String((cachedSettings.selectedPlatforms || []).length);
  $("syncMode").textContent = cachedSettings.enableAutoSync ? "Auto" : "Manual";
}

function renderPlatforms() {
  const list = $("platformList");
  list.innerHTML = "";
  const selected = new Set(cachedSettings.selectedPlatforms || []);

  for (const platform of platforms) {
    const wrapper = document.createElement("div");
    wrapper.className = "platform-card item";

    const isChecked = selected.has(platform.id);
    const perSettings = (cachedSettings.perPlatformSettings || {})[platform.id] || {};

    wrapper.innerHTML = `
      <div class="platform-header">
        <label class="row checkbox platform-identity">
          <input type="checkbox" class="pick" data-id="${platform.id}" ${isChecked ? "checked" : ""} />
          <span>
            <span class="title">${escapeHtml(platform.label)}</span>
            <span class="platform-subtitle">${escapeHtml(platform.sector || platform.kind || "Collector")}</span>
          </span>
        </label>
        <div class="platform-actions"></div>
      </div>
      <div class="platform-details" style="display:none;">
        <div class="hint">Customize extraction settings for ${escapeHtml(platform.label)}.</div>
        <div class="platform-body"></div>
      </div>
    `;

    list.appendChild(wrapper);

    const pick = wrapper.querySelector('.pick');
    const details = wrapper.querySelector('.platform-details');
    const actions = wrapper.querySelector('.platform-actions');

    const toggle = document.createElement('button');
    toggle.className = 'toggle-details';
    toggle.type = 'button';
    toggle.textContent = 'Details';
    actions.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const visible = details.style.display !== 'none';
      details.style.display = visible ? 'none' : 'block';
      toggle.textContent = visible ? 'Details' : 'Hide';
    });

    pick.addEventListener('change', () => {
      wrapper.classList.toggle('checked', pick.checked);
    });

    // Render Instagram-specific settings
    if (platform.id === 'instagram') {
      const body = wrapper.querySelector('.platform-body');
      const syncBtn = document.createElement('button');
      syncBtn.className = 'btn primary small';
      syncBtn.type = 'button';
      syncBtn.textContent = 'Sync now';
      actions.appendChild(syncBtn);

      body.innerHTML = `
        <div class="section">
          <strong>Scopes</strong>
          <div class="scopes">
            <div class="scope" data-scope="saved">
              <label class="row checkbox"><input type="checkbox" data-field="scope-saved" ${perSettings.enabledScopes?.saved ? 'checked' : ''} /> Saved</label>
              <div class="scope-details" style="display:${perSettings.enabledScopes?.saved ? 'block' : 'none'}; margin-left:16px;">
                <label class="row checkbox"><input type="checkbox" data-field="scrapeCollectionsFirst" ${perSettings.scrapeCollectionsFirst ? 'checked' : ''} /> First fetch collection list before scraping</label>
                <div class="collections-toolbar">
                  <button class="btn ghost" data-action="discoverCollections">Fetch collections</button>
                  <span class="hint compact">Opens Instagram, detects your username, then loads your saved collections.</span>
                </div>
                <div class="collections-list"></div>
                <label class="row"><span class="label">Reels per collection (global fallback)</span><input type="number" min="0" max="200" data-field="reelCount" value="${perSettings.reelCount || 3}" /></label>
              </div>
            </div>
            <div class="scope" data-scope="liked">
              <label class="row checkbox"><input type="checkbox" data-field="scope-liked" ${perSettings.enabledScopes?.liked ? 'checked' : ''} /> Liked</label>
              <div class="scope-details" style="display:${perSettings.enabledScopes?.liked ? 'block' : 'none'}; margin-left:16px;">
                <div class="hint">When enabled, liked items will be scanned (currently disabled by default).</div>
              </div>
            </div>
            <div class="scope" data-scope="history">
              <label class="row checkbox"><input type="checkbox" data-field="scope-history" ${perSettings.enabledScopes?.history ? 'checked' : ''} /> History</label>
              <div class="scope-details" style="display:${perSettings.enabledScopes?.history ? 'block' : 'none'}; margin-left:16px;">
                <div class="hint">History scope collects recently viewed items (experimental).</div>
              </div>
            </div>
          </div>
        </div>
        <div class="section">
          <strong>Extraction fields</strong>
          <label class="row checkbox"><input type="checkbox" data-field="ex-id" ${perSettings.extractionFields?.id ? 'checked' : ''} /> id</label>
          <label class="row checkbox"><input type="checkbox" data-field="ex-link" ${perSettings.extractionFields?.link ? 'checked' : ''} /> link</label>
          <label class="row checkbox"><input type="checkbox" data-field="ex-caption" ${perSettings.extractionFields?.caption ? 'checked' : ''} /> caption</label>
          <label class="row checkbox"><input type="checkbox" data-field="ex-comments" ${perSettings.extractionFields?.comments ? 'checked' : ''} /> top n comments</label>
          <label class="row checkbox"><input type="checkbox" data-field="ex-description" ${perSettings.extractionFields?.description ? 'checked' : ''} /> description</label>
          <label class="row checkbox"><input type="checkbox" data-field="ex-audio" ${perSettings.extractionFields?.audio ? 'checked' : ''} /> audio</label>
        </div>
        <details class="outputs-panel">
          <summary>Outputs</summary>
          <div class="outputs-body"></div>
        </details>
        <details class="outputs-panel">
          <summary>Debug logs</summary>
          <div class="outputs-body logs-body"></div>
        </details>
      `;

      // wire up show/hide for scope details
      const savedScopeCheckbox = wrapper.querySelector('[data-field="scope-saved"]');
      const savedDetails = wrapper.querySelector('.scope[data-scope="saved"] .scope-details');
      savedScopeCheckbox?.addEventListener('change', () => {
        if (savedDetails) savedDetails.style.display = savedScopeCheckbox.checked ? 'block' : 'none';
      });

      const likedScopeCheckbox = wrapper.querySelector('[data-field="scope-liked"]');
      const likedDetails = wrapper.querySelector('.scope[data-scope="liked"] .scope-details');
      likedScopeCheckbox?.addEventListener('change', () => {
        if (likedDetails) likedDetails.style.display = likedScopeCheckbox.checked ? 'block' : 'none';
      });

      const historyScopeCheckbox = wrapper.querySelector('[data-field="scope-history"]');
      const historyDetails = wrapper.querySelector('.scope[data-scope="history"] .scope-details');
      historyScopeCheckbox?.addEventListener('change', () => {
        if (historyDetails) historyDetails.style.display = historyScopeCheckbox.checked ? 'block' : 'none';
      });

      const discoverBtn = wrapper.querySelector('[data-action="discoverCollections"]');
      const collectionsList = wrapper.querySelector('.collections-list');
      const outputsBody = wrapper.querySelector('.outputs-body');
      const logsBody = wrapper.querySelector('.logs-body');

      renderStoredCollections(collectionsList, perSettings.selectedCollections || [], perSettings);
      renderInstagramOutputs(outputsBody, cachedArchive, perSettings.selectedCollections || []);
      renderDebugLogs(logsBody, cachedDebugLogs);

      discoverBtn.addEventListener('click', async () => {
        setStatus('footerStatus', 'Discovering collections from Instagram tab...');
        const resp = await chrome.runtime.sendMessage({ type: 'DISCOVER_COLLECTIONS' });
        if (!resp?.ok) {
          setStatus('footerStatus', resp?.error || 'Could not discover collections.', 'err');
          return;
        }
        const collections = resp.collections || [];
        const discovered = renderCollectionRows(collectionsList, collections, perSettings);

        const discoveredSettings = {
          ...collectSettingsFromCard(wrapper, perSettings),
          selectedCollections: discovered
        };

        const nextAllSettings = {
          appEndpoint: $("endpoint").value.trim() || "http://localhost:3000/api/archive",
          enableAutoSync: $("enableAutoSync").checked,
          syncIntervalMinutes: Math.max(5, Math.min(720, Number($("interval").value) || 60)),
          selectedPlatforms: Array.from(document.querySelectorAll(".pick:checked")).map((checkbox) => checkbox.dataset.id),
          perPlatformSettings: {
            ...(cachedSettings.perPlatformSettings || {}),
            instagram: discoveredSettings
          }
        };

        const saveResponse = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: nextAllSettings });
        if (saveResponse?.ok) {
          cachedSettings = saveResponse.settings;
          renderStoredCollections(collectionsList, cachedSettings.perPlatformSettings?.instagram?.selectedCollections || [], cachedSettings.perPlatformSettings?.instagram || {});
          renderSummary();
        }

        // pull latest logs/state after fetch
        const refreshed = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (refreshed?.ok) {
          cachedDebugLogs = refreshed.debugLogs || [];
          renderDebugLogs(logsBody, cachedDebugLogs);
        }

        setStatus('footerStatus', `Found ${collections.length} collections.`, 'ok');
        renderInstagramOutputs(outputsBody, cachedArchive, collections);
      });

      syncBtn.addEventListener('click', async () => {
        const nextSettings = collectSettingsFromCard(wrapper, perSettings);
        const nextAllSettings = {
          appEndpoint: $("endpoint").value.trim() || "http://localhost:3000/api/archive",
          enableAutoSync: $("enableAutoSync").checked,
          syncIntervalMinutes: Math.max(5, Math.min(720, Number($("interval").value) || 60)),
          selectedPlatforms: Array.from(document.querySelectorAll(".pick:checked")).map((checkbox) => checkbox.dataset.id),
          perPlatformSettings: {
            ...(cachedSettings.perPlatformSettings || {}),
            instagram: nextSettings
          }
        };

        setStatus('footerStatus', 'Saving Instagram settings and syncing...', '');
        const saveResponse = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: nextAllSettings });
        if (!saveResponse?.ok) {
          setStatus('footerStatus', saveResponse?.error || 'Could not save collector settings.', 'err');
          return;
        }

        cachedSettings = saveResponse.settings;
        renderSummary();

        const syncResponse = await chrome.runtime.sendMessage({ type: 'RUN_INSTAGRAM_SYNC', trigger: 'options-page' });
        if (!syncResponse?.ok) {
          setStatus('footerStatus', syncResponse?.error || 'Instagram sync failed.', 'err');
          return;
        }

        cachedArchive = syncResponse.result;
        renderInstagramOutputs(outputsBody, cachedArchive);
        renderLastRun(syncResponse.result.syncRun, syncResponse.result);

        const refreshed = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (refreshed?.ok) {
          cachedDebugLogs = refreshed.debugLogs || [];
          renderDebugLogs(logsBody, cachedDebugLogs);
        }

        setStatus('footerStatus', `Synced ${syncResponse.result.summary.postsCaptured} reel(s) across ${(syncResponse.result.summary.collectionsCaptured || 0)} collection(s).`, 'ok');
      });
    }
  }
}

function collectSettingsFromCard(card, fallback = {}) {
  const enabledScopes = {
    saved: Boolean(card.querySelector('[data-field="scope-saved"]')?.checked),
    liked: Boolean(card.querySelector('[data-field="scope-liked"]')?.checked),
    history: Boolean(card.querySelector('[data-field="scope-history"]')?.checked)
  };
  const extractionFields = {
    id: Boolean(card.querySelector('[data-field="ex-id"]')?.checked),
    link: Boolean(card.querySelector('[data-field="ex-link"]')?.checked),
    caption: Boolean(card.querySelector('[data-field="ex-caption"]')?.checked),
    comments: Boolean(card.querySelector('[data-field="ex-comments"]')?.checked),
    description: Boolean(card.querySelector('[data-field="ex-description"]')?.checked),
    audio: Boolean(card.querySelector('[data-field="ex-audio"]')?.checked)
  };
  const scrapeCollectionsFirst = Boolean(card.querySelector('[data-field="scrapeCollectionsFirst"]')?.checked);
  const reelCount = Number(card.querySelector('[data-field="reelCount"]')?.value) || fallback.reelCount || 3;

  const selectedCollections = Array.from(card.querySelectorAll('.collection-row')).map((node) => {
    const checkbox = node.querySelector('input[type="checkbox"][data-collection-id]');
    if (!checkbox?.checked) {
      return null;
    }
    const id = node.dataset.collectionId || checkbox.dataset.collectionId || '';
    const title = node.dataset.collectionTitle || '';
    const url = node.dataset.collectionUrl || '';
    const reelInput = node.querySelector('input[data-reel-count]');
    return {
      id,
      title,
      url,
      reelCount: Math.max(0, Math.min(200, Number(reelInput?.value) || reelCount))
    };
  }).filter(Boolean);

  return {
    enabledScopes,
    extractionFields,
    scrapeCollectionsFirst,
    reelCount,
    selectedCollections
  };
}

function renderCollectionRows(container, collections, perSettings = {}) {
  if (!container) return [];
  container.innerHTML = '';
  const existingActions = container.parentElement?.querySelector('.output-actions.collections-actions');
  existingActions?.remove();
  const discovered = [];
  const currentSelected = Array.isArray(perSettings.selectedCollections) ? perSettings.selectedCollections : [];

  for (const c of collections) {
    const id = String(c.id || '');
    const title = String(c.title || c.id || c.url || 'collection');
    const existing = currentSelected.find((sc) => sc.id === c.id || sc.url === c.url) || {};
    const checked = existing.id || existing.url ? 'checked' : '';
    const reelCount = existing.reelCount || (perSettings.reelCount || 3);
    discovered.push({
      id,
      title,
      url: c.url || '',
      reelCount
    });
    const node = document.createElement('div');
    node.className = 'collection-row';
    node.dataset.collectionId = id;
    node.dataset.collectionTitle = title;
    node.dataset.collectionUrl = c.url || '';
    node.innerHTML = `
      <label class="row checkbox collection-check"><input type="checkbox" data-collection-id="${escapeHtml(id)}" ${checked} /> <span>${escapeHtml(title)}</span></label>
      <label class="row"><span class="label">Reels</span><input type="number" min="0" max="200" data-collection-id="${escapeHtml(id)}" data-reel-count value="${reelCount}" /></label>
    `;
    container.appendChild(node);
  }

  const collectionsActions = document.createElement('div');
  collectionsActions.className = 'output-actions collections-actions';
  collectionsActions.innerHTML = `
    <button class="btn ghost small" type="button" data-action="copyCollections">Copy collections</button>
    <span class="hint compact">${collections.length} collection(s) stored</span>
  `;
  container.parentElement?.insertBefore(collectionsActions, container);
  collectionsActions.querySelector('[data-action="copyCollections"]')?.addEventListener('click', async () => {
    await copyTextToClipboard(JSON.stringify(discovered, null, 2));
    setStatus('footerStatus', 'Copied collections.', 'ok');
  });

  return discovered;
}

function renderStoredCollections(container, collections, perSettings = {}) {
  if (!container) return;
  renderCollectionRows(container, collections, perSettings);
}

function renderInstagramOutputs(container, archive, discoveredCollections = []) {
  if (!container) return;
  container.innerHTML = '';

  if (!archive) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No output yet. Sync Instagram to populate this panel.';
    container.appendChild(empty);
    if (discoveredCollections.length) {
      const list = document.createElement('div');
      list.className = 'output-card';
      list.innerHTML = `
        <div class="output-grid">
          <div>
            <span class="label">Discovered collections</span>
            <strong>${discoveredCollections.length}</strong>
          </div>
        </div>
      `;
      const previewList = document.createElement('pre');
      previewList.className = 'output-preview-text';
      previewList.textContent = JSON.stringify(discoveredCollections.slice(0, 20), null, 2);
      list.appendChild(previewList);
      container.appendChild(list);
    }
    return;
  }

  const summary = archive.summary || {};
  const outputCard = document.createElement('div');
  outputCard.className = 'output-card';
  outputCard.innerHTML = `
    <div class="output-grid">
      <div>
        <span class="label">Collections</span>
        <strong>${summary.collectionsCaptured || 0}</strong>
      </div>
      <div>
        <span class="label">Reels</span>
        <strong>${summary.postsCaptured || 0}</strong>
      </div>
      <div>
        <span class="label">Platforms</span>
        <strong>${(summary.platformsCaptured || []).join(', ') || 'instagram'}</strong>
      </div>
    </div>
    <div class="output-actions">
      <button class="btn ghost small" type="button" data-action="downloadOutput">Download output JSON</button>
      <button class="btn ghost small" type="button" data-action="copyOutput">Copy output JSON</button>
      <span class="hint compact">${archive.syncRun?.status || 'completed'} · ${archive.syncRun?.completedAt || archive.syncRun?.startedAt || ''}</span>
    </div>
  `;

  const downloadBtn = outputCard.querySelector('[data-action="downloadOutput"]');
  downloadBtn?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'instagram-output.json';
    link.click();
    URL.revokeObjectURL(url);
  });

  outputCard.querySelector('[data-action="copyOutput"]')?.addEventListener('click', async () => {
    await copyTextToClipboard(JSON.stringify(archive, null, 2));
    setStatus('footerStatus', 'Copied output JSON.', 'ok');
  });

  if (discoveredCollections.length) {
    const list = document.createElement('p');
    list.className = 'hint';
    list.textContent = `Discovered collections: ${discoveredCollections.length}`;
    outputCard.appendChild(list);
  }

  const preview = document.createElement('details');
  preview.className = 'output-preview';
  preview.innerHTML = `
    <summary>Raw output preview</summary>
    <pre>${escapeHtml(JSON.stringify(archive, null, 2).slice(0, 12000))}</pre>
  `;
  outputCard.appendChild(preview);

  container.appendChild(outputCard);
}

function renderDebugLogs(container, logs) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(logs) || !logs.length) {
    container.innerHTML = '<p class="hint">No debug logs yet.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'log-list';
  const actions = document.createElement('div');
  actions.className = 'output-actions';
  actions.innerHTML = `
    <button class="btn ghost small" type="button" data-action="copyLogs">Copy logs</button>
    <span class="hint compact">${logs.length} log entries</span>
  `;
  actions.querySelector('[data-action="copyLogs"]')?.addEventListener('click', async () => {
    await copyTextToClipboard(JSON.stringify(logs, null, 2));
    setStatus('footerStatus', 'Copied debug logs.', 'ok');
  });
  container.appendChild(actions);
  for (const item of logs.slice(0, 80)) {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <div class="log-time">${escapeHtml(item.ts || '')}</div>
      <div class="log-stage">${escapeHtml(item.stage || '')}</div>
      <pre class="log-detail">${escapeHtml(JSON.stringify(item.detail || {}, null, 2))}</pre>
    `;
    list.appendChild(row);
  }
  container.appendChild(list);
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_) {}

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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
  const instagramCard = Array.from(document.querySelectorAll('.platform-card')).find((el) => el.querySelector('.pick')?.dataset.id === 'instagram');
  const nextInstagramSettings = instagramCard ? collectSettingsFromCard(instagramCard, (cachedSettings.perPlatformSettings || {}).instagram || {}) : (cachedSettings.perPlatformSettings || {}).instagram || {};

  const nextSettings = {
    appEndpoint: $("endpoint").value.trim() || "http://localhost:3000/api/archive",
    enableAutoSync: $("enableAutoSync").checked,
    syncIntervalMinutes: Math.max(5, Math.min(720, Number($("interval").value) || 60)),
    selectedPlatforms,
    perPlatformSettings: {
      ...(cachedSettings.perPlatformSettings || {}),
      instagram: nextInstagramSettings
    }
  };

  const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: nextSettings });
  if (!response?.ok) {
    setStatus("footerStatus", response?.error || "Could not save collector settings.", "err");
    return;
  }

  cachedSettings = response.settings;
  renderSummary();
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
