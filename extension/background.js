const ALARM_NAME = "insta-ntiate-sync";

const SUPPORTED_PLATFORMS = [
  { id: "instagram", label: "Instagram", hosts: ["https://www.instagram.com/*", "https://instagram.com/*"] },
  { id: "whatsapp", label: "WhatsApp", hosts: ["https://web.whatsapp.com/*"] },
  { id: "slack", label: "Slack", hosts: ["https://app.slack.com/*"] },
  { id: "discord", label: "Discord", hosts: ["https://discord.com/*", "https://discordapp.com/*"] },
  { id: "telegram", label: "Telegram", hosts: ["https://web.telegram.org/*"] },
  { id: "linkedin", label: "LinkedIn", hosts: ["https://www.linkedin.com/*", "https://linkedin.com/*"] },
  { id: "reddit", label: "Reddit", hosts: ["https://www.reddit.com/*", "https://reddit.com/*"] }
];

const DEFAULT_SETTINGS = {
  appEndpoint: "http://localhost:3000/api/archive",
  enableAutoSync: false,
  syncIntervalMinutes: 60,
  selectedPlatforms: SUPPORTED_PLATFORMS.map((platform) => platform.id)
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
  if (alarm.name !== ALARM_NAME) {
    return;
  }
  const settings = await getSettings();
  if (!settings.enableAutoSync) {
    return;
  }
  try {
    await runSync("alarm");
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RUN_SYNC") {
    runSync(message.trigger || "manual")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_STATE") {
    Promise.all([getSettings(), chrome.storage.local.get(["syncRun", "archive"])])
      .then(([settings, items]) => {
        sendResponse({
          ok: true,
          settings,
          syncRun: items.syncRun || null,
          archive: items.archive || null,
          platforms: SUPPORTED_PLATFORMS
        });
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
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    selectedPlatforms: Array.isArray(stored.selectedPlatforms) && stored.selectedPlatforms.length
      ? stored.selectedPlatforms
      : DEFAULT_SETTINGS.selectedPlatforms
  };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

async function getSettings() {
  return ensureSettings();
}

async function saveSettings(nextSettings) {
  const current = await getSettings();
  const merged = {
    ...current,
    ...nextSettings,
    selectedPlatforms: Array.isArray(nextSettings.selectedPlatforms) && nextSettings.selectedPlatforms.length
      ? nextSettings.selectedPlatforms
      : current.selectedPlatforms
  };
  await chrome.storage.local.set({ settings: merged });
  await scheduleSyncAlarm();
  return merged;
}

async function scheduleSyncAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  if (!settings.enableAutoSync) {
    return;
  }
  const period = Math.max(5, Math.min(720, Number(settings.syncIntervalMinutes) || 60));
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 2,
    periodInMinutes: period
  });
}

async function runSync(trigger) {
  const settings = await getSettings();
  const selectedPlatforms = settings.selectedPlatforms || [];
  if (!selectedPlatforms.length) {
    throw new Error("Pick at least one platform in settings before syncing.");
  }

  const startedAt = new Date().toISOString();
  const syncRun = {
    trigger,
    startedAt,
    status: "running",
    errors: []
  };
  await chrome.storage.local.set({ syncRun });

  try {
    const fragments = [];
    const warnings = [];

    for (const platformId of selectedPlatforms) {
      const platform = SUPPORTED_PLATFORMS.find((entry) => entry.id === platformId);
      if (!platform) {
        continue;
      }

      const tabs = await findPlatformTabs(platform);
      if (!tabs.length) {
        warnings.push(`${platform.label}: no open tab found to scrape.`);
        continue;
      }

      for (const tab of tabs) {
        try {
          const fragment = await collectFromTab(tab.id, platformId);
          if (fragment) {
            fragments.push(fragment);
          }
        } catch (error) {
          warnings.push(`${platform.label}: ${error.message}`);
        }
      }
    }

    const archive = mergeFragments(fragments, trigger, warnings);
    await chrome.storage.local.set({
      archive,
      syncRun: archive.syncRun
    });

    try {
      await pushArchiveToApp(settings.appEndpoint, archive);
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

async function findPlatformTabs(platform) {
  const results = [];
  const seen = new Set();

  for (const pattern of platform.hosts) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (!tab.id || seen.has(tab.id)) {
        continue;
      }
      seen.add(tab.id);
      results.push(tab);
    }
  }

  return results.slice(0, 3);
}

async function collectFromTab(tabId, platform) {
  await waitForTabReady(tabId);
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "COLLECT_PLATFORM_PAGE",
        platform
      });
      if (response?.ok) {
        return response.payload;
      }
      if (response?.ok === false) {
        lastError = new Error(response.error || "Collector failed.");
      }
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(lastError?.message || `Could not collect data from tab ${tabId}.`);
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
        setTimeout(finish, 1200);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === "complete") {
        setTimeout(finish, 1200);
      }
    });

    setTimeout(finish, 12000);
  });
}

function mergeFragments(fragments, trigger, warnings) {
  const collectionMap = new Map();
  const postMap = new Map();
  const membershipMap = new Map();
  const notes = [];
  const now = new Date().toISOString();
  const platformSet = new Set();

  for (const fragment of fragments) {
    for (const collection of fragment.collections || []) {
      collectionMap.set(collection.id, collection);
      if (collection.platform) {
        platformSet.add(collection.platform);
      }
    }

    for (const post of fragment.posts || []) {
      const previous = postMap.get(post.id) || {};
      postMap.set(post.id, {
        ...previous,
        ...post,
        enrichments: { ...(previous.enrichments || {}), ...(post.enrichments || {}) }
      });
      if (post.platform) {
        platformSet.add(post.platform);
      }
    }

    for (const membership of fragment.memberships || []) {
      const key = `${membership.collectionId}::${membership.postId}`;
      if (!membershipMap.has(key)) {
        membershipMap.set(key, membership);
      }
    }

    for (const note of fragment.notes || []) {
      notes.push(note);
    }
  }

  const collections = Array.from(collectionMap.values());
  const posts = Array.from(postMap.values());
  const memberships = Array.from(membershipMap.values());

  return {
    sourceAccount: {
      username: "",
      lastSyncedAt: now
    },
    syncRun: {
      trigger,
      completedAt: now,
      status: warnings.length ? "completed-with-warnings" : "completed",
      errors: warnings
    },
    collections,
    posts,
    memberships,
    summary: {
      collectionsCaptured: collections.length,
      postsCaptured: posts.length,
      platformsCaptured: Array.from(platformSet)
    },
    notes,
    warnings
  };
}

async function pushArchiveToApp(appEndpoint, archive) {
  const response = await fetch(appEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Instantiate-Mode": "merge"
    },
    body: JSON.stringify(archive)
  });

  if (!response.ok) {
    throw new Error(`Archive push failed at ${appEndpoint} (HTTP ${response.status}).`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
