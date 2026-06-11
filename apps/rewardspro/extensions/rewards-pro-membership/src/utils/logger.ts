/**
 * Centralized logging utility for the extension
 *
 * All debug/info logs are gated by DEBUG_MODE config.
 * Errors and warnings are always logged.
 */

import { DEBUG_MODE } from '../config';

const PREFIX = '[Membership]';

/**
 * Logger with debug mode awareness
 */
export const logger = {
  /**
   * Debug-level logging (only when DEBUG_MODE is true)
   */
  debug: (...args: unknown[]): void => {
    if (DEBUG_MODE) {
      console.log(PREFIX, ...args);
    }
  },

  /**
   * Info-level logging (only when DEBUG_MODE is true)
   */
  info: (...args: unknown[]): void => {
    if (DEBUG_MODE) {
      console.info(PREFIX, ...args);
    }
  },

  /**
   * Warning-level logging (always logged)
   */
  warn: (...args: unknown[]): void => {
    console.warn(PREFIX, ...args);
  },

  /**
   * Error-level logging (always logged)
   */
  error: (...args: unknown[]): void => {
    console.error(PREFIX, ...args);
  },

  /**
   * Log object with pretty formatting (debug only)
   */
  debugObject: (label: string, obj: unknown): void => {
    if (DEBUG_MODE) {
      console.log(PREFIX, label, JSON.stringify(obj, null, 2));
    }
  },
};

export default logger;
