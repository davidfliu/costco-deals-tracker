/**
 * Tests for cron trigger handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from './index';
import { Env } from './types';

// Mock the target-processing module
const mockProcessBatchTargets = vi.fn();

vi.mock('./target-processing', () => ({
  processBatchTargets: mockProcessBatchTargets
}));

describe('Cron Trigger Handler', () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let mockEvent: ScheduledEvent;
  let consoleSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    mockEnv = {
      DEAL_WATCHER: {} as KVNamespace,
      ADMIN_TOKEN: 'test-token',
      SLACK_WEBHOOK: 'https://hooks.slack.com/test'
    };

    mockCtx = {} as ExecutionContext;

    mockEvent = {
      scheduledTime: Date.now(),
      cron: '0 */3 * * *'
    } as ScheduledEvent;

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should execute batch processing successfully', async () => {
    const mockResult = {
      totalTargets: 3,
      successfulTargets: 3,
      failedTargets: 0,
      targetsWithChanges: 1,
      notificationsSent: 1,
      errors: [],
      executionTime: 1500
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockProcessBatchTargets).toHaveBeenCalledWith(mockEnv);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled event triggered at:',
      new Date(mockEvent.scheduledTime).toISOString()
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        duration: expect.stringMatching(/^\d+ms$/),
        totalTargets: 3,
        successfulTargets: 3,
        failedTargets: 0,
        targetsWithChanges: 1,
        notificationsSent: 1
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should log errors when batch processing has failures', async () => {
    const mockResult = {
      totalTargets: 3,
      successfulTargets: 2,
      failedTargets: 1,
      targetsWithChanges: 1,
      notificationsSent: 1,
      errors: ['Failed to process target: Network timeout'],
      executionTime: 2000
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockProcessBatchTargets).toHaveBeenCalledWith(mockEnv);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        totalTargets: 3,
        successfulTargets: 2,
        failedTargets: 1,
        targetsWithChanges: 1,
        notificationsSent: 1
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Errors during scheduled execution:',
      ['Failed to process target: Network timeout']
    );
  });

  it('should handle batch processing failures gracefully', async () => {
    const error = new Error('KV namespace not available');
    mockProcessBatchTargets.mockRejectedValue(error);

    // Should not throw
    await expect(worker.scheduled(mockEvent, mockEnv, mockCtx)).resolves.toBeUndefined();

    expect(mockProcessBatchTargets).toHaveBeenCalledWith(mockEnv);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled event triggered at:',
      new Date(mockEvent.scheduledTime).toISOString()
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to execute scheduled monitoring:',
      error
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution failed after:',
      expect.stringMatching(/^\d+ms$/)
    );
  });

  it('should measure execution time accurately', async () => {
    const mockResult = {
      totalTargets: 1,
      successfulTargets: 1,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      errors: [],
      executionTime: 500
    };

    mockProcessBatchTargets.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve(mockResult), 100);
      });
    });

    const startTime = Date.now();
    await worker.scheduled(mockEvent, mockEnv, mockCtx);
    const endTime = Date.now();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        duration: expect.stringMatching(/^\d+ms$/)
      })
    );

    // Verify the logged duration is reasonable (should be at least 100ms due to setTimeout)
    const loggedCall = consoleSpy.mock.calls.find(call => 
      call[0] === 'Scheduled execution completed:'
    );
    const loggedDuration = parseInt(loggedCall[1].duration.replace('ms', ''));
    expect(loggedDuration).toBeGreaterThanOrEqual(100);
    expect(loggedDuration).toBeLessThan(endTime - startTime + 50); // Allow some margin
  });

  it('should handle zero targets scenario', async () => {
    const mockResult = {
      totalTargets: 0,
      successfulTargets: 0,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      errors: [],
      executionTime: 50
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        totalTargets: 0,
        successfulTargets: 0,
        failedTargets: 0,
        targetsWithChanges: 0,
        notificationsSent: 0
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle mixed success and failure results', async () => {
    const mockResult = {
      totalTargets: 5,
      successfulTargets: 3,
      failedTargets: 2,
      targetsWithChanges: 2,
      notificationsSent: 2,
      errors: [
        'Failed to fetch target: https://example.com/deals1',
        'Failed to parse content for target: https://example.com/deals2'
      ],
      executionTime: 3000
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        totalTargets: 5,
        successfulTargets: 3,
        failedTargets: 2,
        targetsWithChanges: 2,
        notificationsSent: 2
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Errors during scheduled execution:',
      [
        'Failed to fetch target: https://example.com/deals1',
        'Failed to parse content for target: https://example.com/deals2'
      ]
    );
  });

  it('should log scheduled time correctly', async () => {
    const scheduledTime = new Date('2025-01-08T12:00:00Z').getTime();
    const eventWithSpecificTime = {
      ...mockEvent,
      scheduledTime
    };

    const mockResult = {
      totalTargets: 1,
      successfulTargets: 1,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      errors: [],
      executionTime: 100
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(eventWithSpecificTime, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled event triggered at:',
      '2025-01-08T12:00:00.000Z'
    );
  });

  it('should not throw errors even when processing fails', async () => {
    mockProcessBatchTargets.mockRejectedValue(new Error('Critical failure'));

    // This should not throw
    await expect(worker.scheduled(mockEvent, mockEnv, mockCtx)).resolves.toBeUndefined();
  });

  it('should handle import failures gracefully', async () => {
    // Mock dynamic import failure
    const originalImport = global.import;
    // @ts-ignore
    global.import = vi.fn().mockRejectedValue(new Error('Module not found'));

    await expect(worker.scheduled(mockEvent, mockEnv, mockCtx)).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to execute scheduled monitoring:',
      expect.any(Error)
    );

    // Restore original import
    // @ts-ignore
    global.import = originalImport;
  });

  it('should handle performance monitoring correctly', async () => {
    const mockResult = {
      totalTargets: 10,
      successfulTargets: 8,
      failedTargets: 2,
      targetsWithChanges: 3,
      notificationsSent: 3,
      errors: ['Error 1', 'Error 2'],
      executionTime: 5000
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    const startTime = Date.now();
    await worker.scheduled(mockEvent, mockEnv, mockCtx);
    const endTime = Date.now();

    // Verify performance logging
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        duration: expect.stringMatching(/^\d+ms$/),
        totalTargets: 10,
        successfulTargets: 8,
        failedTargets: 2,
        targetsWithChanges: 3,
        notificationsSent: 3
      })
    );

    // Verify error logging
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Errors during scheduled execution:',
      ['Error 1', 'Error 2']
    );
  });
});