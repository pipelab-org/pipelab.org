import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { preflightContribution, preflightPullRequest } from "../scripts/hub/contribution-preflight.mjs";
import { generateCatalog } from "../scripts/hub/generate.mjs";

import { sha256 } from "../scripts/hub/evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(readFileSync(path.join(root, "test/hub-fixtures/listing.json"), "utf8"));
const signingKey = generateKeyPairSync("ed25519");
const fingerprint = signingKey.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const bundle = "format_version: 2\n";
const signature = sign(null, Buffer.from(bundle), signingKey.privateKey).toString("base64") + "\n";
const bundlePath = "hub/community/acme/example-bundle/bundle.yaml";
const listingPath = "hub/listings/community/acme--example-bundle.yaml";

const listing = (() => {
  const value = structuredClone(fixture);
  delete value.learn_page;
  delete value.evidence.artifact;
  return Object.assign(value, { type: "bundle", id: "example-bundle", bundle_name: "example-bundle", bundle_sha256: sha256(bundle), signer_fingerprint: fingerprint });
})();
const publisher = { id: "acme", name: "Acme", keys: [{ fingerprint, added: "2026-11-05" }] };
const files = {
  "hub/publishers/acme.yaml": stringify(publisher),
  [listingPath]: stringify(listing),
  [bundlePath]: bundle,
  [bundlePath + ".sig"]: signature,
};

function repository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-preflight-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe", encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (changes, { mode } = {}) => {
    for (const [file, contents] of Object.entries(changes)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), contents);
      if (mode) chmodSync(path.join(directory, file), mode);
      git("add", "--", file);
    }
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  return { directory, git, commit };
}

const failed = report => Object.entries(report.steps).find(([, step]) => step.status === "fail")?.[0];
const site = root;

test("acquired listing types refuse unsupported evidence artifact paths", t => {
  const config = structuredClone(fixture);
  delete config.learn_page;
  Object.assign(config, { type: "config", id: "example-config", base_preset: "claude-code", changes: [
    { op: "set", path: "response_scanning.enabled", value: false },
  ] });
  const official = { ...listing, id: "pipelock-community", bundle_name: "pipelock-community" };
  for (const [file, candidate] of [
    [listingPath, listing],
    ["hub/listings/bundles/pipelock-community.yaml", official],
    ["hub/configs/example-config.yaml", config],
  ]) {
    const { directory, commit, git } = repository(t);
    const base = commit({ "hub/README.md": "Guide.\n" });
    const evidence = { ...candidate.evidence, artifact: "evidence/example.json" };
    const head = commit({ ...files, [file]: stringify({ ...candidate, evidence }) });
    const report = preflightContribution({ repository: directory, base, head, site });
    assert.equal(report.verdict, "REFUSED", file);
    assert.equal(failed(report), "source-parse", file);
    assert.match(report.steps["source-parse"].evidence, /evidence\.artifact is unsupported/, file);
    git("update-ref", "refs/remotes/origin/main", head);
    const sourceBinding = { siteBase: base, rulesRepository: directory, rulesSHA: head, rulesMain: head };
    assert.throws(() => generateCatalog({ root: directory, sourceBinding }), /evidence\.artifact is unsupported/, file);
  }
});

test("a Hub-only community contribution is locally eligible, never accepted", t => {
  const { directory, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit(files);
  const report = preflightContribution({ repository: directory, base, head, site });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE");
  assert.deepEqual(report.steps["source-parse"].evidence, { publishers: 1, listings: 1, histories: 0 });
  assert.deepEqual(report.steps["bundle-signatures"].evidence, [{
    id: listing.id, bundle_sha256: listing.bundle_sha256, signer_fingerprint: fingerprint, signature_sha256: sha256(signature),
  }]);
  assert.deepEqual(report.categories, ["publisher", "listing", "community-bundle", "community-signature"]);
  assert.ok(report.changes.every(change => change.status === "A"));
  // The dependencies are named, not silently assumed away.
  const text = report.remaining.join("\n");
  for (const needle of ["Producer", "Workflow", "Final acceptance", "Publisher owner", "hubcheck"]) assert.match(text, new RegExp(needle));
});

test("local preflight refuses a changed pair or mismatched listing declaration", t => {
  const { directory, commit } = repository(t);
  const base = commit(files);
  const edits = [
    [bundlePath, bundle + "name: changed\n"],
    [bundlePath + ".sig", "invalid signature\n"],
    [listingPath, stringify({ ...listing, signer_fingerprint: "a".repeat(64) })],
    [listingPath, stringify({ ...listing, bundle_sha256: "a".repeat(64) })],
  ];
  for (const [file, bytes] of edits) {
    const head = commit({ ...files, [file]: bytes });
    const report = preflightContribution({ repository: directory, base, head, site });
    assert.equal(report.verdict, "REFUSED", file);
    assert.equal(failed(report), "bundle-signatures", file);
  }
});

test("changes outside Hub-owned paths fail closed with no further steps", t => {
  for (const file of [".github/workflows/ci.yaml", ".github/CODEOWNERS", "scripts/build.sh", "published/acme/bundle.yaml", "hub/.hidden"]) {
    const { directory, commit } = repository(t);
    const base = commit({ "hub/README.md": "Guide.\n" });
    const head = commit({ ...files, [file]: "x\n" });
    const report = preflightContribution({ repository: directory, base, head, site });
    assert.equal(report.verdict, "REFUSED", file);
    assert.equal(failed(report), "hub-only");
    assert.equal(report.steps["object-read"], undefined);
  }
});

test("the contributor guide changes only in opt-in maintenance mode", t => {
  const { directory, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit({ "hub/README.md": "Guide v2.\n" });
  assert.equal(failed(preflightContribution({ repository: directory, base, head, site })), "hub-only");
  assert.equal(preflightContribution({ repository: directory, base, head, site, maintenance: true }).verdict, "LOCAL-ELIGIBLE");
  const withPublisher = commit({ ...files, "hub/README.md": "Guide v3.\n" });
  const report = preflightContribution({ repository: directory, base: head, head: withPublisher, site, maintenance: true });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE");
  assert.equal(report.mode, "maintenance");
  assert.ok(report.categories.includes("maintenance"));
});

test("the expected base must be a full SHA and an ancestor of the candidate", t => {
  const { directory, git, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit(files);
  git("checkout", "-q", "-b", "side", base);
  const sibling = commit({ "hub/publishers/other.yaml": stringify({ ...publisher, id: "other" }) });
  assert.equal(failed(preflightContribution({ repository: directory, base: head, head: sibling, site })), "hub-only");
  assert.equal(failed(preflightContribution({ repository: directory, base: head, head: base, site })), "hub-only");
  assert.equal(failed(preflightContribution({ repository: directory, base: "main", head, site })), "hub-only");
  assert.equal(failed(preflightContribution({ repository: directory, base, head: head.slice(0, 12), site })), "hub-only");
  assert.equal(failed(preflightContribution({ repository: directory, base: head, head, site })), "hub-only");
});

test("replacement refs cannot disguise the exact head", t => {
  const { directory, git, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const allowed = commit(files);
  const refused = commit({ "unrelated.txt": "Not a Hub contribution.\n" });
  git("replace", refused, allowed);
  assert.equal(failed(preflightContribution({ repository: directory, base, head: refused, site })), "hub-only");
});

test("byte, mode and symlink problems are refused by the object reader", t => {
  const { directory, git, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const executable = commit({ "hub/community/acme/example-bundle/bundle.yaml": "x\n" }, { mode: 0o755 });
  assert.equal(failed(preflightContribution({ repository: directory, base, head: executable, site })), "object-read");

  git("checkout", "--quiet", "--detach", base);
  const huge = commit({ "hub/community/acme/other-bundle/bundle.yaml": "x".repeat(1024 * 1024 + 1) });
  assert.equal(failed(preflightContribution({ repository: directory, base, head: huge, site })), "object-read");

  git("checkout", "--quiet", "--detach", base);
  mkdirSync(path.join(directory, "hub/publishers"), { recursive: true });
  symlinkSync("../README.md", path.join(directory, "hub/publishers/evil.yaml"));
  git("add", "--", "hub/publishers/evil.yaml");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "link");
  const link = git("rev-parse", "HEAD");
  assert.equal(failed(preflightContribution({ repository: directory, base, head: link, site })), "object-read");
});

test("metadata that fails the data-only parse is refused", t => {
  const { directory, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit({ ...files, "hub/publishers/acme.yaml": "id: mismatch\nname: Acme\nkeys: []\n" });
  const report = preflightContribution({ repository: directory, base, head, site });
  assert.equal(report.verdict, "REFUSED");
  assert.equal(failed(report), "source-parse");
  assert.equal(report.remaining.length, 0);
});

test("quality-only change is eligible and the command line exits non-zero on refusal", t => {
  const { directory, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n", ...files });
  const head = commit({ "hub/quality/acme/example-bundle.json": "{}\n" });
  const report = preflightContribution({ repository: directory, base, head, site });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE");
  assert.deepEqual(report.categories, ["quality"]);

  const script = path.join(root, "scripts/hub/contribution-preflight.mjs");
  const ok = spawnSync(process.execPath, [script, directory, base, head, site], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).verdict, "LOCAL-ELIGIBLE");
  const bad = spawnSync(process.execPath, [script, directory, head, base, site], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
});

test("an exact pull request on a stale base is refused before its files can qualify", t => {
  const { directory, git, commit } = repository(t);
  const common = commit({ "hub/README.md": "Guide.\n" });
  const base = commit({ "README.md": "A separate rules main update.\n" });
  git("checkout", "-q", "-b", "submission", common);
  const head = commit(files);
  const pr = { number: 2, state: "open", base: { ref: "main", sha: base,
    repo: { full_name: "pipelab-org/pipelock-rules" } }, head: { sha: head } };

  const report = preflightPullRequest({ number: 2, repository: directory, base, head, site }, () => pr);
  assert.equal(report.verdict, "REFUSED");
  assert.equal(failed(report), "pull-request");
  assert.match(report.steps["pull-request"].evidence, /must include current rules main/);
  assert.equal(report.steps["object-read"], undefined);
});

test("pull request policy evidence identifies exact files without treating them as approval", t => {
  const { directory, git, commit } = repository(t);
  const tracker = ".github/workflows/hub-validate.yml";
  const base = commit({ "hub/README.md": "Guide.\n", [tracker]: "name: fixture\n" });
  const run = head => {
    const metadata = { number: 7, state: "open", base: { ref: "main", sha: base,
      repo: { full_name: "pipelab-org/pipelock-rules" } }, head: { sha: head } };
    return preflightPullRequest({ number: 7, repository: directory, base, head, site }, () => metadata);
  };

  const head = commit(files);
  const report = run(head);
  assert.equal(report.verdict, "LOCAL-ELIGIBLE");
  assert.deepEqual(report.steps["policy-inputs"].evidence, {
    commit: head, workflows: [{ path: tracker, object: git("rev-parse", head + ":" + tracker), size: 14 }],
    codeowners: [],
  });
  assert.match(report.remaining.join("\n"), /policy evaluation/);

  const mixed = commit({ [tracker]: "name: changed workflow\n" });
  const refused = run(mixed);
  assert.equal(refused.verdict, "REFUSED");
  assert.equal(failed(refused), "hub-only");
  assert.equal(refused.steps["policy-inputs"].evidence.workflows[0].object, git("rev-parse", mixed + ":" + tracker));
});

test("eligible Hub input must match the same open rules pull request and published refs before and after inspection", t => {
  const { directory, git, commit } = repository(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit(files);
  const input = { number: 2, repository: directory, base, head, site };
  const original = { number: 2, state: "open", base: { ref: "main", sha: base,
    repo: { full_name: "pipelab-org/pipelock-rules" } }, head: { sha: head } };
  const checked = preflightPullRequest(input, () => original);
  assert.equal(checked.verdict, "LOCAL-ELIGIBLE");
  assert.equal(checked.steps["pull-request"].status, "pass");
  assert.equal(checked.pull_request.head_tree, git("rev-parse", "HEAD^{tree}"));

  const wrongBase = { ...original, base: { ...original.base, ref: "release" } };
  assert.equal(failed(preflightPullRequest(input, () => wrongBase)), "pull-request");
  assert.equal(failed(preflightPullRequest({ ...input, number: 3 }, () => original)), "pull-request");

  for (const end of [
    () => ({ ...original, head: { sha: "a".repeat(40) } }),
    () => ({ ...original, base: { ...original.base, sha: "b".repeat(40) } }),
    () => ({ ...original, state: "closed" }),
    () => { throw new Error("unavailable"); },
  ]) {
    let calls = 0;
    const moved = preflightPullRequest(input, () => ++calls === 1 ? original : end());
    assert.equal(calls, 2);
    assert.equal(moved.verdict, "REFUSED");
    assert.equal(failed(moved), "pull-request");
  }

  const ghStub = path.join(directory, "gh");
  const gitStub = path.join(directory, "git");
  const mainRow = `${base}\trefs/heads/main\n`;
  const headRow = `${head}\trefs/pull/2/head\n`;
  writeFileSync(path.join(directory, "pr.json"), JSON.stringify(original));
  writeFileSync(ghStub, '#!/bin/sh\n[ "$*" = "api --hostname github.com repos/pipelab-org/pipelock-rules/pulls/2" ] || exit 1\ncat "$HUB_PR_FIXTURE"\n');
  writeFileSync(gitStub, [
    "#!/bin/sh",
    'if [ "$*" = "-c http.followRedirects=false ls-remote --exit-code https://github.com/pipelab-org/pipelock-rules refs/heads/main refs/pull/2/head" ]; then',
    '  if [ -e "$HUB_REFS_SEEN" ]; then cat "$HUB_REFS_LATER"; else : > "$HUB_REFS_SEEN"; cat "$HUB_REFS_FIRST"; fi',
    "  exit $?",
    "fi",
    'PATH="$HUB_ORIGINAL_PATH" exec git "$@"',
    "",
  ].join("\n"));
  chmodSync(ghStub, 0o755);
  chmodSync(gitStub, 0o755);
  const script = path.join(root, "scripts/hub/contribution-preflight.mjs");
  const shell = (number, first = mainRow + headRow, later = first) => {
    const seen = path.join(directory, "refs-seen");
    const firstPath = path.join(directory, "refs-first");
    const laterPath = path.join(directory, "refs-later");
    rmSync(seen, { force: true });
    writeFileSync(firstPath, first);
    writeFileSync(laterPath, later);
    return spawnSync(process.execPath, [script, "--pr", number, directory, base, head, site], {
      encoding: "utf8", env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH,
        HUB_ORIGINAL_PATH: process.env.PATH, HUB_PR_FIXTURE: path.join(directory, "pr.json"),
        HUB_REFS_SEEN: seen, HUB_REFS_FIRST: firstPath, HUB_REFS_LATER: laterPath },
    });
  };
  const cli = shell("2");
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).steps["pull-request"].status, "pass");
  assert.equal(shell("2e0").status, 2);

  for (const refs of [mainRow, mainRow + headRow + headRow]) {
    const bad = shell("2", refs);
    assert.equal(bad.status, 1, bad.stderr);
    const report = JSON.parse(bad.stdout);
    assert.equal(failed(report), "pull-request");
    assert.equal(report.steps["pull-request"].evidence, "published Rules pull request could not be verified");
  }
  const stale = shell("2", mainRow + headRow.replace(head, "a".repeat(40)));
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).steps["pull-request"].evidence, "pull request metadata differs from the published Rules refs");
  const moved = shell("2", mainRow + headRow, mainRow.replace(base, "b".repeat(40)) + headRow);
  assert.equal(moved.status, 1, moved.stderr);
  const report = JSON.parse(moved.stdout);
  assert.equal(report.steps["object-read"].status, "pass");
  assert.equal(failed(report), "pull-request");
});

test("Rules PR acquisition fetches only selected blobs before offline preflight", t => {
  const { directory, git, commit } = repository(t);
  const workflow = ".github/workflows/advisory.yml";
  const unrelated = "README.md";
  const base = commit({ "hub/README.md": "Guide.\n", [workflow]: "name: advisory\n", [unrelated]: "Rules.\n" });
  const head = commit(files);
  const tree = git("rev-parse", head + "^{tree}");
  git("update-ref", "refs/pull/2/head", head);
  git("update-ref", "refs/heads/main", base);
  git("config", "uploadpack.allowFilter", "true");
  git("config", "uploadpack.allowAnySHA1InWant", "true");
  const treeEntries = git("ls-tree", "-r", "-l", head).split("\n").map(row => {
    const [meta, path] = row.split("\t");
    const [mode, type, sha, size] = meta.split(/ +/);
    return { mode, type, sha, size: Number(size), path };
  });

  writeFileSync(path.join(directory, "pr.json"), JSON.stringify({ number: 2, state: "open",
    base: { ref: "main", sha: base, repo: { full_name: "pipelab-org/pipelock-rules" } }, head: { sha: head } }));
  writeFileSync(path.join(directory, "refs"), [
    base + "\trefs/heads/main", head + "\trefs/pull/2/head", "",
  ].join("\n"));
  const ghStub = path.join(directory, "gh");
  writeFileSync(ghStub, [
    "#!/bin/sh",
    '[ "$HUB_RULES_PUBLIC_API" != 1 ] || exit 1',
    'case "$*" in',
    '  "api --hostname github.com repos/pipelab-org/pipelock-rules/pulls/2") cat "$HUB_STUB_DIR/pr.json";;',
    '  "api --hostname github.com repos/pipelab-org/pipelock-rules/git/trees/$HUB_STUB_TREE?recursive=1") cat "$HUB_STUB_DIR/tree.json";;',
    '  *) exit 1;;',
    "esac",
    "",
  ].join("\n"), { mode: 0o755 });

  writeFileSync(path.join(directory, "curl"), [
    "#!/bin/sh",
    'case "$*" in',
    '  "-q --silent --show-error --fail --proto =https --max-time 15 --max-filesize 1048576 --header Accept: application/vnd.github+json --url https://api.github.com/repos/pipelab-org/pipelock-rules/pulls/2") cat "$HUB_STUB_DIR/pr.json";;',
    '  "-q --silent --show-error --fail --proto =https --max-time 15 --max-filesize 7340032 --header Accept: application/vnd.github+json --url https://api.github.com/repos/pipelab-org/pipelock-rules/git/trees/$HUB_STUB_TREE?recursive=1") cat "$HUB_STUB_DIR/tree.json";;',
    '  *) exit 1;;',
    "esac",
    "",
  ].join("\n"), { mode: 0o755 });

  const gitStub = path.join(directory, "git");
  writeFileSync(gitStub, [
    "#!/bin/sh",
    'export PATH="$HUB_ORIGINAL_PATH"',
    'case " $* " in',
    '  *" ls-remote "*) exec cat "$HUB_STUB_DIR/refs";;',
    '  *" fetch "*" --stdin "*)',
    '    cat > "$HUB_STUB_DIR/wanted"',
    '    if [ "$HUB_STUB_DROP" = 1 ]; then sed "1d" "$HUB_STUB_DIR/wanted" > "$HUB_STUB_DIR/send";',
    '    else cp "$HUB_STUB_DIR/wanted" "$HUB_STUB_DIR/send"; fi',
    '    GIT_ALLOW_PROTOCOL=file exec git -c "url.file://$HUB_STUB_DIR.insteadOf=https://github.com/pipelab-org/pipelock-rules" "$@" < "$HUB_STUB_DIR/send";;',
    '  *" fetch "*)',
    '    if [ "$HUB_STUB_OVERRUN" = 1 ]; then truncate -s 7340033 "$HUB_STUB_DIR/pack-probe" || exit; fi',
    '    GIT_ALLOW_PROTOCOL=file exec git -c "url.file://$HUB_STUB_DIR.insteadOf=https://github.com/pipelab-org/pipelock-rules" "$@";;',
    '  *) exec git "$@";;',
    "esac",
    "",
  ].join("\n"), { mode: 0o755 });

  const script = path.join(root, "scripts/hub/contribution-preflight.mjs");
  const wanted = path.join(directory, "wanted");
  const run = (metadata, { drop = false, overrun = false, publicAPI = false } = {}) => {
    rmSync(wanted, { force: true });
    writeFileSync(path.join(directory, "tree.json"), JSON.stringify(metadata));
    const result = spawnSync(process.execPath, [script, "--fetch-pr", "2", base, head, site], {
      encoding: "utf8", env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH,
        HUB_ORIGINAL_PATH: process.env.PATH, HUB_STUB_DIR: directory, HUB_STUB_TREE: tree, HUB_STUB_DROP: drop ? "1" : "0", HUB_STUB_OVERRUN: overrun ? "1" : "0", HUB_RULES_PUBLIC_API: publicAPI ? "1" : "0" },
    });
    assert.equal(result.signal, null, result.stderr);
    return { code: result.status, report: JSON.parse(result.stdout) };
  };
  const metadata = { sha: tree, truncated: false, tree: treeEntries };
  const eligible = run(metadata);
  assert.equal(eligible.code, 0, JSON.stringify(eligible.report));
  assert.equal(eligible.report.verdict, "LOCAL-ELIGIBLE");
  assert.deepEqual(eligible.report.steps["policy-inputs"].evidence.workflows.map(item => item.path), [workflow]);
  assert.deepEqual(new Set(readFileSync(wanted, "utf8").trim().split("\n")),
    new Set(treeEntries.filter(entry => entry.path !== unrelated).map(entry => entry.sha)));

  const published = run(metadata, { publicAPI: true });
  assert.equal(published.code, 0, JSON.stringify(published.report));
  assert.deepEqual(published.report, eligible.report);

  const wrongFiles = [
    treeEntries.slice(1),
    [...treeEntries, treeEntries[0]],
    treeEntries.map(entry => entry.path === workflow ? { ...entry, sha: "a".repeat(40) } : entry),
    treeEntries.map(entry => entry.path === workflow ? { ...entry, size: 1024 * 1024 + 1 } : entry),
  ];
  for (const bad of [{ ...metadata, truncated: true }, ...wrongFiles.map(tree => ({ ...metadata, tree }))]) {
    const refused = run(bad);
    assert.equal(refused.code, 1);
    assert.equal(failed(refused.report), "rules-acquisition");
    assert.throws(() => readFileSync(wanted), { code: "ENOENT" });
  }

  const missing = run(metadata, { drop: true });
  assert.equal(missing.code, 1);
  assert.equal(missing.report.verdict, "REFUSED");
  assert.equal(failed(missing.report), "rules-acquisition");
  assert.match(missing.report.steps["rules-acquisition"].evidence, /(?:could not verify acquired Rules blob metadata|acquired Rules blob metadata differs)/);

  const wrongSize = run({ ...metadata, tree: treeEntries.map(entry =>
    entry.path === workflow ? { ...entry, size: entry.size - 1 } : entry) });
  assert.equal(wrongSize.code, 1);
  assert.match(wrongSize.report.steps["rules-acquisition"].evidence, /acquired Rules blob metadata differs/);

  const overrun = run(metadata, { overrun: true });
  assert.equal(overrun.code, 1);
  assert.equal(failed(overrun.report), "rules-acquisition");
  assert.match(overrun.report.steps["rules-acquisition"].evidence, /within the metadata limit/);
  assert.throws(() => readFileSync(wanted), { code: "ENOENT" });

  git("update-ref", "refs/heads/main", head);
  const moved = run(metadata);
  assert.equal(moved.code, 1);
  assert.match(moved.report.steps["rules-acquisition"].evidence, /refs moved during acquisition/);
  assert.throws(() => readFileSync(wanted), { code: "ENOENT" });
});
