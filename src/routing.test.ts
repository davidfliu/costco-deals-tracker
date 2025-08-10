/**
 * Integration tests for request routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import { Env } from './types';

// Mock the utils module
const mockHandleGetTargets = vi.fn();
const mockHandlePostTargets = vi.fn();

vi.mock('./utils', () => ({
  handleGetTargets: mockHandleGetTargets,
  handlePostTargets: mockHandlePostTargets
}));

describe('Request Routing', () => {
  const mockEnv: Env = {
    DEAL_WATCHER: {} as KVNamespace,
    ADMIN_TOKEN: 'test-token',
    SLACK_WEBHOOK: 'https://hooks.slack.com/test'
  };

  const mockCtx = {} as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Admin Targets Endpoints', () => {
    it('should route GET /admin/targets to handleGetTargets', async () => {
      const mockResponse = new Response('GET response');
      mockHandleGetTargets.mockResolvedValue(mockResponse);

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(mockHandleGetTargets).toHaveBeenCalledWith(request, mockEnv);
      expect(mockHandlePostTargets).not.toHaveBeenCalled();
      expect(response).toBe(mockResponse);
    });

    it('should route POST /admin/targets to handlePostTargets', async () => {
      const mockResponse = new Response('POST response');
      mockHandlePostTargets.mockResolvedValue(mockResponse);

      const request = new Request('https://example.com/admin/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([])
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(mockHandlePostTargets).toHaveBeenCalledWith(request, mockEnv);
      expect(mockHandleGetTargets).not.toHaveBeenCalled();
      expect(response).toBe(mockResponse);
    });

    it('should return 405 for unsupported methods on /admin/targets', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'DELETE'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();
      expect(body.error).toBe('Method not allowed');
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
      expect(body.allowed).toEqual(['GET', 'POST']);

      expect(mockHandleGetTargets).not.toHaveBeenCalled();
      expect(mockHandlePostTargets).not.toHaveBeenCalled();
    });

    it('should handle PUT method on /admin/targets', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'PUT'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(405);
      expect(mockHandleGetTargets).not.toHaveBeenCalled();
      expect(mockHandlePostTargets).not.toHaveBeenCalled();
    });

    it('should handle PATCH method on /admin/targets', async () => {
      const request = new Request('https://example.com/admin/targets', {
        method: 'PATCH'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(405);
    });
  });

  describe('Health Check Endpoint', () => {
    it('should handle GET /healthz', async () => {
      const request = new Request('https://example.com/healthz', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBe('1.0.0');

      expect(mockHandleGetTargets).not.toHaveBeenCalled();
      expect(mockHandlePostTargets).not.toHaveBeenCalled();
    });

    it('should return 404 for non-GET methods on /healthz', async () => {
      const request = new Request('https://example.com/healthz', {
        method: 'POST'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);
    });
  });

  describe('Unknown Routes', () => {
    it('should return 404 for unknown paths', async () => {
      const request = new Request('https://example.com/unknown/path', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();
      expect(body.error).toBe('Not found');
      expect(body.code).toBe('NOT_FOUND');
      expect(body.path).toBe('/unknown/path');

      expect(mockHandleGetTargets).not.toHaveBeenCalled();
      expect(mockHandlePostTargets).not.toHaveBeenCalled();
    });

    it('should return 404 for root path', async () => {
      const request = new Request('https://example.com/', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.path).toBe('/');
    });

    it('should return 404 for admin path without targets', async () => {
      const request = new Request('https://example.com/admin', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.path).toBe('/admin');
    });
  });

  describe('URL Parsing', () => {
    it('should handle URLs with query parameters', async () => {
      const request = new Request('https://example.com/admin/targets?test=value', {
        method: 'GET'
      });

      const mockResponse = new Response('GET response');
      mockHandleGetTargets.mockResolvedValue(mockResponse);

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(mockHandleGetTargets).toHaveBeenCalledWith(request, mockEnv);
      expect(response).toBe(mockResponse);
    });

    it('should handle URLs with fragments', async () => {
      const request = new Request('https://example.com/admin/targets#section', {
        method: 'GET'
      });

      const mockResponse = new Response('GET response');
      mockHandleGetTargets.mockResolvedValue(mockResponse);

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(mockHandleGetTargets).toHaveBeenCalledWith(request, mockEnv);
    });

    it('should handle URLs with trailing slashes', async () => {
      const request = new Request('https://example.com/admin/targets/', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      // Should return 404 because path is '/admin/targets/' not '/admin/targets'
      expect(response.status).toBe(404);
      expect(mockHandleGetTargets).not.toHaveBeenCalled();
    });

    it('should be case sensitive for paths', async () => {
      const request = new Request('https://example.com/Admin/Targets', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);
      expect(mockHandleGetTargets).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors from endpoint handlers', async () => {
      mockHandleGetTargets.mockRejectedValue(new Error('Handler error'));

      const request = new Request('https://example.com/admin/targets', {
        method: 'GET'
      });

      // The error should propagate up
      await expect(worker.fetch(request, mockEnv, mockCtx)).rejects.toThrow('Handler error');
    });

    it('should handle malformed URLs gracefully', async () => {
      // This test verifies that URL parsing doesn't throw
      const request = new Request('https://example.com/admin/targets', {
        method: 'GET'
      });

      const mockResponse = new Response('GET response');
      mockHandleGetTargets.mockResolvedValue(mockResponse);

      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response).toBe(mockResponse);
    });
  });

  describe('HTTP Methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    methods.forEach(method => {
      it(`should handle ${method} method correctly`, async () => {
        const request = new Request('https://example.com/admin/targets', {
          method
        });

        if (method === 'GET') {
          const mockResponse = new Response('GET response');
          mockHandleGetTargets.mockResolvedValue(mockResponse);
          
          const response = await worker.fetch(request, mockEnv, mockCtx);
          expect(response).toBe(mockResponse);
        } else if (method === 'POST') {
          const mockResponse = new Response('POST response');
          mockHandlePostTargets.mockResolvedValue(mockResponse);
          
          const response = await worker.fetch(request, mockEnv, mockCtx);
          expect(response).toBe(mockResponse);
        } else {
          const response = await worker.fetch(request, mockEnv, mockCtx);
          expect(response.status).toBe(405);
        }
      });
    });
  });
});