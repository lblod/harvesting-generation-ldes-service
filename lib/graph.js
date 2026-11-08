import { sparqlEscapeUri } from 'mu';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { StreamParser } from 'n3';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import {
  PREFIXES,
  DEFAULT_GRAPH,
  HIGH_LOAD_DATABASE_ENDPOINT,
  BATCH_SIZE,
} from '../constants';

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

// Paths of the files with the given name, produced by the tasks of the job.
export async function getFilePaths(fileName, task) {
  const limit = BATCH_SIZE;
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
    paths.push(
      ...rows.map((row) => row.path.value.replace('share://', '/share/')),
    );
    if (rows.length < limit) return paths;
  }
}
export async function getSubjectsInFile(path) {
  const subjects = new Set();

  await pipeline(
    createReadStream(path),
    ...(path.endsWith('.gz') ? [createGunzip()] : []),
    new StreamParser(),
    async function (quads) {
      for await (const quad of quads) {
        if (quad.subject.termType === 'NamedNode')
          subjects.add(quad.subject.value);
      }
    },
  );

  return subjects;
}
