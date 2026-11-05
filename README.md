# pipelab.org

The PipeLab website: a Hugo site served by the Cloudflare Worker in `src/worker.js`.

## Contributing

[AGENTS.md](AGENTS.md) holds the contributor rules. They apply to everyone, whether you work by hand or with a coding tool. Content examples and reference material live in [docs/agent-reference](docs/agent-reference/), and copy and design rules live in [.brand/SKILL.md](.brand/SKILL.md).

## Local setup

Install Node.js 22, Python 3, GNU Make, and the extended Hugo release pinned in `.hugo-version`, and put that Hugo on your `PATH`. The verifier install script supports Linux on amd64; it downloads the pinned verifier and checks it before installing it.

From the repository root:

```sh
npm ci
bash scripts/install-pipelock-verifier.sh
make preflight
```

Preview static pages with:

```sh
hugo server -p 1314
```

Then open http://localhost:1314/. Hugo alone doesn't serve the Worker's API routes; [AGENTS.md](AGENTS.md#gauntlet-api-driven) covers API development.

Before opening a pull request, run `make preflight` and list the checks you ran and their results. Include screenshots or a preview link for visual changes.
