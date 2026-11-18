import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BASE_URL = 'http://example.org/ldes/';
process.env.DATA_FOLDER = mkdtempSync(join(tmpdir(), 'ldes-'));
process.env.FEEDS_CONFIG_DIR = join(process.cwd(), 'config/feeds');

// no mu-javascript-template in the tests, and an in-memory triplestore
jest.mock(
  'mu',
  () => ({
    sparqlEscapeUri: (uri) => `<${uri}>`,
    sparqlEscapeString: (value) => JSON.stringify(value),
  }),
  { virtual: true },
);
jest.mock('@lblod/mu-auth-sudo', () => require('./triplestore'));

let mockUuid = 0;
jest.mock('uuid', () => ({ v4: () => `${++mockUuid}` }));
beforeEach(() => {
  mockUuid = 0;
});
jest.useFakeTimers({
  now: new Date('2026-01-01T00:00:00.000Z'),
  doNotFake: [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ],
});
