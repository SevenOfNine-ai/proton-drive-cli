import axios from 'axios';
import { UserApiClient } from './user';
import { SessionManager } from '../auth/session';

jest.mock('axios');
jest.mock('../auth/session');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

let mockAxiosInstance: any;
let requestInterceptorFulfill: Function;
let responseInterceptorReject: Function;

const fakeSession = {
  accessToken: 'test-token',
  uid: 'test-uid',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAxiosInstance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
  };
  mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
  mockedSessionManager.loadSession.mockResolvedValue(fakeSession as any);
});

function captureInterceptors() {
  [requestInterceptorFulfill] =
    mockAxiosInstance.interceptors.request.use.mock.calls[0];
  [, responseInterceptorReject] =
    mockAxiosInstance.interceptors.response.use.mock.calls[0];
}

describe('UserApiClient', () => {
  describe('constructor', () => {
    test('creates axios instance with correct config', () => {
      new UserApiClient('https://test.example.com');
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://test.example.com',
          timeout: 30000,
        })
      );
    });
  });

  describe('request interceptor', () => {
    test('adds auth headers from session', async () => {
      new UserApiClient();
      captureInterceptors();

      const config = { headers: {} as Record<string, string> };
      const result = await requestInterceptorFulfill(config);

      expect(result.headers['Authorization']).toBe('Bearer test-token');
      expect(result.headers['x-pm-uid']).toBe('test-uid');
    });

    test('throws when no session', async () => {
      new UserApiClient();
      captureInterceptors();
      mockedSessionManager.loadSession.mockResolvedValue(null);

      await expect(
        requestInterceptorFulfill({ headers: {} })
      ).rejects.toThrow('No valid session');
    });
  });

  describe('response interceptor', () => {
    test('throws session expired on 401', async () => {
      new UserApiClient();
      captureInterceptors();

      const error = { response: { status: 401, data: {} } };
      await expect(responseInterceptorReject(error)).rejects.toThrow(
        'Session expired'
      );
    });

    test('throws API error with code and message', async () => {
      new UserApiClient();
      captureInterceptors();

      const error = {
        response: {
          status: 422,
          data: { Code: 2000, Error: 'Something went wrong' },
        },
      };
      await expect(responseInterceptorReject(error)).rejects.toThrow(
        'API Error (2000): Something went wrong'
      );
    });
  });

  describe('getUser', () => {
    test('calls /core/v4/users and returns User', async () => {
      const client = new UserApiClient();
      mockAxiosInstance.get.mockResolvedValue({
        data: { Code: 1000, User: { ID: 'user-1', Name: 'Test' } },
      });

      const result = await client.getUser();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/core/v4/users');
      expect(result.ID).toBe('user-1');
    });
  });

  describe('getAddresses', () => {
    test('calls /core/v4/addresses and returns array', async () => {
      const client = new UserApiClient();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          Code: 1000,
          Addresses: [{ ID: 'addr-1', Email: 'user@proton.me' }],
        },
      });

      const result = await client.getAddresses();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/core/v4/addresses');
      expect(result).toHaveLength(1);
      expect(result[0].Email).toBe('user@proton.me');
    });
  });

  describe('getKeySalts', () => {
    test('calls /core/v4/keys/salts and returns salts', async () => {
      const client = new UserApiClient();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          Code: 1000,
          KeySalts: [{ ID: 'key-1', KeySalt: 'abcdef' }],
        },
      });

      const result = await client.getKeySalts();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/core/v4/keys/salts');
      expect(result[0].KeySalt).toBe('abcdef');
    });
  });
});
