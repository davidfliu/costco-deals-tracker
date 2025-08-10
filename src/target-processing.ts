/**
 * Core target processing logic for the Costco Travel Watcher
 */

import { Target, TargetState, ChangeResult, Promotion, Env, HistoricalSnapshot } from "./types";
import { 
  fetchContent, 
  parsePromotions, 
  detectChanges, 
  filterMaterialChanges,
  formatSlackMessage,
  sendSlackNotification,
  hashString
} from "./utils";
import { 
  readTargetState, 
  writeTargetState, 
  storeAndPruneSnapshot,
  readTargets 
} from "./kv-storage";
import { 
  OptimizedStateManager, 
  OptimizedTextProcessor, 
  PerformanceMonitor,
  RequestOptimizer 
} from "./performance";

/**
 * Result of processing a single target
 */
export interface TargetProcessingResult {
  /** Target that was processed */
  target: Target;
  /** Whether processing was successful */
  success: boolean;
  /** Error message if processing failed */
  error?: string;
  /** Change detection results if successful */
  changes?: ChangeResult;
  /** Whether notifications were sent */
  notificationSent?: boolean;
  /** Current promotions found */
  currentPromotions?: Promotion[];
  /** Processing duration in milliseconds */
  duration: number;
}

/**
 * Result of processing multiple targets in batch
 */
export interface BatchProcessingResult {
  /** Total number of targets processed */
  totalTargets: number;
  /** Number of targets processed successfully */
  successfulTargets: number;
  /** Number of targets that failed */
  failedTargets: number;
  /** Number of targets with material changes */
  targetsWithChanges: number;
  /** Number of notifications sent */
  notificationsSent: number;
  /** Individual target results */
  results: TargetProcessingResult[];
  /** Total processing duration in milliseconds */
  totalDuration: number;
  /** Summary message */
  summary: string;
}

/**
 * Processes a single target URL for promotional changes
 * 
 * @param env - Environment variables containing KV namespace and secrets
 * @param target - Target configuration to process
 * @returns Processing result with success status and change information
 */
export async function processTarget(env: Env, target: Target): Promise<TargetProcessingResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Processing target: ${target.name || target.url}`);
    
    // Step 1: Fetch HTML content from target URL
    let htmlContent: string;
    try {
      htmlContent = await fetchContent(target.url);
    } catch (error) {
      return {
        target,
        success: false,
        error: `Failed to fetch content: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime
      };
    }

    // Step 2: Parse promotions from HTML content
    let currentPromotions: Promotion[];
    try {
      currentPromotions = await parsePromotions(htmlContent, target.selector);
    } catch (error) {
      return {
        target,
        success: false,
        error: `Failed to parse promotions: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime
      };
    }

    // Step 3: Generate hash of current promotions for change detection
    const currentHash = await hashString(JSON.stringify(currentPromotions));
    const currentTimestamp = new Date().toISOString();
    
    const currentState: TargetState = {
      hash: currentHash,
      promos: currentPromotions,
      lastSeenISO: currentTimestamp
    };

    // Step 4: Read previous state for comparison
    let previousState: TargetState | null;
    try {
      previousState = await readTargetState(env, target.url);
    } catch (error) {
      console.warn(`Failed to read previous state for ${target.url}: ${error}`);
      previousState = null;
    }

    // Step 5: Detect changes between current and previous promotions
    let changes: ChangeResult;
    if (previousState) {
      const rawChanges = detectChanges(currentPromotions, previousState.promos);
      changes = filterMaterialChanges(rawChanges);
    } else {
      // First time processing this target - no changes to report
      changes = {
        hasChanges: false,
        added: [],
        removed: [],
        changed: [],
        summary: 'Initial state captured'
      };
    }

    // Step 6: Send Slack notification if material changes detected
    let notificationSent = false;
    if (changes.hasChanges && env.SLACK_WEBHOOK) {
      try {
        const message = formatSlackMessage(
          target.name || 'Costco Travel Deal',
          target.url,
          changes,
          currentTimestamp
        );
        
        await sendSlackNotification(env.SLACK_WEBHOOK, message);
        notificationSent = true;
        console.log(`Notification sent for ${target.name || target.url}: ${changes.summary}`);
      } catch (error) {
        console.error(`Failed to send notification for ${target.url}: ${error}`);
        // Don't fail the entire processing if notification fails
      }
    }

    // Step 7: Update state in KV storage
    try {
      await writeTargetState(env, target.url, currentState);
    } catch (error) {
      console.error(`Failed to update state for ${target.url}: ${error}`);
      // Don't fail processing if state update fails
    }

    // Step 8: Store historical snapshot if changes detected
    if (changes.hasChanges) {
      try {
        const snapshot: HistoricalSnapshot = {
          promos: currentPromotions,
          hash: currentHash,
          timestamp: currentTimestamp
        };
        
        await storeAndPruneSnapshot(env, target.url, snapshot);
      } catch (error) {
        console.error(`Failed to store historical snapshot for ${target.url}: ${error}`);
        // Don't fail processing if snapshot storage fails
      }
    }

    return {
      target,
      success: true,
      changes,
      notificationSent,
      currentPromotions,
      duration: Date.now() - startTime
    };

  } catch (error) {
    return {
      target,
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Processes all enabled targets from configuration in parallel with performance optimizations
 * 
 * @param env - Environment variables containing KV namespace and secrets
 * @returns Batch processing result with summary statistics
 */
export async function processBatchTargets(env: Env): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const monitor = new PerformanceMonitor();
  
  monitor.startTimer('batch-processing');
  
  try {
    // Step 1: Read targets configuration
    let targets: Target[];
    try {
      monitor.startTimer('read-targets');
      targets = await readTargets(env);
      monitor.endTimer('read-targets');
    } catch (error) {
      return {
        totalTargets: 0,
        successfulTargets: 0,
        failedTargets: 0,
        targetsWithChanges: 0,
        notificationsSent: 0,
        results: [],
        totalDuration: Date.now() - startTime,
        summary: `Failed to read targets configuration: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    // Step 2: Filter enabled targets
    const enabledTargets = targets.filter(target => target.enabled !== false);
    
    if (enabledTargets.length === 0) {
      return {
        totalTargets: 0,
        successfulTargets: 0,
        failedTargets: 0,
        targetsWithChanges: 0,
        notificationsSent: 0,
        results: [],
        totalDuration: Date.now() - startTime,
        summary: 'No enabled targets found in configuration'
      };
    }

    console.log(`Processing ${enabledTargets.length} enabled targets`);

    // Step 3: Process all targets in parallel with error isolation
    monitor.startTimer('process-targets');
    const processingPromises = enabledTargets.map(target => 
      processTarget(env, target).catch(error => ({
        target,
        success: false,
        error: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: 0
      } as TargetProcessingResult))
    );

    const results = await Promise.all(processingPromises);
    monitor.endTimer('process-targets');

    // Step 4: Calculate summary statistics
    const totalTargets = results.length;
    const successfulTargets = results.filter(r => r.success).length;
    const failedTargets = results.filter(r => !r.success).length;
    const targetsWithChanges = results.filter(r => r.success && r.changes?.hasChanges).length;
    const notificationsSent = results.filter(r => r.notificationSent).length;
    const batchDuration = monitor.endTimer('batch-processing');

    // Step 5: Generate summary message
    const summary = generateBatchSummary(
      totalTargets,
      successfulTargets,
      failedTargets,
      targetsWithChanges,
      notificationsSent
    );

    // Step 6: Log performance metrics (only in development/debug mode)
    if (process.env.NODE_ENV !== 'production') {
      const perfStats = monitor.getStats();
      console.log('Performance metrics:', perfStats);
    }

    // Step 7: Log results
    console.log(`Batch processing completed: ${summary}`);
    
    // Log individual failures for debugging
    results.filter(r => !r.success).forEach(result => {
      console.error(`Target ${result.target.name || result.target.url} failed: ${result.error}`);
    });

    // Log successful changes
    results.filter(r => r.success && r.changes?.hasChanges).forEach(result => {
      console.log(`Target ${result.target.name || result.target.url}: ${result.changes?.summary}`);
    });

    return {
      totalTargets,
      successfulTargets,
      failedTargets,
      targetsWithChanges,
      notificationsSent,
      results,
      totalDuration: batchDuration,
      summary
    };

  } catch (error) {
    return {
      totalTargets: 0,
      successfulTargets: 0,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      results: [],
      totalDuration: Date.now() - startTime,
      summary: `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Optimized version of processTarget that uses performance optimizations
 * 
 * @param env - Environment variables containing KV namespace and secrets
 * @param target - Target configuration to process
 * @param previousState - Pre-loaded previous state (null if not found)
 * @param textProcessor - Optimized text processor with caching
 * @returns Processing result with success status and change information
 */
async function processTargetOptimized(
  env: Env, 
  target: Target, 
  previousState: TargetState | null,
  textProcessor: OptimizedTextProcessor
): Promise<TargetProcessingResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Processing target: ${target.name || target.url}`);
    
    // Step 1: Fetch HTML content with optimized request
    let htmlContent: string;
    try {
      const response = await RequestOptimizer.optimizedFetch(target.url);
      htmlContent = await response.text();
    } catch (error) {
      return {
        target,
        success: false,
        error: `Failed to fetch content: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime
      };
    }

    // Step 2: Parse promotions from HTML content
    let currentPromotions: Promotion[];
    try {
      currentPromotions = await parsePromotions(htmlContent, target.selector);
    } catch (error) {
      return {
        target,
        success: false,
        error: `Failed to parse promotions: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime
      };
    }

    // Step 3: Generate hash using optimized text processor
    const currentHash = await textProcessor.hashString(JSON.stringify(currentPromotions));
    const currentTimestamp = new Date().toISOString();
    
    const currentState: TargetState = {
      hash: currentHash,
      promos: currentPromotions,
      lastSeenISO: currentTimestamp
    };

    // Step 4: Detect changes using pre-loaded previous state
    let changes: ChangeResult;
    if (previousState) {
      const rawChanges = detectChanges(currentPromotions, previousState.promos);
      changes = filterMaterialChanges(rawChanges);
    } else {
      // First time processing this target - no changes to report
      changes = {
        hasChanges: false,
        added: [],
        removed: [],
        changed: [],
        summary: 'Initial state captured'
      };
    }

    // Step 5: Send Slack notification if material changes detected
    let notificationSent = false;
    if (changes.hasChanges && env.SLACK_WEBHOOK) {
      try {
        const message = formatSlackMessage(
          target.name || 'Costco Travel Deal',
          target.url,
          changes,
          currentTimestamp
        );
        
        await sendSlackNotification(env.SLACK_WEBHOOK, message);
        notificationSent = true;
        console.log(`Notification sent for ${target.name || target.url}: ${changes.summary}`);
      } catch (error) {
        console.error(`Failed to send notification for ${target.url}: ${error}`);
        // Don't fail the entire processing if notification fails
      }
    }

    // Step 6: Store historical snapshot if changes detected (will be batched later)
    if (changes.hasChanges) {
      try {
        const snapshot: HistoricalSnapshot = {
          promos: currentPromotions,
          hash: currentHash,
          timestamp: currentTimestamp
        };
        
        await storeAndPruneSnapshot(env, target.url, snapshot);
      } catch (error) {
        console.error(`Failed to store historical snapshot for ${target.url}: ${error}`);
        // Don't fail processing if snapshot storage fails
      }
    }

    return {
      target,
      success: true,
      changes,
      notificationSent,
      currentPromotions,
      duration: Date.now() - startTime
    };

  } catch (error) {
    return {
      target,
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Generates a human-readable summary of batch processing results
 * 
 * @param totalTargets - Total number of targets processed
 * @param successfulTargets - Number of successful targets
 * @param failedTargets - Number of failed targets
 * @param targetsWithChanges - Number of targets with changes
 * @param notificationsSent - Number of notifications sent
 * @returns Summary string
 */
function generateBatchSummary(
  totalTargets: number,
  successfulTargets: number,
  failedTargets: number,
  targetsWithChanges: number,
  notificationsSent: number
): string {
  const parts: string[] = [];

  parts.push(`${totalTargets} target${totalTargets === 1 ? '' : 's'} processed`);
  
  if (successfulTargets > 0) {
    parts.push(`${successfulTargets} successful`);
  }
  
  if (failedTargets > 0) {
    parts.push(`${failedTargets} failed`);
  }
  
  if (targetsWithChanges > 0) {
    parts.push(`${targetsWithChanges} with changes`);
  }
  
  if (notificationsSent > 0) {
    parts.push(`${notificationsSent} notification${notificationsSent === 1 ? '' : 's'} sent`);
  }

  return parts.join(', ');
}