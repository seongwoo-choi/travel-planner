#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";

function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

const backupFilePath = process.env.TRAVEL_BACKUP_FILE_PATH || evidencePath("travel-planner-backup.json");
const backupFileCheckPath = process.env.TRAVEL_BACKUP_FILE_CHECK_PATH || evidencePath("storage-backup-file-check.json");
const manifestPath = process.env.TRAVEL_BACKUP_MANIFEST_VERIFY_PATH || process.env.TRAVEL_BACKUP_MANIFEST_PATH || evidencePath("storage-backup-manifest.json");
const verifyOutputPath = process.env.TRAVEL_BACKUP_VERIFY_PATH || evidencePath("storage-backup-verify.json");

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const lines = [
  "# Travel Planner storage restore workflow",
  "",
  "# 1. From the webapp directory, dry-run check the downloaded full backup file.",
  `cd ${quote(webappDir)}`,
  `TRAVEL_BACKUP_FILE_PATH=${quote(backupFilePath)} TRAVEL_BACKUP_FILE_CHECK_PATH=${quote(backupFileCheckPath)} npm run storage:backup:file-check`,
  "",
  "# 2. Stop here for the actual restore mutation approval boundary.",
  "#    Do not copy or overwrite any DB until the file check is OK, the target DB path is confirmed,",
  "#    and an operator explicitly approves the external data mutation.",
  "#    If restoring to a non-default DB path, set TRAVEL_DB_PATH before starting the app or verifying.",
  "",
  "# 3. After restore, verify the current DB against the saved manifest.",
  `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=${quote(manifestPath)} TRAVEL_BACKUP_VERIFY_PATH=${quote(verifyOutputPath)} npm run storage:backup:verify`,
  "",
  "# 4. Re-run storage integrity before returning the bot/app to normal use.",
  "npm run storage:integrity",
  "# After the server starts, run npm run health:api:gate.",
  "",
  "# Notes:",
  "# - This helper prints commands only; it does not copy, overwrite, delete, or restore any DB file.",
  "# - Full backup JSON may contain travel content. Keep it in an intentional private backup location.",
  "# - Verify output files are generated evidence and are ignored by git by default.",
];

process.stdout.write(`${lines.join("\n")}\n`);
