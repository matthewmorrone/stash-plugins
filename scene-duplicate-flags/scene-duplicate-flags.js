(function () {
    "use strict";

    const INSTALL_FLAG = "__scene_duplicate_checker_tools_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    // This plugin is designed specifically for Stash's duplicate checker route.
    function isDuplicateCheckerPage() {
        return String(location.pathname || "") === "/sceneDuplicateChecker";
    }

    if (!isDuplicateCheckerPage()) return;

    const STORE_KEY = "scene_duplicate_checker_tools_v1";
    const STYLE_ID = "cene-duplicate-checker-tools-style";

    const STORE_CHANGED_EVENT = "scene_duplicate_checker_tools_changed";

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch {
            return "";
        }
    }

    function safeJsonParse(s) {
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    }

    function defaultStore() {
        return {
            version: 1,
            // confirmed pairs (for UI), plus group assignment for more than just a generic tag
            confirmedPairs: {}, // key -> {key,a,b,groupId,createdAt,updatedAt,reason?}
            ignoredPairs: {}, // key -> {key,a,b,createdAt,updatedAt,reason?}
            groups: {}, // groupId -> { groupId, sceneIds: [], createdAt, updatedAt }
            sceneToGroup: {}, // sceneId -> groupId
            nextGroupId: 1,
            settings: {
                applyGroupTag: true,
                tagPrefix: "dupe:",
                alsoApplyGenericTag: false,
                genericTagName: "duplicate",
            },
        };
    }

    function loadStore() {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return defaultStore();
        const parsed = safeJsonParse(raw);
        if (!parsed || typeof parsed !== "object") return defaultStore();
        const base = defaultStore();
        const settings = { ...base.settings, ...(parsed.settings || {}) };
        return {
            ...base,
            ...parsed,
            settings,
            confirmedPairs: parsed.confirmedPairs && typeof parsed.confirmedPairs === "object" ? parsed.confirmedPairs : {},
            ignoredPairs: parsed.ignoredPairs && typeof parsed.ignoredPairs === "object" ? parsed.ignoredPairs : {},
            groups: parsed.groups && typeof parsed.groups === "object" ? parsed.groups : {},
            sceneToGroup: parsed.sceneToGroup && typeof parsed.sceneToGroup === "object" ? parsed.sceneToGroup : {},
        };
    }

    function saveStore(store) {
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
        window.dispatchEvent(new Event(STORE_CHANGED_EVENT));
    }

    function normalizeId(id) {
        const s = String(id || "").trim();
        if (!s) return null;
        return s;
    }

    function normalizePairKey(aId, bId) {
        const a = normalizeId(aId);
        const b = normalizeId(bId);
        if (!a || !b) return null;
        if (a === b) return null;
        return a < b ? `${a}:${b}` : `${b}:${a}`;
    }

    function pairKeyToIds(key) {
        const m = String(key || "").match(/^(.+?):(.+)$/);
        if (!m) return null;
        return { a: m[1], b: m[2] };
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function sceneUrl(sceneId) {
        const id = normalizeId(sceneId);
        if (!id) return "#";
        return `/scenes/${encodeURIComponent(id)}`;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .sdct-panel {
                margin: 10px 0;
                padding: 10px 12px;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(20,22,26,0.70);
                color: #e9eef5;
                font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            }
            .sdct-panel h3 {
                font-size: 13px;
                margin: 0 0 6px 0;
                font-weight: 650;
            }
            .sdct-help {
                font-size: 12px;
                opacity: 0.75;
                margin-bottom: 10px;
            }
            .sdct-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }
            .sdct-btn {
                appearance: none;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: #e9eef5;
                border-radius: 10px;
                padding: 4px 9px;
                cursor: pointer;
                font-size: 12px;
                font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                line-height: 1.2;
            }
            .sdct-btn:hover { background: rgba(255,255,255,0.09); }
            .sdct-btn:disabled { opacity: 0.6; cursor: default; }

            .sdct-chip {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 18px;
                border-radius: 999px;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.08);
                padding: 0 7px;
                font-size: 11px;
                opacity: 0.95;
            }

            .sdct-inline {
                margin-top: 6px;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
            .sdct-inline[data-sdct-injected='true'] { }

            .sdct-muted { opacity: 0.75; font-size: 12px; }

            /* When a pair is ignored, we hide its container */
            [data-sdct-ignored='true'] { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    function createEl(tag, { className, text, html, attrs } = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = String(text);
        if (html != null) el.innerHTML = String(html);
        if (attrs && typeof attrs === "object") {
            for (const [k, v] of Object.entries(attrs)) {
                if (v == null) continue;
                el.setAttribute(k, String(v));
            }
        }
        return el;
    }

    async function gql(query, variables) {
        const response = await fetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });
        const data = await response.json();
        if (data?.errors?.length) {
            const msg = data.errors.map((e) => e?.message).filter(Boolean).join("; ");
            throw new Error(msg || "GraphQL error");
        }
        return data?.data;
    }

    async function fetchSceneTags(sceneId) {
        const query = `
            query FindScene($id: ID!) {
                findScene(id: $id) {
                    id
                    tags { id name }
                }
            }
        `;
        const data = await gql(query, { id: sceneId });
        const tags = data?.findScene?.tags;
        return Array.isArray(tags) ? tags : [];
    }

    async function updateSceneTags(sceneId, tagIds) {
        const mutation = `
            mutation SceneUpdate($input: SceneUpdateInput!) {
                sceneUpdate(input: $input) { id }
            }
        `;
        await gql(mutation, { input: { id: sceneId, tag_ids: tagIds } });
    }

    async function findTagIdByNameExact(tagName) {
        const q = String(tagName || "").trim();
        if (!q) return null;
        const query = `
            query FindTags($tag_filter: TagFilterType, $filter: FindFilterType) {
                findTags(tag_filter: $tag_filter, filter: $filter) {
                    tags { id name }
                }
            }
        `;
        const variables = {
            tag_filter: { name: { value: q, modifier: "INCLUDES" } },
            filter: { per_page: 50, sort: "name", direction: "ASC" },
        };
        const data = await gql(query, variables);
        const tags = Array.isArray(data?.findTags?.tags) ? data.findTags.tags : [];
        const exact = tags.find((t) => String(t?.name || "").toLowerCase() === q.toLowerCase());
        return exact?.id ? String(exact.id) : null;
    }

    async function createTagByName(tagName) {
        const name = String(tagName || "").trim();
        if (!name) throw new Error("Tag name is required");
        const mutation = `
            mutation TagCreate($input: TagCreateInput!) {
                tagCreate(input: $input) { id name }
            }
        `;
        const data = await gql(mutation, { input: { name } });
        const tag = data?.tagCreate;
        if (!tag?.id) throw new Error("Failed to create tag");
        return String(tag.id);
    }

    async function ensureTagId(tagName) {
        const existing = await findTagIdByNameExact(tagName);
        if (existing) return existing;
        return await createTagByName(tagName);
    }

    function getOrCreateGroupIdForPair(sceneA, sceneB) {
        const store = loadStore();
        const a = normalizeId(sceneA);
        const b = normalizeId(sceneB);
        if (!a || !b) throw new Error("Invalid scene ids");

        const ga = store.sceneToGroup[a] ? String(store.sceneToGroup[a]) : null;
        const gb = store.sceneToGroup[b] ? String(store.sceneToGroup[b]) : null;

        // both already in same group
        if (ga && gb && ga === gb) {
            return { store, groupId: ga, changed: false };
        }

        const ensureGroup = (gid) => {
            if (!store.groups[gid]) {
                store.groups[gid] = { groupId: gid, sceneIds: [], createdAt: nowIso(), updatedAt: nowIso() };
            }
            if (!Array.isArray(store.groups[gid].sceneIds)) store.groups[gid].sceneIds = [];
            store.groups[gid].updatedAt = nowIso();
        };

        // no groups -> create
        if (!ga && !gb) {
            const gid = String(store.nextGroupId || 1);
            store.nextGroupId = Number(store.nextGroupId || 1) + 1;
            ensureGroup(gid);
            for (const sid of [a, b]) {
                store.sceneToGroup[sid] = gid;
                if (!store.groups[gid].sceneIds.includes(sid)) store.groups[gid].sceneIds.push(sid);
            }
            saveStore(store);
            return { store, groupId: gid, changed: true };
        }

        // one group -> add the other
        if (ga && !gb) {
            ensureGroup(ga);
            store.sceneToGroup[b] = ga;
            if (!store.groups[ga].sceneIds.includes(b)) store.groups[ga].sceneIds.push(b);
            saveStore(store);
            return { store, groupId: ga, changed: true };
        }
        if (!ga && gb) {
            ensureGroup(gb);
            store.sceneToGroup[a] = gb;
            if (!store.groups[gb].sceneIds.includes(a)) store.groups[gb].sceneIds.push(a);
            saveStore(store);
            return { store, groupId: gb, changed: true };
        }

        // merge different groups
        const keep = String(ga);
        const drop = String(gb);
        ensureGroup(keep);
        ensureGroup(drop);

        const dropIds = Array.isArray(store.groups[drop].sceneIds) ? store.groups[drop].sceneIds.slice() : [];
        for (const sid of dropIds) {
            store.sceneToGroup[sid] = keep;
            if (!store.groups[keep].sceneIds.includes(sid)) store.groups[keep].sceneIds.push(sid);
        }
        delete store.groups[drop];
        saveStore(store);
        return { store, groupId: keep, changed: true };
    }

    function setPairRecord(mapName, aId, bId, record) {
        const key = normalizePairKey(aId, bId);
        if (!key) throw new Error("Invalid scene ids");
        const store = loadStore();
        const ids = pairKeyToIds(key);
        const existing = store[mapName]?.[key];

        if (!store[mapName] || typeof store[mapName] !== "object") store[mapName] = {};
        store[mapName][key] = {
            key,
            a: ids?.a,
            b: ids?.b,
            createdAt: existing?.createdAt || nowIso(),
            updatedAt: nowIso(),
            ...record,
        };
        saveStore(store);
        return store[mapName][key];
    }

    function removePairRecord(mapName, aId, bId) {
        const key = normalizePairKey(aId, bId);
        if (!key) return;
        const store = loadStore();
        if (!store[mapName] || typeof store[mapName] !== "object") return;
        delete store[mapName][key];
        saveStore(store);
    }

    function isPairIgnored(aId, bId) {
        const key = normalizePairKey(aId, bId);
        if (!key) return false;
        const store = loadStore();
        return !!store.ignoredPairs?.[key];
    }

    function getPairConfirmed(aId, bId) {
        const key = normalizePairKey(aId, bId);
        if (!key) return null;
        const store = loadStore();
        return store.confirmedPairs?.[key] || null;
    }

    async function applyGroupTagToScenes(groupId) {
        const store = loadStore();
        const settings = store.settings || defaultStore().settings;
        if (!settings.applyGroupTag) return;

        const gid = String(groupId);
        const group = store.groups?.[gid];
        const sceneIds = Array.isArray(group?.sceneIds) ? group.sceneIds.slice() : [];
        if (!sceneIds.length) return;

        const groupTagName = `${String(settings.tagPrefix || "dupe:")}${gid}`;
        const groupTagId = await ensureTagId(groupTagName);

        let genericTagId = null;
        if (settings.alsoApplyGenericTag && settings.genericTagName) {
            genericTagId = await ensureTagId(String(settings.genericTagName));
        }

        for (const sceneId of sceneIds) {
            const tags = await fetchSceneTags(sceneId);
            const existingIds = new Set(tags.map((t) => String(t.id)));
            existingIds.add(String(groupTagId));
            if (genericTagId) existingIds.add(String(genericTagId));
            await updateSceneTags(sceneId, Array.from(existingIds));
        }
    }

    // --- UI: top panel + per-pair inline controls ---

    function findMainMount() {
        return document.querySelector("main") || document.querySelector(".container-fluid") || document.querySelector(".container") || document.body;
    }

    function renderTopPanel() {
        ensureStyles();
        const mount = findMainMount();
        if (!(mount instanceof Element)) return;

        let panel = mount.querySelector("[data-sdct-panel]");
        if (!panel) {
            panel = createEl("div", { className: "sdct-panel", attrs: { "data-sdct-panel": "1" } });
            panel.appendChild(createEl("h3", { text: "Duplicate checker tools" }));
            panel.appendChild(
                createEl("div", {
                    className: "sdct-help",
                    text: "Adds Confirm/Ignore buttons to each phash pair. Confirm can assign a stable duplicate-group tag (e.g. dupe:12) to both scenes.",
                })
            );
            const row = createEl("div", { className: "sdct-row" });
            row.appendChild(createEl("span", { className: "sdct-chip", attrs: { "data-sdct-count-confirmed": "1" }, text: "Confirmed: 0" }));
            row.appendChild(createEl("span", { className: "sdct-chip", attrs: { "data-sdct-count-ignored": "1" }, text: "Ignored: 0" }));

            const store = loadStore();
            const settings = store.settings || defaultStore().settings;

            const btnToggleTags = createEl("button", {
                className: "sdct-btn",
                attrs: { type: "button", "data-sdct-toggle-tags": "1" },
                text: settings.applyGroupTag ? "Tagging: ON" : "Tagging: OFF",
            });
            btnToggleTags.addEventListener("click", () => {
                const s = loadStore();
                s.settings.applyGroupTag = !s.settings.applyGroupTag;
                saveStore(s);
                btnToggleTags.textContent = s.settings.applyGroupTag ? "Tagging: ON" : "Tagging: OFF";
            });
            row.appendChild(btnToggleTags);

            const btnExport = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Export" });
            btnExport.addEventListener("click", async () => {
                try {
                    const s = loadStore();
                    await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
                    btnExport.textContent = "Copied";
                    setTimeout(() => (btnExport.textContent = "Export"), 1000);
                } catch {
                    // ignore
                }
            });
            row.appendChild(btnExport);

            const btnClearIgnored = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Clear ignored" });
            btnClearIgnored.addEventListener("click", () => {
                const s = loadStore();
                s.ignoredPairs = {};
                saveStore(s);
                refreshCounts(panel);
                scanAndInjectInlineControls();
            });
            row.appendChild(btnClearIgnored);

            panel.appendChild(row);

            try {
                mount.prepend(panel);
            } catch {
                mount.appendChild(panel);
            }
        }

        refreshCounts(panel);
    }

    function refreshCounts(panelEl) {
        const s = loadStore();
        const confirmedCount = Object.keys(s.confirmedPairs || {}).length;
        const ignoredCount = Object.keys(s.ignoredPairs || {}).length;
        const c = panelEl.querySelector("[data-sdct-count-confirmed]");
        const i = panelEl.querySelector("[data-sdct-count-ignored]");
        if (c) c.textContent = `Confirmed: ${confirmedCount}`;
        if (i) i.textContent = `Ignored: ${ignoredCount}`;
    }

    function findSceneIdsWithin(el) {
        if (!(el instanceof Element)) return [];
        const ids = new Set();
        const links = el.querySelectorAll("a[href*='/scenes/']");
        for (const a of links) {
            const href = a.getAttribute("href") || "";
            const m = href.match(/\/scenes\/([^/?#]+)/i);
            if (!m) continue;
            const id = normalizeId(m[1]);
            if (id) ids.add(id);
            if (ids.size > 3) break;
        }
        return Array.from(ids);
    }

    function findPairContainers() {
        // We don't know the exact markup, so we find elements that contain exactly 2 unique scene links.
        const candidates = Array.from(document.querySelectorAll("div, section, article, li"));
        const pairs = [];
        for (const el of candidates) {
            if (!(el instanceof Element)) continue;
            if (el.closest("[data-sdct-pair-container]")) continue;
            const ids = findSceneIdsWithin(el);
            if (ids.length !== 2) continue;
            // Prefer the smallest element that still contains the pair
            let tooBig = false;
            for (const child of Array.from(el.children || [])) {
                const childIds = findSceneIdsWithin(child);
                if (childIds.length === 2) {
                    tooBig = true;
                    break;
                }
            }
            if (tooBig) continue;
            pairs.push({ el, a: ids[0], b: ids[1] });
        }
        return pairs;
    }

    function markIgnored(el, a, b) {
        el.dataset.sdctIgnored = isPairIgnored(a, b) ? "true" : "false";
    }

    function injectControlsIntoPair(pairEl, a, b) {
        if (!(pairEl instanceof Element)) return;
        const key = normalizePairKey(a, b);
        if (!key) return;

        // mark container so we don't reinject
        pairEl.setAttribute("data-sdct-pair-container", key);
        markIgnored(pairEl, a, b);

        const existing = pairEl.querySelector("[data-sdct-inline]");
        if (existing) return;

        const inline = createEl("div", { className: "sdct-inline", attrs: { "data-sdct-inline": "1", "data-sdct-injected": "true" } });

        const confirmed = getPairConfirmed(a, b);
        const chip = createEl("span", { className: "sdct-chip", text: confirmed?.groupId ? `Group: ${confirmed.groupId}` : "Unconfirmed" });
        inline.appendChild(chip);

        const btnOpen = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Open both" });
        btnOpen.addEventListener("click", (e) => {
            e.preventDefault();
            try {
                window.open(sceneUrl(a), "_blank", "noopener,noreferrer");
                window.open(sceneUrl(b), "_blank", "noopener,noreferrer");
            } catch {
                // ignore
            }
        });
        inline.appendChild(btnOpen);

        const btnConfirm = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Confirm" });
        btnConfirm.addEventListener("click", async (e) => {
            e.preventDefault();
            btnConfirm.disabled = true;
            try {
                const { groupId } = getOrCreateGroupIdForPair(a, b);
                setPairRecord("confirmedPairs", a, b, { groupId });
                // If previously ignored, unignore.
                removePairRecord("ignoredPairs", a, b);
                await applyGroupTagToScenes(groupId);
                chip.textContent = `Group: ${groupId}`;
                markIgnored(pairEl, a, b);
                renderTopPanel();
            } catch (err) {
                console.error("[SceneDuplicateCheckerTools] confirm failed", err);
            } finally {
                btnConfirm.disabled = false;
            }
        });
        inline.appendChild(btnConfirm);

        const btnUnconfirm = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Unconfirm" });
        btnUnconfirm.addEventListener("click", (e) => {
            e.preventDefault();
            removePairRecord("confirmedPairs", a, b);
            chip.textContent = "Unconfirmed";
            renderTopPanel();
        });
        inline.appendChild(btnUnconfirm);

        const btnIgnore = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Ignore" });
        btnIgnore.addEventListener("click", (e) => {
            e.preventDefault();
            setPairRecord("ignoredPairs", a, b, {});
            markIgnored(pairEl, a, b);
            renderTopPanel();
        });
        inline.appendChild(btnIgnore);

        const btnUnignore = createEl("button", { className: "sdct-btn", attrs: { type: "button" }, text: "Unignore" });
        btnUnignore.addEventListener("click", (e) => {
            e.preventDefault();
            removePairRecord("ignoredPairs", a, b);
            markIgnored(pairEl, a, b);
            renderTopPanel();
        });
        inline.appendChild(btnUnignore);

        // Insert near end of the pair container.
        pairEl.appendChild(inline);
    }

    function scanAndInjectInlineControls() {
        renderTopPanel();
        const pairs = findPairContainers();
        for (const p of pairs) {
            injectControlsIntoPair(p.el, p.a, p.b);
        }
    }

    function startObserver() {
        ensureStyles();
        const obs = new MutationObserver(() => {
            scanAndInjectInlineControls();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener(STORE_CHANGED_EVENT, () => scanAndInjectInlineControls());
        scanAndInjectInlineControls();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    } else {
        startObserver();
    }
})();
