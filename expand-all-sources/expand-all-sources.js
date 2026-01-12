(function() {
    const BUTTON_ID = "expand-all-sources-btn";
    const LABEL_EXPAND = "Expand All Sources";
    const LABEL_COLLAPSE = "Collapse All Sources";
    let injected = false;

    function getChevronState(buttonEl) {
        // FontAwesome in Stash typically renders as an <svg> with classes like:
        // "svg-inline--fa fa-chevron-right" or "svg-inline--fa fa-chevron-down"
        const svg = buttonEl.querySelector("svg");
        if (svg) {
            const cls = (svg.getAttribute("class") || "").toLowerCase();
            if (cls.includes("fa-chevron-down")) return "expanded";
            if (cls.includes("fa-chevron-right")) return "collapsed";
        }

        // Fallback in case FA is rendered as <i class="fa ...">.
        const icon = buttonEl.querySelector("i");
        if (icon) {
            const cls = (icon.getAttribute("class") || "").toLowerCase();
            if (cls.includes("fa-chevron-down")) return "expanded";
            if (cls.includes("fa-chevron-right")) return "collapsed";
        }

        return null;
    }

    function isExpanded(buttonEl) {
        const chevronState = getChevronState(buttonEl);
        if (chevronState === "expanded") return true;
        if (chevronState === "collapsed") return false;

        // Last-resort fallback (some UIs use this), but we strongly prefer chevron detection.
        const aria = buttonEl.getAttribute("aria-expanded");
        if (aria === "true") return true;
        if (aria === "false") return false;

        return false;
    }

    function areAllExpanded() {
        const buttons = Array.from(document.querySelectorAll(".source-collapse button"));
        if (buttons.length === 0) return false;

        return buttons.every(isExpanded);
    }

    function toggleAllSources() {
        const allExpanded = areAllExpanded();
        const buttons = document.querySelectorAll(".source-collapse button");
        
        buttons.forEach(btn => {
            const expanded = isExpanded(btn);
            
            // Only click if state needs to change
            if (allExpanded && expanded) {
                btn.click(); // Collapse
            } else if (!allExpanded && !expanded) {
                btn.click(); // Expand
            }
        });

        // Blindly flip label based on what action we just took.
        // If everything was expanded, we just collapsed -> show expand label.
        // Otherwise we just expanded -> show collapse label.
        const btn = document.getElementById(BUTTON_ID);
        if (btn) {
            btn.textContent = allExpanded ? LABEL_EXPAND : LABEL_COLLAPSE;
        }
    }

    function addButton() {
        if (injected || document.getElementById(BUTTON_ID)) return;

        const managers = document.querySelectorAll(".package-manager");
        if (managers.length < 2) return;

        const target = managers[1];
        const inputGroup = target.querySelector(".clearable-input-group");
        if (!inputGroup) return;

        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.textContent = LABEL_EXPAND;
        btn.className = "btn btn-primary ml-3";
        btn.style.cursor = "pointer";

        btn.addEventListener("click", toggleAllSources);

        inputGroup.insertAdjacentElement("afterend", btn);
        injected = true;
    }

    // Try a few times then stop
    let attempts = 0;
    const poll = setInterval(() => {
        addButton();
        attempts++;
        if (injected || attempts > 20) {
            clearInterval(poll);
        }
    }, 500);
})();
