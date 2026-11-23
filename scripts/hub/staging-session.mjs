import { publishClearedVersion } from "./deployment-evidence.mjs";

// Each rerun first recovers a confirmed closed state. Cancellation attempts the
// same independent close; the workflow also has an unconditional recovery step.
export async function runStagingSession(approval, { adapter, readCurrentLedgerRevision, signal }) {
  await adapter.emergencyClose();
  if (signal?.aborted) throw new Error("staging publication cancelled");
  let cancellation;
  const cancelled = () => { cancellation = Promise.resolve().then(() => adapter.emergencyClose()).then(() => null, error => error); };
  signal?.addEventListener("abort", cancelled, { once: true });
  try {
    const result = await publishClearedVersion(approval, { ...adapter, readCurrentLedgerRevision });
    if (signal?.aborted) throw new Error("staging publication cancelled");
    return result;
  } catch (failure) {
    signal?.removeEventListener("abort", cancelled);
    const failures = [failure], cancelledClosure = await cancellation;
    if (cancelledClosure) failures.push(cancelledClosure);
    try { await adapter.emergencyClose(); } catch (closure) { failures.push(closure); }
    if (failures.length > 1) throw new AggregateError(failures, "staging recovery failed");
    throw failure;
  } finally { signal?.removeEventListener("abort", cancelled); }
}
