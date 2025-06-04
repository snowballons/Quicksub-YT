// background/background_main.js
console.log("Background service worker v2.5 (Webpage Scan) started.");

import { canProcessStart, clearAllUsageStateForTesting } from './cooldown_manager.js';
import { processUrls, fetchAndScanWebpage } from './processing_engine.js'; // Added fetchAndScanWebpage

chrome.runtime.onInstalled.addListener(async () => {
  console.log("YouTube Timed Subscriber extension installed/updated.");
  // await clearAllUsageStateForTesting(); // For testing: uncomment to clear all state
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startProcessingUrls") {
    (async () => {
        const processCheck = await canProcessStart();

        if (!processCheck.allowProcessing) {
            if (processCheck.reason === "hard_cooldown") {
                sendResponse({ status: "cooldown_active", remainingMs: processCheck.remainingMs, reason: "hard_cooldown" });
            } else if (processCheck.reason === "session_limit_reached") {
                sendResponse({
                    status: "session_limit",
                    message: `Session link limit (${processCheck.maxSessionLinks}) reached.`,
                    linksUsedInSession: processCheck.linksUsedInSession,
                    maxSessionLinks: processCheck.maxSessionLinks
                });
            }
        } else {
            console.log("Background received URLs for processing:", message.urls);
            if (message.urls && message.urls.length > 0) {
                // Send acknowledgment with available links for THIS BATCH
                sendResponse({
                    status: "received",
                    count: Math.min(message.urls.length, processCheck.linksAvailableInSession), // How many will actually be tried
                    linksAvailableInSession: processCheck.linksAvailableInSession,
                    linksUsedInSession: processCheck.linksUsedInSession,
                    maxSessionLinks: processCheck.maxSessionLinks
                });
                // Pass the number of links the processing engine should attempt from the available session links
                processUrls(message.urls, processCheck.linksAvailableInSession);
            } else {
                sendResponse({ status: "error", message: "No URLs received or empty list." });
            }
        }
    })();
    return true; // Crucial for async sendResponse
  } else if (message.action === "checkCooldown") { // Renamed to checkUsage for clarity
    (async () => {
        const processCheck = await canProcessStart(); // This gives comprehensive status
        if (!processCheck.allowProcessing && processCheck.reason === "hard_cooldown") {
             sendResponse({ status: "cooldown_active", remainingMs: processCheck.remainingMs, reason: "hard_cooldown" });
        } else { // Session limit or OK to process
            sendResponse({
                status: "usage_info", // More general status
                allowProcessing: processCheck.allowProcessing,
                reason: processCheck.reason, // "ok" or "session_limit_reached"
                linksAvailableInSession: processCheck.linksAvailableInSession,
                linksUsedInSession: processCheck.linksUsedInSession,
                maxSessionLinks: processCheck.maxSessionLinks
            });
        }
    })();
    return true;
  } else if (message.action === "extractChannelFromVideo") { // Make this dormant
    console.log("Background received 'extractChannelFromVideo' request (feature currently deferred):", message.videoUrl);
    sendResponse({ error: "Extracting channels from video URLs is currently not supported." });
    // No async work, so return true is not strictly needed but harmless.
    return true;
  } else if (message.action === "scanWebpageForChannels") { // NEW HANDLER
    (async () => {
        if (!message.pageUrl) {
            sendResponse({ error: "No page URL provided for scanning." });
            return;
        }
        console.log("BG: Received request to scan webpage:", message.pageUrl);
        const result = await fetchAndScanWebpage(message.pageUrl);
        sendResponse(result); // result is { foundUrls?, error?, message? }
    })();
    return true; // Crucial for async response
  }
});
