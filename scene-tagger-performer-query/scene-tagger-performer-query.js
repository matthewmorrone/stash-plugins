(function () {
    "use strict";

    const INSTALL_FLAG = "__stash_scene_tagger_performer_query_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const POLL_MS = 250;

    const USER_EDITED_ATTR = "data-stash-ptq-user-edited";
    const LAST_AUTO_ATTR = "data-stash-ptq-last";
    const settingInputs = new WeakSet();

    function getSearchItems() {
        // On your build the “scene tagger” UI lives on the /scenes route and
        // each row is wrapped in `.search-item`.
        return Array.from(document.querySelectorAll(".search-item"));
    }

    function isOnSceneTaggerPage() {
        // This plugin is intentionally DOM-driven so it works even if the route
        // is just `/scenes`.
        const items = getSearchItems();
        if (!items.length) return false;

        // Consider it “scene tagger” if at least one row has a Query input group.
        for (const item of items) {
            const queryInput = findQueryInputInSearchItem(item);
            if (queryInput) return true;
        }
        return false;
    }

    function isProbablyVisible(el) {
        if (!el || !(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 1 || rect.height <= 1) return false;
        return true;
    }

    function normalizeName(s) {
        return String(s || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function dedupePreserveOrder(names) {
        const out = [];
        const seen = new Set();
        for (const n of Array.isArray(names) ? names : []) {
            const name = normalizeName(n);
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name);
        }
        return out;
    }

    function computePerformerRowText(rowEl) {
        if (!rowEl || !(rowEl instanceof Element)) return "";
        return normalizeName(rowEl.textContent)
            .replace(/[×+]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getPerformerNamesFromSearchItem(searchItemEl) {
        if (!searchItemEl) return [];

        const names = [];

        // Primary (your example): performer “pills” rendered by scene-card-performers.
        searchItemEl.querySelectorAll(".scp-row[data-scp-row='performer'] .scp-pill-name").forEach((el) => {
            const name = normalizeName(el.textContent);
            if (name) names.push(name);
        });

        // Fallback: performer tags in the “original scene details” section.
        searchItemEl.querySelectorAll("a[href^='/performers/']").forEach((a) => {
            const name = normalizeName(a.getAttribute("alt") || a.textContent);
            if (name) names.push(name);
        });

        return dedupePreserveOrder(names);
    }

    function findQueryInputInSearchItem(searchItemEl) {
        if (!searchItemEl) return null;

        // Match the specific Bootstrap input-group used for “Query”.
        const groups = Array.from(searchItemEl.querySelectorAll(".input-group"));
        for (const group of groups) {
            const labelEl = group.querySelector(".input-group-prepend .input-group-text");
            const label = normalizeName(labelEl && labelEl.textContent).toLowerCase();
            if (label !== "query") continue;

            const input = group.querySelector("input, textarea");
            if (!input) continue;
            if (!isProbablyVisible(input)) continue;
            return input;
        }

        return null;
    }

    function getValue(el) {
        if (!el) return "";
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return String(el.value || "");
        return "";
    }

    function setValueReactSafe(el, nextValue) {
        if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;

        const value = String(nextValue || "");
        const prev = getValue(el);
        if (prev === value) return;

        settingInputs.add(el);

        try {
            // React/Preact controlled inputs need the native setter.
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, "value");
            const setter = desc && typeof desc.set === "function" ? desc.set : null;

            if (setter) setter.call(el, value);
            else el.value = value;

            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        } finally {
            settingInputs.delete(el);
        }
    }

    function ensureQueryInputGuarded(inputEl) {
        if (!(inputEl instanceof HTMLInputElement) && !(inputEl instanceof HTMLTextAreaElement)) return;
        if (inputEl.getAttribute("data-stash-ptq-guard") === "1") return;
        inputEl.setAttribute("data-stash-ptq-guard", "1");

        inputEl.addEventListener(
            "input",
            () => {
                // Ignore synthetic events triggered by our own setter.
                if (settingInputs.has(inputEl)) return;
                const lastAuto = String(inputEl.getAttribute(LAST_AUTO_ATTR) || "");
                const current = getValue(inputEl);
                if (current !== lastAuto) {
                    inputEl.setAttribute(USER_EDITED_ATTR, "1");
                }
            },
            { passive: true }
        );
    }

    function isQueryInputCandidate(_inputEl) {
        // We now locate query inputs via their surrounding `.search-item` and
        // `.input-group-text` label, so this is not used.
        return false;
    }

    function computeQueryFromNames(names) {
        const normalized = (Array.isArray(names) ? names : [])
            .map((n) => normalizeName(n))
            .filter(Boolean);

        if (!normalized.length) return "";

        // “concatenated, lowercase” — join with spaces for practical searchability.
        return normalized.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function autofillOnce() {
        if (!isOnSceneTaggerPage()) return;

        for (const item of getSearchItems()) {
            const inputEl = findQueryInputInSearchItem(item);
            if (!inputEl) continue;

            ensureQueryInputGuarded(inputEl);

            // If the user has edited this field, never overwrite.
            if (inputEl.getAttribute(USER_EDITED_ATTR) === "1") continue;

            // Default behavior (original request): set query to performer names concatenated, lowercase.
            const performerNames = getPerformerNamesFromSearchItem(item);
            const query = computeQueryFromNames(performerNames);
            if (!query) continue;

            const lastAuto = String(inputEl.getAttribute(LAST_AUTO_ATTR) || "");
            const current = getValue(inputEl);
            const isFocused = document.activeElement === inputEl;

            // If focused and user is typing something different, don't fight them.
            if (isFocused && current !== lastAuto && current.trim() !== "") continue;

            // Overwrite if empty OR still equal to what we last wrote OR never wrote before.
            // This also fixes the case where the input starts with some prefilled value:
            // we'll replace it until the user edits.
            if (current === lastAuto || current.trim() === "" || !lastAuto) {
                setValueReactSafe(inputEl, query);
                inputEl.setAttribute(LAST_AUTO_ATTR, query);
            }
        }
    }

    let intervalId = null;
    let observer = null;

    function start() {
        if (intervalId) return;
        intervalId = window.setInterval(autofillOnce, POLL_MS);

        observer = new MutationObserver(() => {
            // Run soon after DOM changes (SPA, results load, etc.)
            autofillOnce();
        });

        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
        });

        autofillOnce();
    }

    start();
})();
