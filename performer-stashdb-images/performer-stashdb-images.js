(function () {
    "use strict";

    const INSTALL_FLAG = "__performer_stashdb_images_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const STYLE_ID = "performer-stashdb-images-style";
    const STASHDB_ENDPOINT = "https://stashdb.org/graphql";
    const STORE_KEY = "performer_stashdb_images_choice_v1";

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .psdi-wrap { position: relative; display: inline-block; }
            .psdi-overlay {
                position: absolute;
                inset: 0;
                opacity: 0;
                pointer-events: none;
                transition: opacity 140ms ease;
                z-index: 9999;
            }
            .psdi-wrap:hover .psdi-overlay { opacity: 1; pointer-events: auto; }
            .psdi-btn {
                pointer-events: auto;
                appearance: none;
                border: 1px solid rgba(255,255,255,0.22);
                background: rgba(0,0,0,0.55);
                color: rgba(255,255,255,0.95);
                border-radius: 10px;
                padding: 6px 10px;
                cursor: pointer;
                font-size: 12px;
                line-height: 1;
                backdrop-filter: blur(6px);
            }
            .psdi-btn:disabled { opacity: 0.35; cursor: default; }
            .psdi-btn.psdi-left,
            .psdi-btn.psdi-right {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
            }
            .psdi-btn.psdi-left { left: 8px; }
            .psdi-btn.psdi-right { right: 8px; }
            .psdi-pill {
                pointer-events: none;
                font-size: 12px;
                color: rgba(255,255,255,0.92);
                background: rgba(0,0,0,0.38);
                border: 1px solid rgba(255,255,255,0.16);
                padding: 6px 10px;
                position: absolute;
                left: 0px;
                right: 0px;
                bottom: 0px;
                display: block;
                width: auto;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .psdi-hint {
                pointer-events: none;
                font-size: 11px;
                opacity: 0.75;
                margin-left: 8px;
            }

            /* Plugin-owned lightbox */
            .psdi-modal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 999999;
                background: rgba(0,0,0,0.72);
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
            }
            .psdi-modal-backdrop[data-open='true'] { display: flex; }

            .psdi-modal {
                position: relative;
                max-width: min(1100px, calc(100vw - 36px));
                max-height: calc(100vh - 36px);
            }
            .psdi-modal .psdi-wrap { display: block; }

            .psdi-modal-img {
                display: block;
                max-width: 100%;
                max-height: calc(100vh - 36px);
                width: auto;
                height: auto;
                border-radius: 10px;
                box-shadow: 0 18px 80px rgba(0,0,0,0.55);
                background: rgba(255,255,255,0.06);
            }

            .psdi-btn.psdi-modal-close {
                position: absolute;
                top: -10px;
                right: -10px;
                width: 34px;
                height: 34px;
                border-radius: 999px;
                padding: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
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

    function safeJsonParse(s, fallback = null) {
        try {
            return JSON.parse(s);
        } catch {
            return fallback;
        }
    }

    function loadChoiceStore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            const parsed = raw ? safeJsonParse(raw, null) : null;
            if (!parsed || typeof parsed !== "object") return {};
            return parsed;
        } catch {
            return {};
        }
    }

    function saveChoiceStore(store) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store || {}));
        } catch {
            // ignore
        }
    }

    function loadSavedUrlForPerformer(performerId) {
        const id = String(performerId || "").trim();
        if (!id) return null;
        const store = loadChoiceStore();
        const entry = store?.[id];
        const url = typeof entry?.url === "string" ? entry.url : null;
        return url && url.trim() ? url.trim() : null;
    }

    function persistUrlForPerformer(performerId, stashdbId, url) {
        const id = String(performerId || "").trim();
        if (!id) return;
        const u = String(url || "").trim();
        if (!u) return;
        const store = loadChoiceStore();
        store[id] = {
            url: u,
            stashdbId: String(stashdbId || ""),
            updatedAt: Date.now(),
        };
        saveChoiceStore(store);
    }

    function getPerformerIdFromLocation() {
        const path = String(location.pathname || "");
        const m = path.match(/\/performers\/([^/]+)(?:\/|$)/i);
        return m ? (m[1] || null) : null;
    }

    function isPerformerPage() {
        return Boolean(getPerformerIdFromLocation());
    }

    function findBestHeroTarget() {
        const main = document.querySelector("main") || document.body;
        if (!main) return null;

        const candidates = [];

        // Prefer real <img> elements.
        main.querySelectorAll("img").forEach((el) => {
            if (!(el instanceof HTMLImageElement)) return;
            const rect = el.getBoundingClientRect();
            if (!rect || rect.width < 120 || rect.height < 120) return;
            if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return;
            const area = rect.width * rect.height;
            candidates.push({ el, kind: "img", area });
        });

        // Also consider background-image blocks (some Stash views do this).
        main.querySelectorAll("[style*='background-image']").forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            const bg = String(el.style.backgroundImage || "");
            if (!bg || bg === "none") return;
            const rect = el.getBoundingClientRect();
            if (!rect || rect.width < 140 || rect.height < 140) return;
            if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return;
            const area = rect.width * rect.height;
            candidates.push({ el, kind: "bg", area });
        });

        candidates.sort((a, b) => b.area - a.area);
        return candidates[0] || null;
    }

    function isProbablyVisible(el) {
        if (!el || !(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
    }

    function findBestLightboxTarget() {
        const candidates = [];
        const roots = Array.from(
            document.querySelectorAll(
                "[aria-modal='true'], [role='dialog'], .modal.show, .modal[style*='display'], .ReactModal__Overlay, .lightbox"
            )
        ).filter(isProbablyVisible);

        for (const root of roots) {
            const imgs = Array.from(root.querySelectorAll("img")).filter((img) => img instanceof HTMLImageElement);
            for (const img of imgs) {
                if (!isProbablyVisible(img)) continue;
                const rect = img.getBoundingClientRect();
                if (rect.width < 200 || rect.height < 200) continue;
                const area = rect.width * rect.height;
                candidates.push({ el: img, kind: "img", area });
            }
        }

        candidates.sort((a, b) => b.area - a.area);
        return candidates[0] || null;
    }

    function getCurrentUrlFromTarget(target) {
        if (!target) return null;
        if (target.kind === "img") {
            return String(target.el.currentSrc || target.el.src || "") || null;
        }
        const bg = String(target.el.style.backgroundImage || "");
        const m = bg.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
        return m ? (m[1] || null) : null;
    }

    function setUrlOnTarget(target, url) {
        if (!target) return;
        const u = String(url || "").trim();
        if (!u) return;
        if (target.kind === "img") {
            // Clear srcset so the browser/app doesn't prefer a stale candidate.
            try {
                target.el.removeAttribute("srcset");
                target.el.srcset = "";
            } catch {
                // ignore
            }

            target.el.src = u;

            // Some lightbox implementations read these instead of `src`.
            try {
                if (target.el.hasAttribute("data-src")) target.el.setAttribute("data-src", u);
                if (target.el.hasAttribute("data-original")) target.el.setAttribute("data-original", u);
                if (target.el.hasAttribute("data-full")) target.el.setAttribute("data-full", u);
                if (target.el.hasAttribute("data-full-src")) target.el.setAttribute("data-full-src", u);
            } catch {
                // ignore
            }
            return;
        }
        target.el.style.backgroundImage = `url("${u.replaceAll('"', "\\\"")}")`;
        target.el.style.backgroundSize = target.el.style.backgroundSize || "cover";
        target.el.style.backgroundPosition = target.el.style.backgroundPosition || "center";
    }

    function syncClickSourceForUrl(targetEl, url) {
        const u = String(url || "").trim();
        if (!u) return;
        if (!targetEl || !(targetEl instanceof Element)) return;

        // Common pattern: <a href="full.jpg"><img ... /></a>
        const a = targetEl.closest("a[href]");
        if (a) {
            try {
                a.setAttribute("href", u);
            } catch {
                // ignore
            }
        }

        // Some lightboxes key off data-* on the clickable element.
        const el = a || targetEl;
        try {
            if (el.hasAttribute("data-src")) el.setAttribute("data-src", u);
            if (el.hasAttribute("data-original")) el.setAttribute("data-original", u);
            if (el.hasAttribute("data-full")) el.setAttribute("data-full", u);
            if (el.hasAttribute("data-full-src")) el.setAttribute("data-full-src", u);
        } catch {
            // ignore
        }
    }

    async function fetchPerformerBasics(performerId) {
        const id = String(performerId || "").trim();
        if (!id) return null;

        const roots = ["findPerformer", "performer"];
        const fieldSets = [
            "id name stash_ids { endpoint stash_id }",
            "id name stash_ids { endpoint stash_id } url", // some schemas might add url
            "id name",
        ];

        for (const root of roots) {
            for (const fields of fieldSets) {
                const query = `
                    query PSDIFindPerformer($id: ID!) {
                        ${root}(id: $id) {
                            ${fields}
                        }
                    }
                `;
                try {
                    const data = await gql(query, { id });
                    const p = data?.[root];
                    if (p?.id) {
                        return {
                            id: String(p.id),
                            name: String(p.name || ""),
                            stash_ids: Array.isArray(p.stash_ids) ? p.stash_ids : [],
                        };
                    }
                } catch (err) {
                    const msg = String(err?.message || err);
                    const unknownField = /(Cannot query field|Unknown argument|Unknown field|Cannot query)/i.test(msg);
                    if (!unknownField) throw err;
                }
            }
        }

        return { id, name: "", stash_ids: [] };
    }

    function getStashdbIdFromStashIds(stashIds) {
        const arr = Array.isArray(stashIds) ? stashIds : [];
        for (const entry of arr) {
            const endpoint = String(entry?.endpoint || "").trim();
            const stashId = String(entry?.stash_id || "").trim();
            if (!stashId) continue;
            if (endpoint.includes("stashdb.org")) return stashId;
        }
        return null;
    }

    async function scrapeSinglePerformerByName(name) {
        const q = String(name || "").trim();
        if (!q) return [];

        const query = `
            query ScrapeSinglePerformer($source: ScraperSourceInput!, $input: ScrapeSinglePerformerInput!) {
                scrapeSinglePerformer(source: $source, input: $input) {
                    name
                    images
                    remote_site_id
                }
            }
        `;

        const variables = {
            source: { stash_box_endpoint: STASHDB_ENDPOINT },
            input: { query: q },
        };

        const data = await gql(query, variables);
        const results = data?.scrapeSinglePerformer;
        if (!results) return [];
        return Array.isArray(results) ? results : [results];
    }

    function uniqUrls(urls) {
        const out = [];
        const seen = new Set();
        for (const u of Array.isArray(urls) ? urls : []) {
            const s = String(u || "").trim();
            if (!s) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            out.push(s);
        }
        return out;
    }

    function createOverlay({ onPrev, onNext }) {
        const overlay = document.createElement("div");
        overlay.className = "psdi-overlay";

        const left = document.createElement("button");
        left.type = "button";
        left.className = "psdi-btn psdi-left";
        left.textContent = "←";
        left.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onPrev();
        });

        const right = document.createElement("button");
        right.type = "button";
        right.className = "psdi-btn psdi-right";
        right.textContent = "→";
        right.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onNext();
        });

        const pill = document.createElement("div");
        pill.className = "psdi-pill";
        pill.innerHTML = `<span class="psdi-hint"></span>`;

        overlay.appendChild(left);
        overlay.appendChild(right);
        overlay.appendChild(pill);

        overlay.__psdi = { left, right, pill };
        return overlay;
    }

    function wrapTargetElement(targetEl) {
        if (!targetEl || !(targetEl instanceof Element)) return null;
        const parent = targetEl.parentElement;
        if (!parent) return null;

        // Don’t double-wrap.
        if (parent.classList.contains("psdi-wrap")) return parent;

        const wrap = document.createElement("div");
        wrap.className = "psdi-wrap";

        // Preserve layout as best we can.
        const computed = window.getComputedStyle(targetEl);
        if (computed.display === "block") wrap.style.display = "block";
        else wrap.style.display = "inline-block";

        parent.insertBefore(wrap, targetEl);
        wrap.appendChild(targetEl);
        return wrap;
    }

    let current = {
        performerId: null,
        stashdbId: null,
        images: [],
        index: 0,
        heroTarget: null,
        heroWrapEl: null,
        heroOverlayEl: null,

        heroClickHooked: false,

        lightboxTarget: null,
        lightboxWrapEl: null,
        lightboxOverlayEl: null,

        modalBackdropEl: null,
        modalImgEl: null,
        modalWrapEl: null,
        modalCloseBtn: null,

        token: 0,
    };

    function teardownUi() {
        try {
            if (current.heroOverlayEl) current.heroOverlayEl.remove();
        } catch {
            // ignore
        }

        try {
            if (current.lightboxOverlayEl) current.lightboxOverlayEl.remove();
        } catch {
            // ignore
        }

        current.heroOverlayEl = null;
        current.heroWrapEl = null;
        current.heroTarget = null;
        current.heroClickHooked = false;

        current.lightboxOverlayEl = null;
        current.lightboxWrapEl = null;
        current.lightboxTarget = null;

        current.images = [];
        current.index = 0;
        current.stashdbId = null;
        current.performerId = null;
    }

    function closeModal() {
        if (!current.modalBackdropEl) return;
        current.modalBackdropEl.dataset.open = "false";
        teardownLightboxUi();
    }

    function ensureModal() {
        if (current.modalBackdropEl && current.modalImgEl && current.modalWrapEl) return;
        ensureStyles();

        const backdrop = document.createElement("div");
        backdrop.className = "psdi-modal-backdrop";
        backdrop.dataset.open = "false";
        backdrop.setAttribute("data-psdi-modal", "1");

        const modal = document.createElement("div");
        modal.className = "psdi-modal";

        const wrap = document.createElement("div");
        wrap.className = "psdi-wrap";

        const img = document.createElement("img");
        img.className = "psdi-modal-img";
        img.alt = "";
        img.draggable = false;

        const btnClose = document.createElement("button");
        btnClose.type = "button";
        btnClose.className = "psdi-btn psdi-modal-close";
        btnClose.textContent = "×";
        btnClose.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });

        backdrop.addEventListener("mousedown", (e) => {
            if (e.target === backdrop) closeModal();
        });

        wrap.appendChild(img);
        modal.appendChild(wrap);
        modal.appendChild(btnClose);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        current.modalBackdropEl = backdrop;
        current.modalImgEl = img;
        current.modalWrapEl = wrap;
        current.modalCloseBtn = btnClose;
    }

    function openModal() {
        if (!current.images.length) return;
        ensureModal();
        current.modalBackdropEl.dataset.open = "true";

        // Attach the same overlay inside our modal.
        teardownLightboxUi();
        current.lightboxTarget = { el: current.modalImgEl, kind: "img", area: 0 };

        const overlay = createOverlay({
            onPrev: () => showIndex(current.index - 1),
            onNext: () => showIndex(current.index + 1),
        });
        current.lightboxOverlayEl = overlay;
        current.modalWrapEl.appendChild(overlay);

        applyCurrentIndexToTargets();
        updateOverlayLabels();
    }

    function updateOverlayLabelFor(overlayEl) {
        if (!overlayEl || !overlayEl.__psdi) return;
        const { left, right, pill } = overlayEl.__psdi;
        const total = current.images.length;
        const idx = total ? current.index + 1 : 0;
        left.disabled = total <= 1;
        right.disabled = total <= 1;
        pill.innerHTML = `<span class="psdi-hint">${escapeHtml(String(idx))}/${escapeHtml(String(total))}</span>`;
    }

    function updateOverlayLabels() {
        updateOverlayLabelFor(current.heroOverlayEl);
        updateOverlayLabelFor(current.lightboxOverlayEl);
    }

    function applyCurrentIndexToTargets() {
        const total = current.images.length;
        if (!total) return;
        const url = current.images[current.index];
        if (current.heroTarget) {
            setUrlOnTarget(current.heroTarget, url);
            syncClickSourceForUrl(current.heroTarget.el, url);
        }
        if (current.lightboxTarget) {
            setUrlOnTarget(current.lightboxTarget, url);
            syncClickSourceForUrl(current.lightboxTarget.el, url);
        }
    }

    function showIndex(nextIndex) {
        const total = current.images.length;
        if (!total) return;
        const i = ((nextIndex % total) + total) % total;
        current.index = i;
        persistUrlForPerformer(current.performerId, current.stashdbId, current.images[i]);
        applyCurrentIndexToTargets();
        updateOverlayLabels();
    }

    function handleKeydown(e) {
        if (!current.images.length) return;
        // Only on performer pages.
        if (!isPerformerPage()) return;

        if (e.key === "Escape" && current.modalBackdropEl?.dataset?.open === "true") {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
            return;
        }

        if (e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            showIndex(current.index - 1);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            showIndex(current.index + 1);
        }
    }

    async function installOrRefresh() {
        const performerId = getPerformerIdFromLocation();
        if (!performerId) {
            teardownUi();
            return;
        }

        // If already installed for this performer, just ensure UI is attached.
        if (current.performerId === performerId && current.heroOverlayEl && current.heroTarget) return;

        teardownUi();
        ensureStyles();

        const token = ++current.token;

        // Find a hero target (may not exist yet due to SPA render).
        let target = null;
        let attempts = 0;
        while (attempts++ < 25) {
            const found = findBestHeroTarget();
            if (found) {
                target = found;
                break;
            }
            await new Promise((r) => setTimeout(r, 120));
            if (token !== current.token) return;
        }

        if (!target) return;

        const basics = await fetchPerformerBasics(performerId);
        if (token !== current.token) return;

        const stashdbId = getStashdbIdFromStashIds(basics?.stash_ids);
        if (!stashdbId) return;

        const results = await scrapeSinglePerformerByName(basics?.name);
        if (token !== current.token) return;

        const match = results.find((r) => String(r?.remote_site_id || "") === String(stashdbId));
        const images = uniqUrls(match?.images);
        if (images.length <= 1) return;

        current.performerId = performerId;
        current.stashdbId = stashdbId;
        current.images = images;
        current.heroTarget = target;

        const wrapEl = wrapTargetElement(target.el);
        if (!wrapEl) return;
        current.heroWrapEl = wrapEl;

        const overlay = createOverlay({
            onPrev: () => showIndex(current.index - 1),
            onNext: () => showIndex(current.index + 1),
        });
        current.heroOverlayEl = overlay;
        wrapEl.appendChild(overlay);

        // Intercept clicks on the hero image and open our modal so it always
        // shows the *currently selected* URL (Stash's lightbox can be driven by
        // React state and ignore our DOM src/href updates).
        try {
            if (!current.heroClickHooked) {
                current.heroClickHooked = true;
                target.el.addEventListener(
                    "click",
                    (e) => {
                        if (!current.images.length) return;
                        // Allow user to open in new tab/window.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        e.stopPropagation();
                        openModal();
                    },
                    true
                );
            }
        } catch {
            // ignore
        }

        // Initial selection: persisted URL > current URL > index 0
        const savedUrl = loadSavedUrlForPerformer(performerId);
        const savedIdx = savedUrl ? images.findIndex((u) => u === savedUrl) : -1;
        const currentUrl = getCurrentUrlFromTarget(target);
        const currentIdx = currentUrl ? images.findIndex((u) => u === currentUrl) : -1;

        current.index = savedIdx >= 0 ? savedIdx : currentIdx >= 0 ? currentIdx : 0;
        showIndex(current.index);

        // Attempt to attach/sync external lightbox if it already exists.
        refreshLightbox();
    }

    function teardownLightboxUi() {
        try {
            if (current.lightboxOverlayEl) current.lightboxOverlayEl.remove();
        } catch {
            // ignore
        }
        current.lightboxOverlayEl = null;
        current.lightboxWrapEl = null;
        current.lightboxTarget = null;
    }

    function refreshLightbox() {
        // If our plugin modal is open, we own the lightbox experience.
        if (current.modalBackdropEl?.dataset?.open === "true") return;
        if (!current.images.length || !current.performerId) {
            teardownLightboxUi();
            return;
        }

        const lb = findBestLightboxTarget();
        if (!lb) {
            teardownLightboxUi();
            return;
        }

        // Already attached to this element.
        if (current.lightboxTarget?.el === lb.el && current.lightboxOverlayEl) {
            applyCurrentIndexToTargets();
            updateOverlayLabels();
            return;
        }

        teardownLightboxUi();

        current.lightboxTarget = lb;

        const wrapEl = wrapTargetElement(lb.el);
        if (!wrapEl) return;
        current.lightboxWrapEl = wrapEl;

        const overlay = createOverlay({
            onPrev: () => showIndex(current.index - 1),
            onNext: () => showIndex(current.index + 1),
        });
        current.lightboxOverlayEl = overlay;
        wrapEl.appendChild(overlay);

        applyCurrentIndexToTargets();
        updateOverlayLabels();
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
            setTimeout(installOrRefresh, 0);
        });
    }

    document.addEventListener("keydown", handleKeydown, true);

    // Observe DOM changes to catch lightbox open/close and keep it in sync.
    let lightboxObserver = null;
    let lightboxTick = 0;
    function installLightboxObserver() {
        if (lightboxObserver) return;
        lightboxObserver = new MutationObserver(() => {
            if (lightboxTick) return;
            lightboxTick = window.setTimeout(() => {
                lightboxTick = 0;
                refreshLightbox();
            }, 50);
        });
        if (document.body) lightboxObserver.observe(document.body, { subtree: true, childList: true });
    }

    installLocationHooks();
    installLightboxObserver();
    installOrRefresh();
})();
