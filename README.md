# harvesting-generation-ldes-service

Generates [LDES](https://semiceu.github.io/LinkedDataEventStreams/) feeds from the harvested data, using
[ldes-producer](https://github.com/lblod/ldes-producer). It runs as the `gen-ldes` task, after the publish step
(see [import-with-sameas-service](https://github.com/lblod/import-with-sameas-service)) and `generatingDelta`.

For each administrative unit (the `dct:subject` of the job) it maintains two streams:

| Stream | Member | Nested resources in the member |
| --- | --- | --- |
| `<BASE_URL><unit>/zittingen` | `besluit:Zitting` | agendapunten, behandelingen, stemmingen, notulen / besluitenlijst / zittingsverslag / uittreksels |
| `<BASE_URL><unit>/besluiten` | `besluit:Besluit` | artikels |

`<unit>` is the last segment of the URI of the administrative unit. Both streams advertise their SHACL shape with
`tree:shape` (`shapes/meeting-ldes.ttl`, `shapes/decision-ldes.ttl`; the service does not read these files, they are
the shapes consumers use for member extraction).

## How it works

1. The task's input is the diff of the job (`new-insert-triples.ttl` and `to-remove-triples.ttl`).
2. Every subject of these files is passed to every feed. A feed keeps the subjects of its type (an `ASK` query).
3. For each of these members the feed builds the member (`CONSTRUCT` queries, one per node of the shape) and it is
   added as a new version to the stream.

### Feeds

A feed is a `.js` file in `config/feeds`, named after the stream (`config/feeds/zittingen.js`,
`config/feeds/besluiten.js`). It exports:

```js
export const shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape"; // tree:shape of the stream
export async function isMember(subject, { ask, graph }) { ... }        // -> boolean
export async function buildMember(subject, { build }) { ... }          // -> array of quads, or null
```

`subject` and `graph` are escaped SPARQL IRIs (`<...>`). `ask(query)` returns a boolean, `construct(query)` the
quads. `build(subject, { prefixes, nodes })` builds the member from the nodes of the shape (`{ find, required,
optional }`, the root first) with one query for the required and one for the optional properties; it returns null
when the root misses a required property. As in other mu-javascript-template services, mount a folder on `/config/feeds` to override a feed (same file
name) or add one (new file = new stream); the service is transpiled again with it when the container starts.

### Cutoff between the feeds

Behandelingen and stemmingen live in the zittingen feed. A besluit only links to its behandeling with
`prov:wasGeneratedBy`; consumers that want a decision with its votes join the two feeds on the behandeling IRI.

### Things to know

- Nested resources are not versioned separately, only the member is. Consumers should replace the whole member per
  version. Mind that two versions of the same member in one page share the IRIs (and thus the triples) of their nested
  resources.
- Removed members are not marked as deleted in the stream.

## Usage

```yml
  harvest_gen_ldes:
    image: lblod/harvesting-generation-ldes-service
    environment:
      BASE_URL: "http://localhost/ldes/"
      HIGH_LOAD_DATABASE_ENDPOINT: "http://virtuoso:8890/sparql"
    volumes:
      - ./data/files:/share
      - ./data/ldes:/data
      # optional, to override or add feeds without a new image
      - ./config/ldes-feeds:/config/feeds
```

Add the usual delta-notifier rule (scheduled tasks, `http://harvest_gen_ldes/delta`), the task to the job-controller
config (`http://lblod.data.gift/id/jobs/concept/TaskOperation/gen-ldes`) and a dispatcher rule for `BASE_URL`.

## Tests

`npm test` (jest, with [tortank](https://github.com/nbittich/tortank) to compare turtle, as in
[test-suites](https://github.com/nbittich/test-suites)). They need no triplestore: the SPARQL answers are mocked.

- `feeds.test.js`: the feeds found in `config/feeds`, and the queries they send.
- `pipeline.test.js`: subjects are filtered by the feed, members are built and added.
- `ldes.test.js`: the page written by ldes-producer, with the shape and the nested resources (`test/examples/ldes`).

## Endpoints

- `POST /delta`: delta-notifier entry point.
- `GET /:unit/:feed/:nodeId`: pages of the stream (`feed` is `zittingen` or `besluiten`), `/:unit/:feed` redirects to page 1.

## Environment variables

Besides the [ldes-producer ones](https://github.com/lblod/ldes-producer#configuration) (`BASE_URL` is required, and
must end with a `/`; `LDES_STREAM_PREFIX` defaults to `BASE_URL`; `PAGE_RESOURCES_COUNT`, `DATA_FOLDER`, ...):

`HIGH_LOAD_DATABASE_ENDPOINT: "http://database:8890/sparql"`
`DEFAULT_GRAPH: "http://mu.semte.ch/graphs/harvesting"`: graph with the job and the files of the tasks.
`SOURCE_GRAPH: "http://mu.semte.ch/graphs/public"`: graph with the published data.
`BUFFER_SIZE: "1000"`: number of lines of the diff files handled at once.
`BATCH_SIZE: "10"`: number of members read and written at once. Keep it low enough for a query to stay below the row limit of the triplestore (10000 for Virtuoso).
