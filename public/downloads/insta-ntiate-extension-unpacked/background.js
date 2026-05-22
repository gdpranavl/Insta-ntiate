const ALARM_NAME = "insta-ntiate-sync";
const DEFAULT_SETTINGS = {
  appEndpoint: "http://localhost:3000/api/archive",
  syncIntervalMinutes: 60,
  username: "",
  selectedCollections: null,
  perCollectionLimit: 0,
  totalPostLimit: 0,
  autoDetectUsername: true
};

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSettings();
  await scheduleSyncAlarm();
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage?.();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await scheduleSyncAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try { await runSync("alarm"); } catch (_) {}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RUN_SYNC") {
    runSync(message.trigger || "manual")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "DISCOVER_COLLECTIONS") {
    discoverCollections()
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_STATE") {
    Promise.all([getSettings(), chrome.storage.local.get(["syncRun", "archive", "discovered"])]).then(([settings, items]) => {
      sendResponse({ ok: true, settings, syncRun: items.syncRun || null, archive: items.archive || null, discovered: items.discovered || null });
    });
    return true;
  }
  if (message?.type === "SAVE_SETTINGS") {
    saveSettings(message.settings)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

async function ensureSettings() {
  const stored = (await chrome.storage.local.get(["settings"])).settings || {};
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

async function getSettings() {
  return ensureSettings();
}

async function saveSettings(next) {
  const current = await getSettings();
  const merged = { ...current, ...next };
  await chrome.storage.local.set({ settings: merged });
  await scheduleSyncAlarm();
  return merged;
}

async function scheduleSyncAlarm() {
  const settings = await getSettings();
  const period = Math.max(5, Math.min(720, Number(settings.syncIntervalMinutes) || 60));
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 2, periodInMinutes: period });
}

async function runSync(trigger) {
  const startedAt = new Date().toISOString();
  const syncRun = { trigger, startedAt, status: "running", errors: [] };
  await chrome.storage.local.set({ syncRun });

  try {
    const settings = await getSettings();
    let username = settings.username;
    if (!username && settings.autoDetectUsername) {
      username = await detectUsername();
      if (username) await saveSettings({ username });
    }
    if (!username) {
      throw new Error("No Instagram username configured. Open Insta-ntiate options to set it, or log into Instagram once.");
    }

    const discovery = await scrapeSavedOverview(username);
    const allCollections = discovery.collections;
    const selected = pickCollections(allCollections, settings.selectedCollections);
    const perLimit = Math.max(0, Number(settings.perCollectionLimit) || 0);

    const collections = [];
    const posts = [];
    const memberships = [];
    const errors = [];
    let postsCollected = 0;
    const totalLimit = Math.max(0, Number(settings.totalPostLimit) || 0);

    for (const overviewCollection of selected) {
      if (totalLimit && postsCollected >= totalLimit) break;
      let collectionTab = null;
      try {
        collectionTab = await createBackgroundTab(overviewCollection.url);
        const remaining = totalLimit ? totalLimit - postsCollected : 0;
        const detail = await sendTabMessage(collectionTab.id, {
          type: "SCRAPE_COLLECTION_DETAIL",
          collection: overviewCollection,
          postLimit: perLimit || (remaining || 0)
        });
        collections.push({
          id: detail.collection.id,
          title: detail.collection.title,
          url: detail.collection.url,
          position: collections.length + 1,
          capturedAt: new Date().toISOString()
        });
        for (const postOverview of detail.posts || []) {
          if (totalLimit && postsCollected >= totalLimit) break;
          let detailTab = null;
          try {
            detailTab = await createBackgroundTab(postOverview.canonicalUrl);
            const post = await sendTabMessage(detailTab.id, {
              type: "SCRAPE_POST_DETAIL",
              post: postOverview,
              collectionTitle: detail.collection.title
            });
            posts.push({ ...post, enrichments: post.enrichments || {} });
            memberships.push({
              collectionId: detail.collection.id,
              postId: post.id,
              rank: postOverview.rank,
              capturedAt: new Date().toISOString()
            });
            postsCollected += 1;
          } catch (error) {
            errors.push(`post ${postOverview.canonicalUrl}: ${error.message}`);
          } finally {
            if (detailTab?.id) await safelyCloseTab(detailTab.id);
          }
        }
      } catch (error) {
        errors.push(`collection ${overviewCollection.url}: ${error.message}`);
      } finally {
        if (collectionTab?.id) await safelyCloseTab(collectionTab.id);
      }
    }

    const archive = {
      sourceAccount: { username, lastSyncedAt: new Date().toISOString() },
      syncRun: { ...syncRun, completedAt: new Date().toISOString(), status: errors.length ? "completed-with-warnings" : "completed", errors },
      collections,
      posts: dedupePosts(posts),
      memberships,
      summary: { collectionsCaptured: collections.length, postsCaptured: posts.length },
      notes: [
        `Scope: ${settings.selectedCollections ? settings.selectedCollections.length : "all"} collection(s)`,
        perLimit ? `Per-collection cap: ${perLimit}` : "No per-collection cap",
        totalLimit ? `Total post cap: ${totalLimit}` : "No total cap"
      ],
      warnings: errors,
      discoveredCollections: allCollections
    };

    await chrome.storage.local.set({
      archive,
      syncRun: archive.syncRun,
      discovered: { at: new Date().toISOString(), collections: allCollections }
    });

    try { await pushArchiveToApp(archive); }
    catch (error) {
      archive.warnings.push(error.message);
      await chrome.storage.local.set({ archive });
    }

    return archive;
  } catch (error) {
    const failedRun = { ...syncRun, completedAt: new Date().toISOString(), status: "failed", errors: [error.message] };
    await chrome.storage.local.set({ syncRun: failedRun });
    throw error;
  }
}

async function discoverCollections() {
  const settings = await getSettings();
  let username = settings.username;
  if (!username && settings.autoDetectUsername) {
    username = await detectUsername();
    if (username) await saveSettings({ username });
  }
  if (!username) throw new Error("Could not detect your Instagram username. Make sure you are logged into instagram.com in this browser.");
  const overview = await scrapeSavedOverview(username);
  await chrome.storage.local.set({ discovered: { at: new Date().toISOString(), collections: overview.collections } });
  return overview;
}

async function detectUsername() {
  const tab = await createBackgroundTab("https://www.instagram.com/");
  try {
    const result = await sendTabMessage(tab.id, { type: "SCRAPE_USERNAME" });
    return result.username || "";
  } finally {
    await safelyCloseTab(tab.id);
  }
}

async function scrapeSavedOverview(username) {
  const candidates = [
    `https://www.instagram.com/${username}/saved/`,
    "https://www.instagram.com/your_activity/interactions/saved/",
    "https://www.instagram.com/saved/"
  ];
  const errors = [];
  for (const url of candidates) {
    const tab = await createBackgroundTab(url);
    try {
      const payload = await sendTabMessage(tab.id, { type: "SCRAPE_SAVED_OVERVIEW" });
      return { ...payload, username: payload.username || username };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    } finally {
      await safelyCloseTab(tab.id);
    }
  }
  throw new Error(`Could not reach saved collections. Tried: ${errors.join(" | ")}`);
}

function pickCollections(all, selectedIds) {
  if (!selectedIds || !selectedIds.length) return all;
  const wanted = new Set(selectedIds);
  return all.filter((c) => wanted.has(c.id));
}

async function createBackgroundTab(url) {
  return chrome.tabs.create({ url, active: false });
}

async function safelyCloseTab(tabId) {
  try { await chrome.tabs.remove(tabId); } catch (_) {}
}

async function sendTabMessage(tabId, message) {
  await waitForTabReady(tabId);
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response?.ok) return response.payload;
      if (response?.ok === false) lastError = new Error(response.error || "Scrape step failed.");
    } catch (error) {
      lastError = error;
    }
    await delay(600);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) break;
    } catch {
      break;
    }
  }
  throw new Error(lastError?.message || `Could not collect data from tab ${tabId}.`);
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, change) => { if (id === tabId && change.status === "complete") setTimeout(finish, 1800); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => { if (tab?.status === "complete") setTimeout(finish, 1800); });
    setTimeout(finish, 14000);
  });
}

function dedupePosts(posts) {
  const seen = new Map();
  for (const post of posts) if (post?.id && !seen.has(post.id)) seen.set(post.id, post);
  return Array.from(seen.values());
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pushArchiveToApp(archive) {
  const { appEndpoint } = await getSettings();
  const response = await fetch(appEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Instantiate-Mode": "merge" },
    body: JSON.stringify(archive)
  });
  if (!response.ok) {
    throw new Error(`Archive push failed at ${appEndpoint} (HTTP ${response.status}). Is the Insta-ntiate app running?`);
  }
}
