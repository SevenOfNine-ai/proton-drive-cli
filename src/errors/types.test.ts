/**
 * Tests for error types and detection functions
 */

import {
  RateLimitError,
  CaptchaError,
  isRateLimitError,
  isCaptchaError,
  ErrorCode,
  ErrorCategory,
  categorizeError,
} from './types';

describe('error types', () => {
  describe('RateLimitError', () => {
    it('should create rate-limit error with metadata', () => {
      const error = new RateLimitError('Rate limited', {
        retryAfter: 60,
        protonCode: 2028,
      });

      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limited');
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.retryAfter).toBe(60);
      expect(error.protonCode).toBe(2028);
      expect(error.isRecoverable).toBe(false);
    });

    it('should work without optional metadata', () => {
      const error = new RateLimitError('Rate limited');

      expect(error.retryAfter).toBeUndefined();
      expect(error.protonCode).toBeUndefined();
    });
  });

  describe('CaptchaError', () => {
    it('should create CAPTCHA error with metadata', () => {
      const error = new CaptchaError({
        captchaUrl: 'https://example.com/captcha',
        captchaToken: 'token123',
        verificationMethods: ['captcha', 'sms'],
      });

      expect(error.name).toBe('CaptchaError');
      expect(error.code).toBe(ErrorCode.CAPTCHA_REQUIRED);
      expect(error.captchaUrl).toBe('https://example.com/captcha');
      expect(error.captchaToken).toBe('token123');
      expect(error.verificationMethods).toEqual(['captcha', 'sms']);
      expect(error.isRecoverable).toBe(true);
    });
  });

  describe('isRateLimitError', () => {
    it('should detect RateLimitError instances', () => {
      const error = new RateLimitError('Rate limited');
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect HTTP 429 status', () => {
      const error = {
        response: { status: 429 },
        message: 'Too many requests',
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect Proton code 2028', () => {
      const error = {
        response: { data: { Code: 2028 } },
        message: 'Rate limited',
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect Proton code 85131', () => {
      const error = {
        response: { data: { Code: 85131 } },
        message: 'Anti-abuse',
      };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for non-rate-limit errors', () => {
      const error = new Error('Generic error');
      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for 4xx errors that are not 429', () => {
      const error = {
        response: { status: 400 },
        message: 'Bad request',
      };
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe('isCaptchaError', () => {
    it('should detect CaptchaError instances', () => {
      const error = new CaptchaError({
        captchaUrl: 'https://example.com',
        captchaToken: 'token',
      });
      expect(isCaptchaError(error)).toBe(true);
    });

    it('should detect Proton code 9001', () => {
      const error = {
        response: { data: { Code: 9001 } },
        message: 'CAPTCHA required',
      };
      expect(isCaptchaError(error)).toBe(true);
    });

    it('should detect Proton code 12087', () => {
      const error = {
        response: { data: { Code: 12087 } },
        message: 'CAPTCHA token invalid',
      };
      expect(isCaptchaError(error)).toBe(true);
    });

    it('should detect HumanVerificationToken in Details', () => {
      const error = {
        response: {
          data: {
            Code: 2028,
            Details: { HumanVerificationToken: 'token123' },
          },
        },
        message: 'Verification required',
      };
      expect(isCaptchaError(error)).toBe(true);
    });

    it('should return false for non-CAPTCHA errors', () => {
      const error = new Error('Generic error');
      expect(isCaptchaError(error)).toBe(false);
    });

    it('should return false for rate-limit errors', () => {
      const error = {
        response: { data: { Code: 2028 } },
        message: 'Rate limited',
      };
      expect(isCaptchaError(error)).toBe(false);
    });
  });

  describe('categorizeError', () => {
    it('should categorize rate-limit errors', () => {
      const error = new RateLimitError('Rate limited', {
        retryAfter: 60,
        protonCode: 2028,
      });

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(categorized.retryable).toBe(false);
      expect(categorized.userMessage).toContain('Rate limit');
      expect(categorized.protonCode).toBe(2028);
    });

    it('should categorize CAPTCHA errors', () => {
      const error = new CaptchaError({
        captchaUrl: 'https://example.com/captcha',
        captchaToken: 'token123',
      });

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.CAPTCHA);
      expect(categorized.retryable).toBe(false);
      expect(categorized.userMessage).toContain('CAPTCHA');
      expect(categorized.recoverySuggestion).toContain('proton-drive login');
    });

    it('should categorize 401 as auth error', () => {
      const error = {
        response: { status: 401, data: { Code: 1000 } },
        message: 'Unauthorized',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.AUTH);
      expect(categorized.retryable).toBe(false);
      expect(categorized.httpStatus).toBe(401);
      expect(categorized.recoverySuggestion).toContain('proton-drive login');
    });

    it('should categorize 404 as not found', () => {
      const error = {
        response: { status: 404 },
        message: 'Not found',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.NOT_FOUND);
      expect(categorized.retryable).toBe(false);
      expect(categorized.httpStatus).toBe(404);
    });

    it('should categorize 5xx as server error (retryable)', () => {
      const error = {
        response: { status: 503 },
        message: 'Service unavailable',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.SERVER);
      expect(categorized.retryable).toBe(true);
      expect(categorized.httpStatus).toBe(503);
    });

    it('should categorize 4xx as client error (not retryable)', () => {
      const error = {
        response: { status: 400 },
        message: 'Bad request',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.CLIENT);
      expect(categorized.retryable).toBe(false);
      expect(categorized.httpStatus).toBe(400);
    });

    it('should categorize network errors as retryable', () => {
      const error = {
        code: 'ECONNRESET',
        message: 'Connection reset',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.NETWORK);
      expect(categorized.retryable).toBe(true);
      expect(categorized.recoverySuggestion).toContain('internet connection');
    });

    it('should categorize ETIMEDOUT as network error', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Timeout',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.NETWORK);
      expect(categorized.retryable).toBe(true);
    });

    it('should categorize unknown errors', () => {
      const error = new Error('Something went wrong');

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.UNKNOWN);
      expect(categorized.retryable).toBe(false);
      expect(categorized.message).toBe('Something went wrong');
    });

    it('should include protonCode when available', () => {
      const error = {
        response: { status: 500, data: { Code: 12345 } },
        message: 'Server error',
      };

      const categorized = categorizeError(error);

      expect(categorized.protonCode).toBe(12345);
    });

    it('should categorize permission denied (403 with permission keyword)', () => {
      const error = {
        response: { status: 403 },
        message: 'Permission denied for this resource',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.PERMISSION);
      expect(categorized.retryable).toBe(false);
      expect(categorized.userMessage).toContain('Permission denied');
    });

    it('should treat 403 without permission keyword as auth error', () => {
      const error = {
        response: { status: 403 },
        message: 'Forbidden',
      };

      const categorized = categorizeError(error);

      expect(categorized.category).toBe(ErrorCategory.AUTH);
      expect(categorized.retryable).toBe(false);
    });
  });
});
