import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import { auditRawInstallSource } from "./install-contract.mjs";

// Hugo absURL keeps a baseURL directory on relative links and on absolute links
// already under that directory. A host-root "/hub" path stays a hub path.
function siteRelativePath(url, baseURL) {
  const trim = pathname => pathname.replace(/\/+$/, "") || "/";
  const guidePath = trim(new URL(url, baseURL).pathname);
  const basePath = trim(new URL(baseURL).pathname);
  if (basePath !== "/" && (guidePath === basePath || guidePath.startsWith(`${basePath}/`))) return trim(guidePath.slice(basePath.length)) || "/";
  return guidePath;
}

export function isHubGuide(url, baseURL) {
  const path = siteRelativePath(url, baseURL);
  return path === "/hub" || path.startsWith("/hub/");
}

export const machineSources = [
  "themes/pipelab/layouts/index.llms.txt",
  "themes/pipelab/layouts/index.llmsfull.txt",
];
export const machineOutputs = ["public/llms.txt", "public/llms-full.txt"];

// The existing home-output and install contracts also apply to machine context.
// Source checks run before Hugo; output checks require an actual build.
export function auditMachineContext(root = ".") {
  const issues = [];
  try {
    const read = file => readFileSync(path.join(root, file), "utf8");
    const config = parseToml(read("hugo.toml"));
    const launchFile = "data/hub/launch.toml";
    const launch = existsSync(path.join(root, launchFile)) ? parseToml(read(launchFile)) : {};
    if (Object.hasOwn(launch, "open") && typeof launch.open !== "boolean") throw new Error(`${launchFile}: open must be a boolean`);
    const version = config.params.pipelock_version;
    const editorial = parseYaml(read("data/machine_context.yaml"));
    const minor = version.split(".").slice(0, 2).join(".");
    const intro = `Pipelock is an open-source agent firewall for MCP and AI agent egress. Pipelock ${minor} (current release ${version}) ${editorial.release.summary}`;
    if (editorial.release.minor !== minor) issues.push("machine context: release summary needs review for the declared minor release");
    const headers = read("public/_headers").replace(/\r\n?/g, "\n");
    for (const [index, file] of machineOutputs.entries()) {
      const source = read(machineSources[index]);
      const body = read(file);
      const name = path.basename(file);
      if (existsSync(path.join(root, "static", name))) issues.push(`static/${name}: conflicts with the generated home output`);
      const format = index === 0 ? "llms" : "llmsfull";
      const spec = config.outputFormats?.[format];
      if (!config.outputs?.home?.includes(format) || spec?.baseName !== name.slice(0, -4)
          || spec.mediaType !== "text/plain" || spec.isPlainText !== true || spec.notAlternative !== true) {
        issues.push(`${file}: must remain a plain-text home output at /${name}`);
      }
      if (!source.includes('{{ partial "machine/release-intro.txt" . }}') || !body.includes(intro)) {
        issues.push(`${file}: must render the shared release introduction`);
      }
      if (!source.includes('{{ partial "machine/guides.txt" . }}')) issues.push(`${file}: must render the approved shared guide list`);
      for (const guide of editorial.guides.filter(guide => !isHubGuide(guide.url, config.baseURL) || launch.open === true)) {
        if (!body.includes(`[${guide.label}](${new URL(guide.url, config.baseURL).href})`)) issues.push(`${file}: missing approved guide ${guide.label}`);
      }
      if (/\{\{|\}\}|\bVERSION\b/.test(body)) issues.push(`${file}: unresolved template or fact token`);
      if (!headers.includes(`/${name}\n  Cache-Control: public, max-age=86400`)) issues.push(`${file}: existing path-based cache rule is missing`);
      for (const issue of auditRawInstallSource(body, version)) issues.push(`${file}: ${issue}`);
    }
    const install = parseYaml(read("data/install.yaml"));
    const full = read(machineOutputs[1]);
    for (const method of install.methods) {
      // Preserve the published Docker :latest example; changing its policy is
      // separate from generating the existing machine context.
      const selectedVersion = method.id === "docker" ? "latest" : version;
      if (!full.includes(method.command.replaceAll("VERSION", selectedVersion))) issues.push(`public/llms-full.txt: missing shared ${method.id} installation command`);
    }
    return issues;
  } catch (error) {
    return [...issues, `machine context: unable to validate source and built outputs (${error.message}); build the site first`];
  }
}
