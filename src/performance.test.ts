/**
 * Performance tests for optimization utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  KVBatch, 
  OptimizedStateManager, 
  OptimizedTextProcessor, 
  PerformanceMonitor,
  RequestOptimizer,
  MemoryOptimizer
} from './performance';
import { Env, TargetState, HistoricalSnapshot } from './types';

describe('Performance Optimizations', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      DEAL_WATCHER: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      } as any,
      ADMIN_TOKEN: 'test-token',
      SLACK_WEBHOOK: 'https://hooks.slack.com/test'
    };
  });

  describe('KVBatch', () => {
    it('should batch multiple read operations', async () => {
      const batch = new KVBatch(mockEnv);
      vi.mocked(mockEnv.DEAL_WATCHER.get).mockResolvedValue('test-value');

      // Queue multiple reads for the same key
      const promise1 = batch.queueRead('test-key');
      const promise2 = batch.queueRead('test-key');
      const promise3 = batch.queueRead('different-key');

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      expect(result1).toBe('test-value');
      expect(result2).toBe('test-value');
      expect(result3).toBe('test-value');

      // Should only call KV.get twice (once per unique key)
      expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledTimes(2);
      expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledWith('test-key');
      expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledWith('different-key');
    });

    it('should batch write and delete operations', async () => {
      const batch = new KVBatch(mockEnv);
      vi.mocked(mockEnv.DEAL_WATCHER.put).mockResolvedValue();
      vi.mocked(mockEnv.DEAL_WATCHER.delete).mockResolvedValue();

      batch.queueWrite('key1', 'value1');
      batch.queueWrite('key2', 'value2');
      batch.queueDelete('key3');

      await batch.execute();

      expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledTimes(2);
      expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith('key1', 'value1');
      expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith('key2', 'value2');
      expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('key3');
    });

    it('should report queue sizes correctly', () => {
      const batch = new KVBatch(mockEnv);
      
      batch.queueRead('read-key');
      batch.queueWrite('write-key', 'value');
      batch.queueDelete('delete-key');

      const sizes = batch.getQueueSize();
      expect(sizes.reads).toBe(1);
      expect(sizes.writes).toBe(1);
      expect(sizes.deletes).toBe(1);
    });
  });

  describe('OptimizedStateManager', () => {
    it('should cache target states to avoid repeated KV reads', async () => {
      const manager = new OptimizedStateManager(mockEnv);
      const mockState: TargetState = {
        hash: 'test-hash',
        promos: [],
        lastSeenISO: '2025-01-01T00:00:00Z'
      };

      vi.mocked(mockEnv.DEAL_WATCHER.get).mockResolvedValue(JSON.stringify(mockState));

      // First read should hit KV
      const result1 = await manager.readTargetStates(['https://example.com']);
      expect(result1.get('https://example.com')).toEqual(mockState);

      // Second read should use cache
      const result2 = await manager.readTargetStates(['https://example.com']);
      expect(result2.get('https://example.com')).toEqual(mockState);

      // Should only call KV once due to caching
      expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledTimes(1);
    });

    it('should batch write multiple target states', async () => {
      const manager = new OptimizedStateManager(mockEnv);
      vi.mocked(mockEnv.DEAL_WATCHER.put).mockResolvedValue();

      const states = [
        {
          url: 'https://example1.com',
          state: { hash: 'hash1', promos: [], lastSeenISO: '2025-01-01T00:00:00Z' }
        },
        {
          url: 'https://example2.com',
          state: { hash: 'hash2', promos: [], lastSeenISO: '2025-01-01T00:00:00Z' }
        }
      ];

      await manager.writeTargetStates(states);

      // Should batch the writes
      expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledTimes(2);
    });

    it('should provide cache statistics', () => {
      const manager = new OptimizedStateManager(mockEnv);
      const stats = manager.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('OptimizedTextProcessor', () => {
    it('should cache hash calculations', async () => {
      const processor = new OptimizedTextProcessor();
      const input = 'test string for hashing';

      // Mock the underlying hash function
      const hashStringSpy = vi.spyOn(await import('./utils'), 'hashString');
      hashStringSpy.mockResolvedValue('mocked-hash');

      // First call should compute hash
      const hash1 = await processor.hashString(input);
      expect(hash1).toBe('mocked-hash');

      // Second call should use cache
      const hash2 = await processor.hashString(input);
      expect(hash2).toBe('mocked-hash');

      // Should only call the underlying function once
      expect(hashStringSpy).toHaveBeenCalledTimes(1);

      hashStringSpy.mockRestore();
    });

    it('should cache text normalization', () => {
      const processor = new OptimizedTextProcessor();
      const input = 'Test   text   with   extra   spaces';

      // First call should normalize
      const normalized1 = processor.normalizeText(input);
      
      // Second call should use cache
      const normalized2 = processor.normalizeText(input);
      
      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe('Test text with extra spaces');
    });

    it('should limit cache size to prevent memory issues', async () => {
      const processor = new OptimizedTextProcessor();

      // Fill hash cache beyond limit
      for (let i = 0; i < 1100; i++) {
        await processor.hashString(`test-string-${i}`);
      }

      const stats = processor.getCacheStats();
      expect(stats.hashCache).toBeLessThanOrEqual(1001); // Allow for off-by-one due to timing
    });

    it('should provide cache statistics', () => {
      const processor = new OptimizedTextProcessor();
      const stats = processor.getCacheStats();
      
      expect(stats).toHaveProperty('hashCache');
      expect(stats).toHaveProperty('normalizeCache');
      expect(typeof stats.hashCache).toBe('number');
      expect(typeof stats.normalizeCache).toBe('number');
    });
  });

  describe('PerformanceMonitor', () => {
    it('should track operation timing', async () => {
      const monitor = new PerformanceMonitor();
      
      monitor.startTimer('test-operation');
      await new Promise(resolve => setTimeout(resolve, 10));
      const duration = monitor.endTimer('test-operation');

      expect(duration).toBeGreaterThan(5);
      expect(duration).toBeLessThan(100);
    });

    it('should provide performance statistics', async () => {
      const monitor = new PerformanceMonitor();
      
      // Record multiple operations
      for (let i = 0; i < 3; i++) {
        monitor.startTimer('test-op');
        await new Promise(resolve => setTimeout(resolve, 5));
        monitor.endTimer('test-op');
      }

      const stats = monitor.getStats();
      expect(stats['test-op']).toBeDefined();
      expect(stats['test-op'].count).toBe(3);
      expect(stats['test-op'].avg).toBeGreaterThan(0);
      expect(stats['test-op'].min).toBeGreaterThan(0);
      expect(stats['test-op'].max).toBeGreaterThan(0);
    });

    it('should detect CPU time limit approach', () => {
      const monitor = new PerformanceMonitor();
      const startTime = Date.now() - 46000; // 46 seconds ago
      
      const approaching = monitor.checkCPULimit(startTime, 45000);
      expect(approaching).toBe(true);
    });

    it('should throw error for unstarted timer', () => {
      const monitor = new PerformanceMonitor();
      
      expect(() => monitor.endTimer('nonexistent')).toThrow("Timer 'nonexistent' was not started");
    });
  });

  describe('RequestOptimizer', () => {
    it('should limit concurrent requests', async () => {
      const requests = Array.from({ length: 20 }, (_, i) => 
        () => Promise.resolve(`result-${i}`)
      );

      const results = await RequestOptimizer.executeWithConcurrencyLimit(requests, 5);
      
      expect(results).toHaveLength(20);
      expect(results[0]).toBe('result-0');
      expect(results[19]).toBe('result-19');
    });

    it('should handle request timeouts', async () => {
      const slowRequest = () => new Promise(resolve => setTimeout(() => resolve('slow'), 20000));
      const fastRequest = () => Promise.resolve('fast');

      const results = await RequestOptimizer.executeWithConcurrencyLimit([slowRequest, fastRequest]);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toBeNull(); // Timed out
      expect(results[1]).toBe('fast');
    }, 20000); // Increase timeout for this test

    it('should optimize fetch requests with proper headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('test', { status: 200 }));
      global.fetch = mockFetch;

      await RequestOptimizer.optimizedFetch('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'Mozilla/5.0 (compatible; CostcoTravelWatcher/1.0)',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache'
        })
      }));
    });

    it('should handle fetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));
      global.fetch = mockFetch;

      await expect(RequestOptimizer.optimizedFetch('https://example.com'))
        .rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('MemoryOptimizer', () => {
    it('should process large arrays in chunks', async () => {
      const items = Array.from({ length: 150 }, (_, i) => i);
      const processor = vi.fn().mockImplementation((chunk: number[]) => 
        Promise.resolve(chunk.map(n => n * 2))
      );

      const results = await MemoryOptimizer.processInChunks(items, processor, 50);

      expect(results).toHaveLength(150);
      expect(results[0]).toBe(0);
      expect(results[149]).toBe(298);
      expect(processor).toHaveBeenCalledTimes(3); // 150 items / 50 chunk size
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(15000);
      const truncated = MemoryOptimizer.truncateString(longString, 10000);

      expect(truncated.length).toBeLessThan(longString.length);
      expect(truncated).toContain('... [truncated]');
    });

    it('should clean up objects by keeping only specified keys', () => {
      const obj = {
        keep1: 'value1',
        keep2: 'value2',
        remove1: 'value3',
        remove2: 'value4'
      };

      const cleaned = MemoryOptimizer.cleanupObject(obj, ['keep1', 'keep2']);

      expect(cleaned).toEqual({
        keep1: 'value1',
        keep2: 'value2'
      });
      expect(cleaned).not.toHaveProperty('remove1');
      expect(cleaned).not.toHaveProperty('remove2');
    });
  });

  describe('Performance Integration', () => {
    it('should demonstrate CPU time optimization', async () => {
      const monitor = new PerformanceMonitor();
      const processor = new OptimizedTextProcessor();
      
      monitor.startTimer('text-processing');
      
      // Process multiple texts with caching
      const texts = Array.from({ length: 100 }, (_, i) => `Test text ${i % 10}`);
      
      for (const text of texts) {
        processor.normalizeText(text);
      }
      
      const duration = monitor.endTimer('text-processing');
      
      // Should complete quickly due to caching
      expect(duration).toBeLessThan(100);
    });

    it('should demonstrate KV operation optimization', async () => {
      const manager = new OptimizedStateManager(mockEnv);
      vi.mocked(mockEnv.DEAL_WATCHER.get).mockResolvedValue(JSON.stringify({
        hash: 'test',
        promos: [],
        lastSeenISO: '2025-01-01T00:00:00Z'
      }));
      vi.mocked(mockEnv.DEAL_WATCHER.put).mockResolvedValue();

      const monitor = new PerformanceMonitor();
      monitor.startTimer('kv-operations');

      // Read multiple states (should use caching)
      const urls = ['https://example1.com', 'https://example2.com', 'https://example3.com'];
      await manager.readTargetStates(urls);
      await manager.readTargetStates(urls); // Second read should be cached

      // Batch write states
      await manager.writeTargetStates([
        { url: urls[0], state: { hash: 'new1', promos: [], lastSeenISO: '2025-01-01T00:00:00Z' } },
        { url: urls[1], state: { hash: 'new2', promos: [], lastSeenISO: '2025-01-01T00:00:00Z' } }
      ]);

      const duration = monitor.endTimer('kv-operations');

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000);
      
      // Should minimize KV calls due to caching and batching
      expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledTimes(3); // Once per unique URL
      expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledTimes(2); // Batched writes
    });

    it('should stay within CPU time limits for typical workload', async () => {
      const startTime = Date.now();
      const monitor = new PerformanceMonitor();
      const processor = new OptimizedTextProcessor();
      const manager = new OptimizedStateManager(mockEnv);

      // Mock KV responses
      vi.mocked(mockEnv.DEAL_WATCHER.get).mockResolvedValue(JSON.stringify({
        hash: 'test',
        promos: [],
        lastSeenISO: '2025-01-01T00:00:00Z'
      }));
      vi.mocked(mockEnv.DEAL_WATCHER.put).mockResolvedValue();

      // Simulate typical workload
      const urls = Array.from({ length: 10 }, (_, i) => `https://example${i}.com`);
      
      monitor.startTimer('full-workload');

      // Read states
      await manager.readTargetStates(urls);

      // Process text content
      for (let i = 0; i < 100; i++) {
        await processor.hashString(`promotion content ${i}`);
        processor.normalizeText(`Some promotional text with dates 01/01/2025 and times 12:00 PM ${i}`);
      }

      // Write states
      await manager.writeTargetStates(
        urls.map(url => ({
          url,
          state: { hash: 'updated', promos: [], lastSeenISO: '2025-01-01T00:00:00Z' }
        }))
      );

      const duration = monitor.endTimer('full-workload');

      // Should complete well within 50ms target for typical execution
      expect(duration).toBeLessThan(50);
      
      // Should not approach CPU limit
      expect(monitor.checkCPULimit(startTime, 50000)).toBe(false);
    });
  });
});