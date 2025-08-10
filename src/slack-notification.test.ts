/**
 * Unit tests for Slack notification functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSlackMessage, sendSlackNotification } from './utils';
import { ChangeResult, Promotion } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Slack Notification System', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatSlackMessage', () => {
    it('should format message with added promotions', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion1, promotion2],
        removed: [],
        changed: [],
        summary: '2 new promotions'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);

      // Check header block
      const headerBlock = message.blocks.find(block => block.type === 'header');
      expect(headerBlock).toBeDefined();
      expect(headerBlock?.text?.text).toContain('Costco Hawaii Deals');

      // Check context block with URL and timestamp
      const contextBlock = message.blocks.find(block => block.type === 'context');
      expect(contextBlock).toBeDefined();
      expect(contextBlock?.elements?.[0]?.text).toContain('https://www.costcotravel.com/hawaii');

      // Check summary block
      const summaryBlock = message.blocks.find(block => 
        block.type === 'section' && block.text?.text?.includes('Changes detected')
      );
      expect(summaryBlock).toBeDefined();
      expect(summaryBlock?.text?.text).toContain('2 new promotions');

      // Check new promotions section
      const newPromosHeader = message.blocks.find(block => 
        block.type === 'section' && block.text?.text?.includes('🆕 New Promotions')
      );
      expect(newPromosHeader).toBeDefined();
      expect(newPromosHeader?.text?.text).toContain('(2)');
    });

    it('should format message with changed promotions', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{ previous: promotion1, current: modifiedPromotion1 }],
        summary: '1 promotion updated'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Check updated promotions section
      const updatedPromosHeader = message.blocks.find(block => 
        block.type === 'section' && block.text?.text?.includes('🔄 Updated Promotions')
      );
      expect(updatedPromosHeader).toBeDefined();
      expect(updatedPromosHeader?.text?.text).toContain('(1)');

      // Should contain both old and new price information
      const promotionBlocks = message.blocks.filter(block => 
        block.type === 'section' && block.text?.text?.includes('$1,')
      );
      expect(promotionBlocks.length).toBeGreaterThan(0);
    });

    it('should format message with removed promotions', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [promotion2],
        changed: [],
        summary: '1 promotion removed'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Check removed promotions section
      const removedPromosHeader = message.blocks.find(block => 
        block.type === 'section' && block.text?.text?.includes('❌ Removed Promotions')
      );
      expect(removedPromosHeader).toBeDefined();
      expect(removedPromosHeader?.text?.text).toContain('(1)');
    });

    it('should format message with mixed changes', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion3],
        removed: [promotion2],
        changed: [{ previous: promotion1, current: modifiedPromotion1 }],
        summary: '1 new promotion, 1 promotion removed, and 1 promotion updated'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Should have all three types of changes
      const newPromosHeader = message.blocks.find(block => 
        block.text?.text?.includes('🆕 New Promotions')
      );
      const updatedPromosHeader = message.blocks.find(block => 
        block.text?.text?.includes('🔄 Updated Promotions')
      );
      const removedPromosHeader = message.blocks.find(block => 
        block.text?.text?.includes('❌ Removed Promotions')
      );

      expect(newPromosHeader).toBeDefined();
      expect(updatedPromosHeader).toBeDefined();
      expect(removedPromosHeader).toBeDefined();
    });

    it('should limit to 3 items maximum', () => {
      const manyPromotions: Promotion[] = [];
      for (let i = 0; i < 10; i++) {
        manyPromotions.push({
          id: `promo${i}`,
          title: `Deal ${i}`,
          perk: `Benefit ${i}`,
          dates: `2025-${String(i % 12 + 1).padStart(2, '0')}-01`,
          price: `$${1000 + i}`
        });
      }

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: manyPromotions,
        removed: [],
        changed: [],
        summary: '10 new promotions'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Count promotion detail blocks (excluding headers and context)
      const promotionDetailBlocks = message.blocks.filter(block => 
        block.type === 'section' && 
        block.text?.text?.includes('Deal ') &&
        !block.text?.text?.includes('🆕')
      );

      expect(promotionDetailBlocks.length).toBeLessThanOrEqual(3);

      // Should have "... and X more" message
      const moreItemsBlock = message.blocks.find(block => 
        block.type === 'context' && 
        block.elements?.[0]?.text?.includes('... and')
      );
      expect(moreItemsBlock).toBeDefined();
      expect(moreItemsBlock?.elements?.[0]?.text).toContain('7 more new promotions');
    });

    it('should handle empty target name gracefully', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion1],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        '',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      const headerBlock = message.blocks.find(block => block.type === 'header');
      expect(headerBlock?.text?.text).toContain('Costco Travel Deal');
    });

    it('should escape special characters in promotion text', () => {
      const specialPromotion: Promotion = {
        id: 'special1',
        title: 'Deal with *asterisks* & <brackets>',
        perk: 'Free _underscores_ and ~tildes~',
        dates: 'Valid `backticks` included',
        price: '$1,000 & more'
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [specialPromotion],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      const messageText = JSON.stringify(message);
      
      // Check that special characters are escaped
      expect(messageText).toContain('\\\\*asterisks\\\\*');
      expect(messageText).toContain('&lt;brackets&gt;');
      expect(messageText).toContain('\\\\_underscores\\\\_');
      expect(messageText).toContain('\\\\~tildes\\\\~');
      expect(messageText).toContain('\\\\`backticks\\\\`');
      expect(messageText).toContain('&amp; more');
    });

    it('should format timestamps correctly', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion1],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      // Test recent timestamp (should show "X minutes ago")
      const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
      const message1 = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        recentTime
      );

      const contextBlock1 = message1.blocks.find(block => block.type === 'context');
      expect(contextBlock1?.elements?.[0]?.text).toContain('5 minutes ago');

      // Test older timestamp (should show formatted date)
      const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
      const message2 = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        oldTime
      );

      const contextBlock2 = message2.blocks.find(block => block.type === 'context');
      expect(contextBlock2?.elements?.[0]?.text).not.toContain('minutes ago');
    });

    it('should handle promotions with missing fields', () => {
      const incompletePromotion: Promotion = {
        id: 'incomplete1',
        title: 'Only Title',
        perk: '',
        dates: '',
        price: ''
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [incompletePromotion],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Should still create a valid message
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);

      // Should contain the title
      const messageText = JSON.stringify(message);
      expect(messageText).toContain('Only Title');
    });

    it('should show changes with strikethrough for old values', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [],
        removed: [],
        changed: [{ previous: promotion1, current: modifiedPromotion1 }],
        summary: '1 promotion updated'
      };

      const message = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      const messageText = JSON.stringify(message);
      
      // Should contain both old (strikethrough) and new values
      expect(messageText).toContain('$1,199 per person'); // New price
      expect(messageText).toContain('~$1,299 per person~'); // Old price with strikethrough
      expect(messageText).toContain('spa credit'); // New perk content
    });
  });

  describe('sendSlackNotification', () => {
    const validWebhookUrl = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
    const validMessage = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn' as const,
            text: 'Test message'
          }
        }
      ]
    };

    it('should send notification successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok')
      });

      const response = await sendSlackNotification(validWebhookUrl, validMessage);

      expect(mockFetch).toHaveBeenCalledWith(
        validWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CostcoTravelWatcher/1.0'
          },
          body: JSON.stringify(validMessage)
        })
      );

      expect(response.ok).toBe(true);
    });

    it('should reject invalid webhook URLs', async () => {
      const invalidUrls = [
        '',
        'https://example.com/webhook',
        'http://hooks.slack.com/services/invalid',
        'not-a-url'
      ];

      for (const url of invalidUrls) {
        await expect(sendSlackNotification(url, validMessage))
          .rejects.toThrow('Invalid Slack webhook URL');
      }
    });

    it('should reject empty messages', async () => {
      const emptyMessage = { blocks: [] };

      await expect(sendSlackNotification(validWebhookUrl, emptyMessage))
        .rejects.toThrow('Message must contain at least one block');
    });

    it('should handle HTTP errors from Slack', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid_payload')
      });

      await expect(sendSlackNotification(validWebhookUrl, validMessage))
        .rejects.toThrow('Slack webhook failed: HTTP 400 - invalid_payload');
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        })
      );

      await expect(sendSlackNotification(validWebhookUrl, validMessage, 50))
        .rejects.toThrow('Slack webhook timeout after 50ms');
    });

    it('should handle network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(sendSlackNotification(validWebhookUrl, validMessage))
        .rejects.toThrow('Network error');
    });

    it('should use default timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok')
      });

      await sendSlackNotification(validWebhookUrl, validMessage);

      // Verify fetch was called with signal (timeout controller)
      expect(mockFetch).toHaveBeenCalledWith(
        validWebhookUrl,
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    it('should handle Slack rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate_limited')
      });

      await expect(sendSlackNotification(validWebhookUrl, validMessage))
        .rejects.toThrow('Slack webhook failed: HTTP 429 - rate_limited');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(sendSlackNotification(validWebhookUrl, validMessage))
        .rejects.toThrow('Slack webhook failed: HTTP 500 - Unknown error');
    });
  });

  describe('Integration Tests', () => {
    it('should create and send a complete notification', async () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion1],
        removed: [],
        changed: [{ previous: promotion2, current: { ...promotion2, price: '$999-$1,699' } }],
        summary: '1 new promotion and 1 promotion updated'
      };

      const message = formatSlackMessage(
        'Costco Hawaii Deals',
        'https://www.costcotravel.com/hawaii',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok')
      });

      const webhookUrl = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
      const response = await sendSlackNotification(webhookUrl, message);

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hawaii Vacation Package')
        })
      );
    });

    it('should handle large change sets efficiently', async () => {
      const manyPromotions: Promotion[] = [];
      const manyChanges: Array<{ previous: Promotion; current: Promotion }> = [];

      for (let i = 0; i < 20; i++) {
        const promo: Promotion = {
          id: `promo${i}`,
          title: `Deal ${i}`,
          perk: `Benefit ${i}`,
          dates: `2025-${String(i % 12 + 1).padStart(2, '0')}-01`,
          price: `$${1000 + i}`
        };
        manyPromotions.push(promo);

        if (i < 10) {
          manyChanges.push({
            previous: promo,
            current: { ...promo, price: `$${2000 + i}` }
          });
        }
      }

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: manyPromotions,
        removed: manyPromotions.slice(0, 5),
        changed: manyChanges,
        summary: '20 new promotions, 5 promotions removed, and 10 promotions updated'
      };

      const message = formatSlackMessage(
        'Large Change Set',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Message should be created successfully despite large change set
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);

      // Should limit the number of detailed items shown
      const promotionDetailBlocks = message.blocks.filter(block => 
        block.type === 'section' && 
        block.text?.text?.includes('Deal ') &&
        !block.text?.text?.includes('🆕') &&
        !block.text?.text?.includes('🔄') &&
        !block.text?.text?.includes('❌')
      );

      expect(promotionDetailBlocks.length).toBeLessThanOrEqual(3);

      // Should have "more items" indicators
      const moreItemsBlocks = message.blocks.filter(block => 
        block.type === 'context' && 
        block.elements?.[0]?.text?.includes('... and')
      );

      expect(moreItemsBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long promotion text', () => {
      const longPromotion: Promotion = {
        id: 'long1',
        title: 'A'.repeat(200),
        perk: 'B'.repeat(500),
        dates: 'C'.repeat(100),
        price: 'D'.repeat(50)
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [longPromotion],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      // Should create message without errors
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);

      // Message should be valid JSON
      expect(() => JSON.stringify(message)).not.toThrow();
    });

    it('should handle invalid timestamps gracefully', () => {
      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [promotion1],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        'Test Target',
        'https://example.com',
        changeResult,
        'invalid-timestamp'
      );

      const contextBlock = message.blocks.find(block => block.type === 'context');
      expect(contextBlock?.elements?.[0]?.text).toContain('invalid-timestamp');
    });

    it('should handle Unicode characters correctly', () => {
      const unicodePromotion: Promotion = {
        id: 'unicode1',
        title: '🏖️ Beach Resort Deal 🌺',
        perk: 'Includes 🍹 drinks & 🍽️ meals',
        dates: 'Valid 📅 2025',
        price: '💰 $1,500'
      };

      const changeResult: ChangeResult = {
        hasChanges: true,
        added: [unicodePromotion],
        removed: [],
        changed: [],
        summary: '1 new promotion'
      };

      const message = formatSlackMessage(
        'Unicode Test',
        'https://example.com',
        changeResult,
        '2025-01-08T10:30:00Z'
      );

      const messageText = JSON.stringify(message);
      expect(messageText).toContain('🏖️');
      expect(messageText).toContain('🌺');
      expect(messageText).toContain('🍹');
    });
  });
});