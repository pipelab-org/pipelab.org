// Messages on this error are fixed, operator-facing diagnostics. Keep raw
// subprocess output and messages from external inputs in the cause.
export class HubCheckFailure extends Error {}

export class HubUnavailable extends HubCheckFailure {}
