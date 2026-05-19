export interface PMapOptions {
  /** Maximum concurrent mappers. Default: unbounded. */
  concurrency?: number;
  /** Abort the whole operation. */
  signal?: AbortSignal;
  /** Reject on first error (default true). When false, all items are processed and an `AggregateError` is thrown at the end if any failed. */
  stopOnError?: boolean;
}

/**
 * Promise.all with concurrency limit. Preserves input order in the output
 * array. Throws on the first mapper rejection unless `stopOnError: false`.
 */
export async function pmap<T, R>(
  items: Iterable<T>,
  mapper: (item: T, index: number) => R | Promise<R>,
  opts: PMapOptions = {},
): Promise<R[]> {
  const arr = Array.from(items);
  const concurrency = Math.max(1, opts.concurrency ?? Infinity);
  const stopOnError = opts.stopOnError !== false;
  const results: R[] = new Array(arr.length);
  const errors: Array<{ index: number; error: unknown }> = [];

  return new Promise<R[]>((resolve, reject) => {
    if (arr.length === 0) {
      resolve(results);
      return;
    }
    if (opts.signal?.aborted) {
      reject(opts.signal.reason ?? new Error("aborted"));
      return;
    }
    let cursor = 0;
    let active = 0;
    let stopped = false;

    const finalize = () => {
      if (stopped) return;
      if (cursor < arr.length || active > 0) return;
      stopped = true;
      if (errors.length > 0 && !stopOnError) {
        const agg = new AggregateError(errors.map((e) => e.error), "pmap completed with errors");
        reject(agg);
      } else {
        resolve(results);
      }
    };

    const onAbort = () => {
      if (stopped) return;
      stopped = true;
      reject(opts.signal!.reason ?? new Error("aborted"));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const launchNext = () => {
      if (stopped) return;
      while (active < concurrency && cursor < arr.length && !stopped) {
        const idx = cursor++;
        active += 1;
        Promise.resolve()
          .then(() => mapper(arr[idx]!, idx))
          .then(
            (r) => {
              if (stopped) return;
              results[idx] = r;
              active -= 1;
              launchNext();
              finalize();
            },
            (e) => {
              active -= 1;
              if (stopOnError) {
                if (!stopped) {
                  stopped = true;
                  reject(e);
                }
              } else {
                errors.push({ index: idx, error: e });
                launchNext();
                finalize();
              }
            },
          );
      }
    };
    launchNext();
  });
}

/**
 * Bounded `Promise.allSettled` — returns `{ status, value | reason }` per item,
 * never throws (except on signal abort).
 */
export async function pmapSettled<T, R>(
  items: Iterable<T>,
  mapper: (item: T, index: number) => R | Promise<R>,
  opts: Omit<PMapOptions, "stopOnError"> = {},
): Promise<Array<PromiseSettledResult<R>>> {
  const arr = Array.from(items);
  const concurrency = Math.max(1, opts.concurrency ?? Infinity);
  const results: Array<PromiseSettledResult<R>> = new Array(arr.length);

  return new Promise<Array<PromiseSettledResult<R>>>((resolve, reject) => {
    if (arr.length === 0) {
      resolve(results);
      return;
    }
    if (opts.signal?.aborted) {
      reject(opts.signal.reason ?? new Error("aborted"));
      return;
    }
    let cursor = 0;
    let active = 0;
    let stopped = false;

    const onAbort = () => {
      if (stopped) return;
      stopped = true;
      reject(opts.signal!.reason ?? new Error("aborted"));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const finalize = () => {
      if (stopped) return;
      if (cursor < arr.length || active > 0) return;
      stopped = true;
      resolve(results);
    };

    const launch = () => {
      if (stopped) return;
      while (active < concurrency && cursor < arr.length && !stopped) {
        const idx = cursor++;
        active += 1;
        Promise.resolve()
          .then(() => mapper(arr[idx]!, idx))
          .then(
            (value) => {
              if (stopped) return;
              results[idx] = { status: "fulfilled", value };
              active -= 1;
              launch();
              finalize();
            },
            (reason) => {
              if (stopped) return;
              results[idx] = { status: "rejected", reason };
              active -= 1;
              launch();
              finalize();
            },
          );
      }
    };
    launch();
  });
}
