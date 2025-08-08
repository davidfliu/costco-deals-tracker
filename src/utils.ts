/**
 * Utility functions for the Costco Travel Watcher
 */

/**
 * Generates a SHA-256 hash of the input string and returns the first 16 characters
 * for use as stable keys in KV storage
 * 
 * @param input - The string to hash
 * @returns First 16 characters of the SHA-256 hash
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Return first 16 characters for readability while maintaining uniqueness
  return hashHex.substring(0, 16);
}

/**
 * Generates a stable key for storing target state in KV
 * 
 * @param url - The target URL to generate a key for
 * @returns KV key in format "state:<url-hash>"
 */
export async function generateStateKey(url: string): Promise<string> {
  const urlHash = await hashString(url);
  return `state:${urlHash}`;
}

/**
 * Generates a stable key for storing historical snapshots in KV
 * 
 * @param url - The target URL to generate a key for
 * @param timestamp - ISO timestamp for the snapshot
 * @returns KV key in format "hist:<url-hash>:<iso>"
 */
export async function generateHistoryKey(url: string, timestamp: string): Promise<string> {
  const urlHash = await hashString(url);
  return `hist:${urlHash}:${timestamp}`;
}