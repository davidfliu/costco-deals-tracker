/**
 * Unit tests for manual run endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleManualRun } from './utils';
import { Target, Env } from './types';

// Mock KV storage functions
const mockReadTargets = vi.fn();

vi.mock('./kv-storage', () => ({
  readTargets: mockReadTargets
}));

describe('Manual Run Endpoint', () => {
  const validToken = 'test-admin-token-12345';
  const mockEnv: Env = {
    DEAL_WATCHER: {} as KVNamespace,
    ADMIN_TOKEN: validToken,
    SLACK_WEBHOOK: 'https://hooks.slack.com/test'
  };

  const sampleTargets: Target[] = [
    {
      url: 'https://www.costcotravel.com/vacation-packages/hawaii',
      selector: '.promo-container',
      name: 'Hawaii Packages',
      notes: 'Monitor Hawaii vacation deals',
      enabled: true
    },
    {
      url: 'https://www.costcotravel.com/vacation-packages/caribbean',
      selector: '.deal-box',
      name: 'Caribbean Deals',
      enabled: false
    },
    {
      url: 'https://www.costcotravel.com/vacation-packages/europe',
      selector: '.promotion-card',
      name: 'Europe Tours',
      enabled: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock behaviors
    mockReadTargets.mockResolvedValue([]);
    
    // Mock console.log to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Authentication', () => {
    it('should reject unauthenticated request', async () => {
      const request = new Request('https://example.com/admin/run', {
        method: 'POST'
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Missing authorization token');
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mockReadTargets).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid authorization token');
      expect(mockReadTargets).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', async () => {
      mockReadTargets.mockResolvedValue([]);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(mockReadTargets).toHaveBeenCalledWith(mockEnv);
    });
  });

  describe('Target Processing', () => {
    it('should handle no targets configured', async () => {
      mockReadTargets.mockResolvedValue([]);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json() as any;
      expect(body.message).toBe('Manual run completed - no targets configured');
      expect(body.timestamp).toBeDefined();
      expect(body.duration).toBeGreaterThanOrEqual(0);
      expect(body.results.processed).toBe(0);
      expect(body.results.successful).toBe(0);
      expect(body.results.failed).toBe(0);
      expect(body.results.changes).toBe(0);
    });

    it('should handle no enabled targets', async () => {
      const disabledTargets = sampleTargets.map(target => ({ ...target, enabled: false }));
      mockReadTargets.mockResolvedValue(disabledTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.message).toBe('Manual run completed - no enabled targets');
      expect(body.results.processed).toBe(0);
    });

    it('should process enabled targets only', async () => {
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.message).toBe('Manual run completed successfully');
      expect(body.results.processed).toBe(2); // Only Hawaii and Europe (enabled)
      expect(body.results.successful).toBe(2);
      expect(body.results.failed).toBe(0);
      expect(body.results.targets).toHaveLength(2);
      
      // Check that only enabled targets are included
      const targetNames = body.results.targets.map((t: any) => t.name);
      expect(targetNames).toContain('Hawaii Packages');
      expect(targetNames).toContain('Europe Tours');
      expect(targetNames).not.toContain('Caribbean Deals');
    });

    it('should handle targets with default enabled state', async () => {
      const targetsWithoutEnabled = sampleTargets.map(target => {
        const { enabled, ...rest } = target;
        return rest;
      });
      mockReadTargets.mockResolvedValue(targetsWithoutEnabled);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      // All targets should be processed since enabled defaults to true
      expect(body.results.processed).toBe(3);
      expect(body.results.successful).toBe(3);
    });

    it('should handle targets without names', async () => {
      const targetsWithoutNames = [
        {
          url: 'https://www.costcotravel.com/test1',
          selector: '.promo',
          enabled: true
        },
        {
          url: 'https://www.costcotravel.com/test2',
          selector: '.deal',
          name: 'Named Target',
          enabled: true
        }
      ];
      mockReadTargets.mockResolvedValue(targetsWithoutNames);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.results.processed).toBe(2);
      expect(body.results.targets[0].name).toBe('Unnamed Target');
      expect(body.results.targets[1].name).toBe('Named Target');
    });
  });

  describe('Response Format', () => {
    it('should return proper response structure', async () => {
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json() as any;
      
      // Check required fields
      expect(body.message).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.duration).toBeDefined();
      expect(body.results).toBeDefined();
      
      // Check results structure
      expect(body.results.processed).toBeDefined();
      expect(body.results.successful).toBeDefined();
      expect(body.results.failed).toBeDefined();
      expect(body.results.changes).toBeDefined();
      expect(body.results.targets).toBeDefined();
      
      // Check timestamp format (ISO string)
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      
      // Check duration is a positive number
      expect(typeof body.duration).toBe('number');
      expect(body.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include target details in results', async () => {
      mockReadTargets.mockResolvedValue([sampleTargets[0]]); // Only Hawaii target

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      const body = await response.json() as any;
      
      expect(body.results.targets).toHaveLength(1);
      const target = body.results.targets[0];
      
      expect(target.name).toBe('Hawaii Packages');
      expect(target.url).toBe('https://www.costcotravel.com/vacation-packages/hawaii');
      expect(target.status).toBe('success');
      expect(target.message).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle KV storage read errors', async () => {
      mockReadTargets.mockRejectedValue(new Error('KV storage unavailable'));

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Failed to execute manual run');
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.details).toBe('KV storage unavailable');
    });

    it('should handle non-Error exceptions', async () => {
      mockReadTargets.mockRejectedValue('String error');

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.details).toBe('String error');
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockReadTargets.mockRejectedValue(new Error('Test error'));

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      await handleManualRun(request, mockEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to execute manual run:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Logging', () => {
    it('should log execution start and completion', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      await handleManualRun(request, mockEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Manual run triggered at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Manual run completed in \d+ms - processed 2 targets$/)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should complete execution quickly', async () => {
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const startTime = Date.now();
      const response = await handleManualRun(request, mockEnv);
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      
      // Should complete within reasonable time (less than 1 second for simulation)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(body.duration).toBeLessThan(1000);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle mixed enabled/disabled targets correctly', async () => {
      const mixedTargets = [
        { ...sampleTargets[0], enabled: true },
        { ...sampleTargets[1], enabled: false },
        { ...sampleTargets[2], enabled: true }
      ];
      mockReadTargets.mockResolvedValue(mixedTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      const body = await response.json() as any;
      
      expect(body.results.processed).toBe(2);
      expect(body.results.targets).toHaveLength(2);
      
      const processedUrls = body.results.targets.map((t: any) => t.url);
      expect(processedUrls).toContain('https://www.costcotravel.com/vacation-packages/hawaii');
      expect(processedUrls).toContain('https://www.costcotravel.com/vacation-packages/europe');
      expect(processedUrls).not.toContain('https://www.costcotravel.com/vacation-packages/caribbean');
    });

    it('should handle large number of targets', async () => {
      const manyTargets = Array.from({ length: 50 }, (_, i) => ({
        url: `https://www.costcotravel.com/test-${i}`,
        selector: '.promo',
        name: `Test Target ${i}`,
        enabled: i % 3 !== 0 // Enable 2/3 of targets
      }));
      
      mockReadTargets.mockResolvedValue(manyTargets);

      const request = new Request('https://example.com/admin/run', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleManualRun(request, mockEnv);
      
      const body = await response.json() as any;
      
      // Should process about 33 targets (2/3 of 50)
      expect(body.results.processed).toBeGreaterThan(30);
      expect(body.results.processed).toBeLessThan(40);
      expect(body.results.successful).toBe(body.results.processed);
      expect(body.results.targets).toHaveLength(body.results.processed);
    });
  });
});