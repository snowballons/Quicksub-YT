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
