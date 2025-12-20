/**
 * Extension configuration
 *
 * Note: UI extensions don't have access to process.env,
 * so we use a simple config file for build-time toggles.
 */

/**
 * Enable debug logging throughout the extension.
 * Set to `false` for production builds.
 */
export const DEBUG_MODE = false;

/**
 * API timeout in milliseconds
 */
export const API_TIMEOUT = 10000;

/**
 * Number of recent transactions to display
 */
export const MAX_TRANSACTIONS_DISPLAY = 5;

/**
 * Token refresh interval in milliseconds (4 minutes)
 * Tokens expire in 5 minutes, so refresh before expiry
 */
export const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000;
