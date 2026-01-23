(function () {
    "use strict";

    const INSTALL_FLAG = "__hide_installed_plugins_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const MAX_ANCESTOR_HOPS = 14;
    const DEBOUNCE_MS = 75;
    const DEBUG = localStorage.getItem("hide_installed_plugins_debug") === "1";

    function normalizeText(s) {
        return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function btnLabel(el) {
        if (!(el instanceof Element)) return "";
        const parts = [
            el.textContent,
            el.getAttribute("aria-label"),
            el.getAttribute("title"),
        ].filter(Boolean);
        return normalizeText(parts.join(" "));
    }

    function isProbablyVisible(el) {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect && rect.width > 1 && rect.height > 1;
    }

    function getRoot() {
        return document.querySelector("main") || document.querySelector(".container") || document.body;
    }

    function isOnPluginsSettingsPage() {
        const path = String(location.pathname || "");
        const qs = String(location.search || "");
        if (path.includes("/settings") && /tab=plugins/i.test(qs)) return true;

        // Heuristic fallback: if we see install/uninstall buttons inside a plugin manager.
        const root = getRoot();
        const buttons = Array.from(root.querySelectorAll("button"));
        let hasInstall = false;
        let hasUninstall = false;
        for (const b of buttons) {
            const t = normalizeText(b.textContent);
            if (!t) continue;
            if (t === "install" || t.startsWith("install ")) hasInstall = true;
            if (t === "uninstall" || t.startsWith("uninstall ") || t === "remove") hasUninstall = true;
            if (hasInstall && hasUninstall) break;
        }

        // Only treat as plugins page when we have the plugin settings layout.
        if (!path.includes("/settings")) return false;
        if (!(hasInstall || hasUninstall)) return false;

        // Stash plugin settings typically uses .package-manager.
        const hasManager = Boolean(document.querySelector(".package-manager"));
        return hasManager || hasInstall;
    }

    function buttonKind(btn) {
        const t = btnLabel(btn);
        if (!t) return null;
        if (t === "install" || t.startsWith("install ") || t.includes(" install")) return "install";
        if (t === "uninstall" || t.startsWith("uninstall ") || t.includes(" uninstall") || t === "remove" || t.includes(" remove")) return "uninstall";
        return null;
    }

    function looksLikePluginItem(el) {
        if (!(el instanceof Element)) return false;
        if (!isProbablyVisible(el)) return false;

        // Avoid huge containers.
        const textLen = String(el.textContent || "").length;
        if (textLen > 6000) return false;

        const buttons = Array.from(el.querySelectorAll("button, a.btn"));
        let installCount = 0;
        let uninstallCount = 0;
        for (const b of buttons) {
            const k = buttonKind(b);
            if (k === "install") installCount++;
            if (k === "uninstall") uninstallCount++;
        }
        if (installCount + uninstallCount === 0) return false;
        if (installCount + uninstallCount > 3) return false;

        const hasTitle = Boolean(el.querySelector("h1, h2, h3, h4, h5, h6, .card-title, strong"));
        return hasTitle;
    }

    function findPluginItemRoot(fromEl) {
        let el = fromEl instanceof Element ? fromEl : null;
        let best = null;
        for (let i = 0; el && i < MAX_ANCESTOR_HOPS; i++) {
            if (looksLikePluginItem(el)) best = el;
            el = el.parentElement;
        }
        return best;
    }

    function bestNameFromItem(itemEl) {
        if (!(itemEl instanceof Element)) return "";

        const candidates = Array.from(itemEl.querySelectorAll("h1, h2, h3, h4, h5, h6, .card-title, strong")).filter(isProbablyVisible);

        for (const el of candidates) {
            const t = normalizeText(el.textContent);
            if (!t) continue;
            if (t === "install" || t === "uninstall" || t === "remove") continue;
            if (t.includes("available plugins") || t.includes("installed plugins")) continue;
            return t;
        }

        // Fallback: take the first reasonable-looking line.
        const raw = normalizeText(itemEl.textContent);
        const parts = raw.split(" ");
        return parts.slice(0, 12).join(" ");
    }

    function findHeadingByTextIncludes(substr) {
        const needle = normalizeText(substr);
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        for (const h of headings) {
            const t = normalizeText(h.textContent);
            if (t && t.includes(needle) && isProbablyVisible(h)) return h;
        }
        return null;
    }

    function guessSectionRootFromHeading(headingEl) {
        if (!(headingEl instanceof Element)) return null;

        // Often the heading is inside a card header and items are in the next sibling.
        const next = headingEl.closest(".card")?.querySelector(".card-body") || headingEl.parentElement?.nextElementSibling;
        if (next instanceof Element) return next;

        // Fallback: walk up a bit until we find a container with multiple buttons.
        let el = headingEl.parentElement;
        for (let i = 0; el && i < 8; i++) {
            const btns = el.querySelectorAll("button, a.btn");
            if (btns.length >= 2) return el;
            el = el.parentElement;
        }
        return null;
    }

    function collectPluginItemsWithin(rootEl) {
        if (!(rootEl instanceof Element)) return [];
        const btns = Array.from(rootEl.querySelectorAll("button, a.btn"));
        const items = [];
        const seen = new Set();

        for (const b of btns) {
            const k = buttonKind(b);
            if (!k) continue;
            const item = findPluginItemRoot(b);
            if (!item) continue;
            if (seen.has(item)) continue;
            seen.add(item);
            const name = bestNameFromItem(item);
            if (!name) continue;
            items.push({ item, name, kind: k });
        }

        return items;
    }

    function hideEl(el) {
        if (!(el instanceof Element)) return;
        if (el.dataset.hipHidden === "1") return;
        if (el.dataset.hipOrigDisplay == null) el.dataset.hipOrigDisplay = String(el.style.display || "");
        el.style.display = "none";
        el.dataset.hipHidden = "1";
    }

    function unhideEl(el) {
        if (!(el instanceof Element)) return;
        if (el.dataset.hipHidden !== "1") return;
        const prev = el.dataset.hipOrigDisplay;
        el.style.display = prev != null ? prev : "";
        delete el.dataset.hipOrigDisplay;
        delete el.dataset.hipHidden;
    }

    function applyOnce() {
        const root = getRoot();

        // If we're not on the plugins page, ensure we don't leave anything hidden.
        if (!isOnPluginsSettingsPage()) {
            root.querySelectorAll("[data-hip-hidden='1']").forEach((el) => unhideEl(el));
            return;
        }
        // Prefer explicit sections when present.
        const installedHeading = findHeadingByTextIncludes("installed plugins");
        const availableHeading = findHeadingByTextIncludes("available plugins");
        const installedRoot = installedHeading ? guessSectionRootFromHeading(installedHeading) : null;
        const availableRoot = availableHeading ? guessSectionRootFromHeading(availableHeading) : null;

        const installed = new Set();
        const installItems = [];

        if (installedRoot && availableRoot) {
            const installedItems = collectPluginItemsWithin(installedRoot).filter((x) => x.kind === "uninstall");
            for (const it of installedItems) installed.add(it.name);

            const availableItems = collectPluginItemsWithin(availableRoot).filter((x) => x.kind === "install");
            for (const it of availableItems) installItems.push({ item: it.item, name: it.name });
        } else {
            // Fallback: scan entire page.
            const buttons = Array.from(root.querySelectorAll("button, a.btn"));
            for (const btn of buttons) {
                const kind = buttonKind(btn);
                if (!kind) continue;

                const item = findPluginItemRoot(btn);
                if (!item) continue;

                const name = bestNameFromItem(item);
                if (!name) continue;

                if (kind === "uninstall") {
                    installed.add(name);
                    continue;
                }

                if (kind === "install") {
                    installItems.push({ item, name });
                }
            }
        }

        // Hide available plugins that are already installed.
        for (const { item, name } of installItems) {
            if (installed.has(name)) hideEl(item);
            else unhideEl(item);
        }

        // If a plugin was uninstalled, previously-hidden items should reappear.
        // Also unhide anything we hid earlier that no longer matches.
        root.querySelectorAll("[data-hip-hidden='1']").forEach((el) => {
            if (!(el instanceof Element)) return;
            const name = bestNameFromItem(el);
            if (!name) return;
            if (!installed.has(name)) unhideEl(el);
        });

        if (DEBUG) {
            // Keep the output small and one-line for easy inspection.
            console.log("[HideInstalledPlugins]", {
                installed: installed.size,
                available: installItems.length,
                hidden: root.querySelectorAll("[data-hip-hidden='1']").length,
                hasInstalledSection: Boolean(installedRoot),
                hasAvailableSection: Boolean(availableRoot),
            });
        }
    }

    let scheduled = false;
    function scheduleApply() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            applyOnce();
        }, DEBOUNCE_MS);
    }

    let observer = null;

    function stop() {
        if (observer) observer.disconnect();
        observer = null;
    }

    function start() {
        stop();

        observer = new MutationObserver(() => {
            // Debounce bursts of React renders.
            scheduleApply();
        });

        // IMPORTANT: do NOT observe attributes. This plugin mutates style/data-* attributes;
        // observing attributes causes self-triggered loops/thrashing.
        if (document.body) observer.observe(document.body, { subtree: true, childList: true });
        applyOnce();
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
            setTimeout(() => {
                // Keep a single observer; just schedule an apply (or restore) on nav.
                scheduleApply();
            }, 0);
        });
    }

    installLocationHooks();
    // Start once; applyOnce() will no-op (and restore) when not on plugins page.
    start();
})();
