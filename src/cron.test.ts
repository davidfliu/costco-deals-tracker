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
      results: [
        { success: true, target: { url: 'https://example1.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example2.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example3.com', selector: '.test' }, duration: 500 }
      ],
      totalDuration: 1500,
      summary: '3 targets processed, 3 successful, 1 with changes, 1 notification sent'
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
      results: [
        { success: true, target: { url: 'https://example1.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example2.com', selector: '.test' }, duration: 500 },
        { success: false, target: { url: 'https://example3.com', selector: '.test', name: 'Failed Target' }, error: 'Network timeout', duration: 1000 }
      ],
      totalDuration: 2000,
      summary: '3 targets processed, 2 successful, 1 failed, 1 with changes, 1 notification sent'
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
      'Failed targets during scheduled execution:',
      [{ target: 'Failed Target', error: 'Network timeout' }]
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
      results: [
        { success: true, target: { url: 'https://example.com', selector: '.test' }, duration: 500 }
      ],
      totalDuration: 500,
      summary: '1 target processed, 1 successful'
    };

    mockProcessBatchTargets.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve(mockResult), 100);
      });
    });

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled execution completed:',
      expect.objectContaining({
        duration: expect.stringMatching(/^\d+ms$/)
      })
    );

    // Verify the logged duration is reasonable (should be at least 100ms due to setTimeout)
    const loggedCall = consoleSpy.mock.calls.find((call: any) => 
      call[0] === 'Scheduled execution completed:'
    );
    const loggedDuration = parseInt(loggedCall[1].duration.replace('ms', ''));
    expect(loggedDuration).toBeGreaterThanOrEqual(100);
  });

  it('should handle zero targets scenario', async () => {
    const mockResult = {
      totalTargets: 0,
      successfulTargets: 0,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      results: [],
      totalDuration: 50,
      summary: 'No enabled targets found in configuration'
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
      results: [
        { success: true, target: { url: 'https://example.com/deals1', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example.com/deals2', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example.com/deals3', selector: '.test' }, duration: 500 },
        { success: false, target: { url: 'https://example.com/deals4', selector: '.test' }, error: 'Failed to fetch target: https://example.com/deals1', duration: 1000 },
        { success: false, target: { url: 'https://example.com/deals5', selector: '.test' }, error: 'Failed to parse content for target: https://example.com/deals2', duration: 500 }
      ],
      totalDuration: 3000,
      summary: '5 targets processed, 3 successful, 2 failed, 2 with changes, 2 notifications sent'
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
      'Failed targets during scheduled execution:',
      [
        { target: 'https://example.com/deals4', error: 'Failed to fetch target: https://example.com/deals1' },
        { target: 'https://example.com/deals5', error: 'Failed to parse content for target: https://example.com/deals2' }
      ]
    );
  });

  it('should log scheduled time correctly', async () => {
    const scheduledTime = new Date('2025-01-08T12:00:00Z').getTime();
    const eventWithSpecificTime = {
      ...mockEvent,
      scheduledTime
    } as ScheduledEvent;

    const mockResult = {
      totalTargets: 1,
      successfulTargets: 1,
      failedTargets: 0,
      targetsWithChanges: 0,
      notificationsSent: 0,
      results: [
        { success: true, target: { url: 'https://example.com', selector: '.test' }, duration: 100 }
      ],
      totalDuration: 100,
      summary: '1 target processed, 1 successful'
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
    // Mock dynamic import failure by making processBatchTargets throw
    mockProcessBatchTargets.mockRejectedValue(new Error('Module not found'));

    await expect(worker.scheduled(mockEvent, mockEnv, mockCtx)).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to execute scheduled monitoring:',
      expect.any(Error)
    );
  });

  it('should handle performance monitoring correctly', async () => {
    const mockResult = {
      totalTargets: 10,
      successfulTargets: 8,
      failedTargets: 2,
      targetsWithChanges: 3,
      notificationsSent: 3,
      results: [
        { success: true, target: { url: 'https://example1.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example2.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example3.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example4.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example5.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example6.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example7.com', selector: '.test' }, duration: 500 },
        { success: true, target: { url: 'https://example8.com', selector: '.test' }, duration: 500 },
        { success: false, target: { url: 'https://example9.com', selector: '.test' }, error: 'Error 1', duration: 500 },
        { success: false, target: { url: 'https://example10.com', selector: '.test' }, error: 'Error 2', duration: 500 }
      ],
      totalDuration: 5000,
      summary: '10 targets processed, 8 successful, 2 failed, 3 with changes, 3 notifications sent'
    };

    mockProcessBatchTargets.mockResolvedValue(mockResult);

    await worker.scheduled(mockEvent, mockEnv, mockCtx);

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
      'Failed targets during scheduled execution:',
      [
        { target: 'https://example9.com', error: 'Error 1' },
        { target: 'https://example10.com', error: 'Error 2' }
      ]
    );
  });
});