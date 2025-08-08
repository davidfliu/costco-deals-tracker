/**
 * Unit tests for KV storage operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  validateTarget, 
  validateTargets, 
  readTargets, 
  writeTargets, 
  upsertTarget, 
  removeTarget,
  validateTargetState,
  readTargetState,
  writeTargetState,
  shouldUpdateState,
  updateTargetStateIfChanged,
  deleteTargetState,
  validateHistoricalSnapshot,
  storeHistoricalSnapshot,
  getHistoricalSnapshots,
  pruneHistoricalSnapshots,
  storeAndPruneSnapshot,
  deleteAllHistoricalSnapshots
} from './kv-storage';
import { Target, TargetState, HistoricalSnapshot, Env } from './types';

// Mock KV namespace
const createMockKV = () => {
  const storage = new Map<string, string>();
  
  return {
    get: vi.fn(async (key: string) => storage.get(key) || null),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
    storage // Expose for test inspection
  };
};

// Mock environment
const createMockEnv = () => {
  const mockKV = createMockKV();
  return {
    DEAL_WATCHER: mockKV,
    ADMIN_TOKEN: 'test-token',
    SLACK_WEBHOOK: 'https://hooks.slack.com/test'
  } as Env & { DEAL_WATCHER: ReturnType<typeof createMockKV> };
};

describe('validateTarget', () => {
  it('should validate a complete target object', () => {
    const target: Target = {
      url: 'https://www.costcotravel.com/vacation-packages',
      selector: '.promotion-container',
      name: 'Vacation Packages',
      notes: 'Main vacation deals page',
      enabled: true
    };

    expect(validateTarget(target)).toBe(true);
  });

  it('should validate a minimal target object', () => {
    const target = {
      url: 'https://www.costcotravel.com/cruises',
      selector: '.cruise-deals'
    };

    expect(validateTarget(target)).toBe(true);
  });

  it('should reject target with missing url', () => {
    const target = {
      selector: '.promotion-container'
    };

    expect(validateTarget(target)).toBe(false);
  });

  it('should reject target with empty url', () => {
    const target = {
      url: '',
      selector: '.promotion-container'
    };

    expect(validateTarget(target)).toBe(false);
  });

  it('should reject target with missing selector', () => {
    const target = {
      url: 'https://www.costcotravel.com/vacation-packages'
    };

    expect(validateTarget(target)).toBe(false);
  });

  it('should reject target with invalid url', () => {
    const target = {
      url: 'not-a-valid-url',
      selector: '.promotion-container'
    };

    expect(validateTarget(target)).toBe(false);
  });

  it('should reject target with invalid types', () => {
    const target = {
      url: 'https://www.costcotravel.com/vacation-packages',
      selector: '.promotion-container',
      name: 123, // Should be string
      enabled: 'true' // Should be boolean
    };

    expect(validateTarget(target)).toBe(false);
  });

  it('should reject null or undefined', () => {
    expect(validateTarget(null)).toBe(false);
    expect(validateTarget(undefined)).toBe(false);
  });

  it('should reject non-object values', () => {
    expect(validateTarget('string')).toBe(false);
    expect(validateTarget(123)).toBe(false);
    expect(validateTarget([])).toBe(false);
  });
});

describe('validateTargets', () => {
  it('should validate array of valid targets', () => {
    const targets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container',
        name: 'Vacation Packages'
      },
      {
        url: 'https://www.costcotravel.com/cruises',
        selector: '.cruise-deals',
        enabled: false
      }
    ];

    expect(validateTargets(targets)).toBe(true);
  });

  it('should validate empty array', () => {
    expect(validateTargets([])).toBe(true);
  });

  it('should reject array with invalid target', () => {
    const targets = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container'
      },
      {
        url: 'invalid-url', // Invalid URL
        selector: '.cruise-deals'
      }
    ];

    expect(validateTargets(targets)).toBe(false);
  });

  it('should reject non-array values', () => {
    expect(validateTargets('not-array')).toBe(false);
    expect(validateTargets({})).toBe(false);
    expect(validateTargets(null)).toBe(false);
  });
});

describe('readTargets', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return empty array when no targets exist', async () => {
    const targets = await readTargets(mockEnv);
    expect(targets).toEqual([]);
    expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledWith('targets');
  });

  it('should return parsed targets when valid data exists', async () => {
    const expectedTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container',
        name: 'Vacation Packages'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(expectedTargets));

    const targets = await readTargets(mockEnv);
    expect(targets).toEqual(expectedTargets);
  });

  it('should return empty array when invalid JSON exists', async () => {
    mockEnv.DEAL_WATCHER.storage.set('targets', 'invalid-json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const targets = await readTargets(mockEnv);
    
    expect(targets).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to read targets from KV storage:', 
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });

  it('should return empty array when invalid targets exist', async () => {
    const invalidTargets = [
      {
        url: 'invalid-url', // Invalid URL
        selector: '.promotion-container'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(invalidTargets));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const targets = await readTargets(mockEnv);
    
    expect(targets).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith('Invalid targets configuration found in KV storage');
    
    consoleSpy.mockRestore();
  });

  it('should handle KV get errors gracefully', async () => {
    mockEnv.DEAL_WATCHER.get.mockRejectedValue(new Error('KV error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const targets = await readTargets(mockEnv);
    
    expect(targets).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to read targets from KV storage:', 
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });
});

describe('writeTargets', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should write valid targets to KV storage', async () => {
    const targets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container',
        name: 'Vacation Packages'
      }
    ];

    await writeTargets(mockEnv, targets);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify(targets, null, 2)
    );
  });

  it('should write empty array to KV storage', async () => {
    await writeTargets(mockEnv, []);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([], null, 2)
    );
  });

  it('should throw error for invalid targets', async () => {
    const invalidTargets = [
      {
        url: 'invalid-url', // Invalid URL
        selector: '.promotion-container'
      }
    ] as Target[];

    await expect(writeTargets(mockEnv, invalidTargets)).rejects.toThrow(
      'Invalid targets configuration provided'
    );

    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });

  it('should throw error when KV put fails', async () => {
    const targets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container'
      }
    ];

    mockEnv.DEAL_WATCHER.put.mockRejectedValue(new Error('KV put failed'));

    await expect(writeTargets(mockEnv, targets)).rejects.toThrow(
      'Failed to write targets to KV storage: Error: KV put failed'
    );
  });
});

describe('upsertTarget', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should add new target when none exist', async () => {
    const target: Target = {
      url: 'https://www.costcotravel.com/vacation-packages',
      selector: '.promotion-container',
      name: 'Vacation Packages'
    };

    await upsertTarget(mockEnv, target);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([target], null, 2)
    );
  });

  it('should add new target to existing targets', async () => {
    const existingTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/cruises',
        selector: '.cruise-deals'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(existingTargets));

    const newTarget: Target = {
      url: 'https://www.costcotravel.com/vacation-packages',
      selector: '.promotion-container',
      name: 'Vacation Packages'
    };

    await upsertTarget(mockEnv, newTarget);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([...existingTargets, newTarget], null, 2)
    );
  });

  it('should update existing target with same URL', async () => {
    const existingTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.old-selector',
        name: 'Old Name'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(existingTargets));

    const updatedTarget: Target = {
      url: 'https://www.costcotravel.com/vacation-packages',
      selector: '.new-selector',
      name: 'New Name',
      enabled: false
    };

    await upsertTarget(mockEnv, updatedTarget);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([updatedTarget], null, 2)
    );
  });

  it('should throw error for invalid target', async () => {
    const invalidTarget = {
      url: 'invalid-url',
      selector: '.promotion-container'
    } as Target;

    await expect(upsertTarget(mockEnv, invalidTarget)).rejects.toThrow(
      'Invalid target configuration provided'
    );

    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });
});

describe('removeTarget', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return false when no targets exist', async () => {
    const result = await removeTarget(mockEnv, 'https://www.costcotravel.com/vacation-packages');
    expect(result).toBe(false);
    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });

  it('should return false when target URL not found', async () => {
    const existingTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/cruises',
        selector: '.cruise-deals'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(existingTargets));

    const result = await removeTarget(mockEnv, 'https://www.costcotravel.com/vacation-packages');
    expect(result).toBe(false);
    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });

  it('should remove target and return true when found', async () => {
    const existingTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/cruises',
        selector: '.cruise-deals'
      },
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(existingTargets));

    const result = await removeTarget(mockEnv, 'https://www.costcotravel.com/vacation-packages');
    expect(result).toBe(true);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([existingTargets[0]], null, 2)
    );
  });

  it('should remove all matching targets', async () => {
    const existingTargets: Target[] = [
      {
        url: 'https://www.costcotravel.com/vacation-packages',
        selector: '.promotion-container'
      }
    ];

    mockEnv.DEAL_WATCHER.storage.set('targets', JSON.stringify(existingTargets));

    const result = await removeTarget(mockEnv, 'https://www.costcotravel.com/vacation-packages');
    expect(result).toBe(true);

    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      'targets',
      JSON.stringify([], null, 2)
    );
  });
});

describe('validateTargetState', () => {
  it('should validate a complete target state', () => {
    const state: TargetState = {
      hash: 'abc123def456',
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          perk: 'Free breakfast',
          dates: 'Valid through Dec 2025',
          price: '$299'
        }
      ],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(true);
  });

  it('should validate state with empty promos array', () => {
    const state = {
      hash: 'abc123def456',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(true);
  });

  it('should reject state with missing hash', () => {
    const state = {
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with empty hash', () => {
    const state = {
      hash: '',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with missing promos', () => {
    const state = {
      hash: 'abc123def456',
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with non-array promos', () => {
    const state = {
      hash: 'abc123def456',
      promos: 'not-an-array',
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with missing lastSeenISO', () => {
    const state = {
      hash: 'abc123def456',
      promos: []
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with invalid ISO timestamp', () => {
    const state = {
      hash: 'abc123def456',
      promos: [],
      lastSeenISO: 'not-a-date'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject state with invalid promotion', () => {
    const state = {
      hash: 'abc123def456',
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          // Missing required fields
        }
      ],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(validateTargetState(state)).toBe(false);
  });

  it('should reject null or undefined', () => {
    expect(validateTargetState(null)).toBe(false);
    expect(validateTargetState(undefined)).toBe(false);
  });
});

describe('readTargetState', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return null when no state exists', async () => {
    const state = await readTargetState(mockEnv, 'https://www.costcotravel.com/test');
    expect(state).toBeNull();
  });

  it('should return parsed state when valid data exists', async () => {
    const expectedState: TargetState = {
      hash: 'abc123def456',
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          perk: 'Free breakfast',
          dates: 'Valid through Dec 2025',
          price: '$299'
        }
      ],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    // Calculate the actual state key that would be generated
    const testUrl = 'https://www.costcotravel.com/test';
    const { generateStateKey } = await import('./utils');
    const stateKey = await generateStateKey(testUrl);
    
    mockEnv.DEAL_WATCHER.storage.set(stateKey, JSON.stringify(expectedState));

    const state = await readTargetState(mockEnv, testUrl);
    expect(state).toEqual(expectedState);
  });

  it('should return null when invalid JSON exists', async () => {
    const testUrl = 'https://www.costcotravel.com/test';
    const { generateStateKey } = await import('./utils');
    const stateKey = await generateStateKey(testUrl);
    
    mockEnv.DEAL_WATCHER.storage.set(stateKey, 'invalid-json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = await readTargetState(mockEnv, testUrl);
    
    expect(state).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      `Failed to read target state for URL ${testUrl}:`, 
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });

  it('should return null when invalid state exists', async () => {
    const invalidState = {
      hash: 'abc123def456',
      // Missing promos and lastSeenISO
    };

    const testUrl = 'https://www.costcotravel.com/test';
    const { generateStateKey } = await import('./utils');
    const stateKey = await generateStateKey(testUrl);
    
    mockEnv.DEAL_WATCHER.storage.set(stateKey, JSON.stringify(invalidState));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = await readTargetState(mockEnv, testUrl);
    
    expect(state).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(`Invalid target state found for URL: ${testUrl}`);
    
    consoleSpy.mockRestore();
  });
});

describe('writeTargetState', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should write valid state to KV storage', async () => {
    const state: TargetState = {
      hash: 'abc123def456',
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          perk: 'Free breakfast',
          dates: 'Valid through Dec 2025',
          price: '$299'
        }
      ],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    await writeTargetState(mockEnv, 'https://www.costcotravel.com/test', state);

    // Verify that put was called (the exact key will be generated by generateStateKey)
    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      expect.stringMatching(/^state:/),
      JSON.stringify(state, null, 2)
    );
  });

  it('should throw error for invalid state', async () => {
    const invalidState = {
      hash: 'abc123def456',
      // Missing required fields
    } as TargetState;

    await expect(writeTargetState(mockEnv, 'https://www.costcotravel.com/test', invalidState))
      .rejects.toThrow('Invalid target state provided');

    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });

  it('should throw error when KV put fails', async () => {
    const state: TargetState = {
      hash: 'abc123def456',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    mockEnv.DEAL_WATCHER.put.mockRejectedValue(new Error('KV put failed'));

    await expect(writeTargetState(mockEnv, 'https://www.costcotravel.com/test', state))
      .rejects.toThrow('Failed to write target state for URL https://www.costcotravel.com/test: Error: KV put failed');
  });
});

describe('shouldUpdateState', () => {
  it('should return true when no previous state exists', () => {
    const currentState: TargetState = {
      hash: 'abc123def456',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    expect(shouldUpdateState(currentState, null)).toBe(true);
  });

  it('should return true when hash is different', () => {
    const currentState: TargetState = {
      hash: 'new-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    const previousState: TargetState = {
      hash: 'old-hash-456',
      promos: [],
      lastSeenISO: '2025-01-08T14:30:00.000Z'
    };

    expect(shouldUpdateState(currentState, previousState)).toBe(true);
  });

  it('should return false when hash is the same', () => {
    const currentState: TargetState = {
      hash: 'same-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    const previousState: TargetState = {
      hash: 'same-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T14:30:00.000Z'
    };

    expect(shouldUpdateState(currentState, previousState)).toBe(false);
  });
});

describe('updateTargetStateIfChanged', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should update state when no previous state exists', async () => {
    const currentState: TargetState = {
      hash: 'abc123def456',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    const result = await updateTargetStateIfChanged(mockEnv, 'https://www.costcotravel.com/test', currentState);

    expect(result).toBe(true);
    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      expect.stringMatching(/^state:/),
      JSON.stringify(currentState, null, 2)
    );
  });

  it('should update state when hash is different', async () => {
    const previousState: TargetState = {
      hash: 'old-hash-456',
      promos: [],
      lastSeenISO: '2025-01-08T14:30:00.000Z'
    };

    const currentState: TargetState = {
      hash: 'new-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    // Set up existing state
    const stateKey = 'state:test123';
    mockEnv.DEAL_WATCHER.storage.set(stateKey, JSON.stringify(previousState));

    const result = await updateTargetStateIfChanged(mockEnv, 'https://www.costcotravel.com/test', currentState);

    expect(result).toBe(true);
    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      expect.stringMatching(/^state:/),
      JSON.stringify(currentState, null, 2)
    );
  });

  it('should not update state when hash is the same', async () => {
    const previousState: TargetState = {
      hash: 'same-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T14:30:00.000Z'
    };

    const currentState: TargetState = {
      hash: 'same-hash-123',
      promos: [],
      lastSeenISO: '2025-01-08T15:30:00.000Z'
    };

    // Set up existing state
    const testUrl = 'https://www.costcotravel.com/test';
    const { generateStateKey } = await import('./utils');
    const stateKey = await generateStateKey(testUrl);
    
    mockEnv.DEAL_WATCHER.storage.set(stateKey, JSON.stringify(previousState));

    const result = await updateTargetStateIfChanged(mockEnv, testUrl, currentState);

    expect(result).toBe(false);
    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });
});

describe('deleteTargetState', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should delete target state from KV storage', async () => {
    await deleteTargetState(mockEnv, 'https://www.costcotravel.com/test');

    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^state:/)
    );
  });

  it('should throw error when KV delete fails', async () => {
    mockEnv.DEAL_WATCHER.delete.mockRejectedValue(new Error('KV delete failed'));

    await expect(deleteTargetState(mockEnv, 'https://www.costcotravel.com/test'))
      .rejects.toThrow('Failed to delete target state for URL https://www.costcotravel.com/test: Error: KV delete failed');
  });
});

describe('validateHistoricalSnapshot', () => {
  it('should validate a complete historical snapshot', () => {
    const snapshot: HistoricalSnapshot = {
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          perk: 'Free breakfast',
          dates: 'Valid through Dec 2025',
          price: '$299'
        }
      ],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(true);
  });

  it('should validate snapshot with empty promos array', () => {
    const snapshot = {
      promos: [],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(true);
  });

  it('should reject snapshot with missing promos', () => {
    const snapshot = {
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with non-array promos', () => {
    const snapshot = {
      promos: 'not-an-array',
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with missing hash', () => {
    const snapshot = {
      promos: [],
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with empty hash', () => {
    const snapshot = {
      promos: [],
      hash: '',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with missing timestamp', () => {
    const snapshot = {
      promos: [],
      hash: 'abc123def456'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with invalid timestamp', () => {
    const snapshot = {
      promos: [],
      hash: 'abc123def456',
      timestamp: 'not-a-date'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject snapshot with invalid promotion', () => {
    const snapshot = {
      promos: [
        {
          id: 'promo1',
          // Missing required fields
        }
      ],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    expect(validateHistoricalSnapshot(snapshot)).toBe(false);
  });

  it('should reject null or undefined', () => {
    expect(validateHistoricalSnapshot(null)).toBe(false);
    expect(validateHistoricalSnapshot(undefined)).toBe(false);
  });
});

describe('storeHistoricalSnapshot', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should store valid snapshot to KV storage', async () => {
    const snapshot: HistoricalSnapshot = {
      promos: [
        {
          id: 'promo1',
          title: 'Great Deal',
          perk: 'Free breakfast',
          dates: 'Valid through Dec 2025',
          price: '$299'
        }
      ],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    await storeHistoricalSnapshot(mockEnv, 'https://www.costcotravel.com/test', snapshot);

    // Verify that put was called with a history key
    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      expect.stringMatching(/^hist:/),
      JSON.stringify(snapshot, null, 2)
    );
  });

  it('should throw error for invalid snapshot', async () => {
    const invalidSnapshot = {
      hash: 'abc123def456',
      // Missing required fields
    } as HistoricalSnapshot;

    await expect(storeHistoricalSnapshot(mockEnv, 'https://www.costcotravel.com/test', invalidSnapshot))
      .rejects.toThrow('Invalid historical snapshot provided');

    expect(mockEnv.DEAL_WATCHER.put).not.toHaveBeenCalled();
  });

  it('should throw error when KV put fails', async () => {
    const snapshot: HistoricalSnapshot = {
      promos: [],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    mockEnv.DEAL_WATCHER.put.mockRejectedValue(new Error('KV put failed'));

    await expect(storeHistoricalSnapshot(mockEnv, 'https://www.costcotravel.com/test', snapshot))
      .rejects.toThrow('Failed to store historical snapshot for URL https://www.costcotravel.com/test: Error: KV put failed');
  });
});

describe('getHistoricalSnapshots', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return empty array when no snapshots exist', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({ keys: [] });

    const snapshots = await getHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');
    expect(snapshots).toEqual([]);
  });

  it('should return snapshots sorted by timestamp (newest first)', async () => {
    const snapshot1: HistoricalSnapshot = {
      promos: [],
      hash: 'hash1',
      timestamp: '2025-01-08T14:00:00.000Z'
    };

    const snapshot2: HistoricalSnapshot = {
      promos: [],
      hash: 'hash2',
      timestamp: '2025-01-08T15:00:00.000Z'
    };

    const snapshot3: HistoricalSnapshot = {
      promos: [],
      hash: 'hash3',
      timestamp: '2025-01-08T16:00:00.000Z'
    };

    // Mock KV list response
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T16:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T15:00:00.000Z' }
      ]
    });

    // Mock KV get responses
    mockEnv.DEAL_WATCHER.get
      .mockResolvedValueOnce(JSON.stringify(snapshot3)) // 16:00 (newest)
      .mockResolvedValueOnce(JSON.stringify(snapshot2)) // 15:00
      .mockResolvedValueOnce(JSON.stringify(snapshot1)); // 14:00 (oldest)

    const snapshots = await getHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].timestamp).toBe('2025-01-08T16:00:00.000Z'); // Newest first
    expect(snapshots[1].timestamp).toBe('2025-01-08T15:00:00.000Z');
    expect(snapshots[2].timestamp).toBe('2025-01-08T14:00:00.000Z'); // Oldest last
  });

  it('should respect the limit parameter', async () => {
    // Mock KV list response with 5 snapshots
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T12:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T13:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' }
      ]
    });

    // Mock KV get responses for the 2 newest
    mockEnv.DEAL_WATCHER.get
      .mockResolvedValueOnce(JSON.stringify({ promos: [], hash: 'hash5', timestamp: '2025-01-08T14:00:00.000Z' }))
      .mockResolvedValueOnce(JSON.stringify({ promos: [], hash: 'hash4', timestamp: '2025-01-08T13:00:00.000Z' }));

    const snapshots = await getHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test', 2);

    expect(snapshots).toHaveLength(2);
    expect(mockEnv.DEAL_WATCHER.get).toHaveBeenCalledTimes(2); // Only called for the 2 newest
  });

  it('should handle invalid snapshots gracefully', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T15:00:00.000Z' }
      ]
    });

    const validSnapshot: HistoricalSnapshot = {
      promos: [],
      hash: 'hash1',
      timestamp: '2025-01-08T15:00:00.000Z'
    };

    // Mock responses: one invalid, one valid
    mockEnv.DEAL_WATCHER.get
      .mockResolvedValueOnce(JSON.stringify(validSnapshot))
      .mockResolvedValueOnce('invalid-json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const snapshots = await getHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual(validSnapshot);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse historical snapshot'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});

describe('pruneHistoricalSnapshots', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return 0 when no snapshots exist', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({ keys: [] });

    const deletedCount = await pruneHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');
    expect(deletedCount).toBe(0);
    expect(mockEnv.DEAL_WATCHER.delete).not.toHaveBeenCalled();
  });

  it('should return 0 when snapshot count is within limit', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T15:00:00.000Z' }
      ]
    });

    const deletedCount = await pruneHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test', 5);
    expect(deletedCount).toBe(0);
    expect(mockEnv.DEAL_WATCHER.delete).not.toHaveBeenCalled();
  });

  it('should delete old snapshots when limit is exceeded', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' }, // Oldest - should be deleted
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' }, // Old - should be deleted
        { name: 'hist:abc123:2025-01-08T12:00:00.000Z' }, // Keep
        { name: 'hist:abc123:2025-01-08T13:00:00.000Z' }, // Keep
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' }  // Newest - keep
      ]
    });

    const deletedCount = await pruneHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test', 3);
    
    expect(deletedCount).toBe(2);
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('hist:abc123:2025-01-08T11:00:00.000Z');
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('hist:abc123:2025-01-08T10:00:00.000Z');
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledTimes(2);
  });

  it('should handle delete failures gracefully', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T12:00:00.000Z' }
      ]
    });

    // Mock one delete to fail
    mockEnv.DEAL_WATCHER.delete
      .mockResolvedValueOnce(undefined) // First delete succeeds
      .mockRejectedValueOnce(new Error('Delete failed')); // Second delete fails

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deletedCount = await pruneHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test', 1);

    expect(deletedCount).toBe(1); // Only one succeeded
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete historical snapshot'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});

describe('storeAndPruneSnapshot', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should store snapshot and prune old ones', async () => {
    const snapshot: HistoricalSnapshot = {
      promos: [],
      hash: 'abc123def456',
      timestamp: '2025-01-08T15:30:00.000Z'
    };

    // Mock list to return snapshots that need pruning
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T12:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T13:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T14:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T15:30:00.000Z' } // The new one we just stored
      ]
    });

    await storeAndPruneSnapshot(mockEnv, 'https://www.costcotravel.com/test', snapshot, 3);

    // Verify snapshot was stored
    expect(mockEnv.DEAL_WATCHER.put).toHaveBeenCalledWith(
      expect.stringMatching(/^hist:/),
      JSON.stringify(snapshot, null, 2)
    );

    // Verify pruning was called
    expect(mockEnv.DEAL_WATCHER.list).toHaveBeenCalled();
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledTimes(3); // Should delete 3 old ones
  });
});

describe('deleteAllHistoricalSnapshots', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it('should return 0 when no snapshots exist', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({ keys: [] });

    const deletedCount = await deleteAllHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');
    expect(deletedCount).toBe(0);
    expect(mockEnv.DEAL_WATCHER.delete).not.toHaveBeenCalled();
  });

  it('should delete all snapshots for a URL', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T12:00:00.000Z' }
      ]
    });

    const deletedCount = await deleteAllHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');

    expect(deletedCount).toBe(3);
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('hist:abc123:2025-01-08T10:00:00.000Z');
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('hist:abc123:2025-01-08T11:00:00.000Z');
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledWith('hist:abc123:2025-01-08T12:00:00.000Z');
    expect(mockEnv.DEAL_WATCHER.delete).toHaveBeenCalledTimes(3);
  });

  it('should handle delete failures gracefully', async () => {
    mockEnv.DEAL_WATCHER.list.mockResolvedValue({
      keys: [
        { name: 'hist:abc123:2025-01-08T10:00:00.000Z' },
        { name: 'hist:abc123:2025-01-08T11:00:00.000Z' }
      ]
    });

    // Mock one delete to fail
    mockEnv.DEAL_WATCHER.delete
      .mockResolvedValueOnce(undefined) // First delete succeeds
      .mockRejectedValueOnce(new Error('Delete failed')); // Second delete fails

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deletedCount = await deleteAllHistoricalSnapshots(mockEnv, 'https://www.costcotravel.com/test');

    expect(deletedCount).toBe(1); // Only one succeeded
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete historical snapshot'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});