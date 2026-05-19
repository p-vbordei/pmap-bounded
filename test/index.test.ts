import { describe, it, expect } from "vitest";
import { pmap, pmapSettled } from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pmap", () => {
  it("preserves order", async () => {
    const out = await pmap([3, 1, 2], async (n) => {
      await sleep(n * 10);
      return n;
    }, { concurrency: 3 });
    expect(out).toEqual([3, 1, 2]);
  });

  it("respects concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    await pmap([1, 2, 3, 4, 5, 6], async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active--;
    }, { concurrency: 2 });
    expect(maxActive).toBe(2);
  });

  it("unbounded by default", async () => {
    let active = 0;
    let maxActive = 0;
    await pmap([1, 2, 3, 4, 5], async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active--;
    });
    expect(maxActive).toBe(5);
  });

  it("empty array → empty result", async () => {
    expect(await pmap([], async () => 1)).toEqual([]);
  });

  it("stopOnError default: rejects on first error", async () => {
    await expect(
      pmap([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }, { concurrency: 1 }),
    ).rejects.toThrow("boom");
  });

  it("stopOnError: false collects errors as AggregateError", async () => {
    const promise = pmap([1, 2, 3, 4], async (n) => {
      if (n % 2 === 0) throw new Error(`bad ${n}`);
      return n;
    }, { stopOnError: false });
    await expect(promise).rejects.toBeInstanceOf(AggregateError);
  });

  it("aborts on signal", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(new Error("stop")), 15);
    await expect(
      pmap([1, 2, 3, 4], async (n) => { await sleep(50); return n; }, { concurrency: 1, signal: ac.signal }),
    ).rejects.toThrow("stop");
  });

  it("rejects immediately if already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(pmap([1, 2], async (n) => n, { signal: ac.signal })).rejects.toThrow();
  });

  it("passes index to mapper", async () => {
    const seen: number[] = [];
    await pmap(["a", "b", "c"], async (_, i) => { seen.push(i); });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });
});

describe("pmapSettled", () => {
  it("returns settled results in order", async () => {
    const out = await pmapSettled([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("two");
      return n * 10;
    });
    expect(out[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(out[1].status).toBe("rejected");
    expect(out[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  it("respects concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    await pmapSettled([1, 2, 3, 4], async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active--;
    }, { concurrency: 1 });
    expect(maxActive).toBe(1);
  });
});
