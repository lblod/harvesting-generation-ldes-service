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
`config/feeds/besluiten.js`). It default-exports an instance of a subclass of `Feed` (`lib/feed.js`):

```js
import { Feed } from "../../lib/feed";

class Zittingen extends Feed {
  shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape"; // tree:shape of the stream (required)
  prefixes = PREFIXES; // PREFIX declarations of the queries
  nodes = NODES;       // the nodes of the shape, the root first
  async isMember(subject, { ask, graph }) { ... } // -> boolean (required)
  // buildMember(subject, { build }) -> array of quads, or null: by default built from `nodes`
}

export default new Zittingen();
```

`subject` and `graph` are escaped SPARQL IRIs (`<...>`). The context gives `ask(query)` (a boolean),
`construct(query)` (the quads) and `build(subject, { prefixes, nodes })`. A node is `{ find, required, optional, or }`:
`find(subject)` binds `?s` to the node from the root, `required` are the properties with `sh:minCount 1`, `optional`
the others, and `or` (root only) the `sh:or` groups of which the root needs at least one property (e.g.
`or: [["eli:title", "eli:description"]]`; they are only checked, list them in `required` or `optional` as their own
`sh:minCount` says). `build` reads the required and then the optional properties of all the nodes, one query each,
and returns null when the root misses a required property or an `or` group. Override `buildMember` for anything the
nodes cannot express. As in other mu-javascript-template services, mount a folder on `/config/feeds` to override a
feed (same file name) or add one (new file = new stream); the service is transpiled again with it when the container
starts.

Both feeds only publish the public agendapunten (`besluit:geplandOpenbaar true`): the zittingen with only their public
agendapunten (and their behandelingen, stemmingen and uittreksels), and the besluiten of a public agendapunt of a
published zitting, so a besluit always links to a behandeling that is in the zittingen feed.

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
