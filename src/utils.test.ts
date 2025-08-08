/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import { hashString, generateStateKey, generateHistoryKey } from './utils';

describe('hashString', () => {
  it('should generate consistent hashes for the same input', async () => {
    const input = 'https://www.costcotravel.com/vacation-packages';
    const hash1 = await hashString(input);
    const hash2 = await hashString(input);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('should generate different hashes for different inputs', async () => {
    const input1 = 'https://www.costcotravel.com/vacation-packages';
    const input2 = 'https://www.costcotravel.com/cruise-deals';
    
    const hash1 = await hashString(input1);
    const hash2 = await hashString(input2);
    
    expect(hash1).not.toBe(hash2);
    expect(hash1).toHaveLength(16);
    expect(hash2).toHaveLength(16);
  });

  it('should generate hex strings', async () => {
    const input = 'test-string';
    const hash = await hashString(input);
    
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should handle empty strings', async () => {
    const hash = await hashString('');
    
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should handle special characters and unicode', async () => {
    const input = 'https://example.com/path?param=value&special=café🎉';
    const hash = await hashString(input);
    
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('generateStateKey', () => {
  it('should generate consistent state keys for the same URL', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages';
    const key1 = await generateStateKey(url);
    const key2 = await generateStateKey(url);
    
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^state:[0-9a-f]{16}$/);
  });

  it('should generate different state keys for different URLs', async () => {
    const url1 = 'https://www.costcotravel.com/vacation-packages';
    const url2 = 'https://www.costcotravel.com/cruise-deals';
    
    const key1 = await generateStateKey(url1);
    const key2 = await generateStateKey(url2);
    
    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^state:[0-9a-f]{16}$/);
    expect(key2).toMatch(/^state:[0-9a-f]{16}$/);
  });

  it('should handle URLs with query parameters', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages?destination=hawaii&dates=2024-01';
    const key = await generateStateKey(url);
    
    expect(key).toMatch(/^state:[0-9a-f]{16}$/);
  });
});

describe('generateHistoryKey', () => {
  it('should generate consistent history keys for the same URL and timestamp', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages';
    const timestamp = '2024-01-15T10:30:00.000Z';
    
    const key1 = await generateHistoryKey(url, timestamp);
    const key2 = await generateHistoryKey(url, timestamp);
    
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
  });

  it('should generate different history keys for different URLs', async () => {
    const url1 = 'https://www.costcotravel.com/vacation-packages';
    const url2 = 'https://www.costcotravel.com/cruise-deals';
    const timestamp = '2024-01-15T10:30:00.000Z';
    
    const key1 = await generateHistoryKey(url1, timestamp);
    const key2 = await generateHistoryKey(url2, timestamp);
    
    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
    expect(key2).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
  });

  it('should generate different history keys for different timestamps', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages';
    const timestamp1 = '2024-01-15T10:30:00.000Z';
    const timestamp2 = '2024-01-15T13:30:00.000Z';
    
    const key1 = await generateHistoryKey(url, timestamp1);
    const key2 = await generateHistoryKey(url, timestamp2);
    
    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T10:30:00\.000Z$/);
    expect(key2).toMatch(/^hist:[0-9a-f]{16}:2024-01-15T13:30:00\.000Z$/);
  });

  it('should handle ISO timestamps correctly', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages';
    const timestamp = '2024-12-25T23:59:59.999Z';
    
    const key = await generateHistoryKey(url, timestamp);
    
    expect(key).toBe(`hist:${await hashString(url).then(h => h)}:${timestamp}`);
  });
});

describe('hash collision avoidance', () => {
  it('should generate different hashes for similar URLs', async () => {
    const urls = [
      'https://www.costcotravel.com/vacation-packages',
      'https://www.costcotravel.com/vacation-package',
      'https://www.costcotravel.com/vacation-packages/',
      'https://www.costcotravel.com/vacation-packages?',
      'https://www.costcotravel.com/vacation-packages#'
    ];
    
    const hashes = await Promise.all(urls.map(url => hashString(url)));
    const uniqueHashes = new Set(hashes);
    
    expect(uniqueHashes.size).toBe(urls.length);
  });

  it('should maintain hash stability across multiple calls', async () => {
    const url = 'https://www.costcotravel.com/vacation-packages';
    const iterations = 10;
    
    const hashes = await Promise.all(
      Array(iterations).fill(url).map(u => hashString(u))
    );
    
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });
});