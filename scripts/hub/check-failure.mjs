// Messages on this error are fixed, operator-facing diagnostics. Keep raw
// subprocess output and messages from external inputs in the cause. The one
// exception is a failed acceptance step's single line of evidence, which
// reaches the message only through diagnostic.mjs (bounded and redacted).
export class HubCheckFailure extends Error {}

export class HubUnavailable extends HubCheckFailure {}
