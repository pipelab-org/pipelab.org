import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = new URL("../", import.meta.url);
const root = fileURLToPath(repo);
const catalogPath = path.join(root, "static/.well-known/schema-mirror-catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const benchCommit = "c31d44fec9f42e17874ecbaaa3cbf9dd928895a6";
const rulesCommit = "aac8980c60add9f9f6b663a46d26b42da4b8c75a";
const rulesContractDigest = "1765cb0bfc15fc8e5f8aa6f60dc4d9298d58de1b82473c25624bec788155c1fb";
const benchIndexDigest = "39e60589fc4646a7d5e90aab38e85450d5042f0c818ba95e49285394df159d60";
const benchDiscoveryDigest = "3962f69d6eedf9ac8c87946fa7e042181c3c385ebd8e2d9728b4fc4b0c7bb7fd";
const benchIndexFixture = path.join(root, "test/fixtures/schema-mirror/agent-egress-bench-c31d44f-index.json");
const benchDiscoveryFixture = path.join(root, "test/fixtures/schema-mirror/agent-egress-bench-c31d44f-discovery.json");
const noticeDigests = new Map([
  ["agent-egress-bench", { license: "561d5715eff901b420d1efa7245367516fe5810709f27dd1fbc7c2467ad9103e", notice: "dbe2bf9de03feb336f084a98613d935887b086ae61a2e0f4a961b52ebec0c514" }],
  ["pipelock-rules", { license: "b78f4601f6cd1c3f367b5a6e266ffe769e854b082e09149ba561962b0246cf5e", notice: "44172c65e460350ce5223d4bfa82b76f65e96e2f4d68fda5f60e1d76b81c6f96" }],
]);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function refs(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => refs(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref") found.push(item);
      refs(item, found);
    }
  }
  return found;
}

test("schema mirror catalog pins every mirrored byte and preserves upstream identities", () => {
  assert.equal(catalog.format, 1);
  assert.equal(catalog.artifacts.length, 64);
  assert.equal(sha256(benchIndexFixture), benchIndexDigest);
  assert.equal(sha256(benchDiscoveryFixture), benchDiscoveryDigest);
  const upstreamIndex = JSON.parse(readFileSync(benchIndexFixture, "utf8"));
  const upstreamDiscovery = JSON.parse(readFileSync(benchDiscoveryFixture, "utf8"));
  assert.equal(upstreamDiscovery.catalog_sha256, benchIndexDigest);
  const upstreamByPath = new Map(upstreamIndex.schemas.map((schema) => [schema.path, schema]));
  const canonicalPaths = new Set(upstreamDiscovery.schemas.map((schema) => schema.path));
  assert.equal(canonicalPaths.size, 63);
  const seen = new Set();
  const seenCanonicalPaths = new Set();
  const expected = new Map([
    ["agent-egress-bench", { commit: benchCommit, count: 63, repository: "https://github.com/luckyPipewrench/agent-egress-bench" }],
    ["pipelock-rules", { commit: rulesCommit, count: 1, repository: "https://github.com/luckyPipewrench/pipelock-rules" }],
  ]);

  for (const artifact of catalog.artifacts) {
    const family = expected.get(artifact.family);
    assert.ok(family, `unexpected mirror family ${artifact.family}`);
    assert.equal(artifact.source_commit, family.commit);
    assert.ok(artifact.identity.startsWith(`${family.repository}/schemas/`) || artifact.identity.startsWith(`${family.repository}/compatibility/`));
    assert.ok(artifact.retrieval_url.startsWith(`https://raw.githubusercontent.com/luckyPipewrench/${artifact.family}/${family.commit}/`));
    assert.match(artifact.mirror_url, new RegExp(`^https://pipelab\\.org/schemas/${artifact.family}/${family.commit}/[a-z0-9-]+\\.schema\\.json$`));
    assert.match(artifact.dialect, /^https?:\/\/json-schema\.org\//);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!seen.has(artifact.mirror_url), `duplicate mirror URL ${artifact.mirror_url}`);
    seen.add(artifact.mirror_url);

    assert.equal(artifact.retrieval_url, `https://raw.githubusercontent.com/luckyPipewrench/${artifact.family}/${family.commit}/${artifact.upstream_path}`);
    const pathname = new URL(artifact.mirror_url).pathname;
    assert.equal(path.basename(pathname), path.basename(artifact.upstream_path));
    const file = path.join(root, "static", pathname);
    assert.ok(existsSync(file), `catalog entry has no mirrored file: ${pathname}`);
    assert.equal(sha256(file), artifact.sha256, `digest mismatch: ${pathname}`);

    const schema = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(schema.$schema, artifact.dialect);
    assert.equal(schema.$id, artifact.identity, `identity changed: ${pathname}`);
    for (const ref of refs(schema)) {
      assert.match(ref, /^#/, `schema reference requires another document: ${pathname}`);
    }
    if (artifact.family === "agent-egress-bench") {
      assert.ok(!seenCanonicalPaths.has(artifact.upstream_path), `duplicate canonical path ${artifact.upstream_path}`);
      seenCanonicalPaths.add(artifact.upstream_path);
      assert.ok(canonicalPaths.has(artifact.upstream_path), `non-canonical Bench mirror: ${artifact.upstream_path}`);
      const upstream = upstreamByPath.get(artifact.upstream_path);
      assert.equal(artifact.identity, upstream.$id, `identity disagrees with Bench index: ${artifact.upstream_path}`);
      assert.equal(artifact.sha256, upstream.sha256, `digest disagrees with Bench index: ${artifact.upstream_path}`);
    }
  }

  assert.deepEqual(seenCanonicalPaths, canonicalPaths);

  for (const [family, { commit, count }] of expected) {
    assert.equal(catalog.artifacts.filter((artifact) => artifact.family === family).length, count);
    const directory = path.join(root, "static/schemas", family, commit);
    const files = readdirSync(directory).filter((file) => file.endsWith(".schema.json"));
    assert.equal(files.length, count, `${family} mirror has an untracked or missing schema`);
    const notices = noticeDigests.get(family);
    for (const [required, digest] of [["LICENSE", notices.license], ["NOTICE", notices.notice]]) {
      const file = path.join(directory, required);
      assert.ok(existsSync(file), `${family} mirror is missing ${required}`);
      assert.equal(sha256(file), digest, `${family} ${required} changed from the pinned upstream bytes`);
    }
  }

  const rules = catalog.artifacts.find((artifact) => artifact.family === "pipelock-rules");
  const contractFile = path.join(root, "test/fixtures/schema-mirror/pipelock-rules-aac8980-contract.yaml");
  assert.equal(sha256(contractFile), rulesContractDigest);
  const contract = readFileSync(contractFile, "utf8");
  assert.ok(contract.includes(`schema_file: ${rules.upstream_path}\n    schema_sha256: "${rules.sha256}"`));
});

test("schema discovery advertises the catalog and immutable revision paths", () => {
  for (const file of ["static/llms.txt", "static/llms-full.txt"]) {
    assert.ok(readFileSync(path.join(root, file), "utf8").includes("https://pipelab.org/schemas/"), `${file} does not link the schema page`);
  }
  const headers = readFileSync(path.join(root, "static/_headers"), "utf8");
  assert.ok(headers.includes('/schemas/\n  Link: </.well-known/schema-mirror-catalog.json>; rel="describedby"; type="application/json"'));
  assert.match(headers, /\/\.well-known\/schema-mirror-catalog\.json\n  Content-Type: application\/json\n  Cache-Control: public, max-age=86400/);
  for (const [family, commit] of [["agent-egress-bench", benchCommit], ["pipelock-rules", rulesCommit]]) {
    const rule = `/schemas/${family}/${commit}/*.schema.json\n  Content-Type: application/schema+json\n  Cache-Control: public, max-age=31536000, immutable\n  Link: </.well-known/schema-mirror-catalog.json>; rel="describedby"; type="application/json"`;
    assert.ok(headers.includes(rule), `missing immutable header rule for ${family}`);
  }
});
