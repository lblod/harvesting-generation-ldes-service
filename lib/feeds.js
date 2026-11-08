import { readdirSync } from "fs";
import { basename, extname, join } from "path";
import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import { FEEDS_DIR, SOURCE_GRAPH, HIGH_LOAD_DATABASE_ENDPOINT } from "../constants";
import { toTerm } from "./utils";

const { namedNode, quad } = DataFactory;

const REQUIRED_EXPORTS = ["shape", "getNodes", "isMember"];

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

export const context = createContext({
  graph: sparqlEscapeUri(SOURCE_GRAPH),
  async ask(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.boolean === true;
  },
  async construct(queryStr) {
    const result = await query(queryStr, {}, connectionOptions);
    return result.results.bindings.map(({ s, p, o }) => quad(toTerm(s), namedNode(p.value), toTerm(o)));
  },
});

// One feed per file in config/feeds. Throws (and the service doesn't start) when a file misses an export.
export async function loadFeeds(dir = FEEDS_DIR) {
  const files = readdirSync(dir).filter((file) => extname(file) === ".js").sort();
  return Promise.all(files.map(async (file) => toFeed(basename(file, ".js"), await import(join(dir, file)))));
}

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

export function createContext({ graph, ask, construct }) {
  return {
    graph,
    ask,
    construct,
    // The quads of the member, or null when the member misses a required property.
    async build(subject, member) {
      const required = await construct(propertiesQuery(subject, graph, member, "required"));
      if (!required.some((quad) => `<${quad.subject.value}>` === subject)) return null;
      return [...required, ...(await construct(propertiesQuery(subject, graph, member, "optional")))];
    },
  };
}

// The required (or optional) properties of all the nodes of a member. The
// member itself only matches when it has all its required properties.
export function propertiesQuery(subject, graph, { prefixes, nodes }, kind) {
  const branches = nodes
    .filter((node) => node[kind].length)
    .map(
      (node) => `{
      ${node.find(subject)}
      ${kind === "required" && node === nodes[0] ? requiredFilters(node) : ""}
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

// One FILTER per required property, and per `or` group (one of its properties is enough).
function requiredFilters({ required, or }) {
  return [...required.map((property) => [property]), ...or]
    .map((group) => `FILTER (${group.map((property) => `EXISTS { ?s ${property} [] }`).join(" || ")})`)
    .join("\n      ");
}
