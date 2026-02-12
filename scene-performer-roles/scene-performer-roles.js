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

    const ROLE_TOP = "top";
    const ROLE_BOTTOM = "bottom";
    const ROLE_BOTH = "both";
    const ROLE_ORDER = [ROLE_TOP, ROLE_BOTTOM];
    const ROLE_UI_ORDER = [ROLE_TOP, ROLE_BOTH, ROLE_BOTTOM];
    const ROLE_LABEL = {
        [ROLE_TOP]: "Top",
        [ROLE_BOTH]: "Both",
        [ROLE_BOTTOM]: "Bottom",
    };
    const ROLE_ICON = {
        [ROLE_TOP]: "↑",
        [ROLE_BOTH]: "⇅",
        [ROLE_BOTTOM]: "↓",
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

            [${ROOT_ATTR}] .sppd-statusbar {
                margin-top: 6px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
            }

            [${ROOT_ATTR}] .sppd-status-actions {
                display: inline-flex;
                gap: 6px;
                flex: 0 0 auto;
            }

            [${ROOT_ATTR}] .sppd-export {
                display: none;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.10);
            }

            [${ROOT_ATTR}][data-export-open="true"] .sppd-export {
                display: block;
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
                background: rgba(34, 197, 94, 0.28);
                border-color: rgba(34, 197, 94, 0.65);
            }

            [${ROOT_ATTR}] .spr-panel-role-btn[data-active="true"]:hover,
            [${ROOT_ATTR}] .spr-panel-role-btn[data-active="true"]:focus {
                border-color: rgba(34, 197, 94, 0.85);
                background: rgba(34, 197, 94, 0.36);
            }

            /* Inline role badges for performer links (outside the panel) */
            .spr-role-badges {
                display: inline-flex;
                gap: 4px;
                margin-left: 6px;
                vertical-align: middle;
            }

            .spr-role-btn {
                appearance: none;
                border: 1px solid rgba(255, 255, 255, 0.20);
                background: rgba(0, 0, 0, 0.25);
                color: #fff;
                border-radius: 999px;
                width: 20px;
                height: 20px;
                padding: 0;
                font-size: 11px;
                font-weight: 700;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0.75;
            }

            .spr-role-btn:hover,
            .spr-role-btn:focus {
                outline: none;
                opacity: 0.95;
                border-color: rgba(255, 255, 255, 0.35);
            }

            .spr-role-btn[data-active="true"] {
                opacity: 1;
                background: rgba(34, 197, 94, 0.28);
                border-color: rgba(34, 197, 94, 0.65);
            }

            .spr-role-btn[data-active="true"]:hover,
            .spr-role-btn[data-active="true"]:focus {
                border-color: rgba(34, 197, 94, 0.85);
                background: rgba(34, 197, 94, 0.36);
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

    function setRoleMode(sceneId, performerId, mode) {
        const m = String(mode || "").toLowerCase();
        if (![ROLE_TOP, ROLE_BOTTOM, ROLE_BOTH].includes(m)) return;

        const store = loadStore();
        const current = getRolesForPair(store, sceneId, performerId);

        const currentMode = current.has(ROLE_TOP) && current.has(ROLE_BOTTOM)
            ? ROLE_BOTH
            : (current.has(ROLE_TOP) ? ROLE_TOP : (current.has(ROLE_BOTTOM) ? ROLE_BOTTOM : null));

        // Clicking the active mode clears all roles.
        let nextSet;
        if (currentMode === m) nextSet = new Set();
        else if (m === ROLE_TOP) nextSet = new Set([ROLE_TOP]);
        else if (m === ROLE_BOTTOM) nextSet = new Set([ROLE_BOTTOM]);
        else nextSet = new Set([ROLE_TOP, ROLE_BOTTOM]);

        setRolesForPair(store, sceneId, performerId, nextSet);
        saveStore(store);
        window.dispatchEvent(new Event(STORE_CHANGED_EVENT));
    }

    function getSceneIdFromLocation() {
        const path = String(location.pathname || "");
        const match = path.match(/\/scenes\/([^/]+)(?:\/|$)/i);
        return match ? (match[1] || null) : null;
    }

    function parsePerformerIdFromHref(href) {
        const s = String(href || "");
        const match = s.match(/\/performers\/([^/?#]+)(?:[/?#]|$)/i);
        return match ? (match[1] || null) : null;
    }

    function updateInlineBadgeState(badgesEl, sceneId, performerId) {
        if (!(badgesEl instanceof Element)) return;
        const store = loadStore();
        const roles = getRolesForPair(store, sceneId, performerId);
        const currentMode = roles.has(ROLE_TOP) && roles.has(ROLE_BOTTOM)
            ? ROLE_BOTH
            : (roles.has(ROLE_TOP) ? ROLE_TOP : (roles.has(ROLE_BOTTOM) ? ROLE_BOTTOM : null));
        badgesEl.querySelectorAll("button[data-role]").forEach((btn) => {
            const role = String(btn.dataset.role || "");
            const active = currentMode === role;
            btn.dataset.active = active ? "true" : "false";
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function buildInlineBadges({ sceneId, performerId }) {
        const badges = document.createElement("span");
        badges.className = "spr-role-badges";
        badges.setAttribute("data-performer-id", String(performerId));

        for (const role of ROLE_UI_ORDER) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "spr-role-btn";
            btn.textContent = ROLE_ICON[role];
            btn.dataset.role = role;
            btn.title = ROLE_LABEL[role];
            btn.setAttribute("aria-label", `${ROLE_LABEL[role]} role`);
            btn.setAttribute("aria-pressed", "false");

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                setRoleMode(sceneId, performerId, role);
                updateInlineBadgeState(badges, sceneId, performerId);
            });

            badges.appendChild(btn);
        }

        updateInlineBadgeState(badges, sceneId, performerId);
        return badges;
    }

    function ensureInlineBadgesInContainer({ sceneId, performerId, containerEl }) {
        if (!sceneId || !performerId) return;
        if (!(containerEl instanceof Element)) return;
        if (containerEl.closest(`[${ROOT_ATTR}]`)) return;

        const existing = containerEl.querySelector(
            `.spr-role-badges[data-performer-id="${CSS?.escape ? CSS.escape(String(performerId)) : String(performerId)}"]`
        );
        if (existing) {
            updateInlineBadgeState(existing, sceneId, performerId);
            return;
        }

        containerEl.appendChild(buildInlineBadges({ sceneId, performerId }));
    }

    function ensureInlineBadgesAfterLink({ sceneId, performerId, linkEl }) {
        if (!sceneId || !performerId) return;
        if (!(linkEl instanceof Element)) return;
        if (linkEl.closest(`[${ROOT_ATTR}]`)) return;

        const existing = linkEl.nextElementSibling;
        if (
            existing &&
            existing.classList?.contains("spr-role-badges") &&
            existing.getAttribute("data-performer-id") === String(performerId)
        ) {
            updateInlineBadgeState(existing, sceneId, performerId);
            return;
        }

        linkEl.insertAdjacentElement("afterend", buildInlineBadges({ sceneId, performerId }));
    }

    function decoratePerformerLinks(sceneId, performers) {
        if (!sceneId || !Array.isArray(performers) || performers.length === 0) return;

        const performerIdSet = new Set(performers.map((p) => String(p?.id || "")).filter(Boolean));
        if (performerIdSet.size === 0) return;

        // 1) Performer cards: put badges in `.card-controls` (one set per card).
        const cardControls = Array.from(document.querySelectorAll(".card-controls"));
        for (const controlsEl of cardControls) {
            if (!(controlsEl instanceof Element)) continue;
            if (controlsEl.closest(`[${ROOT_ATTR}]`)) continue;

            const cardRoot =
                controlsEl.closest(".card") ||
                controlsEl.closest(".entity-card") ||
                controlsEl.closest(".performer-card") ||
                controlsEl.closest("[class*='card']") ||
                controlsEl.parentElement;

            if (!(cardRoot instanceof Element)) continue;

            const linkEl = cardRoot.querySelector('a[href^="/performers/"]');
            if (!(linkEl instanceof Element)) continue;

            const performerId = parsePerformerIdFromHref(linkEl.getAttribute("href"));
            if (!performerId || !performerIdSet.has(String(performerId))) continue;

            ensureInlineBadgesInContainer({ sceneId, performerId, containerEl: controlsEl });
        }

        // 2) Performer tags/links elsewhere: add badges after the link.
        // Avoid links that are part of a card (prevents duplicates).
        const links = Array.from(document.querySelectorAll('a[href^="/performers/"]'));
        for (const linkEl of links) {
            if (!(linkEl instanceof Element)) continue;
            if (linkEl.closest(`[${ROOT_ATTR}]`)) continue;
            if (linkEl.closest(".card-controls")) continue;
            if (linkEl.closest(".card")?.querySelector?.(".card-controls")) continue;
            if (linkEl.closest(".entity-card")?.querySelector?.(".card-controls")) continue;
            if (linkEl.closest(".performer-card")?.querySelector?.(".card-controls")) continue;

            const performerId = parsePerformerIdFromHref(linkEl.getAttribute("href"));
            if (!performerId || !performerIdSet.has(String(performerId))) continue;
            ensureInlineBadgesAfterLink({ sceneId, performerId, linkEl });
        }
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
        root.dataset.exportOpen = "false";

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

        actions.appendChild(btnCollapse);

        header.appendChild(title);
        header.appendChild(actions);

        const body = document.createElement("div");
        body.className = "sppd-body";

        const list = document.createElement("div");
        list.className = "sppd-list";

        const statusBar = document.createElement("div");
        statusBar.className = "sppd-statusbar";

        const statusActions = document.createElement("div");
        statusActions.className = "sppd-status-actions";
        statusActions.appendChild(btnImport);
        statusActions.appendChild(btnExport);

        statusBar.appendChild(statusActions);

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

        const exportBox = document.createElement("div");
        exportBox.className = "sppd-export";

        const exportText = document.createElement("textarea");
        exportText.className = "sppd-textarea";
        exportText.readOnly = true;
        exportText.placeholder = "Export JSON will appear here…";

        const exportActions = document.createElement("div");
        exportActions.style.display = "flex";
        exportActions.style.gap = "6px";
        exportActions.style.marginTop = "8px";

        const btnExportCopy = document.createElement("button");
        btnExportCopy.type = "button";
        btnExportCopy.className = "sppd-btn";
        btnExportCopy.textContent = "Copy";

        const btnExportClose = document.createElement("button");
        btnExportClose.type = "button";
        btnExportClose.className = "sppd-btn";
        btnExportClose.textContent = "Close";

        exportActions.appendChild(btnExportCopy);
        exportActions.appendChild(btnExportClose);

        exportBox.appendChild(exportText);
        exportBox.appendChild(exportActions);

        body.appendChild(list);
        body.appendChild(statusBar);
        body.appendChild(importBox);
        body.appendChild(exportBox);

        root.appendChild(header);
        root.appendChild(body);
        document.body.appendChild(root);

        function setStatus(text) {
            void text;
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
                root.dataset.importOpen = "false";
                const next = root.dataset.exportOpen !== "true";
                root.dataset.exportOpen = next ? "true" : "false";
                if (!next) return;

                const store = loadStore();
                exportText.value = JSON.stringify(store, null, 2);
                exportText.focus();
                exportText.select();
                setStatus("Export ready. Copy from the box.");
            } catch (e) {
                setStatus(`Export failed: ${e?.message || e}`);
            }
        });

        btnImport.addEventListener("click", () => {
            root.dataset.exportOpen = "false";
            root.dataset.importOpen = root.dataset.importOpen === "true" ? "false" : "true";
            if (root.dataset.importOpen === "true") {
                importText.focus();
                setStatus("Paste JSON then Merge/Replace.");
            }
        });

        btnImportClose.addEventListener("click", () => {
            root.dataset.importOpen = "false";
        });

        btnExportCopy.addEventListener("click", async () => {
            try {
                const text = exportText.value || "";
                if (!text) {
                    setStatus("Nothing to copy.");
                    return;
                }
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    setStatus("Copied JSON to clipboard.");
                    return;
                }
                exportText.focus();
                exportText.select();
                setStatus("Selected export JSON. Press ⌘C to copy.");
            } catch (e) {
                exportText.focus();
                exportText.select();
                setStatus(`Copy failed. Press ⌘C to copy. (${e?.message || e})`);
            }
        });

        btnExportClose.addEventListener("click", () => {
            root.dataset.exportOpen = "false";
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

            for (const role of ROLE_UI_ORDER) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "spr-panel-role-btn";
                btn.textContent = ROLE_ICON[role];
                btn.title = ROLE_LABEL[role];
                btn.dataset.role = role;
                const currentMode = roles.has(ROLE_TOP) && roles.has(ROLE_BOTTOM)
                    ? ROLE_BOTH
                    : (roles.has(ROLE_TOP) ? ROLE_TOP : (roles.has(ROLE_BOTTOM) ? ROLE_BOTTOM : null));
                const isActive = currentMode === role;
                btn.dataset.active = isActive ? "true" : "false";
                btn.setAttribute("aria-pressed", isActive ? "true" : "false");
                btn.addEventListener("click", () => {
                    setRoleMode(sceneId, p.id, role);
                    setStatus(`Toggled ${ROLE_LABEL[role]} for ${p.name || p.id}.`);
                });
                roleBtns.appendChild(btn);
            }

            row.appendChild(name);
            row.appendChild(roleBtns);
            listEl.appendChild(row);
        }
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
            decoratePerformerLinks(sceneId, performers);
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

            if (sceneId === currentSceneId && currentPerformers && Array.isArray(currentPerformers)) {
                decoratePerformerLinks(sceneId, currentPerformers);
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
            return;
        }
        refreshIfOnScene();
    });
})();
