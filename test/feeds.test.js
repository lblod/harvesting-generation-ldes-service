import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { TurtleDoc } from '@nbittich/tortank-wasm';
import { load } from './triplestore';
import { readDiffFile } from '../lib/graph';
import { loadFeeds } from '../lib/feeds';
import { generateFeed, addTombstones } from '../lib/pipeline-generating-ldes';

// test/examples/new-insert/<case>.ttl  the harvested data, also in the triplestore
// test/examples/to-remove/<case>.ttl   the removed triples
// test/examples/output/<case>.ttl      the expected pages of all feeds
const EXAMPLES = 'test/examples';
const WELL_KNOWN_PREFIX = 'http://data.lblod.info/.well-known/genid#';

const CASES = [
  ['0001', 'a public zitting, and its besluit linked to its behandeling'],
  ['0002', 'a non public agendapunt is left out, with what hangs on it'],
  ['0003', 'a zitting without orgaan is not published, nor its besluiten'],
  ['0004', 'only the listed properties of complete resources are published'],
  ['0005', 'a removed zitting becomes a tombstone'],
];

test.each(CASES)('%s: %s', async (name) => {
  const inserted = `${EXAMPLES}/new-insert/${name}.ttl`;
  const removed = `${EXAMPLES}/to-remove/${name}.ttl`;
  const subjects = existsSync(inserted)
    ? (await readDiffFile(inserted)).subjects
    : new Set();
  const removedTypes = existsSync(removed)
    ? (await readDiffFile(removed)).types
    : [];
  load(existsSync(inserted) ? await readFile(inserted, 'utf-8') : '');

  let pages = '';
  for (const feed of await loadFeeds()) {
    const removedMembers = removedTypes
      .filter((type) => type.rdfType === feed.rdfType)
      .map((type) => type.subject);
    await generateFeed(name, feed, subjects);
    await addTombstones(name, feed, new Set(removedMembers));
    pages += await readPage(name, feed.name);
  }

  const actual = parse(pages);
  const expected = parse(
    await readFile(`${EXAMPLES}/output/${name}.ttl`, 'utf-8'),
  );
  expect(difference(actual, expected)).toBe('');
  expect(difference(expected, actual)).toBe('');
});

async function readPage(unit, feedName) {
  const page = `${process.env.DATA_FOLDER}/${unit}/${feedName}/1.ttl`;
  if (!existsSync(page)) return '';
  const stream = `${process.env.BASE_URL}${unit}/${feedName}`;
  return (await readFile(page, 'utf-8')).replaceAll('<./', `<${stream}/`);
}

function parse(ttl) {
  let n = 1;
  return TurtleDoc.parse(ttl, WELL_KNOWN_PREFIX, () => `${n++}`);
}

function difference(a, b) {
  const triples = a.difference(b);
  return triples.isEmpty() ? '' : triples.toString();
}
