export const SUMMARY_ROLE_EVIDENCE_FIELDS = [
  { label: 'Manifest summary role index expected', kind: 'roleIndexObject' },
  { label: 'Manifest summary role index recorded', kind: 'roleIndexObject' },
  { label: 'Manifest summary role index failures', kind: 'stringList' },
  { label: 'Manifest summary role index failure details', kind: 'failureDetailList' },
];
export const CHECK_FIELD_REASON_VALUES = Object.freeze([
  'accepted',
  'missing',
  'disallowed-placeholder',
  'invalid-summary-role-evidence-shape',
]);
export const REJECTED_FIELD_REASON_VALUES = Object.freeze([
  'missing',
  'disallowed-placeholder',
  'invalid-summary-role-evidence-shape',
]);
export const HANDOFF_CHECK_FIELD_REASON_VALUES = Object.freeze(
  CHECK_FIELD_REASON_VALUES.filter((reason) => reason !== 'disallowed-placeholder'),
);
export const HANDOFF_REJECTED_FIELD_REASON_VALUES = Object.freeze(
  REJECTED_FIELD_REASON_VALUES.filter((reason) => reason !== 'disallowed-placeholder'),
);
export const CHECK_FIELD_REASONS = new Set(CHECK_FIELD_REASON_VALUES);
export const REJECTED_FIELD_REASONS = new Set(REJECTED_FIELD_REASON_VALUES);

export const SOURCE_CHECK_PAYLOAD_FIELDS = Object.freeze({
  configured: 'configured',
  present: 'present',
  path: 'path',
  status: 'status',
  blocksReadiness: 'blocksReadiness',
  fields: 'fields',
  fieldMetadataAvailable: 'fieldMetadataAvailable',
  statusGuidance: 'statusGuidance',
  errorsBySection: 'errorsBySection',
  missingFieldsBySection: 'missingFieldsBySection',
  rejectedFields: 'rejectedFields',
  rejectedFieldCount: 'rejectedFieldCount',
  rejectedFieldReasons: 'rejectedFieldReasons',
  rejectedFieldReasonEntries: 'rejectedFieldReasonEntries',
});

export const SOURCE_CHECK_PAYLOAD_REQUIRED_FIELDS = Object.freeze(
  Object.values(SOURCE_CHECK_PAYLOAD_FIELDS),
);

export const SOURCE_CHECK_FIELD_FIELDS = Object.freeze({
  present: 'present',
  accepted: 'accepted',
  label: 'label',
  section: 'section',
  scope: 'scope',
  reason: 'reason',
});

export const SOURCE_CHECK_FIELD_REQUIRED_FIELDS = Object.freeze(
  Object.values(SOURCE_CHECK_FIELD_FIELDS),
);

export const REJECTED_FIELD_FIELDS = Object.freeze({
  label: 'label',
  section: 'section',
  scope: 'scope',
  reason: 'reason',
});

export const REJECTED_FIELD_REQUIRED_FIELDS = Object.freeze(
  Object.values(REJECTED_FIELD_FIELDS),
);

export const REJECTED_FIELD_REASON_ENTRY_FIELDS = Object.freeze({
  reason: 'reason',
  count: 'count',
});

export const REJECTED_FIELD_REASON_ENTRY_REQUIRED_FIELDS = Object.freeze(
  Object.values(REJECTED_FIELD_REASON_ENTRY_FIELDS),
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringListRecord(value) {
  return (
    isObject(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => isStringList(item))
  );
}

function isSummaryRoleIndexFailureDetail(value) {
  return (
    isObject(value) &&
    typeof value.failure === 'string' &&
    (typeof value.role === 'string' || value.role === null) &&
    isStringList(value.expected) &&
    isStringList(value.recorded) &&
    (!Object.prototype.hasOwnProperty.call(value, 'expectedRoles') ||
      isStringList(value.expectedRoles)) &&
    (!Object.prototype.hasOwnProperty.call(value, 'recordedRoles') ||
      isStringList(value.recordedRoles))
  );
}

function isSummaryRoleIndexFailureDetailList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((detail) => isSummaryRoleIndexFailureDetail(detail))
  );
}

export function summaryRoleEvidenceValueAccepted(value, kind) {
  const trimmedValue = value.trim();

  if (trimmedValue.toLowerCase() === 'none') {
    return true;
  }

  let parsedValue;

  try {
    parsedValue = JSON.parse(trimmedValue);
  } catch {
    return false;
  }

  if (kind === 'roleIndexObject') {
    return isStringListRecord(parsedValue);
  }

  if (kind === 'stringList') {
    return isStringList(parsedValue) && parsedValue.length > 0;
  }

  if (kind === 'failureDetailList') {
    return isSummaryRoleIndexFailureDetailList(parsedValue);
  }

  return false;
}

export function buildRejectedFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) =>
      field &&
      typeof field === 'object' &&
      field[SOURCE_CHECK_FIELD_FIELDS.accepted] === false &&
      typeof field[SOURCE_CHECK_FIELD_FIELDS.label] === 'string' &&
      (typeof field[SOURCE_CHECK_FIELD_FIELDS.section] === 'string' ||
        field[SOURCE_CHECK_FIELD_FIELDS.section] === null) &&
      (typeof field[SOURCE_CHECK_FIELD_FIELDS.scope] === 'string' ||
        field[SOURCE_CHECK_FIELD_FIELDS.scope] === null) &&
      typeof field[SOURCE_CHECK_FIELD_FIELDS.reason] === 'string'
    )
    .map((field) => ({
      [REJECTED_FIELD_FIELDS.label]: field[SOURCE_CHECK_FIELD_FIELDS.label],
      [REJECTED_FIELD_FIELDS.section]: field[SOURCE_CHECK_FIELD_FIELDS.section],
      [REJECTED_FIELD_FIELDS.scope]: field[SOURCE_CHECK_FIELD_FIELDS.scope],
      [REJECTED_FIELD_FIELDS.reason]: field[SOURCE_CHECK_FIELD_FIELDS.reason],
    }));
}

export function buildRejectedFieldReasons(rejectedFields) {
  if (!Array.isArray(rejectedFields)) return {};

  const counts = rejectedFields.reduce((reasonCounts, field) => {
    if (!field || typeof field !== 'object') return reasonCounts;
    if (typeof field[REJECTED_FIELD_FIELDS.reason] !== 'string') return reasonCounts;

    reasonCounts[field[REJECTED_FIELD_FIELDS.reason]] =
      (reasonCounts[field[REJECTED_FIELD_FIELDS.reason]] || 0) + 1;

    return reasonCounts;
  }, Object.create(null));

  return Object.fromEntries(Object.entries(counts));
}

export function buildRejectedFieldReasonEntries(rejectedFieldReasons) {
  if (
    !rejectedFieldReasons ||
    typeof rejectedFieldReasons !== 'object' ||
    Array.isArray(rejectedFieldReasons)
  ) {
    return [];
  }

  const reasonOrder = new Map(
    REJECTED_FIELD_REASON_VALUES.map((reason, index) => [reason, index]),
  );

  return Object.entries(rejectedFieldReasons)
    .filter(([reason, count]) =>
      REJECTED_FIELD_REASONS.has(reason) &&
      Number.isInteger(count) &&
      count > 0
    )
    .map(([reason, count]) => ({
      [REJECTED_FIELD_REASON_ENTRY_FIELDS.reason]: reason,
      [REJECTED_FIELD_REASON_ENTRY_FIELDS.count]: count,
    }))
    .sort((left, right) =>
      reasonOrder.get(left[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason]) -
        reasonOrder.get(right[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason])
    );
}
