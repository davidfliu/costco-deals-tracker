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
  return hasBasicContent && (hasSpecificContent || hasPerk);
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
  text?: SlackText;
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
 * Escapes special characters in text for Slack markdown
 * 
 * @param text - Text to escape
 * @returns Escaped text safe for Slack markdown
 */
function escapeSlackMarkdown(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
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
  // If lengths differ, still perform comparison to maintain constant time
  const aLength = a.length;
  const bLength = b.length;
  const maxLength = Math.max(aLength, bLength);
  
  let result = aLength === bLength ? 0 : 1;
  
  for (let i = 0; i < maxLength; i++) {
    const aChar = i < aLength ? a.charCodeAt(i) : 0;
    const bChar = i < bLength ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }
  
  return result === 0;
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
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer'
      }
    }
  );
}

/**
 * Fetches HTML content from a URL with proper headers and error handling
 * 
 * @param url - URL to fetch
 * @param timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns HTML content as string
 * @throws Error if fetch fails or returns non-200 status
 */
export async function fetchContent(url: string, timeoutMs: number = 30000): Promise<string> {
  // Create abort controller for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CostcoTravelWatcher/1.0; +https://github.com/costco-travel-watcher)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
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
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Failed to retrieve targets:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve targets configuration',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
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
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Failed to update targets:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to update targets configuration',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}