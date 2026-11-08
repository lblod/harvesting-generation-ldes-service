process.env.BASE_URL = 'http://example.org/ldes/';

// no mu-javascript-template and no triplestore in the tests
jest.mock('mu', () => ({ sparqlEscapeUri: (uri) => `<${uri}>` }), {
  virtual: true,
});
jest.mock('@lblod/mu-auth-sudo', () => ({
  querySudo: jest.fn(),
  updateSudo: jest.fn(),
}));
