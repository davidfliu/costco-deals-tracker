/**
 * Core TypeScript interfaces for the Costco Travel Watcher
 */

/**
 * Target configuration for monitoring a specific Costco Travel URL
 */
export interface Target {
  /** Costco Travel URL to monitor */
  url: string;
  /** CSS selector for promotion container */
  selector: string;
  /** Human-readable name for the target */
  name?: string;
  /** Additional context or notes */
  notes?: string;
  /** Whether to process this target (default: true) */
  enabled?: boolean;
}

/**
 * Promotion object extracted from Costco Travel pages
 */
export interface Promotion {
  /** Stable hash of promotion content */
  id: string;
  /** Promotion title */
  title: string;
  /** Benefit description */
  perk: string;
  /** Valid date range */
  dates: string;
  /** Price information */
  price: string;
}

/**
 * Current state of a target URL for change detection
 */
export interface TargetState {
  /** Hash of current promotions array */
  hash: string;
  /** Current promotion list */
  promos: Promotion[];
  /** Last update timestamp in ISO format */
  lastSeenISO: string;
}

/**
 * Result of change detection between current and previous promotions
 */
export interface ChangeResult {
  /** Whether any material changes were detected */
  hasChanges: boolean;
  /** Promotions that were added */
  added: Promotion[];
  /** Promotions that were removed */
  removed: Promotion[];
  /** Promotions that were modified */
  changed: Array<{
    previous: Promotion;
    current: Promotion;
  }>;
  /** Summary message describing the changes */
  summary: string;
}

/**
 * Environment variables available to the Cloudflare Worker
 */
export interface Env {
  /** KV namespace for storing targets, state, and history */
  DEAL_WATCHER: KVNamespace;
  /** Admin token for API authentication */
  ADMIN_TOKEN: string;
  /** Slack webhook URL for notifications */
  SLACK_WEBHOOK: string;
}

/**
 * Historical snapshot stored in KV
 */
export interface HistoricalSnapshot {
  /** Promotions at the time of snapshot */
  promos: Promotion[];
  /** Hash of the promotions */
  hash: string;
  /** Timestamp when snapshot was created */
  timestamp: string;
}