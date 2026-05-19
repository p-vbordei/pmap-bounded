# pmap-bounded

[![ci](https://github.com/p-vbordei/pmap-bounded/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/pmap-bounded/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/pmap-bounded.svg)](https://www.npmjs.com/package/pmap-bounded)
[![downloads](https://img.shields.io/npm/dm/pmap-bounded.svg)](https://www.npmjs.com/package/pmap-bounded)
[![bundle](https://img.shields.io/bundlejs/size/pmap-bounded)](https://bundlejs.com/?q=pmap-bounded)

> `Promise.all` and `Promise.allSettled` with a concurrency limit, `AbortSignal` support, and an optional collect-all-errors mode. Zero dependencies.

```ts
import { pmap, pmapSettled } from "pmap-bounded";

const responses = await pmap(urls, (u) => fetch(u), { concurrency: 5 });

const results = await pmap(items, work, {
  concurrency: 10,
  stopOnError: false,
});

const settled = await pmapSettled(items, work, { concurrency: 4 });
for (const r of settled) {
  if (r.status === "fulfilled") use(r.value);
  else                          log(r.reason);
}
```

## Install

```sh
npm install pmap-bounded
```

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

`Promise.all` runs everything in parallel — which for a thousand URLs is a thousand simultaneous fetches. That hits rate limits, exhausts file descriptors, or hammers the database.

`pmap-bounded` is `Promise.all` with a knob: `concurrency: 10`. Plus the things you actually want in real code:

- `AbortSignal` to cancel the whole batch
- `stopOnError: false` to keep going and aggregate errors
- `pmapSettled` for "never throw, return per-item status"
- Preserves input order in the output array

## Recipes

### Bulk fetch with rate limiting

```ts
import { pmap } from "pmap-bounded";

const responses = await pmap(
  urls,
  async (u) => {
    const r = await fetch(u);
    return r.json();
  },
  { concurrency: 5 },
);
```

### Process all, collect errors instead of failing fast

```ts
import { pmap } from "pmap-bounded";

try {
  const okResults = await pmap(items, work, { concurrency: 10, stopOnError: false });
} catch (err) {
  if (err instanceof AggregateError) {
    console.error(`${err.errors.length} failed:`);
    for (const e of err.errors) console.error(e);
  }
}
```

### Use settled when you want per-item status without throwing

```ts
import { pmapSettled } from "pmap-bounded";

const results = await pmapSettled(urls, fetch, { concurrency: 5 });
const successes = results.filter((r) => r.status === "fulfilled").length;
console.log(`${successes}/${results.length} succeeded`);
```

### Total deadline

```ts
import { pmap } from "pmap-bounded";

const totalDeadline = AbortSignal.timeout(30_000);

const results = await pmap(items, work, {
  concurrency: 5,
  signal: totalDeadline,
});
// Throws with the timeout reason if 30s elapses before completion
```

### Combine with pretry

```ts
import { pmap } from "pmap-bounded";
import { retry, isRetriableHttpError } from "@p-vbordei/pretry";

await pmap(
  urls,
  (u) => retry(() => fetch(u), { retryOn: isRetriableHttpError }),
  { concurrency: 5 },
);
```

## API

### `pmap(items, mapper, opts?): Promise<R[]>`

Preserves input order. The mapper receives `(item, index)`.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `concurrency` | `number` | `Infinity` | Max in-flight mappers |
| `stopOnError` | `boolean` | `true` | If false, all items are processed; an `AggregateError` is thrown at the end |
| `signal` | `AbortSignal` | — | Aborts the operation |

### `pmapSettled(items, mapper, opts?): Promise<PromiseSettledResult<R>[]>`

Same options minus `stopOnError`. Returns one settled result per input. Only the `signal` abort can cause it to reject.

## When to use what

| Want | Use |
|---|---|
| Bounded `Promise.all` semantics, fail-fast | `pmap(...)` |
| Bounded `Promise.all`, collect-all errors | `pmap(..., { stopOnError: false })` → throws `AggregateError` |
| Bounded `Promise.allSettled` semantics | `pmapSettled(...)` |
| Job queue with priorities, abort, idle awaiting | [pqueue-tiny](https://github.com/p-vbordei/pqueue-tiny) |

## License

Apache-2.0 © Vlad Bordei
