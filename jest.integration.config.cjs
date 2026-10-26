module.exports = { ...require('./jest.config.cjs'), testMatch: ['<rootDir>/test/**/*.spec.ts'], setupFiles: ['<rootDir>/test/setup.cjs'], testTimeout: 90000 };
