---
title: "Your sandbox says what the agent could do. What did it do?"
linkTitle: "What Did the Agent Change?"
date: 2026-10-02
author: "Josh Waldrep"
summary: "Agent sandboxes describe the boundary before the run. The question after it is what the agent changed on disk. And an empty change list is only evidence if the tool can also say when it didn't look."
description: "Agent sandboxes describe the boundary before a run. The harder question is what changed after it, and whether the record says when it didn't look."
tags: ["agent-containment", "evidence", "ai-security", "sandboxing", "audit"]
blog_cat: "technical"
faq:
  - q: "What is a workspace change statement?"
    a: "A signed record, written after a contained agent session ends, listing the paths that were added, removed or modified in the directories the agent was granted, compared with how they looked before launch. It carries path names and counts, never file contents."
  - q: "Is it a backup?"
    a: "No. It records that a path changed, not what the file said. There's no snapshot store and no restore. Keep backups and version control for recovery."
  - q: "What happens when part of the workspace can't be read?"
    a: "The statement marks itself incomplete and names the reason, and verification fails. An empty change list from a walk that skipped part of the tree would be a false all-clear."
---

The agent sandboxes I've used tell you the rules before the run. This directory is writable. That one's read-only. No network except the proxy. Some of them sign it, and that's good. Then the agent runs for forty minutes, exits, and the sandbox has nothing more to say.

The question you actually have at that point is simple. What did it touch?

You can answer it by hand. `git status` if the workspace is a repo and the agent didn't touch anything outside it. A `find -newer` if you remembered to drop a marker file first. Neither one is evidence. They run after the fact, as you, on a tree the agent just had write access to, and they produce a list nobody signed.

## Before and after are different claims

A boundary statement says what the agent was allowed to do. It's a promise about the cage. A change statement says what the agent did inside the cage. It's an observation.

Both matter, and they fail differently. The boundary can be perfect and the agent can still rewrite your deploy script, because you granted it the directory the deploy script lives in. Containment worked fine there. The agent did something inside its grant, and you'd still want to know about it. The only way to know is to look at the tree before, look again after, and write down the difference in a signed form the agent cannot edit. The operator holds the signing key, so the signature does not rule out changes by that operator.

## An empty list has to earn it

Taking two snapshots and diffing them is the easy part. The hard part is being honest about what the diff didn't see.

Say a directory becomes unreadable halfway through the session. A naive diff sees it vanish and reports every file under it as deleted. Or it skips the directory both times and reports nothing. The first is a false alarm. The second is worse, because "nothing changed" is exactly what you wanted to hear and exactly what an agent that broke something would want you to hear.

Same with a bind mount inside the workspace that points somewhere else, a path swapped for a symlink between listing it and reading it, or a tree so big the walk gives up. Every one of those is a spot where the tool didn't look. A change record that reports an empty diff over a spot it didn't look at is handing you a false all-clear with a signature on it.

So here's the rule I'd hold any tool to, mine included. A change record has to be able to say "incomplete," and it has to say why. An incomplete record is still true evidence of what was seen. It can't pass as a clean one.

## How Pipelock does it

In [Pipelock 3.6](/blog/pipelock-v360-release/), `pipelock contain run` records a manifest of every workspace granted to the contained agent before launch. Each path gets its kind, size, modification time, and a sha256 digest for regular files under a size cap. When the agent exits, cleanly or not, it takes the same manifest again, compares the two, and writes `workspace-change-statement.json` listing the paths added, removed and modified, plus counts. The sizes and digests do the comparing and stay out of the statement. The same key that signed the pre-launch posture capsule signs it, and that key is pinned before the agent starts, so rotating it mid-session can't change who signs.

The statement carries the digest of that session's posture capsule. `pipelock posture verify --workspace-statement` checks the pair, so a statement shown next to a capsule from some other run fails that paired verification. Anything unreadable, on a different mount, or swapped between list and read is excluded along with its subtree and counted. If anything was excluded, the walk ran out of budget, or the granted root disappeared, the statement says `incomplete: true` with the reason, and verification exits 2. On kernels older than 5.8, which can't report mount IDs, Pipelock can't see a bind mount from the same filesystem, so it marks the statement incomplete and names that as the reason.

Files over the digest cap (10 MiB by default, `--workspace-diff-cap-bytes`) are compared by size and modification time, and that marks the statement incomplete. Raise the cap if those files need content comparisons.

The limits are in the docs, so here they are too. It's evidence, not a backup. You get path names, never contents, and there's no restore. It's a before-and-after comparison, so a file the agent created and deleted before it exited won't show up, and nothing in it says which process made a change. It covers the workspaces you granted and nothing else. The agent's own home directory and its private temp directories aren't in it, so anything you care about belongs in a granted workspace, not in the agent's home. A statement that fails to write, say from a missing signing key, doesn't block the session. It says so on a single line a script can key on instead.

## What to ask of your own setup

If you run agents with write access to anything that matters, try this after the next session. Can you produce a list of what changed that you didn't generate yourself after the fact? Is it signed by something the agent couldn't reach? And if part of the tree was unreadable, would the list tell you, or would it come back empty?

Test an unreadable directory as well as an ordinary changed file. The record should distinguish an incomplete walk from a complete walk that found no changes.
