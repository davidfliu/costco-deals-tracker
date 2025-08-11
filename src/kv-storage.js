/**
 * KV storage operations for the Costco Travel Watcher
 */
import { generateStateKey, generateHistoryKey } from "./utils";
/**
 * Validates that a URL is safe and whitelisted for targets
 *
 * @param url - URL to validate
 * @returns True if URL is safe
 */
function validateTargetUrl(url) {
    try {
        const parsedUrl = new URL(url);
        // Only allow HTTPS for external requests
        if (parsedUrl.protocol !== 'https:') {
            return false;
        }
        // Block internal/private IP ranges and metadata endpoints
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname === 'localhost' ||
            hostname.startsWith('127.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
            hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
            hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
            hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
            hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
            hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
            hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
            hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
            hostname.startsWith('192.168.') ||
            hostname === '169.254.169.254' || // AWS/Azure metadata
            hostname === 'metadata.google.internal' || // GCP metadata
            hostname.endsWith('.internal') ||
            hostname.endsWith('.local') ||
            hostname.includes('169.254.') // Link-local addresses
        ) {
            return false;
        }
        // Only allow specific domains (whitelist approach)
        const allowedDomains = [
            'costcotravel.com',
            'costco.com',
            'www.costcotravel.com',
            'www.costco.com'
        ];
        return allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    }
    catch {
        return false;
    }
}
/**
 * Validates CSS selector for security
 *
 * @param selector - CSS selector to validate
 * @returns True if selector is safe
 */
function validateCssSelector(selector) {
    // Sanitize CSS selector - only allow safe patterns
    const selectorPattern = /^[.#]?[\w\-\s,.:>\[\]="'()]+$/;
    if (!selectorPattern.test(selector) || selector.length > 200) {
        return false;
    }
    // Block potentially dangerous patterns
    const dangerousPatterns = [
        /javascript:/i,
        /expression\(/i,
        /url\(/i,
        /@import/i,
        /behavior:/i
    ];
    return !dangerousPatterns.some(pattern => pattern.test(selector));
}
/**
 * Key used to store the targets configuration in KV
 */
const TARGETS_KEY = "targets";
/**
 * Validates a target configuration object
 *
 * @param target - Target object to validate
 * @returns True if target is valid
 */
export function validateTarget(target) {
    if (!target || typeof target !== 'object') {
        return false;
    }
    // Required fields
    if (typeof target.url !== 'string' || !target.url.trim()) {
        return false;
    }
    if (typeof target.selector !== 'string' || !target.selector.trim()) {
        return false;
    }
    // Validate URL with security checks
    if (!validateTargetUrl(target.url)) {
        return false;
    }
    // Validate CSS selector for security
    if (!validateCssSelector(target.selector)) {
        return false;
    }
    // Optional fields validation with length limits
    if (target.name !== undefined) {
        if (typeof target.name !== 'string' || target.name.length > 100 || target.name.length === 0) {
            return false;
        }
        // Sanitize name - no HTML tags or scripts
        if (/<[^>]+>/.test(target.name) || /javascript:/i.test(target.name)) {
            return false;
        }
    }
    if (target.notes !== undefined) {
        if (typeof target.notes !== 'string' || target.notes.length > 500) {
            return false;
        }
        // Sanitize notes - no HTML tags or scripts
        if (/<script[^>]*>/i.test(target.notes) || /javascript:/i.test(target.notes)) {
            return false;
        }
    }
    if (target.enabled !== undefined && typeof target.enabled !== 'boolean') {
        return false;
    }
    return true;
}
/**
 * Validates an array of target configurations
 *
 * @param targets - Array of targets to validate
 * @returns True if all targets are valid
 */
export function validateTargets(targets) {
    if (!Array.isArray(targets)) {
        return false;
    }
    return targets.every(target => validateTarget(target));
}
/**
 * Reads the targets configuration from KV storage
 *
 * @param env - Environment variables containing KV namespace
 * @returns Array of target configurations, empty array if not found or invalid
 */
export async function readTargets(env) {
    try {
        const targetsJson = await env.DEAL_WATCHER.get(TARGETS_KEY);
        if (!targetsJson) {
            return [];
        }
        const targets = JSON.parse(targetsJson);
        if (!validateTargets(targets)) {
            console.error('Invalid targets configuration found in KV storage');
            return [];
        }
        return targets;
    }
    catch (error) {
        console.error('Failed to read targets from KV storage:', error);
        return [];
    }
}
/**
 * Writes the targets configuration to KV storage
 *
 * @param env - Environment variables containing KV namespace
 * @param targets - Array of target configurations to store
 * @throws Error if targets are invalid or KV operation fails
 */
export async function writeTargets(env, targets) {
    if (!validateTargets(targets)) {
        throw new Error('Invalid targets configuration provided');
    }
    try {
        const targetsJson = JSON.stringify(targets, null, 2);
        await env.DEAL_WATCHER.put(TARGETS_KEY, targetsJson);
    }
    catch (error) {
        throw new Error(`Failed to write targets to KV storage: ${error}`);
    }
}
/**
 * Adds or updates a single target in the configuration
 *
 * @param env - Environment variables containing KV namespace
 * @param target - Target configuration to add or update
 * @throws Error if target is invalid or KV operation fails
 */
export async function upsertTarget(env, target) {
    if (!validateTarget(target)) {
        throw new Error('Invalid target configuration provided');
    }
    const targets = await readTargets(env);
    // Find existing target with same URL
    const existingIndex = targets.findIndex(t => t.url === target.url);
    if (existingIndex >= 0) {
        // Update existing target
        targets[existingIndex] = target;
    }
    else {
        // Add new target
        targets.push(target);
    }
    await writeTargets(env, targets);
}
/**
 * Removes a target from the configuration by URL
 *
 * @param env - Environment variables containing KV namespace
 * @param url - URL of the target to remove
 * @returns True if target was found and removed, false if not found
 * @throws Error if KV operation fails
 */
export async function removeTarget(env, url) {
    const targets = await readTargets(env);
    const initialLength = targets.length;
    const filteredTargets = targets.filter(t => t.url !== url);
    if (filteredTargets.length === initialLength) {
        return false; // Target not found
    }
    await writeTargets(env, filteredTargets);
    return true;
}
/**
 * Reads the current state for a target URL from KV storage
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to read state for
 * @returns Target state object, null if not found or invalid
 */
export async function readTargetState(env, url) {
    try {
        const stateKey = await generateStateKey(url);
        const stateJson = await env.DEAL_WATCHER.get(stateKey);
        if (!stateJson) {
            return null;
        }
        const state = JSON.parse(stateJson);
        if (!validateTargetState(state)) {
            console.error(`Invalid target state found for URL: ${url}`);
            return null;
        }
        return state;
    }
    catch (error) {
        console.error(`Failed to read target state for URL ${url}:`, error);
        return null;
    }
}
/**
 * Writes the current state for a target URL to KV storage
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to write state for
 * @param state - Target state object to store
 * @throws Error if state is invalid or KV operation fails
 */
export async function writeTargetState(env, url, state) {
    if (!validateTargetState(state)) {
        throw new Error('Invalid target state provided');
    }
    try {
        const stateKey = await generateStateKey(url);
        const stateJson = JSON.stringify(state, null, 2);
        await env.DEAL_WATCHER.put(stateKey, stateJson);
    }
    catch (error) {
        throw new Error(`Failed to write target state for URL ${url}: ${error}`);
    }
}
/**
 * Compares current state with previous state to determine if update is needed
 *
 * @param currentState - Current target state
 * @param previousState - Previous target state (can be null)
 * @returns True if state should be updated (different hash or no previous state)
 */
export function shouldUpdateState(currentState, previousState) {
    if (!previousState) {
        return true; // Always update if no previous state
    }
    // Update if hash is different (content changed)
    return currentState.hash !== previousState.hash;
}
/**
 * Updates the target state if it has changed
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to update state for
 * @param currentState - Current target state
 * @returns True if state was updated, false if no update was needed
 * @throws Error if state is invalid or KV operation fails
 */
export async function updateTargetStateIfChanged(env, url, currentState) {
    const previousState = await readTargetState(env, url);
    if (shouldUpdateState(currentState, previousState)) {
        await writeTargetState(env, url, currentState);
        return true;
    }
    return false;
}
/**
 * Validates a target state object
 *
 * @param state - State object to validate
 * @returns True if state is valid
 */
export function validateTargetState(state) {
    if (!state || typeof state !== 'object') {
        return false;
    }
    // Required fields
    if (typeof state.hash !== 'string' || !state.hash.trim()) {
        return false;
    }
    if (!Array.isArray(state.promos)) {
        return false;
    }
    if (typeof state.lastSeenISO !== 'string' || !state.lastSeenISO.trim()) {
        return false;
    }
    // Validate ISO timestamp format
    try {
        const date = new Date(state.lastSeenISO);
        if (isNaN(date.getTime())) {
            return false;
        }
    }
    catch {
        return false;
    }
    // Validate each promotion in the array
    for (const promo of state.promos) {
        if (!validatePromotion(promo)) {
            return false;
        }
    }
    return true;
}
/**
 * Validates a promotion object
 *
 * @param promo - Promotion object to validate
 * @returns True if promotion is valid
 */
function validatePromotion(promo) {
    if (!promo || typeof promo !== 'object') {
        return false;
    }
    // All fields are required and must be strings
    const requiredFields = ['id', 'title', 'perk', 'dates', 'price'];
    for (const field of requiredFields) {
        if (typeof promo[field] !== 'string') {
            return false;
        }
    }
    // ID should not be empty
    if (!promo.id.trim()) {
        return false;
    }
    return true;
}
/**
 * Deletes the state for a target URL from KV storage
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to delete state for
 * @throws Error if KV operation fails
 */
export async function deleteTargetState(env, url) {
    try {
        const stateKey = await generateStateKey(url);
        await env.DEAL_WATCHER.delete(stateKey);
    }
    catch (error) {
        throw new Error(`Failed to delete target state for URL ${url}: ${error}`);
    }
} /**
 *
Stores a historical snapshot for a target URL
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to store snapshot for
 * @param snapshot - Historical snapshot to store
 * @throws Error if snapshot is invalid or KV operation fails
 */
export async function storeHistoricalSnapshot(env, url, snapshot) {
    if (!validateHistoricalSnapshot(snapshot)) {
        throw new Error('Invalid historical snapshot provided');
    }
    try {
        const historyKey = await generateHistoryKey(url, snapshot.timestamp);
        const snapshotJson = JSON.stringify(snapshot, null, 2);
        await env.DEAL_WATCHER.put(historyKey, snapshotJson);
    }
    catch (error) {
        throw new Error(`Failed to store historical snapshot for URL ${url}: ${error}`);
    }
}
/**
 * Retrieves historical snapshots for a target URL
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to retrieve snapshots for
 * @param limit - Maximum number of snapshots to retrieve (default: 5)
 * @returns Array of historical snapshots, sorted by timestamp (newest first)
 */
export async function getHistoricalSnapshots(env, url, limit = 5) {
    try {
        const urlHash = await import('./utils').then(utils => utils.hashString(url));
        const prefix = `hist:${urlHash}:`;
        // List all history keys for this URL
        const listResult = await env.DEAL_WATCHER.list({ prefix });
        if (!listResult.keys || listResult.keys.length === 0) {
            return [];
        }
        // Sort keys by timestamp (newest first)
        const sortedKeys = listResult.keys
            .map(key => key.name)
            .sort((a, b) => {
            // Extract timestamp from key format: hist:<hash>:<timestamp>
            const timestampA = a.split(':')[2];
            const timestampB = b.split(':')[2];
            return timestampB.localeCompare(timestampA); // Descending order
        })
            .slice(0, limit); // Take only the requested number
        // Fetch and parse snapshots
        const snapshots = [];
        for (const key of sortedKeys) {
            try {
                const snapshotJson = await env.DEAL_WATCHER.get(key);
                if (snapshotJson) {
                    const snapshot = JSON.parse(snapshotJson);
                    if (validateHistoricalSnapshot(snapshot)) {
                        snapshots.push(snapshot);
                    }
                }
            }
            catch (error) {
                console.error(`Failed to parse historical snapshot ${key}:`, error);
                // Continue with other snapshots
            }
        }
        return snapshots;
    }
    catch (error) {
        console.error(`Failed to retrieve historical snapshots for URL ${url}:`, error);
        return [];
    }
}
/**
 * Prunes old historical snapshots, keeping only the most recent ones
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to prune snapshots for
 * @param keepCount - Number of snapshots to keep (default: 5)
 * @returns Number of snapshots that were deleted
 */
export async function pruneHistoricalSnapshots(env, url, keepCount = 5) {
    try {
        const urlHash = await import('./utils').then(utils => utils.hashString(url));
        const prefix = `hist:${urlHash}:`;
        // List all history keys for this URL
        const listResult = await env.DEAL_WATCHER.list({ prefix });
        if (!listResult.keys || listResult.keys.length <= keepCount) {
            return 0; // Nothing to prune
        }
        // Sort keys by timestamp (newest first)
        const sortedKeys = listResult.keys
            .map(key => key.name)
            .sort((a, b) => {
            // Extract timestamp from key format: hist:<hash>:<timestamp>
            const timestampA = a.split(':')[2];
            const timestampB = b.split(':')[2];
            return timestampB.localeCompare(timestampA); // Descending order
        });
        // Identify keys to delete (everything after keepCount)
        const keysToDelete = sortedKeys.slice(keepCount);
        // Delete old snapshots
        let deletedCount = 0;
        for (const key of keysToDelete) {
            try {
                await env.DEAL_WATCHER.delete(key);
                deletedCount++;
            }
            catch (error) {
                console.error(`Failed to delete historical snapshot ${key}:`, error);
                // Continue with other deletions
            }
        }
        return deletedCount;
    }
    catch (error) {
        console.error(`Failed to prune historical snapshots for URL ${url}:`, error);
        return 0;
    }
}
/**
 * Stores a snapshot and automatically prunes old ones
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to store snapshot for
 * @param snapshot - Historical snapshot to store
 * @param keepCount - Number of snapshots to keep after pruning (default: 5)
 * @throws Error if snapshot is invalid or KV operation fails
 */
export async function storeAndPruneSnapshot(env, url, snapshot, keepCount = 5) {
    // Store the new snapshot
    await storeHistoricalSnapshot(env, url, snapshot);
    // Prune old snapshots
    await pruneHistoricalSnapshots(env, url, keepCount);
}
/**
 * Validates a historical snapshot object
 *
 * @param snapshot - Snapshot object to validate
 * @returns True if snapshot is valid
 */
export function validateHistoricalSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return false;
    }
    // Required fields
    if (!Array.isArray(snapshot.promos)) {
        return false;
    }
    if (typeof snapshot.hash !== 'string' || !snapshot.hash.trim()) {
        return false;
    }
    if (typeof snapshot.timestamp !== 'string' || !snapshot.timestamp.trim()) {
        return false;
    }
    // Validate ISO timestamp format
    try {
        const date = new Date(snapshot.timestamp);
        if (isNaN(date.getTime())) {
            return false;
        }
    }
    catch {
        return false;
    }
    // Validate each promotion in the array
    for (const promo of snapshot.promos) {
        if (!validatePromotion(promo)) {
            return false;
        }
    }
    return true;
}
/**
 * Deletes all historical snapshots for a target URL
 *
 * @param env - Environment variables containing KV namespace
 * @param url - Target URL to delete snapshots for
 * @returns Number of snapshots that were deleted
 */
export async function deleteAllHistoricalSnapshots(env, url) {
    try {
        const urlHash = await import('./utils').then(utils => utils.hashString(url));
        const prefix = `hist:${urlHash}:`;
        // List all history keys for this URL
        const listResult = await env.DEAL_WATCHER.list({ prefix });
        if (!listResult.keys || listResult.keys.length === 0) {
            return 0;
        }
        // Delete all snapshots
        let deletedCount = 0;
        for (const key of listResult.keys) {
            try {
                await env.DEAL_WATCHER.delete(key.name);
                deletedCount++;
            }
            catch (error) {
                console.error(`Failed to delete historical snapshot ${key.name}:`, error);
                // Continue with other deletions
            }
        }
        return deletedCount;
    }
    catch (error) {
        console.error(`Failed to delete historical snapshots for URL ${url}:`, error);
        return 0;
    }
}
