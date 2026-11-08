import { querySudo } from '@lblod/mu-auth-sudo';
import { DataFactory } from 'n3';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadFeeds,
  toFeed,
  findMembers,
  context,
  findByValue,
} from '../lib/feeds';

const { namedNode, literal, quad } = DataFactory;

const SUBJECT = '<http://ex.org/x/1>';
const GRAPH = '<http://mu.semte.ch/graphs/public>';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const BESLUIT = 'http://data.vlaanderen.be/ns/besluit#';
const PROV = 'http://www.w3.org/ns/prov#';

// records the queries and answers them with the given results, in order
function fakeContext(...answers) {
  const queries = [];
  const ctx = {
    graph: GRAPH,
    findByValue,
    select: jest.fn(async (q) => {
      queries.push(q);
      return answers.shift() || [];
    }),
    construct: jest.fn(async (q) => {
      queries.push(q);
      return answers.shift() || [];
    }),
  };
  return { ctx, queries };
}

function ex(name) {
  return namedNode(`http://ex.org/${name}`);
}

function on(subject, ...predicates) {
  return predicates.map((p) => quad(subject, namedNode(p), literal('x')));
}

async function feed(name) {
  return (await loadFeeds()).find((f) => f.name === name);
}

function valid() {
  return {
    shape: 'http://ex.org/shape',
    prefixes: 'PREFIX ex: <http://ex.org/>',
    getNodes: () => [
      { find: (s) => `VALUES ?s { ${s} }`, required: ['ex:p'] },
      { find: (s) => `${s} ex:q ?s .` },
    ],
    memberPattern: '?s a ex:Thing .',
  };
}

function uris(...values) {
  return values.map((value) => ({ s: { type: 'uri', value } }));
}

function feedDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'feeds-'));
  Object.entries(files).forEach(([file, content]) =>
    writeFileSync(join(dir, file), content),
  );
  return dir;
}

describe('loadFeeds', () => {
  it('has a feed per file in config/feeds, named after the file, with its shape', async () => {
    expect((await loadFeeds()).map(({ name, shape }) => [name, shape])).toEqual(
      [
        [
          'besluiten',
          'https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape',
        ],
        [
          'zittingen',
          'https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape',
        ],
      ],
    );
  });

  it('has the nodes of the feeds, the root first', async () => {
    for (const { nodes } of await loadFeeds()) {
      expect(nodes[0].find('<x>', context)).toBe('VALUES ?s { <x> }');
    }
  });

  it('loads a plain feed file, without imports', async () => {
    const dir = feedDir({
      'plain.js': `export const shape = "http://ex.org/shape";
export function getNodes() { return [{ find: (s) => s, required: ["ex:p"] }]; }
export const memberPattern = "?s a ex:Thing .";
`,
    });

    const [plain] = await loadFeeds(dir);
    expect([
      plain.name,
      plain.shape,
      plain.prefixes,
      plain.nodes[0].optional,
    ]).toEqual(['plain', 'http://ex.org/shape', '', []]);
  });

  it('throws on a feed file that misses a required export, so the service does not start', async () => {
    const dir = feedDir({
      'broken.js': "export const shape = 'http://ex.org/shape';\n",
    });

    await expect(loadFeeds(dir)).rejects.toThrow(
      'config/feeds/broken.js must export memberPattern, getNodes',
    );
  });
});

describe('toFeed', () => {
  it('accepts a valid feed file, with defaults for what is left out', () => {
    expect(
      toFeed('x', valid()).nodes.map((node) => [node.required, node.optional]),
    ).toEqual([
      [['ex:p'], []],
      [[], []],
    ]);
  });

  it('finds a node by its value when it has no find', () => {
    const node = toFeed('x', { ...valid(), getNodes: () => [{}] }).nodes[0];

    expect(node.find('<x>', context)).toBe('VALUES ?s { <x> }');
  });

  it('builds the member from the nodes by default', async () => {
    const quads = on(ex('x/1'), 'http://ex.org/p');
    const { ctx, queries } = fakeContext(quads);

    expect(await toFeed('x', valid()).buildMember(SUBJECT, ctx)).toEqual(quads);
    expect(queries[0]).toContain('VALUES ?p { ex:p }');
  });

  it('uses the buildMember of the feed file when it has one', async () => {
    const quads = on(ex('x/1'), 'http://ex.org/p');

    expect(
      await toFeed('x', {
        ...valid(),
        buildMember: async () => quads,
      }).buildMember(SUBJECT, {}),
    ).toBe(quads);
  });
});

describe('zittingen', () => {
  const required = on(
    ex('x/1'),
    `${BESLUIT}isGehoudenDoor`,
    `${PROV}wasDerivedFrom`,
  );

  it('finds the zittingen among the subjects, in one query', async () => {
    const { ctx, queries } = fakeContext(uris('http://ex.org/x/1'));

    const members = await findMembers(
      ['http://ex.org/x/1', 'http://ex.org/x/2'],
      await feed('zittingen'),
      ctx,
    );

    expect(members).toEqual(['http://ex.org/x/1']);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(`GRAPH ${GRAPH}`);
    expect(queries[0]).toContain(
      'VALUES ?s { <http://ex.org/x/1> <http://ex.org/x/2> }',
    );
    expect(queries[0]).toContain('?s a besluit:Zitting .');
  });

  it('does not query when there are no subjects', async () => {
    const { ctx, queries } = fakeContext();

    expect(await findMembers([], await feed('zittingen'), ctx)).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('reads all the properties of all the nodes, in one query', async () => {
    const quads = [
      ...required,
      ...on(ex('stemming/1'), `${BESLUIT}aantalVoorstanders`),
    ];
    const { ctx, queries } = fakeContext(quads);

    expect(await (await feed('zittingen')).buildMember(SUBJECT, ctx)).toEqual(
      quads,
    );
    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query).toContain(`GRAPH ${GRAPH}`);
    expect(query).toContain(`VALUES ?s { ${SUBJECT} }`);
    expect(query).toContain('besluit:isGehoudenDoor');
    expect(query).toContain(
      'besluit:gevolg prov:wasDerivedFrom besluit:geheim',
    );
    expect(query).toContain(`${SUBJECT} besluit:behandelt ?s .`);
    expect(query).toContain(
      '?behandeling dct:subject ?agendapunt . ?behandeling besluit:heeftStemming ?s .',
    );
    expect(query).toContain('besluit:aantalVoorstanders');
    expect(query).toContain('besluit:heeftNotulen|besluit:heeftBesluitenlijst');
    expect(query).toContain('?behandeling besluit:heeftUittreksel ?s');
  });

  it('only has the public agendapunten, with their behandelingen, stemmingen and uittreksels', async () => {
    const { ctx, queries } = fakeContext(required);

    await (await feed('zittingen')).buildMember(SUBJECT, ctx);
    const [query] = queries;
    const publicAgendapunt = `${SUBJECT} besluit:behandelt ?agendapunt . ?agendapunt besluit:geplandOpenbaar true .`;
    expect(query).toContain(
      `${SUBJECT} besluit:behandelt ?s . ?s besluit:geplandOpenbaar true .`,
    );
    expect(query).toContain(`${publicAgendapunt} ?s dct:subject ?agendapunt .`);
    expect(query).toContain(
      `${publicAgendapunt} ?behandeling dct:subject ?agendapunt . ?behandeling besluit:heeftStemming ?s .`,
    );
    expect(query).toContain(
      `${publicAgendapunt} ?behandeling dct:subject ?agendapunt . ?behandeling besluit:heeftUittreksel ?s`,
    );
    expect(query).toContain(
      `VALUES ?s { ${SUBJECT} } ?s besluit:behandelt ?o . ?o besluit:geplandOpenbaar true .`,
    );
    expect(query.match(/besluit:behandelt(?! \?)/g)).toHaveLength(1);
  });

  it('only reads the resources that have their required properties', async () => {
    const { ctx, queries } = fakeContext(required);

    await (await feed('zittingen')).buildMember(SUBJECT, ctx);
    const [query] = queries;
    // zitting
    expect(query).toContain('FILTER (EXISTS { ?s besluit:isGehoudenDoor [] })');
    // agendapunt
    expect(query).toContain('FILTER (EXISTS { ?s dct:title [] })');
    // behandeling
    expect(query).toContain('FILTER (EXISTS { ?s besluit:openbaar [] })');
    // stemming
    expect(query).toContain('FILTER (EXISTS { ?s besluit:gevolg [] })');
    expect(query.match(/FILTER/g)).toHaveLength(10);
    expect(query.match(/VALUES \?p \{[^}]*\}/)[0]).not.toContain('rdf:type');
  });

  it('is not built when the zitting misses a required property (nothing comes back for it)', async () => {
    const { ctx, queries } = fakeContext(
      on(ex('stemming/1'), `${BESLUIT}gevolg`),
    );

    expect(
      await (await feed('zittingen')).buildMember(SUBJECT, ctx),
    ).toBeNull();
    expect(queries).toHaveLength(1);
  });
});

describe('besluiten', () => {
  const ELI = 'http://data.europa.eu/eli/ontology#';
  const required = on(ex('x/1'), `${RDF}type`, `${PROV}wasDerivedFrom`);

  it('only has the besluiten of a public agendapunt of a published zitting', async () => {
    const { ctx, queries } = fakeContext();

    await findMembers(['http://ex.org/x/1'], await feed('besluiten'), ctx);
    expect(queries[0]).toContain('VALUES ?s { <http://ex.org/x/1> }');
    expect(queries[0]).toContain(
      '?s a besluit:Besluit ; prov:wasGeneratedBy ?behandeling .',
    );
    expect(queries[0]).toContain('?behandeling dct:subject ?agendapunt .');
    expect(queries[0]).toContain('?agendapunt besluit:geplandOpenbaar true .');
    expect(queries[0]).toContain(
      '?zitting besluit:behandelt ?agendapunt ; besluit:isGehoudenDoor ?gd ; prov:wasDerivedFrom ?d .',
    );
  });

  it('builds the member from the besluit and its artikels, in one query', async () => {
    const { ctx, queries } = fakeContext(required);

    expect(await (await feed('besluiten')).buildMember(SUBJECT, ctx)).toEqual(
      required,
    );
    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query).toContain(`${SUBJECT} eli:has_part ?s .`);
    expect(query).toContain('prov:wasGeneratedBy');
    expect(query).not.toContain('besluit:heeftStemming');
    expect(query).toContain('eli:passed_by');
    expect(query).toContain('eli:date_publication');
  });

  it('only reads the besluit and the artikels that have their required properties', async () => {
    const { ctx, queries } = fakeContext(required);

    await (await feed('besluiten')).buildMember(SUBJECT, ctx);
    const [query] = queries;
    expect(query.match(/FILTER/g)).toHaveLength(4);
    expect(query).toContain('FILTER (EXISTS { ?s rdf:type [] })');
    expect(query).toContain('FILTER (EXISTS { ?s prov:value [] })');
    expect(query).toContain(
      'VALUES ?p { rdf:type prov:wasDerivedFrom eli:title eli:description',
    );
    expect(query).toMatch(/VALUES \?p \{[^}]*prov:value/);
  });

  it('is not built when the besluit misses a required property, even if an artikel has it', async () => {
    const { ctx } = fakeContext(on(ex('artikel/1'), `${PROV}value`));

    expect(
      await (await feed('besluiten')).buildMember(SUBJECT, ctx),
    ).toBeNull();
  });
});

describe('context', () => {
  it('turns the ?s ?p ?o bindings of a CONSTRUCT into quads', async () => {
    querySudo.mockResolvedValue({
      results: {
        bindings: [
          {
            s: { type: 'uri', value: 'http://ex.org/s' },
            p: { type: 'uri', value: 'http://ex.org/p' },
            o: { type: 'literal', value: 'o', 'xml:lang': 'nl' },
          },
        ],
      },
    });

    const [quad] = await context.construct('CONSTRUCT ...');

    expect(quad.subject.value).toBe('http://ex.org/s');
    expect(quad.predicate.value).toBe('http://ex.org/p');
    expect(quad.object.language).toBe('nl');
  });

  it('answers a SELECT with its bindings', async () => {
    const bindings = uris('http://ex.org/s');
    querySudo.mockResolvedValue({ results: { bindings } });

    expect(await context.select('SELECT ...')).toEqual(bindings);
  });
});
