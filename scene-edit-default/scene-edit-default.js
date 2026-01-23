(function () {
    const INSTALL_FLAG = "__scene_edit_default_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const MAX_WAIT_MS = 7000;
    const POLL_MS = 100;

    let lastSceneKey = null;
    let activeAttemptToken = 0;

    // Cache scene organized status so we only query once per scene.
    const organizedCache = new Map(); // sceneId -> boolean | null
    const organizedInFlight = new Map(); // sceneId -> Promise<boolean|null>
    const organizedLastErrorAt = new Map(); // sceneId -> ms
    const ORGANIZED_RETRY_MS = 1000;

    function getSceneKeyFromLocation() {
        const path = String(location.pathname || "");
        const match = path.match(/\/scenes\/(.+?)(?:\/|$)/i);
        if (!match) return null;
        const key = match[1];
        if (!key) return null;
        return key;
    }

    function isProbablyVisible(el) {
        if (!el) return false;
        if (!(el instanceof Element)) return false;

        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;

        const rect = el.getBoundingClientRect();
        if (!rect) return false;
        if (rect.width <= 1 || rect.height <= 1) return false;

        return true;
    }

    function isActiveTab(el) {
        if (!el) return false;
        const ariaSelected = (el.getAttribute("aria-selected") || "").toLowerCase();
        if (ariaSelected === "true") return true;
        if (el.classList.contains("active")) return true;
        return false;
    }

    function normalizeText(text) {
        return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
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

    async function fetchSceneOrganized(sceneId) {
        const query = `
            query FindScene($id: ID!) {
                findScene(id: $id) {
                    id
                    organized
                }
            }
        `;
        const data = await gql(query, { id: sceneId });
        const organized = data?.findScene?.organized;
        return typeof organized === "boolean" ? organized : null;
    }

    function ensureOrganizedFetched(sceneId) {
        if (!sceneId) return;
        if (organizedCache.has(sceneId)) return;
        if (organizedInFlight.has(sceneId)) return;

        const lastErr = organizedLastErrorAt.get(sceneId) || 0;
        if (lastErr && Date.now() - lastErr < ORGANIZED_RETRY_MS) return;

        const p = (async () => {
            try {
                const organized = await fetchSceneOrganized(sceneId);
                organizedCache.set(sceneId, organized);
                return organized;
            } catch {
                organizedLastErrorAt.set(sceneId, Date.now());
                return null;
            }
        })();

        organizedInFlight.set(sceneId, p);
        p.finally(() => organizedInFlight.delete(sceneId));
    }

    function findEditTab() {
        const selectors = [
            "[role='tab']",
            ".nav-tabs [role='tab']",
            "a.nav-link",
            "button.nav-link",
            ".nav-tabs a",
            ".nav-tabs button",
            "[data-rb-event-key]",
            "[data-rr-ui-event-key]",
        ];

        const seen = new Set();
        const candidates = [];
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
                if (!seen.has(el)) {
                    seen.add(el);
                    candidates.push(el);
                }
            });
        }

        // Primary: tab whose visible label is exactly "edit".
        for (const el of candidates) {
            if (!isProbablyVisible(el)) continue;
            const label = normalizeText(el.textContent);
            if (label === "edit") return el;
        }

        // Secondary: heuristics based on attributes.
        for (const el of candidates) {
            if (!isProbablyVisible(el)) continue;
            const attrs = [
                el.getAttribute("aria-label"),
                el.getAttribute("aria-controls"),
                el.getAttribute("id"),
                el.getAttribute("href"),
                el.getAttribute("data-rb-event-key"),
                el.getAttribute("data-rr-ui-event-key"),
            ]
                .filter(Boolean)
                .map((v) => normalizeText(v));

            if (attrs.some((v) => v === "edit" || v.endsWith(" edit") || v.includes("edit"))) {
                return el;
            }
        }

        return null;
    }

    function selectEditTabOncePerScene() {
        const sceneKey = getSceneKeyFromLocation();
        if (!sceneKey) return;

        // Only force on first arrival to a new scene.
        if (sceneKey === lastSceneKey) return;

        const attemptToken = ++activeAttemptToken;
        const startedAt = Date.now();

        let intervalId = null;
        let observer = null;

        function cleanup() {
            if (intervalId) clearInterval(intervalId);
            intervalId = null;
            if (observer) observer.disconnect();
            observer = null;
        }

        function markHandled() {
            lastSceneKey = sceneKey;
        }

        function tick() {
            // Cancel if a newer attempt has started (navigated again).
            if (attemptToken !== activeAttemptToken) {
                cleanup();
                return;
            }

            // Cancel if we’re no longer on the same scene.
            const currentKey = getSceneKeyFromLocation();
            if (currentKey !== sceneKey) {
                cleanup();
                return;
            }

            // Only switch tabs when the scene is NOT organized.
            // If we cannot determine status, do nothing (to satisfy the requirement).
            const cached = organizedCache.get(sceneKey);
            if (cached === true) {
                markHandled();
                cleanup();
                return;
            }
            if (cached !== false) {
                ensureOrganizedFetched(sceneKey);
                if (Date.now() - startedAt > MAX_WAIT_MS) {
                    markHandled();
                    cleanup();
                }
                return;
            }

            const editTab = findEditTab();
            if (editTab) {
                if (!isActiveTab(editTab)) {
                    editTab.click();
                }
                markHandled();
                cleanup();
                return;
            }

            if (Date.now() - startedAt > MAX_WAIT_MS) {
                markHandled();
                cleanup();
            }
        }

        // Observe DOM changes since Stash pages render asynchronously.
        observer = new MutationObserver(() => tick());
        if (document.body) {
            observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        }

        intervalId = setInterval(tick, POLL_MS);

        // Kick immediately (a couple of times) to catch fast renders.
        tick();
        requestAnimationFrame(tick);
        setTimeout(tick, 0);
    }

    function emitLocationChange() {
        window.dispatchEvent(new Event("locationchange"));
    }

    function installLocationHooks() {
        // Patch History API so we see SPA navigation.
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
            // Delay a hair so route changes that also trigger UI transitions can settle.
            setTimeout(selectEditTabOncePerScene, 0);
        });
    }

    installLocationHooks();
    // Initial load
    selectEditTabOncePerScene();
})();
