import { readdirSync } from "fs";
import { basename, extname, join } from "path";
import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import { FEEDS_DIR, SOURCE_GRAPH, HIGH_LOAD_DATABASE_ENDPOINT } from "../constants";
import { toTerm } from "./utils";
import { Feed } from "./feed";
const { namedNode, quad } = DataFactory;

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

/**
 * One feed per .js file in config/feeds, named after the file (zittingen.js ->
 * <BASE_URL><unit>/zittingen). A feed file default-exports an instance of a
 * subclass of Feed (lib/feed.js).
 * The folder follows the /config convention of mu-javascript-template: mount
 * /config/feeds to override or add feeds, they are transpiled with the service on start.
 */
export async function loadFeeds(dir = FEEDS_DIR) {
  const files = readdirSync(dir).filter((file) => extname(file) === ".js").sort();
  return Promise.all(
    files.map(async (file) => {
      const { default: feed } = await import(join(dir, file));
      if (!(feed instanceof Feed)) {
        throw new Error(`config/feeds/${file} must default-export an instance of a subclass of Feed (lib/feed.js)`);
      }
      if (!feed.shape) throw new Error(`config/feeds/${file}: the feed has no shape`);
      feed.name = basename(file, ".js");
      return feed;
    }),
  );
}

// A FILTER that the node has at least one of the properties: one property for
// a `required` one (sh:minCount 1), several for an `or` group (sh:or).
const exists = (properties) => `FILTER (${[properties].flat().map((p) => `EXISTS { ?s ${p} [] }`).join(" || ")})`;

// The FILTERs on the root: its required properties and its sh:or groups.
const rootFilters = (root) => [...root.required, ...(root.or || [])].map(exists).join("\n      ");

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

// What a feed file gets to query the triplestore. `build(subject, { prefixes, nodes })`
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

export const context = createContext({
  graph: sparqlEscapeUri(SOURCE_GRAPH),
  async ask(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.boolean === true;
  },
  // Virtuoso answers a CONSTRUCT with ?s ?p ?o bindings
  async construct(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.results.bindings.map(({ s, p, o }) =>
      quad(toTerm(s), namedNode(p.value), toTerm(o)),
    );
  },
});
