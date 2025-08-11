/**
 * Utility functions for the Costco Travel Watcher
 */

import { Promotion, ChangeResult, Env } from "./types";

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
    .replace(/\b(?:updated|modified|posted)[:]\s*.*$/gim, '') // Update timestamps with colons
    .replace(/\([^)]*(?:updated|modified|posted)[^)]*\)/gi, '') // Update info in parentheses
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

/**
 * Extracts promotional content from HTML using HTMLRewriter (Cloudflare Workers)
 * or DOM parsing (Node.js/test environment)
 * 
 * @param html - HTML content to parse
 * @param selector - CSS selector for promotion containers
 * @returns Array of promotion objects
 */
export async function parsePromotions(html: string, selector: string): Promise<Promotion[]> {
  // Check if we're in Cloudflare Workers environment
  if (typeof HTMLRewriter !== 'undefined') {
    return parsePromotionsWithHTMLRewriter(html, selector);
  } else {
    // Fallback to DOM parsing for test environment
    return parsePromotionsWithDOM(html, selector);
  }
}

/**
 * Parses promotions using Cloudflare Workers HTMLRewriter
 */
async function parsePromotionsWithHTMLRewriter(html: string, selector: string): Promise<Promotion[]> {
  const promotions: Promotion[] = [];
  const extractedPromotions: Array<Partial<Promotion>> = [];

  const rewriter = new HTMLRewriter();

  let currentPromotion: Partial<Promotion> | null = null;
  let currentField = '';
  let textBuffer = '';

  // Handler for main promotion containers
  rewriter.on(selector, {
    element() {
      // Start new promotion
      currentPromotion = {};
      textBuffer = '';
    },

    text(text) {
      textBuffer += text.text;
    }
  });

  // Handlers for sub-elements
  const fieldSelectors = [
    { selector: '.title, .promotion-title, h1, h2, h3, .headline', field: 'title' },
    { selector: '.perk, .benefit, .offer, .deal-text, p', field: 'perk' },
    { selector: '.dates, .validity, .valid-dates, .duration', field: 'dates' },
    { selector: '.price, .cost, .rate, .amount', field: 'price' }
  ];

  fieldSelectors.forEach(({ selector: fieldSelector, field }) => {
    rewriter.on(fieldSelector, {
      element() {
        currentField = field;
        textBuffer = '';
      },

      text(text) {
        if (currentField === field && currentPromotion) {
          if (!currentPromotion[field as keyof Promotion]) {
            currentPromotion[field as keyof Promotion] = '';
          }
          currentPromotion[field as keyof Promotion] += text.text;
        }
      }
    });
  });

  // Transform the HTML
  const response = new Response(html);
  const transformedResponse = rewriter.transform(response);
  await transformedResponse.text();

  // If we have a current promotion, add it
  if (currentPromotion && Object.keys(currentPromotion).length > 0) {
    extractedPromotions.push(currentPromotion);
  }

  // If no structured data found, try text parsing
  if (extractedPromotions.length === 0 && textBuffer) {
    return parsePromotionsFromText(textBuffer);
  }

  // Build promotions from extracted data
  for (const extracted of extractedPromotions) {
    const promotion = await buildPromotionFromFields(extracted);
    if (promotion) {
      promotions.push(promotion);
    }
  }

  return promotions;
}

/**
 * Parses promotions using DOM parsing (for test environment)
 */
async function parsePromotionsWithDOM(html: string, selector: string): Promise<Promotion[]> {
  const promotions: Promotion[] = [];

  // Extract the class name from the selector
  const className = selector.replace('.', '');

  // Find promotion containers - handle both self-closing and regular tags
  const containerRegex = new RegExp(`<[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>(.*?)<\/[^>]*>`, 'gis');
  const matches = [...html.matchAll(containerRegex)];

  if (matches.length === 0) {
    return [];
  }

  for (const match of matches) {
    const containerContent = match[1];
    const promotion = await parsePromotionFromHTML(containerContent);
    if (promotion) {
      promotions.push(promotion);
    }
  }

  return promotions;
}

/**
 * Parses a single promotion from HTML content
 */
async function parsePromotionFromHTML(html: string): Promise<Promotion | null> {
  if (!html || !html.trim()) {
    return null;
  }

  // Try to extract structured fields using regex patterns
  let title = '';
  let perk = '';
  let dates = '';
  let price = '';

  // Extract title from h1, h2, h3 tags or .title/.headline classes
  const titlePatterns = [
    /<h[1-3][^>]*>(.*?)<\/h[1-3]>/is,
    /<[^>]*class="[^"]*\b(?:title|headline|promotion-title)\b[^"]*"[^>]*>(.*?)<\/[^>]*>/is
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      title = match[1].replace(/<[^>]*>/g, '').trim();
      break;
    }
  }

  // Extract perk from .perk, .benefit, .offer classes or paragraph elements
  const perkPatterns = [
    /<[^>]*class="[^"]*\b(?:perk|benefit|offer|deal-text)\b[^"]*"[^>]*>(.*?)<\/[^>]*>/is,
    /<p[^>]*>(.*?)<\/p>/is
  ];

  for (const pattern of perkPatterns) {
    const match = html.match(pattern);
    if (match) {
      perk = match[1].replace(/<[^>]*>/g, '').trim();
      break;
    }
  }

  // Extract dates from .dates, .validity classes
  const datesPatterns = [
    /<[^>]*class="[^"]*\b(?:dates|validity|valid-dates|duration)\b[^"]*"[^>]*>(.*?)<\/[^>]*>/is
  ];

  for (const pattern of datesPatterns) {
    const match = html.match(pattern);
    if (match) {
      dates = match[1].replace(/<[^>]*>/g, '').trim();
      break;
    }
  }

  // Extract price from .price, .cost classes
  const pricePatterns = [
    /<[^>]*class="[^"]*\b(?:price|cost|rate|amount)\b[^"]*"[^>]*>(.*?)<\/[^>]*>/is
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      price = match[1].replace(/<[^>]*>/g, '').trim();
      break;
    }
  }

  // If no structured fields found, use text parsing
  if (!title && !perk && !dates && !price) {
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const textPromotions = await parsePromotionsFromText(textContent);
    return textPromotions[0] || null;
  }

  // Use first line as title if no title found
  if (!title) {
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = textContent.split('\n').map(line => line.trim()).filter(line => line);
    title = lines[0] || '';
  }

  return buildPromotionFromFields({ title, perk, dates, price });
}

/**
 * Builds a complete promotion object from extracted HTML fields
 * 
 * @param fields - Partial promotion fields extracted from HTML
 * @returns Complete promotion object or null if insufficient data
 */
async function buildPromotionFromFields(fields: Partial<Promotion>): Promise<Promotion | null> {
  // Ensure we have at least a title or perk to create a meaningful promotion
  if (!fields.title && !fields.perk) {
    return null;
  }

  // Normalize and clean the extracted text
  const title = normalizeText(fields.title || '');
  const perk = normalizeText(fields.perk || '');
  const dates = normalizeText(fields.dates || '');
  const price = normalizeText(fields.price || '');

  // Generate stable ID
  const id = await generatePromotionId(title, perk, dates, price);

  return {
    id,
    title,
    perk,
    dates,
    price
  };
}

/**
 * Fallback parser for extracting promotions from plain text content
 * 
 * @param text - Plain text content to parse
 * @returns Array of promotion objects
 */
async function parsePromotionsFromText(text: string): Promise<Promotion[]> {
  const promotions: Promotion[] = [];

  // Normalize the text
  const normalizedText = normalizeText(text);

  // Split text into potential promotion blocks
  const blocks = normalizedText
    .split(/\n\s*\n/) // Split on double line breaks
    .filter(block => block.trim().length > 10); // Filter out very short blocks

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line);

    if (lines.length === 0) continue;

    // Try to extract structured information from the block
    let title = '';
    let perk = '';
    let dates = '';
    let price = '';

    // Look for price patterns
    const priceMatch = block.match(/\$[\d,]+(?:\.\d{2})?|\$\d+\s*-\s*\$\d+|from\s+\$[\d,]+/i);
    if (priceMatch) {
      price = priceMatch[0];
    }

    // Look for date patterns
    const dateMatch = block.match(/(?:valid|expires?|through|until|from|dates?)[:\s]+[^.!?]*(?:\d{4}|\d{1,2}\/\d{1,2})/i);
    if (dateMatch) {
      dates = dateMatch[0];
    }

    // Look for benefit/perk keywords
    const perkMatch = block.match(/(?:free|complimentary|includes?|bonus|upgrade|perk)[:\s]+[^.!?]*/i);
    if (perkMatch) {
      perk = perkMatch[0];
    }

    // Use the first line as title if no specific title found
    title = lines[0];

    // If we couldn't extract specific fields, use the whole block as perk
    if (!perk && !price && !dates && lines.length > 1) {
      perk = lines.slice(1).join(' ');
    }

    // Create promotion if we have meaningful content
    if (title || perk) {
      const id = await generatePromotionId(title, perk, dates, price);
      promotions.push({
        id,
        title: title || '',
        perk: perk || '',
        dates: dates || '',
        price: price || ''
      });
    }
  }

  return promotions;
}

/**
 * Compares current promotions with previous promotions to detect changes
 * 
 * @param currentPromotions - Current promotion array
 * @param previousPromotions - Previous promotion array
 * @returns ChangeResult object with categorized differences
 */
export function detectChanges(
  currentPromotions: Promotion[],
  previousPromotions: Promotion[]
): ChangeResult {
  const added: Promotion[] = [];
  const removed: Promotion[] = [];
  const changed: Array<{ previous: Promotion; current: Promotion }> = [];

  // Create maps for efficient lookup by ID
  const currentMap = new Map(currentPromotions.map(p => [p.id, p]));
  const previousMap = new Map(previousPromotions.map(p => [p.id, p]));

  // Find added promotions (in current but not in previous)
  for (const current of currentPromotions) {
    if (!previousMap.has(current.id)) {
      added.push(current);
    }
  }

  // Find removed promotions (in previous but not in current)
  for (const previous of previousPromotions) {
    if (!currentMap.has(previous.id)) {
      removed.push(previous);
    }
  }

  // Find changed promotions (same ID but different content)
  for (const current of currentPromotions) {
    const previous = previousMap.get(current.id);
    if (previous && !arePromotionsEqual(current, previous)) {
      changed.push({ previous, current });
    }
  }

  // Determine if there are material changes
  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0;

  // Generate summary message
  const summary = generateChangeSummary(added, removed, changed);

  return {
    hasChanges,
    added,
    removed,
    changed,
    summary
  };
}

/**
 * Compares two promotions for equality, ignoring cosmetic differences
 * 
 * @param promo1 - First promotion to compare
 * @param promo2 - Second promotion to compare
 * @returns True if promotions are materially equal
 */
function arePromotionsEqual(promo1: Promotion, promo2: Promotion): boolean {
  // Compare normalized content to ignore cosmetic differences
  const normalize = (text: string) => filterNoise(normalizeText(text));

  return (
    normalize(promo1.title) === normalize(promo2.title) &&
    normalize(promo1.perk) === normalize(promo2.perk) &&
    normalize(promo1.dates) === normalize(promo2.dates) &&
    normalize(promo1.price) === normalize(promo2.price)
  );
}

/**
 * Generates a human-readable summary of detected changes
 * 
 * @param added - Added promotions
 * @param removed - Removed promotions
 * @param changed - Changed promotions
 * @returns Summary string describing the changes
 */
function generateChangeSummary(
  added: Promotion[],
  removed: Promotion[],
  changed: Array<{ previous: Promotion; current: Promotion }>
): string {
  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`${added.length} new promotion${added.length === 1 ? '' : 's'}`);
  }

  if (removed.length > 0) {
    parts.push(`${removed.length} promotion${removed.length === 1 ? '' : 's'} removed`);
  }

  if (changed.length > 0) {
    parts.push(`${changed.length} promotion${changed.length === 1 ? '' : 's'} updated`);
  }

  if (parts.length === 0) {
    return 'No changes detected';
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return parts.join(' and ');
  }

  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

/**
 * Filters out non-material changes from a ChangeResult
 * 
 * @param changeResult - Original change result
 * @returns Filtered change result with only material changes
 */
export function filterMaterialChanges(changeResult: ChangeResult): ChangeResult {
  // Filter added promotions - remove if they appear to be noise
  const materialAdded = changeResult.added.filter(promo => isMaterialPromotion(promo));

  // Filter removed promotions - remove if they appear to be noise
  const materialRemoved = changeResult.removed.filter(promo => isMaterialPromotion(promo));

  // Filter changed promotions - remove if changes are not material
  const materialChanged = changeResult.changed.filter(({ previous, current }) => 
    isMaterialChange(previous, current)
  );

  // Determine if there are any material changes
  const hasChanges = materialAdded.length > 0 || materialRemoved.length > 0 || materialChanged.length > 0;

  // Generate new summary
  const summary = hasChanges 
    ? generateChangeSummary(materialAdded, materialRemoved, materialChanged)
    : 'No material changes detected';

  return {
    hasChanges,
    added: materialAdded,
    removed: materialRemoved,
    changed: materialChanged,
    summary
  };
}

/**
 * Determines if a promotion represents material content (not noise)
 * 
 * @param promotion - Promotion to evaluate
 * @returns True if the promotion appears to be material content
 */
function isMaterialPromotion(promotion: Promotion): boolean {
  // Check if promotion has meaningful content
  const hasTitle = promotion.title && promotion.title.trim().length > 3;
  const hasPerk = promotion.perk && promotion.perk.trim().length > 10;
  const hasPrice = promotion.price && /\$[\d,]+/.test(promotion.price);
  const hasDates = promotion.dates && promotion.dates.trim().length > 5;

  // Must have at least title or perk, and preferably price or dates
  const hasBasicContent = hasTitle || hasPerk;
  const hasSpecificContent = hasPrice || hasDates;

  if (!hasBasicContent) {
    return false;
  }

  // Check for noise patterns in the content
  const allText = `${promotion.title} ${promotion.perk} ${promotion.dates} ${promotion.price}`.toLowerCase();

  // Common noise patterns that indicate non-material content
  const noisePatterns = [
    /\b(?:loading|please wait|error|404|not found)\b/,
    /\b(?:javascript|enable|browser|update)\b/,
    /\b(?:cookie|privacy|terms|legal)\b/,
    /\b(?:advertisement|sponsored|ad)\b/,
    /^[\s\W]*$/, // Only whitespace and punctuation
    /^.{1,5}$/, // Very short content
  ];

  // If content matches noise patterns, it's not material
  if (noisePatterns.some(pattern => pattern.test(allText))) {
    return false;
  }

  // If we have basic content and no noise patterns, consider it material
  // Prefer promotions with specific content (price/dates)
  return hasBasicContent && (hasSpecificContent || !!hasPerk);
}

/**
 * Determines if a change between two promotions is material
 * 
 * @param previous - Previous version of promotion
 * @param current - Current version of promotion
 * @returns True if the change is material
 */
function isMaterialChange(previous: Promotion, current: Promotion): boolean {
  // Compare key fields for material differences
  const titleChanged = !isSimilarText(previous.title, current.title);
  const perkChanged = !isSimilarText(previous.perk, current.perk);
  const priceChanged = !isSimilarPrice(previous.price, current.price);
  const datesChanged = !isSimilarDates(previous.dates, current.dates);

  // Any change in title, perk, or price is considered material
  // Date changes are material only if they represent significant shifts
  return titleChanged || perkChanged || priceChanged || datesChanged;
}

/**
 * Compares two text strings for similarity, ignoring cosmetic differences
 * 
 * @param text1 - First text to compare
 * @param text2 - Second text to compare
 * @returns True if texts are similar enough to be considered the same
 */
function isSimilarText(text1: string, text2: string): boolean {
  if (!text1 && !text2) return true;
  if (!text1 || !text2) return false;

  // Normalize both texts
  const norm1 = filterNoise(normalizeText(text1)).toLowerCase();
  const norm2 = filterNoise(normalizeText(text2)).toLowerCase();

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // Check for substantial similarity (allowing for minor differences)
  const similarity = calculateTextSimilarity(norm1, norm2);
  return similarity > 0.85; // 85% similarity threshold
}

/**
 * Compares two price strings for similarity
 * 
 * @param price1 - First price to compare
 * @param price2 - Second price to compare
 * @returns True if prices are similar
 */
function isSimilarPrice(price1: string, price2: string): boolean {
  if (!price1 && !price2) return true;
  if (!price1 || !price2) return false;

  // Extract numeric values from prices
  const extractPrice = (price: string) => {
    const matches = price.match(/\$?([\d,]+(?:\.\d{2})?)/g);
    return matches ? matches.map(m => parseFloat(m.replace(/[$,]/g, ''))) : [];
  };

  const prices1 = extractPrice(price1);
  const prices2 = extractPrice(price2);

  // If no prices found in either, compare as text
  if (prices1.length === 0 && prices2.length === 0) {
    return isSimilarText(price1, price2);
  }

  // If different number of prices, they're different
  if (prices1.length !== prices2.length) return false;

  // Compare each price with small tolerance for rounding
  for (let i = 0; i < prices1.length; i++) {
    const diff = Math.abs(prices1[i] - prices2[i]);
    const tolerance = Math.max(1, prices1[i] * 0.01); // 1% or $1 minimum
    if (diff > tolerance) return false;
  }

  return true;
}

/**
 * Compares two date strings for similarity
 * 
 * @param dates1 - First date string to compare
 * @param dates2 - Second date string to compare
 * @returns True if dates are similar
 */
function isSimilarDates(dates1: string, dates2: string): boolean {
  if (!dates1 && !dates2) return true;
  if (!dates1 || !dates2) return false;

  // Try to extract actual dates
  const extractDates = (dateStr: string) => {
    const datePatterns = [
      /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, // MM/DD/YYYY
      /\b(\d{4})-(\d{2})-(\d{2})\b/g, // YYYY-MM-DD
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),?\s+(\d{4})\b/gi // Month DD, YYYY
    ];

    const dates: Date[] = [];
    for (const pattern of datePatterns) {
      let match;
      while ((match = pattern.exec(dateStr)) !== null) {
        try {
          let date: Date;
          if (pattern === datePatterns[0]) { // MM/DD/YYYY
            date = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
          } else if (pattern === datePatterns[1]) { // YYYY-MM-DD
            date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          } else { // Month DD, YYYY
            date = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
          }
          if (!isNaN(date.getTime())) {
            dates.push(date);
          }
        } catch (e) {
          // Ignore invalid dates
        }
      }
    }
    return dates;
  };

  const datesA = extractDates(dates1);
  const datesB = extractDates(dates2);

  // If no dates found in either, compare as text
  if (datesA.length === 0 && datesB.length === 0) {
    return isSimilarText(dates1, dates2);
  }

  // If different number of dates, they might still be similar
  // Check if any dates are close (within 7 days)
  if (datesA.length > 0 && datesB.length > 0) {
    for (const dateA of datesA) {
      for (const dateB of datesB) {
        const diffDays = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) { // Within a week
          return true;
        }
      }
    }
    return false; // No similar dates found
  }

  // Fallback to text comparison
  return isSimilarText(dates1, dates2);
}

/**
 * Calculates similarity between two strings using a simple algorithm
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score between 0 and 1
 */
function calculateTextSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // Use Levenshtein distance for similarity calculation
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);
  return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
}

/**
 * Slack block kit message structure for rich formatting
 */
interface SlackMessage {
  blocks: SlackBlock[];
}

interface SlackBlock {
  type: string;
  text?: SlackText;
  elements?: SlackElement[];
  fields?: SlackText[];
}

interface SlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface SlackElement {
  type: string;
  text?: string;
  url?: string;
}

/**
 * Formats change results into Slack block format with rich formatting
 * 
 * @param targetName - Name of the target being monitored
 * @param targetUrl - URL of the target
 * @param changeResult - Change detection results
 * @param timestamp - ISO timestamp of when changes were detected
 * @returns Slack message object with blocks
 */
export function formatSlackMessage(
  targetName: string,
  targetUrl: string,
  changeResult: ChangeResult,
  timestamp: string
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header block with target name and summary
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🎯 ${targetName || 'Costco Travel Deal'}`,
      emoji: true
    }
  });

  // Context block with URL and timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${targetUrl}|View Page> • ${formatTimestamp(timestamp)}`
      }
    ]
  });

  // Summary block
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Changes detected:* ${changeResult.summary}`
    }
  });

  // Add divider before details
  blocks.push({ type: 'divider' });

  // Add details for each type of change (limit to 3 items total)
  let itemCount = 0;
  const maxItems = 3;

  // Added promotions
  if (changeResult.added.length > 0 && itemCount < maxItems) {
    const itemsToShow = changeResult.added.slice(0, maxItems - itemCount);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🆕 New Promotions (${changeResult.added.length}):*`
      }
    });

    for (const promo of itemsToShow) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatPromotionForSlack(promo)
        }
      });
      itemCount++;
    }

    if (changeResult.added.length > itemsToShow.length) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_... and ${changeResult.added.length - itemsToShow.length} more new promotions_`
          }
        ]
      });
    }
  }

  // Changed promotions
  if (changeResult.changed.length > 0 && itemCount < maxItems) {
    const itemsToShow = changeResult.changed.slice(0, maxItems - itemCount);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔄 Updated Promotions (${changeResult.changed.length}):*`
      }
    });

    for (const change of itemsToShow) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatPromotionChangeForSlack(change.previous, change.current)
        }
      });
      itemCount++;
    }

    if (changeResult.changed.length > itemsToShow.length) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_... and ${changeResult.changed.length - itemsToShow.length} more updated promotions_`
          }
        ]
      });
    }
  }

  // Removed promotions
  if (changeResult.removed.length > 0 && itemCount < maxItems) {
    const itemsToShow = changeResult.removed.slice(0, maxItems - itemCount);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*❌ Removed Promotions (${changeResult.removed.length}):*`
      }
    });

    for (const promo of itemsToShow) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatPromotionForSlack(promo)
        }
      });
      itemCount++;
    }

    if (changeResult.removed.length > itemsToShow.length) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_... and ${changeResult.removed.length - itemsToShow.length} more removed promotions_`
          }
        ]
      });
    }
  }

  return { blocks };
}

/**
 * Formats a single promotion for display in Slack
 * 
 * @param promotion - Promotion to format
 * @returns Formatted markdown string
 */
function formatPromotionForSlack(promotion: Promotion): string {
  const parts: string[] = [];

  // Title (bold)
  if (promotion.title) {
    parts.push(`*${escapeSlackMarkdown(promotion.title)}*`);
  }

  // Perk/benefit
  if (promotion.perk) {
    parts.push(escapeSlackMarkdown(promotion.perk));
  }

  // Price (if available)
  if (promotion.price) {
    parts.push(`💰 ${escapeSlackMarkdown(promotion.price)}`);
  }

  // Dates (if available)
  if (promotion.dates) {
    parts.push(`📅 ${escapeSlackMarkdown(promotion.dates)}`);
  }

  return parts.join('\n');
}

/**
 * Formats a promotion change for display in Slack, highlighting differences
 * 
 * @param previous - Previous version of promotion
 * @param current - Current version of promotion
 * @returns Formatted markdown string showing changes
 */
function formatPromotionChangeForSlack(previous: Promotion, current: Promotion): string {
  const parts: string[] = [];

  // Title
  if (previous.title !== current.title) {
    if (current.title) {
      parts.push(`*${escapeSlackMarkdown(current.title)}*`);
    }
    if (previous.title && previous.title !== current.title) {
      parts.push(`~${escapeSlackMarkdown(previous.title)}~`);
    }
  } else if (current.title) {
    parts.push(`*${escapeSlackMarkdown(current.title)}*`);
  }

  // Perk changes
  if (previous.perk !== current.perk) {
    if (current.perk) {
      parts.push(`${escapeSlackMarkdown(current.perk)}`);
    }
    if (previous.perk && previous.perk !== current.perk) {
      parts.push(`~${escapeSlackMarkdown(previous.perk)}~`);
    }
  } else if (current.perk) {
    parts.push(escapeSlackMarkdown(current.perk));
  }

  // Price changes
  if (previous.price !== current.price) {
    if (current.price) {
      parts.push(`💰 ${escapeSlackMarkdown(current.price)}`);
    }
    if (previous.price && previous.price !== current.price) {
      parts.push(`💰 ~${escapeSlackMarkdown(previous.price)}~`);
    }
  } else if (current.price) {
    parts.push(`💰 ${escapeSlackMarkdown(current.price)}`);
  }

  // Date changes
  if (previous.dates !== current.dates) {
    if (current.dates) {
      parts.push(`📅 ${escapeSlackMarkdown(current.dates)}`);
    }
    if (previous.dates && previous.dates !== current.dates) {
      parts.push(`📅 ~${escapeSlackMarkdown(previous.dates)}~`);
    }
  } else if (current.dates) {
    parts.push(`📅 ${escapeSlackMarkdown(current.dates)}`);
  }

  return parts.join('\n');
}

/**
 * Escapes special characters in text for Slack markdown and prevents XSS
 * 
 * @param text - Text to escape
 * @returns Sanitized text safe for Slack markdown
 */
function escapeSlackMarkdown(text: string): string {
  if (!text) return '';
  
  return text
    // First escape HTML entities (before removing tags)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    // Then remove potentially dangerous content (already escaped)
    .replace(/&lt;script[^&]*&gt;.*?&lt;\/script&gt;/gis, '') // Remove script tags
    .replace(/&lt;iframe[^&]*&gt;.*?&lt;\/iframe&gt;/gis, '') // Remove iframe tags
    .replace(/&lt;object[^&]*&gt;.*?&lt;\/object&gt;/gis, '') // Remove object tags
    .replace(/&lt;embed[^&]*&gt;/gi, '') // Remove embed tags
    .replace(/&lt;link[^&]*&gt;/gi, '') // Remove link tags
    .replace(/&lt;meta[^&]*&gt;/gi, '') // Remove meta tags
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/data:text\/html/gi, '') // Remove data URLs with HTML
    .replace(/on\w+\s*=/gi, '') // Remove event handlers (onclick, onload, etc.)
    // Finally escape Slack markdown
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    // Limit length to prevent abuse
    .substring(0, 3000);
}

/**
 * Formats an ISO timestamp for display in Slack
 * 
 * @param isoTimestamp - ISO timestamp string
 * @returns Formatted timestamp string
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return isoTimestamp;
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  } catch (error) {
    return isoTimestamp;
  }
}

/**
 * Sends a formatted message to Slack webhook
 * 
 * @param webhookUrl - Slack webhook URL
 * @param message - Slack message object with blocks
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns Response from Slack webhook
 * @throws Error if webhook request fails
 */
export async function sendSlackNotification(
  webhookUrl: string,
  message: SlackMessage,
  timeoutMs: number = 10000
): Promise<Response> {
  // Validate webhook URL
  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    throw new Error('Invalid Slack webhook URL');
  }

  // Validate message structure
  if (!message.blocks || message.blocks.length === 0) {
    throw new Error('Message must contain at least one block');
  }

  // Create abort controller for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CostcoTravelWatcher/1.0'
      },
      body: JSON.stringify(message),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Slack webhooks return 200 for success, anything else is an error
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Slack webhook failed: HTTP ${response.status} - ${errorText}`);
    }

    return response;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message === 'AbortError') {
        throw new Error(`Slack webhook timeout after ${timeoutMs}ms`);
      }
      throw error;
    }

    throw new Error(`Slack webhook request failed: ${String(error)}`);
  }
}

/**
 * Authentication result for admin API requests
 */
export interface AuthResult {
  /** Whether authentication was successful */
  authenticated: boolean;
  /** Error message if authentication failed */
  error?: string;
}

/**
 * Validates admin token using constant-time comparison to prevent timing attacks
 * 
 * @param providedToken - Token provided in the request
 * @param validToken - Valid admin token from environment
 * @returns Authentication result
 */
export function validateAdminToken(providedToken: string | null, validToken: string): AuthResult {
  // Check if token is provided and not empty
  if (!providedToken || providedToken.trim() === '') {
    return {
      authenticated: false,
      error: 'Missing authorization token'
    };
  }

  // Check if valid token is configured
  if (!validToken) {
    return {
      authenticated: false,
      error: 'Admin token not configured'
    };
  }

  // Use constant-time comparison to prevent timing attacks
  if (!constantTimeEquals(providedToken, validToken)) {
    return {
      authenticated: false,
      error: 'Invalid authorization token'
    };
  }

  return {
    authenticated: true
  };
}

/**
 * Performs constant-time string comparison to prevent timing attacks
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal
 */
function constantTimeEquals(a: string, b: string): boolean {
  // Use byte representations to avoid optimizations on string operations
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLength = Math.max(aBytes.length, bBytes.length);

  // Pad both arrays to equal length to avoid leaking length information
  const aPadded = new Uint8Array(maxLength);
  const bPadded = new Uint8Array(maxLength);
  aPadded.set(aBytes);
  bPadded.set(bBytes);

  // Note: crypto.timingSafeEqual is not available in Cloudflare Workers
  // Use manual constant-time comparison instead

  // Fallback to manual constant-time comparison
  let diff = 0;
  for (let i = 0; i < maxLength; i++) {
    diff |= aPadded[i] ^ bPadded[i];
  }
  return diff === 0;
}

/**
 * Extracts authorization token from request headers
 * 
 * @param request - HTTP request object
 * @returns Authorization token or null if not found
 */
export function extractAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || authHeader.trim() === '') {
    return null;
  }
  
  // Support both "Bearer <token>" and "<token>" formats
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null; // Return null if token is empty after "Bearer "
  }
  
  return authHeader;
}

/**
 * Middleware function to authenticate admin API requests
 * 
 * @param request - HTTP request object
 * @param adminToken - Valid admin token from environment
 * @returns Authentication result
 */
export function authenticateAdminRequest(request: Request, adminToken: string): AuthResult {
  const providedToken = extractAuthToken(request);
  return validateAdminToken(providedToken, adminToken);
}

/**
 * Creates an HTTP response for authentication failures
 * 
 * @param authResult - Failed authentication result
 * @returns HTTP response with 401 status
 */
export function createAuthErrorResponse(authResult: AuthResult): Response {
  return new Response(
    JSON.stringify({
      error: authResult.error || 'Authentication failed',
      code: 'UNAUTHORIZED'
    }),
    {
      status: 401,
      headers: createSecurityHeaders({
        'WWW-Authenticate': 'Bearer'
      })
    }
  );
}

/**
 * Creates secure headers for all responses
 * 
 * @param additionalHeaders - Additional headers to include
 * @returns Headers object with security headers
 */
function createSecurityHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    ...additionalHeaders
  };
}

/**
 * Validates environment variables for security
 * 
 * @param env - Environment variables
 * @returns Array of validation errors, empty if valid
 */
export function validateEnvironment(env: Env): string[] {
  const errors: string[] = [];
  
  // Validate ADMIN_TOKEN
  if (!env.ADMIN_TOKEN) {
    errors.push('ADMIN_TOKEN is required');
  } else {
    if (env.ADMIN_TOKEN.length < 32) {
      errors.push('ADMIN_TOKEN must be at least 32 characters long');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(env.ADMIN_TOKEN)) {
      errors.push('ADMIN_TOKEN contains invalid characters (only alphanumeric, underscore, and dash allowed)');
    }
  }
  
  // Validate SLACK_WEBHOOK
  if (!env.SLACK_WEBHOOK) {
    errors.push('SLACK_WEBHOOK is required');
  } else {
    try {
      const webhookUrl = new URL(env.SLACK_WEBHOOK);
      if (webhookUrl.protocol !== 'https:') {
        errors.push('SLACK_WEBHOOK must use HTTPS');
      }
      if (!webhookUrl.hostname.endsWith('slack.com')) {
        errors.push('SLACK_WEBHOOK must be a slack.com domain');
      }
      if (!webhookUrl.pathname.startsWith('/services/')) {
        errors.push('SLACK_WEBHOOK must be a valid Slack webhook URL');
      }
    } catch {
      errors.push('SLACK_WEBHOOK is not a valid URL');
    }
  }
  
  // Validate KV namespace
  if (!env.DEAL_WATCHER) {
    errors.push('DEAL_WATCHER KV namespace is required');
  }
  
  return errors;
}

/**
 * Rate limiting using KV storage
 * 
 * @param env - Environment with KV access
 * @param identifier - Unique identifier (IP address or user ID)
 * @param limit - Maximum requests per window
 * @param windowMs - Time window in milliseconds
 * @returns True if request is allowed
 */
async function checkRateLimit(env: Env, identifier: string, limit: number = 10, windowMs: number = 60000): Promise<boolean> {
  try {
    // Check if KV namespace is available (for tests)
    if (!env.DEAL_WATCHER || typeof env.DEAL_WATCHER.get !== 'function') {
      return true; // Allow request if KV is not available (test mode)
    }
    
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `rate_limit:${await hashString(identifier)}:${Math.floor(now / windowMs)}`;
    
    // Get current count
    const currentCountStr = await env.DEAL_WATCHER.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
    
    if (currentCount >= limit) {
      return false; // Rate limit exceeded
    }
    
    // Increment counter with TTL
    await env.DEAL_WATCHER.put(key, String(currentCount + 1), {
      expirationTtl: Math.ceil(windowMs / 1000) // Convert to seconds
    });
    
    return true; // Request allowed
  } catch (error) {
    console.error('Rate limiting error:', error);
    // If rate limiting fails, allow the request (fail open)
    return true;
  }
}

/**
 * Creates a rate limit exceeded response
 * 
 * @param retryAfter - Seconds until retry is allowed
 * @returns Response with 429 status
 */
function createRateLimitResponse(retryAfter: number = 60): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter
    }),
    {
      status: 429,
      headers: createSecurityHeaders({
        'Retry-After': String(retryAfter)
      })
    }
  );
}

/**
 * Sanitizes error messages to prevent information disclosure
 * 
 * @param error - Error to sanitize
 * @param context - Context for logging (server-side only)
 * @returns Sanitized error message safe for client
 */
function sanitizeErrorMessage(error: unknown, context: string = ''): string {
  // Log full error details server-side for debugging
  if (context) {
    console.error(`${context}:`, error);
  }
  
  // Return generic message to client to prevent information disclosure
  if (error instanceof Error) {
    // Only return safe, generic error messages
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('fetch')) {
      return 'Network request failed';
    }
    if (errorMessage.includes('parse') || errorMessage.includes('json')) {
      return 'Data parsing error';
    }
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return 'Invalid input provided';
    }
    if (errorMessage.includes('permission') || errorMessage.includes('access')) {
      return 'Access denied';
    }
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return 'Resource not found';
    }
    if (errorMessage.includes('url not allowed')) {
      return 'Invalid or disallowed URL';
    }
  }
  
  // Default generic message
  return 'An error occurred while processing your request';
}

/**
 * Validates that a URL is safe to fetch and whitelisted
 * 
 * @param url - URL to validate
 * @returns True if URL is safe to fetch
 */
function validateTargetUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS for external requests
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    // Block internal/private IP ranges and metadata endpoints
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
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
    
    return allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
  } catch {
    return false;
  }
}

/**
 * Fetches HTML content from a URL with proper headers and error handling
 * 
 * @param url - URL to fetch
 * @param timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns HTML content as string
 * @throws Error if fetch fails or returns non-200 status
 */
export async function fetchContent(url: string, timeoutMs: number = 15000): Promise<string> {
  // Validate URL before making request
  if (!validateTargetUrl(url)) {
    throw new Error('URL not allowed: Only HTTPS URLs from approved Costco domains are permitted');
  }
  // Create abort controller for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Check for successful response
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    // Return the HTML content
    return await response.text();

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }

    throw new Error(`Fetch failed: ${String(error)}`);
  }
}
/**
 *
 Handles GET /admin/targets endpoint - retrieves current target configuration
 * 
 * @param request - HTTP request object
 * @param env - Environment variables containing KV namespace and admin token
 * @returns HTTP response with targets configuration or error
 */
export async function handleGetTargets(request: Request, env: Env): Promise<Response> {
  // Rate limiting check
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const isAllowed = await checkRateLimit(env, `admin:${clientIP}`, 30, 300000); // 30 requests per 5 minutes
  if (!isAllowed) {
    return createRateLimitResponse(300); // 5 minutes
  }

  // Authenticate the request
  const authResult = authenticateAdminRequest(request, env.ADMIN_TOKEN);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult);
  }

  try {
    // Import KV storage functions
    const { readTargets } = await import('./kv-storage');
    
    // Read targets from KV storage
    const targets = await readTargets(env);
    
    // Return targets configuration
    return new Response(
      JSON.stringify({
        targets,
        count: targets.length,
        timestamp: new Date().toISOString()
      }, null, 2),
      {
        status: 200,
        headers: createSecurityHeaders()
      }
    );

  } catch (error) {
    const sanitizedMessage = sanitizeErrorMessage(error, 'Failed to retrieve targets');
    
    return new Response(
      JSON.stringify({
        error: sanitizedMessage,
        code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: createSecurityHeaders()
      }
    );
  }
}

/**
 * Handles POST /admin/targets endpoint - updates target configuration
 * 
 * @param request - HTTP request object with targets in body
 * @param env - Environment variables containing KV namespace and admin token
 * @returns HTTP response with success confirmation or error
 */
export async function handlePostTargets(request: Request, env: Env): Promise<Response> {
  // Rate limiting check
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const isAllowed = await checkRateLimit(env, `admin:${clientIP}`, 20, 300000); // 20 requests per 5 minutes
  if (!isAllowed) {
    return createRateLimitResponse(300); // 5 minutes
  }

  // Authenticate the request
  const authResult = authenticateAdminRequest(request, env.ADMIN_TOKEN);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult);
  }

  try {
    // Parse request body
    let requestBody: any;
    try {
      const bodyText = await request.text();
      if (!bodyText.trim()) {
        return new Response(
          JSON.stringify({
            error: 'Request body is required',
            code: 'INVALID_REQUEST'
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
      }
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
          details: parseError instanceof Error ? parseError.message : String(parseError)
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Validate request structure
    if (!requestBody || typeof requestBody !== 'object') {
      return new Response(
        JSON.stringify({
          error: 'Request body must be an object',
          code: 'INVALID_REQUEST'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Extract targets from request body
    let targets: any;
    if (Array.isArray(requestBody)) {
      // Direct array of targets
      targets = requestBody;
    } else if (requestBody.targets && Array.isArray(requestBody.targets)) {
      // Wrapped in targets property
      targets = requestBody.targets;
    } else {
      return new Response(
        JSON.stringify({
          error: 'Request must contain a "targets" array or be an array of targets',
          code: 'INVALID_REQUEST'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Import KV storage functions
    const { writeTargets, validateTargets } = await import('./kv-storage');
    
    // Validate targets configuration
    if (!validateTargets(targets)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid targets configuration',
          code: 'INVALID_TARGETS',
          details: 'Each target must have url and selector properties, with optional name, notes, and enabled properties'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Write targets to KV storage
    await writeTargets(env, targets);
    
    // Return success response
    return new Response(
      JSON.stringify({
        message: 'Targets configuration updated successfully',
        count: targets.length,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: createSecurityHeaders()
      }
    );

  } catch (error) {
    const sanitizedMessage = sanitizeErrorMessage(error, 'Failed to update targets');
    
    return new Response(
      JSON.stringify({
        error: sanitizedMessage,
        code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: createSecurityHeaders()
      }
    );
  }
}

/**
 * Handles POST /admin/run endpoint to trigger immediate monitoring execution
 * 
 * @param request - HTTP request object
 * @param env - Environment variables containing KV namespace and secrets
 * @returns HTTP response with execution results or error
 */
export async function handleManualRun(request: Request, env: Env): Promise<Response> {
  try {
    // Rate limiting check - stricter for manual runs
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const isAllowed = await checkRateLimit(env, `admin:manual:${clientIP}`, 5, 300000); // 5 requests per 5 minutes
    if (!isAllowed) {
      return createRateLimitResponse(300); // 5 minutes
    }

    // Authenticate the request
    const authResult = authenticateAdminRequest(request, env.ADMIN_TOKEN);
    if (!authResult.authenticated) {
      return createAuthErrorResponse(authResult);
    }

    // Get current timestamp for execution tracking
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    console.log(`Manual run triggered at ${timestamp}`);

    // Read targets configuration
    const { readTargets } = await import('./kv-storage');
    const targets = await readTargets(env);

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Manual run completed - no targets configured',
          timestamp,
          duration: Date.now() - startTime,
          results: {
            processed: 0,
            successful: 0,
            failed: 0,
            changes: 0
          }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Filter enabled targets
    const enabledTargets = targets.filter(target => target.enabled !== false);

    if (enabledTargets.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Manual run completed - no enabled targets',
          timestamp,
          duration: Date.now() - startTime,
          results: {
            processed: 0,
            successful: 0,
            failed: 0,
            changes: 0
          }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Execute actual monitoring logic using processBatchTargets
    const { processBatchTargets } = await import('./target-processing');
    const batchResult = await processBatchTargets(env);

    // Convert BatchProcessingResult to expected response format
    const results = {
      processed: batchResult.totalTargets,
      successful: batchResult.successfulTargets,
      failed: batchResult.failedTargets,
      changes: batchResult.targetsWithChanges,
      targets: batchResult.results.map(result => ({
        name: result.target.name || 'Unnamed Target',
        url: result.target.url,
        status: result.success ? 'success' : 'failed',
        message: result.success 
          ? (result.changes?.hasChanges 
              ? `Changes detected: ${result.changes.summary}` 
              : 'No changes detected')
          : result.error || 'Processing failed'
      }))
    };

    const duration = Date.now() - startTime;

    console.log(`Manual run completed in ${duration}ms - ${batchResult.summary}`);

    return new Response(
      JSON.stringify({
        message: 'Manual run completed successfully',
        timestamp,
        duration,
        results
      }),
      {
        status: 200,
        headers: createSecurityHeaders()
      }
    );

  } catch (error) {
    const sanitizedMessage = sanitizeErrorMessage(error, 'Failed to execute manual run');
    return new Response(
      JSON.stringify({
        error: sanitizedMessage,
        code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: createSecurityHeaders()
      }
    );
  }
}
/**
 * Handles test Slack notification endpoint - sends a test message to verify webhook
 * 
 * @param request - HTTP request object
 * @param env - Environment variables containing secrets
 * @returns Response with test result
 */
export async function handleTestSlack(request: Request, env: Env): Promise<Response> {
  try {
    // Rate limiting check
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const isAllowed = await checkRateLimit(env, `admin:test-slack:${clientIP}`, 3, 300000); // 3 requests per 5 minutes
    if (!isAllowed) {
      return createRateLimitResponse(300); // 5 minutes
    }

    // Authenticate the request
    const authResult = authenticateAdminRequest(request, env.ADMIN_TOKEN);
    if (!authResult.authenticated) {
      return createAuthErrorResponse(authResult);
    }

    // Check if Slack webhook is configured
    if (!env.SLACK_WEBHOOK) {
      return new Response(
        JSON.stringify({
          error: 'Slack webhook not configured',
          code: 'SLACK_NOT_CONFIGURED',
          message: 'SLACK_WEBHOOK environment variable is not set'
        }),
        {
          status: 400,
          headers: createSecurityHeaders()
        }
      );
    }

    const timestamp = new Date().toISOString();

    // Create test message
    const testMessage = formatSlackMessage(
      'Test Notification',
      'https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/test-slack',
      {
        hasChanges: true,
        added: [
          {
            id: 'test-promo-1',
            title: 'Test Deal Alert',
            perk: 'This is a test notification to verify your Slack integration is working properly. Save $300 on this exclusive test deal!',
            price: 'Starting from $999 (was $1,299)',
            dates: 'Valid through December 31, 2025'
          }
        ],
        removed: [],
        changed: [],
        summary: 'Test notification sent successfully'
      },
      timestamp
    );

    // Send test notification
    console.log('Sending test Slack notification...');
    await sendSlackNotification(env.SLACK_WEBHOOK, testMessage);

    return new Response(
      JSON.stringify({
        message: 'Test Slack notification sent successfully',
        timestamp,
        webhook: env.SLACK_WEBHOOK.substring(0, 30) + '...' // Only show partial webhook for security
      }),
      {
        status: 200,
        headers: createSecurityHeaders()
      }
    );

  } catch (error) {
    console.error('Test Slack notification failed:', error);
    const sanitizedMessage = sanitizeErrorMessage(error, 'Failed to send test Slack notification');
    
    return new Response(
      JSON.stringify({
        error: sanitizedMessage,
        code: 'SLACK_TEST_FAILED',
        message: 'The Slack webhook test failed. Check your webhook URL and network connectivity.'
      }),
      {
        status: 500,
        headers: createSecurityHeaders()
      }
    );
  }
}
/**
 * Handles E2E test endpoint - fetches URL content, summarizes it, and sends to Slack
 */
export async function handleTestE2E(request: Request, env: Env): Promise<Response> {
  try {
    // Rate limiting check
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const isAllowed = await checkRateLimit(env, `admin:test-e2e:${clientIP}`, 2, 300000); // 2 requests per 5 minutes
    if (!isAllowed) {
      return createRateLimitResponse(300); // 5 minutes
    }

    // Authenticate the request
    const authResult = authenticateAdminRequest(request, env.ADMIN_TOKEN);
    if (!authResult.authenticated) {
      return createAuthErrorResponse(authResult);
    }

    // Parse request body for URL
    let requestBody: any;
    try {
      const bodyText = await request.text();
      if (!bodyText.trim()) {
        return new Response(
          JSON.stringify({
            error: 'Request body is required',
            code: 'INVALID_REQUEST',
            message: 'Please provide a JSON body with a "url" field'
          }),
          {
            status: 400,
            headers: createSecurityHeaders()
          }
        );
      }
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON with a "url" field'
        }),
        {
          status: 400,
          headers: createSecurityHeaders()
        }
      );
    }

    // Validate URL parameter
    if (!requestBody.url || typeof requestBody.url !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid URL',
          code: 'INVALID_REQUEST',
          message: 'Please provide a valid "url" field in the request body'
        }),
        {
          status: 400,
          headers: createSecurityHeaders()
        }
      );
    }

    const testUrl = requestBody.url;
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    console.log(`E2E test triggered for URL: ${testUrl}`);

    // Step 1: Fetch the URL content
    let htmlContent: string;
    let fetchDuration: number;
    try {
      const fetchStart = Date.now();
      htmlContent = await fetchContent(testUrl);
      fetchDuration = Date.now() - fetchStart;
      console.log(`URL fetch completed in ${fetchDuration}ms, content length: ${htmlContent.length}`);
    } catch (error) {
      console.error(`Failed to fetch URL ${testUrl}:`, error);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch URL',
          code: 'FETCH_FAILED',
          url: testUrl,
          message: error instanceof Error ? error.message : String(error),
          timestamp
        }),
        {
          status: 400,
          headers: createSecurityHeaders()
        }
      );
    }

    // Step 2: Create content summary
    const summary = await createContentSummary(testUrl, htmlContent);

    // Step 3: Send summary to Slack
    let slackSuccess = false;
    let slackError: string | null = null;
    if (env.SLACK_WEBHOOK) {
      try {
        const testMessage = formatE2ESlackMessage(testUrl, summary, fetchDuration, timestamp);
        await sendSlackNotification(env.SLACK_WEBHOOK, testMessage);
        slackSuccess = true;
        console.log('E2E test notification sent to Slack successfully');
      } catch (error) {
        slackError = error instanceof Error ? error.message : String(error);
        console.error('Failed to send E2E test notification to Slack:', error);
      }
    }

    const totalDuration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        message: 'E2E test completed successfully',
        timestamp,
        duration: totalDuration,
        results: {
          url: testUrl,
          fetchSuccess: true,
          fetchDuration,
          contentLength: htmlContent.length,
          slackSuccess,
          slackError,
          summary: {
            title: summary.title,
            contentType: summary.contentType,
            promotionsFound: summary.promotionsFound,
            keyElements: summary.keyElements.slice(0, 3)
          }
        }
      }),
      {
        status: 200,
        headers: createSecurityHeaders()
      }
    );

  } catch (error) {
    console.error('E2E test failed:', error);
    const sanitizedMessage = sanitizeErrorMessage(error, 'Failed to execute E2E test');
    
    return new Response(
      JSON.stringify({
        error: sanitizedMessage,
        code: 'E2E_TEST_FAILED',
        message: 'The E2E test failed. Check the URL and try again.'
      }),
      {
        status: 500,
        headers: createSecurityHeaders()
      }
    );
  }
}

/**
 * Creates a summary of HTML content for E2E testing
 */
async function createContentSummary(url: string, htmlContent: string): Promise<{
  title: string;
  contentType: string;
  contentLength: number;
  promotionsFound: number;
  keyElements: string[];
  metaDescription?: string;
}> {
  // Extract title
  const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'No title found';

  // Extract meta description
  const metaMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : undefined;

  // Determine content type
  const contentType = htmlContent.includes('costcotravel.com') ? 'Costco Travel Page' : 'Web Page';

  // Try to parse promotions using existing logic
  let promotionsFound = 0;
  try {
    const promotions = await parsePromotions(htmlContent, '.promo, .deal-info, .savings, .hot-buy, .offer-details');
    promotionsFound = promotions.length;
  } catch (error) {
    console.warn('Failed to parse promotions for summary:', error);
  }

  // Extract key elements (prices, dates, deals)
  const keyElements: string[] = [];

  // Find price patterns
  const priceMatches = htmlContent.match(/\$[\d,]+(?:\.\d{2})?/g);
  if (priceMatches) {
    const uniquePrices = [...new Set(priceMatches.slice(0, 5))];
    keyElements.push(...uniquePrices.map(price => `Price: ${price}`));
  }

  // Find date patterns
  const dateMatches = htmlContent.match(/(?:valid|expires?|through|until)[^.]*?(?:\d{4}|\d{1,2}\/\d{1,2})/gi);
  if (dateMatches) {
    keyElements.push(...dateMatches.slice(0, 2).map(date => `Date: ${date.trim()}`));
  }

  // Find common deal keywords
  const dealKeywords = ['save', 'discount', 'off', 'free', 'bonus', 'special'];
  const textContent = htmlContent.replace(/<[^>]*>/g, ' ').toLowerCase();
  for (const keyword of dealKeywords) {
    const regex = new RegExp(`\\b${keyword}[^.!?]{0,50}`, 'gi');
    const matches = textContent.match(regex);
    if (matches) {
      keyElements.push(`Deal: ${matches[0].trim()}`);
      break;
    }
  }

  return {
    title,
    contentType,
    contentLength: htmlContent.length,
    promotionsFound,
    keyElements: keyElements.slice(0, 5),
    metaDescription
  };
}

/**
 * Formats E2E test results for Slack notification
 */
function formatE2ESlackMessage(
  url: string,
  summary: any,
  fetchDuration: number,
  timestamp: string
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: '🧪 E2E Test Results',
      emoji: true
    }
  });

  // URL and timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${url}|View Page> • ${formatTimestamp(timestamp)} • Fetch: ${fetchDuration}ms`
      }
    ]
  });

  // Summary section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Page Summary:*\n*Title:* ${escapeSlackMarkdown(summary.title)}\n*Type:* ${summary.contentType}\n*Content:* ${Math.round(summary.contentLength / 1024)}KB\n*Promotions:* ${summary.promotionsFound} found`
    }
  });

  // Meta description if available
  if (summary.metaDescription) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:* ${escapeSlackMarkdown(summary.metaDescription)}`
      }
    });
  }

  // Key elements
  if (summary.keyElements.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key Elements Found:*\n${summary.keyElements.map((elem: string) => `• ${escapeSlackMarkdown(elem)}`).join('\n')}`
      }
    });
  }

  // Status footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '✅ E2E test completed successfully - URL fetch and Slack notification working'
      }
    ]
  });

  return { blocks };
}