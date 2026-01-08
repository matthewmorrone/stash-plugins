(function() {
    console.log('[Code Editor] Plugin loaded');

    function initCodeEditor(textarea) {
        if (!window.CodeMirror) {
            console.log('[Code Editor] CodeMirror not available yet');
            return;
        }
        
        if (textarea.dataset.codeMirrorInit) {
            console.log('[Code Editor] Textarea already initialized');
            return;
        }

        let mode = 'javascript';
        const label = textarea.closest('.form-group, .setting-group, div')?.querySelector('label');
        if (label?.textContent.toLowerCase().includes('css')) {
            mode = 'css';
        }

        console.log('[Code Editor] Initializing editor with mode:', mode);

        const editor = CodeMirror.fromTextArea(textarea, {
            mode: mode,
            theme: 'monokai',
            lineNumbers: true,
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2,
            indentWithTabs: false,
            autoCloseBrackets: true,
            matchBrackets: true,
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Cmd-/": "toggleComment",
                "Ctrl-/": "toggleComment"
            }
        });

        editor.on('change', () => {
            textarea.value = editor.getValue();
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        textarea.dataset.codeMirrorInit = 'true';
        setTimeout(() => editor.refresh(), 100);
        
        console.log('[Code Editor] Editor initialized successfully');
    }

    function findAndReplaceTextareas() {
        if (!window.CodeMirror) {
            console.log('[Code Editor] CodeMirror not loaded');
            return;
        }

        const textareas = document.querySelectorAll('textarea');
        console.log('[Code Editor] Found', textareas.length, 'textareas');

        textareas.forEach(textarea => {
            if (textarea.dataset.codeMirrorInit) return;

            const label = textarea.closest('.form-group, .setting-group, div')?.querySelector('label');
            const labelText = label?.textContent?.toLowerCase() || '';

            console.log('[Code Editor] Checking textarea with label:', labelText);

            if (labelText.includes('css') || labelText.includes('javascript') || labelText.includes('custom')) {
                console.log('[Code Editor] Match found! Initializing...');
                initCodeEditor(textarea);
            }
        });
    }

    function waitForCodeMirror() {
        if (window.CodeMirror) {
            console.log('[Code Editor] CodeMirror is ready');
            
            const observer = new MutationObserver(() => {
                findAndReplaceTextareas();
            });

            observer.observe(document.body, { childList: true, subtree: true });
            findAndReplaceTextareas();
        } else {
            console.log('[Code Editor] Waiting for CodeMirror...');
            setTimeout(waitForCodeMirror, 100);
        }
    }

    waitForCodeMirror();
})();
