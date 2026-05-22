export function getBookmarkletSource({ apiUrl, appUrl }) {
  const replacements = {
    "__API_URL__": apiUrl,
    "__APP_URL__": appUrl
  };
  return RAW_BOOKMARKLET.replace(/__API_URL__|__APP_URL__/g, (match) => replacements[match] || match);
}

export function getBookmarkletHref({ apiUrl, appUrl }) {
  const src = getBookmarkletSource({ apiUrl, appUrl });
  const minified = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `javascript:${encodeURIComponent(minified)}`;
}

const RAW_BOOKMARKLET = `(async function instantiateBookmarklet() {
  const API_URL = "__API_URL__";
  const APP_URL = "__APP_URL__";

  if (!/instagram\\.com/.test(location.hostname)) {
    window.open(APP_URL + "?bookmarklet=needs-instagram", "_blank");
    return;
  }

  if (window.__instantiateActive) {
    window.__instantiateActive.focus();
    return;
  }

  const host = document.createElement("div");
  host.id = "instantiate-host";
  host.setAttribute("data-instantiate", "1");
  Object.assign(host.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647",
    fontFamily: "system-ui, -apple-system, sans-serif",
    pointerEvents: "auto"
  });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const styles = document.createElement("style");
  styles.textContent = \`
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    .panel {
      width: 360px;
      max-height: 78vh;
      display: flex;
      flex-direction: column;
      background: rgba(15, 13, 20, 0.92);
      backdrop-filter: blur(20px) saturate(140%);
      color: #f4f1ea;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 32px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,93,143,0.18);
      animation: slidein 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @keyframes slidein {
      from { opacity: 0; transform: translateY(-10px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .mark {
      width: 28px; height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff5d8f, #b061ff);
      display: grid; place-items: center;
      color: #0c0a12; font-weight: 700; font-size: 0.74rem;
    }
    .title { font-size: 0.96rem; font-weight: 600; letter-spacing: -0.01em; flex: 1; }
    .sub { font-size: 0.74rem; color: rgba(244,241,234,0.5); }
    .close {
      background: none; border: 0; color: rgba(244,241,234,0.5);
      cursor: pointer; padding: 4px; font-size: 1rem; line-height: 1;
    }
    .close:hover { color: #fff; }
    .body { flex: 1; overflow-y: auto; padding: 14px 18px 18px; }
    .stage { display: flex; flex-direction: column; gap: 14px; }
    .lead { font-size: 0.86rem; color: rgba(244,241,234,0.75); line-height: 1.5; }
    .empty {
      padding: 18px; border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px dashed rgba(255,255,255,0.12);
      font-size: 0.84rem; color: rgba(244,241,234,0.6);
    }
    .list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
    .row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 11px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease;
    }
    .row:hover { background: rgba(255,255,255,0.05); }
    .row.checked {
      background: linear-gradient(135deg, rgba(255,93,143,0.16), rgba(176,97,255,0.10));
      border-color: rgba(255,93,143,0.4);
    }
    .row input { accent-color: #ff5d8f; }
    .row .label { font-size: 0.86rem; flex: 1; }
    .row .meta { font-size: 0.72rem; color: rgba(244,241,234,0.45); font-variant-numeric: tabular-nums; }
    .actions {
      display: flex; gap: 8px; align-items: center;
      padding-top: 4px;
    }
    .btn {
      padding: 9px 14px;
      border-radius: 999px;
      font: inherit; font-size: 0.84rem;
      border: 0; cursor: pointer;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .btn.primary {
      background: linear-gradient(135deg, #ff5d8f, #b061ff);
      color: #0c0a12;
      font-weight: 600;
      box-shadow: 0 8px 24px -8px rgba(255,93,143,0.5);
    }
    .btn.primary:hover { transform: translateY(-1px); }
    .btn.ghost {
      background: rgba(255,255,255,0.05);
      color: #f4f1ea;
      border: 1px solid rgba(255,255,255,0.10);
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .selectall {
      font-size: 0.76rem;
      color: #ff8ca9;
      background: none; border: 0; cursor: pointer;
      padding: 0;
    }
    .selectall:hover { color: #ffb6c8; }
    .progress {
      display: flex; flex-direction: column; gap: 8px;
    }
    .bar {
      height: 6px; border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }
    .bar > span {
      display: block; height: 100%;
      background: linear-gradient(90deg, #ff5d8f, #b061ff);
      transition: width 300ms ease;
    }
    .log {
      max-height: 160px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
      font-size: 0.78rem; color: rgba(244,241,234,0.6);
      font-family: ui-monospace, monospace;
    }
    .log > div.ok { color: rgba(56,214,194,0.9); }
    .log > div.err { color: rgba(255,107,107,0.9); }
    .done {
      display: flex; flex-direction: column; gap: 10px;
      align-items: flex-start;
    }
    .done .stat {
      font-size: 1.8rem; font-weight: 600; letter-spacing: -0.02em;
      background: linear-gradient(135deg, #ff5d8f, #38d6c2);
      -webkit-background-clip: text; background-clip: text;
      color: transparent;
    }
    a.applink {
      color: #ff8ca9; text-decoration: none; font-size: 0.86rem;
    }
    a.applink:hover { color: #ffb6c8; text-decoration: underline; }
    .hint {
      font-size: 0.74rem; color: rgba(244,241,234,0.45);
      padding: 8px 10px; border-radius: 8px;
      background: rgba(255,255,255,0.03);
    }
    .pulse { animation: pulse 1.6s ease-in-out infinite; }
  \`;
  shadow.appendChild(styles);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = \`
    <div class="head">
      <div class="mark">IN</div>
      <div style="flex:1; min-width:0;">
        <div class="title">Insta-ntiate</div>
        <div class="sub" id="sub">Scanning this page…</div>
      </div>
      <button class="close" id="close" aria-label="Close">✕</button>
    </div>
    <div class="body" id="body">
      <div class="stage" id="loading">
        <div class="lead pulse">Looking for saved collections on this page.</div>
      </div>
    </div>
  \`;
  shadow.appendChild(panel);

  const $ = (id) => shadow.getElementById(id);
  const closeBtn = $("close");
  const focus = () => { panel.scrollIntoView({ behavior: "smooth" }); };
  window.__instantiateActive = { focus, close: cleanup };

  function cleanup() {
    host.remove();
    delete window.__instantiateActive;
  }
  closeBtn.addEventListener("click", cleanup);
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape" && shadow.contains(e.target) === false) {
      cleanup();
      document.removeEventListener("keydown", escHandler);
    }
  });

  await new Promise((r) => setTimeout(r, 600));

  const pageKind = detectPageKind();
  const username = readUsername();

  if (pageKind === "savedOverview") {
    const collections = scrapeCollections();
    if (!collections.length) {
      renderEmpty("No saved collections detected on this page. Scroll down on the saved page so they load, then click the bookmark again.");
      return;
    }
    renderCollectionPicker(collections);
  } else if (pageKind === "collection") {
    const posts = scrapePostsInView();
    const title = readCollectionTitle();
    renderPostsPreview({ title, posts });
  } else if (pageKind === "post") {
    const post = scrapeSinglePost();
    renderSinglePost(post);
  } else {
    renderEmpty("This page isn't a saved page or post. Open your saved collections (instagram.com/" + (username || "your_username") + "/saved/), then click the bookmark.");
  }

  function detectPageKind() {
    const path = location.pathname;
    if (/\\/saved\\/?$/.test(path)) return "savedOverview";
    if (/\\/saved\\/[^/]+\\/?$/.test(path)) return "collection";
    if (/\\/(p|reel)\\//.test(path)) return "post";
    return "unknown";
  }

  function readUsername() {
    const m = document.documentElement.innerHTML.match(/"username":"([^"]+)"/);
    return m ? m[1] : "";
  }

  function readCollectionTitle() {
    const h1 = document.querySelector("h1, h2");
    if (h1) return h1.textContent.trim();
    const parts = location.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "Untitled");
  }

  function scrapeCollections() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/saved/"]'));
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = a.href;
      if (!href) continue;
      if (/\\/saved\\/?$/.test(href)) continue;
      if (/your_activity/.test(href)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const title = (a.textContent || "").trim() || a.getAttribute("aria-label") || "Untitled";
      const id = slugify(title || href);
      const thumb = a.querySelector("img")?.src || "";
      out.push({ id, title, url: href, thumb });
    }
    return out;
  }

  function scrapePostsInView() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const url = normalizeUrl(a.href);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const shortcode = extractShortcode(url);
      const thumb = a.querySelector("img")?.src || "";
      const caption = a.querySelector("img")?.alt || "";
      out.push({
        id: shortcode,
        shortcode,
        canonicalUrl: url,
        creatorHandle: "",
        caption,
        mediaType: /\\/reel\\//.test(url) ? "video" : "image",
        thumbnailUrl: thumb,
        videoUrl: "",
        capturedAt: new Date().toISOString(),
        rank: out.length + 1,
        enrichments: {}
      });
    }
    return out;
  }

  function scrapeSinglePost() {
    const url = normalizeUrl(location.href);
    const shortcode = extractShortcode(url);
    const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";
    const ogVideo = document.querySelector('meta[property="og:video"]')?.content || "";
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || "";
    const handle = (ogDesc.match(/@([a-z0-9._]+)/i) || [])[1];
    const caption = ogDesc.replace(/^[^:]+:\\s*/, "").replace(/\\s*-\\s*Instagram.*$/i, "").trim();
    return {
      id: shortcode,
      shortcode,
      canonicalUrl: url,
      creatorHandle: handle ? "@" + handle : "",
      caption,
      mediaType: ogVideo ? "video" : "image",
      thumbnailUrl: ogImage,
      videoUrl: ogVideo,
      capturedAt: new Date().toISOString(),
      enrichments: {}
    };
  }

  function normalizeUrl(u) {
    try { const url = new URL(u); return url.origin + url.pathname; }
    catch { return u; }
  }
  function extractShortcode(u) {
    const m = u.match(/\\/(p|reel)\\/([^/?#]+)/);
    return m ? m[2] : slugify(u);
  }
  function slugify(v) {
    return String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function renderEmpty(msg) {
    const body = $("body");
    $("sub").textContent = "Nothing to capture";
    body.innerHTML = '<div class="stage"><div class="empty">' + msg + '</div></div>';
  }

  function renderCollectionPicker(collections) {
    $("sub").textContent = "Found " + collections.length + " collection" + (collections.length === 1 ? "" : "s");
    const body = $("body");
    body.innerHTML = \`
      <div class="stage">
        <div class="lead">Pick the collections to add to your archive. We'll save the post URLs and metadata visible on this page. To go deeper, open a collection and click the bookmark again.</div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <button class="selectall" id="selectall">Select all</button>
          <span class="sub" id="selcount">0 selected</span>
        </div>
        <div class="list" id="list"></div>
        <div class="actions">
          <button class="btn primary" id="go" disabled>Save selected</button>
          <button class="btn ghost" id="cancel">Cancel</button>
        </div>
        <div class="hint">Tip: this captures collection names + URLs you can see. Open each collection and click the bookmark inside to capture its posts.</div>
      </div>
    \`;
    const list = $("list");
    const selected = new Set();
    collections.forEach((c) => {
      const row = document.createElement("label");
      row.className = "row";
      row.innerHTML = \`
        <input type="checkbox" data-id="\${c.id}" />
        <span class="label">\${escapeHtml(c.title)}</span>
        <span class="meta">/saved/</span>
      \`;
      list.appendChild(row);
      row.addEventListener("click", (e) => {
        if (e.target.tagName !== "INPUT") {
          const cb = row.querySelector("input");
          cb.checked = !cb.checked;
        }
        const cb = row.querySelector("input");
        if (cb.checked) { selected.add(c.id); row.classList.add("checked"); }
        else { selected.delete(c.id); row.classList.remove("checked"); }
        $("selcount").textContent = selected.size + " selected";
        $("go").disabled = selected.size === 0;
      });
    });
    $("selectall").addEventListener("click", () => {
      const allChecked = selected.size === collections.length;
      list.querySelectorAll("input").forEach((cb, i) => {
        cb.checked = !allChecked;
        const row = cb.closest(".row");
        if (cb.checked) { selected.add(collections[i].id); row.classList.add("checked"); }
        else { selected.delete(collections[i].id); row.classList.remove("checked"); }
      });
      $("selcount").textContent = selected.size + " selected";
      $("go").disabled = selected.size === 0;
      $("selectall").textContent = allChecked ? "Select all" : "Clear";
    });
    $("cancel").addEventListener("click", cleanup);
    $("go").addEventListener("click", async () => {
      const picked = collections.filter((c) => selected.has(c.id));
      await pushArchive({
        sourceAccount: { username, lastSyncedAt: new Date().toISOString() },
        collections: picked.map((c, i) => ({
          id: c.id, title: c.title, url: c.url, position: i + 1, capturedAt: new Date().toISOString()
        })),
        posts: [],
        memberships: [],
        syncRun: { trigger: "bookmarklet:overview", status: "completed", completedAt: new Date().toISOString() },
        notes: ["Collections discovered via bookmarklet on saved overview."]
      }, "merge", { discovered: collections.length, picked: picked.length });
    });
  }

  function renderPostsPreview({ title, posts }) {
    $("sub").textContent = posts.length + " post" + (posts.length === 1 ? "" : "s") + " visible";
    const body = $("body");
    body.innerHTML = \`
      <div class="stage">
        <div class="lead">Inside <strong>\${escapeHtml(title)}</strong>. We'll capture every post visible on this page. Scroll the collection first to load more before clicking the bookmark.</div>
        <div class="actions">
          <button class="btn primary" id="go">Save \${posts.length} post\${posts.length === 1 ? "" : "s"}</button>
          <button class="btn ghost" id="cancel">Cancel</button>
        </div>
        <div class="hint">Tip: open each post once to load its caption + creator into the page metadata before clicking the bookmark, for richer data.</div>
      </div>
    \`;
    $("cancel").addEventListener("click", cleanup);
    $("go").addEventListener("click", async () => {
      const collectionId = slugify(title);
      await pushArchive({
        sourceAccount: { username, lastSyncedAt: new Date().toISOString() },
        collections: [{
          id: collectionId, title, url: location.origin + location.pathname,
          position: 1, capturedAt: new Date().toISOString()
        }],
        posts,
        memberships: posts.map((p, i) => ({
          collectionId, postId: p.id, rank: i + 1, capturedAt: new Date().toISOString()
        })),
        syncRun: { trigger: "bookmarklet:collection", status: "completed", completedAt: new Date().toISOString() },
        notes: ["Collection '" + title + "' captured via bookmarklet."]
      }, "merge", { posts: posts.length });
    });
  }

  function renderSinglePost(post) {
    $("sub").textContent = "Single post";
    const body = $("body");
    body.innerHTML = \`
      <div class="stage">
        <div class="lead">Captured: <strong>\${escapeHtml(post.creatorHandle || post.shortcode)}</strong></div>
        <div class="actions">
          <button class="btn primary" id="go">Save to archive</button>
          <button class="btn ghost" id="cancel">Cancel</button>
        </div>
      </div>
    \`;
    $("cancel").addEventListener("click", cleanup);
    $("go").addEventListener("click", async () => {
      await pushArchive({
        sourceAccount: { username, lastSyncedAt: new Date().toISOString() },
        collections: [],
        posts: [post],
        memberships: [],
        syncRun: { trigger: "bookmarklet:post", status: "completed", completedAt: new Date().toISOString() },
        notes: ["Single post captured via bookmarklet."]
      }, "merge", { posts: 1 });
    });
  }

  async function pushArchive(payload, mode, summary) {
    $("sub").textContent = "Saving to your archive…";
    const body = $("body");
    body.innerHTML = \`
      <div class="stage">
        <div class="progress">
          <div class="bar"><span style="width: 30%;"></span></div>
          <div class="log" id="log"><div>POST \${API_URL}</div></div>
        </div>
      </div>
    \`;
    const log = $("log");
    const append = (msg, cls) => {
      const div = document.createElement("div");
      if (cls) div.className = cls;
      div.textContent = msg;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    };
    const fillBar = (pct) => {
      const bar = shadow.querySelector(".bar > span");
      if (bar) bar.style.width = pct + "%";
    };
    fillBar(60);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Instantiate-Mode": mode },
        body: JSON.stringify(payload),
        credentials: "omit"
      });
      fillBar(100);
      if (!res.ok) {
        append("HTTP " + res.status + " " + res.statusText, "err");
        append("Make sure the Insta-ntiate app is running at " + APP_URL, "err");
        return;
      }
      append("Saved ✓", "ok");
      await new Promise((r) => setTimeout(r, 400));
      renderDone(summary);
    } catch (err) {
      append("Network error: " + err.message, "err");
      append("If you're on Firefox, bookmarklet CSP may be blocking. Try Chrome.", "err");
      append("Confirm the app is reachable at " + APP_URL, "err");
    }
  }

  function renderDone(summary) {
    $("sub").textContent = "Done";
    const body = $("body");
    const total = (summary.posts || 0) + (summary.picked || 0);
    body.innerHTML = \`
      <div class="stage done">
        <div class="stat">+ \${total}</div>
        <div class="lead">Pushed to your archive. Search is live in the dashboard.</div>
        <div class="actions">
          <a class="btn primary" href="\${APP_URL}" target="_blank">Open dashboard</a>
          <button class="btn ghost" id="cancel">Done</button>
        </div>
        <div class="hint">Click the bookmark on more pages to merge them in. Your archive grows with each click.</div>
      </div>
    \`;
    $("cancel").addEventListener("click", cleanup);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();`;
