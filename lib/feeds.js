import { readdirSync } from "fs";
import { basename, extname, join } from "path";
import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import { FEEDS_DIR, SOURCE_GRAPH, HIGH_LOAD_DATABASE_ENDPOINT } from "../constants";
import { toTerm } from "./utils";

const { namedNode, quad } = DataFactory;

// What every feed file must export.
const REQUIRED_EXPORTS = ["shape", "getNodes", "isMember"];

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

// What the feeds use to query the triplestore.
export const context = createContext({
  graph: sparqlEscapeUri(SOURCE_GRAPH),
  async ask(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.boolean === true;
  },
  // Virtuoso answers a CONSTRUCT with ?s ?p ?o bindings
  async construct(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.results.bindings.map(({ s, p, o }) => quad(toTerm(s), namedNode(p.value), toTerm(o)));
  },
});

// Loads the feeds: one per .js file in config/feeds, named after the file
// (zittingen.js -> <BASE_URL><unit>/zittingen). Throws when a file misses a
// required export, the service does not start then.
export async function loadFeeds(dir = FEEDS_DIR) {
  const files = readdirSync(dir).filter((file) => extname(file) === ".js").sort();
  return Promise.all(files.map(async (file) => toFeed(basename(file, ".js"), await import(join(dir, file)))));
}

// The feed of the exports of a feed file (see the README).
export function toFeed(name, feedFile) {
  const missing = REQUIRED_EXPORTS.filter((key) => !feedFile[key]);
  if (missing.length) throw new Error(`config/feeds/${name}.js must export ${missing.join(", ")}`);

  const { shape, prefixes = "", getNodes, isMember, buildMember } = feedFile;
  const nodes = getNodes().map(({ find, required = [], optional = [], or = [] }) => ({ find, required, optional, or }));
  return {
    name,
    shape,
    prefixes,
    nodes,
    isMember,
    buildMember: buildMember ?? ((subject, context) => context.build(subject, { prefixes, nodes })),
  };
}

// What a feed gets to query the triplestore. `build(subject, { prefixes, nodes })`
// returns the quads of the member, or null when its root (the first node)
// misses one of its required properties (or all the properties of an sh:or).
export function createContext({ graph, ask, construct }) {
  return {
    graph,
    ask,
    construct,
    async build(subject, member) {
      const required = await construct(propertiesQuery(subject, graph, member, "required"));
      if (!required.some((quad) => `<${quad.subject.value}>` === subject)) return null;
      return [...required, ...(await construct(propertiesQuery(subject, graph, member, "optional")))];
    },
  };
}

// One CONSTRUCT for the `required` (or `optional`) properties of all the
// nodes of a member: a UNION of one block per node. In the required query the
// root only matches when it has all its required properties and one property
// of each sh:or group, so it returns nothing for the root otherwise. The
// properties of an sh:or are only checked here, they are read as optional.
export function propertiesQuery(subject, graph, { prefixes, nodes }, kind) {
  const branches = nodes
    .filter((node) => node[kind].length)
    .map(
      (node) => `{
      ${node.find(subject)}
      ${kind === "required" && node === nodes[0] ? rootFilters(node) : ""}
      VALUES ?p { ${node[kind].join(" ")} }
      ?s ?p ?o .
    }`,
    );
  return `${prefixes}
CONSTRUCT { ?s ?p ?o } WHERE {
  GRAPH ${graph} {
    ${branches.join("\n    UNION\n    ")}
  }
}`;
}

// The FILTERs on the root: its required properties and its sh:or groups.
function rootFilters(root) {
  return [...root.required, ...root.or].map(exists).join("\n      ");
}

// A FILTER that the node has at least one of the properties: one property for
// a `required` one (sh:minCount 1), several for an `or` group (sh:or).
function exists(properties) {
  return `FILTER (${[properties].flat().map((p) => `EXISTS { ?s ${p} [] }`).join(" || ")})`;
}
