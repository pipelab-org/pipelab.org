import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/indexnow-submit.mjs", import.meta.url));
const fakeFetch = `data:text/javascript,${encodeURIComponent(`
  import { writeSync } from "node:fs";
  globalThis.fetch = async (url, init) => {
    const call = { url, method: init?.method ?? "GET", urls: init?.body && JSON.parse(init.body).urlList };
    writeSync(1, "fetch " + JSON.stringify(call) + "\\n");
    return {
      ok: true,
      status: 202,
      text: async () => init ? "" : "<loc>https://pipelab.org/from-sitemap/</loc>",
    };
  };
`)}`;

function run(args, input = "") {
  const result = spawnSync(process.execPath, ["--import", fakeFetch, script, ...args], {
    encoding: "utf8",
    input,
    timeout: 5_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return {
    ...result,
    calls: result.stdout.split("\n")
      .filter(line => line.startsWith("fetch "))
      .map(line => JSON.parse(line.slice("fetch ".length))),
  };
}

function urlFile(t) {
  const directory = mkdtempSync(join(tmpdir(), "indexnow-submit-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "urls.txt");
  writeFileSync(file, "https://pipelab.org/from-file/\n");
  return file;
}

test("missing URL source prints usage without fetching", () => {
  const result = run([]);
  assert.deepEqual(result.calls, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm run indexnow:submit -- <urls\.txt or ->/);
});

test("empty and surplus arguments print usage without fetching", t => {
  const file = urlFile(t);
  for (const args of [[""], [file, file]]) {
    const result = run(args);
    assert.deepEqual(result.calls, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /usage:/);
  }
});

test("explicit file and stdin submit only the provided URLs", t => {
  const file = urlFile(t);
  const cases = [
    { args: [file], urls: ["https://pipelab.org/from-file/"] },
    { args: ["-"], input: "# A comment\n\nhttps://pipelab.org/from-stdin/\n", urls: ["https://pipelab.org/from-stdin/"] },
  ];
  for (const { args, input, urls } of cases) {
    const result = run(args, input);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, [{ url: "https://api.indexnow.org/indexnow", method: "POST", urls }]);
  }
});

test("empty and invalid stdin fail without fetching", () => {
  for (const [input, message] of [["# No URLs\n", /no URLs to submit/], ["invalid\n", /refusing to submit invalid URLs/]]) {
    const result = run(["-"], input);
    assert.deepEqual(result.calls, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }
});
