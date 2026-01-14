(function () {
    const INSTALL_FLAG = "__stash_scene_edit_default_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const MAX_WAIT_MS = 7000;
    const POLL_MS = 100;

    let lastSceneKey = null;
    let activeAttemptToken = 0;

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
        lastSceneKey = sceneKey;

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

            const editTab = findEditTab();
            if (editTab) {
                if (!isActiveTab(editTab)) {
                    editTab.click();
                }
                cleanup();
                return;
            }

            if (Date.now() - startedAt > MAX_WAIT_MS) {
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
        window.dispatchEvent(new Event("stash-locationchange"));
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
        window.addEventListener("stash-locationchange", () => {
            // Delay a hair so route changes that also trigger UI transitions can settle.
            setTimeout(selectEditTabOncePerScene, 0);
        });
    }

    installLocationHooks();
    // Initial load
    selectEditTabOncePerScene();
})();
