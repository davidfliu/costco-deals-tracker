/**
 * Unit tests for target management endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetTargets, handlePostTargets } from './utils';
import { Target, Env } from './types';

// Mock KV storage functions
const mockReadTargets = vi.fn();
const mockWriteTargets = vi.fn();
const mockValidateTargets = vi.fn();

vi.mock('./kv-storage', () => ({
  readTargets: mockReadTargets,
  writeTargets: mockWriteTargets,
  validateTargets: mockValidateTargets
}));

describe('Target Management Endpoints', () => {
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
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock behaviors
    mockValidateTargets.mockReturnValue(true);
    mockWriteTargets.mockResolvedValue(undefined);
    mockReadTargets.mockResolvedValue([]);
  });

  describe('handleGetTargets', () => {
    it('should return targets configuration for authenticated request', async () => {
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json() as any;
      expect(body.targets).toEqual(sampleTargets);
      expect(body.count).toBe(2);
      expect(body.timestamp).toBeDefined();
      expect(mockReadTargets).toHaveBeenCalledWith(mockEnv);
    });

    it('should return empty array when no targets configured', async () => {
      mockReadTargets.mockResolvedValue([]);

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.targets).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('should reject unauthenticated request', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'GET'
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Missing authorization token');
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mockReadTargets).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid authorization token');
      expect(mockReadTargets).not.toHaveBeenCalled();
    });

    it('should handle KV storage errors gracefully', async () => {
      mockReadTargets.mockRejectedValue(new Error('KV storage unavailable'));

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Failed to retrieve targets configuration');
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.details).toBe('KV storage unavailable');
    });

    it('should handle non-Error exceptions', async () => {
      mockReadTargets.mockRejectedValue('String error');

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.details).toBe('String error');
    });
  });

  describe('handlePostTargets', () => {

    it('should update targets configuration with direct array', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json() as any;
      expect(body.message).toBe('Targets configuration updated successfully');
      expect(body.count).toBe(2);
      expect(body.timestamp).toBeDefined();
      
      expect(mockValidateTargets).toHaveBeenCalledWith(sampleTargets);
      expect(mockWriteTargets).toHaveBeenCalledWith(mockEnv, sampleTargets);
    });

    it('should update targets configuration with wrapped object', async () => {
      const wrappedTargets = { targets: sampleTargets };
      
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wrappedTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.count).toBe(2);
      
      expect(mockValidateTargets).toHaveBeenCalledWith(sampleTargets);
      expect(mockWriteTargets).toHaveBeenCalledWith(mockEnv, sampleTargets);
    });

    it('should handle empty targets array', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([])
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.count).toBe(0);
      
      expect(mockValidateTargets).toHaveBeenCalledWith([]);
      expect(mockWriteTargets).toHaveBeenCalledWith(mockEnv, []);
    });

    it('should reject unauthenticated request', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Missing authorization token');
      expect(mockValidateTargets).not.toHaveBeenCalled();
      expect(mockWriteTargets).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid authorization token');
      expect(mockValidateTargets).not.toHaveBeenCalled();
      expect(mockWriteTargets).not.toHaveBeenCalled();
    });

    it('should reject request with empty body', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: ''
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Request body is required');
      expect(body.code).toBe('INVALID_REQUEST');
    });

    it('should reject request with whitespace-only body', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: '   \n\t  '
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Request body is required');
    });

    it('should reject request with invalid JSON', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: '{ invalid json }'
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid JSON in request body');
      expect(body.code).toBe('INVALID_JSON');
      expect(body.details).toBeDefined();
    });

    it('should reject non-object request body', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: '"string value"'
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Request body must be an object');
      expect(body.code).toBe('INVALID_REQUEST');
    });

    it('should reject request without targets array', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ other: 'data' })
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Request must contain a "targets" array or be an array of targets');
      expect(body.code).toBe('INVALID_REQUEST');
    });

    it('should reject invalid targets configuration', async () => {
      mockValidateTargets.mockReturnValue(false);

      const invalidTargets = [{ url: 'invalid' }]; // Missing selector
      
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid targets configuration');
      expect(body.code).toBe('INVALID_TARGETS');
      expect(body.details).toContain('url and selector properties');
      
      expect(mockValidateTargets).toHaveBeenCalledWith(invalidTargets);
      expect(mockWriteTargets).not.toHaveBeenCalled();
    });

    it('should handle KV storage write errors', async () => {
      mockWriteTargets.mockRejectedValue(new Error('KV write failed'));

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Failed to update targets configuration');
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.details).toBe('KV write failed');
    });

    it('should handle non-Error exceptions during write', async () => {
      mockWriteTargets.mockRejectedValue('String error');

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.details).toBe('String error');
    });

    it('should handle validation errors during write', async () => {
      mockWriteTargets.mockRejectedValue(new Error('Invalid targets configuration provided'));

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sampleTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(500);
      
      const body = await response.json() as any;
      expect(body.details).toBe('Invalid targets configuration provided');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete GET flow', async () => {
      mockReadTargets.mockResolvedValue(sampleTargets);

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      const response = await handleGetTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.targets).toHaveLength(2);
      expect(body.targets[0].name).toBe('Hawaii Packages');
      expect(body.targets[1].enabled).toBe(false);
    });

    it('should handle complete POST flow', async () => {
      const newTargets: Target[] = [
        {
          url: 'https://www.costcotravel.com/vacation-packages/europe',
          selector: '.promotion-card',
          name: 'Europe Tours',
          enabled: true
        }
      ];

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targets: newTargets })
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.message).toContain('updated successfully');
      expect(body.count).toBe(1);
      
      expect(mockWriteTargets).toHaveBeenCalledWith(mockEnv, newTargets);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large targets configuration', async () => {
      const largeTargets = Array.from({ length: 100 }, (_, i) => ({
        url: `https://www.costcotravel.com/test-${i}`,
        selector: '.promo',
        name: `Test Target ${i}`,
        enabled: i % 2 === 0
      }));

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(largeTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.count).toBe(100);
    });

    it('should handle targets with special characters', async () => {
      const specialTargets: Target[] = [
        {
          url: 'https://www.costcotravel.com/vacation-packages/special?param=value&other=test',
          selector: '.promo-container[data-test="value"]',
          name: 'Special Characters: !@#$%^&*()',
          notes: 'Notes with "quotes" and \'apostrophes\' and unicode: 🌴',
          enabled: true
        }
      ];

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(specialTargets)
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(200);
      
      expect(mockWriteTargets).toHaveBeenCalledWith(mockEnv, specialTargets);
    });

    it('should handle null and undefined values in request', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: 'null'
      });

      const response = await handlePostTargets(request, mockEnv);
      
      expect(response.status).toBe(400);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Request body must be an object');
    });
  });
});