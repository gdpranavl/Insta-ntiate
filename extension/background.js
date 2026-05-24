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
  selectedPlatforms: [],
  perPlatformSettings: {
    instagram: {
      enabledScopes: { saved: false, liked: false, history: false },
      scrapeCollectionsFirst: false,
      selectedCollections: [],
      reelCount: 3,
      extractionFields: { id: false, link: false, caption: false, comments: false, description: false, audio: false }
    }
  }
};

async function logDebug(stage, detail = {}) {
  const entry = {
    ts: new Date().toISOString(),
    stage,
    detail
  };
  try {
    const current = (await chrome.storage.local.get(["debugLogs"]))?.debugLogs || [];
    const next = [entry, ...current].slice(0, 300);
    await chrome.storage.local.set({ debugLogs: next });
  } catch (_) {}
  try {
    console.log("[Insta-ntiate][debug]", stage, detail);
  } catch (_) {}
}

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

  if (message?.type === "RUN_INSTAGRAM_SYNC") {
    runInstagramSync(message.trigger || "manual")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "DISCOVER_COLLECTIONS") {
    (async () => {
      try {
        await logDebug("discover:start", {});
        const platform = SUPPORTED_PLATFORMS.find((p) => p.id === "instagram");
        if (!platform) {
          await logDebug("discover:unsupported", {});
          sendResponse({ ok: false, error: "Instagram not supported." });
          return;
        }
        // Step 1: open Instagram home to detect username
        const homeTab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: false });
        await logDebug("discover:home-tab-opened", { tabId: homeTab.id });
        let username = "";
        try {
          const homeFragment = await collectFromTab(homeTab.id, "instagram");
          username = homeFragment?.sourceAccount?.username || "";
          await logDebug("discover:username-detected", { username });
        } finally {
          await chrome.tabs.remove(homeTab.id);
          await logDebug("discover:home-tab-closed", { tabId: homeTab.id });
        }

        if (!username) {
          sendResponse({ ok: false, error: "Could not detect logged-in Instagram username." });
          return;
        }

        // Step 2: open saved page for that username and scrape collections
        const savedUrl = `https://www.instagram.com/${username}/saved/`;
        const savedTab = await chrome.tabs.create({ url: savedUrl, active: false });
        await logDebug("discover:saved-tab-opened", { tabId: savedTab.id, savedUrl });
        let fragment = null;
        try {
          fragment = await collectFromTab(savedTab.id, "instagram");
          await logDebug("discover:saved-scraped", {
            tabId: savedTab.id,
            collectionCount: fragment?.collections?.length || 0
          });
        } finally {
          await chrome.tabs.remove(savedTab.id);
          await logDebug("discover:saved-tab-closed", { tabId: savedTab.id });
        }

        const collections = fragment?.collections || [];
        if (!collections.length) {
          sendResponse({ ok: false, error: "Could not find saved collections. Open Saved and try again." });
          return;
        }

        sendResponse({ ok: true, collections });
        await logDebug("discover:done", { collectionCount: collections.length });
      } catch (error) {
        await logDebug("discover:error", { message: error.message });
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "GET_STATE") {
    Promise.all([getSettings(), chrome.storage.local.get(["syncRun", "archive", "debugLogs", "lastInstagramOutput"])])
      .then(([settings, items]) => {
        sendResponse({
          ok: true,
          settings,
          syncRun: items.syncRun || null,
          archive: items.archive || null,
          debugLogs: items.debugLogs || [],
          lastInstagramOutput: items.lastInstagramOutput || null,
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
      : DEFAULT_SETTINGS.selectedPlatforms,
    perPlatformSettings: {
      ...(DEFAULT_SETTINGS.perPlatformSettings || {}),
      ...(stored.perPlatformSettings || {})
    }
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
      : current.selectedPlatforms,
    perPlatformSettings: {
      ...(current.perPlatformSettings || {}),
      ...(nextSettings.perPlatformSettings || {})
    }
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

      if (platformId === "instagram") {
        const instagramResult = await runInstagramSync(trigger, { pushToApp: false });
        fragments.push(instagramResult);
        if (instagramResult.warnings?.length) {
          warnings.push(...instagramResult.warnings.map((warning) => `Instagram: ${warning}`));
        }
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

async function runInstagramSync(trigger, options = {}) {
  await logDebug("instagram-sync:start", { trigger });
  const settings = await getSettings();
  const igSettings = settings.perPlatformSettings?.instagram || {};
  const selectedCollections = Array.isArray(igSettings.selectedCollections) ? igSettings.selectedCollections : [];
  const scopes = igSettings.enabledScopes || {};
  const hasScope = Boolean(scopes.saved || scopes.liked || scopes.history);

  if (!hasScope) {
    await logDebug("instagram-sync:scope-disabled", {});
    throw new Error("Instagram: all scopes are disabled in settings.");
  }

  if (!selectedCollections.length) {
    await logDebug("instagram-sync:no-collections", {});
    throw new Error("Instagram: no saved collections selected. Use Fetch collections first.");
  }

  const startedAt = new Date().toISOString();
  const syncRun = {
    trigger,
    startedAt,
    platform: "instagram",
    status: "running",
    errors: []
  };
  await chrome.storage.local.set({ syncRun });

  const fragments = [];
  const warnings = [];

  let username = "";
  try {
    const homeTab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: false });
    await logDebug("instagram-sync:home-tab-opened", { tabId: homeTab.id });
    try {
      const homeFragment = await collectFromTab(homeTab.id, "instagram");
      username = homeFragment?.sourceAccount?.username || "";
      await logDebug("instagram-sync:username", { username });
    } finally {
      await chrome.tabs.remove(homeTab.id);
      await logDebug("instagram-sync:home-tab-closed", { tabId: homeTab.id });
    }
  } catch (error) {
    warnings.push(`Could not detect logged-in username: ${error.message}`);
    await logDebug("instagram-sync:username-error", { message: error.message });
  }

  for (const collection of selectedCollections) {
    const collectionUrl = collection.url || (username ? `https://www.instagram.com/${username}/saved/${collection.id}/` : "");
    if (!collectionUrl) {
      warnings.push(`Skipping collection ${collection.title || collection.id || "unknown"}: no URL available.`);
      await logDebug("instagram-sync:collection-skip", { reason: "no-url", collection });
      continue;
    }

    const tab = await chrome.tabs.create({ url: collectionUrl, active: false });
    await logDebug("instagram-sync:collection-opened", { collectionUrl, tabId: tab.id, collection });
    try {
      const fragment = await collectFromTab(tab.id, "instagram");
      if (fragment) {
        const limit = Number(collection.reelCount ?? igSettings.reelCount ?? 3);
        if (Array.isArray(fragment.posts) && Number.isFinite(limit) && limit >= 0) {
          fragment.posts = fragment.posts.slice(0, limit);
          const collectionId = fragment.collections?.[0]?.id;
          if (collectionId) {
            fragment.memberships = (fragment.memberships || []).filter((membership) => membership.collectionId === collectionId).slice(0, limit);
          }
        }
        await hydrateInstagramVideoPosts(fragment, limit);
        fragment.notes = [
          ...(fragment.notes || []),
          `Synced ${collection.title || collection.id || collectionUrl} with reel limit ${limit}.`
        ];
        fragments.push(fragment);
        await logDebug("instagram-sync:collection-scraped", {
          collectionUrl,
          postsCaptured: fragment.posts?.length || 0,
          collectionsCaptured: fragment.collections?.length || 0,
          limit
        });
      }
    } catch (error) {
      warnings.push(`Instagram collection ${collection.title || collection.id || collectionUrl}: ${error.message}`);
      await logDebug("instagram-sync:collection-error", { collectionUrl, message: error.message });
    } finally {
      await chrome.tabs.remove(tab.id);
      await logDebug("instagram-sync:collection-tab-closed", { tabId: tab.id, collectionUrl });
    }
  }

  const archive = mergeFragments(fragments, trigger, warnings);
  archive.sourceAccount.username = username || archive.sourceAccount.username || "";
  archive.syncRun.platform = "instagram";

  await chrome.storage.local.set({ archive, syncRun: archive.syncRun });
  await chrome.storage.local.set({ lastInstagramOutput: archive });
  await logDebug("instagram-sync:result", {
    postsCaptured: archive.summary?.postsCaptured || 0,
    collectionsCaptured: archive.summary?.collectionsCaptured || 0,
    warnings: archive.warnings?.length || 0
  });

  if (options.pushToApp !== false) {
    try {
      await pushArchiveToApp(settings.appEndpoint, archive);
    } catch (error) {
      archive.warnings.push(error.message);
      await chrome.storage.local.set({ archive });
    }
  }

  return archive;
}

async function hydrateInstagramVideoPosts(fragment, limit) {
  const posts = Array.isArray(fragment?.posts) ? fragment.posts : [];
  const candidates = posts.filter((post) => isInstagramVideoCandidate(post)).slice(0, Math.max(0, Number(limit) || 0));

  for (const post of candidates) {
    if (post.videoUrl) {
      continue;
    }

    if (!post.canonicalUrl) {
      await logDebug("instagram-sync:video-skip", { postId: post.id, reason: "missing-canonical-url" });
      continue;
    }

    const tab = await chrome.tabs.create({ url: post.canonicalUrl, active: false });
    await logDebug("instagram-sync:video-opened", { postId: post.id, tabId: tab.id, url: post.canonicalUrl });
    try {
      const detailFragment = await collectFromTab(tab.id, "instagram");
      const detailPost = detailFragment?.posts?.[0];
      if (detailPost?.videoUrl) {
        Object.assign(post, {
          ...detailPost,
          id: post.id,
          canonicalUrl: post.canonicalUrl,
          enrichments: {
            ...(post.enrichments || {}),
            ...(detailPost.enrichments || {})
          }
        });
        await logDebug("instagram-sync:video-hydrated", {
          postId: post.id,
          shortcode: post.shortcode || detailPost.shortcode || "",
          hasVideoUrl: true
        });
      } else {
        await logDebug("instagram-sync:video-missing", { postId: post.id, url: post.canonicalUrl });
      }
    } catch (error) {
      await logDebug("instagram-sync:video-error", { postId: post.id, message: error.message });
    } finally {
      await chrome.tabs.remove(tab.id);
      await logDebug("instagram-sync:video-closed", { postId: post.id, tabId: tab.id });
    }
  }
}

function isInstagramVideoCandidate(post) {
  return Boolean(
    post &&
      post.platform === "instagram" &&
      (post.entityType === "reel" || post.mediaType === "video" || /\/reel\//.test(post.canonicalUrl || "") || post.videoUrl)
  );
}

async function collectFromTab(tabId, platform) {
  await waitForTabReady(tabId);
  await logDebug("collect-from-tab:start", { tabId, platform });
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const settings = (await getSettings())?.perPlatformSettings?.[platform] || {};
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "COLLECT_PLATFORM_PAGE",
        platform,
        settings
      });
      if (response?.ok) {
        await logDebug("collect-from-tab:ok", {
          tabId,
          platform,
          posts: response.payload?.posts?.length || 0,
          collections: response.payload?.collections?.length || 0
        });
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
