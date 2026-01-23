(function() {
    // console.log('[CodeEditor] Plugin initialization started');
    let debounceTimer;
    let isProcessing = false;
    let initCount = 0;
    const editorsByTextarea = new WeakMap();

    function setNativeTextareaValue(textarea, value) {
        const proto = Object.getPrototypeOf(textarea);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        const setter = desc && desc.set;
        if (setter) {
            setter.call(textarea, value);
        } else {
            textarea.value = value;
        }
    }

    function fireInputAndChange(textarea) {
        // Some frameworks listen to input, some to change.
        try {
            textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } catch {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function ensurePrettyStyles() {
        const styleId = "code-editor-pretty";
        if (document.getElementById(styleId)) return;

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            .CodeMirror {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 12px;
                line-height: 1.45;
                border: 1px solid rgba(127, 127, 127, 0.25);
                border-radius: 6px;
                height: 260px;
            }
            .CodeMirror-scroll { padding: 8px 0; }
            .CodeMirror-lines { padding: 0 8px; }
            .CodeMirror-gutters {
                border-right: 1px solid rgba(127, 127, 127, 0.25);
            }
            .CodeMirror-activeline-background {
                background: rgba(255, 255, 255, 0.06);
            }
            .CodeMirror-activeline-gutter {
                background: rgba(255, 255, 255, 0.06);
            }
        `;
        document.head.appendChild(style);
    }

    function inferMode(textarea) {
        function modeFromHints(hintsText) {
            const t = (hintsText || '').toLowerCase();
            if (!t) return null;
            if (t.includes('custom css') || t.includes(' css ')) return 'text/css';
            if (t.includes('custom javascript') || t.includes('javascript') || t.includes(' custom js') || t.includes(' js ')) {
                return 'text/javascript';
            }
            return null;
        }

        function collectHintsText() {
            const parts = [];

            const label = textarea.closest('.form-group, .setting-group, div')?.querySelector('label');
            if (label?.textContent) parts.push(label.textContent);

            if (textarea.id) parts.push(textarea.id);
            if (textarea.name) parts.push(textarea.name);
            if (textarea.getAttribute('aria-label')) parts.push(textarea.getAttribute('aria-label'));
            if (textarea.getAttribute('placeholder')) parts.push(textarea.getAttribute('placeholder'));

            const dialog = textarea.closest('[role="dialog"], .modal, .dialog, .ui-dialog');
            if (dialog) {
                const titleEl = dialog.querySelector('.modal-title, .modal-header, .dialog-title, header, h1, h2, h3, h4, h5');
                if (titleEl?.textContent) parts.push(titleEl.textContent);
            }

            // Sometimes the title is outside the immediate dialog subtree.
            const maybeTitle = textarea.closest('section, article, div')?.querySelector('h1, h2, h3, h4, h5');
            if (maybeTitle?.textContent) parts.push(maybeTitle.textContent);

            return parts.join(' | ');
        }

        // 1) Strong hint-based detection
        const hinted = modeFromHints(collectHintsText());
        if (hinted) return hinted;

        // 2) Content heuristics (helps when there is no label/title next to the textarea)
        const value = (textarea.value || '').toLowerCase();
        const cssScore =
            (/{[^}]*:[^;]+;/.test(value) ? 2 : 0) +
            (/!important\b/.test(value) ? 1 : 0) +
            (/\b(max-|min-)?(width|height)\b\s*:\s*/.test(value) ? 1 : 0);
        const jsScore =
            (/\b(function|const|let|var|return|import|export)\b/.test(value) ? 2 : 0) +
            (/=>/.test(value) ? 1 : 0) +
            (/\bconsole\./.test(value) ? 1 : 0);

        if (cssScore > jsScore) return 'text/css';

        // Default
        return 'text/javascript';
    }

    function initCodeEditor(textarea) {
        // console.log('[CodeEditor] initCodeEditor called for textarea:', textarea);
        
        if (!window.CodeMirror) {
            // console.warn('[CodeEditor] CodeMirror not available yet');
            return;
        }
        
        if (textarea.dataset.codeMirrorInit) {
            // If the modal was destroyed/rebuilt, the textarea may remain but the
            // CodeMirror wrapper can disappear. In that case, re-init.
            const existing = editorsByTextarea.get(textarea);
            const wrapper = existing?.getWrapperElement?.();
            if (existing && wrapper && document.contains(wrapper)) {
                return;
            }
            delete textarea.dataset.codeMirrorInit;
            editorsByTextarea.delete(textarea);
        }

        ensurePrettyStyles();
        const mode = inferMode(textarea);

        try {
            const extraKeys = {};
            if (window.CodeMirror?.commands?.autocomplete) {
                extraKeys["Ctrl-Space"] = "autocomplete";
            }
            if (window.CodeMirror?.commands?.toggleComment) {
                extraKeys["Cmd-/"] = "toggleComment";
                extraKeys["Ctrl-/"] = "toggleComment";
            }
            if (window.CodeMirror?.commands?.find) {
                extraKeys["Cmd-F"] = "find";
                extraKeys["Ctrl-F"] = "find";
                extraKeys["Cmd-G"] = "findNext";
                extraKeys["Ctrl-G"] = "findNext";
                extraKeys["Shift-Cmd-G"] = "findPrev";
                extraKeys["Shift-Ctrl-G"] = "findPrev";
                extraKeys["Shift-Cmd-F"] = "replace";
                extraKeys["Shift-Ctrl-F"] = "replace";
            }
            extraKeys["Ctrl-Q"] = function(cm) {
                if (typeof cm?.foldCode === 'function') {
                    cm.foldCode(cm.getCursor());
                }
            };

            const editor = CodeMirror.fromTextArea(textarea, {
                mode: mode,
                theme: 'monokai',
                lineNumbers: true,
                styleActiveLine: true,
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
                lineWrapping: true,
                indentUnit: 2,
                tabSize: 2,
                indentWithTabs: false,
                autoCloseBrackets: true,
                matchBrackets: true,
                hintOptions: window.CodeMirror?.hint?.anyword ? { hint: window.CodeMirror.hint.anyword, completeSingle: false } : undefined,
                extraKeys: extraKeys
            });

            editorsByTextarea.set(textarea, editor);

            function syncToTextarea() {
                const value = editor.getValue();
                setNativeTextareaValue(textarea, value);
                fireInputAndChange(textarea);
            }

            // Many UIs listen to `input` rather than `change` for persistence.
            editor.on('change', syncToTextarea);
            editor.on('blur', syncToTextarea);

            // Re-check mode on focus in case the surrounding UI (dialog title/tab) changes.
            editor.on('focus', () => {
                const inferred = inferMode(textarea);
                if (inferred && editor.getOption('mode') !== inferred) {
                    editor.setOption('mode', inferred);
                    editor.refresh();
                }
            });

            textarea.dataset.codeMirrorInit = 'true';
            
            // Immediate refresh instead of delayed
            editor.refresh();

            // Ensure the intended height applies even if surrounding layout changes.
            editor.setSize(null, 260);

            // If there's an explicit confirm/apply button in a modal, make sure we sync
            // right before it reads/saves the value.
            const dialog = textarea.closest('[role="dialog"], .modal, .dialog, .ui-dialog');
            if (dialog && !dialog.dataset.codeMirrorSyncBound) {
                dialog.dataset.codeMirrorSyncBound = 'true';

                // Sync on modal close as well (covers "X" close and backdrop).
                const syncAllInDialog = () => {
                    dialog.querySelectorAll('textarea[data-code-mirror-init="true"]').forEach((ta) => {
                        const ed = editorsByTextarea.get(ta);
                        if (ed) {
                            try {
                                const val = ed.getValue();
                                setNativeTextareaValue(ta, val);
                                fireInputAndChange(ta);
                            } catch {}
                        }
                    });
                };

                dialog.addEventListener('hide.bs.modal', syncAllInDialog, true);
                dialog.addEventListener('hidden.bs.modal', syncAllInDialog, true);
                dialog.addEventListener('close', syncAllInDialog, true);

                dialog.addEventListener('click', (e) => {
                    const el = e.target;
                    if (!(el instanceof Element)) return;
                    const isConfirm =
                        el.matches('button.btn-primary, button[type="submit"]') ||
                        (el.textContent || '').trim().toLowerCase() === 'confirm';
                    if (isConfirm) {
                        syncAllInDialog();
                    }
                }, true);
            }
            
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
