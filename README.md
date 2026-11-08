# harvesting-generation-ldes-service

Publishes the harvested data as [LDES](https://semiceu.github.io/LinkedDataEventStreams/) feeds with
[ldes-producer](https://github.com/lblod/ldes-producer). Runs as the `gen-ldes` task of a harvesting job.

Each administrative unit gets two feeds:

- `<BASE_URL><unit>/zittingen`: a zitting with its agendapunten, behandelingen, stemmingen and documents
- `<BASE_URL><unit>/besluiten`: a besluit with its artikels, linked to its behandeling with `prov:wasGeneratedBy`

Only public agendapunten are published. The members follow the shapes in `shapes/`, which the feeds point to with
`tree:shape`.

## Feeds

A feed is a file in `config/feeds`. Mount your own folder on `/config/feeds` to change or add one. A feed file has no
imports and exports:

- `shape`: the `tree:shape` of the feed
- `rdfType`: the type of its members. When a member loses this type, a tombstone is added to the feed
- `prefixes` (optional): the prefixes of its queries
- `memberPattern`: the triple patterns a member `?s` matches, e.g. `?s a besluit:Zitting .`
- `getNodes()`: the resources in a member, the member itself first. Each is
  `{ find, required, optional }`: how to find it from the member (by default the member itself), and its properties

A member is skipped when it misses a `required` property, a resource in it that misses one is left out. The service doesn't start when a feed file misses one of
the exports.

## Usage

```yml
harvest_gen_ldes:
  image: lblod/harvesting-generation-ldes-service
  environment:
    BASE_URL: 'http://localhost/ldes/'
  volumes:
    - ./data/files:/share
    - ./data/ldes:/data
    - ./config/ldes-feeds:/config/feeds # optional
```

Environment variables, besides the [ldes-producer ones](https://github.com/lblod/ldes-producer#configuration):

- `HIGH_LOAD_DATABASE_ENDPOINT` (`http://database:8890/sparql`)
- `DEFAULT_GRAPH` (`http://mu.semte.ch/graphs/harvesting`): the jobs and their files
- `SOURCE_GRAPH` (`http://mu.semte.ch/graphs/public`): the published data
- `BATCH_SIZE` (`10`)

Pages are served on `GET /:unit/:feed/:page`.

## Tests

`npm test`
