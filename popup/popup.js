// popup/popup.js
import { isValidYouTubeChannelUrl, formatTime } from '../shared/helpers.js'; // ADD THIS LINE AT THE TOP

// popup/popup.js
console.log("Popup script v2.1 (Session Logic) loaded.");

// Ensure isValidYouTubeChannelUrl and formatTime are globally available from shared/helpers.js
// as they are loaded via <script> tag in popup.html before this script.

document.addEventListener('DOMContentLoaded', function() {
    const csvFileInput = document.getElementById('csvFile');
    const startButton = document.getElementById('startButton');
    const statusDisplay = document.getElementById('statusDisplay');
    const countdownDisplay = document.getElementById('countdownDisplay');

    let channelUrlsToProcess = [];
    let countdownInterval = null;
    let cooldownUpdateInterval = null;

    // --- CSV File Input Listener ---
    csvFileInput.addEventListener('change', function(event) {
        clearCountdown();
        clearCooldownDisplayUpdater();
        channelUrlsToProcess = []; // Clear previous URLs
        startButton.disabled = true; // Disable until we confirm cooldown status and file validity

        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            if (file.name.endsWith('.csv')) {
                // Don't immediately enable startButton; checkUsageAndSetButtonState will do it
                checkUsageAndSetButtonState(true, `File selected: ${file.name}.`);
            } else {
                statusDisplay.textContent = 'Error: Please select a .csv file.';
                csvFileInput.value = ''; // Reset file input
            }
        } else {
            statusDisplay.textContent = 'No file selected. Ready. Select a CSV file.';
            // startButton remains disabled
        }
    });

    // --- Start Button Listener ---
    startButton.addEventListener('click', function() {
        clearCountdown();
        clearCooldownDisplayUpdater(); // Stop any active UI updaters

        if (csvFileInput.files.length === 0) {
            statusDisplay.textContent = 'Error: No CSV file selected.';
            return;
        }
        const file = csvFileInput.files[0];
        handleFileProcessing(file); // This will parse and then attempt to send to background
    });

    // --- Handle File Processing (Parsing) ---
    function handleFileProcessing(file) {
        startButton.disabled = true;
        csvFileInput.disabled = true; // Disable while parsing and attempting to start
        statusDisplay.textContent = `Reading ${file.name}...`;
        channelUrlsToProcess = [];

        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const lines = text.split('\n');
            let headerSkipped = false;

            if (lines.length === 0) {
                statusDisplay.textContent = 'Error: CSV file is empty.';
                resetControls(); // This enables CSV input again
                return;
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                if (!headerSkipped && line.toLowerCase() === "channel id,channel url,channel title") {
                    headerSkipped = true;
                    console.log("Skipped header row:", line);
                    continue;
                }

                const columns = line.split(',');
                let potentialUrl = "";

                if (columns.length === 1) {
                    potentialUrl = columns[0].trim();
                } else if (columns.length > 1) {
                    potentialUrl = columns[1].trim();
                } else {
                    console.warn(`Skipped line with no processable columns: ${line} from line: ${i + 1}`);
                    continue;
                }

                if (potentialUrl.startsWith('"') && potentialUrl.endsWith('"')) {
                    potentialUrl = potentialUrl.substring(1, potentialUrl.length - 1);
                }

                if (isValidYouTubeChannelUrl(potentialUrl)) { // Uses global helper
                    channelUrlsToProcess.push(potentialUrl);
                } else {
                    if (!(headerSkipped && i === lines.findIndex(l => l.toLowerCase() === "channel id,channel url,channel title") && potentialUrl.toLowerCase() === "channel url")) {
                         console.warn(`Skipped invalid or non-YouTube URL: ${potentialUrl} from line: ${i + 1}`);
                    }
                }
            } // End of for loop

            if (channelUrlsToProcess.length > 0) {
                // Status will be updated based on background response
                console.log("Attempting to send URLs to background:", channelUrlsToProcess);
                chrome.runtime.sendMessage(
                    { action: "startProcessingUrls", urls: channelUrlsToProcess },
                    handleBackgroundResponseForStart // Use the dedicated handler
                );
            } else {
                statusDisplay.textContent = 'Error: No valid YouTube channel URLs found in the CSV.';
                resetControls(); // This enables CSV input again
            }
        }; // End of reader.onload

        reader.onerror = function(e) {
            statusDisplay.textContent = 'Error reading file.';
            console.error("FileReader error:", e);
            resetControls(); // This enables CSV input again
        };
        reader.readAsText(file);
    } // End of handleFileProcessing

    // --- Handle Background Response for Start ---
    function handleBackgroundResponseForStart(response) {
        if (chrome.runtime.lastError) {
            console.error("Error sending message to background:", chrome.runtime.lastError.message);
            statusDisplay.textContent = `Error: ${chrome.runtime.lastError.message}.`;
            resetControls(false); // Re-enable file input, keep start disabled until resolved
            startButton.disabled = true;
        } else if (response) {
            if (response.status === "received") {
                statusDisplay.textContent = `Processing up to ${response.count} URLs. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used.`;
                // Controls (startButton, csvFileInput) remain disabled while background processes
            } else if (response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                displayHardCooldown(response.remainingMs);
                // resetControls(false) is implicitly handled by displayHardCooldown re-enabling file input
                startButton.disabled = true; // Ensure start button is disabled
            } else if (response.status === "session_limit") {
                statusDisplay.textContent = `${response.message} (${response.linksUsedInSession}/${response.maxSessionLinks})`;
                resetControls(false); // Re-enable file input
                startButton.disabled = true; // Session limit reached
            } else { // Other errors from background
                statusDisplay.textContent = "Background error: " + (response.message || "Unknown");
                resetControls(false); // Re-enable file input
                startButton.disabled = true;
            }
        } else {
             statusDisplay.textContent = "No response from background. Try reloading extension.";
             resetControls(false); // Re-enable file input
             startButton.disabled = true;
        }
    }

    // --- Message Listener from Background ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "showCountdown") {
            statusDisplay.textContent = `[${message.current}/${message.total} this batch] Presenting: ${message.channelName}`;
            startVisualCountdown(message.duration);
            sendResponse({status: "countdown_started"}); // Acknowledge
        } else if (message.action === "processingCompleteWithCooldown") {
            clearCountdown();
            countdownDisplay.style.display = "none";
            const cooldownEnds = new Date(message.cooldownUntil).toLocaleTimeString();
            statusDisplay.textContent = `Batch complete. ${message.linksUsedInSession}/${message.maxSessionLinks} session links used. Hard cooldown until ${cooldownEnds}.`;
            displayHardCooldown(message.cooldownUntil - Date.now());
            // resetControls(true) // Don't clear file, let displayHardCooldown handle UI
            csvFileInput.value = ''; // Clear file input after successful batch & cooldown
            startButton.disabled = true; // Start button remains disabled during cooldown
        } else if (message.action === "processingCompleteNoCooldown") {
            clearCountdown();
            countdownDisplay.style.display = "none";
            statusDisplay.textContent = `${message.message} (${message.linksUsedInSession}/${message.maxSessionLinks} total session links used).`;
            resetControls(true); // Clear file input, ready for new selection
            checkUsageAndSetButtonState(false); // Update UI based on new session state
        }
        return true; // Indicate async response if any handler needs it
    });

    // --- UI Update Functions ---
    function displayHardCooldown(remainingMs) {
        clearCooldownDisplayUpdater(); // Clear any previous timer
        csvFileInput.disabled = false; // Allow selecting a new file during cooldown
        startButton.disabled = true;   // But cannot start

        if (remainingMs > 0) {
            statusDisplay.textContent = `Hard Cooldown! Remaining: ${formatTime(remainingMs)}`; // Uses global helper
            cooldownUpdateInterval = setInterval(() => {
                // Ask background for the authoritative current cooldown status
                chrome.runtime.sendMessage({action: "checkCooldown"}, response => {
                    if (chrome.runtime.lastError) {
                        console.warn("Error checking cooldown during interval:", chrome.runtime.lastError.message);
                        updateUIAfterCooldownOrSessionReset(); // Try to recover UI
                        return;
                    }
                    if (response && response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                        if (response.remainingMs > 0) {
                            statusDisplay.textContent = `Hard Cooldown! Remaining: ${formatTime(response.remainingMs)}`;
                        } else { // Cooldown just finished
                            updateUIAfterCooldownOrSessionReset(response);
                        }
                    } else { // Cooldown ended or other state (e.g., session info if not hard cooldown)
                        updateUIAfterCooldownOrSessionReset(response);
                    }
                });
            }, 1000); // Update display every second
        } else { // remainingMs <= 0 initially
            updateUIAfterCooldownOrSessionReset(); // Call with no specific usageInfo to get defaults
        }
    }

    function updateUIAfterCooldownOrSessionReset(usageInfo = null) {
        clearCooldownDisplayUpdater();
        csvFileInput.disabled = false; // Always allow file input to be enabled here

        if (usageInfo) {
            if (usageInfo.reason === "session_limit_reached" && !usageInfo.allowProcessing) {
                statusDisplay.textContent = `Session limit reached (${usageInfo.linksUsedInSession}/${usageInfo.maxSessionLinks}). Wait for reset.`;
                startButton.disabled = true;
            } else { // OK to process or just general info
                 statusDisplay.textContent = `Ready. Session: ${usageInfo.linksUsedInSession}/${usageInfo.maxSessionLinks} used.`;
                 // Enable startButton only if a valid file is already selected
                 startButton.disabled = !(csvFileInput.files && csvFileInput.files.length > 0 && csvFileInput.files[0].name.endsWith('.csv') && usageInfo.allowProcessing);
            }
        } else { // Called when cooldown finishes, or initially if no cooldown was active
            statusDisplay.textContent = "Ready. Select a CSV file.";
            // Enable startButton only if a valid file is already selected
            startButton.disabled = !(csvFileInput.files && csvFileInput.files.length > 0 && csvFileInput.files[0].name.endsWith('.csv'));
        }
    }

    function checkUsageAndSetButtonState(isFileCurrentlySelectedAndValid = false, statusMsgIfReadyAndFileSelected = null) {
        // This function is called when popup opens or file is selected
        chrome.runtime.sendMessage({action: "checkCooldown"}, response => {
            if (chrome.runtime.lastError) {
                statusDisplay.textContent = "Error checking status. Try reloading.";
                startButton.disabled = true;
                csvFileInput.disabled = false;
                return;
            }
            if (response) {
                if (response.status === "cooldown_active" && response.reason === "hard_cooldown") {
                    displayHardCooldown(response.remainingMs);
                    // displayHardCooldown handles disabling startButton and enabling csvFileInput
                } else if (response.status === "usage_info") { // General usage info
                    clearCooldownDisplayUpdater(); // Stop any active cooldown display
                    csvFileInput.disabled = false; // File input always enabled if not hard cooldown

                    if (response.allowProcessing && isFileCurrentlySelectedAndValid) {
                        startButton.disabled = false;
                        statusDisplay.textContent = statusMsgIfReadyAndFileSelected || `Ready. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used. ${response.linksAvailableInSession} available.`;
                    } else if (!response.allowProcessing && response.reason === "session_limit_reached") {
                        startButton.disabled = true;
                        statusDisplay.textContent = `Session limit (${response.maxSessionLinks}) reached. Wait for reset.`;
                    } else { // Not allowing processing, or no file selected, or invalid file
                        startButton.disabled = true;
                        if (isFileCurrentlySelectedAndValid && !response.allowProcessing) { // Valid file, but can't process (e.g. session limit)
                             statusDisplay.textContent = `File selected. Session limit (${response.maxSessionLinks}) reached.`;
                        } else if (isFileCurrentlySelectedAndValid && response.allowProcessing) { // Should have been caught by first if in this block
                             statusDisplay.textContent = statusMsgIfReadyAndFileSelected || `Ready. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used. ${response.linksAvailableInSession} available.`;
                        } else if (csvFileInput.value === '') { // No file selected
                             statusDisplay.textContent = `Ready. Session: ${response.linksUsedInSession}/${response.maxSessionLinks} used. Select CSV.`;
                        }
                        // If file is selected but not valid CSV, the file input's 'change' handler already set the error message.
                    }
                }
            } else {
                statusDisplay.textContent = "Could not get status from background.";
                startButton.disabled = true; // Safer default
                csvFileInput.disabled = false;
            }
        });
    }

    // --- Other Helper Functions ---
    function startVisualCountdown(durationSeconds) {
        clearCountdown();
        let timeLeft = durationSeconds;
        countdownDisplay.textContent = `${timeLeft}s`;
        countdownDisplay.style.display = "block";

        countdownInterval = setInterval(() => {
            timeLeft--;
            countdownDisplay.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearCountdown();
                countdownDisplay.style.display = "none";
            }
        }, 1000);
    }

    function clearCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function clearCooldownDisplayUpdater() {
        if (cooldownUpdateInterval) {
            clearInterval(cooldownUpdateInterval);
            cooldownUpdateInterval = null;
        }
    }

    function resetControls(clearFile = true) {
        // Most control enabling/disabling is now handled by checkUsageAndSetButtonState
        // or displayHardCooldown
        csvFileInput.disabled = false; // Generally, allow file selection
        if (clearFile) {
            csvFileInput.value = ''; // Clear the selected file
            // Status display will be updated by checkUsageAndSetButtonState or other flows
        }
        // Start button state is determined by cooldown/session status
    }

    // Initial check when popup loads
    checkUsageAndSetButtonState(csvFileInput.files && csvFileInput.files.length > 0 && csvFileInput.files[0].name.endsWith('.csv'));
});
