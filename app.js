import { app, errorHandler } from 'mu';

import bodyParser from 'body-parser';
import { ACCEPTED_CONTENT_TYPES, getNode } from '@lblod/ldes-producer';
import { run } from './lib/pipeline-generating-ldes';
import { Delta } from './lib/delta';
import { config } from './lib/ldes';
import { failBusyTasks } from './lib/task';
import { loadFeeds } from './lib/feeds';
import { STATUS_SCHEDULED } from './constants';

// Load the feeds (config/feeds, can be mounted) first: when one is not valid
// this throws and the service does not start.
const feeds = await loadFeeds();
console.log(`Loaded the feeds: ${feeds.map(({ name }) => name).join(', ')}`);

failBusyTasks();

app.use(bodyParser.json({
  type: function(req) {
    return /^application\/json/.test(req.get('content-type'));
  }
}));

app.get('/', function(_, res) {
  res.send('Hello harvesting-gen-ldes-service');
});

app.post('/delta', async function(req, res, next) {
  try {
    const entries = new Delta(req.body).getInsertsFor('http://www.w3.org/ns/adms#status', STATUS_SCHEDULED);
    if (!entries.length) {
      console.log('Delta did not contain potential tasks that are ready for generating ldes, awaiting the next batch!');
      return res.status(204).send();
    }
    for (let entry of entries) {
      // NOTE: we don't wait as we do not want to keep hold off the connection.
      run(entry, feeds);
    }
    return res.status(200).send().end();
  } catch (e) {
    console.log(`Something unexpected went wrong while handling delta harvesting-tasks!`);
    console.error(e);
    return next(e);
  }
});

// The LDES pages: /:unit/:feed/:nodeId, with the unit being the uuid of the administrative unit.
app.get('/:unit/:feed/:nodeId?', async function(req, res, next) {
  const { unit, feed, nodeId } = req.params;
  if (!/^[\w-]+$/.test(unit) || !/^[\w-]+$/.test(feed) || (nodeId && !/^\d+$/.test(nodeId))) {
    return res.status(404).send();
  }
  if (!nodeId) {
    return res.redirect(`${config.baseUrl}${unit}/${feed}/1`);
  }
  try {
    const contentType = req.accepts(ACCEPTED_CONTENT_TYPES) || '';
    const result = await getNode(config, {
      folder: `${unit}/${feed}`,
      contentType,
      nodeId: parseInt(nodeId),
    });
    if (result.fromCache) {
      res.header('Cache-Control', 'public, immutable');
    }
    res.header('Content-Type', contentType);
    return result.stream.pipe(res);
  } catch (e) {
    if (/does not exist/.test(e.message)) return res.status(404).send();
    return next(e);
  }
});

app.use(errorHandler);
