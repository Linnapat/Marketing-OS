/* "How much is still on me" — one definition, counted in one place.
 *
 * The sidebar badge and the My Tasks page each had their own. The badge counted
 * every unfinished task assigned to you; the page first threw away everything
 * outside the selected month, then counted. So the rail said "My Tasks 20"
 * while the page — opened on November — showed nothing outstanding: the twenty
 * were all due in other months, which is to say they were the overdue ones.
 *
 * Open = assigned to you and not done. No date window: a task does not stop
 * being yours because its due date fell in a month you are not looking at. */

export interface CountableTask { id: number; assignee: string; status: string }

export function isOpenTask(t: Pick<CountableTask, "id" | "status">, doneIds: ReadonlySet<number>): boolean {
  return !doneIds.has(t.id) && t.status !== "Done";
}

/** Every open task that `isMine` says is yours. */
export function openTasksOf<T extends CountableTask>(
  tasks: readonly T[], isMine: (assignee: string) => boolean, doneIds: ReadonlySet<number>,
): T[] {
  return tasks.filter((t) => isMine(t.assignee) && isOpenTask(t, doneIds));
}
