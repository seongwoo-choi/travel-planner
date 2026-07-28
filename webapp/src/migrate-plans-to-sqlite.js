import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrateJsonPlansToSqlite } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(webappRoot, process.argv[2] || "data/plans.json");
const targetPath = path.resolve(webappRoot, process.argv[3] || "data/plans.sqlite");

try {
  const result = await migrateJsonPlansToSqlite(sourcePath, targetPath);
  console.log(`Migrated ${result.planCount} plans from ${result.sourcePath} to ${result.targetPath}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
