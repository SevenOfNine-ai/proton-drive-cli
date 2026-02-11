import { AppError, ErrorCode } from './types';

describe('AppError', () => {
  it('sets fields correctly via constructor', () => {
    const err = new AppError('test message', ErrorCode.AUTH_FAILED, { key: 'val' }, true);
    expect(err.message).toBe('test message');
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.details).toEqual({ key: 'val' });
    expect(err.isRecoverable).toBe(true);
    expect(err.name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    const err = new AppError('msg', ErrorCode.UNKNOWN_ERROR);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults isRecoverable to false', () => {
    const err = new AppError('msg', ErrorCode.UNKNOWN_ERROR);
    expect(err.isRecoverable).toBe(false);
  });
});

describe('toUserMessage', () => {
  it('returns non-empty string for all ErrorCode values', () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new AppError('fallback', code as ErrorCode);
      const msg = err.toUserMessage();
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('returns specific message for AUTH_FAILED', () => {
    const err = new AppError('x', ErrorCode.AUTH_FAILED);
    expect(err.toUserMessage()).toContain('Authentication failed');
  });

  it('returns specific message for SESSION_EXPIRED', () => {
    const err = new AppError('x', ErrorCode.SESSION_EXPIRED);
    expect(err.toUserMessage()).toContain('session has expired');
  });

  it('returns specific message for FILE_NOT_FOUND with details', () => {
    const err = new AppError('x', ErrorCode.FILE_NOT_FOUND, { path: '/test.txt' });
    expect(err.toUserMessage()).toContain('/test.txt');
  });

  it('returns original message for VALIDATION_ERROR', () => {
    const err = new AppError('custom validation msg', ErrorCode.VALIDATION_ERROR);
    expect(err.toUserMessage()).toBe('custom validation msg');
  });
});

describe('getRecoverySuggestion', () => {
  it('returns suggestion for auth errors', () => {
    const err = new AppError('x', ErrorCode.AUTH_FAILED);
    expect(err.getRecoverySuggestion()).toContain('login');
  });

  it('returns suggestion for SESSION_EXPIRED', () => {
    const err = new AppError('x', ErrorCode.SESSION_EXPIRED);
    expect(err.getRecoverySuggestion()).toContain('login');
  });

  it('returns suggestion for network errors', () => {
    const err = new AppError('x', ErrorCode.NETWORK_ERROR);
    expect(err.getRecoverySuggestion()).toContain('internet');
  });

  it('returns suggestion for RATE_LIMITED', () => {
    const err = new AppError('x', ErrorCode.RATE_LIMITED);
    expect(err.getRecoverySuggestion()).toContain('Wait');
  });

  it('returns null for unknown error codes', () => {
    const err = new AppError('x', ErrorCode.UNKNOWN_ERROR);
    expect(err.getRecoverySuggestion()).toBeNull();
  });

  it('returns null for UPLOAD_FAILED (no specific suggestion)', () => {
    const err = new AppError('x', ErrorCode.UPLOAD_FAILED);
    expect(err.getRecoverySuggestion()).toBeNull();
  });
});
