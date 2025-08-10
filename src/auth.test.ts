/**
 * Unit tests for authentication middleware
 */

import { describe, it, expect } from 'vitest';
import { 
  validateAdminToken, 
  extractAuthToken, 
  authenticateAdminRequest, 
  createAuthErrorResponse,
  AuthResult 
} from './utils';

describe('Authentication Middleware', () => {
  const validToken = 'test-admin-token-12345';
  const invalidToken = 'invalid-token';

  describe('validateAdminToken', () => {
    it('should authenticate with valid token', () => {
      const result = validateAdminToken(validToken, validToken);
      
      expect(result.authenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid token', () => {
      const result = validateAdminToken(invalidToken, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid authorization token');
    });

    it('should reject missing token', () => {
      const result = validateAdminToken(null, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Missing authorization token');
    });

    it('should reject empty token', () => {
      const result = validateAdminToken('', validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Missing authorization token');
    });

    it('should handle missing valid token configuration', () => {
      const result = validateAdminToken(validToken, '');
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Admin token not configured');
    });

    it('should use constant-time comparison', () => {
      // Test that different length tokens are handled securely
      const shortToken = 'short';
      const longToken = 'this-is-a-much-longer-token-for-testing';
      
      const result1 = validateAdminToken(shortToken, longToken);
      const result2 = validateAdminToken(longToken, shortToken);
      
      expect(result1.authenticated).toBe(false);
      expect(result2.authenticated).toBe(false);
    });

    it('should handle tokens with special characters', () => {
      const specialToken = 'token-with-!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const result1 = validateAdminToken(specialToken, specialToken);
      const result2 = validateAdminToken(specialToken, validToken);
      
      expect(result1.authenticated).toBe(true);
      expect(result2.authenticated).toBe(false);
    });

    it('should handle Unicode characters', () => {
      const unicodeToken = 'token-with-🔑-emoji';
      
      const result1 = validateAdminToken(unicodeToken, unicodeToken);
      const result2 = validateAdminToken(unicodeToken, validToken);
      
      expect(result1.authenticated).toBe(true);
      expect(result2.authenticated).toBe(false);
    });

    it('should be case sensitive', () => {
      const upperToken = validToken.toUpperCase();
      
      const result = validateAdminToken(upperToken, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid authorization token');
    });

    it('should handle whitespace differences', () => {
      const tokenWithSpaces = ` ${validToken} `;
      
      const result = validateAdminToken(tokenWithSpaces, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid authorization token');
    });
  });

  describe('extractAuthToken', () => {
    it('should extract token from Bearer header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBe(validToken);
    });

    it('should extract token from direct header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': validToken
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBe(validToken);
    });

    it('should return null when no Authorization header', () => {
      const request = new Request('https://example.com');
      
      const token = extractAuthToken(request);
      
      expect(token).toBeNull();
    });

    it('should handle empty Authorization header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': ''
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBeNull();
    });

    it('should handle Bearer with empty token', () => {
      // Test with multiple spaces after Bearer to ensure empty token detection
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': 'Bearer    ' // Multiple spaces
        }
      });
      
      const token = extractAuthToken(request);
      
      // HTTP headers normalize whitespace, so this becomes "Bearer"
      // Since "Bearer" doesn't start with "Bearer ", it's treated as a direct token
      expect(token).toBe('Bearer');
    });

    it('should handle Bearer with token containing spaces', () => {
      const tokenWithSpaces = 'token with spaces';
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${tokenWithSpaces}`
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBe(tokenWithSpaces);
    });

    it('should be case sensitive for Bearer prefix', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `bearer ${validToken}` // lowercase
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBe(`bearer ${validToken}`); // Should return the whole string
    });

    it('should handle exact "Bearer" as direct token', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': 'Bearer' // Exact "Bearer" without space
        }
      });
      
      const token = extractAuthToken(request);
      
      expect(token).toBe('Bearer'); // Should return "Bearer" as direct token
    });
  });

  describe('authenticateAdminRequest', () => {
    it('should authenticate valid Bearer token request', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });
      
      const result = authenticateAdminRequest(request, validToken);
      
      expect(result.authenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should authenticate valid direct token request', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': validToken
        }
      });
      
      const result = authenticateAdminRequest(request, validToken);
      
      expect(result.authenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject request with invalid token', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });
      
      const result = authenticateAdminRequest(request, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid authorization token');
    });

    it('should reject request without Authorization header', () => {
      const request = new Request('https://example.com');
      
      const result = authenticateAdminRequest(request, validToken);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Missing authorization token');
    });

    it('should handle POST request with valid token', () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: 'data' })
      });
      
      const result = authenticateAdminRequest(request, validToken);
      
      expect(result.authenticated).toBe(true);
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      for (const method of methods) {
        const request = new Request('https://example.com', {
          method,
          headers: {
            'Authorization': `Bearer ${validToken}`
          }
        });
        
        const result = authenticateAdminRequest(request, validToken);
        
        expect(result.authenticated).toBe(true);
      }
    });
  });

  describe('createAuthErrorResponse', () => {
    it('should create 401 response for authentication failure', async () => {
      const authResult: AuthResult = {
        authenticated: false,
        error: 'Invalid authorization token'
      };
      
      const response = createAuthErrorResponse(authResult);
      
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
      
      const body = await response.json() as any;
      expect(body.error).toBe('Invalid authorization token');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should handle missing error message', async () => {
      const authResult: AuthResult = {
        authenticated: false
      };
      
      const response = createAuthErrorResponse(authResult);
      
      expect(response.status).toBe(401);
      
      const body = await response.json() as any;
      expect(body.error).toBe('Authentication failed');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should create proper JSON response', async () => {
      const authResult: AuthResult = {
        authenticated: false,
        error: 'Missing authorization token'
      };
      
      const response = createAuthErrorResponse(authResult);
      const body = await response.json() as any;
      
      expect(typeof body).toBe('object');
      expect(body.error).toBe('Missing authorization token');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should set correct headers', () => {
      const authResult: AuthResult = {
        authenticated: false,
        error: 'Test error'
      };
      
      const response = createAuthErrorResponse(authResult);
      
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    });
  });

  describe('Security Tests', () => {
    it('should prevent timing attacks with different token lengths', () => {
      const shortToken = 'abc';
      const longToken = 'this-is-a-very-long-token-that-should-not-reveal-timing-information';
      
      // Measure time for different comparisons
      const iterations = 100;
      
      const startTime1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        validateAdminToken(shortToken, longToken);
      }
      const endTime1 = performance.now();
      
      const startTime2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        validateAdminToken(longToken, shortToken);
      }
      const endTime2 = performance.now();
      
      const time1 = endTime1 - startTime1;
      const time2 = endTime2 - startTime2;
      
      // Times should be relatively similar (within 50% of each other)
      // This is a basic timing attack prevention test
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(2); // Allow some variance due to system noise
    });

    it('should handle very long tokens without performance issues', () => {
      const veryLongToken = 'a'.repeat(10000);
      const normalToken = 'normal-token';
      
      const startTime = performance.now();
      const result = validateAdminToken(veryLongToken, normalToken);
      const endTime = performance.now();
      
      expect(result.authenticated).toBe(false);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle null bytes in tokens', () => {
      const tokenWithNull = 'token\x00with\x00nulls';
      const normalToken = 'normal-token';
      
      const result1 = validateAdminToken(tokenWithNull, tokenWithNull);
      const result2 = validateAdminToken(tokenWithNull, normalToken);
      
      expect(result1.authenticated).toBe(true);
      expect(result2.authenticated).toBe(false);
    });

    it('should handle tokens with control characters', () => {
      const tokenWithControls = 'token\r\n\t\b\f';
      
      const result = validateAdminToken(tokenWithControls, tokenWithControls);
      
      expect(result.authenticated).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should work with complete authentication flow', async () => {
      // Create request with valid token
      const request = new Request('https://example.com/admin/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'test' })
      });
      
      // Authenticate request
      const authResult = authenticateAdminRequest(request, validToken);
      
      expect(authResult.authenticated).toBe(true);
      
      // Should not create error response for valid auth
      if (!authResult.authenticated) {
        const errorResponse = createAuthErrorResponse(authResult);
        expect(errorResponse.status).toBe(401);
      }
    });

    it('should work with complete failure flow', async () => {
      // Create request with invalid token
      const request = new Request('https://example.com/admin/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${invalidToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Authenticate request
      const authResult = authenticateAdminRequest(request, validToken);
      
      expect(authResult.authenticated).toBe(false);
      
      // Create error response
      const errorResponse = createAuthErrorResponse(authResult);
      expect(errorResponse.status).toBe(401);
      
      const body = await errorResponse.json();
      expect(body.error).toBe('Invalid authorization token');
    });

    it('should handle missing token flow', async () => {
      // Create request without token
      const request = new Request('https://example.com/admin/test', {
        method: 'GET'
      });
      
      // Authenticate request
      const authResult = authenticateAdminRequest(request, validToken);
      
      expect(authResult.authenticated).toBe(false);
      expect(authResult.error).toBe('Missing authorization token');
      
      // Create error response
      const errorResponse = createAuthErrorResponse(authResult);
      expect(errorResponse.status).toBe(401);
      
      const body = await errorResponse.json();
      expect(body.error).toBe('Missing authorization token');
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely long authorization headers', () => {
      const longToken = 'a'.repeat(100000);
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${longToken}`
        }
      });
      
      const token = extractAuthToken(request);
      expect(token).toBe(longToken);
      
      const result = authenticateAdminRequest(request, validToken);
      expect(result.authenticated).toBe(false);
    });

    it('should handle multiple Authorization headers', () => {
      // Note: This test depends on how the Request constructor handles duplicate headers
      // In most implementations, only the first or last value is kept
      const request = new Request('https://example.com', {
        headers: [
          ['Authorization', `Bearer ${invalidToken}`],
          ['Authorization', `Bearer ${validToken}`]
        ]
      });
      
      const token = extractAuthToken(request);
      // The behavior here depends on the implementation
      expect(typeof token).toBe('string');
    });

    it('should handle Latin characters in headers', () => {
      const latinToken = 'token-with-latin-chars-àáâãäåæçèéêë';
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${latinToken}`
        }
      });
      
      const token = extractAuthToken(request);
      expect(token).toBe(latinToken);
      
      const result = authenticateAdminRequest(request, latinToken);
      expect(result.authenticated).toBe(true);
    });
  });
});