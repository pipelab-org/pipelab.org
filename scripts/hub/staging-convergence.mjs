import { setTimeout as delay } from "node:timers/promises";
import { commandTimeout } from "./release-binary.mjs";

// Use the existing native-check deadline for edge propagation, too.
export async function waitForStaging(check, { timeout = commandTimeout, interval = 1000, signal } = {}) {
  const deadline = new AbortController();
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(), timeout);
  const stopped = new Promise((_, reject) => combined.addEventListener("abort", () => reject(new Error("staging convergence deadline expired or cancelled")), { once: true }));
  try {
    combined.throwIfAborted();
    return await Promise.race([stopped, (async () => {
      while (!combined.aborted) {
        try { return await check(combined); }
        catch { await delay(interval, undefined, { signal: combined }); }
      }
      throw new Error("staging convergence deadline expired or cancelled");
    })()]);
  } catch { throw new Error("staging convergence deadline expired or cancelled"); }
  finally { clearTimeout(timer); deadline.abort(); }
}
