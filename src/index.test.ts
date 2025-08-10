import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Target, Promotion, TargetState, ChangeResult, Env } from './types';
import worker from './index';

// Mock the target processing module
vi.mock('./target-processing', () => ({
  processBatchTargets: vi.fn()
}));

// Mock the utils module
vi.mock('./utils', () => ({
  handleGetTargets: vi.fn(),
  handlePostTargets: vi.fn(),
  handleManualRun: vi.fn()
}));

describe('Core Interfaces', () => {
  it('should define Target interface correctly', () => {
    const target: Target = {
      url: 'https://www.costcotravel.com/example',
      selector: '.promotion-container',
      name: 'Test Target',
      notes: 'Test notes',
      enabled: true
    };
    
    expect(target.url).toBe('https://www.costcotravel.com/example');
    expect(target.selector).toBe('.promotion-container');
    expect(target.enabled).toBe(true);
  });

  it('should define Promotion interface correctly', () => {
    const promotion: Promotion = {
      id: 'test-id-123',
      title: 'Test Promotion',
      perk: 'Free upgrade',
      dates: 'Jan 1 - Dec 31',
      price: '$999'
    };
    
    expect(promotion.id).toBe('test-id-123');
    expect(promotion.title).toBe('Test Promotion');
  });

  it('should define TargetState interface correctly', () => {
    const state: TargetState = {
      hash: 'abc123',
      promos: [],
      lastSeenISO: '2025-01-01T00:00:00Z'
    };
    
    expect(state.hash).toBe('abc123');
    expect(Array.isArray(state.promos)).toBe(true);
  });

  it('should define ChangeResult interface correctly', () => {
    const result: ChangeResult = {
      hasChanges: true,
      added: [],
      removed: [],
      changed: [],
      summary: 'No changes detected'
    };
    
    expect(result.hasChanges).toBe(true);
    expect(Array.isArray(result.added)).toBe(true);
  });
});

describe('Worker Integration Tests', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      DEAL_WATCHER: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      } as any,
      ADMIN_TOKEN: 'test-admin-token',
      SLACK_WEBHOOK: 'https://hooks.slack.com/test'
    };

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    } as any;
  });

  describe('HTTP Request Handling', () => {
    it('should handle GET /admin/targets', async () => {
      const { handleGetTargets } = await import('./utils');
      const mockResponse = new Response(JSON.stringify({ targets: [] }));
      vi.mocked(handleGetTargets).mockResolvedValue(mockResponse);

      const request = new Request('https://worker.example.com/admin/targets', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(handleGetTargets).toHaveBeenCalledWith(request, mockEnv);
      expect(response).toBe(mockResponse);
    });

    it('should handle POST /admin/targets', async () => {
      const { handlePostTargets } = await import('./utils');
      const mockResponse = new Response(JSON.stringify({ success: true }));
      vi.mocked(handlePostTargets).mockResolvedValue(mockResponse);

      const request = new Request('https://worker.example.com/admin/targets', {
        method: 'POST',
        body: JSON.stringify([{ url: 'https://example.com', selector: '.test' }])
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(handlePostTargets).toHaveBeenCalledWith(request, mockEnv);
      expect(response).toBe(mockResponse);
    });

    it('should handle POST /admin/run', async () => {
      const { handleManualRun } = await import('./utils');
      const mockResponse = new Response(JSON.stringify({ executed: true }));
      vi.mocked(handleManualRun).mockResolvedValue(mockResponse);

      const request = new Request('https://worker.example.com/admin/run', {
        method: 'POST'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(handleManualRun).toHaveBeenCalledWith(request, mockEnv);
      expect(response).toBe(mockResponse);
    });

    it('should handle GET /healthz', async () => {
      const request = new Request('https://worker.example.com/healthz', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBe('1.0.0');
    });

    it('should return 405 for unsupported methods on /admin/targets', async () => {
      const request = new Request('https://worker.example.com/admin/targets', {
        method: 'DELETE'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Method not allowed');
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should return 405 for unsupported methods on /admin/run', async () => {
      const request = new Request('https://worker.example.com/admin/run', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Method not allowed');
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://worker.example.com/unknown', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Not found');
      expect(body.code).toBe('NOT_FOUND');
      expect(body.path).toBe('/unknown');
    });
  });

  describe('Scheduled Event Handling', () => {
    it('should execute batch processing on scheduled event', async () => {
      const { processBatchTargets } = await import('./target-processing');
      const mockResult = {
        totalTargets: 2,
        successfulTargets: 2,
        failedTargets: 0,
        targetsWithChanges: 1,
        notificationsSent: 1,
        totalDuration: 1500,
        summary: '2 targets processed, 2 successful, 1 with changes, 1 notification sent',
        results: [
          { success: true, target: { url: 'https://example1.com', selector: '.test' } },
          { success: true, target: { url: 'https://example2.com', selector: '.test' } }
        ]
      };
      vi.mocked(processBatchTargets).mockResolvedValue(mockResult);

      const mockEvent = {
        scheduledTime: Date.now(),
        cron: '0 */3 * * *'
      } as ScheduledEvent;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await worker.scheduled(mockEvent, mockEnv, mockCtx);

      expect(processBatchTargets).toHaveBeenCalledWith(mockEnv);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Scheduled event triggered at:',
        expect.any(String)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Scheduled execution completed:',
        expect.objectContaining({
          totalTargets: 2,
          successfulTargets: 2,
          failedTargets: 0,
          targetsWithChanges: 1,
          notificationsSent: 1
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle batch processing failures gracefully', async () => {
      const { processBatchTargets } = await import('./target-processing');
      const mockResult = {
        totalTargets: 2,
        successfulTargets: 1,
        failedTargets: 1,
        targetsWithChanges: 0,
        notificationsSent: 0,
        totalDuration: 2000,
        summary: '2 targets processed, 1 successful, 1 failed',
        results: [
          { success: true, target: { url: 'https://example1.com', selector: '.test' } },
          { 
            success: false, 
            target: { url: 'https://example2.com', selector: '.test', name: 'Failed Target' },
            error: 'Network timeout'
          }
        ]
      };
      vi.mocked(processBatchTargets).mockResolvedValue(mockResult);

      const mockEvent: ScheduledEvent = {
        scheduledTime: Date.now(),
        cron: '0 */3 * * *'
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await worker.scheduled(mockEvent, mockEnv, mockCtx);

      expect(processBatchTargets).toHaveBeenCalledWith(mockEnv);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed targets during scheduled execution:',
        [{ target: 'Failed Target', error: 'Network timeout' }]
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should handle complete scheduled execution failure', async () => {
      const { processBatchTargets } = await import('./target-processing');
      const error = new Error('KV storage unavailable');
      vi.mocked(processBatchTargets).mockRejectedValue(error);

      const mockEvent = {
        scheduledTime: Date.now(),
        cron: '0 */3 * * *'
      } as ScheduledEvent;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw - worker should continue running
      await expect(worker.scheduled(mockEvent, mockEnv, mockCtx)).resolves.toBeUndefined();

      expect(processBatchTargets).toHaveBeenCalledWith(mockEnv);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to execute scheduled monitoring:',
        error
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Scheduled execution failed after:',
        expect.stringMatching(/\d+ms/)
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Global Error Handling', () => {
    it('should handle handler function errors gracefully', async () => {
      const { handleGetTargets } = await import('./utils');
      const error = new Error('Internal server error');
      vi.mocked(handleGetTargets).mockRejectedValue(error);

      const request = new Request('https://worker.example.com/admin/targets', {
        method: 'GET'
      });

      // Should propagate the error from the handler
      await expect(worker.fetch(request, mockEnv, mockCtx)).rejects.toThrow('Internal server error');
    });

    it('should log execution timing for successful operations', async () => {
      const { processBatchTargets } = await import('./target-processing');
      const mockResult = {
        totalTargets: 1,
        successfulTargets: 1,
        failedTargets: 0,
        targetsWithChanges: 0,
        notificationsSent: 0,
        totalDuration: 500,
        summary: '1 target processed, 1 successful',
        results: [
          { success: true, target: { url: 'https://example.com', selector: '.test' } }
        ]
      };
      vi.mocked(processBatchTargets).mockResolvedValue(mockResult);

      const mockEvent = {
        scheduledTime: Date.now(),
        cron: '0 */3 * * *'
      } as ScheduledEvent;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await worker.scheduled(mockEvent, mockEnv, mockCtx);

      // Verify timing is logged
      const logCalls = consoleSpy.mock.calls;
      const completedCall = logCalls.find((call: any) => 
        call[0] === 'Scheduled execution completed:' && 
        typeof call[1] === 'object' && 
        'duration' in call[1]
      );
      
      expect(completedCall).toBeDefined();
      expect(completedCall![1].duration).toMatch(/\d+ms/);

      consoleSpy.mockRestore();
    });
  });
});