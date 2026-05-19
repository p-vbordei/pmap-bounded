# pmap-bounded

`Promise.all` and `Promise.allSettled` with a **concurrency limit**, `AbortSignal` support, and an optional collect-all-errors mode. Zero dependencies.

```ts
import { pmap, pmapSettled } from "pmap-bounded";

// 5 fetches in flight at a time
const responses = await pmap(urls, (u) => fetch(u), { concurrency: 5 });

// Collect all errors instead of failing fast
const results = await pmap(items, work, {
  concurrency: 10,
  stopOnError: false,
});

// Settled variant — never throws (except on abort)
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

## License

Apache-2.0 © Vlad Bordei
