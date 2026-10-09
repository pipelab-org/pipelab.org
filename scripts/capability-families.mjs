import { requireCapabilityId } from "./capability-id.mjs";

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

export function parseCapabilityFamilyMap(input) {
  const value = typeof input === "string" || Buffer.isBuffer(input) ? JSON.parse(input) : input;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("capability family map must be an object");
  }
  if (value.schema_version !== 1) throw new Error("capability family schema version is unsupported");
  if (!Array.isArray(value.families) || value.families.length === 0) {
    throw new Error("capability family map must contain families");
  }

  const familyIds = new Set();
  const capabilityIds = new Set();
  for (const [index, family] of value.families.entries()) {
    if (!family || Array.isArray(family) || typeof family !== "object") {
      throw new Error(`capability family ${index} must be an object`);
    }
    const familyId = requireString(family.id, `capability family ${index} id`);
    if (familyIds.has(familyId)) throw new Error(`duplicate capability family ${familyId}`);
    familyIds.add(familyId);
    requireString(family.number, `${familyId} number`);
    requireString(family.eyebrow, `${familyId} eyebrow`);
    requireString(family.title, `${familyId} title`);
    requireString(family.description, `${familyId} description`);
    if (!Array.isArray(family.capabilities) || family.capabilities.length === 0) {
      throw new Error(`${familyId} must name at least one capability`);
    }
    for (const capabilityId of family.capabilities) {
      const id = requireCapabilityId(capabilityId, `${familyId} capability id`);
      if (capabilityIds.has(id)) throw new Error(`capability ${id} belongs to more than one family`);
      capabilityIds.add(id);
    }
  }
  return value;
}
