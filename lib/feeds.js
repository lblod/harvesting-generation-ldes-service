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

const REQUIRED_EXPORTS = ['shape', 'getNodes', 'isMember'];

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

export const context = {
  graph: sparqlEscapeUri(SOURCE_GRAPH),
  async ask(queryString) {
    const result = await query(queryString, {}, connectionOptions);
    return result.boolean === true;
  },
  async construct(queryString) {
    const result = await query(queryString, {}, connectionOptions);
    return result.results.bindings.map((binding) =>
      DataFactory.quad(
        toTerm(binding.s),
        DataFactory.namedNode(binding.p.value),
        toTerm(binding.o),
      ),
    );
  },
};

// One feed per file in config/feeds. Throws when a file misses an export.
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
  const nodes = feedFile.getNodes().map((node) => ({
    find: node.find,
    required: node.required || [],
    optional: node.optional || [],
    or: node.or || [],
  }));

  return {
    name,
    shape: feedFile.shape,
    prefixes,
    nodes,
    isMember: feedFile.isMember,
    buildMember:
      feedFile.buildMember ||
      ((subject, context) => build(subject, { prefixes, nodes }, context)),
  };
}

// The quads of the member, or null when the member misses a required property.
export async function build(subject, member, context) {
  const requiredQuery = propertiesQuery(
    subject,
    context.graph,
    member,
    'required',
  );
  const required = await context.construct(requiredQuery);

  const memberFound = required.some(
    (quad) => `<${quad.subject.value}>` === subject,
  );
  if (!memberFound) return null;

  const optionalQuery = propertiesQuery(
    subject,
    context.graph,
    member,
    'optional',
  );
  const optional = await context.construct(optionalQuery);

  return [...required, ...optional];
}

// The required (or optional) properties of all the nodes of a member. The
// member itself only matches when it has all its required properties.
export function propertiesQuery(subject, graph, member, kind) {
  const root = member.nodes[0];
  const branches = member.nodes
    .filter((node) => node[kind].length)
    .map((node) => {
      const filters =
        kind === 'required' && node === root ? requiredFilters(node) : '';
      return `{
      ${node.find(subject)}
      ${filters}
      VALUES ?p { ${node[kind].join(' ')} }
      ?s ?p ?o .
    }`;
    });

  return `${member.prefixes}
          CONSTRUCT { ?s ?p ?o } WHERE {
            GRAPH ${graph} {
              ${branches.join('\n    UNION\n    ')}
            }
          }`;
}

// One FILTER per required property, and per `or` group (one of its properties is enough).
function requiredFilters(node) {
  const groups = [...node.required.map((property) => [property]), ...node.or];
  return groups
    .map((group) => {
      const exists = group.map((property) => `EXISTS { ?s ${property} [] }`);
      return `FILTER (${exists.join(' || ')})`;
    })
    .join('\n');
}
