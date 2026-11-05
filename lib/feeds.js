import { readdirSync } from "fs";
import { basename, extname, join } from "path";
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
 * One feed per .js file in config/feeds, named after the file (zittingen.js ->
 * <BASE_URL><unit>/zittingen). A feed file exports `shape` (the tree:shape of
 * the stream), `isMember(subject, ctx)` and `buildMember(subject, ctx)`.
 * The folder follows the /config convention of mu-javascript-template: mount
 * /config/feeds to override or add feeds, they are transpiled with the service on start.
 */
export async function loadFeeds(dir = FEEDS_DIR) {
  const files = readdirSync(dir).filter((file) => extname(file) === ".js").sort();
  return Promise.all(
    files.map(async (file) => ({
      name: basename(file, ".js"),
      ...(await import(join(dir, file))),
    })),
  );
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
