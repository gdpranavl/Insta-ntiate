const ALARM_NAME = "insta-ntiate-sync";
const COLLECTION_LIMIT = 2;
const POSTS_PER_COLLECTION = 5;
const HARDCODED_USERNAME = "thegdpranavl";
const DEFAULT_SYNC_MINUTES = 30;
const DEFAULT_APP_ENDPOINT = "http://localhost:3000/api/archive";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
  await scheduleSyncAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await scheduleSyncAlarm();
  await runSync("startup");
});

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

  return false;
});

async function scheduleSyncAlarm() {
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: settings.syncIntervalMinutes
  });
}

async function runSync(trigger) {
  const startedAt = new Date().toISOString();
  const syncRun = {
    trigger,
    startedAt,
    status: "running",
    errors: []
  };

  await chrome.storage.local.set({ syncRun });

  try {
    const account = await scrapeSavedCollections();
    const archive = {
      sourceAccount: {
        username: account.username || HARDCODED_USERNAME,
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
        "This collector is intentionally bounded to the first two collections and first five posts per collection.",
        `Saved route is currently hard-coded to @${HARDCODED_USERNAME} for debugging.`,
        "Each saved item is opened in its own background tab so creator, caption, thumbnail, and video URL can be collected more reliably."
      ],
      warnings: []
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
  }
}

async function scrapeSavedCollections() {
  const root = await scrapeSavedOverviewWithFallback();
  const savedTab = root.tab;

  try {
    const collections = [];
    const posts = [];
    const memberships = [];

    for (const overviewCollection of root.collections || []) {
      const collectionTab = await createBackgroundTab(overviewCollection.url);

      try {
        const details = await sendTabMessage(collectionTab.id, {
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
          const detailTab = await createBackgroundTab(postOverview.canonicalUrl);

          try {
            const post = await sendTabMessage(detailTab.id, {
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
          } finally {
            if (detailTab?.id) {
              await chrome.tabs.remove(detailTab.id);
            }
          }
        }
      } finally {
        if (collectionTab?.id) {
          await chrome.tabs.remove(collectionTab.id);
        }
      }
    }

    return {
      username: root.username,
      collections,
      posts: dedupePosts(posts),
      memberships
    };
  } finally {
    if (savedTab?.id) {
      await chrome.tabs.remove(savedTab.id);
    }
  }
}

async function scrapeSavedOverviewWithFallback() {
  const candidateUrls = [
    `https://www.instagram.com/${HARDCODED_USERNAME}/saved/`,
    "https://www.instagram.com/your_activity/interactions/saved/",
    "https://www.instagram.com/saved/"
  ];

  const errors = [];

  for (const url of candidateUrls) {
    const tab = await createBackgroundTab(url);

    try {
      const payload = await sendTabMessage(tab.id, {
        type: "SCRAPE_SAVED_OVERVIEW",
        collectionLimit: COLLECTION_LIMIT
      });

      return {
        ...payload,
        username: payload.username || HARDCODED_USERNAME,
        tab
      };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    }
  }

  throw new Error(`Could not access saved collections. ${errors.join(" | ")}`);
}

async function createBackgroundTab(url) {
  return chrome.tabs.create({ url, active: false });
}

async function sendTabMessage(tabId, message) {
  await waitForTabReady(tabId);

  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response?.ok) {
        return response.payload;
      }
      if (response && response.ok === false) {
        lastError = new Error(response.error || "Scrape step failed.");
      }
    } catch (error) {
      lastError = error;
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

async function pushArchiveToApp(archive) {
  const settings = await getSettings();
  const response = await fetch(settings.appEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(archive)
  });

  if (!response.ok) {
    throw new Error(`Archive push failed at ${settings.appEndpoint}. Make sure the Next app is running.`);
  }
}
