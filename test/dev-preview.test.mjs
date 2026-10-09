import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT = new URL("../scripts/dev-preview.mjs", import.meta.url);

async function startPreview(args) {
  const child = spawn(process.execPath, [SCRIPT.pathname, "--port", "0", "--hugo", "1", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  try {
    const line = await Promise.race([
      once(child.stdout, "data").then(([chunk]) => String(chunk)),
      once(child, "exit").then(([code]) => { throw new Error(`preview exited ${code}: ${stderr}`); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("preview startup timed out")), 5000)),
    ]);
    return line;
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => {});
    }
  }
}

test("development preview starts in HTTP and direct HTTPS modes", async () => {
  assert.match(await startPreview([]), /^preview  http:/);

  const directory = await mkdtemp(path.join(tmpdir(), "pipelab-preview-tls-"));
  const cert = path.join(directory, "cert.pem");
  const key = path.join(directory, "key.pem");
  try {
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", key, "-out", cert, "-subj", "/CN=localhost", "-days", "1",
    ]);
    assert.match(await startPreview(["--cert", cert, "--key", key]), /^preview  https:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("development preview refuses a partial TLS configuration", async () => {
  const child = spawn(process.execPath, [SCRIPT.pathname, "--port", "0", "--cert", "/tmp/cert.pem"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  assert.match(stderr, /--cert and --key must be provided together/);
});
