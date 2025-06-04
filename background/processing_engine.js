// background/processing_engine.js
import {
    MAX_CHANNELS_PER_BATCH,
    INTERACTIVE_WINDOW_SECONDS,
    POST_INTERACTIVE_DELAY_MS,
    CURRENT_SESSION_LINK_ALLOWANCE
} from '../shared/constants.js';
import { sleep } from '../shared/helpers.js';
import { recordLinkProcessed, triggerHardCooldown, getUsageState } from './cooldown_manager.js';

export async function processUrls(urls, linksAvailableForThisBatchFromManager) {
    // Determine how many URLs to actually process in this specific run
    // Limited by MAX_CHANNELS_PER_BATCH and what's available in the current session allowance
    const numToProcess = Math.min(urls.length, linksAvailableForThisBatchFromManager, MAX_CHANNELS_PER_BATCH);

    if (numToProcess <= 0) {
        console.log("No links to process in this batch or session allowance met.");
        chrome.runtime.sendMessage({
            action: "processingCompleteNoCooldown",
            message: "No links processed (batch limit or session allowance met)."
        });
        return;
    }

    console.log(`Processing batch of up to ${numToProcess} channels (available: ${linksAvailableForThisBatchFromManager}).`);
    let channelsSuccessfullyPresentedThisRun = 0;

    for (let i = 0; i < numToProcess; i++) {
        const channelUrl = urls[i]; // Process from the start of the provided list
        const channelNumberOverall = (await getUsageState()).linksUsedInSession + 1; // For display

        let displayName = channelUrl.substring(channelUrl.lastIndexOf('/') + 1);
        if (displayName.startsWith('@')) displayName = displayName.substring(1);
        if (displayName.startsWith('UC') && displayName.length > 20) displayName = "Channel";

        console.log(`Preparing channel (session link #${channelNumberOverall}): ${displayName} (${channelUrl})`);

        // Send message to popup for countdown display
        chrome.runtime.sendMessage({
            action: "showCountdown",
            channelName: displayName,
            channelUrl: channelUrl,
            duration: INTERACTIVE_WINDOW_SECONDS,
            // Display based on current progress in this specific batch run
            current: channelsSuccessfullyPresentedThisRun + 1,
            total: numToProcess
        });

        try {
            await chrome.tabs.create({ url: channelUrl, active: true });
            await recordLinkProcessed(); // Record it only if tab creation was attempted (success assumed for now)
            channelsSuccessfullyPresentedThisRun++;
        } catch (error) {
            console.error(`Error opening tab for ${channelUrl}:`, error);
            // Don't increment linksUsedInSession or channelsSuccessfullyPresentedThisRun if tab fails
        }

        console.log(`Waiting ${INTERACTIVE_WINDOW_SECONDS}s for user interaction on ${displayName}...`);
        await sleep(INTERACTIVE_WINDOW_SECONDS * 1000);

        if (i < numToProcess - 1) { // If not the last link in THIS BATCH
            console.log(`Waiting ${POST_INTERACTIVE_DELAY_MS / 1000}s before next channel...`);
            await sleep(POST_INTERACTIVE_DELAY_MS);
        }
    } // End of for loop

    console.log(`Finished processing this run. ${channelsSuccessfullyPresentedThisRun} channels were presented.`);
    let finalUsageState = await getUsageState(); // Get the latest state

    if (finalUsageState.linksUsedInSession >= CURRENT_SESSION_LINK_ALLOWANCE) {
        finalUsageState = await triggerHardCooldown(); // triggerHardCooldown returns the updated state
        chrome.runtime.sendMessage({
            action: "processingCompleteWithCooldown",
            batchSize: channelsSuccessfullyPresentedThisRun,
            cooldownUntil: finalUsageState.hardCooldownUntil,
            linksUsedInSession: finalUsageState.linksUsedInSession,
            maxSessionLinks: CURRENT_SESSION_LINK_ALLOWANCE
        });
    } else {
        chrome.runtime.sendMessage({
            action: "processingCompleteNoCooldown",
            message: `${channelsSuccessfullyPresentedThisRun} channels presented. ${finalUsageState.linksUsedInSession}/${CURRENT_SESSION_LINK_ALLOWANCE} session links used.`,
            linksUsedInSession: finalUsageState.linksUsedInSession,
            maxSessionLinks: CURRENT_SESSION_LINK_ALLOWANCE
        });
    }
}

// --- MODIFIED FUNCTION for extracting channel URL from video page ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'; // Relative to extension root

async function hasOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    if (chrome.runtime.getContexts) { // MV3 way to check for existing contexts
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl]
        });
        return contexts.length > 0;
    } else { // Fallback for older Chrome versions or if getContexts is not available
        // This is less reliable
        // @ts-ignore - clients is a global in service workers
        const matchedClients = await clients.matchAll();
        for (const client of matchedClients) {
            if (client.url === offscreenUrl) return true;
        }
        return false;
    }
}

let creatingOffscreenDocument = null; // Promise to prevent race conditions

export async function extractChannelUrlFromVideoPage(videoUrl) {
    try {
        console.log(`BG: Fetching video page: ${videoUrl}`);
        const response = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36' }
        });

        if (!response.ok) {
            return { error: `Failed to fetch video page (status: ${response.status}).` };
        }
        const htmlText = await response.text();
        console.log(`BG: Fetched HTML, length: ${htmlText.length}. Preparing offscreen document.`);

        // Ensure only one attempt to create the offscreen document is in progress
        if (!creatingOffscreenDocument) {
            creatingOffscreenDocument = (async () => {
                if (!(await hasOffscreenDocument())) {
                    console.log("BG: Creating offscreen document.");
                    await chrome.offscreen.createDocument({
                        url: OFFSCREEN_DOCUMENT_PATH,
                        reasons: [chrome.offscreen.Reason.DOM_PARSER],
                        justification: 'Parse HTML to extract YouTube channel URL',
                    }).catch(err => {
                        console.error("BG: Error creating offscreen document:", err);
                        creatingOffscreenDocument = null; // Reset lock on error
                        throw err; // Re-throw to be caught by outer try-catch
                    });
                }
                creatingOffscreenDocument = null; // Reset lock after successful creation or if it already existed
            })();
        }
        await creatingOffscreenDocument; // Wait for creation attempt to complete


        // Send HTML to offscreen document for parsing and get a promise for the result
        return new Promise((resolve) => {
            const listener = (messageFromOffscreen) => {
                // Check if the message is the one we're waiting for
                if (messageFromOffscreen.action === 'parseHtmlResult') {
                    chrome.runtime.onMessage.removeListener(listener); // Clean up
                    console.log("BG: Received result from offscreen:", messageFromOffscreen);
                    if (messageFromOffscreen.channelUrl) {
                        resolve({ channelUrl: messageFromOffscreen.channelUrl });
                    } else {
                        resolve({ error: messageFromOffscreen.error || "BG: Unknown parsing error from offscreen." });
                    }
                }
            };
            chrome.runtime.onMessage.addListener(listener);

            console.log("BG: Sending HTML to offscreen document for parsing.");
            chrome.runtime.sendMessage({
                target: 'offscreen', // Crucial for offscreen.js to pick it up
                action: 'parseHtmlForChannelUrl',
                htmlText: htmlText,
                videoUrl: videoUrl
            }).catch(err => { // Catch error if sending message to offscreen fails (e.g. if it closed unexpectedly)
                console.error("BG: Error sending message to offscreen:", err);
                chrome.runtime.onMessage.removeListener(listener); // Clean up
                resolve({ error: "BG: Failed to communicate with offscreen parser." });
            });
        });

    } catch (error) {
        console.error("BG: Error during channel extraction:", error);
        return { error: `BG: Extraction failed: ${error.message}` };
    }
    // Note: Consider when to close the offscreen document.
    // If you only need it for this operation, you could close it.
    // If you might need it again soon, keeping it open for a short while can be more efficient.
    // For now, let's leave it open. It closes when the service worker becomes inactive.
    // Or you can explicitly call: if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
}

// --- NEW FUNCTION for fetching and initiating scan of a webpage ---
const OFFSCREEN_DOCUMENT_PATH_SCAN = 'offscreen.html'; // Can be same offscreen doc

async function hasOffscreenDocumentForScan() { // Can reuse or adapt previous hasOffscreenDocument
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH_SCAN);
    if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
        return contexts.length > 0;
    } // else { /* ... fallback ... */ }
    return false; // Simplified fallback
}

let creatingOffscreenScanDocument = null;

export async function fetchAndScanWebpage(pageUrl) {
    try {
        console.log(`BG: Fetching webpage for scanning: ${pageUrl}`);
        const response = await fetch(pageUrl); // Default User-Agent is fine for most sites

        if (!response.ok) {
            return { error: `Failed to fetch webpage (status: ${response.status} ${response.statusText}).` };
        }
        const htmlText = await response.text();
        console.log(`BG: Fetched webpage HTML, length: ${htmlText.length}. Preparing offscreen for scan.`);

        if (!creatingOffscreenScanDocument) {
            creatingOffscreenScanDocument = (async () => {
                if (!(await hasOffscreenDocumentForScan())) {
                    console.log("BG: Creating offscreen document for webpage scan.");
                    await chrome.offscreen.createDocument({
                        url: OFFSCREEN_DOCUMENT_PATH_SCAN,
                        reasons: [chrome.offscreen.Reason.DOM_PARSER],
                        justification: 'Parse HTML from arbitrary webpage to find YouTube links',
                    }).catch(err => {
                        console.error("BG: Error creating offscreen for scan:", err);
                        creatingOffscreenScanDocument = null; throw err;
                    });
                }
                creatingOffscreenScanDocument = null;
            })();
        }
        await creatingOffscreenScanDocument;


        return new Promise((resolve) => {
            const listener = (messageFromOffscreen) => {
                if (messageFromOffscreen.action === 'scanHtmlResult') {
                    chrome.runtime.onMessage.removeListener(listener);
                    console.log("BG: Received scan result from offscreen:", messageFromOffscreen);
                    resolve(messageFromOffscreen); // Pass the whole object { foundUrls?, error?, message? }
                }
            };
            chrome.runtime.onMessage.addListener(listener);

            console.log("BG: Sending webpage HTML to offscreen for scanning.");
            chrome.runtime.sendMessage({
                target: 'offscreen',
                action: 'scanHtmlForYouTubeChannels',
                htmlText: htmlText,
                basePageUrl: pageUrl // Send the original page URL as base
            }).catch(err => {
                console.error("BG: Error sending message to offscreen for scan:", err);
                chrome.runtime.onMessage.removeListener(listener);
                resolve({ error: "BG: Failed to communicate with offscreen scanner." });
            });
        });

    } catch (error) {
        console.error("BG: Error during webpage fetch/scan setup:", error);
        return { error: `BG: Webpage scan failed: ${error.message}` };
    }
}
