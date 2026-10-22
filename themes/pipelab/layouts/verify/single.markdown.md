# {{ .Title }}

{{- with .OutputFormats.Get "html" }}
Canonical URL: {{ .Permalink }}
{{- end }}
{{- with .Description }}
Description: {{ . }}
{{- end }}

Verify a JSONL Pipelock receipt chain or a compatible gzip-tar Audit Packet in your browser. The tool does not upload the supplied file or text.

Supply the operator's public key to verify the chain against that key. Without a pinned key, the result is internal consistency only: it can verify records against their embedded signer key but cannot establish who controls that key.

Verification checks the supplied records for signatures, integrity, and order. It does not prove records are complete, that every action crossed Pipelock, or that an operator was honest.

- [See the signed evidence model](/agent-evidence/)
- [Read the Agent Evidence Levels spec](https://github.com/pipelab-org/agent-evidence-levels)
- [Get standalone verifier instructions](/learn/verify-a-receipt/)
