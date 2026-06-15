const ALARM_NAME = "insta-ntiate-sync";
const COLLECTION_LIMIT = 20;
const POSTS_PER_COLLECTION = 25;
const DEFAULT_SYNC_MINUTES = 30;
const DEFAULT_APP_ENDPOINT = "http://localhost:3000/api/archive";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
  await scheduleSyncAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await scheduleSyncAlarm();
  await recoverInterruptedRun();
  await runSync("startup");
});

async function recoverInterruptedRun() {
  // If a previous run's worker was killed mid-sync, storage can be left with a
  // permanent "running" status and a leaked background tab. Reconcile both.
  const items = await chrome.storage.local.get(["syncRun", "workerTabId"]);
  if (items.syncRun?.status === "running") {
    await chrome.storage.local.set({
      syncRun: { ...items.syncRun, status: "interrupted", completedAt: new Date().toISOString() }
    });
  }
  if (items.workerTabId) {
    try {
      await chrome.tabs.remove(items.workerTabId);
    } catch (_error) {}
    await chrome.storage.local.remove("workerTabId");
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }
  await runSync("alarm");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RUN_SYNC") {
    runSync("manual")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_ARCHIVE") {
    chrome.storage.local.get(["archive"], (items) => {
      sendResponse({ ok: true, archive: items.archive || null });
    });
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }

  if (message?.type === "SET_SYNC_INTERVAL") {
    setSyncInterval(message.minutes)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SET_APP_ENDPOINT") {
    setAppEndpoint(message.endpoint)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function scheduleSyncAlarm() {
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: settings.syncIntervalMinutes
  });
}

// Coalesce overlapping syncs (alarm + manual + startup) onto one in-flight run so
// they can't spawn duplicate worker tabs or race on shared storage.
let activeSync = null;

function runSync(trigger) {
  if (activeSync) return activeSync;
  activeSync = doSync(trigger).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function doSync(trigger) {
  const startedAt = new Date().toISOString();
  const syncRun = {
    trigger,
    startedAt,
    status: "running",
    errors: []
  };

  await chrome.storage.local.set({ syncRun });

  // Reset the MV3 idle timer periodically so a multi-minute crawl is less likely
  // to be torn down early (does not defeat the hard 5-minute single-event cap).
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

  try {
    const account = await scrapeSavedCollections();
    const archive = {
      sourceAccount: {
        username: account.username,
        lastSyncedAt: new Date().toISOString()
      },
      syncRun: {
        ...syncRun,
        completedAt: new Date().toISOString(),
        status: "completed"
      },
      collections: account.collections,
      posts: account.posts,
      memberships: account.memberships,
      summary: {
        collectionsCaptured: account.collections.length,
        postsCaptured: account.posts.length
      },
      notes: [
        "This collector is intentionally bounded to the first 20 saved collections and the first 25 posts per collection.",
        "Saved items are scraped one at a time in a single reused background tab, so the sync no longer opens a separate tab per post."
      ],
      warnings: account.errors || []
    };

    if (!archive.collections.length) {
      throw new Error("Sync completed without any saved collections.");
    }

    if (!archive.posts.length) {
      throw new Error("Sync completed without any captured posts.");
    }

    await chrome.storage.local.set({
      archive,
      syncRun: archive.syncRun
    });

    try {
      await pushArchiveToApp(archive);
    } catch (error) {
      archive.warnings.push(error.message);
      await chrome.storage.local.set({ archive });
    }

    return archive;
  } catch (error) {
    const failedRun = {
      ...syncRun,
      completedAt: new Date().toISOString(),
      status: "failed",
      errors: [error.message]
    };
    await chrome.storage.local.set({ syncRun: failedRun });
    throw error;
  } finally {
    clearInterval(keepAlive);
  }
}

async function scrapeSavedCollections() {
  const username = await checkInstagramLogin();

  // Reuse ONE background tab for the entire crawl. Previously the collector opened
  // (and closed) a separate tab for every collection AND every post — up to ~500
  // tabs per sync, which both looks broken and is very slow. Now a single worker
  // tab is navigated from page to page.
  const worker = await createBackgroundTab("about:blank");
  await chrome.storage.local.set({ workerTabId: worker.id });
  const errors = [];

  try {
    const root = await scrapeSavedOverview(worker.id, username);

    const collections = [];
    const posts = [];
    const memberships = [];

    for (const overviewCollection of root.collections || []) {
      try {
        await navigateTab(worker.id, overviewCollection.url);
        const details = await sendTabMessage(worker.id, {
          type: "SCRAPE_COLLECTION_DETAIL",
          collection: overviewCollection,
          postLimit: POSTS_PER_COLLECTION
        });

        collections.push({
          id: details.collection.id,
          title: details.collection.title,
          url: details.collection.url,
          position: details.collection.position
        });

        for (const postOverview of details.posts || []) {
          try {
            await navigateTab(worker.id, postOverview.canonicalUrl);
            const post = await sendTabMessage(worker.id, {
              type: "SCRAPE_POST_DETAIL",
              post: postOverview,
              collectionTitle: details.collection.title
            });

            posts.push(post);
            memberships.push({
              collectionId: details.collection.id,
              postId: post.id,
              rank: post.rank,
              capturedAt: new Date().toISOString()
            });
          } catch (error) {
            // A single post that fails to scrape must not abort the whole run.
            errors.push(`post ${postOverview.canonicalUrl}: ${error.message}`);
          }
        }
      } catch (error) {
        // A single collection that fails to open must not abort the whole run.
        errors.push(`collection ${overviewCollection.url}: ${error.message}`);
      }
    }

    return {
      username: root.username,
      collections,
      posts: dedupePosts(posts),
      memberships,
      errors
    };
  } finally {
    if (worker?.id) {
      await chrome.tabs.remove(worker.id);
    }
    await chrome.storage.local.remove("workerTabId");
  }
}

async function checkInstagramLogin() {
  const tab = await createBackgroundTab("https://www.instagram.com/");

  try {
    const result = await sendTabMessage(tab.id, { type: "CHECK_LOGIN" });

    if (!result.loggedIn) {
      await chrome.tabs.create({
        url: "https://www.instagram.com/accounts/login/",
        active: true
      });
      throw new Error(
        "You are not logged into Instagram. A login tab has been opened — please log in and then click Sync again."
      );
    }

    return result.username;
  } finally {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
    }
  }
}

async function scrapeSavedOverview(workerTabId, username) {
  const candidateUrls = [
    username ? `https://www.instagram.com/${username}/saved/` : null,
    "https://www.instagram.com/your_activity/interactions/saved/",
    "https://www.instagram.com/saved/"
  ].filter(Boolean);

  const errors = [];

  for (const url of candidateUrls) {
    try {
      await navigateTab(workerTabId, url);
      const payload = await sendTabMessage(workerTabId, {
        type: "SCRAPE_SAVED_OVERVIEW",
        collectionLimit: COLLECTION_LIMIT
      });

      return {
        ...payload,
        username: payload.username || username || ""
      };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  throw new Error(`Could not access saved collections. ${errors.join(" | ")}`);
}

async function createBackgroundTab(url) {
  return chrome.tabs.create({ url, active: false });
}

function navigateTab(tabId, url) {
  // Navigate an existing background tab and resolve once the new page has loaded.
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1500);
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        settle();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) {
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(chrome.runtime.lastError.message));
      }
    });

    setTimeout(settle, 12000);
  });
}

async function sendTabMessage(tabId, message) {
  await waitForTabReady(tabId);

  let lastError = null;
  // Only a transport error (content script not yet injected) is worth retrying.
  // A content-side {ok:false} is a deterministic scrape result that will not
  // change on retry, so we stop immediately instead of burning ~12s of retries.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response?.ok) {
        return response.payload;
      }
      if (response && response.ok === false) {
        throw new Error(response.error || "Scrape step failed.");
      }
    } catch (error) {
      lastError = error;
      const transient = /establish connection|Receiving end does not exist|message port closed|message channel closed/i.test(error.message || "");
      if (!transient) {
        break;
      }
    }

    await delay(600);
  }

  throw new Error(lastError?.message || `Could not collect Instagram data from tab ${tabId}.`);
}

function waitForTabReady(tabId) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        setTimeout(finish, 1800);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === "complete") {
        setTimeout(finish, 1800);
      }
    });

    setTimeout(finish, 12000);
  });
}

function dedupePosts(posts) {
  const seen = new Map();

  for (const post of posts) {
    if (!seen.has(post.id)) {
      seen.set(post.id, post);
    }
  }

  return Array.from(seen.values());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSettings() {
  const settings = await getSettings();
  if (!settings?.syncIntervalMinutes || !settings?.appEndpoint) {
    await chrome.storage.local.set({
      settings: {
        syncIntervalMinutes: settings.syncIntervalMinutes || DEFAULT_SYNC_MINUTES,
        appEndpoint: settings.appEndpoint || DEFAULT_APP_ENDPOINT
      }
    });
  }
}

async function getSettings() {
  const items = await chrome.storage.local.get(["settings"]);
  return {
    syncIntervalMinutes: items.settings?.syncIntervalMinutes || DEFAULT_SYNC_MINUTES,
    appEndpoint: items.settings?.appEndpoint || DEFAULT_APP_ENDPOINT
  };
}

async function setSyncInterval(minutes) {
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 720) {
    throw new Error("Sync interval must be between 5 and 720 minutes.");
  }

  const settings = await getSettings();
  const nextSettings = {
    ...settings,
    syncIntervalMinutes: Math.round(parsed)
  };

  await chrome.storage.local.set({ settings: nextSettings });
  await scheduleSyncAlarm();
  return nextSettings;
}

async function setAppEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch (_error) {
    throw new Error("Invalid URL. Example: http://localhost:3001/api/archive");
  }

  if (!parsed.protocol.startsWith("http")) {
    throw new Error("Endpoint must use http or https.");
  }

  const settings = await getSettings();
  const nextSettings = { ...settings, appEndpoint: parsed.href };
  await chrome.storage.local.set({ settings: nextSettings });
  return nextSettings;
}

async function pushArchiveToApp(archive) {
  const settings = await getSettings();

  let primaryUrl;
  try {
    primaryUrl = new URL(settings.appEndpoint);
  } catch (_error) {
    primaryUrl = new URL(DEFAULT_APP_ENDPOINT);
  }

  const primaryPort = parseInt(primaryUrl.port || "3000", 10);
  const candidatePorts = [primaryPort, 3000, 3001, 3002, 3003].filter(
    (port, index, list) => list.indexOf(port) === index
  );

  const errors = [];

  for (const port of candidatePorts) {
    const candidateUrl = `${primaryUrl.protocol}//${primaryUrl.hostname}:${port}${primaryUrl.pathname}`;

    try {
      const response = await fetch(candidateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(archive),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        if (port !== primaryPort) {
          await chrome.storage.local.set({
            settings: { ...settings, appEndpoint: candidateUrl }
          });
        }
        return;
      }

      errors.push(`${candidateUrl}: HTTP ${response.status}`);
    } catch (error) {
      errors.push(`${candidateUrl}: ${error.message}`);
    }
  }

  throw new Error(
    `Archive push failed on all candidate ports. Tried: ${errors.join(" | ")}. Make sure the Next app is running.`
  );
}
