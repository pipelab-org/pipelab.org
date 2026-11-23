export function stagingFailureLabel(error, fallback = "operation") {
  const controls = new Map([
    ["staging account id not configured", "target"], ["unexpected staging account or Worker", "target"],
    ["staging source configuration differs from target", "configuration"], ["staging environment protection differs", "environment"],
    ["staging environment authority unavailable", "environment"], ["Wrangler distribution integrity differs", "tooling_integrity"],
    ["Wrangler distribution unavailable", "tooling_integrity"], ["verified Wrangler operation failed", "tooling"],
    ["staging private clearance malformed", "clearance"], ["staging private clearance signature malformed", "clearance"],
    ["staging clearance key not configured", "clearance"], ["staging private clearance source not configured", "clearance"], ["staging private clearance binding differs", "clearance"],
    ["staging private clearance ledger differs", "clearance"], ["staging ledger authority unavailable", "ledger"],
    ["staging ledger source not configured", "ledger"], ["staging base must equal production main", "source"],
    ["staging custom domain or zone routes differ from target", "ingress"], ["staging ingress inventory unavailable", "ingress"],
    ["untrusted prepared staging artifact", "artifact_provenance"], ["prepared staging archive digest differs", "archive_digest"],
    ["prepared staging archive redirect refused", "artifact_origin"], ["prepared staging archive download refused", "artifact_download"],
    ["staging version outside deployable window", "version_deployability"], ["unknown staging version or upload receipt", "upload_receipt"],
    ["staging hosting inventory incomplete", "ingress"], ["upload version or package changed", "upload_copy"], ["untrusted Wrangler upload result", "upload_receipt"],
    ["staging hosting API failed", "hosting"], ["staging convergence deadline expired or cancelled", "live_convergence"],
    ["Hub withdrawal could not be confirmed", "closure"], ["direct staging deploy is disabled", "direct_deployment"],
  ]);
  return controls.get(error?.message) ?? fallback;
}
