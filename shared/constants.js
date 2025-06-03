// shared/constants.js
export const MAX_CHANNELS_PER_BATCH = 15; // This is the most a single "click" will process
export const INTERACTIVE_WINDOW_SECONDS = 10;
export const POST_INTERACTIVE_DELAY_MS = 3000;

// Cooldowns and Limits
export const HARD_COOLDOWN_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour hard cooldown
export const SESSION_RESET_DURATION_MS_FREE = 60000 //1 * 60 * 60 * 1000; // 1 hour inactivity for session reset (free)
// export const SESSION_RESET_DURATION_MS_PREMIUM = 2 * 60 * 60 * 1000; // For later
export const SESSION_LINK_ALLOWANCE_FREE = 15;
// export const SESSION_LINK_ALLOWANCE_PREMIUM = 50; // For later

// For now, we assume free user
export const CURRENT_SESSION_RESET_DURATION_MS = SESSION_RESET_DURATION_MS_FREE;
export const CURRENT_SESSION_LINK_ALLOWANCE = SESSION_LINK_ALLOWANCE_FREE;
