(function () {
    const INSTALL_FLAG = "__scene_edit_pinned_fields_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    let activeAttemptToken = 0;
    let lastSceneKey = null;

    const STORE_KEY = "scene_edit_pins";
    const STYLE_ID = "scene-edit-pins-style";

    // Per-scene stable ordering so unpinning returns to normal order.
    const rankByScene = new Map(); // sceneKey -> Map(fieldKey -> rank)

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

    function getLabelBaseText(labelEl) {
        if (!(labelEl instanceof Element)) return "";
        // Avoid including previously injected pin icons in the computed key.
        // We clone so we can safely remove our own buttons before reading text.
        const clone = labelEl.cloneNode(true);
        clone.querySelectorAll("button.seppt-pin-btn").forEach((b) => b.remove());
        const raw = String(clone.textContent || "").replace(/📌/g, " ");
        return normalizeText(raw);
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .seppt-pin-btn {
                margin-left: 6px;
                padding: 0 4px;
                border: 0;
                background: transparent;
                cursor: pointer;
                font-size: 0.9em;
                line-height: 1;
                opacity: 0.55;
            }
            .seppt-pin-btn:hover { opacity: 0.95; }
            .seppt-pin-btn[data-pinned="1"] { opacity: 1; }

            /* Help labels keep alignment when we inject a button */
            label.seppt-label-with-pin,
            .form-label.seppt-label-with-pin,
            .col-form-label.seppt-label-with-pin {
                display: inline-flex;
                align-items: center;
                gap: 0;
            }
        `;
        document.head ? document.head.appendChild(style) : document.body.appendChild(style);
    }

    function safeJsonParse(s) {
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    }

    function loadStore() {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = raw ? safeJsonParse(raw) : null;
        const pinned = parsed && typeof parsed === "object" && parsed.pinned && typeof parsed.pinned === "object" ? parsed.pinned : {};
        const initialized = Boolean(parsed && typeof parsed === "object" && parsed.initialized === true);
        return {
            initialized,
            pinned,
        };
    }

    function saveStore(store) {
        // Once we've saved anything, consider the store initialized so we don't
        // re-apply default pins when the user unpins everything.
        if (store && typeof store === "object") store.initialized = true;
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
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

    function computeFieldKey(labelEl) {
        if (!(labelEl instanceof Element)) return null;
        const labelText = getLabelBaseText(labelEl);
        if (!labelText) return null;

        const forId = String(labelEl.getAttribute("for") || "").trim();
        let controlName = "";
        if (forId) {
            const control = document.getElementById(forId);
            if (control instanceof Element) {
                controlName = String(control.getAttribute("name") || control.getAttribute("id") || "").trim();
            }
        }

        // Prefer a stable, readable key; include controlName/forId when available to avoid collisions.
        const suffix = controlName || forId;
        return suffix ? `${labelText}|${suffix}` : labelText;
    }

    function ensurePinButton(labelEl, fieldKey) {
        if (!(labelEl instanceof Element)) return;
        if (!fieldKey) return;

        ensureStyles();

        if (!labelEl.classList.contains("seppt-label-with-pin")) {
            labelEl.classList.add("seppt-label-with-pin");
        }

        // Deduplicate: keep at most one pin button per label.
        const existingPins = Array.from(labelEl.querySelectorAll("button.seppt-pin-btn"));
        if (existingPins.length) {
            const keep = existingPins[0];
            for (let i = 1; i < existingPins.length; i++) existingPins[i].remove();
            keep.dataset.fieldKey = fieldKey;
            keep.dataset.sepptPin = "1";
            return;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seppt-pin-btn";
        btn.textContent = "📌";
        btn.title = "Pin this field to the top";
        btn.setAttribute("aria-label", "Pin this field to the top");
        btn.dataset.fieldKey = fieldKey;
        btn.dataset.pinned = "0";
        btn.dataset.sepptPin = "1";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const store = loadStore();
            const isPinned = Boolean(store.pinned[fieldKey]);
            if (isPinned) delete store.pinned[fieldKey];
            else store.pinned[fieldKey] = true;
            saveStore(store);

            scheduleEnsure();
        });

        labelEl.appendChild(btn);
    }

    function discoverSiblingFields(rootParent) {
        if (!(rootParent instanceof Element)) return [];

        const sceneKey = getSceneKeyFromLocation();
        if (!sceneKey) return [];
        if (!rankByScene.has(sceneKey)) rankByScene.set(sceneKey, new Map());
        const rankMap = rankByScene.get(sceneKey);

        const labels = findLabelElements().filter((l) => rootParent.contains(l));
        const fields = [];

        for (const labelEl of labels) {
            if (!isProbablyVisible(labelEl)) continue;
            const container = findNearestFieldContainer(labelEl);
            if (!container) continue;
            if (container.parentElement !== rootParent) continue;

            const key = computeFieldKey(labelEl);
            if (!key) continue;

            if (!rankMap.has(key)) {
                rankMap.set(key, rankMap.size + 1);
            }
            const rank = rankMap.get(key);

            fields.push({ labelEl, container, key, rank });
        }

        // De-dupe by key (if multiple labels map to same container/key).
        const seen = new Set();
        const out = [];
        for (const f of fields) {
            if (seen.has(f.key)) continue;
            seen.add(f.key);
            out.push(f);
        }

        return out;
    }

    function getFieldRootParent() {
        // Prefer the Title row's parent, since it's a reliable anchor on the edit page.
        const titleRow = findFieldContainerByLabelText("title");
        if (titleRow && titleRow.parentElement) return titleRow.parentElement;

        // Fallback: parent of the first visible field container we can find.
        const labels = findLabelElements();
        for (const labelEl of labels) {
            if (!isProbablyVisible(labelEl)) continue;
            const container = findNearestFieldContainer(labelEl);
            if (container && container.parentElement && isProbablyVisible(container)) {
                return container.parentElement;
            }
        }

        return null;
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

    function applyPinsAndReorder() {
        const sceneKey = getSceneKeyFromLocation();
        if (!sceneKey) return;

        const rootParent = getFieldRootParent();
        if (!rootParent) return;

        const store = loadStore();
        const fields = discoverSiblingFields(rootParent);
        if (!fields.length) return;

        // Add pins + reflect pin state in the UI.
        for (const f of fields) {
            ensurePinButton(f.labelEl, f.key);
            const btn = Array.from(f.labelEl.querySelectorAll("button.seppt-pin-btn")).find((b) => b?.dataset?.fieldKey === f.key);
            if (btn) btn.dataset.pinned = store.pinned[f.key] ? "1" : "0";
        }

        // Back-compat/default: if the user has never pinned anything, keep the old behavior
        // by pinning Performers + Tags by default.
        if (!store.initialized) {
            for (const f of fields) {
                const label = getLabelBaseText(f.labelEl);
                if (label === "performers" || label === "tags") {
                    store.pinned[f.key] = true;
                }
            }
            saveStore(store);
        }

        const pinnedSet = new Set(Object.keys(store.pinned || {}).filter((k) => store.pinned[k]));

        // Sort: pinned first, then stable rank.
        const sorted = fields
            .map((f) => ({ ...f, pinned: pinnedSet.has(f.key) }))
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return (a.rank || 0) - (b.rank || 0);
            });

        // Insert safely: once you append nodes to a fragment, they leave the DOM.
        // Using `firstField` as the reference after that will throw.
        const firstField = fields[0]?.container;
        if (!(firstField instanceof Element)) return;
        if (firstField.parentElement !== rootParent) return;

        const marker = document.createComment("seppt-pin-marker");
        rootParent.insertBefore(marker, firstField);

        const frag = document.createDocumentFragment();
        try {
            for (const f of sorted) {
                // Skip if React has swapped this node out.
                if (!(f.container instanceof Element)) continue;
                if (f.container.parentElement !== rootParent) continue;
                frag.appendChild(f.container);
            }
            rootParent.insertBefore(frag, marker);
        } finally {
            // Ensure we never leave the marker behind.
            if (marker.parentNode === rootParent) rootParent.removeChild(marker);
        }
    }

    function scheduleEnsure() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            // Only run when on a scene page.
            if (!getSceneKeyFromLocation()) return;
            applyPinsAndReorder();
        });
    }

    function installOrRefreshObserverForScene() {
        const sceneKey = getSceneKeyFromLocation();
        if (!sceneKey) {
            if (observer) observer.disconnect();
            observer = null;
            return;
        }
        if (sceneKey !== lastSceneKey) {
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
        applyPinsAndReorder();
        scheduleEnsure();
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
            setTimeout(installOrRefreshObserverForScene, 0);
        });
    }

    installLocationHooks();
    installOrRefreshObserverForScene();
})();
