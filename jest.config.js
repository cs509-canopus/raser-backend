module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["@swc/jest"],
  },
  globalSetup: "<rootDir>/test/db/global-setup.ts",
  globalTeardown: "<rootDir>/test/db/global-teardown.ts",
  setupFiles: ["<rootDir>/test/db/setup-env.ts"],
  setupFilesAfterEnv: ["aws-cdk-lib/testhelpers/jest-autoclean"],
};
