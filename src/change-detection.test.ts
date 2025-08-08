/**
 * Unit tests for change detection functionality
 */

import { describe, it, expect } from 'vitest';
import { detectChanges, filterMaterialChanges } from './utils';
import { Promotion, ChangeResult } from './types';

describe('Change Detection', () => {
  // Sample promotions for testing
  const promotion1: Promotion = {
    id: 'promo1',
    title: 'Hawaii Vacation Package',
    perk: 'Free breakfast and airport transfer',
    dates: 'Valid through March 31, 2025',
    price: '$1,299 per person'
  };

  const promotion2: Promotion = {
    id: 'promo2',
    title: 'Caribbean Cruise Deal',
    perk: 'Complimentary shore excursions',
    dates: 'Departures April-June 2025',
    price: '$899-$1,599'
  };

  const promotion3: Promotion = {
    id: 'promo3',
    title: 'European River Cruise',
    perk: 'All meals included',
    dates: 'Summer 2025 sailings',
    price: 'From $2,499'
  };

  const modifiedPromotion1: Promotion = {
    id: 'promo1',
    title: 'Hawaii Vacation Package',
    perk: 'Free breakfast, airport transfer, and spa credit',
    dates: 'Valid through March 31, 2025',
    price: '$1,199 per person' // Price changed
  };

  const cosmeticModifiedPromotion1: Promotion = {
    id: 'promo1',
    title: 'Hawaii Vacation Package   ', // Extra whitespace
    perk: 'Free breakfast and airport transfer (updated 01/08/2025)', // Timestamp added
    dates: 'Valid through March 31, 2025',
    price: '$1,299 per person'
  };

  describe('detectChanges', () => {
    it('should detect no changes when promotions are identical', () => {
      const current = [promotion1, promotion2];
      const previous = [promotion1, promotion2];

      const result = detectChanges(current, previous);

      expect(result.hasChanges).toBe(false);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
      expect(result.summary).toBe('No changes detected');
    });

    it('should detect added promotions', () => {
      const current = [promotion1, promotion2, promotion3];
      const previous = [promotion1, promotion2];

      const result = detectChanges(current, previous);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.added[0]).toEqual(promotion3);
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(0);
      expect(result.summary).toBe('1 new promotion');
    });

    it('should detect removed promotions', () => {
      const current = [promotion1];
      const previous = [promotion1, promotion2];

      const result = detectChanges(current, previous);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toEqual(promotion2);
      expect(result.changed).toHaveLength(0);
      expect(result.summary).toBe('1 promotion removed');
    });

    it('should detect changed promotions', () => {
      const current = [modifiedPromotion1, promotion2];
      const previous = [promotion1, promotion2];

      const result = detectChanges(current, previous);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].previous).toEqual(promotion1);
      expect(result.changed[0].current).toEqual(modifiedPromotion1);
      expect(result.summary).toBe('1 promotion updated');
    });

    it('should detect multiple types of changes', () => {
      const current = [modifiedPromotion1, promotion3]; // Changed promo1, added promo3
      const previous = [promotion1, promotion2]; // Remove promo2

      const result = detectChanges(current, previous);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.added[0]).toEqual(promotion3);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toEqual(promotion2);
      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].previous).toEqual(promotion1);
      expect(result.changed[0].current).toEqual(modifiedPromotion1);
      expect(result.summary).toBe('1 new promotion, 1 promotion removed, and 1 promotion updated');
    });

    it('should handle empty arrays', () => {
      const result1 = detectChanges([], []);
      expect(result1.hasChanges).toBe(false);
      expect(result1.summary).toBe('No changes detected');

      const result2 = detectChanges([promotion1], []);
      expect(result2.hasChanges).toBe(true);
      expect(result2.added).toHaveLength(1);
      expect(result2.summary).toBe('1 new promotion');

      const result3 = detectChanges([], [promotion1]);
      expect(result3.hasChanges).toBe(true);
      expect(result3.removed).toHaveLength(1);
      expect(result3.summary).toBe('1 promotion removed');
    });

    it('should not detect cosmetic changes as material changes', () => {
      const current = [cosmeticModifiedPromotion1];
      const previous = [promotion1];

      const result = detectChanges(current, previous);

      // Should not detect cosmetic changes as material changes
      expect(result.hasChanges).toBe(false);
      expect(result.changed).toHaveLength(0);
    });

    it('should generate correct summary messages', () => {
      // Test single changes
      expect(detectChanges([promotion1], []).summary).toBe('1 new promotion');
      expect(detectChanges([], [promotion1]).summary).toBe('1 promotion removed');
      expect(detectChanges([modifiedPromotion1], [promotion1]).summary).toBe('1 promotion updated');

      // Test multiple of same type
      expect(detectChanges([promotion1, promotion2], []).summary).toBe('2 new promotions');
      expect(detectChanges([], [promotion1, promotion2]).summary).toBe('2 promotions removed');

      // Test combinations
      expect(detectChanges([promotion1, promotion3], [promotion2]).summary)
        .toBe('2 new promotions and 1 promotion removed');
    });
  });

  describe('filterMaterialChanges', () => {
    const noisePromotion: Promotion = {
      id: 'noise1',
      title: 'Loading...',
      perk: 'Please wait',
      dates: '',
      price: ''
    };

    const shortPromotion: Promotion = {
      id: 'short1',
      title: 'Hi',
      perk: 'Ok',
      dates: '',
      price: ''
    };

    const validPromotion: Promotion = {
      id: 'valid1',
      title: 'Great Vacation Deal',
      perk: 'Includes hotel and flights with complimentary breakfast',
      dates: 'Valid through summer 2025',
      price: '$1,299'
    };

    it('should filter out noise promotions from added', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [noisePromotion, shortPromotion, validPromotion],
        removed: [],
        changed: [],
        summary: '3 new promotions'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.added).toHaveLength(1);
      expect(filtered.added[0]).toEqual(validPromotion);
      expect(filtered.hasChanges).toBe(true);
      expect(filtered.summary).toBe('1 new promotion');
    });

    it('should filter out noise promotions from removed', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [noisePromotion, validPromotion],
        changed: [],
        summary: '2 promotions removed'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.removed).toHaveLength(1);
      expect(filtered.removed[0]).toEqual(validPromotion);
      expect(filtered.hasChanges).toBe(true);
      expect(filtered.summary).toBe('1 promotion removed');
    });

    it('should filter out non-material changes', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [
          {
            previous: promotion1,
            current: cosmeticModifiedPromotion1 // Only cosmetic changes
          },
          {
            previous: promotion1,
            current: modifiedPromotion1 // Material changes
          }
        ],
        summary: '2 promotions updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.changed).toHaveLength(1);
      expect(filtered.changed[0].current).toEqual(modifiedPromotion1);
      expect(filtered.hasChanges).toBe(true);
      expect(filtered.summary).toBe('1 promotion updated');
    });

    it('should return no changes when all changes are filtered out', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [noisePromotion],
        removed: [shortPromotion],
        changed: [{
          previous: promotion1,
          current: cosmeticModifiedPromotion1
        }],
        summary: '1 new promotion, 1 promotion removed, and 1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.added).toHaveLength(0);
      expect(filtered.removed).toHaveLength(0);
      expect(filtered.changed).toHaveLength(0);
      expect(filtered.summary).toBe('No material changes detected');
    });

    it('should preserve material changes', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [validPromotion],
        removed: [promotion2],
        changed: [{
          previous: promotion1,
          current: modifiedPromotion1
        }],
        summary: '1 new promotion, 1 promotion removed, and 1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(true);
      expect(filtered.added).toHaveLength(1);
      expect(filtered.removed).toHaveLength(1);
      expect(filtered.changed).toHaveLength(1);
      expect(filtered.summary).toBe('1 new promotion, 1 promotion removed, and 1 promotion updated');
    });
  });

  describe('Material Change Filtering Patterns', () => {
    it('should filter out promotions with loading/error messages', () => {
      const loadingPromo: Promotion = {
        id: 'loading1',
        title: 'Loading...',
        perk: 'Please wait while we load content',
        dates: '',
        price: ''
      };

      const errorPromo: Promotion = {
        id: 'error1',
        title: '404 Not Found',
        perk: 'Page not found',
        dates: '',
        price: ''
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [loadingPromo, errorPromo],
        removed: [],
        changed: [],
        summary: '2 new promotions'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.added).toHaveLength(0);
    });

    it('should filter out promotions with technical/browser messages', () => {
      const jsPromo: Promotion = {
        id: 'js1',
        title: 'JavaScript Required',
        perk: 'Please enable JavaScript in your browser',
        dates: '',
        price: ''
      };

      const cookiePromo: Promotion = {
        id: 'cookie1',
        title: 'Cookie Notice',
        perk: 'This site uses cookies for privacy',
        dates: '',
        price: ''
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [jsPromo, cookiePromo],
        removed: [],
        changed: [],
        summary: '2 new promotions'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.added).toHaveLength(0);
    });

    it('should preserve promotions with meaningful content', () => {
      const meaningfulPromo: Promotion = {
        id: 'meaningful1',
        title: 'Amazing Vacation Deal',
        perk: 'Includes flights, hotel, and breakfast for the whole family',
        dates: 'Valid through December 2025',
        price: '$1,999 per person'
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [meaningfulPromo],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(true);
      expect(filtered.added).toHaveLength(1);
      expect(filtered.added[0]).toEqual(meaningfulPromo);
    });

    it('should filter out very short or empty content', () => {
      const shortPromo: Promotion = {
        id: 'short1',
        title: 'Hi',
        perk: '',
        dates: '',
        price: ''
      };

      const emptyPromo: Promotion = {
        id: 'empty1',
        title: '',
        perk: '   ',
        dates: '',
        price: ''
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [shortPromo, emptyPromo],
        removed: [],
        changed: [],
        summary: '2 new promotions'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.added).toHaveLength(0);
    });

    it('should detect material price changes', () => {
      const originalPromo: Promotion = {
        id: 'price1',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Summer 2025',
        price: '$1,000'
      };

      const priceChangedPromo: Promotion = {
        id: 'price1',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Summer 2025',
        price: '$1,200' // Significant price change
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{
          previous: originalPromo,
          current: priceChangedPromo
        }],
        summary: '1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(true);
      expect(filtered.changed).toHaveLength(1);
    });

    it('should ignore minor price differences (rounding)', () => {
      const originalPromo: Promotion = {
        id: 'price2',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Summer 2025',
        price: '$1,000.00'
      };

      const minorPriceChangePromo: Promotion = {
        id: 'price2',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Summer 2025',
        price: '$1,000.50' // Minor price change (within tolerance)
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{
          previous: originalPromo,
          current: minorPriceChangePromo
        }],
        summary: '1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.changed).toHaveLength(0);
    });

    it('should detect material date changes', () => {
      const originalPromo: Promotion = {
        id: 'date1',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Valid through March 2025',
        price: '$1,000'
      };

      const dateChangedPromo: Promotion = {
        id: 'date1',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Valid through June 2025', // Significant date change
        price: '$1,000'
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{
          previous: originalPromo,
          current: dateChangedPromo
        }],
        summary: '1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(true);
      expect(filtered.changed).toHaveLength(1);
    });

    it('should ignore similar dates (within a week)', () => {
      const originalPromo: Promotion = {
        id: 'date2',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Valid through 03/15/2025',
        price: '$1,000'
      };

      const similarDatePromo: Promotion = {
        id: 'date2',
        title: 'Vacation Package',
        perk: 'Great deal',
        dates: 'Valid through 03/18/2025', // Within a week
        price: '$1,000'
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{
          previous: originalPromo,
          current: similarDatePromo
        }],
        summary: '1 promotion updated'
      };

      const filtered = filterMaterialChanges(changeResult);

      expect(filtered.hasChanges).toBe(false);
      expect(filtered.changed).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle promotions with missing fields', () => {
      const incompletePromo1: Promotion = {
        id: 'incomplete1',
        title: 'Some Deal',
        perk: '',
        dates: '',
        price: ''
      };

      const incompletePromo2: Promotion = {
        id: 'incomplete2',
        title: '',
        perk: 'Free stuff',
        dates: '',
        price: ''
      };

      const result = detectChanges([incompletePromo1], [incompletePromo2]);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
    });

    it('should handle very similar promotions', () => {
      const similar1: Promotion = {
        id: 'similar1',
        title: 'Hawaii Package Deal',
        perk: 'Free breakfast included',
        dates: 'March 2025',
        price: '$1299'
      };

      const similar2: Promotion = {
        id: 'similar2', // Different ID but similar content
        title: 'Hawaii Package Deal',
        perk: 'Free breakfast included',
        dates: 'March 2025',
        price: '$1299'
      };

      const result = detectChanges([similar2], [similar1]);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
      // Should be treated as different promotions due to different IDs
    });

    it('should handle large arrays efficiently', () => {
      const largeArray1: Promotion[] = [];
      const largeArray2: Promotion[] = [];

      // Create 100 promotions
      for (let i = 0; i < 100; i++) {
        largeArray1.push({
          id: `promo${i}`,
          title: `Deal ${i}`,
          perk: `Benefit ${i}`,
          dates: `2025-${String(i % 12 + 1).padStart(2, '0')}-01`,
          price: `$${1000 + i}`
        });
      }

      // Copy first 50, modify next 25, add 25 new ones
      for (let i = 0; i < 50; i++) {
        largeArray2.push(largeArray1[i]);
      }
      for (let i = 50; i < 75; i++) {
        largeArray2.push({
          ...largeArray1[i],
          price: `$${2000 + i}` // Modified price
        });
      }
      for (let i = 100; i < 125; i++) {
        largeArray2.push({
          id: `promo${i}`,
          title: `New Deal ${i}`,
          perk: `New Benefit ${i}`,
          dates: `2025-${String(i % 12 + 1).padStart(2, '0')}-01`,
          price: `$${1000 + i}`
        });
      }

      const result = detectChanges(largeArray2, largeArray1);

      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(25); // New promotions
      expect(result.removed).toHaveLength(25); // Removed promotions (75-99)
      expect(result.changed).toHaveLength(25); // Modified promotions (50-74)
    });
  });
});