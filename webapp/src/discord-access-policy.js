export function configuredIdentityAllowed(configuredIds, actualId) {
  return Array.isArray(configuredIds)
    && configuredIds.length > 0
    && configuredIds.includes(String(actualId || ""));
}
