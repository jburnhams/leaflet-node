// Runs the built package (dist/) under jest-environment-jsdom, the way a
// consumer's Jest suite would. Build first: `npm run build`.
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.mjs'],
  testMatch: ['<rootDir>/leaflet-node.integration.test.mjs'],
  moduleFileExtensions: ['mjs', 'js', 'cjs', 'json'],
  transform: {},
};
