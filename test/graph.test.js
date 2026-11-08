import { getFilePaths, getSubjectsInFile } from '../lib/graph';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { querySudo } from '@lblod/mu-auth-sudo';

jest.mock('mu', () => ({ sparqlEscapeUri: (uri) => `<${uri}>` }), {
  virtual: true,
});
jest.mock('@lblod/mu-auth-sudo', () => ({ querySudo: jest.fn() }), {
  virtual: true,
});
jest.mock(
  '../constants',
  () => ({
    PREFIXES: '',
    BATCH_SIZE: 2,
    DEFAULT_GRAPH: 'http://mu.semte.ch/graphs/test',
    HIGH_LOAD_DATABASE_ENDPOINT: 'http://virtuoso:8890/sparql',
  }),
  { virtual: true },
);

let dataFolder;

beforeAll(async () => {
  dataFolder = await mkdtemp(join(tmpdir(), 'files-'));
});

afterAll(async () => {
  await rm(dataFolder, { recursive: true, force: true });
});

beforeEach(() => {
  querySudo.mockReset();
});

const bindings = (...paths) => ({
  results: {
    bindings: paths.map((value) => ({ path: { type: 'uri', value } })),
  },
});

describe('getFilePaths', () => {
  const task = { task: 'http://ex.org/task/1' };

  it('pages through the results until a page is not full', async () => {
    querySudo
      .mockResolvedValueOnce(bindings('share://a.ttl', 'share://b.ttl'))
      .mockResolvedValueOnce(bindings('share://c.ttl.gz'));

    const paths = await getFilePaths('data.ttl', task);

    expect(paths).toEqual(['/share/a.ttl', '/share/b.ttl', '/share/c.ttl.gz']);
    expect(querySudo).toHaveBeenCalledTimes(2);
    expect(querySudo.mock.calls[0][0]).toMatch(/LIMIT 2 OFFSET 0/);
    expect(querySudo.mock.calls[1][0]).toMatch(/LIMIT 2 OFFSET 2/);
  });

  it('does one extra query when the last page is exactly full', async () => {
    querySudo
      .mockResolvedValueOnce(bindings('share://a.ttl', 'share://b.ttl'))
      .mockResolvedValueOnce(bindings());

    expect(await getFilePaths('data.ttl', task)).toEqual([
      '/share/a.ttl',
      '/share/b.ttl',
    ]);
    expect(querySudo).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list when there are no files', async () => {
    querySudo.mockResolvedValueOnce(bindings());

    expect(await getFilePaths('data.ttl', task)).toEqual([]);
  });

  it('queries for the task, the file name and its gzipped variant on the high load endpoint', async () => {
    querySudo.mockResolvedValueOnce(bindings());

    await getFilePaths('data.ttl', task);

    const [queryString, headers, options] = querySudo.mock.calls[0];
    expect(queryString).toContain('<http://ex.org/task/1>');
    expect(queryString).toContain('GRAPH <http://mu.semte.ch/graphs/test>');
    expect(queryString).toContain('("data.ttl", "data.ttl.gz")');
    expect(headers).toEqual({});
    expect(options).toEqual({
      sparqlEndpoint: 'http://virtuoso:8890/sparql',
      mayRetry: true,
    });
  });

  it('propagates query errors', async () => {
    querySudo.mockRejectedValueOnce(new Error('virtuoso down'));

    await expect(getFilePaths('data.ttl', task)).rejects.toThrow(
      'virtuoso down',
    );
  });
});

describe('getSubjectsInFile', () => {
  const triples = `
<http://ex.org/s/1> <http://ex.org/p> "a" .
<http://ex.org/s/1> <http://ex.org/p> "b" .
<http://ex.org/s/2> <http://ex.org/p> <http://ex.org/o> .
_:blank <http://ex.org/p> "ignored" .
`;
  const expected = new Set(['http://ex.org/s/1', 'http://ex.org/s/2']);

  const write = async (name, content) => {
    const path = join(dataFolder, name);
    await writeFile(path, content);
    return path;
  };

  it('returns the distinct named-node subjects of an N-Triples file', async () => {
    const path = await write('plain.nt', triples);

    expect(await getSubjectsInFile(path)).toEqual(expected);
  });

  it('decompresses gzipped files', async () => {
    const path = await write('zipped.nt.gz', gzipSync(triples));

    expect(await getSubjectsInFile(path)).toEqual(expected);
  });

  it('handles triples spread over multiple lines (Turtle)', async () => {
    const path = await write(
      'multiline.ttl',
      `@prefix ex: <http://ex.org/> .
      ex:s1
        ex:p "a" ;
        ex:q [ ex:r "nested" ] .`,
    );

    expect(await getSubjectsInFile(path)).toEqual(
      new Set(['http://ex.org/s1']),
    );
  });

  it('handles files larger than one stream chunk', async () => {
    const count = 5000;
    const big = Array.from(
      { length: count },
      (_, i) =>
        `<http://ex.org/s/${i}> <http://ex.org/p> "a fairly long literal value ${i}" .`,
    ).join('\n');
    const path = await write('big.nt.gz', gzipSync(big));

    const subjects = await getSubjectsInFile(path);

    expect(subjects.size).toBe(count);
    expect(subjects.has(`http://ex.org/s/${count - 1}`)).toBe(true);
  });

  it('returns an empty set for an empty file', async () => {
    const path = await write('empty.nt', '');

    expect(await getSubjectsInFile(path)).toEqual(new Set());
  });

  it('rejects when the file does not exist', async () => {
    await expect(
      getSubjectsInFile(join(dataFolder, 'missing.nt')),
    ).rejects.toThrow(/ENOENT/);
  });

  it('rejects on invalid RDF', async () => {
    const path = await write(
      'invalid.nt',
      '<http://ex.org/s> this is not rdf\n',
    );

    await expect(getSubjectsInFile(path)).rejects.toThrow();
  });

  it('rejects on a corrupt gzip file', async () => {
    const path = await write('corrupt.nt.gz', 'not gzipped at all');

    await expect(getSubjectsInFile(path)).rejects.toThrow();
  });
});
