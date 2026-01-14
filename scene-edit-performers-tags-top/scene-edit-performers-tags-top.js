(function () {
    const INSTALL_FLAG = "__stash_scene_edit_performers_tags_top_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    let activeAttemptToken = 0;
    let lastSceneKey = null;

    let observer = null;
    let rafScheduled = false;

    const CONTROL_SELECTOR = [
        "input",
        "textarea",
        "select",
        "[role='combobox']",
        "[aria-haspopup='listbox']",
        ".react-select__control",
        "[class*='Select__control']",
        "[class*='react-select']",
    ].join(",");

    function normalizeText(text) {
        return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function getSceneKeyFromLocation() {
        const path = String(location.pathname || "");
        const match = path.match(/\/scenes\/(.+?)(?:\/|$)/i);
        if (!match) return null;
        return match[1] || null;
    }

    function isProbablyVisible(el) {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
    }

    function isReasonableFieldContainer(el) {
        if (!(el instanceof Element)) return false;
        const tag = el.tagName.toLowerCase();
        if (tag === "html" || tag === "body") return false;

        const className = String(el.className || "").toLowerCase();
        const hasHintClass =
            className.includes("form-group") ||
            className.includes("formgroup") ||
            className.includes("form-row") ||
            className.includes("formrow") ||
            className.includes("row") ||
            className.includes("field") ||
            className.includes("formfield");

        const controls = el.querySelectorAll(CONTROL_SELECTOR);
        if (controls.length === 0) return false;

        // Avoid selecting the entire form/container.
        if (controls.length <= 3) return true;
        if (hasHintClass && controls.length <= 6) return true;
        return false;
    }

    function findNearestFieldContainer(fromEl) {
        let el = fromEl;
        for (let depth = 0; el && depth < 14; depth++) {
            if (isReasonableFieldContainer(el) && isProbablyVisible(el)) return el;
            if (el.tagName && el.tagName.toLowerCase() === "form") break;
            el = el.parentElement;
        }

        // Fallback: closest common patterns.
        if (fromEl instanceof Element) {
            const closest = fromEl.closest(
                ".form-group, .form-row, .row, [class*='form-group'], [class*='FormGroup'], [class*='formRow'], [class*='FormRow']"
            );
            if (closest && isProbablyVisible(closest)) return closest;
        }

        return null;
    }

    function findLabelElements() {
        const selectors = [
            "label",
            ".form-label",
            ".col-form-label",
            "[class*='form-label']",
            "[class*='FormLabel']",
        ];
        const seen = new Set();
        const out = [];
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
                if (!seen.has(el)) {
                    seen.add(el);
                    out.push(el);
                }
            });
        }
        return out;
    }

    function findFieldContainerByLabelText(exactLabelLower) {
        const labels = findLabelElements();
        for (const labelEl of labels) {
            if (!isProbablyVisible(labelEl)) continue;
            const txt = normalizeText(labelEl.textContent);
            if (txt !== exactLabelLower) continue;
            const container = findNearestFieldContainer(labelEl);
            if (container) return container;
        }
        return null;
    }

    function isBefore(a, b) {
        if (!(a instanceof Node) || !(b instanceof Node)) return false;
        const pos = a.compareDocumentPosition(b);
        return Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    function moveBefore(target, reference) {
        if (!(target instanceof Element) || !(reference instanceof Element)) return false;
        const parent = reference.parentElement;
        if (!parent) return false;
        if (target === reference) return false;

        // If already before, nothing to do.
        if (isBefore(target, reference)) return false;

        parent.insertBefore(target, reference);
        return true;
    }

    function ensurePerformersAndTagsAboveTitle() {
        const titleRow = findFieldContainerByLabelText("title");
        if (!titleRow) return false;

        const performersRow = findFieldContainerByLabelText("performers");
        const tagsRow = findFieldContainerByLabelText("tags");
        if (!performersRow && !tagsRow) return false;

        // Insert in desired order: Performers, Tags, Title
        let changed = false;
        if (performersRow) changed = moveBefore(performersRow, titleRow) || changed;
        if (tagsRow) changed = moveBefore(tagsRow, titleRow) || changed;
        return changed;
    }

    function scheduleEnsure() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            // Only run when on a scene page.
            if (!getSceneKeyFromLocation()) return;
            ensurePerformersAndTagsAboveTitle();
        });
    }

    function installOrRefreshObserverForScene() {
        const sceneKey = getSceneKeyFromLocation();
        if (!sceneKey) {
            if (observer) observer.disconnect();
            observer = null;
            return;
        }
        if (sceneKey === lastSceneKey) {
            // Still re-run on the same scene, but only when edit UI re-renders.
            // We’ll rely on a persistent mutation observer.
        } else {
            lastSceneKey = sceneKey;
        }

        const attemptToken = ++activeAttemptToken;

        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            if (attemptToken !== activeAttemptToken) return;
            // Debounce into the next animation frame to avoid thrashing on React renders.
            scheduleEnsure();
        });

        if (document.body) observer.observe(document.body, { subtree: true, childList: true, attributes: true });

        // Initial positioning (and one extra frame for React's initial render pass).
        ensurePerformersAndTagsAboveTitle();
        scheduleEnsure();
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
            setTimeout(installOrRefreshObserverForScene, 0);
        });
    }

    installLocationHooks();
    installOrRefreshObserverForScene();
})();
