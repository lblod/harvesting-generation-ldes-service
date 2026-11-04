import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { Store, DataFactory } from "n3";
import {
  PREFIXES,
  SOURCE_GRAPH,
  HIGH_LOAD_DATABASE_ENDPOINT,
} from "../constants";
import { pathStep } from "./shapes";
import { chunk, toTerm, valuesClause } from "./utils";
const { namedNode, quad } = DataFactory;

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

async function select(queryStr) {
  const result = await query(queryStr, {}, connectionOptions);
  return result.results.bindings;
}

// The members (of the given feed) that contain one of the given resources.
export async function findRoots(uris, feed) {
  const upward = feed.shape.paths
    .filter(({ steps }) => steps.length)
    .map(({ steps }) => `(${steps.map((step) => pathStep(step, true)).reverse().join("/")})`)
    .join("|");
  const roots = new Set();
  for (const nodes of chunk(uris, 100)) {
    const rows = await select(`
      ${PREFIXES}
      SELECT DISTINCT ?root WHERE {
        GRAPH ${sparqlEscapeUri(SOURCE_GRAPH)} {
          ${valuesClause("node", nodes)}
          ?node (${upward})? ?root .
          ?root a ${sparqlEscapeUri(feed.rootClass)} .
        }
      }`);
    rows.forEach((row) => roots.add(row.root.value));
  }
  return [...roots];
}

/**
 * Reads the data of each root: for the root and every nested shape the
 * properties of the shape, of the resources found along its path.
 * Returns a Map of root uri -> N3 Store.
 */
export async function fetchMembers(roots, shape) {
  const stores = new Map(roots.map((root) => [root, new Store()]));
  for (const { steps, predicates } of shape.paths) {
    const rows = await select(`
      SELECT ?root ?s ?p ?o WHERE {
        GRAPH ${sparqlEscapeUri(SOURCE_GRAPH)} {
          ${valuesClause("root", roots)}
          ${steps.length ? `?root ${steps.map((step) => pathStep(step)).join("/")} ?s .` : "BIND(?root AS ?s)"}
          ${valuesClause("p", [...predicates])}
          ?s ?p ?o .
        }
      }`);
    for (const row of rows) {
      stores
        .get(row.root.value)
        .addQuad(quad(namedNode(row.s.value), namedNode(row.p.value), toTerm(row.o)));
    }
  }
  return stores;
}
