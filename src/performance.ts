/**
 * Performance optimization utilities for the Costco Travel Watcher
 */

import { Env, TargetState, HistoricalSnapshot } from './types';
import { generateStateKey, generateHistoryKey, hashString } from './utils';

/**
 * Batch KV operations to minimize round trips and costs
 */
export class KVBatch {
  private reads: Map<string, Promise<string | null>> = new Map();
  private writes: Array<{ key: string; value: string }> = [];
  private deletes: Set<string> = new Set();

  constructor(private env: Env) {}

  /**
   * Queue a read operation (deduplicates identical keys)
   */
  queueRead(key: string): Promise<string | null> {
    if (!this.reads.has(key)) {
      this.reads.set(key, this.env.DEAL_WATCHER.get(key));
    }
    return this.reads.get(key)!;
  }

  /**
   * Queue a write operation
   */
  queueWrite(key: string, value: string): void {
    this.writes.push({ key, value });
  }

  /**
   * Queue a delete operation
   */
  queueDelete(key: string): void {
    this.deletes.add(key);
  }

  /**
   * Execute all queued operations in parallel
   */
  async execute(): Promise<void> {
    const operations: Promise<any>[] = [];

    // Execute all writes in parallel
    for (const { key, value } of this.writes) {
      operations.push(this.env.DEAL_WATCHER.put(key, value));
    }

    // Execute all deletes in parallel
    for (const key of this.deletes) {
      operations.push(this.env.DEAL_WATCHER.delete(key));
    }

    // Wait for all operations to complete
    await Promise.all(operations);

    // Clear queues
    this.writes.length = 0;
    this.deletes.clear();
  }

  /**
   * Get the number of queued operations
   */
  getQueueSize(): { reads: number; writes: number; deletes: number } {
    return {
      reads: this.reads.size,
      writes: this.writes.length,
      deletes: this.deletes.size
    };
  }
}

/**
 * Optimized target state operations using batching
 */
export class OptimizedStateManager {
  private batch: KVBatch;
  private stateCache: Map<string, TargetState | null> = new Map();

  constructor(env: Env) {
    this.batch = new KVBatch(env);
  }

  /**
   * Read multiple target states in parallel with caching
   */
  async readTargetStates(urls: string[]): Promise<Map<string, TargetState | null>> {
    const results = new Map<string, TargetState | null>();
    const keysToFetch: string[] = [];

    // Check cache first
    for (const url of urls) {
      if (this.stateCache.has(url)) {
        results.set(url, this.stateCache.get(url)!);
      } else {
        keysToFetch.push(url);
      }
    }

    // Batch fetch uncached states
    if (keysToFetch.length > 0) {
      const statePromises = new Map<string, Promise<string | null>>();
      
      for (const url of keysToFetch) {
        const stateKey = await generateStateKey(url);
        statePromises.set(url, this.batch.queueRead(stateKey));
      }

      // Wait for all reads to complete
      for (const [url, promise] of statePromises) {
        try {
          const stateJson = await promise;
          let state: TargetState | null = null;

          if (stateJson) {
            try {
              const parsed = JSON.parse(stateJson);
              if (this.validateTargetState(parsed)) {
                state = parsed;
              }
            } catch (error) {
              console.error(`Failed to parse state for ${url}:`, error);
            }
          }

          // Cache the result
          this.stateCache.set(url, state);
          results.set(url, state);
        } catch (error) {
          console.error(`Failed to read state for ${url}:`, error);
          results.set(url, null);
        }
      }
    }

    return results;
  }

  /**
   * Write multiple target states in batch
   */
  async writeTargetStates(states: Array<{ url: string; state: TargetState }>): Promise<void> {
    for (const { url, state } of states) {
      if (!this.validateTargetState(state)) {
        throw new Error(`Invalid target state for URL: ${url}`);
      }

      const stateKey = await generateStateKey(url);
      const stateJson = JSON.stringify(state);
      
      this.batch.queueWrite(stateKey, stateJson);
      
      // Update cache
      this.stateCache.set(url, state);
    }

    await this.batch.execute();
  }

  /**
   * Optimized historical snapshot storage with batching
   */
  async storeHistoricalSnapshots(
    snapshots: Array<{ url: string; snapshot: HistoricalSnapshot }>
  ): Promise<void> {
    for (const { url, snapshot } of snapshots) {
      if (!this.validateHistoricalSnapshot(snapshot)) {
        throw new Error(`Invalid historical snapshot for URL: ${url}`);
      }

      const historyKey = await generateHistoryKey(url, snapshot.timestamp);
      const snapshotJson = JSON.stringify(snapshot);
      
      this.batch.queueWrite(historyKey, snapshotJson);
    }

    await this.batch.execute();
  }

  /**
   * Clear the state cache
   */
  clearCache(): void {
    this.stateCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.stateCache.size,
      hitRate: 0 // Would need to track hits/misses to calculate
    };
  }

  private validateTargetState(state: any): state is TargetState {
    return (
      state &&
      typeof state === 'object' &&
      typeof state.hash === 'string' &&
      Array.isArray(state.promos) &&
      typeof state.lastSeenISO === 'string'
    );
  }

  private validateHistoricalSnapshot(snapshot: any): snapshot is HistoricalSnapshot {
    return (
      snapshot &&
      typeof snapshot === 'object' &&
      Array.isArray(snapshot.promos) &&
      typeof snapshot.hash === 'string' &&
      typeof snapshot.timestamp === 'string'
    );
  }
}

/**
 * Optimized text processing with caching and early termination
 */
export class OptimizedTextProcessor {
  private hashCache: Map<string, string> = new Map();
  private normalizeCache: Map<string, string> = new Map();

  /**
   * Cached hash generation
   */
  async hashString(input: string): Promise<string> {
    if (this.hashCache.has(input)) {
      return this.hashCache.get(input)!;
    }

    const hash = await hashString(input);
    
    // Limit cache size to prevent memory issues
    if (this.hashCache.size > 1000) {
      const firstKey = this.hashCache.keys().next().value;
      if (firstKey !== undefined) {
        this.hashCache.delete(firstKey);
      }
    }
    
    this.hashCache.set(input, hash);
    return hash;
  }

  /**
   * Cached text normalization
   */
  normalizeText(text: string): string {
    if (!text) return '';
    
    if (this.normalizeCache.has(text)) {
      return this.normalizeCache.get(text)!;
    }

    // Optimized normalization with early returns
    let normalized = text;

    // Quick check for already normalized text
    if (!/\s{2,}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(text)) {
      this.normalizeCache.set(text, text);
      return text;
    }

    // Apply normalization rules
    normalized = normalized
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, '')
      .replace(/\b[A-Z0-9]{8,}\b/g, '')
      .replace(/\bref:\S*/gi, '')
      .replace(/\butm_\S*/gi, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*/g, '\n')
      .trim();

    // Limit cache size
    if (this.normalizeCache.size > 500) {
      const firstKey = this.normalizeCache.keys().next().value;
      if (firstKey !== undefined) {
        this.normalizeCache.delete(firstKey);
      }
    }

    this.normalizeCache.set(text, normalized);
    return normalized;
  }

  /**
   * Clear caches to free memory
   */
  clearCaches(): void {
    this.hashCache.clear();
    this.normalizeCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hashCache: number; normalizeCache: number } {
    return {
      hashCache: this.hashCache.size,
      normalizeCache: this.normalizeCache.size
    };
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private timers: Map<string, number> = new Map();
  private metrics: Map<string, number[]> = new Map();

  /**
   * Start timing an operation
   */
  startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * End timing and record the duration
   */
  endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new Error(`Timer '${name}' was not started`);
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);

    // Record metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(duration);

    return duration;
  }

  /**
   * Get performance statistics
   */
  getStats(): Record<string, { count: number; avg: number; min: number; max: number }> {
    const stats: Record<string, { count: number; avg: number; min: number; max: number }> = {};

    for (const [name, durations] of this.metrics) {
      if (durations.length > 0) {
        stats[name] = {
          count: durations.length,
          avg: durations.reduce((a, b) => a + b, 0) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations)
        };
      }
    }

    return stats;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.timers.clear();
    this.metrics.clear();
  }

  /**
   * Check if execution is approaching CPU time limits
   */
  checkCPULimit(startTime: number, maxDuration: number = 45000): boolean {
    return (Date.now() - startTime) > maxDuration;
  }
}

/**
 * Request optimization utilities
 */
export class RequestOptimizer {
  private static readonly MAX_CONCURRENT_REQUESTS = 10;
  private static readonly REQUEST_TIMEOUT = 15000; // 15 seconds

  /**
   * Execute requests with concurrency limiting and timeout
   */
  static async executeWithConcurrencyLimit<T>(
    requests: Array<() => Promise<T>>,
    maxConcurrent: number = RequestOptimizer.MAX_CONCURRENT_REQUESTS
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      const promise = Promise.race([
        request(),
        new Promise<T>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), RequestOptimizer.REQUEST_TIMEOUT)
        )
      ]).then(result => {
        results[i] = result;
      }).catch(error => {
        console.error(`Request ${i} failed:`, error);
        // Don't fail the entire batch for individual request failures
        results[i] = null as any;
      });

      executing.push(promise);

      // Limit concurrency
      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        // Remove completed promises
        for (let j = executing.length - 1; j >= 0; j--) {
          if (await Promise.race([executing[j], Promise.resolve('pending')]) !== 'pending') {
            executing.splice(j, 1);
          }
        }
      }
    }

    // Wait for all remaining requests
    await Promise.all(executing);
    return results;
  }

  /**
   * Optimize fetch requests with connection reuse and compression
   */
  static async optimizedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const optimizedOptions: RequestInit = {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CostcoTravelWatcher/1.0)',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        ...options.headers
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RequestOptimizer.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...optimizedOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

/**
 * Memory optimization utilities
 */
export class MemoryOptimizer {
  /**
   * Process large arrays in chunks to avoid memory spikes
   */
  static async processInChunks<T, R>(
    items: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 50
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);

      // Allow garbage collection between chunks
      if (i % (chunkSize * 4) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return results;
  }

  /**
   * Truncate large strings to prevent memory issues
   */
  static truncateString(str: string, maxLength: number = 10000): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(0, maxLength) + '... [truncated]';
  }

  /**
   * Clean up large objects by removing unnecessary properties
   */
  static cleanupObject<T extends Record<string, any>>(obj: T, keepKeys: string[]): Partial<T> {
    const cleaned: Partial<T> = {};
    for (const key of keepKeys) {
      if (key in obj) {
        cleaned[key as keyof T] = obj[key];
      }
    }
    return cleaned;
  }
}