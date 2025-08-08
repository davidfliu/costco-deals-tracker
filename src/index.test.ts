import { describe, it, expect } from 'vitest';
import { Target, Promotion, TargetState, ChangeResult } from './types';

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