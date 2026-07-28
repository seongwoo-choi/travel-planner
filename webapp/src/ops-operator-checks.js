export const EVIDENCE_DEFAULTS_OPERATOR_CHECK = Object.freeze({
  id: "evidenceDefaults",
  label: "Evidence defaults check",
  command: "npm run ops:evidence:defaults:check",
  acceptance:
    "Evidence :file scripts and preflight summary aliases keep TRAVEL_EVIDENCE_DIR defaults before evidence generation starts.",
  target: "evidence-defaults",
});

export const OPERATOR_CHECKS = Object.freeze([
  EVIDENCE_DEFAULTS_OPERATOR_CHECK,
]);

export const EXPECTED_OPERATOR_CHECKS = Object.freeze(
  Object.fromEntries(
    OPERATOR_CHECKS.map((check) => [
      check.id,
      {
        command: check.command,
        target: check.target,
      },
    ]),
  ),
);
