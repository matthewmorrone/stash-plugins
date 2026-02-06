(function () {
    "use strict";

    const FLAG = "__package_id_discourse_link_installed__";
    if (window[FLAG]) return;
    window[FLAG] = true;

    const LOG_PREFIX = "[Package ID Discourse Link]";

    // console.log(LOG_PREFIX, "Installed");

    const urlByPackageId = new Map();
    let urlsLoadPromise = null;

    async function gql(query, variables) {
        const res = await fetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ query, variables: variables || {} }),
        });
        return res.json();
    }

    async function tryLoadUrls() {
        try {
            const json = await gql("query { plugins { id url } }");
            if (json?.errors?.length) {
                console.log(LOG_PREFIX, "GraphQL errors while loading plugin urls", json.errors);
                return;
            }

            const plugins = json?.data?.plugins;
            if (!Array.isArray(plugins)) {
                console.log(LOG_PREFIX, "Unexpected GraphQL shape while loading plugin urls", json);
                return;
            }

            let added = 0;
            for (const p of plugins) {
                const k = p?.id;
                const u = p?.url;
                if (!k || !u) continue;
                if (!urlByPackageId.has(String(k))) added++;
                urlByPackageId.set(String(k), String(u));
            }

            // console.log(LOG_PREFIX, "Loaded plugin urls via GraphQL", { key: "id", count: urlByPackageId.size, added });
        } catch (e) {
            console.log(LOG_PREFIX, "Failed to load plugin urls via GraphQL", e);
        }
    }

    function ensureUrlsLoaded() {
        if (!urlsLoadPromise) urlsLoadPromise = tryLoadUrls();
        return urlsLoadPromise;
    }

    function wrap(el) {
        if (!(el instanceof Element)) return;

        const id = String(el.dataset.pidDlId || el.textContent || "").trim();
        if (!id) return;

        // Persist the raw id so later upgrades don't accidentally treat decorated text (e.g. "*") as the id.
        el.dataset.pidDlId = id;

        const pluginUrl = urlByPackageId.get(id) || null;
        const discourseUrl = pluginUrl ? null : `https://discourse.stashapp.cc/t/${encodeURIComponent(id)}`;
        const desiredHref = pluginUrl || discourseUrl;
        if (!desiredHref) return;

        const isGuessed = !pluginUrl;

        // If already linked to the desired target, no-op.
        const existingLinks = Array.from(el.querySelectorAll("a[href]"));
        if (existingLinks.length === 1 && el.dataset.pidDlDone === "1") {
            const existingHref = existingLinks[0].getAttribute("href");
            if (existingHref === desiredHref) return;
        }

        // Rebuild content (also cleans up any previous multi-link versions).
        el.textContent = "";

        const a = document.createElement("a");
        a.href = desiredHref;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = isGuessed ? `${id}*` : id;
        a.title = isGuessed
            ? "Guessed link (fallback from package id)"
            : "Retrieved link (from GraphQL)";
        el.appendChild(a);

        el.dataset.pidDlDone = "1";
        el.dataset.pidDlKind = pluginUrl ? "retrieved" : "guessed";

/*         console.log(LOG_PREFIX, "Linked package id", {
            id,
            kind: el.dataset.pidDlKind,
            href: desiredHref,
        }); */
    }

    function maybeWrapPackageIdEl(el) {
        if (!(el instanceof Element)) return;
        if (!el.classList.contains("package-id")) return;
        // Scope to the plugin manager UI so we don't accidentally linkify unrelated .package-id elsewhere.
        if (!el.closest(".package-manager")) return;
        wrap(el);
    }

    function scanRoot(root) {
        // root can be an Element, DocumentFragment, or Document. React often batches inserts.
        if (!root) return;

        const canQuery = typeof root.querySelectorAll === "function";

        if (root instanceof Element && root.matches(".package-id")) {
            maybeWrapPackageIdEl(root);
        }

        if (canQuery) {
            // Installed/Available layouts differ; match any package-id within the plugin manager.
            root.querySelectorAll(".package-manager .package-id").forEach(maybeWrapPackageIdEl);
        }
    }

    function logSelectorCountsOnce() {
        // Helps debug when selectors don't match the current Stash UI.
        console.log(LOG_PREFIX, "Selector counts", {
            packageCells: document.querySelectorAll(".package-cell").length,
            packageManagers: document.querySelectorAll(".package-manager").length,
            packageIds: document.querySelectorAll(".package-id").length,
            packageCellIds: document.querySelectorAll(".package-cell .package-id").length,
            packageManagerIds: document.querySelectorAll(".package-manager .package-id").length,
        });
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type !== "childList") continue;
            m.addedNodes.forEach((n) => scanRoot(n));
        }
        // Intentionally no aggregated id list logging; we log per linkification.
    });

    function start() {
        if (!document.body) return;

        ensureUrlsLoaded().finally(() => {
            // Once urls arrive, rerun a scan so existing ids can get the repo link.
            scanRoot(document);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // Initial pass for already-rendered content.
        scanRoot(document);
        // logSelectorCountsOnce();

        // React may render the Installed list shortly after DOMContentLoaded.
        // Do a couple of bounded delayed scans (not continuous polling).
        setTimeout(() => scanRoot(document), 0);
        setTimeout(() => scanRoot(document), 250);
        setTimeout(() => scanRoot(document), 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
