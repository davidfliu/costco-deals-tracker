/**
 * Utility functions for the Costco Travel Watcher
 */

import { Promotion } from "./types";

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