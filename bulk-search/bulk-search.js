(function () {
    const DELAY = 300;

    async function bulkSearch() {
        const buttons = [...document.querySelectorAll(
            'button.btn.btn-primary[type="button"]'
        )].filter(b =>
            b.textContent.trim() === 'Search' &&
            !b.disabled
        );

        console.log(`Bulk Search: ${buttons.length} found`);

        for (const b of buttons) {
            b.click();
            await new Promise(r => setTimeout(r, DELAY));
        }
    }

    function addButton() {
        if (document.getElementById('bulk-search-btn')) return;

        const batchBtn = [...document.querySelectorAll('button.btn.btn-primary')]
            .find(b => b.textContent.trim() === 'Batch Add Performers');

        if (!batchBtn) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary mr-3';
        btn.type = 'button';
        btn.id = 'bulk-search-btn';
        btn.textContent = 'Bulk Search';
        btn.onclick = bulkSearch;

        batchBtn.parentElement.insertBefore(btn, batchBtn);
    }

    const observer = new MutationObserver(addButton);
    observer.observe(document.body, { childList: true, subtree: true });

    addButton();
})();
