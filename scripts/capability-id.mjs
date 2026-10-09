import path from "node:path";

const CAPABILITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function requireCapabilityId(value, label = "capability id") {
  if (typeof value !== "string" || !CAPABILITY_ID.test(value)) {
    throw new Error(`${label} must be a lowercase URL-safe slug`);
  }
  return value;
}

export function capabilityContentPath(contentDirectory, capabilityId) {
  const id = requireCapabilityId(capabilityId);
  const root = path.resolve(contentDirectory);
  const filename = path.resolve(root, `capability-${id}.md`);
  if (path.dirname(filename) !== root) {
    throw new Error(`capability ${id} content path escapes the content directory`);
  }
  return filename;
}
