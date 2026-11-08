# harvesting-generation-ldes-service

Publishes the harvested data as [LDES](https://semiceu.github.io/LinkedDataEventStreams/) feeds, using
[ldes-producer](https://github.com/lblod/ldes-producer). It runs as the `gen-ldes` task of a harvesting job.

Each administrative unit gets two feeds:

- `<BASE_URL><unit>/zittingen`: one member per zitting, with its agendapunten, behandelingen, stemmingen and documents
- `<BASE_URL><unit>/besluiten`: one member per besluit, with its artikels

`<unit>` is the last part of the URI of the administrative unit. Both feeds point to their SHACL shape with
`tree:shape` (`shapes/meeting-ldes.ttl` and `shapes/decision-ldes.ttl`), consumers can use it to extract the members.

## How it works

1. The task reads which subjects changed in the job (`new-insert-triples.ttl` and `to-remove-triples.ttl`).
2. Each feed checks which of those subjects are its members.
3. For each member it builds the member from the public graph and adds it as a new version to the feed.

A few things to know:

- Only public agendapunten (`besluit:geplandOpenbaar true`) are published, in both feeds.
- Behandelingen and stemmingen are in the zittingen feed. A besluit links to its behandeling with
  `prov:wasGeneratedBy`, so to get a decision with its votes you join the two feeds on the behandeling.
- Only the member is versioned, not the resources nested in it. Replace the whole member when you read a new version.
- Members that are removed are not marked as deleted in the feed (yet).

## Feeds

The feeds are the `.js` files in `config/feeds`, the name of the file is the name of the feed. You can mount your own
folder on `/config/feeds` to change a feed or add one.

Because the folder can be mounted, a feed file has no imports: the service gives it what it needs (`ask`, `construct`,
`build`, `graph`) in the context. A feed file exports:

```js
export const shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape"; // tree:shape of the feed
export const prefixes = `PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>`;   // optional

// the nodes of the shape, the member (root) first
export function getNodes() {
  return NODES;
}

// whether the subject is a member of this feed
export async function isMember(subject, { ask, graph }) {
  return ask(`${prefixes} ASK { GRAPH ${graph} { ${subject} a besluit:Zitting } }`);
}

// optional: build the member yourself (quads, or null to skip it)
// export async function buildMember(subject, { build, construct }) { ... }
```

A node is one resource in the member:

```js
{
  find: (s) => `${s} besluit:behandelt ?s .`, // how to get to it (?s) from the member
  required: ["dct:title"],                    // sh:minCount 1 in the shape
  optional: ["dct:description"],              // the other properties in the shape
  or: [["eli:title", "eli:description"]],     // only on the root: sh:or, it needs at least one of them
}
```

A member is skipped when it misses one of its `required` properties, or has none of an `or` group.

The feeds are loaded when the service starts. If a feed file misses `shape`, `getNodes` or `isMember`, the service
does not start and tells you which file misses what.

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
      # optional, your own feeds
      - ./config/ldes-feeds:/config/feeds
```

You also need a delta-notifier rule for the scheduled tasks (`http://harvest_gen_ldes/delta`), the task in the
job-controller config (`http://lblod.data.gift/id/jobs/concept/TaskOperation/gen-ldes`) and a dispatcher rule for
`BASE_URL`.

### Environment variables

The [ldes-producer ones](https://github.com/lblod/ldes-producer#configuration) (`BASE_URL` is required and ends with a
`/`), and:

| Variable | Default | |
| --- | --- | --- |
| `HIGH_LOAD_DATABASE_ENDPOINT` | `http://database:8890/sparql` | |
| `DEFAULT_GRAPH` | `http://mu.semte.ch/graphs/harvesting` | graph with the jobs and their files |
| `SOURCE_GRAPH` | `http://mu.semte.ch/graphs/public` | graph with the published data |
| `BUFFER_SIZE` | `1000` | lines of the diff files read at once |
| `BATCH_SIZE` | `10` | members built and written at once, keep the queries under the row limit of Virtuoso (10000) |

### Endpoints

- `POST /delta`: for the delta-notifier
- `GET /:unit/:feed/:page`: the pages of a feed, `/:unit/:feed` redirects to the first page

## Tests

`npm test`. No triplestore needed, the SPARQL answers are mocked.
