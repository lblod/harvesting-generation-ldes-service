import { sparqlEscapeUri } from "mu";
import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import readline from "readline";
import { Parser } from "n3";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import {
  PREFIXES,
  BUFFER_SIZE,
  DEFAULT_GRAPH,
  HIGH_LOAD_DATABASE_ENDPOINT,
} from "../constants";

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

// Paths of the files with the given name, produced by the tasks of the job.
export async function getFilePaths(fileName, task) {
  const limit = 1000;
  const paths = [];
  for (let offset = 0; ; offset += limit) {
    const result = await query(
      `
      ${PREFIXES}
      SELECT DISTINCT ?path WHERE {
        GRAPH <${DEFAULT_GRAPH}> {
          ${sparqlEscapeUri(task.task)}
            a task:Task ;
            dct:isPartOf ?job.
          ?job ^dct:isPartOf ?tasks.
          ?tasks task:inputContainer ?inputContainer .

          ?inputContainer
            a nfo:DataContainer ;
            task:hasFile ?logicalFile .

          ?logicalFile
            a nfo:FileDataObject ;
            nfo:fileName ?fileName .

          ?path
            a nfo:FileDataObject ;
            nie:dataSource ?logicalFile .
          filter (?fileName in ("${fileName}", "${fileName}.gz"))
        }
      } ORDER BY ?path LIMIT ${limit} OFFSET ${offset}`,
      {},
      connectionOptions,
    );
    const rows = result.results.bindings;
    paths.push(...rows.map((row) => row.path.value.replace("share://", "/share/")));
    if (rows.length < limit) return paths;
  }
}

// Subjects of all triples in a file. Assumes one triple per line (N-Triples).
export async function getSubjectsInFile(path) {
  let fileStream = createReadStream(path);
  if (path.endsWith("gz")) {
    fileStream = fileStream.pipe(createGunzip());
  }
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  const subjects = new Set();
  const addSubjects = (lines) => {
    for (const quad of new Parser().parse(lines.join("\n"))) {
      if (quad.subject.termType === "NamedNode") subjects.add(quad.subject.value);
    }
  };
  let buffer = [];
  for await (const line of rl) {
    buffer.push(line);
    if (buffer.length === BUFFER_SIZE) {
      addSubjects(buffer);
      buffer = [];
    }
  }
  addSubjects(buffer);
  return subjects;
}
