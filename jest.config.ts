export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/submodules/'],
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|ansi-styles)/)',
    '<rootDir>/submodules/',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { useESM: false }],
  },
  moduleNameMapper: {
    '#ansi-styles': 'ansi-styles',
  },
};
