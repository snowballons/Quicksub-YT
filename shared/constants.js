// shared/constants.js

// Processing Configuration
export const MAX_CHANNELS_PER_BATCH = 15; // Maximum channels processed per batch
export const INTERACTIVE_WINDOW_SECONDS = 10; // Time user has to interact with each channel
export const POST_INTERACTIVE_DELAY_MS = 3000; // Delay between channels

// Cooldown and Session Management
export const HARD_COOLDOWN_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour hard cooldown after session limit
export const SESSION_RESET_DURATION_MS_FREE = 60000; // 1 minute inactivity resets session (for testing)
export const SESSION_LINK_ALLOWANCE_FREE = 15; // Free tier: 15 channels per session

// Future premium tier constants (commented for future use)
// export const SESSION_RESET_DURATION_MS_PREMIUM = 2 * 60 * 60 * 1000; // 2 hours for premium
// export const SESSION_LINK_ALLOWANCE_PREMIUM = 50; // 50 channels for premium

// Current active configuration (free tier)
export const CURRENT_SESSION_RESET_DURATION_MS = SESSION_RESET_DURATION_MS_FREE;
export const CURRENT_SESSION_LINK_ALLOWANCE = SESSION_LINK_ALLOWANCE_FREE;

// Debug mode flag for conditional logging
export const DEBUG_MODE = false; // Set to true for development debugging
