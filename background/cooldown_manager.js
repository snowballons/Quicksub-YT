// background/cooldown_manager.js
import {
    HARD_COOLDOWN_DURATION_MS,
    CURRENT_SESSION_RESET_DURATION_MS,
    CURRENT_SESSION_LINK_ALLOWANCE,
    DEBUG_MODE
} from '../shared/constants.js';

const USAGE_STATE_KEY = 'usageState';

// Default state if nothing is in storage
const defaultUsageState = {
    linksUsedInSession: 0,
    lastActivityTimestamp: 0,
    hardCooldownUntil: 0,
    // isPremiumUser: false // For later
};

/**
 * Gets the current usage state from storage.
 * Merges with default if some keys are missing.
 */
export async function getUsageState() {
    try {
        const result = await chrome.storage.local.get(USAGE_STATE_KEY);
        const storedState = result[USAGE_STATE_KEY] || {};
        // Merge with defaults to ensure all keys are present
        return { ...defaultUsageState, ...storedState };
    } catch (error) {
        console.error("Error getting usage state:", error);
        return { ...defaultUsageState }; // Return default on error
    }
}

/**
 * Updates the usage state in storage.
 * @param {object} updates - An object with keys to update.
 */
export async function updateUsageState(updates) {
    try {
        const currentState = await getUsageState();
        const newState = { ...currentState, ...updates };
        await chrome.storage.local.set({ [USAGE_STATE_KEY]: newState });
        if (DEBUG_MODE) console.log("Usage state updated:", newState);
        return newState;
    } catch (error) {
        console.error("Error updating usage state:", error);
        return null; // Indicate failure
    }
}

/**
 * Resets session if inactivity period has passed.
 * Modifies and returns the usageState.
 */
export function resetSessionIfNeeded(usageState) {
    if (!usageState.lastActivityTimestamp ||
        (Date.now() - usageState.lastActivityTimestamp > CURRENT_SESSION_RESET_DURATION_MS)) {

        if (usageState.linksUsedInSession > 0 || usageState.lastActivityTimestamp > 0) {
            if (DEBUG_MODE) console.log("Session reset due to inactivity.");
            usageState.linksUsedInSession = 0;
            // lastActivityTimestamp will be updated upon next activity.
            // No need to clear hardCooldownUntil here; it's independent.
        }
    }
    return usageState; // Return potentially modified state
}

/**
 * Checks if processing is allowed and determines available links.
 * This function now also handles session reset.
 */
export async function canProcessStart() {
    let usageState = await getUsageState();

    // 1. Check Hard Cooldown
    if (Date.now() < usageState.hardCooldownUntil) {
        return {
            allowProcessing: false,
            reason: "hard_cooldown",
            remainingMs: usageState.hardCooldownUntil - Date.now(),
            linksAvailableInSession: 0,
            linksUsedInSession: usageState.linksUsedInSession,
            maxSessionLinks: CURRENT_SESSION_LINK_ALLOWANCE
        };
    }

    // 2. Check Session & Reset if Necessary (modifies usageState in place if reset happens)
    usageState = resetSessionIfNeeded(usageState);
    // If session was reset, linksUsedInSession is now 0. Save this change.
    if (usageState.linksUsedInSession === 0 && usageState.lastActivityTimestamp !== 0) { // If it was reset
        await updateUsageState({ linksUsedInSession: 0 }); // Persist reset if it happened
    }


    // 3. Determine Links Available
    const linksAvailableInSession = CURRENT_SESSION_LINK_ALLOWANCE - usageState.linksUsedInSession;

    if (linksAvailableInSession <= 0) {
        return {
            allowProcessing: false,
            reason: "session_limit_reached",
            linksAvailableInSession: 0,
            linksUsedInSession: usageState.linksUsedInSession,
            maxSessionLinks: CURRENT_SESSION_LINK_ALLOWANCE
            // Note: Hard cooldown is triggered AFTER a batch USES UP the limit.
        };
    }

    return {
        allowProcessing: true,
        reason: "ok",
        linksAvailableInSession: linksAvailableInSession,
        linksUsedInSession: usageState.linksUsedInSession,
        maxSessionLinks: CURRENT_SESSION_LINK_ALLOWANCE
    };
}

/**
 * Records that a link has been successfully processed.
 * Increments linksUsedInSession and updates lastActivityTimestamp.
 */
export async function recordLinkProcessed() {
    const updates = {
        linksUsedInSession: (await getUsageState()).linksUsedInSession + 1,
        lastActivityTimestamp: Date.now()
    };
    return await updateUsageState(updates);
}

/**
 * Triggers the hard cooldown.
 */
export async function triggerHardCooldown() {
    const newCooldownUntil = Date.now() + HARD_COOLDOWN_DURATION_MS;
    const updatedState = await updateUsageState({ hardCooldownUntil: newCooldownUntil });
    console.log(`Hard cooldown triggered. Until: ${new Date(newCooldownUntil).toLocaleString()}`);
    return updatedState; // Return the full state including new cooldown time
}

/**
 * For testing: Clears all usage state.
 */
export async function clearAllUsageStateForTesting() {
    await chrome.storage.local.remove(USAGE_STATE_KEY);
    console.log("All usage state cleared for testing.");
}
