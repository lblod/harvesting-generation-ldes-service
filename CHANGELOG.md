# Changelog

## Unreleased

### LDES feeds for zittingen and besluiten

Two LDES feeds per bestuur, one for the meetings and one for the decisions. Both point to their shacl shape so
consumers know what a member contains.

- **zittingen**: a zitting with its agendapunten, behandelingen, stemmingen and documents
- **besluiten**: a besluit with its artikels, linked to its behandeling in the zittingen feed

#### How it works

- the feeds are described in `config/feeds` (can be mounted) and follow the shapes
- only public agendapunten are published
- a member that misses something the shape requires is not published, an incomplete part of it is left out

#### Shape changes

Without these we wouldn't publish anything for e.g `raadpleeg-ham`:

- the text of a besluit is optional, only the besluiten coming from an uittreksel have it
- the location of a zitting is text, not a link

#### What's left

- update the shacl profile for the filter step with the new shape (just a config change in the harvester)
- add an enrichment step to fill in what publishers leave out (to run before the filter step)
- data cleanup 
- removed members are marked as tombstone
