export const TASK_GENERATING_LDES =
  "http://lblod.data.gift/id/jobs/concept/TaskOperation/gen-ldes";

export const STATUS_BUSY =
  "http://redpencil.data.gift/id/concept/JobStatus/busy";
export const STATUS_SCHEDULED =
  "http://redpencil.data.gift/id/concept/JobStatus/scheduled";
export const STATUS_SUCCESS =
  "http://redpencil.data.gift/id/concept/JobStatus/success";
export const STATUS_FAILED =
  "http://redpencil.data.gift/id/concept/JobStatus/failed";

export const TASK_TYPE = "http://redpencil.data.gift/vocabularies/tasks/Task";
export const ERROR_TYPE = "http://open-services.net/ns/core#Error";
export const ERROR_URI_PREFIX = "http://redpencil.data.gift/id/jobs/error/";

export const PREFIXES = `
  PREFIX terms: <http://purl.org/dc/terms/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX oslc: <http://open-services.net/ns/core#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
`;

// files produced by the diff step, used to find out what changed in this job
export const DIFF_FILE_NAMES = ["new-insert-triples.ttl", "to-remove-triples.ttl"];

export const HIGH_LOAD_DATABASE_ENDPOINT =
  process.env.HIGH_LOAD_DATABASE_ENDPOINT || "http://database:8890/sparql";
export const DEFAULT_GRAPH =
  process.env.DEFAULT_GRAPH || "http://mu.semte.ch/graphs/harvesting";
export const SOURCE_GRAPH =
  process.env.SOURCE_GRAPH || "http://mu.semte.ch/graphs/public";
// the service runs from the transpiled sources, config/ included
export const FEEDS_DIR = `${process.cwd()}/config/feeds`;

export const BUFFER_SIZE = parseInt(process.env.BUFFER_SIZE || "1000");
export const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10");
