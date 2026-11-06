import { processedFieldKeys, taskProgress } from "../../types/encyclopedia.ts";
import type { EntryTask } from "../../types/encyclopedia.ts";

// Only metadata is stored here. Evidence, values and candidates stay in tasks.body.
export function summarizeTask(task: EntryTask): EntryTask {
  const progress = taskProgress(task);
  const confirmed = processedFieldKeys(task).filter(function confirmedField(key) {
    return task.results[key]?.readback;
  });
  return { ...task, processedFields: confirmed, results: {}, displayProgress: progress };
}

// Browsers need counts, not every field name. Details use the original task.
export function displayTask(task: EntryTask): EntryTask {
  return { ...task, scope: [], processedFields: [], results: {} };
}
