(function() {
    // console.log('[CodeEditor] Plugin initialization started');
    let debounceTimer;
    let isProcessing = false;
    let initCount = 0;

    function initCodeEditor(textarea) {
        // console.log('[CodeEditor] initCodeEditor called for textarea:', textarea);
        
        if (!window.CodeMirror) {
            // console.warn('[CodeEditor] CodeMirror not available yet');
            return;
        }
        
        if (textarea.dataset.codeMirrorInit) {
            // console.log('[CodeEditor] Textarea already initialized, skipping');
            return;
        }

        let mode = 'javascript';
        const label = textarea.closest('.form-group, .setting-group, div')?.querySelector('label');
        const labelText = label?.textContent || 'no label';
        
        // console.log('[CodeEditor] Label text:', labelText);
        
        if (labelText.toLowerCase().includes('css')) {
            mode = 'css';
        }
        
        // console.log('[CodeEditor] Using mode:', mode);

        try {
            const editor = CodeMirror.fromTextArea(textarea, {
                mode: mode,
                theme: 'default',
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
            
            // Immediate refresh instead of delayed
            editor.refresh();
            
            initCount++;
            // console.log('[CodeEditor] Successfully initialized editor #' + initCount);
        } catch (error) {
            console.error('[CodeEditor] Error initializing editor:', error);
        }
    }

    function findAndReplaceTextareas() {
        // console.log('[CodeEditor] findAndReplaceTextareas called, isProcessing:', isProcessing);
        
        if (!window.CodeMirror) {
            // console.warn('[CodeEditor] CodeMirror not loaded yet');
            return;
        }
        
        if (isProcessing) {
            // console.log('[CodeEditor] Already processing, skipping');
            return;
        }
        
        isProcessing = true;

        const textareas = document.querySelectorAll('textarea');
        // console.log('[CodeEditor] Found ' + textareas.length + ' textareas');

        textareas.forEach((textarea, index) => {
            if (textarea.dataset.codeMirrorInit) {
                // console.log('[CodeEditor] Textarea #' + index + ' already initialized');
                return;
            }

            // Try multiple ways to find the label
            let label = textarea.closest('.form-group, .setting-group, div')?.querySelector('label');
            if (!label) {
                // Try previous sibling
                label = textarea.previousElementSibling?.tagName === 'LABEL' ? textarea.previousElementSibling : null;
            }
            if (!label) {
                // Try parent's first child
                label = textarea.parentElement?.querySelector('label');
            }
            if (!label) {
                // Try grandparent
                label = textarea.parentElement?.parentElement?.querySelector('label');
            }
            
            const labelText = label?.textContent?.toLowerCase() || '';
            const textareaId = textarea.id || 'no-id';
            const textareaName = textarea.name || 'no-name';
            const textareaClass = textarea.className || 'no-class';

/*
            console.log('[CodeEditor] Textarea #' + index + ':', {
                label: labelText,
                id: textareaId,
                name: textareaName,
                class: textareaClass,
                parent: textarea.parentElement?.className || 'unknown',
                grandparent: textarea.parentElement?.parentElement?.className || 'unknown'
            });
*/
            // Check multiple criteria for CSS/JS textareas
            const isCodeEditor = 
                labelText.includes('css') || labelText.includes('javascript') || labelText.includes('custom') ||
                textareaId.includes('css') || textareaId.includes('javascript') || 
                textareaName.includes('css') || textareaName.includes('javascript') ||
                textareaClass.includes('code'); // Check for "code" class

            if (isCodeEditor) {
                // console.log('[CodeEditor] Match found for textarea #' + index + ', initializing...');
                initCodeEditor(textarea);
            } else {
                // console.log('[CodeEditor] No match for textarea #' + index);
            }
        });
        
        isProcessing = false;
        // console.log('[CodeEditor] findAndReplaceTextareas completed');
    }

    function debouncedCheck() {
        // console.log('[CodeEditor] debouncedCheck triggered');
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(findAndReplaceTextareas, 100);
    }

    function waitForCodeMirror() {
        // console.log('[CodeEditor] Checking for CodeMirror...');
        
        if (window.CodeMirror) {
            // console.log('[CodeEditor] CodeMirror found! Version:', window.CodeMirror.version || 'unknown');
            
            const observer = new MutationObserver((mutations) => {
                const hasNewTextareas = mutations.some(mutation => 
                    Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && (node.matches?.('textarea') || node.querySelector?.('textarea'))
                    )
                );
                
                if (hasNewTextareas) {
                    console.log('[CodeEditor] New textareas detected in DOM');
                    debouncedCheck();
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            // console.log('[CodeEditor] MutationObserver started');
            
            // Initial check
            findAndReplaceTextareas();
        } else {
            // console.log('[CodeEditor] CodeMirror not found, retrying in 100ms...');
            setTimeout(waitForCodeMirror, 100);
        }
    }

    waitForCodeMirror();
})();
