/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import { hashString, generateStateKey, generateHistoryKey, normalizeText, filterNoise, generatePromotionId } from './utils';

describe('hashString', () => {
    it('should generate consistent hashes for the same input', async () => {
        const input = 'https://www.costcotravel.com/vacation-packages';
        const hash1 = await hashString(input);
        const hash2 = await hashString(input);

        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(16);
    });

    it('should generate different hashes for different inputs', async () => {
        const input1 = 'https://www.costcotravel.com/vacation-packages';
        const input2 = 'https://www.costcotravel.com/cruise-deals';

        const hash1 = await hashString(input1);
        const hash2 = await hashString(input2);

        expect(hash1).not.toBe(hash2);
        expect(hash1).toHaveLength(16);
        expect(hash2).toHaveLength(16);
    });

    it('should generate hex strings', async () => {
        const input = 'test-string';
        const hash = await hashString(input);

        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle empty strings', async () => {
        const hash = await hashString('');

        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle special characters and unicode', async () => {
        const input = 'https://example.com/path?param=value&special=café🎉';
        const hash = await hashString(input);

        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('generateStateKey', () => {
    it('should generate consistent state keys for the same URL', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages';
        const key1 = await generateStateKey(url);
        const key2 = await generateStateKey(url);

        expect(key1).toBe(key2);
        expect(key1).toMatch(/^state:[0-9a-f]{16}$/);
    });

    it('should generate different state keys for different URLs', async () => {
        const url1 = 'https://www.costcotravel.com/vacation-packages';
        const url2 = 'https://www.costcotravel.com/cruise-deals';

        const key1 = await generateStateKey(url1);
        const key2 = await generateStateKey(url2);

        expect(key1).not.toBe(key2);
        expect(key1).toMatch(/^state:[0-9a-f]{16}$/);
        expect(key2).toMatch(/^state:[0-9a-f]{16}$/);
    });

    it('should handle URLs with query parameters', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages?destination=hawaii&dates=2024-01';
        const key = await generateStateKey(url);

        expect(key).toMatch(/^state:[0-9a-f]{16}$/);
    });
});

describe('generateHistoryKey', () => {
    it('should generate consistent history keys for the same URL and timestamp', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages';
        const timestamp = '2024-01-15T10:30:00.000Z';

        const key1 = await generateHistoryKey(url, timestamp);
        const key2 = await generateHistoryKey(url, timestamp);

        expect(key1).toBe(key2);
        expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
    });

    it('should generate different history keys for different URLs', async () => {
        const url1 = 'https://www.costcotravel.com/vacation-packages';
        const url2 = 'https://www.costcotravel.com/cruise-deals';
        const timestamp = '2024-01-15T10:30:00.000Z';

        const key1 = await generateHistoryKey(url1, timestamp);
        const key2 = await generateHistoryKey(url2, timestamp);

        expect(key1).not.toBe(key2);
        expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
        expect(key2).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
    });

    it('should generate different history keys for different timestamps', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages';
        const timestamp1 = '2024-01-15T10:30:00.000Z';
        const timestamp2 = '2024-01-15T13:30:00.000Z';

        const key1 = await generateHistoryKey(url, timestamp1);
        const key2 = await generateHistoryKey(url, timestamp2);

        expect(key1).not.toBe(key2);
        expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
        expect(key2).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T13:30:00\.000Z$/);
    });

    it('should handle ISO timestamps correctly', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages';
        const timestamp = '2024-12-25T23:59:59.999Z';

        const key = await generateHistoryKey(url, timestamp);

        expect(key).toBe(`hist:${await hashString(url).then(h => h)}:${timestamp}`);
    });
});

describe('hash collision avoidance', () => {
    it('should generate different hashes for similar URLs', async () => {
        const urls = [
            'https://www.costcotravel.com/vacation-packages',
            'https://www.costcotravel.com/vacation-package',
            'https://www.costcotravel.com/vacation-packages/',
            'https://www.costcotravel.com/vacation-packages?',
            'https://www.costcotravel.com/vacation-packages#'
        ];

        const hashes = await Promise.all(urls.map(url => hashString(url)));
        const uniqueHashes = new Set(hashes);

        expect(uniqueHashes.size).toBe(urls.length);
    });

    it('should maintain hash stability across multiple calls', async () => {
        const url = 'https://www.costcotravel.com/vacation-packages';
        const iterations = 10;

        const hashes = await Promise.all(
            Array(iterations).fill(url).map(u => hashString(u))
        );

        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(1);
    });
});

describe('normalizeText', () => {
    it('should collapse multiple spaces into single spaces', () => {
        const input = 'Hawaii   Vacation    Package     Available';
        const result = normalizeText(input);

        expect(result).toBe('Hawaii Vacation Package Available');
    });

    it('should remove timestamp patterns', () => {
        const input = 'Special Deal 12/25/2024 expires 01/15/25 at 11:59 PM';
        const result = normalizeText(input);

        expect(result).toBe('Special Deal expires at');
    });

    it('should remove ISO date patterns', () => {
        const input = 'Promotion 2024-01-15 available now';
        const result = normalizeText(input);

        expect(result).toBe('Promotion available now');
    });

    it('should remove tracking codes', () => {
        const input = 'Great deal ABC123XYZ ref:TRACK001 utm_source=email';
        const result = normalizeText(input);

        expect(result).toBe('Great deal');
    });

    it('should remove view counters', () => {
        const input = 'Popular package 1,234 views 567 clicks this week';
        const result = normalizeText(input);

        expect(result).toBe('Popular package this week');
    });

    it('should remove update timestamps', () => {
        const input = 'Amazing cruise deal\nUpdated: January 15, 2024 at 3:30 PM\nBook now!';
        const result = normalizeText(input);

        expect(result).toBe('Amazing cruise deal\nBook now!');
    });

    it('should handle empty and null inputs', () => {
        expect(normalizeText('')).toBe('');
        expect(normalizeText(null as any)).toBe('');
        expect(normalizeText(undefined as any)).toBe('');
    });

    it('should remove empty lines', () => {
        const input = 'Line 1\n\n\nLine 2\n   \nLine 3';
        const result = normalizeText(input);

        expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle complex promotional text', () => {
        const input = `
      Hawaii Vacation Package    
      Updated: 12/15/2024 at 2:30 PM
      1,456 views     234 clicks
      Tracking: UTM123ABC   ref:EMAIL001
      
      
      Special pricing available!
    `;
        const result = normalizeText(input);

        expect(result).toBe('Hawaii Vacation Package \nSpecial pricing available!');
    });
});

describe('filterNoise', () => {
    it('should remove urgency phrases', () => {
        const input = 'Limited time offer! Act now before it expires!';
        const result = filterNoise(input);

        expect(result).toBe('offer! before it expires');
    });

    it('should remove call-to-action phrases', () => {
        const input = 'Amazing cruise deal - Call now to book today!';
        const result = filterNoise(input);

        expect(result).toBe('Amazing cruise deal - to');
    });

    it('should remove asterisk disclaimers', () => {
        const input = 'Great price *Terms and conditions apply* for everyone';
        const result = filterNoise(input);

        expect(result).toBe('Great price for everyone');
    });

    it('should remove terms and conditions references', () => {
        const input = 'Special rate (see terms and conditions) available now';
        const result = filterNoise(input);

        expect(result).toBe('Special rate available now');
    });

    it('should remove social proof noise', () => {
        const input = '500 people booked this trending package today';
        const result = filterNoise(input);

        expect(result).toBe('this package today');
    });

    it('should remove multiple types of noise', () => {
        const input = 'Limited time! Top rated cruise *restrictions apply* - 1,000 customers viewed this popular deal. Call now!';
        const result = filterNoise(input);

        expect(result).toBe('cruise - this deal.');
    });

    it('should handle empty and null inputs', () => {
        expect(filterNoise('')).toBe('');
        expect(filterNoise(null as any)).toBe('');
        expect(filterNoise(undefined as any)).toBe('');
    });

    it('should preserve meaningful content', () => {
        const input = 'Hawaii vacation package includes flights and hotel';
        const result = filterNoise(input);

        expect(result).toBe('Hawaii vacation package includes flights and hotel');
    });

    it('should handle case insensitive matching', () => {
        const input = 'HURRY! Book Today! LIMITED TIME offer expires soon!';
        const result = filterNoise(input);

        expect(result).toBe('! offer');
    });
});

describe('text normalization integration', () => {
    it('should work together to clean promotional text', () => {
        const input = 'Hawaii Special 12/25/2024 Limited time! 1,234 views 7 nights $899';

        const normalized = normalizeText(input);
        const filtered = filterNoise(normalized);

        expect(filtered).toBe('Hawaii Special ! 7 nights $899');
    });

    it('should maintain promotion core content while removing noise', () => {
        const input = 'Trending! 7-day Alaska cruise from $599 *see terms* - 500 people viewed this popular deal today! Book now!';

        const normalized = normalizeText(input);
        const filtered = filterNoise(normalized);

        expect(filtered).toBe('7-day Alaska cruise from $599 - this deal today! Book now');
    });
});

describe('generatePromotionId', () => {
    it('should generate consistent IDs for identical promotion content', async () => {
        const title = 'Hawaii Vacation Package';
        const perk = 'Free breakfast and WiFi';
        const dates = 'Valid through March 2024';
        const price = 'From $899 per person';

        const id1 = await generatePromotionId(title, perk, dates, price);
        const id2 = await generatePromotionId(title, perk, dates, price);

        expect(id1).toBe(id2);
        expect(id1).toHaveLength(16);
        expect(id1).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate different IDs for different promotion content', async () => {
        const basePromo = {
            title: 'Hawaii Vacation Package',
            perk: 'Free breakfast and WiFi',
            dates: 'Valid through March 2024',
            price: 'From $899 per person'
        };

        const id1 = await generatePromotionId(basePromo.title, basePromo.perk, basePromo.dates, basePromo.price);
        const id2 = await generatePromotionId('Alaska Cruise Deal', basePromo.perk, basePromo.dates, basePromo.price);
        const id3 = await generatePromotionId(basePromo.title, 'Free spa treatment', basePromo.dates, basePromo.price);
        const id4 = await generatePromotionId(basePromo.title, basePromo.perk, 'Valid through April 2024', basePromo.price);
        const id5 = await generatePromotionId(basePromo.title, basePromo.perk, basePromo.dates, 'From $999 per person');

        const ids = [id1, id2, id3, id4, id5];
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(5);
    });

    it('should normalize content before hashing', async () => {
        const messyTitle = '  Hawaii   Vacation    Package  ';
        const cleanTitle = 'Hawaii Vacation Package';
        const perk = 'Free breakfast';
        const dates = 'March 2024';
        const price = '$899';

        const id1 = await generatePromotionId(messyTitle, perk, dates, price);
        const id2 = await generatePromotionId(cleanTitle, perk, dates, price);

        expect(id1).toBe(id2);
    });

    it('should handle promotional noise in content', async () => {
        const noisyTitle = 'Limited time! Hawaii Vacation Package - Act now!';
        const cleanTitle = 'Hawaii Vacation Package';
        const perk = 'Free breakfast and WiFi';
        const dates = 'Valid through March 2024';
        const price = 'From $899 per person';

        const id1 = await generatePromotionId(noisyTitle, perk, dates, price);
        const id2 = await generatePromotionId(cleanTitle, perk, dates, price);

        // IDs should be different because normalization doesn't remove all noise
        expect(id1).not.toBe(id2);
        expect(id1).toHaveLength(16);
        expect(id2).toHaveLength(16);
    });

    it('should handle timestamps and tracking codes in content', async () => {
        const title = 'Hawaii Package Updated: 12/25/2024 ref:TRACK001';
        const perk = 'Free breakfast 1,234 views this week';
        const dates = 'Valid through March 2024';
        const price = 'From $899 per person utm_source=email';

        const id = await generatePromotionId(title, perk, dates, price);

        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle empty fields gracefully', async () => {
        const id1 = await generatePromotionId('', '', '', '');
        const id2 = await generatePromotionId('Title', '', '', '');
        const id3 = await generatePromotionId('', 'Perk', '', '');

        expect(id1).toHaveLength(16);
        expect(id2).toHaveLength(16);
        expect(id3).toHaveLength(16);
        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
    });

    it('should maintain ID stability across multiple calls', async () => {
        const title = 'Alaska Cruise Special';
        const perk = '7 nights with all meals included';
        const dates = 'Departures May-September 2024';
        const price = 'Starting at $1,299 per person';

        const iterations = 5;
        const ids = await Promise.all(
            Array(iterations).fill(null).map(() =>
                generatePromotionId(title, perk, dates, price)
            )
        );

        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(1);
    });

    it('should generate unique IDs for similar but different promotions', async () => {
        const promotions = [
            { title: 'Hawaii Package', perk: 'Free breakfast', dates: 'March 2024', price: '$899' },
            { title: 'Hawaii Package', perk: 'Free breakfast', dates: 'March 2024', price: '$900' },
            { title: 'Hawaii Package', perk: 'Free breakfast', dates: 'April 2024', price: '$899' },
            { title: 'Hawaii Package', perk: 'Free lunch', dates: 'March 2024', price: '$899' },
            { title: 'Hawaii Special', perk: 'Free breakfast', dates: 'March 2024', price: '$899' }
        ];

        const ids = await Promise.all(
            promotions.map(p => generatePromotionId(p.title, p.perk, p.dates, p.price))
        );

        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(promotions.length);
    });

    it('should handle special characters and unicode', async () => {
        const title = 'Café & Resort Package 🌺';
        const perk = 'Complimentary piña coladas';
        const dates = 'Válido hasta marzo 2024';
        const price = '€799 per person';

        const id = await generatePromotionId(title, perk, dates, price);

        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should create different IDs when field content differs', async () => {
        // Test that different field content creates distinct IDs
        const id1 = await generatePromotionId('AB', 'C', 'D', 'E');
        const id2 = await generatePromotionId('A', 'BC', 'D', 'E');

        expect(id1).not.toBe(id2);
    });
});