import { sparqlEscapeUri } from "mu";
import { Store } from "n3";
import { STATUS_BUSY, STATUS_SUCCESS, STATUS_FAILED, DIFF_FILE_NAMES, BATCH_SIZE } from "../constants";
import { loadTask, updateTaskStatus, appendTaskError } from "./task";
import { getFilePaths, getSubjectsInFile } from "./graph";
import { addMembers } from "./ldes";
import { loadFeeds, context } from "./feeds";
import { chunk } from "./utils";

export async function run(taskUri) {
  const task = await loadTask(taskUri);
  if (!task) return;

  try {
    await updateTaskStatus(task, STATUS_BUSY);
    const unit = task.unit.split("/").pop();
    if (!/^[\w-]+$/.test(unit)) {
      throw new Error(`Cannot derive a stream name from unit <${task.unit}>`);
    }

    const subjects = new Set();
    for (const fileName of DIFF_FILE_NAMES) {
      for (const path of await getFilePaths(fileName, task)) {
        (await getSubjectsInFile(path)).forEach((subject) => subjects.add(subject));
      }
    }

    for (const feed of await loadFeeds()) {
      await generateFeed(unit, feed, subjects);
    }

    await updateTaskStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(e);
    await appendTaskError(task, e.message);
    await updateTaskStatus(task, STATUS_FAILED);
  }
}

// Adds a new version to the feed for every subject that is a member of it.
export async function generateFeed(unit, feed, subjects) {
  const members = [];
  for (const subject of subjects) {
    if (await feed.isMember(sparqlEscapeUri(subject), context)) members.push(subject);
  }
  for (const batch of chunk(members, BATCH_SIZE)) {
    const stores = new Map();
    for (const uri of batch) {
      stores.set(uri, new Store(await feed.buildMember(sparqlEscapeUri(uri), context)));
    }
    await addMembers(unit, feed, stores);
  }
  console.log(`Added ${members.length} member(s) to ${unit}/${feed.name}`);
}
