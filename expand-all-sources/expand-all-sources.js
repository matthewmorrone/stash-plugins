(function() {
    const BUTTON_ID = "expand-all-sources-btn";
    let injected = false;

    const poll = setInterval(() => {
        // Remove ALL buttons with "Expand All Sources" text, not just by ID
        document.querySelectorAll("button").forEach(btn => {
            if (btn.textContent.trim() === "Expand All Sources") {
                btn.remove();
            }
        });

        const managers = document.querySelectorAll(".package-manager");
        if (managers.length < 2) return;

        const target = managers[1];
        const inputGroup = target.querySelector(".clearable-input-group");

        if (!inputGroup || injected) return;

        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.textContent = "Expand All Sources";
        btn.className = "btn btn-primary ml-3";
        btn.style.cursor = "pointer";

        btn.addEventListener("click", () => {
            document.querySelectorAll(".source-collapse button").forEach(b => b.click());
        });

        inputGroup.insertAdjacentElement("afterend", btn);

        injected = true;
        clearInterval(poll);
    }, 500);
})();
