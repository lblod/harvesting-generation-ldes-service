import { STATUS_BUSY, STATUS_SUCCESS, STATUS_FAILED, DIFF_FILE_NAMES, BATCH_SIZE } from "../constants";
import { loadTask, updateTaskStatus, appendTaskError } from "./task";
import { getFilePaths, getSubjectsInFile } from "./graph";
import { findRoots, fetchMembers } from "./members";
import { addMembers } from "./ldes";
import { FEEDS } from "./feeds";
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

    // a member is published once per task, whatever number of files touched it
    const done = new Map(FEEDS.map((feed) => [feed.name, new Set()]));
    for (const fileName of DIFF_FILE_NAMES) {
      for (const path of await getFilePaths(fileName, task)) {
        const subjects = [...(await getSubjectsInFile(path))];
        for (const feed of FEEDS) {
          const roots = (await findRoots(subjects, feed)).filter(
            (root) => !done.get(feed.name).has(root),
          );
          for (const batch of chunk(roots, BATCH_SIZE)) {
            const stores = await fetchMembers(batch, feed.shape);
            if (feed.enrich) await feed.enrich(stores);
            await addMembers(unit, feed, stores);
            batch.forEach((root) => done.get(feed.name).add(root));
          }
        }
      }
    }

    await updateTaskStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(e);
    await appendTaskError(task, e.message);
    await updateTaskStatus(task, STATUS_FAILED);
  }
}
