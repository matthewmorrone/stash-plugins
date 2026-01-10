(function () {
    'use strict';

    let cancelSearch = false; // Flag to cancel ongoing search
    let MIN_FREQ = 2; // Can be updated from UI
    let currentDigramCount = 0; // Track current number of digrams
    let storedCounts = null; // Store counts for recalculation
    let allScenes = null; // Cache all scenes

    const STASHDB_SEARCH_DELAY = 500; // ms between searches

    // Calculate and cache digrams from scenes
    async function calculateDigrams() {
        console.log('Calculating digrams...');
        
        if (!allScenes) {
            const statusMsg = document.getElementById('digram-status-msg');
            if (statusMsg) statusMsg.textContent = 'Loading scenes...';
            allScenes = await getAllScenes();
            console.log('Loaded', allScenes.length, 'scenes');
        }
        
        const counts = countNames(allScenes);
        storedCounts = counts;
        
        const statusMsg = document.getElementById('digram-status-msg');
        if (statusMsg) statusMsg.textContent = '';
        
        recalculateDigramCount();
    }

    // Update digram count display
    function updateDigramCount(count) {
        currentDigramCount = count;
        const label = document.getElementById('settings-digram-label');
        console.log('updateDigramCount called with count:', count, 'label found:', !!label);
        if (label) {
            label.textContent = `Minimum Digram Frequency (${count} digrams detected)`;
            console.log('Updated label to:', label.textContent);
        } else {
            console.error('settings-digram-label element not found!');
        }
    }

    // Recalculate digram count based on current MIN_FREQ
    function recalculateDigramCount() {
        console.log('recalculateDigramCount called, storedCounts:', storedCounts ? 'exists' : 'null');
        if (!storedCounts) return;
        
        const minFreqInput = document.getElementById('min-freq-input');
        if (minFreqInput) {
            MIN_FREQ = parseInt(minFreqInput.value) || 1;
        }
        
        console.log('MIN_FREQ:', MIN_FREQ);
        
        const count = Object.entries(storedCounts)
            .filter(([name, freq]) => freq >= MIN_FREQ)
            .length;
        
        console.log('Calculated count:', count);
        updateDigramCount(count);
    }

    // Extract "First Last" name patterns from text
    function extractNames(text) {
        // Pattern for capitalized first and last names
        const pattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
        const matches = text.match(pattern) || [];
        return matches;
    }

    // Count occurrences of names
    function countNames(scenes) {
        const counts = {};
        
        scenes.forEach(scene => {
            const names = extractNames(scene.title || '');
            names.forEach(name => {
                counts[name] = (counts[name] || 0) + 1;
            });
        });
        
        return counts;
    }

    // Get all scenes via GraphQL
    async function getAllScenes() {
        const query = `
            query FindScenes($filter: FindFilterType) {
                findScenes(filter: $filter) {
                    count
                    scenes {
                        id
                        title
                        performers {
                            id
                            name
                        }
                        stash_ids {
                            endpoint
                            stash_id
                        }
                    }
                }
            }
        `;
        
        let allScenes = [];
        let page = 1;
        const perPage = 1000;
        
        while (true) {
            const variables = {
                filter: {
                    page: page,
                    per_page: perPage,
                    sort: "title",
                    direction: "ASC"
                }
            };
            
            try {
                const response = await fetch('/graphql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, variables })
                });
                
                const data = await response.json();
                const scenes = data.data.findScenes.scenes;
                
                if (scenes.length === 0) break;
                
                allScenes = allScenes.concat(scenes);
                
                if (scenes.length < perPage) break;
                
                page++;
            } catch (error) {
                console.error('Error fetching scenes:', error);
                break;
            }
        }
        
        return allScenes;
    }

    // Search StashDB for a performer name using Stash's scraper
    async function searchStashDB(name) {
        const query = `
            query ScrapeSinglePerformer($source: ScraperSourceInput!, $input: ScrapeSinglePerformerInput!) {
                scrapeSinglePerformer(source: $source, input: $input) {
                    stored_id
                    name
                    disambiguation
                    aliases
                    images
                    remote_site_id
                }
            }
        `;
        
        const variables = { 
            source: {
                stash_box_endpoint: "https://stashdb.org/graphql"
            },
            input: {
                query: name
            }
        };
        
        try {
            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables })
            });
            
            const data = await response.json();
            console.log(`StashDB response for "${name}":`, data);
            
            if (data.errors) {
                console.error(`GraphQL errors for ${name}:`, data.errors);
                return [];
            }
            // scrapeSinglePerformer returns an array of results
            const results = data.data?.scrapeSinglePerformer;
            if (!results) {
                return [];
            }
            // If it's already an array, return it; otherwise wrap in array
            return Array.isArray(results) ? results : [results];
        } catch (error) {
            console.error(`Error searching StashDB for ${name}:`, error);
            return [];
        }
    }

    // Main processing function
    async function processSceneNames() {
        const statusDiv = document.getElementById('scene-parser-status');
        if (!statusDiv) return;
        
        // Read MIN_FREQ from input
        const minFreqInput = document.getElementById('min-freq-input');
        if (minFreqInput) {
            MIN_FREQ = parseInt(minFreqInput.value) || 2;
        }
        
        if (!storedCounts) {
            statusDiv.innerHTML = '<p>Please wait, calculating digrams first...</p>';
            await calculateDigrams();
        }
        
        statusDiv.innerHTML = '<p>Preparing names for StashDB search...</p>';
        
        try {
            // Filter by minimum frequency
            const frequentNames = Object.entries(storedCounts)
                .filter(([name, freq]) => freq >= MIN_FREQ)
                .sort((a, b) => b[1] - a[1]); // Sort by frequency descending
            
            if (frequentNames.length === 0) {
                statusDiv.innerHTML = '<p class="text-warning">No names found matching the minimum frequency threshold.</p>';
                return;
            }
            
            // Go straight to StashDB search
            await searchStashDBForNames(frequentNames, statusDiv);
            
        } catch (error) {
            statusDiv.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
            console.error(error);
        }
    }
    
    // Search StashDB for parsed names
    async function searchStashDBForNames(frequentNames, statusDiv) {
        if (!statusDiv) statusDiv = document.getElementById('scene-parser-status');
        if (!statusDiv) return;
        
        cancelSearch = false; // Reset cancel flag
        
        // Show progress indicator
        statusDiv.innerHTML = `
            <div id="stashdb-progress" class="mb-3">
                <div class="d-flex align-items-center mb-3">
                    <div class="spinner-border spinner-border-sm mr-2" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                    <div id="search-status-text" class="mr-3"></div>
                    <button id="cancel-stashdb-search" class="btn btn-danger btn-sm ml-auto">Cancel</button>
                </div>
            </div>
        `;
        
        // Attach cancel handler
        document.getElementById('cancel-stashdb-search').onclick = () => {
            cancelSearch = true;
        };
        
        const results = [];
        
        try {
            let totalMatches = 0;
            
            for (let i = 0; i < frequentNames.length; i++) {
                // Check if search was cancelled
                if (cancelSearch) {
                    const progressDiv = document.getElementById('stashdb-progress');
                    if (progressDiv) {
                        progressDiv.innerHTML = `<div class="alert alert-warning mb-3">Search cancelled (${i}/${frequentNames.length} scanned, ${totalMatches} matches found)</div>`;
                    }
                    displayResultsGrid(results, statusDiv);
                    return;
                }
                
                const [name, freq] = frequentNames[i];
                
                // Update status text
                const statusText = document.getElementById('search-status-text');
                if (statusText) {
                    statusText.textContent = `Searching: ${name} (${i + 1}/${frequentNames.length} scanned, ${totalMatches} matches found)`;
                }
                
                const stashResults = await searchStashDB(name);
                
                // Filter for exact matches only
                const exactMatches = stashResults ? stashResults.filter(performer => {
                    const performerName = performer.name.toLowerCase();
                    const searchName = name.toLowerCase();
                    
                    // Check if performer name matches
                    if (performerName === searchName) return true;
                    
                    // Check if any alias matches
                    if (performer.aliases && Array.isArray(performer.aliases) && performer.aliases.length > 0) {
                        return performer.aliases.some(alias => 
                            alias.toLowerCase() === searchName
                        );
                    }
                    
                    return false;
                }) : [];
                
                results.push({
                    name,
                    frequency: freq,
                    matches: exactMatches
                });
                
                if (exactMatches.length > 0) {
                    totalMatches++;
                }
                
                // Delay to avoid overwhelming the server
                await new Promise(r => setTimeout(r, STASHDB_SEARCH_DELAY));
            }
            
            // Display results in grid
            const progressDiv = document.getElementById('stashdb-progress');
            if (progressDiv) {
                progressDiv.innerHTML = `<div class="alert alert-success mb-3">Search complete - ${totalMatches} matches found from ${frequentNames.length} names scanned</div>`;
            }
            displayResultsGrid(results, statusDiv);
            
        } catch (error) {
            const progressDiv = document.getElementById('stashdb-progress');
            if (progressDiv) {
                progressDiv.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
            }
            console.error(error);
        }
    }

    // Display results in a 2-column grid grouped by search query
    function displayResultsGrid(results, statusDiv) {
        if (!statusDiv) statusDiv = document.getElementById('scene-parser-status');
        if (!statusDiv || results.length === 0) return;
        
        let html = '<div class="row">';
        
        // Each result gets its own grouped card
        results.forEach((result, index) => {
            html += `
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body" style="padding: 1rem;">
                            <h5 class="card-title" style="margin-bottom: 0.75rem;">${result.name}</h5>
                            <input type="text" class="form-control form-control-sm mb-2" value="${result.name}" readonly style="background-color: #1f1f1f; border-color: #404040;">
            `;
            
            if (result.matches.length > 0) {
                result.matches.forEach(match => {
                    const name = match.name || 'Unknown';
                    const disambiguation = match.disambiguation || '';
                    const aliases = Array.isArray(match.aliases) ? match.aliases.join(', ') : '';
                    const imageUrl = Array.isArray(match.images) && match.images.length > 0 ? match.images[0] : '';
                    
                    html += `
                        <div class="d-flex align-items-start mb-2 p-2" style="border: 1px solid #404040; border-radius: 4px; background-color: #2a2a2a;">
                            ${imageUrl ? `<img src="${imageUrl}" style="width: 60px; height: 60px; object-fit: cover; margin-right: 10px; border-radius: 4px; flex-shrink: 0;" alt="${name}">` : '<div style="width: 60px; height: 60px; background: #1a1a1a; margin-right: 10px; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;"><span style="color: #666; font-size: 0.7rem;">No Image</span></div>'}
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; margin-bottom: 0.25rem;">${name}</div>
                                ${disambiguation ? `<div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">${disambiguation}</div>` : ''}
                                ${aliases ? `<div style="font-size: 0.85rem; color: #999;">Aliases: ${aliases}</div>` : ''}
                            </div>
                        </div>
                    `;
                });
            } else {
                html += `<div class="text-muted" style="font-style: italic; padding: 0.5rem 0;">No results found</div>`;
            }
            
            html += `
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        statusDiv.innerHTML += html;
    }

    // Display parsing results before StashDB search
    function displayParsingResults(frequentNames) {
        const statusDiv = document.getElementById('scene-parser-status');
        
        let html = `
            <h4>Extracted Names</h4>
            <p>Found ${frequentNames.length} potential performer names with ${MIN_FREQ}+ occurrences</p>
            <div style="max-height: 600px; overflow-y: auto;">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Frequency</th>
                            <th>StashDB Match</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        frequentNames.forEach(([name, freq], index) => {
            html += `
                <tr id="name-row-${index}">
                    <td>${name}</td>
                    <td>${freq}</td>
                    <td class="stashdb-match"><em class="text-muted">Not searched yet</em></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            <button id="search-stashdb-btn" class="btn btn-primary mt-3">
                Search These Names on StashDB
            </button>
            <button id="cancel-search-btn" class="btn btn-secondary mt-3 ml-2">
                Cancel
            </button>
        `;
        
        statusDiv.innerHTML = html;
        
        document.getElementById('search-stashdb-btn').addEventListener('click', () => {
            searchStashDBForNames(frequentNames);
        });
        
        document.getElementById('cancel-search-btn').addEventListener('click', () => {
            statusDiv.innerHTML = '';
        });
    }
    
    // Display results in a table
    function displayResults(results, totalMatches = 0, progressDiv = null) {
        const targetDiv = progressDiv || document.getElementById('stashdb-progress') || document.getElementById('scene-parser-status');
        if (!targetDiv) return;
        
        let html = `
            <h4>StashDB Search Results</h4>
            <p>Checked ${results.length} potential performer names - ${totalMatches} found in StashDB</p>
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Frequency</th>
                        <th>StashDB Matches</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        results.forEach(result => {
            const stashResults = result.stashResults || [];
            const matchCount = stashResults.length;
            const matchInfo = matchCount > 0
                ? `${matchCount} match(es)`
                : 'No matches';
            
            html += `
                <tr>
                    <td><strong>${result.name}</strong></td>
                    <td>${result.frequency}</td>
                    <td>${matchInfo}</td>
                </tr>
            `;
            
            // Show StashDB matches if any
            stashResults.forEach(match => {
                // Handle the actual data structure returned by StashDB
                const name = match.name || 'Unknown';
                const disambiguation = match.disambiguation || '';
                const aliases = Array.isArray(match.aliases) ? match.aliases.join(', ') : '';
                const remoteId = match.remote_site_id || '';
                
                html += `
                    <tr class="table-secondary">
                        <td colspan="3" style="padding-left: 2rem;">
                            → <strong>${name}</strong>
                            ${disambiguation ? ` <em>(${disambiguation})</em>` : ''}
                            ${remoteId ? `<br><small>StashDB ID: ${remoteId}</small>` : ''}
                            ${aliases ? `<br><small>Aliases: ${aliases}</small>` : ''}
                        </td>
                    </tr>
                `;
            });
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        targetDiv.innerHTML = html;
    }

    // Add UI button and container
    async function addUI() {
        if (document.getElementById('scene-parser-ui')) return;
        
        // Only add on settings Tasks page
        if (!window.location.pathname.includes('/settings')) return;
        if (!window.location.search.includes('tab=tasks')) return;
        
        // Wait a bit for the Tasks content to load
        await new Promise(r => setTimeout(r, 500));
        if (document.getElementById('scene-parser-ui')) return;
        
        // Find the Plugin Tasks heading and its card
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        const pluginTasksHeading = headings.find(h => h.textContent.includes('Plugin'));
        
        if (!pluginTasksHeading) {
            console.log('Plugin Tasks heading not found');
            return;
        }
        
        const card = pluginTasksHeading.nextElementSibling;
        if (!card || !card.classList.contains('card')) {
            console.log('Card not found after heading');
            return;
        }
        
        const ui = document.createElement('div');
        ui.id = 'scene-parser-ui';
        ui.className = 'setting-group collapsible';
        ui.innerHTML = `
            <div class="setting">
                <div>
                    <h3>Scene Name Parser</h3>
                </div>
                <div>
                    <button type="button" class="setting-group-collapse-button btn btn-minimal">
                        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="chevron-up" class="svg-inline--fa fa-chevron-up fa-icon fa-fw" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                            <path fill="currentColor" d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="collapsible-section collapse show">
                <div class="setting">
                    <div>
                        <h4 id="settings-digram-label" style="margin: 0; font-size: 0.9rem;">Minimum Digram Frequency (0 digrams detected)</h4>
                        <div class="sub-heading" id="digram-status-msg" style="font-size: 0.85rem;"></div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label for="min-freq-input" style="margin: 0; font-size: 0.9rem; white-space: nowrap;">Min occurrences:</label>
                        <input type="number" id="min-freq-input" class="form-control form-control-sm" value="2" min="1" style="width: 70px;">
                    </div>
                </div>
                <div class="setting">
                    <div>
                        <h4 style="margin: 0; font-size: 0.9rem;">Search StashDB</h4>
                    </div>
                    <div>
                        <button id="scene-parser-btn" type="button" class="btn btn-secondary btn-sm">
                            Search Names on StashDB
                        </button>
                    </div>
                </div>
                <div id="scene-parser-status" class="setting"></div>
            </div>
        `;
        
        card.appendChild(ui);
        
        // Main collapse button
        const collapseButton = ui.querySelector('.setting-group-collapse-button');
        const collapsibleSection = ui.querySelector('.collapsible-section');
        
        if (collapseButton && collapsibleSection) {
            collapseButton.addEventListener('click', () => {
                collapsibleSection.classList.toggle('show');
                const svg = collapseButton.querySelector('svg');
                if (collapsibleSection.classList.contains('show')) {
                    svg.setAttribute('data-icon', 'chevron-up');
                    svg.querySelector('path').setAttribute('d', 'M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z');
                } else {
                    svg.setAttribute('data-icon', 'chevron-down');
                    svg.querySelector('path').setAttribute('d', 'M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z');
                }
            });
        }
        
        // Parse button
        document.getElementById('scene-parser-btn').addEventListener('click', () => {
            processSceneNames();
        });
        
        // Min frequency input change handler
        const minFreqInput = document.getElementById('min-freq-input');
        if (minFreqInput) {
            minFreqInput.addEventListener('input', () => {
                recalculateDigramCount();
            });
        }
        
        // Calculate digrams on load
        setTimeout(() => calculateDigrams(), 100);
    }

    // Initialize - only run once
    let initialized = false;
    function init() {
        if (initialized) return;
        
        // Check if we're on the right page
        if (!window.location.pathname.includes('/settings')) return;
        if (!window.location.search.includes('tab=tasks')) return;
        
        initialized = true;
        addUI();
    }
    
    const observer = new MutationObserver(() => {
        if (window.location.pathname.includes('/settings') && window.location.search.includes('tab=tasks')) {
            if (!initialized && !document.getElementById('scene-parser-ui')) {
                init();
            }
        } else {
            // Reset when navigating away
            initialized = false;
            // Remove UI when navigating away to prevent duplicates
            const existingUI = document.getElementById('scene-parser-ui');
            if (existingUI) {
                existingUI.remove();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also listen for URL changes
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (!window.location.pathname.includes('/settings') || !window.location.search.includes('tab=tasks')) {
                initialized = false;
                const existingUI = document.getElementById('scene-parser-ui');
                if (existingUI) {
                    existingUI.remove();
                }
            } else if (!document.getElementById('scene-parser-ui')) {
                initialized = false;
                init();
            }
        }
    }).observe(document, {subtree: true, childList: true});
    
    init();
})();
