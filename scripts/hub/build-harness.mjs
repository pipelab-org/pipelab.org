import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const enginePin = JSON.parse(readFileSync(new URL("./engine.json", import.meta.url)));
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function toolDefinitionLimit(repository) {
  const file = "internal/mcp/tools/tools.go";
  const source = execFileSync("git", ["-C", repository, "show", `${enginePin.source_commit}:${file}`]);
  const match = source.toString("utf8").match(/^const maxToolDefinitionTextBytes = 1 << (\d+)\b/m);
  const bytes = match ? 2 ** Number(match[1]) : NaN;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("unsupported native tool-definition limit declaration");
  return { bytes, file, source_sha256: sha256(source), engine_commit: enginePin.source_commit };
}

// Offline build only: caller supplies a local object store and a unique capture
// directory. Neither the source checkout nor its working tree is modified.
export function buildHarness({ repository, outputRoot, go = "go" }) {
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
  if (git("rev-parse", `v${enginePin.version}^{}`) !== enginePin.source_commit) throw new Error("engine tag does not match source pin");
  const version = execFileSync(go, ["version"], { encoding: "utf8" }).trim();
  if (version.split(" ")[2] !== enginePin.go_version) throw new Error("Go toolchain does not match engine pin");
  mkdirSync(outputRoot, { recursive: true });
  const destination = mkdtempSync(path.join(outputRoot, "hub-engine-"));
  const archive = path.join(destination, "source.tar");
  execFileSync("git", ["-C", repository, "archive", `--output=${archive}`, enginePin.source_commit, "go.mod", "go.sum", "internal", "configs"]);
  execFileSync("tar", ["-xf", archive, "-C", destination]);
  const source = readFileSync(new URL("./pipelock-harness/main.go", import.meta.url));
  const nativeLimit = toolDefinitionLimit(repository);
  const declaredLimit = source.toString("utf8").match(/^const toolDefinitionTextBytes = (\d+)$/m);
  if (Number(declaredLimit?.[1]) !== nativeLimit.bytes) throw new Error("harness tool-definition limit differs from pinned source");
  mkdirSync(path.join(destination, "internal/hubcheck"));
  writeFileSync(path.join(destination, "internal/hubcheck/main.go"), source);
  const binary = path.join(destination, "hubcheck");
  execFileSync(go, ["build", "-trimpath", "-o", binary, "./internal/hubcheck"], {
    cwd: destination, stdio: "pipe", timeout: 120000,
    env: { ...process.env, CGO_ENABLED: "0", GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off" },
  });
  const identity = { ...enginePin, go_version: version, harness_sha256: sha256(source), binary_sha256: sha256(readFileSync(binary)), cgo_enabled: false };
  writeFileSync(path.join(destination, "engine-identity.json"), JSON.stringify(identity, null, 2) + "\n");
  return { binary, destination, identity };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repository, outputRoot] = process.argv.slice(2);
  if (!repository || !outputRoot) throw new Error("usage: build-harness.mjs LOCAL_REPOSITORY CAPTURE_DIRECTORY");
  console.log(JSON.stringify(buildHarness({ repository, outputRoot })));
}
