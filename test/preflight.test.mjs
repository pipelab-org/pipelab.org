import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const hugoVersion = readFileSync(".hugo-version", "utf8").trim();
const verifierVersion = readFileSync("scripts/pipelock-verifier-pin.env", "utf8").match(/^PIPELAB_VERIFIER_VERSION=(\S+)$/m)[1];

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "site-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  for (const file of ["Makefile", ".hugo-version", "scripts/preflight.mjs", "scripts/hugo-pin.mjs", "scripts/pipelock-verifier-pin.env"]) {
    cpSync(path.join(repoRoot, file), path.join(root, file));
  }
  const executable = (file, script) => {
    writeFileSync(file, `#!/bin/sh\n${script}\n`);
    chmodSync(file, 0o755);
  };
  const hugo = path.join(bin, "hugo");
  const verifier = path.join(root, ".pipelock-verifier");
  const setHugo = output => executable(hugo, `if [ "$1" = version ]; then printf '%s\\n' '${output}'; else printf 'step hugo %s\\n' "$*"; fi`);
  const setVerifier = output => executable(verifier, `printf '%s\\n' '${output}'`);
  setHugo(`hugo v${hugoVersion}+extended linux/amd64`);
  setVerifier(`pipelock-verifier ${verifierVersion} (fixture)`);
  const recursiveMake = path.join(root, "recursive-make");
  executable(recursiveMake, 'printf "step make %s\\n" "$*"');
  executable(path.join(bin, "make"), 'echo "unexpected Make from PATH" >&2; exit 64');
  executable(path.join(bin, "npm"), 'printf "step npm %s\\n" "$*"; if [ "$*" = "run site:audit" ]; then exit "${AUDIT_STATUS:-0}"; fi');
  // Exercise only the runner with stub commands. Launching another full
  // preflight here would nest whole-repository work inside the real preflight.
  const run = (extra = {}) => spawnSync(process.execPath, ["scripts/preflight.mjs", recursiveMake], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HUGO_BIN: hugo, HUGO_PINNED: "", ...extra },
  });
  return { root, hugo, verifier, setHugo, setVerifier, run };
}

test("bare preflight builds with pinned Hugo, runs audit and propagates its failure", t => {
  assert.match(readFileSync("Makefile", "utf8"), /^preflight:\n\tnode scripts\/preflight\.mjs "\$\(MAKE\)"$/m);
  const f = fixture(t);
  const pass = f.run();
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /step hugo --gc --minify/);
  assert.match(pass.stdout, /step npm run site:audit/);
  const fail = f.run({ AUDIT_STATUS: "17" });
  assert.notEqual(fail.status, 0, "audit failure must fail make preflight");
  assert.match(fail.stdout, /step npm run site:audit/);
  assert.doesNotMatch(fail.stdout, /step npm run site:render-diff/, "stop after the failed audit");
});

test("preflight rejects missing, wrong-version and standard-build prerequisites before checks", t => {
  const f = fixture(t);
  const reject = (result, message) => {
    assert.notEqual(result.status, 0, String(message));
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout, /step (?:make|npm|hugo)/, "no checks run after a prerequisite failure");
  };
  reject(f.run({ HUGO_BIN: path.join(f.root, "absent-hugo") }), /Hugo .* extended is required.*set HUGO_BIN/);
  f.setHugo("hugo v0.0.0+extended linux/amd64");
  reject(f.run(), /Hugo .* extended is required.*found 0\.0\.0/);
  f.setHugo(`hugo v${hugoVersion} linux/amd64`);
  reject(f.run(), /not an extended Hugo build/);
  f.setHugo(`hugo v${hugoVersion}+extended linux/amd64`);
  rmSync(f.verifier);
  reject(f.run(), /Pipelock verifier .* is required; run scripts\/install-pipelock-verifier\.sh/);
  f.setVerifier("pipelock-verifier 0.0.0 (fixture)");
  reject(f.run(), /Pipelock verifier .* is required; run scripts\/install-pipelock-verifier\.sh/);
});
