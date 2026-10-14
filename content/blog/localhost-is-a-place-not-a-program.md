---
title: "Localhost Is a Place, Not a Program"
linkTitle: "Localhost Is a Place, Not a Program"
date: 2026-10-14
author: "Josh Waldrep"
blog_cat: mcp
summary: "A local port doesn't identify the MCP service behind it. Check the connected socket's owner and program before sending credentials."
description: "Localhost identifies an address, not the MCP program behind it. Verify the connected socket owner and pinned executable before sending credentials."
canonical_url: "https://pipelab.org/blog/localhost-is-a-place-not-a-program/"
tags: ["mcp-security", "localhost", "pipelock"]
---

Your MCP client connects to a loopback address because its server runs on the same machine. That address tells it where to connect. It says nothing about which program will answer.

If the intended service stops and another local process takes its port, a client that trusts only the address can send that process a bearer token and accept its tool results. The address stayed the same. The program changed.

Local access is a prerequisite for this problem, but agent machines run packages, plugins and helpers from several sources. Treating everything local as the same trusted program gives all of those processes more trust than the address can justify.

## Check the connection before sending data

Pipelock v3.7 can register a local MCP service in `mcp_identities`. On each new connection to a matched registration, it dials, then checks the kernel's evidence for the process holding the server end of that exact connection before writing a byte.

The registration pins the service's user and executable digest. It can also require files the process must hold open or mapped, and exact permitted values for loader and interpreter control variables. The executable is hashed through the running process's own executable link, so replacing a binary on disk doesn't disguise a different running image.

An interpreter needs application pins too. Every application launched by the same interpreter can share its executable digest. Registering the interpreter alone doesn't identify the script you intended to trust.

This check requires Linux, a direct connection and a unique socket holder within the process visibility available to Pipelock. A matched launch on an unsupported platform refuses instead of falling back to an unverified connection. Ambiguous ownership or mismatched pins also refuse.

Reused HTTP keep-alive connections are checked when they are dialed, not before every request. A process that takes over the port is checked on the next new connection.

## Registration is a review step

`pipelock mcp identity register` observes the running service and prints a proposed configuration entry. It doesn't edit your configuration or decide that the observed program deserves your trust. Start the intended service, inspect the generated owner and program inputs, then review the entry before adding it.

Matching uses the registered scheme, literal loopback host and exact escaped path as written. The port can change between launches, but the upstream must state it explicitly. `localhost`, `127.0.0.1` and `::1` aren't interchangeable registration spellings.

An alternate spelling that matches no registration can still run as an ordinary unregistered launch, without the owner check. Naming a registered service with `--server-name` while using a mismatched upstream refuses. Check the launch's identity report so you know which path you selected.

A registered service can also retain a reviewed credential-request acknowledgment across changing ports and session tokens. That acknowledgment binds one finding to the tool definition, server, detector revision and matches. It doesn't turn off the rest of the MCP scanning policy.

## What the check can establish

The result describes the owner and program inputs at connection time. Code already running as the registered user can load the same pinned files, impersonate the service, or access its memory and files. Run a service whose identity matters under its own user.

The environment check reads the process's initial environment. An interpreter can load code from places the pins don't name, and a held file can change after inspection. A compromised kernel, altered registration or replaced trust pins defeats the premises of this check.

You still need MCP input, tool and response scanning for a verified service. Knowing which program answered doesn't establish that every answer it gives is safe.

Use the [local MCP identity guide](/learn/verified-local-mcp-services/) to register and inspect a service, then review your transport in the [MCP proxy guide](/learn/mcp-proxy/). The [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/) and [release notes](/blog/pipelock-v370-release/) cover the related policy changes.
