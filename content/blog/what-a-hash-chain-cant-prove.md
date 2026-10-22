---
title: "What a Hash Chain Can't Prove"
linkTitle: "What a Hash Chain Can't Prove"
seoTitle: "What a Hash Chain Can't Prove About Agent Logs"
date: 2026-08-31
author: "Josh Waldrep"
summary: "Hash-chained audit logs are getting sold as proof of what an AI agent did. Two questions separate a tamper-evident log from evidence: who holds the key, and where the recorder sits."
description: "Hash-chained agent logs are not proof. Two questions separate tamper-evident logging from evidence: who holds the key, and where does the recorder sit."
tags: ["ai-security", "agent-security", "audit-trail", "tamper-evident", "agent-firewall", "pipelock"]
related: ["what-is-an-agent-firewall", "politeness-vs-enforcement-https-proxy", "why-domain-allowlists-arent-enough"]
faq:
  - q: "Is a hash-chained audit log tamper-proof?"
    a: "No. A hash chain with no signature can be rewritten by anyone who holds the file: edit a record, recompute every hash after it, and the chain checks out clean again. A bare hash chain only proves the file agrees with itself. An external checkpoint or timestamp makes rewrites of already-checkpointed history visible, but everything not yet checkpointed stays rewritable, and nothing in the chain shows which actions the recorder never captured."
  - q: "What is the difference between a witness service and a signature on an audit log?"
    a: "A signature binds each record to a key at write time, so producing a valid record requires holding that key. A witness is an outside party that periodically stores the chain's length and fingerprint, which proves the chain has not changed since the witness last looked. A witness cannot vouch for what the recorder left out, and an unsigned chain remains rewritable between checkpoints. The strongest posture combines both: signed records, anchored externally."
  - q: "Why does it matter where an AI agent's audit recorder runs?"
    a: "A recorder inside the agent process depends on the agent calling it. A prompt-injected or compromised agent skips the logging call, so the trail stays clean precisely when the agent misbehaves. Recording at a boundary outside the agent process, one the agent cannot opt out of, is what makes an audit trail hold up against the failure it exists to catch."
blog_cat: "technical"
---

[Help Net Security covered a new open-source tool this week](https://www.helpnetsecurity.com/2026/08/31/halo-record-open-source-ai-agent-audit-trail/) that writes tamper-evident audit logs for AI agents. It stores recorded agent activity in a file, each record carries a hash of the record before it, and edits to old records break the later fingerprints. The author is upfront about what it can't do, which I respect. That's rarer in this space than it should be.

The story points at a wider problem with this wave of tools. "Tamper-evident" is starting to read as a synonym for proof. A log that's awkward to edit and evidence that holds up when money or blame is on the line are different things. Two questions expose the difference, and neither one needs a security background.

## Question one: who holds the key?

A hash chain with no signature can be rewritten by anyone who holds the file, right up until its head gets checkpointed somewhere outside the operator's reach. Anyone who can alter an old record can recompute the later hashes, and the chain checks out clean again. A bare hash chain only proves the file agrees with itself, and a rewritten file agrees with itself too. An outside checkpoint makes rewrites of already-checkpointed history visible, and that's real progress, but it still can't show which actions the recorder never captured. The docs for the tool in the story say "no secret required; that is the point." For making verification easy, fair enough. For evidence, that's the limit: if no secret was needed to write the record, no secret is needed to rewrite anything that hasn't been checkpointed yet. An unsigned chain is a notebook with numbered pages, not a notarized record.

## Question two: where does the recorder sit?

When the recorder only runs inside the agent process, the agent decides what gets recorded. A prompt-injected agent can skip the logger before it exfiltrates your data, and malware doesn't file a report on itself. The record is complete only when the thing being audited chooses to make it complete. An audit trail needs a boundary outside the process being recorded, where the agent can't skip it, or the trail documents the agent's good days and goes quiet on the bad ones.

Some tools add a witness service: an outside party that periodically stores the chain's length and fingerprint. Witnesses are a good idea, and more of them should appear. A witness can only vouch that the chain hasn't changed since it last looked. It can't vouch for what the recorder left out when the recorder lives inside the process it's reporting on. A timestamp on an incomplete record is still an incomplete record.

## The same test, pointed at Pipelock

Apply the same two questions to Pipelock, because a test that exempts its own author isn't a test. Pipelock mediates traffic at a separate proxy boundary. With enforced containment, meaning the network only lets agent traffic out through the proxy, recording happens at a boundary the agent can't skip. Containment is part of the deployment, and skipping it leaves a weaker guarantee, which the docs say plainly. Receipts are signed, and the operator who deploys Pipelock holds the key. I never see it. You can verify a receipt offline against a public key the operator provides, with no account and no server. The limit needs stating plainly: operator-signed means the operator could omit records before signing. The receipts prove what the proxy saw and that nobody changed it afterward. They don't yet prove independence from the operator who ran it. Outside anchoring is where this whole category needs to go. The math doesn't deliver more than that.

A shared vocabulary would help, because "audit trail" covers everything from a text file to signed, replayable evidence, and buyers can't price the difference. That's why I published [Agent Evidence Levels](https://github.com/pipelab-org/agent-evidence-levels), an open spec and checker for testing what an evidence artifact can and can't establish. A producer or operator can't award a grade through it. A public grade takes a verifier who's independent of both, and that rule applies to Pipelock the same as everyone else. If you build one of these tools, publish an artifact and a capability declaration an independent verifier can check before someone with a subpoena does the checking for you.
