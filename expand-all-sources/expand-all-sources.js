(function() {
    const BUTTON_ID = "expand-all-sources-btn";
    let injected = false;

    function areAllExpanded() {
        const buttons = document.querySelectorAll(".source-collapse button");
        if (buttons.length === 0) return false;
        
        // Check if buttons have aria-expanded attribute or if the content is visible
        return Array.from(buttons).every(btn => {
            const expanded = btn.getAttribute("aria-expanded");
            return expanded === "true";
        });
    }

    function toggleAllSources() {
        const allExpanded = areAllExpanded();
        const buttons = document.querySelectorAll(".source-collapse button");
        
        buttons.forEach(btn => {
            const isExpanded = btn.getAttribute("aria-expanded") === "true";
            
            // Only click if state needs to change
            if (allExpanded && isExpanded) {
                btn.click(); // Collapse
            } else if (!allExpanded && !isExpanded) {
                btn.click(); // Expand
            }
        });
        
        updateButtonText();
    }

    function updateButtonText() {
        const btn = document.getElementById(BUTTON_ID);
        if (!btn) return;
        
        const allExpanded = areAllExpanded();
        btn.textContent = allExpanded ? "Collapse All Sources" : "Expand All Sources";
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
        btn.textContent = "Expand All Sources";
        btn.className = "btn btn-primary ml-3";
        btn.style.cursor = "pointer";

        btn.addEventListener("click", toggleAllSources);

        inputGroup.insertAdjacentElement("afterend", btn);
        injected = true;
        
        // Set initial button text
        setTimeout(updateButtonText, 100);
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
