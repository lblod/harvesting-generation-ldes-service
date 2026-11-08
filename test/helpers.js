import { TurtleDoc } from '@nbittich/tortank-wasm';
import { Parser, Store, Writer } from 'n3';

const WELL_KNOWN_PREFIX = 'http://data.lblod.info/.well-known/genid#';

const parse = (ttl) => {
  let n = 1;
  return TurtleDoc.parse(ttl, WELL_KNOWN_PREFIX, () => `${n++}`);
};

export function turtleToStore(ttl) {
  return new Store(new Parser().parse(ttl));
}

export function storeToTurtle(store) {
  const writer = new Writer({ format: 'N-Triples' });
  writer.addQuads(store.getQuads(null, null, null, null));
  return new Promise((resolve, reject) =>
    writer.end((error, result) => (error ? reject(error) : resolve(result))),
  );
}

export function expectSameTurtle(actualTtl, expectedTtl) {
  const actual = parse(actualTtl);
  const expected = parse(expectedTtl);
  const unexpected = actual.difference(expected);
  const missing = expected.difference(actual);
  if (!unexpected.isEmpty()) {
    throw new Error(
      `Actual contains triples not present in expected:\n${unexpected.toString()}`,
    );
  }
  if (!missing.isEmpty()) {
    throw new Error(
      `Expected triples are missing from actual:\n${missing.toString()}`,
    );
  }
}
