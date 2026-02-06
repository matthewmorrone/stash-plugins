(function () {
    "use strict";

    const INSTALL_FLAG = "__performed_with_scenes_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const STYLE_ID = "performed-with-scenes-style";
    const ROOT_ATTR = "data-performed-with-scenes-root";
    const ITEM_ATTR = "data-performed-with-scenes-item";

    const POLL_MS = 500;
    const MAX_SCENES_PER_CO = 12;
    const PAGE_SIZE = 50;
    const MAX_PAGES_PER_CO = 20; // 1000 scenes max per co-performer as a hard safety cap
    const CONCURRENCY = 4;

    const sharedScenesCache = new Map(); // key "a|b" (sorted) -> { count?, scenes: [{id,title}] }
    const inFlight = new Map(); // key -> Promise

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            [${ROOT_ATTR}] .pwf-block {
                margin-top: 6px;
                padding: 6px 8px;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                background: rgba(0,0,0,0.18);
                font-size: 12px;
                line-height: 1.2;
            }
            [${ROOT_ATTR}] .pwf-block a { text-decoration: none; }
            [${ROOT_ATTR}] .pwf-summary { cursor: pointer; user-select: none; }
            [${ROOT_ATTR}] .pwf-list { margin: 6px 0 0 0; padding-left: 16px; }
            [${ROOT_ATTR}] .pwf-list li { margin: 2px 0; }
            [${ROOT_ATTR}] .pwf-muted { opacity: 0.75; }
            [${ROOT_ATTR}] .pwf-error { color: #ffb4b4; opacity: 0.95; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function normalizeText(s) {
        return String(s || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
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
        if (json?.errors?.length) {
            const msg = json.errors.map((e) => e?.message).filter(Boolean).join("; ");
            throw new Error(msg || "GraphQL error");
        }
        return json?.data;
    }

    function getPerformerIdFromLocation() {
        const path = String(location.pathname || "");
        const m = path.match(/\/performers\/([^/]+)(?:\/|$)/i);
        return m ? (m[1] || null) : null;
    }

    function isPerformerPage() {
        return Boolean(getPerformerIdFromLocation());
    }

    function parsePerformerIdFromHref(href) {
        const h = String(href || "");
        // Match `/performers/<id>` but NOT `/performers?...`.
        const m = h.match(/\/performers\/(?!\?)([^/?#]+)(?:[/?#]|$)/i);
        return m ? (m[1] || null) : null;
    }

    function uniqByKey(items, keyFn) {
        const out = [];
        const seen = new Set();
        for (const it of Array.isArray(items) ? items : []) {
            const k = keyFn(it);
            if (!k) continue;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(it);
        }
        return out;
    }

    function findPerformedWithSectionRoot() {
        const main = document.querySelector("main") || document.body;
        if (!main) return null;

        const headings = Array.from(main.querySelectorAll("h1,h2,h3,h4,h5,h6"));
        for (const h of headings) {
            const t = normalizeText(h.textContent);
            if (t !== "performed with") continue;

            // Walk up until we find a container that contains performer links.
            let el = h;
            for (let i = 0; i < 7 && el; i++) {
                const container = el.parentElement;
                if (!container) break;

                const performerLinks = container.querySelectorAll("a[href^='/performers/']");
                if (performerLinks.length >= 1) return container;

                el = container;
            }

            // Fallback to the heading's parent.
            return h.parentElement || null;
        }

        // Fallback: look for a section that contains a heading-like element.
        const candidates = Array.from(main.querySelectorAll("section, .card, .detail-group, .row, .col, div"));
        for (const c of candidates) {
            if (!(c instanceof HTMLElement)) continue;
            if (c.querySelector(`[${ROOT_ATTR}]`)) continue;
            const txt = normalizeText(c.textContent);
            if (!txt.includes("performed with")) continue;
            const performerLinks = c.querySelectorAll("a[href^='/performers/']");
            if (performerLinks.length >= 2) return c;
        }

        return null;
    }

    function findCoPerformerTargets(sectionRoot, currentPerformerId) {
        if (!sectionRoot) return [];

        // Preferred: Stash renders co-performers as `.performer-card` elements.
        const cards = Array.from(sectionRoot.querySelectorAll(".performer-card"))
            .filter((el) => el instanceof HTMLElement);

        if (cards.length) {
            const items = [];
            for (const cardEl of cards) {
                const a = cardEl.querySelector("a[href^='/performers/']");
                if (!(a instanceof HTMLAnchorElement)) continue;
                const id = parsePerformerIdFromHref(a.getAttribute("href"));
                if (!id || id === currentPerformerId) continue;
                items.push({ coId: id, cardEl });
            }
            return uniqByKey(items, (x) => x.coId);
        }

        // Fallback: dedupe any performer links inside the section (avoid `/performers?...`).
        const anchors = Array.from(sectionRoot.querySelectorAll("a[href^='/performers/']"))
            .filter((a) => a instanceof HTMLAnchorElement)
            .map((a) => ({ a, id: parsePerformerIdFromHref(a.getAttribute("href")) }))
            .filter((x) => x.id && x.id !== currentPerformerId);

        const deduped = uniqByKey(anchors, (x) => x.id).map((x) => x);
        return deduped.map((x) => ({ coId: x.id, cardEl: x.a.closest(".card, .performer-card") || x.a.parentElement }));
    }

    function findBestInsertTarget(cardEl) {
        if (!(cardEl instanceof Element)) return null;
        // Insert inside the card body if present.
        const cardSection = cardEl.querySelector(".card-section") || null;
        return cardSection instanceof HTMLElement ? cardSection : (cardEl instanceof HTMLElement ? cardEl : null);
    }

    function ensureBlockForCoPerformer(sectionRoot, coPerformerId, insertTargetEl) {
        if (!sectionRoot || !coPerformerId || !insertTargetEl) return null;

        sectionRoot.setAttribute(ROOT_ATTR, "1");

        const existing = insertTargetEl.querySelector(`[${ITEM_ATTR}='${CSS.escape(coPerformerId)}']`);
        if (existing) return existing;

        const block = document.createElement("div");
        block.className = "pwf-block";
        block.setAttribute(ITEM_ATTR, coPerformerId);
        block.innerHTML = `<div class='pwf-muted'>Shared scenes: loading…</div>`;

        // Prefer placing it above the `hr` that separates card body from footer controls.
        const hr = insertTargetEl.querySelector("hr");
        if (hr && hr.parentElement === insertTargetEl) {
            hr.insertAdjacentElement("beforebegin", block);
        } else {
            insertTargetEl.appendChild(block);
        }
        return block;
    }

    function cacheKey(a, b) {
        const A = String(a || "");
        const B = String(b || "");
        return A < B ? `${A}|${B}` : `${B}|${A}`;
    }

    async function fetchSharedScenes(a, b, limit) {
        const key = cacheKey(a, b);
        if (sharedScenesCache.has(key)) return sharedScenesCache.get(key);
        if (inFlight.has(key)) return inFlight.get(key);

        const p = (async () => {
            // We intentionally only request stable, commonly-present fields.
            const baseQuery = `
                query PWFSharedScenes($filter: FindFilterType, $scene_filter: SceneFilterType) {
                    findScenes(filter: $filter, scene_filter: $scene_filter) {
                        count
                        scenes {
                            id
                            title
                            performers { id }
                        }
                    }
                }
            `;

            const filter = {
                page: 1,
                per_page: PAGE_SIZE,
                sort: "date",
                direction: "DESC",
            };

            const attemptSceneFilters = [
                // Most likely modern Stash shape
                { performers: { value: [String(a), String(b)], modifier: "INCLUDES_ALL" } },
                { performers: { value: [String(a), String(b)], modifier: "INCLUDES" } },
                // Alternate field name seen in some versions
                { performer_id: { value: [String(a), String(b)], modifier: "INCLUDES_ALL" } },
                { performer_id: { value: [String(a), String(b)], modifier: "INCLUDES" } },
                { performer_ids: { value: [String(a), String(b)], modifier: "INCLUDES_ALL" } },
                { performer_ids: { value: [String(a), String(b)], modifier: "INCLUDES" } },
            ];

            function sceneHasBoth(scene) {
                const ids = new Set((scene?.performers || []).map((p) => String(p?.id || "").trim()).filter(Boolean));
                return ids.has(String(a)) && ids.has(String(b));
            }

            const collected = [];
            let lastCount = null;

            // We’ll paginate until we get enough *filtered* scenes or hit a safety cap.
            for (let page = 1; page <= MAX_PAGES_PER_CO; page++) {
                filter.page = page;

                let data = null;
                let lastErr = null;

                for (const scene_filter of attemptSceneFilters) {
                    try {
                        data = await gql(baseQuery, { filter, scene_filter });
                        lastErr = null;
                        break;
                    } catch (err) {
                        lastErr = err;
                        // Try next filter shape if it's a schema/validation issue.
                        const msg = String(err?.message || err);
                        const schemaErr = /(Unknown argument|Cannot query field|Unknown type|Unknown field|Expected type|Field .*? not found)/i.test(msg);
                        const invalidFilter = /(Unknown input field|Field .*? is not defined by type|Expected value of type)/i.test(msg);
                        if (!(schemaErr || invalidFilter)) throw err;
                    }
                }

                if (!data) {
                    throw lastErr || new Error("Unable to query shared scenes");
                }

                const fs = data?.findScenes;
                const scenes = Array.isArray(fs?.scenes) ? fs.scenes : [];
                lastCount = typeof fs?.count === "number" ? fs.count : lastCount;

                for (const s of scenes) {
                    if (!s?.id) continue;
                    if (!sceneHasBoth(s)) continue;
                    collected.push({ id: String(s.id), title: String(s.title || "(untitled)") });
                    if (collected.length >= limit) break;
                }

                if (collected.length >= limit) break;
                if (scenes.length < PAGE_SIZE) break;
            }

            const result = { count: lastCount, scenes: collected };
            sharedScenesCache.set(key, result);
            return result;
        })();

        inFlight.set(key, p);
        try {
            return await p;
        } finally {
            inFlight.delete(key);
        }
    }

    async function runWithConcurrency(items, worker, concurrency) {
        const queue = Array.from(items);
        const results = [];
        const workers = Array.from({ length: Math.max(1, concurrency | 0) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                if (!item) continue;
                const r = await worker(item);
                results.push(r);
            }
        });
        await Promise.all(workers);
        return results;
    }

    function renderBlock(blockEl, coPerformerId, shared) {
        if (!blockEl) return;
        const scenes = Array.isArray(shared?.scenes) ? shared.scenes : [];

        if (!scenes.length) {
            blockEl.innerHTML = `<div class='pwf-muted'>Shared scenes: none found</div>`;
            return;
        }

        const summaryText = `Shared scenes (${scenes.length}${shared?.count && shared.count > scenes.length ? "+" : ""})`;
        const itemsHtml = scenes
            .map((s) => {
                const href = `/scenes/${encodeURIComponent(String(s.id))}`;
                return `<li><a href='${href}'>${escapeHtml(s.title || "(untitled)")}</a></li>`;
            })
            .join("");

        blockEl.innerHTML = `
            <details>
                <summary class='pwf-summary'>${escapeHtml(summaryText)}</summary>
                <ul class='pwf-list'>${itemsHtml}</ul>
            </details>
        `;
    }

    function renderError(blockEl, err) {
        if (!blockEl) return;
        const msg = escapeHtml(String(err?.message || err || "Error"));
        blockEl.innerHTML = `<div class='pwf-error'>Shared scenes: ${msg}</div>`;
    }

    async function enhanceOnce() {
        if (!isPerformerPage()) return;

        const currentPerformerId = getPerformerIdFromLocation();
        if (!currentPerformerId) return;

        const sectionRoot = findPerformedWithSectionRoot();
        if (!sectionRoot) return;

        ensureStyles();

        const coTargets = findCoPerformerTargets(sectionRoot, currentPerformerId);
        if (!coTargets.length) return;

        // Create blocks eagerly so the user sees "loading" immediately.
        const tasks = [];
        for (const { coId, cardEl } of coTargets) {
            const target = findBestInsertTarget(cardEl);
            if (!target) continue;
            const block = ensureBlockForCoPerformer(sectionRoot, coId, target);
            if (!block) continue;

            // Avoid reloading if we already rendered this block.
            if (block.getAttribute("data-pwf-loaded") === "1") continue;
            block.setAttribute("data-pwf-loaded", "1");

            tasks.push({ coId, block });
        }

        if (!tasks.length) return;

        await runWithConcurrency(
            tasks,
            async ({ coId, block }) => {
                try {
                    const shared = await fetchSharedScenes(currentPerformerId, coId, MAX_SCENES_PER_CO);
                    renderBlock(block, coId, shared);
                } catch (err) {
                    renderError(block, err);
                }
                return null;
            },
            CONCURRENCY
        );
    }

    let lastPath = "";
    let running = false;

    async function tick() {
        const path = String(location.pathname || "");
        const changed = path !== lastPath;
        if (changed) {
            lastPath = path;
            // Give the SPA a moment to render.
            await sleep(50);
        }

        if (!isPerformerPage()) return;
        if (running) return;

        running = true;
        try {
            await enhanceOnce();
        } finally {
            running = false;
        }
    }

    // Polling is the most reliable approach across Stash SPA builds.
    window.setInterval(tick, POLL_MS);

    // Also run once immediately.
    tick();
})();
