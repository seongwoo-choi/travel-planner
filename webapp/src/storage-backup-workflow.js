#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const baseUrl = process.env.TRAVEL_PUBLIC_BASE_URL || "http://localhost:3000";
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";

function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

const manifestPath = process.env.TRAVEL_BACKUP_MANIFEST_PATH || evidencePath("storage-backup-manifest.json");
const verifyPath = process.env.TRAVEL_BACKUP_MANIFEST_VERIFY_PATH || manifestPath;
const backupFilePath = process.env.TRAVEL_BACKUP_FILE_PATH || evidencePath("travel-planner-backup.json");
const backupFileCheckPath = process.env.TRAVEL_BACKUP_FILE_CHECK_PATH || evidencePath("storage-backup-file-check.json");
const verifyOutputPath = process.env.TRAVEL_BACKUP_VERIFY_PATH || evidencePath("storage-backup-verify.json");

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const lines = [
  "# Travel Planner storage backup workflow",
  "",
  "# 1. From the webapp directory, confirm storage is structurally healthy.",
  `cd ${quote(webappDir)}`,
  "npm run storage:integrity",
  "",
  "# 2. Capture a content-free manifest before exporting or handing off the DB.",
  `TRAVEL_BACKUP_MANIFEST_PATH=${quote(manifestPath)} npm run storage:backup:manifest`,
  "",
  "# 3. Export the full backup JSON from a running server when needed.",
  `TRAVEL_PUBLIC_BASE_URL=${quote(baseUrl)} node src/api-fetch.js /api/backup --output=${quote(backupFilePath)}`,
  "",
  "# 4. Dry-run check the downloaded backup file before restore.",
  `TRAVEL_BACKUP_FILE_PATH=${quote(backupFilePath)} TRAVEL_BACKUP_FILE_CHECK_PATH=${quote(backupFileCheckPath)} npm run storage:backup:file-check`,
  "",
  "# 5. After restore or handoff, verify the current DB against the saved manifest.",
  `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=${quote(verifyPath)} TRAVEL_BACKUP_VERIFY_PATH=${quote(verifyOutputPath)} npm run storage:backup:verify`,
  "",
  "# Notes:",
  "# - Manifest files include path, bytes, SHA-256, plan count, and latest updatedAt, but not travel content.",
  "# - File-check and verify outputs are generated evidence files and are ignored by git by default.",
  "# - When TRAVEL_ACCESS_KEY is set, api-fetch sends X-Travel-Access-Key without printing the secret value.",
  "# - Use TRAVEL_DB_PATH before the verify command when checking a restored DB at a non-default path.",
  "# - Move long-lived evidence into an intentional docs/artifact location before sharing.",
];

process.stdout.write(`${lines.join("\n")}\n`);
