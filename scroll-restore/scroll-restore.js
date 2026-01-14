(function () {
    const STORAGE_KEY_PREFIX = "stash-scroll:";

    // Routes where scroll restore is enabled.
    // Keep this conservative to avoid surprising behavior on detail pages.
    const ENABLED_ROUTES = [
        // Settings pages
        { test: (path) => path.includes("settings") },
        // Scenes list page (NOT individual scenes)
        { test: (path) => /^\/scenes\/?$/i.test(path) },
    ];

    // Routes where scroll restore is explicitly disabled.
    // Example: individual scene pages like /scenes/123
    const DISABLED_ROUTES = [
        { test: (path) => /^\/scenes\/[^/]+/i.test(path) },
    ];

    function isEnabledForCurrentRoute() {
        const path = String(location.pathname || "");
        if (DISABLED_ROUTES.some((r) => r.test(path))) return false;
        return ENABLED_ROUTES.some((r) => r.test(path));
    }

    // If the URL has a hash, let the browser's normal anchor behavior win.
    if (location.hash && location.hash.length > 1) return;

    function getKey() {
        return STORAGE_KEY_PREFIX + location.pathname + location.search;
    }

    function isElementScrollable(el) {
        if (!el || el === document.body || el === document.documentElement) return false;
        const style = window.getComputedStyle(el);
        const overflowY = (style.overflowY || "").toLowerCase();
        if (!(overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")) return false;
        return el.scrollHeight > el.clientHeight + 5;
    }

    function isPageScrollable() {
        const root = document.scrollingElement || document.documentElement;
        return root.scrollHeight > root.clientHeight + 5;
    }

    function findScrollContainer() {
        // Prefer the page scroll if it exists.
        if (isPageScrollable()) return window;

        // Try likely containers first.
        const preferredSelectors = [
            "#settings-container",
            ".settings-container",
            ".tab-content",
            "main",
            "[role=main]",
            ".page-content",
            ".content",
            ".container",
        ];

        for (const sel of preferredSelectors) {
            const el = document.querySelector(sel);
            if (isElementScrollable(el)) return el;
        }

        // Fallback: find the largest visible scrollable element.
        const candidates = Array.from(document.querySelectorAll("div, main, section, article"));
        let best = null;
        let bestScore = 0;

        for (const el of candidates) {
            if (!isElementScrollable(el)) continue;
            const score = el.clientHeight * 10 + (el.scrollHeight - el.clientHeight);
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }

        return best || window;
    }

    function getScrollTop(target) {
        if (target === window) {
            return window.scrollY || (document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop ?? 0);
        }
        return target.scrollTop || 0;
    }

    function setScrollTop(target, y) {
        if (target === window) {
            window.scrollTo(0, y);
        } else {
            target.scrollTop = y;
        }
    }

    function withScrollTarget(fn) {
        // The scroll container may not exist immediately (settings UI can render after load).
        let attempts = 0;
        const maxAttempts = 40; // ~2s at 50ms

        const tick = () => {
            const target = findScrollContainer();
            if (target && (target === window || document.contains(target))) {
                fn(target);
                return;
            }

            attempts++;
            if (attempts < maxAttempts) setTimeout(tick, 50);
        };

        tick();
    }

    // State per current route.
    let currentKey = null;
    let currentTarget = null;
    let timer = null;
    let scrollCaptureHandler = null;

    function restoreForKey(target, key) {
        const savedRaw = sessionStorage.getItem(key);
        const savedY = savedRaw ? Number(savedRaw) : NaN;
        if (Number.isNaN(savedY) || savedY <= 0) return;

        const restore = () => setScrollTop(target, savedY);
        restore();
        // Some pages change height after initial paint; do a couple of retries.
        setTimeout(restore, 50);
        setTimeout(restore, 200);
    }

    function persistFromTarget(target, key) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            try {
                sessionStorage.setItem(key, String(getScrollTop(target)));
            } catch {
                // ignore
            }
        }, 100);
    }

    function getBestScrollTargetFromEvent(e) {
        // If the page scroll is active, prefer window.
        if (isPageScrollable()) return window;

        const t = e?.target;
        if (!t || t === document || t === document.body || t === document.documentElement) {
            return currentTarget || findScrollContainer();
        }

        if (t instanceof Element && isElementScrollable(t)) return t;

        return currentTarget || findScrollContainer();
    }

    function detachScrollCapture() {
        if (!scrollCaptureHandler) return;
        try {
            document.removeEventListener("scroll", scrollCaptureHandler, true);
        } catch {
            // ignore
        }
        scrollCaptureHandler = null;
        currentTarget = null;
    }

    function ensureScrollCapture() {
        if (scrollCaptureHandler) return;
        scrollCaptureHandler = (e) => {
            if (!currentKey) return;
            const target = getBestScrollTargetFromEvent(e);
            currentTarget = target;
            persistFromTarget(target, currentKey);
        };
        // Capture so we receive scroll events from nested scroll containers.
        document.addEventListener("scroll", scrollCaptureHandler, true);
    }

    function attachForCurrentRoute() {
        if (!isEnabledForCurrentRoute()) {
            detachScrollCapture();
            currentKey = null;
            return;
        }

        const key = getKey();
        currentKey = key;

        ensureScrollCapture();

        withScrollTarget((target) => {
            // Route may have changed while waiting for target.
            if (key !== getKey() || !isEnabledForCurrentRoute()) return;

            currentTarget = target;

            // Restore after layout has had at least one paint.
            requestAnimationFrame(() => restoreForKey(target, key));
        });
    }

    function emitLocationChange() {
        window.dispatchEvent(new Event("stash-locationchange"));
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
        window.addEventListener("stash-locationchange", () => {
            // Let the new route render before trying to find scroll container.
            setTimeout(attachForCurrentRoute, 0);
        });
    }

    // Persist right before a hard refresh/close.
    window.addEventListener("beforeunload", () => {
        if (!currentKey) return;
        if (!currentTarget) return;
        try {
            sessionStorage.setItem(currentKey, String(getScrollTop(currentTarget)));
        } catch {
            // ignore
        }
    });

    installLocationHooks();
    attachForCurrentRoute();
})();
