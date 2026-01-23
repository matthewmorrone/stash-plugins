(function () {
    "use strict";

    const INSTALL_FLAG = "__scene_performer_roles_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const STYLE_ID = "sppd-scene-performer-pair-data-style";
    const ROOT_ATTR = "data-sppd-root";

    const STORAGE_KEY = "__scene_performer_roles__";
    const UI_PREF_KEY = "__scene_performer_roles_ui__";
    const STORE_CHANGED_EVENT = "spr-store-changed";

    const ROLE_INITIATOR = "initiator";
    const ROLE_RECEIVER = "receiver";
    const ROLE_ORDER = [ROLE_INITIATOR, ROLE_RECEIVER];
    const ROLE_LABEL = {
        [ROLE_INITIATOR]: "Initiator",
        [ROLE_RECEIVER]: "Receiver",
    };
    const ROLE_ICON = {
        [ROLE_INITIATOR]: "↑",
        [ROLE_RECEIVER]: "↓",
    };

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            [${ROOT_ATTR}] {
                position: fixed;
                right: 12px;
                bottom: 12px;
                width: 320px;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                background: rgba(20, 20, 20, 0.96);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 12px;
                box-shadow: 0 12px 35px rgba(0, 0, 0, 0.45);
                z-index: 25000;
                overflow: hidden;
                font-size: 13px;
            }

            [${ROOT_ATTR}][data-collapsed="true"] {
                width: auto;
            }

            [${ROOT_ATTR}] .sppd-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(30, 30, 30, 0.92);
            }

            [${ROOT_ATTR}] .sppd-title {
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 190px;
            }

            [${ROOT_ATTR}] .sppd-actions {
                display: inline-flex;
                gap: 6px;
            }

            [${ROOT_ATTR}] .sppd-btn {
                appearance: none;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(255, 255, 255, 0.06);
                color: inherit;
                border-radius: 9px;
                padding: 4px 8px;
                font-size: 12px;
                line-height: 1.2;
                cursor: pointer;
            }

            [${ROOT_ATTR}] .sppd-btn:hover {
                background: rgba(255, 255, 255, 0.12);
            }

            [${ROOT_ATTR}] .sppd-body {
                padding: 10px;
                overflow: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            [${ROOT_ATTR}][data-collapsed="true"] .sppd-body {
                display: none;
            }

            [${ROOT_ATTR}] .sppd-row {
                display: grid;
                grid-template-columns: 1fr auto;
                align-items: center;
                gap: 10px;
                padding: 6px 6px;
                border-radius: 10px;
            }

            [${ROOT_ATTR}] .sppd-row:hover {
                background: rgba(255, 255, 255, 0.06);
            }

            [${ROOT_ATTR}] .sppd-name a {
                color: inherit;
                text-decoration: none;
            }

            [${ROOT_ATTR}] .sppd-name a:hover {
                text-decoration: underline;
            }

            [${ROOT_ATTR}] .sppd-select {
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(0, 0, 0, 0.25);
                color: inherit;
                padding: 4px 6px;
                font-size: 12px;
            }

            [${ROOT_ATTR}] .sppd-muted {
                opacity: 0.75;
                font-size: 12px;
            }

            [${ROOT_ATTR}] .sppd-import {
                display: none;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.10);
            }

            [${ROOT_ATTR}][data-import-open="true"] .sppd-import {
                display: block;
            }

            [${ROOT_ATTR}] .sppd-textarea {
                width: 100%;
                min-height: 120px;
                resize: vertical;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(0, 0, 0, 0.25);
                color: inherit;
                padding: 8px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
            }

            [${ROOT_ATTR}] .sppd-status {
                margin-top: 6px;
                font-size: 12px;
                min-height: 16px;
            }

            /* Scene performer card role badges */
            .spr-role-badges {
                position: absolute;
                top: 6px;
                right: 6px;
                display: inline-flex;
                gap: 4px;
                z-index: 5;
            }

            .spr-role-btn {
                appearance: none;
                border: 1px solid rgba(255, 255, 255, 0.20);
                background: rgba(0, 0, 0, 0.35);
                color: #fff;
                border-radius: 999px;
                width: 22px;
                height: 22px;
                padding: 0;
                font-size: 12px;
                font-weight: 700;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0.55;
                transition: opacity 120ms ease-in-out, background 120ms ease-in-out, border-color 120ms ease-in-out;
            }

            .spr-role-btn:hover,
            .spr-role-btn:focus {
                outline: none;
                opacity: 0.9;
                border-color: rgba(255, 255, 255, 0.35);
            }

            .spr-role-btn[data-active="true"] {
                opacity: 1;
                background: rgba(255, 255, 255, 0.18);
                border-color: rgba(255, 255, 255, 0.40);
            }

            /* Panel role toggles */
            [${ROOT_ATTR}] .spr-panel-role-btn {
                appearance: none;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(0, 0, 0, 0.20);
                color: inherit;
                border-radius: 999px;
                width: 24px;
                height: 24px;
                padding: 0;
                font-size: 12px;
                font-weight: 700;
                line-height: 1;
                cursor: pointer;
                opacity: 0.75;
            }

            [${ROOT_ATTR}] .spr-panel-role-btn[data-active="true"] {
                opacity: 1;
                background: rgba(255, 255, 255, 0.14);
                border-color: rgba(255, 255, 255, 0.35);
            }
        `;
        document.head.appendChild(style);
    }

    function safeJsonParse(text, fallback) {
        try {
            const v = JSON.parse(text);
            return v ?? fallback;
        } catch {
            return fallback;
        }
    }

    function normalizeRoleList(roles) {
        const list = Array.isArray(roles) ? roles : [];
        const out = [];
        for (const r of list) {
            const role = String(r || "").toLowerCase();
            if (!ROLE_ORDER.includes(role)) continue;
            if (out.includes(role)) continue;
            out.push(role);
        }
        return out;
    }

    function normalizeStore(raw) {
        if (!raw || typeof raw !== "object") return null;
        const scenes = raw.scenes;
        if (!scenes || typeof scenes !== "object") return { scenes: {} };
        // Ensure roles are arrays.
        const outScenes = {};
        for (const [sceneId, perScene] of Object.entries(scenes)) {
            if (!perScene || typeof perScene !== "object") continue;
            const outPerScene = {};
            for (const [performerId, entry] of Object.entries(perScene)) {
                if (!entry || typeof entry !== "object") continue;
                const roles = normalizeRoleList(entry.roles);
                if (roles.length === 0) continue;
                outPerScene[performerId] = { roles };
            }
            if (Object.keys(outPerScene).length === 0) continue;
            outScenes[sceneId] = outPerScene;
        }
        return { scenes: outScenes };
    }

    function loadStore() {
        return normalizeStore(safeJsonParse(localStorage.getItem(STORAGE_KEY), null)) || { scenes: {} };
    }

    function saveStore(store) {
        const normalized = normalizeStore(store) || { scenes: {} };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    function loadUiPrefs() {
        const raw = localStorage.getItem(UI_PREF_KEY);
        const data = safeJsonParse(raw, {});
        return (data && typeof data === "object") ? data : {};
    }

    function saveUiPrefs(prefs) {
        localStorage.setItem(UI_PREF_KEY, JSON.stringify(prefs));
    }

    function getRolesForPair(store, sceneId, performerId) {
        const perScene = store?.scenes?.[sceneId];
        if (!perScene || typeof perScene !== "object") return new Set();
        const entry = perScene?.[performerId];
        if (!entry || typeof entry !== "object") return new Set();
        return new Set(normalizeRoleList(entry.roles));
    }

    function setRolesForPair(store, sceneId, performerId, roleSet) {
        const roles = normalizeRoleList(Array.from(roleSet || []));
        if (!store.scenes || typeof store.scenes !== "object") store.scenes = {};

        if (!store.scenes[sceneId] || typeof store.scenes[sceneId] !== "object") store.scenes[sceneId] = {};

        if (roles.length > 0) {
            store.scenes[sceneId][performerId] = { roles };
        } else {
            delete store.scenes[sceneId][performerId];
            if (Object.keys(store.scenes[sceneId]).length === 0) delete store.scenes[sceneId];
        }
    }

    function toggleRole(sceneId, performerId, role) {
        const r = String(role || "").toLowerCase();
        if (!ROLE_ORDER.includes(r)) return;

        const store = loadStore();
        const roles = getRolesForPair(store, sceneId, performerId);
        if (roles.has(r)) roles.delete(r);
        else roles.add(r);
        setRolesForPair(store, sceneId, performerId, roles);
        saveStore(store);
        window.dispatchEvent(new Event(STORE_CHANGED_EVENT));
    }

    function getSceneIdFromLocation() {
        const path = String(location.pathname || "");
        const match = path.match(/\/scenes\/([^/]+)(?:\/|$)/i);
        return match ? (match[1] || null) : null;
    }

    async function graphql(query, variables) {
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

    async function fetchScenePerformers(sceneId) {
        const query = `
            query FindScene($id: ID!) {
                findScene(id: $id) {
                    id
                    performers {
                        id
                        name
                    }
                }
            }
        `;
        const data = await graphql(query, { id: sceneId });
        const performers = data?.findScene?.performers || [];
        return Array.isArray(performers) ? performers : [];
    }

    function createRoot() {
        ensureStyles();

        let root = document.querySelector(`[${ROOT_ATTR}]`);
        if (root) return root;

        root = document.createElement("div");
        root.setAttribute(ROOT_ATTR, "true");
        root.dataset.collapsed = "false";
        root.dataset.importOpen = "false";

        const header = document.createElement("div");
        header.className = "sppd-header";

        const title = document.createElement("div");
        title.className = "sppd-title";
        title.textContent = "Roles";

        const actions = document.createElement("div");
        actions.className = "sppd-actions";

        const btnCollapse = document.createElement("button");
        btnCollapse.type = "button";
        btnCollapse.className = "sppd-btn";
        btnCollapse.textContent = "–";
        btnCollapse.title = "Collapse";

        const btnExport = document.createElement("button");
        btnExport.type = "button";
        btnExport.className = "sppd-btn";
        btnExport.textContent = "Export";
        btnExport.title = "Copy all role data JSON";

        const btnImport = document.createElement("button");
        btnImport.type = "button";
        btnImport.className = "sppd-btn";
        btnImport.textContent = "Import";
        btnImport.title = "Paste JSON to import";

        actions.appendChild(btnImport);
        actions.appendChild(btnExport);
        actions.appendChild(btnCollapse);

        header.appendChild(title);
        header.appendChild(actions);

        const body = document.createElement("div");
        body.className = "sppd-body";

        const list = document.createElement("div");
        list.className = "sppd-list";

        const status = document.createElement("div");
        status.className = "sppd-status sppd-muted";

        const importBox = document.createElement("div");
        importBox.className = "sppd-import";

        const importText = document.createElement("textarea");
        importText.className = "sppd-textarea";
        importText.placeholder = "Paste exported JSON here…";

        const importActions = document.createElement("div");
        importActions.style.display = "flex";
        importActions.style.gap = "6px";
        importActions.style.marginTop = "8px";

        const btnImportMerge = document.createElement("button");
        btnImportMerge.type = "button";
        btnImportMerge.className = "sppd-btn";
        btnImportMerge.textContent = "Merge";

        const btnImportReplace = document.createElement("button");
        btnImportReplace.type = "button";
        btnImportReplace.className = "sppd-btn";
        btnImportReplace.textContent = "Replace";

        const btnImportClose = document.createElement("button");
        btnImportClose.type = "button";
        btnImportClose.className = "sppd-btn";
        btnImportClose.textContent = "Close";

        importActions.appendChild(btnImportMerge);
        importActions.appendChild(btnImportReplace);
        importActions.appendChild(btnImportClose);

        importBox.appendChild(importText);
        importBox.appendChild(importActions);

        body.appendChild(list);
        body.appendChild(status);
        body.appendChild(importBox);

        root.appendChild(header);
        root.appendChild(body);
        document.body.appendChild(root);

        function setStatus(text) {
            status.textContent = text || "";
        }

        const prefs = loadUiPrefs();
        const collapsedByDefault = prefs?.collapsed !== false;
        if (collapsedByDefault) {
            root.dataset.collapsed = "true";
            btnCollapse.textContent = "+";
            btnCollapse.title = "Expand";
        }

        btnCollapse.addEventListener("click", () => {
            const next = root.dataset.collapsed !== "true";
            root.dataset.collapsed = next ? "true" : "false";
            btnCollapse.textContent = next ? "+" : "–";
            btnCollapse.title = next ? "Expand" : "Collapse";
            saveUiPrefs({ ...loadUiPrefs(), collapsed: next });
        });

        btnExport.addEventListener("click", async () => {
            try {
                const store = loadStore();
                const text = JSON.stringify(store, null, 2);
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    setStatus("Copied JSON to clipboard.");
                } else {
                    prompt("Copy JSON:", text);
                    setStatus("Export opened.");
                }
            } catch (e) {
                setStatus(`Export failed: ${e?.message || e}`);
            }
        });

        btnImport.addEventListener("click", () => {
            root.dataset.importOpen = root.dataset.importOpen === "true" ? "false" : "true";
            if (root.dataset.importOpen === "true") {
                importText.focus();
                setStatus("Paste JSON then Merge/Replace.");
            }
        });

        btnImportClose.addEventListener("click", () => {
            root.dataset.importOpen = "false";
        });

        function mergeStores(base, incoming) {
            const baseNorm = normalizeStore(base) || { scenes: {} };
            const inNorm = normalizeStore(incoming);
            if (!inNorm) return baseNorm;

            const out = { scenes: { ...baseNorm.scenes } };
            for (const [sceneId, perScene] of Object.entries(inNorm.scenes || {})) {
                if (!out.scenes[sceneId] || typeof out.scenes[sceneId] !== "object") out.scenes[sceneId] = {};
                for (const [performerId, entry] of Object.entries(perScene || {})) {
                    const roles = normalizeRoleList(entry?.roles);
                    if (roles.length === 0) continue;
                    out.scenes[sceneId][performerId] = { roles };
                }
                if (Object.keys(out.scenes[sceneId]).length === 0) delete out.scenes[sceneId];
            }
            return out;
        }

        function importJson({ replace }) {
            try {
                const incoming = safeJsonParse(importText.value, null);
                if (!incoming || typeof incoming !== "object") {
                    setStatus("Invalid JSON.");
                    return false;
                }
                const normalized = normalizeStore(incoming);
                if (replace) {
                    if (!normalized) {
                        setStatus("Invalid store shape.");
                        return false;
                    }
                    saveStore(normalized);
                    setStatus("Replaced store.");
                } else {
                    const next = mergeStores(loadStore(), incoming);
                    saveStore(next);
                    setStatus("Merged into store.");
                }
                window.dispatchEvent(new Event(STORE_CHANGED_EVENT));
                return true;
            } catch (e) {
                setStatus(`Import failed: ${e?.message || e}`);
                return false;
            }
        }

        btnImportMerge.addEventListener("click", () => importJson({ replace: false }));
        btnImportReplace.addEventListener("click", () => importJson({ replace: true }));

        root.__sppd = { listEl: list, setStatus, titleEl: title };
        return root;
    }

    function renderScene(sceneId, performers) {
        const root = createRoot();
        const { listEl, setStatus, titleEl } = root.__sppd;

        titleEl.textContent = `Roles (Scene ${sceneId})`;
        listEl.innerHTML = "";

        if (!performers?.length) {
            const empty = document.createElement("div");
            empty.className = "sppd-muted";
            empty.textContent = "No performers found for this scene.";
            listEl.appendChild(empty);
            return;
        }

        const store = loadStore();

        for (const p of performers) {
            const row = document.createElement("div");
            row.className = "sppd-row";

            const name = document.createElement("div");
            name.className = "sppd-name";
            const a = document.createElement("a");
            a.href = `/performers/${p.id}`;
            a.textContent = p.name || p.id;
            name.appendChild(a);

            const roles = getRolesForPair(store, sceneId, p.id);

            const roleBtns = document.createElement("div");
            roleBtns.style.display = "inline-flex";
            roleBtns.style.gap = "6px";

            for (const role of ROLE_ORDER) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "spr-panel-role-btn";
                btn.textContent = ROLE_ICON[role];
                btn.title = ROLE_LABEL[role];
                btn.dataset.role = role;
                btn.dataset.active = roles.has(role) ? "true" : "false";
                btn.setAttribute("aria-pressed", roles.has(role) ? "true" : "false");
                btn.addEventListener("click", () => {
                    toggleRole(sceneId, p.id, role);
                    setStatus(`Toggled ${ROLE_LABEL[role]} for ${p.name || p.id}.`);
                });
                roleBtns.appendChild(btn);
            }

            row.appendChild(name);
            row.appendChild(roleBtns);
            listEl.appendChild(row);
        }
    }

    function parsePerformerIdFromHref(href) {
        const s = String(href || "");
        const match = s.match(/\/performers\/([^/?#]+)(?:[/?#]|$)/i);
        return match ? (match[1] || null) : null;
    }

    function findCandidateCardRoot(fromEl) {
        if (!(fromEl instanceof Element)) return null;
        return (
            fromEl.closest(
                [
                    ".performer-card",
                    ".entity-card",
                    ".grid-card",
                    ".card",
                    "[class*='Card']",
                    "[class*='card']",
                ].join(",")
            ) || fromEl
        );
    }

    function ensureRelativePosition(el) {
        if (!(el instanceof Element)) return;
        const style = window.getComputedStyle(el);
        if (!style) return;
        if (style.position === "static") el.style.position = "relative";
    }

    function updateBadgeState(badgesEl, sceneId, performerId) {
        if (!(badgesEl instanceof Element)) return;
        const store = loadStore();
        const roles = getRolesForPair(store, sceneId, performerId);
        badgesEl.querySelectorAll("button[data-role]").forEach((btn) => {
            const role = String(btn.dataset.role || "");
            const active = roles.has(role);
            btn.dataset.active = active ? "true" : "false";
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function decorateCardForPerformer(sceneId, performer) {
        const performerId = performer?.id;
        if (!performerId) return;

        const anchors = Array.from(
            document.querySelectorAll([
                `a[href="/performers/${performerId}"]`,
                `a[href^="/performers/${performerId}?"]`,
                `a[href^="/performers/${performerId}/"]`,
            ].join(","))
        );

        for (const a of anchors) {
            const card = findCandidateCardRoot(a);
            if (!card) continue;

            // Avoid decorating non-card links elsewhere on the page.
            // Heuristic: require the anchor href to parse back to the same performer id.
            const parsed = parsePerformerIdFromHref(a.getAttribute("href"));
            if (parsed !== performerId) continue;

            ensureRelativePosition(card);

            let badges = card.querySelector(`.spr-role-badges[data-performer-id="${performerId}"]`);
            if (!badges) {
                badges = document.createElement("div");
                badges.className = "spr-role-badges";
                badges.dataset.performerId = performerId;

                for (const role of ROLE_ORDER) {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "spr-role-btn";
                    btn.textContent = ROLE_ICON[role];
                    btn.dataset.role = role;
                    btn.title = `${ROLE_LABEL[role]} (click to toggle)`;
                    btn.setAttribute("aria-label", `${ROLE_LABEL[role]} role`);
                    btn.setAttribute("aria-pressed", "false");

                    btn.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleRole(sceneId, performerId, role);
                        updateBadgeState(badges, sceneId, performerId);
                    });

                    btn.addEventListener(
                        "mousedown",
                        (e) => {
                            // Prevent drag/focus quirks triggering navigation in some card layouts.
                            e.stopPropagation();
                        },
                        true
                    );

                    badges.appendChild(btn);
                }

                card.appendChild(badges);
            }

            updateBadgeState(badges, sceneId, performerId);
        }
    }

    function decorateScenePerformerCards(sceneId, performers) {
        if (!sceneId || !Array.isArray(performers)) return;
        for (const p of performers) decorateCardForPerformer(sceneId, p);
    }

    let activeToken = 0;
    let currentSceneId = null;
    let currentPerformers = null;

    async function refreshIfOnScene() {
        const sceneId = getSceneIdFromLocation();
        if (!sceneId) {
            currentSceneId = null;
            currentPerformers = null;
            const root = document.querySelector(`[${ROOT_ATTR}]`);
            if (root) root.remove();
            return;
        }

        const token = ++activeToken;
        currentSceneId = sceneId;

        const root = createRoot();
        root.__sppd.setStatus("Loading performers…");

        try {
            const performers = await fetchScenePerformers(sceneId);
            if (token !== activeToken) return;
            currentPerformers = performers;
            renderScene(sceneId, performers);
            decorateScenePerformerCards(sceneId, performers);
            root.__sppd.setStatus("Ready.");
        } catch (e) {
            if (token !== activeToken) return;
            root.__sppd.setStatus(`Failed to load scene: ${e?.message || e}`);
        }
    }

    function emitLocationChange() {
        window.dispatchEvent(new Event("locationchange"));
    }

    function installLocationHooks() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function () {
            const ret = originalPushState.apply(this, arguments);
            emitLocationChange();
            return ret;
        };

        history.replaceState = function () {
            const ret = originalReplaceState.apply(this, arguments);
            emitLocationChange();
            return ret;
        };

        window.addEventListener("popstate", emitLocationChange);
        window.addEventListener("hashchange", emitLocationChange);
        window.addEventListener("locationchange", () => {
            setTimeout(refreshIfOnScene, 0);
        });
    }

    // React rerenders can drop our DOM; keep a lightweight observer.
    let observer = null;
    function installObserver() {
        if (observer) return;
        observer = new MutationObserver(() => {
            // If we're on a scene page but the panel is missing, re-add.
            const sceneId = getSceneIdFromLocation();
            if (!sceneId) return;
            if (sceneId !== currentSceneId) {
                refreshIfOnScene();
                return;
            }
            const root = document.querySelector(`[${ROOT_ATTR}]`);
            if (!root) refreshIfOnScene();

            // Also ensure performer card badges persist across React rerenders.
            if (currentPerformers && Array.isArray(currentPerformers)) {
                decorateScenePerformerCards(sceneId, currentPerformers);
            }
        });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    }

    installLocationHooks();
    installObserver();
    refreshIfOnScene();

    // Re-render if another tab/import updates storage.
    window.addEventListener("storage", (e) => {
        if (e?.key !== STORAGE_KEY) return;
        const sceneId = getSceneIdFromLocation();
        if (!sceneId) return;
        refreshIfOnScene();
    });

    window.addEventListener(STORE_CHANGED_EVENT, () => {
        const sceneId = getSceneIdFromLocation();
        if (!sceneId) return;
        // Avoid refetching unless needed.
        if (sceneId === currentSceneId && currentPerformers && Array.isArray(currentPerformers)) {
            renderScene(sceneId, currentPerformers);
            decorateScenePerformerCards(sceneId, currentPerformers);
            return;
        }
        refreshIfOnScene();
    });
})();
