import { publishClearedVersion } from "./deployment-evidence.mjs";

// Each rerun first recovers a confirmed closed state. Cancellation attempts the
// same independent close; the workflow also has an unconditional recovery step.
export async function runStagingSession(approval, { adapter, readCurrentLedgerRevision, signal }) {
  await adapter.emergencyClose();
  if (signal?.aborted) throw new Error("staging publication cancelled");
  const cancelled = () => { adapter.emergencyClose().catch(() => {}); };
  signal?.addEventListener("abort", cancelled, { once: true });
  try {
    const result = await publishClearedVersion(approval, { ...adapter, readCurrentLedgerRevision });
    if (signal?.aborted) throw new Error("staging publication cancelled");
    return result;
  } catch (failure) {
    try { await adapter.emergencyClose(); }
    catch (closure) { throw new AggregateError([failure, closure], "staging recovery failed"); }
    throw failure;
  } finally { signal?.removeEventListener("abort", cancelled); }
}
