import { readdirSync } from "fs";
import { basename, join, resolve } from "path";
import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import { FEEDS_DIR, SOURCE_GRAPH, HIGH_LOAD_DATABASE_ENDPOINT } from "../constants";
import { toTerm } from "./utils";
const { namedNode, quad } = DataFactory;

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

/**
 * One feed per .js file in FEEDS_DIR, named after the file (zittingen.js ->
 * <BASE_URL><unit>/zittingen). A feed file exports `shape` (the tree:shape of
 * the stream), `isMember(subject, ctx)` and `buildMember(subject, ctx)`.
 * The files are read again on every call, so a mounted folder can be edited at runtime.
 */
export function loadFeeds(dir = FEEDS_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .sort()
    .map((file) => {
      const path = resolve(join(dir, file));
      delete require.cache[path];
      return { name: basename(file, ".js"), ...require(path) };
    });
}

// What a feed file gets to query the triplestore.
export const context = {
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
};
