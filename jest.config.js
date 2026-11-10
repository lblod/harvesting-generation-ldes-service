module.exports = {
  testEnvironment: 'node',
  transform: { '\\.js$': '@swc/jest' },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  transformIgnorePatterns: ['/node_modules/(?!@nbittich/tortank-wasm/)'],
  resetMocks: true,
};
