module.exports = {
  testEnvironment: "node",
  transform: { "\\.js$": "@swc/jest" },
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  resetMocks: true,
};
