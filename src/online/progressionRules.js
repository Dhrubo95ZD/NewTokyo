// Client-facing mirrors of the District One rules. The SQL migration remains
// authoritative; these helpers only provide immediate form feedback.
export const CURRENT_RUNNER_ROLES = Object.freeze(["striker", "guardian", "technician"]);
export const LEGACY_RUNNER_ROLES = Object.freeze(["ghost", "samurai", "netrunner", "fixer"]);
export const RUNNER_ROLES = Object.freeze([...CURRENT_RUNNER_ROLES, ...LEGACY_RUNNER_ROLES]);
export const DISTRICT_ONE_CHECKPOINTS = Object.freeze(["arrival", "skirmish", "boss"]);
export const RUNNER_CODENAME_PATTERN = /^[A-Za-z0-9_]{3,14}$/;

export function validateRunnerIdentity(value) {
  const codename = typeof value?.codename === "string" ? value.codename.trim() : "";
  const role = typeof value?.role === "string" ? value.role.trim().toLowerCase() : "";
  if (!RUNNER_CODENAME_PATTERN.test(codename)) {
    return { ok: false, error: "Codename must be 3–14 letters, numbers, or underscores." };
  }
  if (!RUNNER_ROLES.includes(role)) {
    return { ok: false, error: "Choose a supported runner role." };
  }
  return { ok: true, value: { codename, role } };
}

