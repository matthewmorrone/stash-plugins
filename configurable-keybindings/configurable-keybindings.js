(function () {
    "use strict";

    const INSTALL_FLAG = "__configurable_keybindings_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    const STORE_KEY = "configurable_keybindings_v1";

    const STYLE_ID = "configurable-keybindings-style";

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function isEditableTarget(target) {
        if (!(target instanceof Element)) return false;
        if (target.closest("input, textarea, select")) return true;
        if (target.closest("[contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']")) return true;
        if (target.closest(".CodeMirror, .cm-editor")) return true;
        return false;
    }

    function getSceneIdFromLocation() {
        const path = String(location.pathname || "");
        const match = path.match(/\/scenes\/([^/]+)(?:\/|$)/i);
        return match ? (match[1] || null) : null;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .sckb-toast {
                position: fixed;
                left: 50%;
                bottom: 20px;
                transform: translateX(-50%);
                z-index: 999999;
                background: rgba(0,0,0,0.78);
                color: #fff;
                padding: 8px 12px;
                border-radius: 10px;
                font-size: 12px;
                font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                border: 1px solid rgba(255,255,255,0.18);
                backdrop-filter: blur(6px);
                max-width: 80vw;
                opacity: 0;
                transition: opacity 120ms ease;
                pointer-events: none;
            }
            .sckb-toast[data-open='true'] { opacity: 1; }

            .sckb-modal-overlay {
                position: fixed;
                inset: 0;
                z-index: 999998;
                background: rgba(0,0,0,0.55);
                display: none;
            }
            .sckb-modal-overlay[data-open='true'] { display: block; }

            .sckb-modal {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                width: min(860px, calc(100vw - 24px));
                max-height: calc(100vh - 24px);
                overflow: auto;
                background: #14161a;
                color: #e9eef5;
                border-radius: 14px;
                border: 1px solid rgba(255,255,255,0.12);
                box-shadow: 0 18px 80px rgba(0,0,0,0.55);
                font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            }

            .sckb-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 14px;
                border-bottom: 1px solid rgba(255,255,255,0.10);
            }
            .sckb-title {
                font-size: 14px;
                font-weight: 650;
                letter-spacing: 0.2px;
            }
            .sckb-sub {
                font-size: 12px;
                opacity: 0.8;
                margin-top: 2px;
            }
            .sckb-close {
                appearance: none;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: #e9eef5;
                border-radius: 10px;
                padding: 6px 10px;
                cursor: pointer;
            }

            .sckb-body { padding: 12px 14px; }

            .sckb-row {
                display: grid;
                grid-template-columns: 220px 1fr auto;
                gap: 10px;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .sckb-row:last-child { border-bottom: 0; }
            .sckb-label { font-size: 12px; opacity: 0.95; }
            .sckb-desc { font-size: 11px; opacity: 0.7; margin-top: 2px; }

            .sckb-input {
                width: 100%;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: #e9eef5;
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 12px;
            }

            .sckb-btn {
                appearance: none;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: #e9eef5;
                border-radius: 10px;
                padding: 6px 10px;
                cursor: pointer;
                font-size: 12px;
                margin-left: 6px;
            }

            .sckb-footer {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
                padding: 12px 14px;
                border-top: 1px solid rgba(255,255,255,0.10);
            }

            .sckb-kv {
                display: grid;
                grid-template-columns: 220px 1fr;
                gap: 10px;
                margin-bottom: 10px;
                align-items: center;
            }
            .sckb-kv label { font-size: 12px; opacity: 0.9; }
            .sckb-help {
                font-size: 12px;
                opacity: 0.75;
                margin-bottom: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    function createEl(tag, { className, text, attrs } = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = String(text);
        if (attrs && typeof attrs === "object") {
            Object.entries(attrs).forEach(([k, v]) => {
                if (v == null) return;
                el.setAttribute(k, String(v));
            });
        }
        return el;
    }

    function defaultStore() {
        return {
            version: 1,
            frameStepSeconds: 1 / 30,
            seekSeconds: 5,
            rateStep: 0.25,
            bindings: {
                openSettings: "Ctrl+Shift+KeyK",
                playPause: "Space",
                seekBack: "ArrowLeft",
                seekForward: "ArrowRight",
                frameBack: "Comma",
                frameForward: "Period",
                rateDown: "BracketLeft",
                rateUp: "BracketRight",
            },
        };
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return defaultStore();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return defaultStore();
            return { ...defaultStore(), ...parsed, bindings: { ...defaultStore().bindings, ...(parsed.bindings || {}) } };
        } catch {
            return defaultStore();
        }
    }

    function saveStore(store) {
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
    }

    function normalizeComboFromEvent(e) {
        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Meta");

        const code = String(e.code || "");
        if (!code) return null;
        parts.push(code);
        return parts.join("+");
    }

    function getActiveVideo() {
        const candidates = Array.from(document.querySelectorAll("video")).filter((v) => v instanceof HTMLVideoElement);
        if (!candidates.length) return null;

        const fs = document.fullscreenElement;
        if (fs) {
            const inFs = fs.querySelector("video");
            if (inFs instanceof HTMLVideoElement) return inFs;
        }

        // Prefer a visible, ready video with largest on-screen area.
        let best = null;
        let bestScore = -1;
        for (const v of candidates) {
            const rect = v.getBoundingClientRect();
            const visible = rect.width > 50 && rect.height > 50 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
            if (!visible) continue;
            const area = rect.width * rect.height;
            const readyBonus = v.readyState > 0 ? 1.2 : 1;
            const score = area * readyBonus;
            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }

        return best || candidates[0] || null;
    }

    let toastEl = null;
    let toastTimer = 0;

    function showToast(msg, ms = 900) {
        ensureStyles();
        if (!toastEl) {
            toastEl = createEl("div", { className: "sckb-toast" });
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = String(msg || "");
        toastEl.dataset.open = "true";
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            if (!toastEl) return;
            toastEl.dataset.open = "false";
        }, ms);
    }

    async function stepBySeconds(deltaSeconds, { pauseAfter = false } = {}) {
        const video = getActiveVideo();
        if (!video) {
            showToast("No video element found");
            return;
        }

        const dur = Number.isFinite(video.duration) ? video.duration : null;
        const next = dur != null ? clamp(video.currentTime + deltaSeconds, 0, Math.max(0, dur - 0.001)) : Math.max(0, video.currentTime + deltaSeconds);
        const wasPaused = video.paused;

        if (pauseAfter && !video.paused) {
            try {
                video.pause();
            } catch {
                // ignore
            }
        }

        try {
            video.currentTime = next;
        } catch {
            // ignore
        }

        if (pauseAfter || wasPaused) {
            try {
                video.pause();
            } catch {
                // ignore
            }
        }
    }

    function togglePlayPause() {
        const video = getActiveVideo();
        if (!video) {
            showToast("No video element found");
            return;
        }
        if (video.paused) {
            video.play?.().catch(() => {
                // ignore
            });
        } else {
            video.pause?.();
        }
    }

    function adjustPlaybackRate(delta) {
        const video = getActiveVideo();
        if (!video) {
            showToast("No video element found");
            return;
        }
        const next = clamp((video.playbackRate || 1) + delta, 0.25, 4);
        video.playbackRate = next;
        showToast(`Rate: ${next.toFixed(2)}x`);
    }

    const ACTIONS = {
        openSettings: {
            label: "Open keybinding settings",
            desc: "Opens this dialog",
            run: () => openModal(),
        },
        playPause: {
            label: "Play / Pause",
            desc: "Toggles playback",
            run: () => togglePlayPause(),
        },
        seekBack: {
            label: "Seek backward",
            desc: "Seeks back by the configured seconds",
            run: () => {
                const s = loadStore();
                stepBySeconds(-Number(s.seekSeconds || 5), { pauseAfter: false });
            },
        },
        seekForward: {
            label: "Seek forward",
            desc: "Seeks forward by the configured seconds",
            run: () => {
                const s = loadStore();
                stepBySeconds(Number(s.seekSeconds || 5), { pauseAfter: false });
            },
        },
        frameBack: {
            label: "Frame step backward",
            desc: "Approximates -1 frame by stepping time; keeps paused",
            run: () => {
                const s = loadStore();
                const step = Number(s.frameStepSeconds || (1 / 30));
                stepBySeconds(-step, { pauseAfter: true });
            },
        },
        frameForward: {
            label: "Frame step forward",
            desc: "Approximates +1 frame by stepping time; keeps paused",
            run: () => {
                const s = loadStore();
                const step = Number(s.frameStepSeconds || (1 / 30));
                stepBySeconds(step, { pauseAfter: true });
            },
        },
        rateDown: {
            label: "Playback rate down",
            desc: "Decreases speed by the configured step",
            run: () => {
                const s = loadStore();
                adjustPlaybackRate(-Number(s.rateStep || 0.25));
            },
        },
        rateUp: {
            label: "Playback rate up",
            desc: "Increases speed by the configured step",
            run: () => {
                const s = loadStore();
                adjustPlaybackRate(Number(s.rateStep || 0.25));
            },
        },
    };

    let overlayEl = null;
    let modalEl = null;
    let recordingForAction = null;

    function closeModal() {
        if (!overlayEl) return;
        overlayEl.dataset.open = "false";
        recordingForAction = null;
    }

    function openModal() {
        ensureStyles();
        if (!overlayEl) buildModal();
        refreshModalFromStore();
        overlayEl.dataset.open = "true";
    }

    function buildModal() {
        overlayEl = createEl("div", { className: "sckb-modal-overlay", attrs: { role: "dialog", "aria-modal": "true" } });
        modalEl = createEl("div", { className: "sckb-modal" });

        const header = createEl("div", { className: "sckb-header" });
        const left = createEl("div");
        const title = createEl("div", { className: "sckb-title", text: "Configurable Keybindings" });
        const sub = createEl("div", { className: "sckb-sub", text: "Tip: press a Record button, then press your desired keys." });
        left.appendChild(title);
        left.appendChild(sub);

        const btnClose = createEl("button", { className: "sckb-close", text: "Close", attrs: { type: "button" } });
        btnClose.addEventListener("click", (e) => {
            e.preventDefault();
            closeModal();
        });
        header.appendChild(left);
        header.appendChild(btnClose);

        const body = createEl("div", { className: "sckb-body" });

        const help = createEl("div", {
            className: "sckb-help",
            text: "Shortcuts use KeyboardEvent.code (layout-independent). Defaults: Space play/pause, Arrow keys seek, Comma/Period frame-step, [ ] rate, Ctrl+Shift+K opens this.",
        });
        body.appendChild(help);

        const kv1 = createEl("div", { className: "sckb-kv" });
        const lblFrame = createEl("label", { text: "Frame step seconds" });
        const inpFrame = createEl("input", { className: "sckb-input", attrs: { type: "number", step: "0.000001", min: "0.000001", "data-sckb-field": "frameStepSeconds" } });
        kv1.appendChild(lblFrame);
        kv1.appendChild(inpFrame);
        body.appendChild(kv1);

        const kv2 = createEl("div", { className: "sckb-kv" });
        const lblSeek = createEl("label", { text: "Seek seconds" });
        const inpSeek = createEl("input", { className: "sckb-input", attrs: { type: "number", step: "0.1", min: "0", "data-sckb-field": "seekSeconds" } });
        kv2.appendChild(lblSeek);
        kv2.appendChild(inpSeek);
        body.appendChild(kv2);

        const kv3 = createEl("div", { className: "sckb-kv" });
        const lblRate = createEl("label", { text: "Rate step" });
        const inpRate = createEl("input", { className: "sckb-input", attrs: { type: "number", step: "0.05", min: "0.05", "data-sckb-field": "rateStep" } });
        kv3.appendChild(lblRate);
        kv3.appendChild(inpRate);
        body.appendChild(kv3);

        const actions = Object.keys(ACTIONS);
        actions.forEach((actionKey) => {
            const meta = ACTIONS[actionKey];
            const row = createEl("div", { className: "sckb-row", attrs: { "data-sckb-action": actionKey } });

            const left = createEl("div");
            const label = createEl("div", { className: "sckb-label", text: meta.label });
            const desc = createEl("div", { className: "sckb-desc", text: meta.desc });
            left.appendChild(label);
            left.appendChild(desc);

            const input = createEl("input", { className: "sckb-input", attrs: { type: "text", readonly: "true", "data-sckb-binding": actionKey } });

            const right = createEl("div");
            const btnRecord = createEl("button", { className: "sckb-btn", text: "Record", attrs: { type: "button", "data-sckb-record": actionKey } });
            const btnClear = createEl("button", { className: "sckb-btn", text: "Clear", attrs: { type: "button", "data-sckb-clear": actionKey } });

            btnRecord.addEventListener("click", (e) => {
                e.preventDefault();
                recordingForAction = actionKey;
                showToast(`Recording: ${meta.label}. Press keys...`, 1000);
            });

            btnClear.addEventListener("click", (e) => {
                e.preventDefault();
                const store = loadStore();
                store.bindings[actionKey] = "";
                saveStore(store);
                refreshModalFromStore();
            });

            right.appendChild(btnRecord);
            right.appendChild(btnClear);

            row.appendChild(left);
            row.appendChild(input);
            row.appendChild(right);

            body.appendChild(row);
        });

        const footer = createEl("div", { className: "sckb-footer" });
        const btnReset = createEl("button", { className: "sckb-btn", text: "Reset defaults", attrs: { type: "button" } });
        const btnSave = createEl("button", { className: "sckb-btn", text: "Save", attrs: { type: "button" } });

        btnReset.addEventListener("click", (e) => {
            e.preventDefault();
            saveStore(defaultStore());
            refreshModalFromStore();
            showToast("Reset to defaults");
        });

        btnSave.addEventListener("click", (e) => {
            e.preventDefault();
            const store = loadStore();
            const fields = modalEl.querySelectorAll("[data-sckb-field]");
            fields.forEach((inp) => {
                const key = inp.getAttribute("data-sckb-field");
                const val = Number(inp.value);
                if (!key) return;
                if (Number.isFinite(val)) store[key] = val;
            });
            saveStore(store);
            showToast("Saved");
        });

        footer.appendChild(btnReset);
        footer.appendChild(btnSave);

        modalEl.appendChild(header);
        modalEl.appendChild(body);
        modalEl.appendChild(footer);

        overlayEl.appendChild(modalEl);
        overlayEl.addEventListener("mousedown", (e) => {
            if (e.target === overlayEl) closeModal();
        });

        document.body.appendChild(overlayEl);
    }

    function refreshModalFromStore() {
        if (!modalEl) return;
        const store = loadStore();

        const frameInp = modalEl.querySelector("[data-sckb-field='frameStepSeconds']");
        const seekInp = modalEl.querySelector("[data-sckb-field='seekSeconds']");
        const rateInp = modalEl.querySelector("[data-sckb-field='rateStep']");
        if (frameInp) frameInp.value = String(store.frameStepSeconds ?? (1 / 30));
        if (seekInp) seekInp.value = String(store.seekSeconds ?? 5);
        if (rateInp) rateInp.value = String(store.rateStep ?? 0.25);

        Object.keys(ACTIONS).forEach((actionKey) => {
            const inp = modalEl.querySelector(`[data-sckb-binding='${actionKey}']`);
            if (!inp) return;
            inp.value = String(store.bindings?.[actionKey] || "");
        });
    }

    function handleKeydown(e) {
        if (!e) return;

        // If settings modal is open, let Escape close it and otherwise intercept while recording.
        if (overlayEl?.dataset?.open === "true") {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
                return;
            }

            if (recordingForAction) {
                const combo = normalizeComboFromEvent(e);
                if (!combo) return;
                e.preventDefault();
                e.stopPropagation();

                const store = loadStore();
                store.bindings[recordingForAction] = combo;
                saveStore(store);
                recordingForAction = null;
                refreshModalFromStore();
                showToast(`Bound to ${combo}`);
                return;
            }
        }

        // Don’t steal keys from text fields.
        if (isEditableTarget(e.target)) return;

        const combo = normalizeComboFromEvent(e);
        if (!combo) return;

        const store = loadStore();

        // Open settings should work everywhere.
        if (combo === store.bindings.openSettings) {
            e.preventDefault();
            e.stopPropagation();
            openModal();
            return;
        }

        // Only run player actions when on a scene page (video context).
        const sceneId = getSceneIdFromLocation();
        if (!sceneId) return;

        for (const [actionKey, actionCombo] of Object.entries(store.bindings || {})) {
            if (!actionCombo) continue;
            if (actionCombo !== combo) continue;
            const act = ACTIONS[actionKey];
            if (!act) return;
            e.preventDefault();
            e.stopPropagation();
            act.run();
            return;
        }
    }

    document.addEventListener("keydown", handleKeydown, true);

    // Small hint if the user lands on a scene page.
    if (getSceneIdFromLocation()) {
        // Don’t spam; only show once per tab.
        const hintKey = "__configurable_keybindings_hint__";
        if (!window[hintKey]) {
            window[hintKey] = true;
            const store = loadStore();
            showToast(`Keybindings loaded. Settings: ${store.bindings.openSettings || "(unbound)"}`);
        }
    }
})();
