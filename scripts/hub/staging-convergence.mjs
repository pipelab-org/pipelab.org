import { setTimeout as delay } from "node:timers/promises";
import { commandTimeout } from "./release-binary.mjs";

// Use the existing native-check deadline for edge propagation, too.
export async function waitForStaging(check, { timeout = commandTimeout, interval = 1000, signal } = {}) {
  let lastFailure;
  const deadline = new AbortController();
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(), timeout);
  const stopped = new Promise((_, reject) => combined.addEventListener("abort", () => reject(new Error("staging convergence deadline expired or cancelled")), { once: true }));
  try {
    combined.throwIfAborted();
    return await Promise.race([stopped, (async () => {
      while (!combined.aborted) {
        try { return await check(combined); }
        catch (failure) {
          // A rejection caused by the deadline itself must not hide the last control failure.
          if (!combined.aborted) lastFailure = failure;
          await delay(interval, undefined, { signal: combined });
        }
      }
      throw new Error("staging convergence deadline expired or cancelled");
    })()]);
  } catch {
    // Report the last check failure so the operator sees which control refused.
    if (lastFailure) throw lastFailure;
    throw new Error("staging convergence deadline expired or cancelled");
  }
  finally { clearTimeout(timer); deadline.abort(); }
}
