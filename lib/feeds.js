import { readdirSync } from 'fs';
import { basename, extname, join } from 'path';
import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import { DataFactory } from 'n3';
import {
  FEEDS_DIR,
  SOURCE_GRAPH,
  HIGH_LOAD_DATABASE_ENDPOINT,
} from '../constants';
import { toTerm } from './utils';

const REQUIRED_EXPORTS = ['shape', 'rdfType', 'memberPattern', 'getNodes'];

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

export const context = {
  graph: sparqlEscapeUri(SOURCE_GRAPH),
  findByValue,
  select,
  construct,
};

async function select(queryString) {
  const result = await query(queryString, {}, connectionOptions);
  return result.results.bindings;
}

async function construct(queryString) {
  const result = await query(queryString, {}, connectionOptions);
  return result.results.bindings.map((binding) =>
    DataFactory.quad(
      toTerm(binding.s),
      DataFactory.namedNode(binding.p.value),
      toTerm(binding.o),
    ),
  );
}

export async function loadFeeds(dir = FEEDS_DIR) {
  const files = readdirSync(dir)
    .filter((file) => extname(file) === '.js')
    .sort();

  const feeds = [];
  for (const file of files) {
    const feedFile = await import(join(dir, file));
    feeds.push(toFeed(basename(file, '.js'), feedFile));
  }
  return feeds;
}

export function toFeed(name, feedFile) {
  const missing = REQUIRED_EXPORTS.filter((key) => !feedFile[key]);
  if (missing.length) {
    throw new Error(
      `config/feeds/${name}.js must export ${missing.join(', ')}`,
    );
  }

  const prefixes = feedFile.prefixes || '';
  const memberPattern = feedFile.memberPattern;
  const nodes = feedFile.getNodes().map((node) => ({
    find: node.find || ((subject, context) => context.findByValue(subject)),
    required: node.required || [],
    optional: node.optional || [],
  }));

  return {
    name,
    shape: feedFile.shape,
    rdfType: feedFile.rdfType,
    prefixes,
    memberPattern,
    nodes,
    buildMember:
      feedFile.buildMember ||
      ((subject, context) => build(subject, { prefixes, nodes }, context)),
  };
}

export async function findMembers(subjects, feed, context) {
  if (!subjects.length) return [];
  const values = subjects.map((subject) => sparqlEscapeUri(subject));
  const bindings = await context.select(`${feed.prefixes}
          SELECT DISTINCT ?s WHERE {
            GRAPH ${context.graph} {
              ${findByValue(...values)}
              ${feed.memberPattern}
            }
          }`);
  return bindings.map((binding) => binding.s.value);
}

export function findByValue(...values) {
  return `VALUES ?s { ${values.join(' ')} }`;
}

export async function build(subject, member, context) {
  const quads = await context.construct(
    propertiesQuery(subject, member, context),
  );
  const memberFound = quads.some(
    (quad) => `<${quad.subject.value}>` === subject,
  );
  return memberFound ? quads : null;
}

export function propertiesQuery(subject, member, context) {
  const branches = member.nodes.map(
    (node) => `{
      ${node.find(subject, context)}
      ${requiredFilters(node.required)}
      VALUES ?p { ${[...node.required, ...node.optional].join(' ')} }
      ?s ?p ?o .
    }`,
  );

  return `${member.prefixes}
          CONSTRUCT { ?s ?p ?o } WHERE {
            GRAPH ${context.graph} {
              ${branches.join('\n    UNION\n    ')}
            }
          }`;
}

function requiredFilters(required) {
  return required
    .map((property) => `FILTER (EXISTS { ?s ${property} [] })`)
    .join('\n');
}
