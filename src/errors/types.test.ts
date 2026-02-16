/**
 * Tests for error types and detection functions
 */

import {
  RateLimitError,
  CaptchaError,
  isRateLimitError,
  isCaptchaError,
  ErrorCode,
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
});
