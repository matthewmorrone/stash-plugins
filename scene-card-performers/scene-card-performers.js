(function () {
    "use strict";

    const INSTALL_FLAG = "__scene_card_performers_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const PLUGIN_ROOT_ATTR = "data-scene-card-performers";
    const SCP_ROOT_ATTR = "data-scp-root";
    const SCP_PILL_ATTR = "data-scp-performer-pill";
    const SCP_STYLE_ID = "scp-scene-card-performers-style";

    const sceneCache = new Map(); // sceneId -> { performers: [{id,name}] }
    const sceneInFlight = new Map(); // sceneId -> Promise
    const sceneContainersById = new Map(); // sceneId -> Set<HTMLElement>

    const performerDetailsCache = new Map(); // performerId -> { id, name, image_path?, scene_count? }
    const performerDetailsInFlight = new Map(); // performerId -> Promise

    let scpPerformerPopoverEl = null;
    let scpPopoverAnchorEl = null;
    let scpPopoverShowTimer = 0;
    let scpPopoverHideTimer = 0;
    let scpPopoverToken = 0;

    // Track a single "active" search panel so Escape/outside-click can reliably close it.
    let scpActivePanel = null;

    function setActivePanel(panelEl) {
        if (!(panelEl instanceof Element)) return;
        scpActivePanel = panelEl;
    }

    function closeActivePanel({ blur = true } = {}) {
        const panel = scpActivePanel;
        if (!(panel instanceof Element)) return;
        if (panel.dataset.open !== "true") {
            scpActivePanel = null;
            return;
        }

        panel.__scpClosePanel?.();

        if (blur) {
            panel.__scpInputEl?.blur?.();
        }

        // If it stayed open for any reason, keep it as active.
        if (panel.dataset.open !== "true") scpActivePanel = null;
    }

    // Global escape/outside-click to close the active panel.
    document.addEventListener(
        "keydown",
        (e) => {
            if (!scpActivePanel || scpActivePanel.dataset.open !== "true") return;
            const key = String(e?.key || "");
            if (key !== "Escape" && key !== "Esc") return;
            stopCardNavigation(e);
            closeActivePanel({ blur: true });
        },
        true
    );

    document.addEventListener(
        "mousedown",
        (e) => {
            const panel = scpActivePanel;
            if (!panel || panel.dataset.open !== "true") return;
            const t = e?.target;
            if (t instanceof Node && (panel.contains(t) || panel.__scpDropdownEl?.contains?.(t))) return;
            closeActivePanel({ blur: false });
        },
        true
    );

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function ensureStyles() {
        if (document.getElementById(SCP_STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = SCP_STYLE_ID;
        style.textContent = `
            /* Hide card popover controls on scene cards */
            .card-popovers.btn-group {
                display: none !important;
            }

            /* Align title/performer/tag blocks across cards (no scrolling) */
            :root {
                --scp-scene-card-title-lines: 2;
                --scp-scene-card-title-line-height: 1.2;
                --scp-scene-card-title-block-height: calc(
                    var(--scp-scene-card-title-lines) * 1em * var(--scp-scene-card-title-line-height)
                );
            }

            /* Clamp titles AND reserve the same vertical space so footer content lines up */
            .scp-card .card-title,
            .scp-card [class*="card-title"],
            .scp-card [class*="SceneCard"] [class*="title"],
            .scp-card [class*="scene-card"] [class*="title"] {
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: var(--scp-scene-card-title-lines);
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: calc(1em * var(--scp-scene-card-title-line-height));
                min-height: var(--scp-scene-card-title-block-height);
                max-height: var(--scp-scene-card-title-block-height);
            }

            /* Layout */
            [${SCP_ROOT_ATTR}] .scp-row {
                gap: 9px;
                margin: 5px;
                padding: 3px;
                flex-wrap: nowrap !important;
                overflow-x: auto;
                overflow-y: hidden;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* old Edge/IE */
            }

            /* Keep row children from shrinking/wrapping; allow horizontal scroll instead */
            [${SCP_ROOT_ATTR}] .scp-row > * {
                flex: 0 0 auto;
            }

            [${SCP_ROOT_ATTR}] .scp-row::-webkit-scrollbar {
                display: none; /* Chrome/Safari */
                width: 0;
                height: 0;
            }

            [${SCP_ROOT_ATTR}] .scp-hr {
                margin: 6px 6px;
                border: 0;
                border-top: 1px solid rgba(255, 255, 255, 0.12);
                opacity: 0.8;
            }

            [${SCP_ROOT_ATTR}] .scp-pill {
                display: inline-flex;
                align-items: center;
                position: relative;
                padding: 0.25rem 1.35rem;
                border-radius: 999px;
                line-height: 1.1;
            }

            [${SCP_ROOT_ATTR}] .scp-pill-name {
                white-space: nowrap;
            }

            [${SCP_ROOT_ATTR}] .scp-remove-btn {
                color: inherit;
                text-decoration: none;
                font-weight: bold;
                line-height: 1;
                position: absolute;
                right: 0.2rem;
                top: 0;
                bottom: 0;
                margin: auto 0;
                transform: none;
                width: 1.25rem;
                height: 1.25rem;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
            }

            [${SCP_ROOT_ATTR}] .scp-add-btn {
                padding: 0px 6px;
                line-height: 1.2;
            }

            [${SCP_ROOT_ATTR}] [data-scp-search-panel][data-open="false"] {
                display: none;
            }

            [${SCP_ROOT_ATTR}] [data-scp-search-panel][data-open="true"] {
                display: inline-flex;
            }

            [${SCP_ROOT_ATTR}] .scp-search-pill {
                padding-left: 0.8rem;
                padding-right: 0.8rem;
                position: relative;
            }

            [${SCP_ROOT_ATTR}] .scp-search-input {
                appearance: none;
                border: 0;
                outline: none;
                background: transparent;
                color: inherit;
                min-width: 6ch;
                width: 9ch;
                height: 1.1rem;
                padding: 0;
                margin: 0;
                font-size: 0.8rem;
                line-height: 1.1;
            }

            [${SCP_ROOT_ATTR}] .scp-search-pill:focus-within .scp-search-input {
                width: 16ch;
            }

            [${SCP_ROOT_ATTR}] .scp-search-input::placeholder {
                opacity: 0.75;
            }

            .scp-search-dropdown {
                position: fixed;
                left: 0;
                top: 0;
                min-width: 220px;
                max-width: 360px;
                max-height: 240px;
                overflow: auto;
                background: rgba(20, 20, 20, 0.98);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
                padding: 4px;
                z-index: 25000;
                display: none;
            }

            .scp-search-dropdown[data-open="true"] {
                display: block;
            }

            .scp-search-dropdown-item {
                width: 100%;
                text-align: left;
                background: transparent;
                border: 0;
                color: inherit;
                padding: 6px 8px;
                border-radius: 8px;
                font-size: 0.8rem;
                line-height: 1.1;
                cursor: pointer;
            }

            .scp-search-dropdown-item:hover,
            .scp-search-dropdown-item:focus {
                outline: none;
                background: rgba(255, 255, 255, 0.10);
            }

            /* Autocomplete status + create affordance */
            [${SCP_ROOT_ATTR}] .scp-search-status {
                margin-left: 6px;
                font-size: 0.7rem;
                line-height: 1;
                opacity: 0.75;
                white-space: nowrap;
                user-select: none;
            }

            .scp-search-dropdown-status {
                padding: 6px 8px;
                font-size: 0.75rem;
                line-height: 1.1;
                opacity: 0.75;
            }

            .scp-search-dropdown-sep {
                height: 1px;
                margin: 4px 6px;
                background: rgba(255, 255, 255, 0.10);
            }

            .scp-search-dropdown-item.scp-search-dropdown-item--create {
                font-weight: 600;
            }

            .scp-performer-popover a {
                color: inherit;
                text-decoration: none;
            }

            .scp-performer-popover a:hover {
                text-decoration: underline;
            }

            [${SCP_ROOT_ATTR}].scp-root {
                margin-top: 2px;
                pointer-events: auto;
            }

            [${SCP_ROOT_ATTR}] [data-scp-error] {
                font-size: 0.75rem;
                margin-top: 4px;
            }

            /* Scene Card Performers: only show + and × on hover/focus */
            /* + is scoped per-row (performers vs tags) */
            [${SCP_ROOT_ATTR}] [data-scp-row] [data-scp-add-btn] {
                opacity: 0;
                visibility: hidden;
                transition: opacity 120ms ease-in-out;
            }

            [${SCP_ROOT_ATTR}] [data-scp-row]:hover [data-scp-add-btn],
            [${SCP_ROOT_ATTR}] [data-scp-row]:focus-within [data-scp-add-btn] {
                opacity: 1;
                visibility: visible;
            }

            /* When hovering a pill (to reveal ×), keep + hidden so they don't sync. */
            [${SCP_ROOT_ATTR}] [data-scp-row] [${SCP_PILL_ATTR}]:hover ~ [data-scp-add-btn],
            [${SCP_ROOT_ATTR}] [data-scp-row] [${SCP_PILL_ATTR}]:focus-within ~ [data-scp-add-btn] {
                opacity: 0;
                visibility: hidden;
            }

            /* × reveals only when hovering/focusing that specific performer pill */
            [${SCP_ROOT_ATTR}] [data-scp-remove-btn] {
                opacity: 0;
                visibility: hidden;
                transition: opacity 120ms ease-in-out;
            }

            [${SCP_ROOT_ATTR}] [${SCP_PILL_ATTR}]:hover [data-scp-remove-btn],
            [${SCP_ROOT_ATTR}] [${SCP_PILL_ATTR}]:focus-within [data-scp-remove-btn] {
                opacity: 1;
                visibility: visible;
            }

            /* Performer popover */
            .scp-performer-popover {
                position: fixed;
                z-index: 9999;
                max-width: 320px;
                background: rgba(20, 20, 20, 0.95);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.12);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
                border-radius: 10px;
                padding: 8px 10px;
                display: none;
                pointer-events: auto;
            }

            .scp-performer-popover .scp-pop-inner {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .scp-performer-popover .scp-pop-img {
                width: 64px;
                height: 64px;
                border-radius: 8px;
                object-fit: cover;
                background: rgba(255, 255, 255, 0.08);
                flex: 0 0 auto;
            }

            .scp-performer-popover .scp-pop-title {
                font-weight: 600;
                line-height: 1.2;
                margin: 0;
                padding: 0;
                font-size: 0.95rem;
            }

            .scp-performer-popover .scp-pop-sub {
                opacity: 0.85;
                font-size: 0.8rem;
                line-height: 1.2;
                margin-top: 2px;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function ensurePerformerPopoverEl() {
        if (scpPerformerPopoverEl && scpPerformerPopoverEl.isConnected) return scpPerformerPopoverEl;
        const el = document.createElement("div");
        el.className = "scp-performer-popover";
        el.setAttribute("data-scp-performer-popover", "1");
        el.addEventListener("mousedown", stopCardNavigationNoPrevent);
        // Don't preventDefault here so links inside the popover can navigate.
        el.addEventListener("click", stopCardNavigationNoPrevent);
        el.addEventListener("mouseenter", () => {
            if (scpPopoverHideTimer) {
                clearTimeout(scpPopoverHideTimer);
                scpPopoverHideTimer = 0;
            }
        });
        el.addEventListener("mouseleave", () => {
            scheduleHidePerformerPopover();
        });
        (document.body || document.documentElement).appendChild(el);
        scpPerformerPopoverEl = el;
        return el;
    }

    function hidePerformerPopover() {
        const el = scpPerformerPopoverEl;
        if (!el) return;
        el.style.display = "none";
        el.innerHTML = "";
        scpPopoverAnchorEl = null;
    }

    function scheduleHidePerformerPopover() {
        if (scpPopoverShowTimer) {
            clearTimeout(scpPopoverShowTimer);
            scpPopoverShowTimer = 0;
        }
        if (scpPopoverHideTimer) clearTimeout(scpPopoverHideTimer);
        scpPopoverHideTimer = setTimeout(() => {
            scpPopoverHideTimer = 0;
            hidePerformerPopover();
        }, 120);
    }

    function scheduleShowPerformerPopover(anchorEl, performerId) {
        if (!(anchorEl instanceof Element)) return;
        if (!performerId) return;
        if (scpPopoverHideTimer) {
            clearTimeout(scpPopoverHideTimer);
            scpPopoverHideTimer = 0;
        }
        if (scpPopoverShowTimer) clearTimeout(scpPopoverShowTimer);
        scpPopoverShowTimer = setTimeout(() => {
            scpPopoverShowTimer = 0;
            showPerformerPopover(anchorEl, performerId);
        }, 140);
    }

    function resolveImageUrl(imagePath) {
        const p = String(imagePath || "").trim();
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        try {
            return new URL(p, window.location.origin).toString();
        } catch {
            return p;
        }
    }

    function positionPopover(anchorEl, popEl) {
        if (!(anchorEl instanceof Element)) return;
        if (!(popEl instanceof HTMLElement)) return;

        const rect = anchorEl.getBoundingClientRect();
        const pad = 8;

        // Temporarily show to measure.
        const prevDisplay = popEl.style.display;
        popEl.style.display = "block";
        popEl.style.left = "0px";
        popEl.style.top = "0px";

        const popRect = popEl.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;

        const maxLeft = window.innerWidth - popRect.width - pad;
        left = Math.max(pad, Math.min(left, maxLeft));

        const maxTop = window.innerHeight - popRect.height - pad;
        if (top > maxTop) {
            top = rect.top - popRect.height - 8;
        }
        top = Math.max(pad, Math.min(top, maxTop));

        popEl.style.left = `${Math.round(left)}px`;
        popEl.style.top = `${Math.round(top)}px`;
        popEl.style.display = prevDisplay || "block";
    }

    async function fetchPerformerDetails(performerId) {
        const id = String(performerId || "").trim();
        if (!id) return null;
        if (performerDetailsCache.has(id)) return performerDetailsCache.get(id);
        if (performerDetailsInFlight.has(id)) return performerDetailsInFlight.get(id);

        const p = (async () => {
            const fieldsSets = ["id name image_path scene_count", "id name image_path", "id name"];
            const roots = ["findPerformer", "performer"];

            for (const root of roots) {
                for (const fields of fieldsSets) {
                    const query = `
                        query SCPFindPerformer($id: ID!) {
                            ${root}(id: $id) {
                                ${fields}
                            }
                        }
                    `;
                    try {
                        const data = await gql(query, { id });
                        const performer = data?.[root];
                        if (performer?.id) {
                            const normalized = {
                                id: String(performer.id),
                                name: String(performer?.name || ""),
                                image_path: performer?.image_path || null,
                                scene_count:
                                    typeof performer?.scene_count === "number" ? performer.scene_count : performer?.scene_count ?? null,
                            };
                            performerDetailsCache.set(id, normalized);
                            return normalized;
                        }
                    } catch (err) {
                        const msg = String(err?.message || err);
                        const unknownField = /(Cannot query field|Unknown argument|Unknown field|Cannot query)/i.test(msg);
                        if (!unknownField) throw err;
                        // try next fallback
                    }
                }
            }

            const fallback = { id, name: "", image_path: null, scene_count: null };
            performerDetailsCache.set(id, fallback);
            return fallback;
        })();

        performerDetailsInFlight.set(id, p);
        try {
            return await p;
        } finally {
            performerDetailsInFlight.delete(id);
        }
    }

    async function showPerformerPopover(anchorEl, performerId) {
        const el = ensurePerformerPopoverEl();
        scpPopoverAnchorEl = anchorEl;
        const token = ++scpPopoverToken;

        el.innerHTML = `
            <div class="scp-pop-inner">
                <div style="width:64px;height:64px;border-radius:8px;background:rgba(255,255,255,0.08);"></div>
                <div>
                    <div class="scp-pop-title">Loading…</div>
                    <div class="scp-pop-sub"></div>
                </div>
            </div>
        `;
        el.style.display = "block";
        positionPopover(anchorEl, el);

        try {
            const details = await fetchPerformerDetails(performerId);
            if (token !== scpPopoverToken) return;
            // If the anchor got detached or we hid, don't resurrect.
            if (!scpPopoverAnchorEl || scpPopoverAnchorEl !== anchorEl) return;

            const name = String(details?.name || "").trim() || "(unnamed)";
            const imgUrl = resolveImageUrl(details?.image_path);
            const sceneCount = details?.scene_count;
            const sceneLine = typeof sceneCount === "number" || (typeof sceneCount === "string" && String(sceneCount).trim() !== "")
                ? `Scenes: ${sceneCount}`
                : "";

            const performerHref = `/performers/${encodeURIComponent(String(performerId))}`;

            el.innerHTML = `
                <div class="scp-pop-inner">
                    ${imgUrl ? `<img class="scp-pop-img" src="${imgUrl}" alt="" />` : `<div class="scp-pop-img"></div>`}
                    <div>
                        <div class="scp-pop-title"><a href="${performerHref}">${escapeHtml(name)}</a></div>
                        ${sceneLine ? `<div class="scp-pop-sub">${escapeHtml(sceneLine)}</div>` : ""}
                    </div>
                </div>
            `;
            positionPopover(anchorEl, el);
        } catch (err) {
            if (token !== scpPopoverToken) return;
            el.innerHTML = `
                <div class="scp-pop-inner">
                    <div class="scp-pop-img"></div>
                    <div>
                        <div class="scp-pop-title">Error</div>
                        <div class="scp-pop-sub">${escapeHtml(String(err?.message || err))}</div>
                    </div>
                </div>
            `;
            positionPopover(anchorEl, el);
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    async function gql(query, variables) {
        const response = await fetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });

        const json = await response.json();
        if (json.errors && json.errors.length) {
            const msg = json.errors.map((e) => e.message).filter(Boolean).join("; ");
            throw new Error(msg || "GraphQL error");
        }
        return json.data;
    }

    async function gqlWithOptions(query, variables, options) {
        const signal = options?.signal;
        const response = await fetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
            signal,
        });

        const json = await response.json();
        if (json.errors && json.errors.length) {
            const msg = json.errors.map((e) => e.message).filter(Boolean).join("; ");
            throw new Error(msg || "GraphQL error");
        }
        return json.data;
    }

    async function fetchScene(sceneId) {
        if (!sceneId) return null;
        if (sceneCache.has(sceneId)) return sceneCache.get(sceneId);
        if (sceneInFlight.has(sceneId)) return sceneInFlight.get(sceneId);

        const p = (async () => {
            const query = `
                query FindScene($id: ID!) {
                    findScene(id: $id) {
                        id
                        performers {
                            id
                            name
                        }
                        tags {
                            id
                            name
                        }
                    }
                }
            `;

            const data = await gql(query, { id: sceneId });
            const scene = data?.findScene;
            const normalized = {
                id: scene?.id ?? sceneId,
                performers: Array.isArray(scene?.performers) ? scene.performers : [],
                tags: Array.isArray(scene?.tags) ? scene.tags : [],
            };

            sceneCache.set(sceneId, normalized);
            return normalized;
        })();

        sceneInFlight.set(sceneId, p);
        try {
            return await p;
        } finally {
            sceneInFlight.delete(sceneId);
        }
    }

    async function searchPerformersByName(queryText, options) {
        const q = String(queryText || "").trim();
        if (!q) return [];

        const query = `
            query FindPerformers($performer_filter: PerformerFilterType, $filter: FindFilterType) {
                findPerformers(performer_filter: $performer_filter, filter: $filter) {
                    performers {
                        id
                        name
                    }
                }
            }
        `;

        const variables = {
            performer_filter: {
                name: { value: q, modifier: "INCLUDES" },
            },
            filter: {
                per_page: typeof options?.perPage === "number" ? options.perPage : 25,
                sort: "name",
                direction: "ASC",
            },
        };

        const data = options?.signal ? await gqlWithOptions(query, variables, { signal: options.signal }) : await gql(query, variables);
        const performers = data?.findPerformers?.performers;
        return Array.isArray(performers) ? performers : [];
    }

    async function searchPerformerExactByName(name, options) {
        const q = String(name || "").trim();
        if (!q) return null;

        const query = `
            query FindPerformersExact($performer_filter: PerformerFilterType, $filter: FindFilterType) {
                findPerformers(performer_filter: $performer_filter, filter: $filter) {
                    performers {
                        id
                        name
                    }
                }
            }
        `;

        // Prefer EQUALS so we can reliably prevent duplicate creates.
        const variablesEquals = {
            performer_filter: {
                name: { value: q, modifier: "EQUALS" },
            },
            filter: {
                per_page: 2,
                sort: "name",
                direction: "ASC",
            },
        };

        try {
            const data = options?.signal
                ? await gqlWithOptions(query, variablesEquals, { signal: options.signal })
                : await gql(query, variablesEquals);
            const performers = data?.findPerformers?.performers;
            const list = Array.isArray(performers) ? performers : [];
            const needle = q.trim().toLowerCase();
            const hit = list.find((p) => String(p?.name || "").trim().toLowerCase() === needle);
            return hit?.id ? { id: String(hit.id), name: String(hit?.name || "") } : null;
        } catch (err) {
            // Back-compat: if EQUALS modifier isn't supported, fall back to INCLUDES and filter client-side.
            const msg = String(err?.message || err);
            const looksLikeFilterUnsupported = /(unknown|not defined|cannot query|field|argument|input|enum)/i.test(msg);
            if (!looksLikeFilterUnsupported) throw err;
            const list = await searchPerformersByName(q, { perPage: 100, signal: options?.signal });
            const needle = q.trim().toLowerCase();
            const hit = list.find((p) => String(p?.name || "").trim().toLowerCase() === needle);
            return hit?.id ? { id: String(hit.id), name: String(hit?.name || "") } : null;
        }
    }

    async function searchTagsByName(queryText, options) {
        const q = String(queryText || "").trim();

        const query = `
            query FindTags($tag_filter: TagFilterType, $filter: FindFilterType) {
                findTags(tag_filter: $tag_filter, filter: $filter) {
                    tags {
                        id
                        name
                    }
                }
            }
        `;

        const variables = {
            tag_filter: q
                ? { name: { value: q, modifier: "INCLUDES" } }
                : null,
            filter: {
                per_page: typeof options?.perPage === "number" ? options.perPage : q ? 25 : 50,
                sort: "name",
                direction: "ASC",
            },
        };

        const data = options?.signal ? await gqlWithOptions(query, variables, { signal: options.signal }) : await gql(query, variables);
        const tags = data?.findTags?.tags;
        return Array.isArray(tags) ? tags : [];
    }

    async function searchTagExactByName(name, options) {
        const q = String(name || "").trim();
        if (!q) return null;

        const query = `
            query FindTagsExact($tag_filter: TagFilterType, $filter: FindFilterType) {
                findTags(tag_filter: $tag_filter, filter: $filter) {
                    tags {
                        id
                        name
                    }
                }
            }
        `;

        const variablesEquals = {
            tag_filter: { name: { value: q, modifier: "EQUALS" } },
            filter: {
                per_page: 2,
                sort: "name",
                direction: "ASC",
            },
        };

        try {
            const data = options?.signal
                ? await gqlWithOptions(query, variablesEquals, { signal: options.signal })
                : await gql(query, variablesEquals);
            const tags = data?.findTags?.tags;
            const list = Array.isArray(tags) ? tags : [];
            const needle = q.trim().toLowerCase();
            const hit = list.find((t) => String(t?.name || "").trim().toLowerCase() === needle);
            return hit?.id ? { id: String(hit.id), name: String(hit?.name || "") } : null;
        } catch (err) {
            const msg = String(err?.message || err);
            const looksLikeFilterUnsupported = /(unknown|not defined|cannot query|field|argument|input|enum)/i.test(msg);
            if (!looksLikeFilterUnsupported) throw err;
            const list = await searchTagsByName(q, { perPage: 100, signal: options?.signal });
            const needle = q.trim().toLowerCase();
            const hit = list.find((t) => String(t?.name || "").trim().toLowerCase() === needle);
            return hit?.id ? { id: String(hit.id), name: String(hit?.name || "") } : null;
        }
    }

    async function updateScenePerformers(sceneId, performerIds) {
        const mutation = `
            mutation SceneUpdate($input: SceneUpdateInput!) {
                sceneUpdate(input: $input) {
                    id
                    performers {
                        id
                        name
                    }
                }
            }
        `;

        const input = {
            id: sceneId,
            performer_ids: performerIds,
        };

        const data = await gql(mutation, { input });
        const updated = data?.sceneUpdate;

        const existing = sceneCache.get(sceneId);

        const normalized = {
            id: updated?.id ?? sceneId,
            performers: Array.isArray(updated?.performers) ? updated.performers : [],
            tags: Array.isArray(existing?.tags) ? existing.tags : [],
        };
        sceneCache.set(sceneId, normalized);
        rerenderScene(sceneId);
        return normalized;
    }

    async function updateSceneTags(sceneId, tagIds) {
        const mutation = `
            mutation SceneUpdate($input: SceneUpdateInput!) {
                sceneUpdate(input: $input) {
                    id
                    tags {
                        id
                        name
                    }
                }
            }
        `;

        const input = {
            id: sceneId,
            tag_ids: tagIds,
        };

        const data = await gql(mutation, { input });
        const updated = data?.sceneUpdate;

        const existing = sceneCache.get(sceneId);
        const normalized = {
            id: updated?.id ?? sceneId,
            performers: Array.isArray(existing?.performers) ? existing.performers : [],
            tags: Array.isArray(updated?.tags) ? updated.tags : [],
        };
        sceneCache.set(sceneId, normalized);
        rerenderScene(sceneId);
        return normalized;
    }

    async function createPerformerByName(name) {
        const performerName = String(name || "").trim();
        if (!performerName) throw new Error("Performer name is required");

        const mutation = `
            mutation PerformerCreate($input: PerformerCreateInput!) {
                performerCreate(input: $input) {
                    id
                    name
                }
            }
        `;

        // Stash supports gender on PerformerCreateInput in most versions.
        // Default newly created performers to male.
        const inputWithGender = { name: performerName, gender: "MALE" };

        try {
            const data = await gql(mutation, { input: inputWithGender });
            const performer = data?.performerCreate;
            if (!performer?.id) throw new Error("Failed to create performer");
            return performer;
        } catch (err) {
            // Back-compat fallback: if the server doesn't accept `gender` on create,
            // retry without it so the feature still works.
            const msg = String(err?.message || err);
            const looksLikeGenderUnsupported = /\bgender\b/i.test(msg) && /(unknown|not defined|cannot query|field|argument|input)/i.test(msg);

            if (!looksLikeGenderUnsupported) throw err;

            const data = await gql(mutation, { input: { name: performerName } });
            const performer = data?.performerCreate;
            if (!performer?.id) throw new Error("Failed to create performer");
            return performer;
        }
    }

    async function createTagByName(name) {
        const tagName = String(name || "").trim();
        if (!tagName) throw new Error("Tag name is required");

        const mutation = `
            mutation TagCreate($input: TagCreateInput!) {
                tagCreate(input: $input) {
                    id
                    name
                }
            }
        `;

        const data = await gql(mutation, { input: { name: tagName } });
        const tag = data?.tagCreate;
        if (!tag?.id) throw new Error("Failed to create tag");
        return tag;
    }

    function getSceneIdFromHref(href) {
        const h = String(href || "");
        // Accept /scenes/123, /scenes/123/, /scenes/123?x=y
        const match = h.match(/\/scenes\/(\d+)(?:[/?#]|$)/i);
        if (!match) return null;
        return match[1];
    }

    function getUniqueSceneIdsWithin(el) {
        const ids = new Set();
        if (!(el instanceof Element)) return ids;
        const links = el.querySelectorAll("a[href*='/scenes/']");
        for (const a of links) {
            const id = getSceneIdFromHref(a.getAttribute("href"));
            if (id) ids.add(id);
            if (ids.size > 1) return ids;
        }
        return ids;
    }

    function countSceneLinksWithin(el, sceneId, maxCount = 3) {
        if (!(el instanceof Element)) return 0;
        const wanted = String(sceneId || "");
        if (!wanted) return 0;

        let count = 0;
        const links = el.querySelectorAll("a[href*='/scenes/']");
        for (const a of links) {
            const id = getSceneIdFromHref(a.getAttribute("href"));
            if (id && String(id) === wanted) {
                count++;
                if (count >= maxCount) return count;
            }
        }
        return count;
    }

    function unregisterContainer(sceneId, container) {
        const id = String(sceneId || "");
        if (!id || !(container instanceof Element)) return;
        const set = sceneContainersById.get(id);
        if (!set) return;
        set.delete(container);
        if (!set.size) sceneContainersById.delete(id);
    }

    function getPreferredMountParent(cardEl) {
        if (!(cardEl instanceof Element)) return cardEl;
        return ( cardEl.querySelector(".card-footer") || cardEl.querySelector(".card-body") || cardEl.querySelector("[class*='CardBody']") || cardEl );
    }

    function findVisualCardElement(containerEl, sceneId) {
        if (!(containerEl instanceof Element)) return null;
        const wanted = String(sceneId || "");
        if (!wanted) return null;

        const cardLikeSel = ".scene-card, [class*='scene-card'], [class*='SceneCard'], .card";

        // If the container itself is a card-like element and matches the scene, use it.
        if (containerEl.matches(cardLikeSel)) {
            const ids = getUniqueSceneIdsWithin(containerEl);
            if (ids.size === 1 && ids.has(wanted)) return containerEl;
        }

        // Otherwise pick the smallest/closest card-like descendant that still contains only this scene.
        const candidates = Array.from(containerEl.querySelectorAll(cardLikeSel));
        let best = null;
        let bestDepth = -1;
        for (const el of candidates) {
            const ids = getUniqueSceneIdsWithin(el);
            if (!(ids.size === 1 && ids.has(wanted))) continue;

            // Prefer deeper (more specific) elements.
            let depth = 0;
            let n = el;
            while (n && n !== containerEl && depth < 30) {
                depth++;
                n = n.parentElement;
            }
            if (depth > bestDepth) {
                bestDepth = depth;
                best = el;
            }
        }

        return best || containerEl;
    }

    function findOutermostSingleSceneContainer(startEl, sceneId) {
        if (!(startEl instanceof Element)) return null;
        const wanted = String(sceneId || "");
        if (!wanted) return null;

        let node = startEl;
        let best = null;
        let bestLinkCount = -1;
        let depth = 0;
        while (node && depth++ < 24) {
            if (node.tagName === "BODY") break;
            const ids = getUniqueSceneIdsWithin(node);
            if (ids.size === 1 && ids.has(wanted)) {
                // Prefer containers that include multiple links to the same scene
                // (typically thumbnail + title), which avoids choosing small sub-wrappers.
                const linkCount = countSceneLinksWithin(node, wanted);
                if (linkCount > bestLinkCount) {
                    best = node;
                    bestLinkCount = linkCount;
                } else if (linkCount === bestLinkCount) {
                    // If tied, prefer the outermost one.
                    best = node;
                }
            }
            node = node.parentElement;
        }
        return best;
    }

    function canonicalizeCardRoot(cardEl, sceneId) {
        if (!(cardEl instanceof Element)) return null;
        const wanted = sceneId ? String(sceneId) : null;
        const cardLikeSel = ".scene-card, [class*='scene-card'], [class*='SceneCard'], .card";

        // Pick the outermost "card-like" ancestor that still contains exactly one scene id
        // (the wanted one). This makes the choice stable even when there are multiple
        // scene links inside the same card (image + title).
        let best = null;
        let node = cardEl;
        let depth = 0;
        while (node && depth++ < 20) {
            if (node.tagName === "BODY") break;
            if (node.matches?.(cardLikeSel)) {
                const ids = getUniqueSceneIdsWithin(node);
                if (ids.size === 1 && (!wanted || ids.has(wanted))) {
                    best = node;
                }
            }
            node = node.parentElement;
        }

        return best || cardEl;
    }

    function findSceneIdInCard(cardEl) {
        if (!(cardEl instanceof Element)) return null;
        const links = cardEl.querySelectorAll("a[href]");
        for (const a of links) {
            const id = getSceneIdFromHref(a.getAttribute("href"));
            if (id) return id;
        }
        return null;
    }

    function findCardRootFromSceneLink(a, sceneId) {
        if (!(a instanceof Element)) return null;
        const best = findOutermostSingleSceneContainer(a, sceneId);
        return best || a.closest(".scene-card, [class*='scene-card'], [class*='SceneCard'], .card") || a.parentElement;
    }

    function findLikelySceneCards() {
        const out = new Set();

        // Collect anchors that look like scene links.
        const anchors = document.querySelectorAll("a[href*='/scenes/']");
        anchors.forEach((a) => {
            const id = getSceneIdFromHref(a.getAttribute("href"));
            if (!id) return;
            const root = findCardRootFromSceneLink(a, id);
            if (root) out.add(root);
        });

        return Array.from(out);
    }

    function ensureContainerRegistered(sceneId, container) {
        if (!sceneContainersById.has(sceneId)) sceneContainersById.set(sceneId, new Set());
        sceneContainersById.get(sceneId).add(container);
    }

    function stopCardNavigation(e) {
        if (!e) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    function stopCardNavigationNoPrevent(e) {
        if (!e) return;
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    function createEl(tag, props) {
        const el = document.createElement(tag);
        if (props) {
            if (props.className) el.className = props.className;
            if (props.text != null) el.textContent = String(props.text);
            if (props.html != null) el.innerHTML = String(props.html);
            if (props.attrs) {
                for (const [k, v] of Object.entries(props.attrs)) {
                    if (v == null) continue;
                    el.setAttribute(k, String(v));
                }
            }
        }
        return el;
    }

    const ENTITY_CONFIG = {
        performer: {
            placeholder: "Search performers…",
            addTitle: "Add performer",
            removeTitle: "Remove performer",
            listField: "performers",
            searchByName: searchPerformersByName,
            createByName: createPerformerByName,
            updateScene: updateScenePerformers,
        },
        tag: {
            placeholder: "Search tags…",
            addTitle: "Add tag",
            removeTitle: "Remove tag",
            listField: "tags",
            searchByName: searchTagsByName,
            createByName: createTagByName,
            updateScene: updateSceneTags,
        },
    };

    function getEntityConfig(type) {
        const t = String(type || "").toLowerCase();
        const cfg = ENTITY_CONFIG[t];
        if (!cfg) throw new Error("Unknown entity type");
        return { type: t, cfg };
    }

    function getEntitiesFromScene(scene, type) {
        const { cfg } = getEntityConfig(type);
        const list = scene?.[cfg.listField];
        return Array.isArray(list) ? list : [];
    }

    async function removeEntityFromScene(sceneId, type, entityId) {
        const { cfg } = getEntityConfig(type);
        const current = await fetchScene(sceneId);
        const currentIds = getEntitiesFromScene(current, type).map((x) => String(x.id));
        const nextIds = currentIds.filter((id) => id !== String(entityId));
        await cfg.updateScene(sceneId, nextIds);
    }

    function createEntityPill({ sceneId, type, entity, onError }) {
        const { cfg } = getEntityConfig(type);

        const pill = createEl("span", {
            className: "scp-pill badge badge-secondary",
            attrs: { [SCP_PILL_ATTR]: "1" },
        });

        const name = createEl("span", { className: "scp-pill-name", text: entity?.name || "(unnamed)" });
        pill.appendChild(name);

        if (String(type) === "performer" && entity?.id) {
            const performerId = String(entity.id);
            pill.addEventListener("mouseenter", () => scheduleShowPerformerPopover(pill, performerId));
            pill.addEventListener("mouseleave", () => scheduleHidePerformerPopover());
            pill.addEventListener("focusin", () => scheduleShowPerformerPopover(pill, performerId));
            pill.addEventListener("focusout", () => scheduleHidePerformerPopover());
        }

        const removeBtn = createEl("button", {
            className: "scp-remove-btn btn btn-link p-0 m-0",
            text: "×",
            attrs: { type: "button", title: cfg.removeTitle, "data-scp-remove-btn": "1" },
        });

        removeBtn.addEventListener("click", async (e) => {
            stopCardNavigation(e);
            try {
                removeBtn.disabled = true;
                await removeEntityFromScene(sceneId, type, entity?.id);
            } catch (err) {
                console.error("[SceneCardPerformers] remove failed", err);
                onError?.(err);
            } finally {
                removeBtn.disabled = false;
            }
        });

        pill.appendChild(removeBtn);
        return pill;
    }

    function renderEntitySection({ container, sceneId, type, entities, wasOpen }) {
        const { cfg } = getEntityConfig(type);

        const row = createEl("div", {
            className: "scp-row d-flex align-items-center",
            attrs: { "data-scp-row": type },
        });

        const onError = (err) => showInlineError(container, String(err?.message || err));

        for (const entity of entities || []) {
            row.appendChild(createEntityPill({ sceneId, type, entity, onError }));
        }

        const panel = createSearchPanel(sceneId, type, {
            onClose: () => {
                addBtn.style.display = "";
            },
        });

        row.appendChild(panel);

        const addBtn = createEl("button", {
            className: "scp-add-btn btn btn-sm btn-outline-primary",
            text: "+",
            attrs: { type: "button", title: cfg.addTitle, "data-scp-add-btn": "1" },
        });
        row.appendChild(addBtn);

        if (wasOpen) {
            panel.dataset.open = "true";
            addBtn.style.display = "none";
            setActivePanel(panel);
        }

        addBtn.addEventListener("click", (e) => {
            stopCardNavigation(e);
            const open = panel.dataset.open === "true";
            if (open) return;

            panel.dataset.open = "true";
            addBtn.style.display = "none";
            setActivePanel(panel);

            const input = panel.querySelector("input");
            if (input) {
                input.value = "";
                setTimeout(() => input.focus(), 0);
            }
        });

        return { row, panel };
    }

    function renderInto(container, scene) {
        if (!(container instanceof Element)) return;

        const sceneId = scene?.id;
        const performers = Array.isArray(scene?.performers) ? scene.performers : [];
        const tags = Array.isArray(scene?.tags) ? scene.tags : [];

        // Preserve search panel open states.
        const wasPerformerOpen = container.querySelector("[data-scp-search-panel][data-scp-entity='performer']")?.dataset?.open === "true";
        const wasTagOpen = container.querySelector("[data-scp-search-panel][data-scp-entity='tag']")?.dataset?.open === "true";

        // Tear down any existing floating dropdown overlays before wiping the container.
        // (The dropdown is attached to <body>, so container.innerHTML='' would otherwise leak it.)
        try {
            const oldPanels = Array.from(container.querySelectorAll("[data-scp-search-panel]"));
            for (const p of oldPanels) {
                p.__scpDestroyPanel?.();
            }
        } catch {
            // ignore
        }

        container.innerHTML = "";

        const performersSection = renderEntitySection({
            container,
            sceneId,
            type: "performer",
            entities: performers,
            wasOpen: wasPerformerOpen,
        });

        const tagsSection = renderEntitySection({
            container,
            sceneId,
            type: "tag",
            entities: tags,
            wasOpen: wasTagOpen,
        });

        const hr1 = createEl("hr", { className: "scp-hr" });
        const hr2 = createEl("hr", { className: "scp-hr" });
        container.appendChild(hr1);
        container.appendChild(performersSection.row);
        container.appendChild(hr2);
        container.appendChild(tagsSection.row);
    }

    function showInlineError(container, message) {
        if (!(container instanceof Element)) return;
        let el = container.querySelector("[data-scp-error]");
        if (!el) {
            el = createEl("div", { attrs: { "data-scp-error": "1" } });
            el.className = "text-danger";
            container.appendChild(el);
        }
        el.textContent = message;
        setTimeout(() => {
            if (el && el.parentElement) el.remove();
        }, 6000);
    }

    function createSearchPanel(sceneId, entityType, options) {
        const { type, cfg } = getEntityConfig(entityType);

        const onClose = typeof options?.onClose === "function" ? options.onClose : null;

        const panel = createEl("span", {
            className: "scp-pill badge badge-secondary scp-search-pill",
            attrs: { "data-scp-search-panel": "1", "data-scp-entity": type },
        });
        panel.dataset.open = "false";

        const input = createEl("input", {
            className: "scp-search-input",
            attrs: { type: "text", placeholder: cfg.placeholder },
        });
        panel.appendChild(input);

        const statusEl = createEl("span", {
            className: "scp-search-status",
            attrs: { "aria-live": "polite", "aria-atomic": "true" },
        });
        panel.appendChild(statusEl);

        // Custom dropdown suggestions (rendered as a floating overlay so it can't be clipped)
        const dropdown = createEl("div", {
            className: "scp-search-dropdown",
            attrs: { "data-scp-search-dropdown": "1", role: "listbox" },
        });
        dropdown.dataset.open = "false";
        dropdown.addEventListener("mousedown", stopCardNavigationNoPrevent);
        dropdown.addEventListener("click", stopCardNavigationNoPrevent);
        // Attach as overlay.
        (document.body || document.documentElement).appendChild(dropdown);

        let lastQuery = "";
        let requestToken = 0;
        let lastMatches = [];
        let lastCandidates = []; // filtered results (not already on scene)
        let lastServerMatches = [];
        let searchDebounceTimer = 0;
        let currentSearchController = null;
        let isSearching = false;
        let suppressBlurSubmit = false;
        let activeIndex = -1;

        function setStatus(text) {
            statusEl.textContent = String(text || "");
        }

        function setSearching(v) {
            isSearching = !!v;
            if (isSearching) {
                setStatus("Searching…");
            } else {
                // Don't clear immediately; leave the most recent guidance in place.
            }
        }

        function normalizeName(s) {
            return String(s || "").trim().toLowerCase();
        }

        function filterListByQuery(list, q) {
            const needle = normalizeName(q);
            if (!needle) return Array.isArray(list) ? list.slice() : [];
            return (Array.isArray(list) ? list : []).filter((x) => normalizeName(x?.name).includes(needle));
        }

        function positionDropdown() {
            if (!dropdown || dropdown.dataset.open !== "true") return;
            const rect = input.getBoundingClientRect();
            const pad = 8;

            // Default: below input.
            let left = rect.left;
            let top = rect.bottom + 6;
            const width = Math.max(220, Math.min(360, rect.width));

            // Clamp horizontally.
            left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

            dropdown.style.width = `${Math.round(width)}px`;

            // Temporarily show to measure height for vertical clamping.
            const prev = dropdown.style.display;
            dropdown.style.display = "block";
            const h = dropdown.getBoundingClientRect().height;

            const maxTop = window.innerHeight - h - pad;
            if (top > maxTop) {
                top = rect.top - h - 6;
            }
            top = Math.max(pad, Math.min(top, maxTop));

            dropdown.style.left = `${Math.round(left)}px`;
            dropdown.style.top = `${Math.round(top)}px`;
            dropdown.style.display = prev || "block";
        }

        let dropdownPositionBound = false;
        function bindDropdownPositioning() {
            if (dropdownPositionBound) return;
            dropdownPositionBound = true;
            window.addEventListener("scroll", positionDropdown, true);
            window.addEventListener("resize", positionDropdown, true);
        }

        function unbindDropdownPositioning() {
            if (!dropdownPositionBound) return;
            dropdownPositionBound = false;
            window.removeEventListener("scroll", positionDropdown, true);
            window.removeEventListener("resize", positionDropdown, true);
        }

        function openDropdown() {
            dropdown.dataset.open = "true";
            bindDropdownPositioning();
            positionDropdown();
        }

        function closeDropdown() {
            dropdown.dataset.open = "false";
            dropdown.innerHTML = "";
            activeIndex = -1;
            unbindDropdownPositioning();
        }

        function closePanel() {
            panel.dataset.open = "false";
            closeDropdown();
            input.value = "";
            lastQuery = "";
            lastMatches = [];
            lastCandidates = [];
            lastServerMatches = [];
            setStatus("");

            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = 0;
            }
            if (currentSearchController) {
                try {
                    currentSearchController.abort();
                } catch {
                    // ignore
                }
                currentSearchController = null;
            }
            isSearching = false;

            if (scpActivePanel === panel) scpActivePanel = null;

            onClose?.();
        }

        function destroyPanel() {
            // Used when the panel is being removed from the DOM (e.g., rerender).
            // Close should NOT destroy the overlay, otherwise reopening the same panel instance can't show it again.
            try {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = 0;
                }
                if (currentSearchController) {
                    try {
                        currentSearchController.abort();
                    } catch {
                        // ignore
                    }
                    currentSearchController = null;
                }
                closeDropdown();
            } finally {
                if (scpActivePanel === panel) scpActivePanel = null;
                if (dropdown && dropdown.isConnected) dropdown.remove();
            }
        }

        // Let global handlers close/blur the currently open panel.
        panel.__scpClosePanel = closePanel;
        panel.__scpDestroyPanel = destroyPanel;
        panel.__scpInputEl = input;
        panel.__scpDropdownEl = dropdown;

        // Ensure we always track the current open panel.
        input.addEventListener("focus", () => {
            if (panel.dataset.open === "true") setActivePanel(panel);
            // For tags, prefill suggestions even when blank so the dropdown can show.
            if (panel.dataset.open === "true" && type === "tag") {
                refreshCandidatesNow("");
            }
        });

        // Some browsers/DOM structures don't reliably bubble focusout the way we'd like.
        // Make blur close the panel too (with the same submit-on-blur behavior).
        input.addEventListener("blur", async () => {
            if (panel.dataset.open !== "true") return;
            if (suppressBlurSubmit) return;
            await sleep(0);
            const active = document.activeElement;
            if (active && active instanceof Node && panel.contains(active)) return;
            try {
                await refreshCandidatesNow(input.value);
                await trySubmitFromQuery(input.value);
            } catch (err) {
                console.error("[SceneCardPerformers] blur submit failed", err);
                showInlineError(panel, String(err?.message || err));
            } finally {
                closePanel();
            }
        });

        async function addEntityById(id) {
            const current = await fetchScene(sceneId);
            const currentIds = getEntitiesFromScene(current, type).map((x) => String(x.id));
            const nextIds = Array.from(new Set([...currentIds, String(id)]));
            await cfg.updateScene(sceneId, nextIds);
        }

        async function createAndAddByName(name) {
            const q = String(name || "").trim();
            if (!q) return;
            setStatus("Creating…");
            try {
                const created = await cfg.createByName(q);
                await addEntityById(created.id);
            } catch (err) {
                const msg = String(err?.message || err);
                const looksLikeAlreadyExists = /(already exists|duplicate|unique constraint|constraint failed)/i.test(msg);
                if (!looksLikeAlreadyExists) throw err;

                // Race/limit-safe fallback: resolve exact match and link it.
                const exact = await findExactMatchRemote(q);
                if (exact?.id) {
                    await addEntityById(exact.id);
                    return;
                }
                throw err;
            }
        }

        function findExactMatchId(q) {
            const needle = String(q || "").trim().toLowerCase();
            if (!needle) return null;
            const match = (lastMatches || []).find((m) => String(m?.name || "").trim().toLowerCase() === needle);
            return match?.id ? String(match.id) : null;
        }

        async function findExactMatchRemote(q) {
            const query = String(q || "").trim();
            if (!query) return null;

            // Fast path: use current in-memory results.
            const needle = normalizeName(query);
            const fromLocal = (lastServerMatches || []).find((m) => normalizeName(m?.name) === needle);
            if (fromLocal?.id) return { id: String(fromLocal.id), name: String(fromLocal?.name || "") };

            // Remote exact lookup (critical for preventing "already exists" on create).
            if (type === "performer") return await searchPerformerExactByName(query);
            if (type === "tag") return await searchTagExactByName(query);
            return null;
        }

        async function trySubmitFromQuery(q, { allowSingleCandidate = true } = {}) {
            const query = String(q || "").trim();
            if (!query) return false;

            const exactId = findExactMatchId(query);
            if (exactId) {
                await addEntityById(exactId);
                return true;
            }

            // IMPORTANT: Only treat a single suggestion as unambiguous when we explicitly allow it
            // (e.g., blur-to-submit). For Enter, users often intend to create a new entity name.
            if (allowSingleCandidate && (lastCandidates || []).length === 1 && lastCandidates[0]?.id) {
                await addEntityById(String(lastCandidates[0].id));
                return true;
            }

            return false;
        }

        function updateDropdownOptions() {
            dropdown.innerHTML = "";

            if (panel.dataset.open !== "true") {
                closeDropdown();
                return;
            }

            const currentQ = String(input.value || "").trim();
            const items = Array.isArray(lastCandidates) ? lastCandidates.slice(0, 12) : [];

            const frag = document.createDocumentFragment();

            // Status header.
            const statusText = isSearching
                ? "Searching…"
                : !currentQ
                  ? (type === "tag" ? "Type to filter tags" : "Type to search")
                  : items.length
                    ? `${items.length} match${items.length === 1 ? "" : "es"}`
                    : "No matches";
            frag.appendChild(createEl("div", { className: "scp-search-dropdown-status", text: statusText }));

            // Guidance line.
            if (currentQ) {
                frag.appendChild(
                    createEl("div", {
                        className: "scp-search-dropdown-status",
                        text: "",
                    })
                );
            }

            if (!items.length && !currentQ) {
                dropdown.appendChild(frag);
                openDropdown();
                positionDropdown();
                return;
            }

            if (items.length) {
                frag.appendChild(createEl("div", { className: "scp-search-dropdown-sep" }));
            }
            items.forEach((m, idx) => {
                const id = m?.id != null ? String(m.id) : "";
                const name = String(m?.name || "");
                if (!id || !name) return;

                const btn = createEl("button", {
                    className: "scp-search-dropdown-item",
                    text: name,
                    attrs: {
                        type: "button",
                        role: "option",
                        "data-scp-option-id": id,
                        "data-scp-option-idx": String(idx),
                    },
                });

                // Select should submit immediately (no Enter required).
                btn.addEventListener("mousedown", (e) => {
                    stopCardNavigation(e);
                    // Keep focus on the input until we handle click.
                    suppressBlurSubmit = true;
                    e.preventDefault();
                });

                btn.addEventListener("click", async (e) => {
                    stopCardNavigation(e);
                    try {
                        const pickedId = btn.getAttribute("data-scp-option-id");
                        if (!pickedId) return;
                        await addEntityById(pickedId);
                    } catch (err) {
                        console.error("[SceneCardPerformers] submit failed", err);
                        showInlineError(panel.closest(`[${SCP_ROOT_ATTR}]`) || panel.parentElement || panel, String(err?.message || err));
                    } finally {
                        suppressBlurSubmit = false;
                        closePanel();
                        input.blur();
                    }
                });

                frag.appendChild(btn);
            });

            if (currentQ) {
                frag.appendChild(createEl("div", { className: "scp-search-dropdown-sep" }));
                const createBtn = createEl("button", {
                    className: "scp-search-dropdown-item scp-search-dropdown-item--create",
                    text: `Create “${currentQ}”`,
                    attrs: { type: "button", role: "option", "data-scp-create": "1" },
                });

                createBtn.addEventListener("mousedown", (e) => {
                    stopCardNavigation(e);
                    suppressBlurSubmit = true;
                    e.preventDefault();
                });

                createBtn.addEventListener("click", async (e) => {
                    stopCardNavigation(e);
                    try {
                        // Safe create: we will still check for exact match first in keydown Enter,
                        // but for click-to-create we do it here too.
                        const exact = await findExactMatchRemote(currentQ);
                        if (exact?.id) {
                            await addEntityById(exact.id);
                        } else {
                            await createAndAddByName(currentQ);
                        }
                    } catch (err) {
                        console.error("[SceneCardPerformers] create failed", err);
                        showInlineError(panel.closest(`[${SCP_ROOT_ATTR}]`) || panel.parentElement || panel, String(err?.message || err));
                    } finally {
                        suppressBlurSubmit = false;
                        closePanel();
                        input.blur();
                    }
                });
                frag.appendChild(createBtn);
            }

            dropdown.appendChild(frag);
            openDropdown();
            positionDropdown();
        }

        function cancelPendingSearch() {
            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = 0;
            }
        }

        async function refreshCandidatesNow(q) {
            cancelPendingSearch();
            const query = String(q || "").trim();
            if (!query && type !== "tag") {
                lastMatches = [];
                lastCandidates = [];
                updateDropdownOptions();
                return;
            }
            requestToken++;
            const token = requestToken;
            await runSearchNow(query, token);
        }

        async function runSearchNow(q, token) {
            try {
                if (currentSearchController) {
                    try {
                        currentSearchController.abort();
                    } catch {
                        // ignore
                    }
                }
                currentSearchController = new AbortController();
                setSearching(true);

                const matches = await cfg.searchByName(q, { signal: currentSearchController.signal });
                if (token !== requestToken) return;

                lastServerMatches = matches;
                // Make narrowing feel instant: always apply a client-side filter too.
                lastMatches = filterListByQuery(matches, q);
                // Filter out items already on the scene.
                const scene = await fetchScene(sceneId);
                const existing = new Set(getEntitiesFromScene(scene, type).map((x) => String(x.id)));
                const filtered = lastMatches.filter((p) => !existing.has(String(p.id)));
                lastCandidates = filtered;
                setSearching(false);

                if (String(q || "").trim()) {
                    if (lastCandidates.length) {
                        setStatus(`${lastCandidates.length} match${lastCandidates.length === 1 ? "" : "es"}`);
                    } else {
                        setStatus("No matches");
                    }
                }
                updateDropdownOptions();
            } catch (err) {
                if (token !== requestToken) return;
                if (err && (err.name === "AbortError" || String(err?.message || err).includes("aborted"))) {
                    return;
                }
                console.error("[SceneCardPerformers] search failed", err);
                showInlineError(panel.closest(`[${SCP_ROOT_ATTR}]`) || panel.parentElement || panel, String(err?.message || err));
                lastCandidates = [];
                setSearching(false);
                updateDropdownOptions();
            }
        }

        function scheduleSearch(q) {
            cancelPendingSearch();
            requestToken++;
            const token = requestToken;

            const query = String(q || "").trim();
            if (!query && type !== "tag") {
                lastMatches = [];
                lastCandidates = [];
                lastServerMatches = [];
                setStatus("");
                closeDropdown();
                return;
            }

            // Immediate local narrowing based on last server results (feels responsive).
            if (query) {
                lastMatches = filterListByQuery(lastServerMatches, query);
                // Candidates will be filtered against scene on next server response; for now keep stale existing-filtering.
                lastCandidates = filterListByQuery(lastCandidates, query);
                updateDropdownOptions();
            }

            setSearching(true);
            searchDebounceTimer = setTimeout(() => {
                searchDebounceTimer = 0;
                runSearchNow(query, token);
            }, 220);
        }

        input.addEventListener("input", (e) => {
            stopCardNavigation(e);
            const q = String(input.value || "").trim();
            if (q === lastQuery) return;
            lastQuery = q;

            if (!q && type === "tag" && panel.dataset.open === "true") {
                // For tags, keep options populated even when blank.
                scheduleSearch("");
                return;
            }

            scheduleSearch(q);
        });

        input.addEventListener("keydown", async (e) => {
            if (e.key === "Escape") {
                stopCardNavigation(e);
                // Escape should dismiss without submitting.
                closePanel();
                input.blur();
                return;
            }

            if (e.key === "ArrowDown") {
                stopCardNavigation(e);
                const items = Array.from(dropdown.querySelectorAll(".scp-search-dropdown-item"));
                if (!items.length) return;
                activeIndex = Math.min(items.length - 1, activeIndex + 1);
                items[activeIndex]?.focus?.();
                return;
            }

            if (e.key === "ArrowUp") {
                stopCardNavigation(e);
                const items = Array.from(dropdown.querySelectorAll(".scp-search-dropdown-item"));
                if (!items.length) return;
                activeIndex = Math.max(0, activeIndex - 1);
                items[activeIndex]?.focus?.();
                return;
            }

            if (e.key !== "Enter") return;

            stopCardNavigation(e);
            try {
                const query = String(input.value || "").trim();

                setStatus("Checking…");

                // Cancel any pending debounced search and resolve the intent safely.
                cancelPendingSearch();

                // Always prefer an exact match lookup before creating.
                const exact = await findExactMatchRemote(query);
                if (exact?.id) {
                    setStatus("Linking…");
                    await addEntityById(exact.id);
                } else if (query) {
                    await createAndAddByName(query);
                }

                closePanel();
                input.blur();
            } catch (err) {
                console.error("[SceneCardPerformers] submit failed", err);
                showInlineError(panel.closest(`[${SCP_ROOT_ATTR}]`) || panel.parentElement || panel, String(err?.message || err));
                closePanel();
                input.blur();
            }
        });

        // Blur behavior: if focus leaves the panel entirely, close.
        // If query is unambiguous (exact match or single result), auto-add before closing.
        panel.addEventListener(
            "focusout",
            async (e) => {
                const next = e?.relatedTarget;
                if (next && next instanceof Node && panel.contains(next)) return;

                // Give clicks a tick to land (e.g., clicking a result button)
                await sleep(0);
                // If it was closed by a click handler already, do nothing.
                if (panel.dataset.open !== "true") {
                    closePanel();
                    return;
                }

                try {
                    await refreshCandidatesNow(input.value);
                    await trySubmitFromQuery(input.value);
                } catch (err) {
                    console.error("[SceneCardPerformers] blur submit failed", err);
                    showInlineError(panel.closest(`[${SCP_ROOT_ATTR}]`) || panel.parentElement || panel, String(err?.message || err));
                } finally {
                    closePanel();
                }
            },
            true
        );

        // Ensure interactions inside the panel don't trigger card navigation.
        // IMPORTANT: don't preventDefault on mousedown, otherwise the browser may not move focus
        // (and blur won't fire reliably when clicking outside the input).
        panel.addEventListener("mousedown", stopCardNavigationNoPrevent);
        panel.addEventListener("click", stopCardNavigation);

        // Clicking anywhere in the panel (except the input or action buttons) should blur the input.
        panel.addEventListener(
            "click",
            (e) => {
                const t = e?.target;
                if (!(t instanceof Node)) return;
                if (t === input || input.contains(t)) return;
                if (t instanceof Element && t.closest("button, a, [role='button']")) return;
                input.blur();
            },
            true
        );

        return panel;
    }

    function rerenderScene(sceneId) {
        const containers = sceneContainersById.get(sceneId);
        if (!containers || !containers.size) return;
        const scene = sceneCache.get(sceneId);
        if (!scene) return;
        for (const c of containers) {
            if (c && c.isConnected) {
                renderInto(c, scene);
            }
        }
    }

    async function ensureInjectedForCard(cardEl) {
        if (!(cardEl instanceof Element)) return;

        const sceneId = findSceneIdInCard(cardEl);
        if (!sceneId) return;

        // The scanner may return a wrapper around the real visual card (especially on the home page).
        // Always inject INSIDE the actual card element if we can find it.
        const cardScopeEl = findVisualCardElement(cardEl, sceneId) || cardEl;

        // Mark the card so our alignment CSS can be scoped safely.
        cardScopeEl.classList.add("scp-card");

        const preferredParent = getPreferredMountParent(cardScopeEl);

        // If we already injected, ensure it's in the right place and dedupe.
        const existingMounts = Array.from(cardScopeEl.querySelectorAll(`[${PLUGIN_ROOT_ATTR}]`)).filter((el) => {
            if (!(el instanceof Element)) return false;
            const sid = el.getAttribute("data-scp-scene-id");
            return !sid || sid === String(sceneId);
        });

        if (existingMounts.length) {
            // Prefer a mount already inside the preferred parent.
            const keep =
                existingMounts.find((m) => preferredParent && preferredParent.contains(m)) ||
                existingMounts[0];

            // Remove duplicates.
            for (const m of existingMounts) {
                if (m === keep) continue;
                unregisterContainer(sceneId, m);
                m.remove();
            }

            // Ensure attributes + placement.
            keep.setAttribute("data-scp-scene-id", String(sceneId));

            if (preferredParent && keep.parentElement !== preferredParent) {
                preferredParent.appendChild(keep);
            }

            ensureContainerRegistered(sceneId, keep);
            return;
        }

        const mount = createEl("div", {
            className: "scp-root",
            attrs: { [PLUGIN_ROOT_ATTR]: "1", [SCP_ROOT_ATTR]: "1", "data-scp-scene-id": String(sceneId) },
        });

        // Try to place in a sensible spot inside the card.
        (preferredParent || cardScopeEl).appendChild(mount);

        ensureContainerRegistered(sceneId, mount);

        // Prevent clicks on our UI from navigating into the scene.
        mount.addEventListener("click", stopCardNavigation);
        mount.addEventListener("mousedown", stopCardNavigationNoPrevent);

        try {
            const scene = await fetchScene(sceneId);
            if (!mount.isConnected) return;
            renderInto(mount, scene);
        } catch (err) {
            console.error("[SceneCardPerformers] failed to load scene", sceneId, err);
            showInlineError(mount, String(err?.message || err));
        }
    }

    async function scanAndInject() {
        if (scanAndInject.__inProgress) {
            scanAndInject.__queued = true;
            return;
        }
        scanAndInject.__inProgress = true;

        try {
            const cards = findLikelySceneCards();
            // Keep things gentle: avoid a burst of 100 parallel GraphQL queries.
            for (const card of cards) {
                // eslint-disable-next-line no-await-in-loop
                await ensureInjectedForCard(card);
            }
        } finally {
            scanAndInject.__inProgress = false;
            if (scanAndInject.__queued) {
                scanAndInject.__queued = false;
                setTimeout(scanAndInject, 0);
            }
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
            setTimeout(scanAndInject, 0);
        });
    }

    function installDomObserver() {
        const observer = new MutationObserver(() => {
            // Defer slightly so React can finish its batch.
            setTimeout(scanAndInject, 0);
        });

        if (document.body) {
            observer.observe(document.body, { subtree: true, childList: true });
        }
    }

    installLocationHooks();
    installDomObserver();

    ensureStyles();

    // Initial load.
    scanAndInject();
})();
