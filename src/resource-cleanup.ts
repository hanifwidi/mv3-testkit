/** Run resource disposers in order, including those following a failed disposer. */
export async function cleanupAll(tasks: readonly { name: string; close: () => Promise<void> }[]): Promise<void> {
  const errors: Error[] = [];
  for (const task of tasks) {
    try {
      await task.close();
    } catch (cause) {
      errors.push(new Error(`Cleanup of ${task.name} failed`, { cause }));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Cleanup failed for ${errors.length} resource(s)`);
  }
}
