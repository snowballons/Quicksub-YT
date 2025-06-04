// popup/popup.js
import { isValidYouTubeChannelUrl, formatTime } from '../shared/helpers.js';

console.log("Popup script v2.7 (Styled Statuses) loaded.");

document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const startButton = document.getElementById('startButton');
    const statusDisplay = document.getElementById('statusDisplay');
    const countdownDisplay = document.getElementById('countdownDisplay');
    const youtubeUrlInput = document.getElementById('youtubeUrlInput'); // This will now accept multiple URLs
    const addUrlButton = document.getElementById('addUrlButton');
    const singleUrlStatus = document.getElementById('singleUrlStatus'); // Will be used for feedback on multiple URLs
    const clearQueueButton = document.getElementById('clearQueueButton'); // New button

    let channelUrlsToProcess = [];
    let countdownInterval = null;
    let cooldownUpdateInterval = null;

    // --- NEW Helper function to set status with type ---
    /**
     * Sets the status message with a specific type for styling.
     * @param {HTMLElement} element - The status display element (statusDisplay or singleUrlStatus).
     * @param {string} message - The message text.
     * @param {string} type - 'info' (default), 'success', 'error', 'warning'.
     */
    function setStatus(element, message, type = 'info') {
        element.textContent = message;
        element.className = ''; // Clear existing type classes
        element.classList.add(`status-${type}`); // Add new type class
    }

    // --- Initialize ---
    startButton.disabled = true;
    updateClearQueueButton(); // Initialize clear queue button text
    // Initial status using the new helper
    setStatus(statusDisplay, 'Ready. Add URLs or select a file.', 'info');
    setStatus(singleUrlStatus, '', 'info'); // Clear single URL status initially
    checkUsageAndSetButtonState(); // Initial UI setup

    // --- File Input Listener ---
    fileInput.addEventListener('change', function(event) {
        clearCountdown(); clearCooldownDisplayUpdater(); startButton.disabled = true;
        setStatus(singleUrlStatus, '', 'info'); // Clear single URL status

        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
                handleFileProcessing(file); // This will call setStatus internally now
            } else {
                setStatus(statusDisplay, 'Error: Please select a .csv or .txt file.', 'error');
                fileInput.value = ''; updateStartButtonBasedOnQueueAndCooldown();
            }
        } else {
            // Rely on checkUsageAndSetButtonState to set main status if no file is chosen after selection
            updateStartButtonBasedOnQueueAndCooldown();
        }
    });

    // --- Add URL/Scan Button Listener ---
    addUrlButton.addEventListener('click', function() {
        const urlString = youtubeUrlInput.value.trim();
        setStatus(singleUrlStatus, '', 'info'); // Clear previous

        if (!urlString) {
            setStatus(singleUrlStatus, 'Please enter URL(s) or a webpage link.', 'warning');
            return;
        }

        // Try to parse as a single URL first to check its structure
        let isPotentiallyScannableWebpage = false;
        let isLikelyYouTubeDomain = false;
        try {
            const parsedUrl = new URL(urlString); // Test if it's a single, valid URL structure
            isLikelyYouTubeDomain = parsedUrl.hostname.includes("youtube.com") || parsedUrl.hostname.includes("youtu.be");
            if (!isLikelyYouTubeDomain && urlString.split(',').length === 1) { // Only one URL, and not YouTube
                isPotentiallyScannableWebpage = true;
            }
        } catch (_) {
            // If it fails to parse as a single URL, it might be comma-separated list (or just invalid)
            // The comma-separated logic below will handle it.
        }

        if (isPotentiallyScannableWebpage) {
            // --- Initiate Webpage Scan ---
            setStatus(singleUrlStatus, `Scanning webpage: ${urlString.substring(0,40)}...`, 'info');
            disableAllInputs();
            chrome.runtime.sendMessage(
                { action: "scanWebpageForChannels", pageUrl: urlString },
                handleWebpageScanResponse
            );
        } else {
            // --- Process as Comma-Separated YouTube URLs ---
            const urlsArray = urlString.split(',').map(url => url.trim()).filter(url => url);
            let addedCount = 0; let invalidCount = 0; let videoUrlFound = false;
            if (urlsArray.length === 0) {
                setStatus(singleUrlStatus, 'No URLs after trimming.', 'warning');
                return;
            }

            urlsArray.forEach(url => {
                try { new URL(url); } catch (_) { invalidCount++; return; }
                if (url.includes("youtube.com") || url.includes("youtu.be")) {
                    if (isValidYouTubeChannelUrl(url)) {
                        if (addUrlToQueueInternal(url)) addedCount++;
                    } else if (url.includes("/watch?v=") || url.includes("youtu.be/")) {
                        videoUrlFound = true;
                    } else { invalidCount++; }
                } else { invalidCount++; }
            });

            let message = "";
            if (addedCount > 0) message += `${addedCount} valid channel URL(s) added. `;
            if (videoUrlFound) message += `Video URLs ignored (feature deferred). `;
            if (invalidCount > 0) message += `${invalidCount} invalid/non-channel entries ignored.`;

            if (message) {
                setStatus(singleUrlStatus, message.trim(), addedCount > 0 ? 'success' : 'info');
            } else if (!videoUrlFound && !invalidCount && addedCount === 0) {
                setStatus(singleUrlStatus, "No new unique URLs added (possibly duplicates).", 'info');
            }

            if (addedCount > 0 || channelUrlsToProcess.length > 0) youtubeUrlInput.value = '';
            updateMainStatusWithQueueCount();
            updateStartButtonBasedOnQueueAndCooldown();
        }
    });

    // --- Start Button Listener ---
    startButton.addEventListener('click', function() {
        clearCountdown(); clearCooldownDisplayUpdater();
        if (channelUrlsToProcess.length === 0) {
            setStatus(statusDisplay, 'Error: No URLs in queue to process.', 'error');
            return;
        }
        setStatus(statusDisplay, `Attempting to start processing ${channelUrlsToProcess.length} URLs...`, 'info');
        disableAllInputs();
        chrome.runtime.sendMessage( { action: "startProcessingUrls", urls: channelUrlsToProcess }, handleBackgroundResponseForStart );
    });

    // --- Clear Queue Button Listener ---
    clearQueueButton.addEventListener('click', function() {
        channelUrlsToProcess = [];
        setStatus(singleUrlStatus, 'URL queue cleared.', 'success');
        youtubeUrlInput.value = ''; // Optionally clear the input field too
        fileInput.value = ''; // Clear selected file
        updateClearQueueButton();
        updateMainStatusWithQueueCount(); // This will call checkUsageAndSetButtonState
    });

    // --- Helper to add URL to queue (internal, returns true if added, false if duplicate) ---
    function addUrlToQueueInternal(url) { // Renamed from addUrlToQueue
        if (!channelUrlsToProcess.includes(url)) {
            channelUrlsToProcess.push(url);
            updateClearQueueButton(); // Update count on button
            return true; // Added
        }
        return false; // Duplicate
    }

    // --- Helper to update Clear Queue button text --- (NEW)
    function updateClearQueueButton() {
        clearQueueButton.textContent = `Clear Queue (${channelUrlsToProcess.length})`;
        clearQueueButton.disabled = channelUrlsToProcess.length === 0;
    }

    // --- Handle Webpage Scan Response ---
    function handleWebpageScanResponse(response) {
        enablePrimaryInputs();
        updateStartButtonBasedOnQueueAndCooldown();

        if (chrome.runtime.lastError) {
            setStatus(singleUrlStatus, `Error scanning page: ${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (response && response.error) {
            setStatus(singleUrlStatus, `Scan error: ${response.error}`, 'error');
            if (response.foundUrls && response.foundUrls.length > 0) { // If some URLs were found before an error
                let newUrlsAddedCount = 0;
                response.foundUrls.forEach(url => { if (addUrlToQueueInternal(url)) newUrlsAddedCount++; });
                setStatus(singleUrlStatus, `Scan error: ${response.error} Found ${newUrlsAddedCount} URL(s) before error.`, 'warning');
            }
        } else if (response && response.foundUrls) {
            if (response.foundUrls.length > 0) {
                let newUrlsAddedCount = 0;
                response.foundUrls.forEach(url => { if (addUrlToQueueInternal(url)) newUrlsAddedCount++; });
                if (newUrlsAddedCount > 0) {
                    setStatus(singleUrlStatus, `Scan complete: ${newUrlsAddedCount} new unique URL(s) added.`, 'success');
                } else {
                    setStatus(singleUrlStatus, `Scan complete: Found ${response.foundUrls.length} (already in queue/duplicates).`, 'info');
                }
            } else {
                setStatus(singleUrlStatus, response.message || "Scan complete: No YouTube channel URLs found.", 'info');
            }
        } else {
            setStatus(singleUrlStatus, "Scan failed: Unknown response.", 'error');
        }
        youtubeUrlInput.value = ''; // Clear input after scan attempt
        updateMainStatusWithQueueCount();
    }

    // --- Modified disableAllInputs & enablePrimaryInputs ---
    function disableAllInputs() {
        startButton.disabled = true;
        fileInput.disabled = true;
        youtubeUrlInput.disabled = true;
        addUrlButton.disabled = true;
        clearQueueButton.disabled = true; // Disable clear queue during processing
    }
    function enablePrimaryInputs() {
        fileInput.disabled = false;
        youtubeUrlInput.disabled = false;
        addUrlButton.disabled = false;
        updateClearQueueButton(); // Enable clear queue if queue has items
        // startButton state determined by checkUsageAndSetButtonState
    }

    // --- Modified updateMainStatusWithQueueCount ---
    function updateMainStatusWithQueueCount() {
        updateClearQueueButton();
        if (channelUrlsToProcess.length > 0) {
            // If no critical message (cooldown/session limit) is displayed, update with queue info
            if (!statusDisplay.classList.contains('status-error') && !statusDisplay.classList.contains('status-warning')) {
                 checkUsageAndSetButtonState(true); // This will set an appropriate info message
            }
        } else {
             checkUsageAndSetButtonState(false); // This will set "Ready..." or cooldown message
        }
    }
    function updateStartButtonBasedOnQueueAndCooldown() {
        updateClearQueueButton(); // Also update clear button when start button state might change
        checkUsageAndSetButtonState(channelUrlsToProcess.length > 0);
    }

    // --- Handle File Processing (Parsing) --- (No change from v2.3, still adds to channelUrlsToProcess)
    function handleFileProcessing(file) { /* ... same as v2.3 ... */
        disableAllInputs(); statusDisplay.textContent = `Reading ${file.name}...`;
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result; const lines = text.split('\n'); let urlsFromFile = []; let headerSkipped = false;
            if (lines.length === 0 && file.name.endsWith('.csv')) { statusDisplay.textContent = 'Error: CSV file appears empty.'; enablePrimaryInputs(); updateStartButtonBasedOnQueueAndCooldown(); return; }
            if (file.name.endsWith('.csv')) {
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim(); if (!line) continue;
                    if (!headerSkipped && line.toLowerCase() === "channel id,channel url,channel title") {
                        headerSkipped = true; console.log("Skipped CSV header:", line); continue;
                    }
                    const columns = line.split(','); let potentialUrl = "";
                    if (columns.length === 1) potentialUrl = columns[0].trim();
                    else if (columns.length > 1) potentialUrl = columns[1].trim();
                    else continue;
                    if (potentialUrl.startsWith('"') && potentialUrl.endsWith('"')) potentialUrl = potentialUrl.substring(1, potentialUrl.length - 1);
                    if (isValidYouTubeChannelUrl(potentialUrl)) urlsFromFile.push(potentialUrl);
                    else if (potentialUrl && !(headerSkipped && line.toLowerCase().includes("channel url"))) console.warn(`CSV: Skipped invalid: ${potentialUrl}`);
                }
            }
            else if (file.name.endsWith('.txt')) {
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim(); if (!line) continue;
                    if (isValidYouTubeChannelUrl(line)) urlsFromFile.push(line);
                    else console.warn(`TXT: Skipped invalid: ${line}`);
                }
            }
            let newUrlsAddedCount = 0; urlsFromFile.forEach(url => { if (addUrlToQueueInternal(url)) newUrlsAddedCount++; });
            if (newUrlsAddedCount > 0) singleUrlStatus.textContent = `${newUrlsAddedCount} new URL(s) added from ${file.name}.`;
            else if (urlsFromFile.length > 0) singleUrlStatus.textContent = `No new unique URLs from ${file.name}.`;
            else singleUrlStatus.textContent = `No valid URLs found in ${file.name}.`;
            fileInput.value = ''; enablePrimaryInputs(); updateMainStatusWithQueueCount();
        };
        reader.onerror = function(e) { statusDisplay.textContent = 'Error reading file.'; console.error("FileReader error:", e); enablePrimaryInputs(); updateStartButtonBasedOnQueueAndCooldown(); };
        reader.readAsText(file);
    }

    function handleBackgroundResponseForStart(response) {
        if (chrome.runtime.lastError) {
            statusDisplay.textContent = `Error: ${chrome.runtime.lastError.message}.`;
            enablePrimaryInputs(); updateStartButtonBasedOnQueueAndCooldown();
        } else if (response) {
            if (response.status === "received") {
                statusDisplay.textContent = `Processing up to ${response.count} URLs. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used.`;
                // Inputs remain disabled during processing by background
            } else if (response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                displayHardCooldown(response.remainingMs); // This enables primary inputs
            } else if (response.status === "session_limit") {
                statusDisplay.textContent = `${response.message} (${response.linksUsedInSession}/${response.maxSessionLinks})`;
                enablePrimaryInputs(); startButton.disabled = true; // Session limit reached
            } else {
                statusDisplay.textContent = "Background error: " + (response.message || "Unknown");
                enablePrimaryInputs(); updateStartButtonBasedOnQueueAndCooldown();
            }
        } else {
             statusDisplay.textContent = "No response from background.";
             enablePrimaryInputs(); updateStartButtonBasedOnQueueAndCooldown();
        }
    }

    // --- Message Listener from Background ---
    // REMOVE/COMMENT OUT "channelExtracted" and "channelExtractionFailed" handlers or make them note feature is deferred
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        // Re-enable single URL add button unless an action is taking place that disables it
        // This logic becomes simpler as we don't wait for background for single URL adds anymore (except for start processing)
        if(message.action !== "startProcessingUrls" && message.action !== "showCountdown") {
             youtubeUrlInput.disabled = false; // Should be re-enabled by other flows typically
             addUrlButton.disabled = false;
        }

        if (message.action === "showCountdown") { /* ... same as v2.3 ... */
            statusDisplay.textContent = `[${message.current}/${message.total} this batch] Presenting: ${message.channelName}`;
            startVisualCountdown(message.duration);
            sendResponse({status: "countdown_started"});
        } else if (message.action === "processingCompleteWithCooldown") {
            clearCountdown(); countdownDisplay.style.display = "none";
            channelUrlsToProcess = []; // Clear queue
            // Clear inputs
            fileInput.value = ''; youtubeUrlInput.value = ''; singleUrlStatus.textContent = '';
            updateClearQueueButton(); // Update count to (0) and disable
            displayHardCooldown(message.cooldownUntil - Date.now()); // This handles disabling startButton
        } else if (message.action === "processingCompleteNoCooldown") {
            clearCountdown(); countdownDisplay.style.display = "none";
            channelUrlsToProcess = []; // Clear queue
            fileInput.value = ''; youtubeUrlInput.value = ''; singleUrlStatus.textContent = '';
            statusDisplay.textContent = `${message.message} (${message.linksUsedInSession}/${message.maxSessionLinks} total session links used).`;
            updateClearQueueButton(); // Update count to (0) and disable
            enablePrimaryInputs(); // Re-enable inputs
            checkUsageAndSetButtonState(false); // Update UI based on new session state (queue is now empty)
        }
        // No longer expecting "channelExtracted" or "channelExtractionFailed" from background for now
        // else if (message.action === "channelExtracted") { ... }
        // else if (message.action === "channelExtractionFailed") { ... }
        return true;
    });

    // --- NO MORE handleChannelExtractionResponse function needed from v2.3 ---
    // function handleChannelExtractionResponse(response) { ... } // REMOVE THIS

    // --- UI Update Functions (displayHardCooldown, updateUIAfterCooldownOrSessionReset, checkUsageAndSetButtonState) --- (No change from v2.3)
    function displayHardCooldown(remainingMs) { /* ... same as v2.3 ... */
        clearCooldownDisplayUpdater();
        enablePrimaryInputs(); // Allow adding more URLs even during cooldown
        startButton.disabled = true;

        if (remainingMs > 0) {
            statusDisplay.textContent = `Hard Cooldown! Remaining: ${formatTime(remainingMs)}`;
            cooldownUpdateInterval = setInterval(() => {
                chrome.runtime.sendMessage({action: "checkCooldown"}, response => {
                    if (chrome.runtime.lastError || !response) {
                        console.warn("Error checking cooldown interval:", chrome.runtime.lastError?.message);
                        updateUIAfterCooldownOrSessionReset(); return;
                    }
                    if (response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                        if (response.remainingMs > 0) {
                            statusDisplay.textContent = `Hard Cooldown! Remaining: ${formatTime(response.remainingMs)}`;
                        } else { updateUIAfterCooldownOrSessionReset(response); }
                    } else { updateUIAfterCooldownOrSessionReset(response); }
                });
            }, 1000);
        } else { updateUIAfterCooldownOrSessionReset(); }
    }

    function updateUIAfterCooldownOrSessionReset(usageInfo = null) { /* ... same as v2.3 ... */
        clearCooldownDisplayUpdater();
        enablePrimaryInputs();

        const hasQueuedUrls = channelUrlsToProcess.length > 0;
        const fileSelectedAndValid = fileInput.files && fileInput.files.length > 0 && (fileInput.files[0].name.endsWith('.csv') || fileInput.files[0].name.endsWith('.txt'));

        if (usageInfo) {
            const canProcessNow = usageInfo.allowProcessing && (hasQueuedUrls || fileSelectedAndValid);
            startButton.disabled = !canProcessNow;

            if (!usageInfo.allowProcessing && usageInfo.reason === "session_limit_reached") {
                statusDisplay.textContent = `Session limit (${usageInfo.linksUsedInSession}/${usageInfo.maxSessionLinks}). Wait for reset. Queue: ${channelUrlsToProcess.length}.`;
            } else if (canProcessNow) {
                 statusDisplay.textContent = `Ready. Session: ${usageInfo.linksUsedInSession}/${usageInfo.maxSessionLinks}. Queue: ${channelUrlsToProcess.length}.`;
            } else if (hasQueuedUrls && !usageInfo.allowProcessing){ // Has queue, but session/cooldown prevents
                 statusDisplay.textContent = `Queue: ${channelUrlsToProcess.length}. Cannot start (session/cooldown).`;
            }
             else { // No queued URLs, ready for input
                 statusDisplay.textContent = `Ready. Session: ${usageInfo.linksUsedInSession}/${usageInfo.maxSessionLinks}. Select file or add URL.`;
            }
        } else { // Called when cooldown finishes, get fresh state
            checkUsageAndSetButtonState(hasQueuedUrls || fileSelectedAndValid);
        }
    }

    function checkUsageAndSetButtonState(isFileOrUrlQueued = false, statusMsgIfReady = null) {
        updateClearQueueButton(); // Ensure clear button is always in sync
        chrome.runtime.sendMessage({action: "checkCooldown"}, response => {
            if (chrome.runtime.lastError || !response) {
                statusDisplay.textContent = "Error checking status. Try reloading.";
                disableAllInputs(); enablePrimaryInputs(); updateClearQueueButton(); startButton.disabled = true; return;
            }

            if (response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                displayHardCooldown(response.remainingMs);
            } else if (response.status === "usage_info") {
                clearCooldownDisplayUpdater();
                enablePrimaryInputs(); // Enable inputs for adding more URLs

                const canStartProcessing = response.allowProcessing && isFileOrUrlQueued;
                startButton.disabled = !canStartProcessing;

                if (canStartProcessing) {
                    statusDisplay.textContent = statusMsgIfReady || `Ready (${channelUrlsToProcess.length} in queue). Session: ${response.linksUsedInSession}/${response.maxSessionLinks}.`;
                } else if (!response.allowProcessing && response.reason === "session_limit_reached") {
                    statusDisplay.textContent = `Session limit (${response.maxSessionLinks}). Queue: ${channelUrlsToProcess.length}.`;
                } else { // Not processing for other reasons or no items to process
                    if (channelUrlsToProcess.length > 0) { // Items in queue, but cannot start (e.g. session limit just hit)
                        statusDisplay.textContent = `Queue: ${channelUrlsToProcess.length}. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used.`;
                    } else { // No items in queue
                        statusDisplay.textContent = `Ready. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used. Select file or add URL.`;
                    }
                }
            }
        });
    }

    // --- Other Helper Functions (startVisualCountdown, clearCountdown, clearCooldownDisplayUpdater, resetControls) --- (No change from v2.3)
    function startVisualCountdown(durationSeconds) { /* ... same ... */
        clearCountdown(); let timeLeft = durationSeconds;
        countdownDisplay.textContent = `${timeLeft}s`; countdownDisplay.style.display = "block";
        countdownInterval = setInterval(() => {
            timeLeft--; countdownDisplay.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) { clearCountdown(); countdownDisplay.style.display = "none"; }
        }, 1000);
    }
    function clearCountdown() { /* ... same ... */
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }
    function clearCooldownDisplayUpdater() { /* ... same ... */
        if (cooldownUpdateInterval) { clearInterval(cooldownUpdateInterval); cooldownUpdateInterval = null; }
    }


    // Initial check when popup loads
    checkUsageAndSetButtonState(channelUrlsToProcess.length > 0); // Check based on if queue might have persisted (it doesn't yet)
});
