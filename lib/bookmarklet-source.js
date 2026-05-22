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
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-weight: 300; }
    .panel {
      width: 380px;
      max-height: 78vh;
      display: flex;
      flex-direction: column;
      background: rgba(0, 0, 0, 0.94);
      backdrop-filter: blur(22px) saturate(140%);
      color: #f5f5f3;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 32px 80px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05);
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
      gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .mark {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, #d4d4d4 28%, #6a6a6a 58%, #1a1a1a 100%);
      box-shadow:
        inset 0 -2px 4px rgba(0,0,0,0.6),
        inset 0 2px 3px rgba(255,255,255,0.4),
        0 4px 12px rgba(0,0,0,0.6);
      display: grid; place-items: center;
      color: #0a0a0a; font-weight: 500; font-size: 0.62rem;
      letter-spacing: 0.16em;
    }
    .title {
      font-size: 0.78rem;
      font-weight: 400;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      flex: 1;
      color: #f5f5f3;
    }
    .sub {
      display: block;
      font-size: 0.62rem;
      color: rgba(245,245,243,0.42);
      letter-spacing: 0.22em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .close {
      background: none; border: 0; color: rgba(245,245,243,0.42);
      cursor: pointer; padding: 4px; font-size: 1rem; line-height: 1;
      transition: color 160ms ease;
    }
    .close:hover { color: #f5f5f3; }
    .body { flex: 1; overflow-y: auto; padding: 16px 20px 20px; }
    .stage { display: flex; flex-direction: column; gap: 16px; }
    .lead { font-size: 0.84rem; color: rgba(245,245,243,0.72); line-height: 1.65; font-weight: 300; }
    .empty {
      padding: 20px; border-radius: 10px;
      background: transparent;
      border: 1px dashed rgba(255,255,255,0.14);
      font-size: 0.82rem; color: rgba(245,245,243,0.55);
      line-height: 1.55;
    }
    .barLabel {
      display: flex; align-items: center; gap: 14px;
    }
    .barLabel .txt {
      font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase;
      color: rgba(245,245,243,0.42); white-space: nowrap;
    }
    .barLabel .rule {
      flex: 1; height: 1px; background: rgba(255,255,255,0.08);
    }
    .list { display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
    .row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.06);
      background: transparent;
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease;
    }
    .row:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.18); }
    .row.checked {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.42);
    }
    .row input { accent-color: #ffffff; }
    .row .label { font-size: 0.86rem; flex: 1; font-weight: 300; }
    .row .meta {
      font-size: 0.62rem;
      color: rgba(245,245,243,0.38);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.08em;
    }
    .actions {
      display: flex; gap: 10px; align-items: center;
      padding-top: 6px;
    }
    .btn {
      padding: 10px 18px;
      border-radius: 999px;
      font: inherit;
      font-size: 0.7rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 400;
      border: 0; cursor: pointer;
      transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    .btn.primary {
      background: linear-gradient(180deg, #ffffff 0%, #c8c8c8 50%, #e8e8e8 51%, #ffffff 100%);
      color: #0a0a0a;
      font-weight: 500;
      border: 1px solid rgba(255,255,255,0.6);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.9),
        inset 0 -1px 0 rgba(0,0,0,0.18),
        0 8px 20px rgba(0,0,0,0.5);
    }
    .btn.primary:hover {
      transform: translateY(-1px);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,1),
        inset 0 -1px 0 rgba(0,0,0,0.2),
        0 14px 28px rgba(0,0,0,0.55);
    }
    .btn.ghost {
      background: transparent;
      color: rgba(245,245,243,0.72);
      border: 1px solid rgba(255,255,255,0.22);
    }
    .btn.ghost:hover { background: rgba(255,255,255,0.05); color: #f5f5f3; border-color: rgba(255,255,255,0.42); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .selectall {
      font-size: 0.62rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(245,245,243,0.72);
      background: none; border: 0; cursor: pointer;
      padding: 0;
      transition: color 160ms ease;
    }
    .selectall:hover { color: #f5f5f3; }
    .progress {
      display: flex; flex-direction: column; gap: 10px;
    }
    .bar {
      height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .bar > span {
      display: block; height: 100%;
      background: linear-gradient(90deg, #6a6a6a 0%, #ffffff 50%, #6a6a6a 100%);
      transition: width 300ms ease;
    }
    .log {
      max-height: 160px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
      font-size: 0.74rem; color: rgba(245,245,243,0.55);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.02em;
    }
    .log > div.ok { color: #f5f5f3; font-weight: 400; }
    .log > div.err { color: rgba(255,107,107,0.92); }
    .done {
      display: flex; flex-direction: column; gap: 14px;
      align-items: flex-start;
    }
    .done .stat {
      font-size: 2.2rem; font-weight: 200; letter-spacing: -0.03em;
      background: linear-gradient(180deg, #ffffff 0%, #d4d4d4 32%, #6a6a6a 50%, #bcbcbc 68%, #ffffff 100%);
      -webkit-background-clip: text; background-clip: text;
      color: transparent;
      -webkit-text-fill-color: transparent;
    }
    a.applink {
      color: rgba(245,245,243,0.72); text-decoration: none;
      font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
    }
    a.applink:hover { color: #f5f5f3; }
    .hint {
      font-size: 0.7rem;
      color: rgba(245,245,243,0.42);
      padding: 0;
      background: none;
      letter-spacing: 0.02em;
      font-weight: 300;
      line-height: 1.6;
    }
    .hintLabel {
      display: block;
      font-size: 0.6rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(245,245,243,0.42);
      margin-bottom: 6px;
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
        <div class="sub" id="sub">Scanning this page</div>
      </div>
      <button class="close" id="close" aria-label="Close">×</button>
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
        <div class="hint"><span class="hintLabel">Note</span>This captures collection names + URLs visible on this page. Open each collection and click the bookmark inside to capture its posts.</div>
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
        <div class="hint"><span class="hintLabel">Note</span>Open each post once to load its caption and creator into the page metadata before clicking the bookmark, for richer data.</div>
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
      append("Saved.", "ok");
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
        <div class="hint"><span class="hintLabel">Next</span>Click the bookmark on more pages to merge them in. Your archive grows with each click.</div>
      </div>
    \`;
    $("cancel").addEventListener("click", cleanup);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();`;
