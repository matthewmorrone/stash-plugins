(function () {
    const STORAGE_KEY_PREFIX = "stash-scroll:";

    // Only run on settings-like pages to avoid surprising behavior elsewhere.
    // Adjust this if your Stash routes differ.
    const path = (location.pathname || "").toLowerCase();
    const isSettingsPage = path.includes("settings");
    if (!isSettingsPage) return;

    // If the URL has a hash, let the browser's normal anchor behavior win.
    if (location.hash && location.hash.length > 1) return;

    const key = STORAGE_KEY_PREFIX + location.pathname + location.search;

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

    const savedRaw = sessionStorage.getItem(key);
    const savedY = savedRaw ? Number(savedRaw) : NaN;

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

    // Restore ASAP, but after layout has had at least one paint.
    if (!Number.isNaN(savedY) && savedY > 0) {
        requestAnimationFrame(() => {
            withScrollTarget((target) => {
                const restore = () => setScrollTop(target, savedY);
                restore();
                // Some pages change height after initial paint; do a couple of retries.
                setTimeout(restore, 50);
                setTimeout(restore, 200);
            });
        });
    }

    // Persist on scroll, debounced.
    let timer = null;
    function persistFromTarget(target) {
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

    withScrollTarget((target) => {
        const handler = () => persistFromTarget(target);
        if (target === window) {
            window.addEventListener("scroll", handler, { passive: true });
        } else {
            target.addEventListener("scroll", handler, { passive: true });
        }

        // Also persist right before refresh/navigation.
        window.addEventListener("beforeunload", () => {
            try {
                sessionStorage.setItem(key, String(getScrollTop(target)));
            } catch {
                // ignore
            }
        });
    });
})();
