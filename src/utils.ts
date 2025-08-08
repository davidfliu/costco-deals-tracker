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

/**
 * Normalizes promotional text by collapsing whitespace and removing timestamps
 * 
 * @param text - Raw promotional text to normalize
 * @returns Normalized text with consistent whitespace
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  
  return text
    // Remove common timestamp patterns
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '') // MM/DD/YYYY or M/D/YY
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '') // YYYY-MM-DD
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, '') // Time patterns
    // Remove tracking codes and counters
    .replace(/\b[A-Z0-9]{8,}\b/g, '') // Long alphanumeric codes
    .replace(/\bref:\S*/gi, '') // ref: parameters
    .replace(/\butm_\S*/gi, '') // utm_ parameters
    .replace(/\btrack\S*/gi, '') // track parameters
    .replace(/\bid[:=]\S*/gi, '') // id parameters
    .replace(/\b\d+,?\d*\s*(?:views?|clicks?|visits?)\b/gi, '') // View/click counters with commas
    .replace(/\b(?:updated|modified|posted):\s*.*$/gim, '') // Update timestamps
    // Normalize whitespace but preserve line breaks
    .replace(/[ \t]+/g, ' ') // Collapse spaces and tabs
    .replace(/\n\s*\n\s*/g, '\n') // Remove empty lines
    .trim();
}

/**
 * Filters out noise from promotional text using regex patterns
 * 
 * @param text - Text to filter
 * @returns Filtered text with noise removed
 */
export function filterNoise(text: string): string {
  if (!text) return '';
  
  return text
    // Remove common promotional noise
    .replace(/\b(?:limited time|act now|hurry|expires soon|while supplies last)\b/gi, '')
    .replace(/\b(?:call now|book today|reserve now|don't wait)\b/gi, '')
    .replace(/\*+[^*]*\*+/g, '') // Remove asterisk disclaimers
    .replace(/\([^)]*terms[^)]*\)/gi, '') // Remove terms and conditions
    .replace(/\([^)]*conditions[^)]*\)/gi, '')
    .replace(/\([^)]*restrictions[^)]*\)/gi, '')
    // Remove social proof noise
    .replace(/\b\d+,?\d*\s*(?:people|customers|travelers)\s+(?:booked|viewed|saved)\b/gi, '')
    .replace(/\b(?:trending|popular|bestseller|top rated)\b/gi, '')
    // Clean up remaining whitespace and trim
    .replace(/\s+/g, ' ')
    .replace(/^\s*!\s*|\s*!\s*$/g, '') // Remove leading/trailing exclamation marks with spaces
    .trim();
}

/**
 * Generates a stable promotion ID by hashing normalized promotion content
 * 
 * @param title - Promotion title
 * @param perk - Promotion benefit/perk description
 * @param dates - Valid date range
 * @param price - Price information
 * @returns Stable promotion ID hash
 */
export async function generatePromotionId(
  title: string,
  perk: string,
  dates: string,
  price: string
): Promise<string> {
  // Normalize each field to ensure consistent hashing
  const normalizedTitle = normalizeText(title);
  const normalizedPerk = normalizeText(perk);
  const normalizedDates = normalizeText(dates);
  const normalizedPrice = normalizeText(price);
  
  // Create content string with consistent separator
  const content = `${normalizedTitle}|${normalizedPerk}|${normalizedDates}|${normalizedPrice}`;
  
  // Generate hash of the normalized content
  return await hashString(content);
}