export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|ansi-styles)/)',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { useESM: false }],
  },
  moduleNameMapper: {
    '#ansi-styles': 'ansi-styles',
  },
};
