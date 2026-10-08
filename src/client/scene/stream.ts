/**
 * The world streams in a little at a time: every piece of building (a ground chunk, a forest chunk, a
 * place's dressing) is a generator that yields between small slices of work. The queue runs the most
 * urgent jobs (lowest priority number: nearest the action) until the frame's time budget is used.
 */
export type Jobs = {
  add(priority: number, job: Generator<void, void>): void;
  /** Runs jobs for up to `budgetMs` (Infinity: everything, e.g. the first frame). Returns slices run. */
  run(budgetMs: number): number;
  pending(): number;
  clear(): void;
};

type Job = { p: number; g: Generator<void, void>; seq: number };

export function createJobs(): Jobs {
  let list: Job[] = [];
  let seq = 0;
  let sorted = true;
  return {
    add(priority, job) {
      list.push({ p: priority, g: job, seq: seq++ });
      sorted = false;
    },
    run(budgetMs) {
      if (!sorted) {
        list.sort((a, b) => a.p - b.p || a.seq - b.seq);
        sorted = true;
      }
      const t0 = performance.now();
      let n = 0;
      while (list.length > 0) {
        const j = list[0]!;
        const r = j.g.next();
        n++;
        if (r.done) list.shift();
        if (performance.now() - t0 >= budgetMs) break;
      }
      return n;
    },
    pending: () => list.length,
    clear() {
      for (const j of list) j.g.return(undefined);
      list = [];
    },
  };
}
