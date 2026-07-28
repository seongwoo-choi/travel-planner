import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webappDir = path.resolve(__dirname, "..");

function valueAfterEquals(arg, name) {
  return arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : "";
}

function parseArgs(args) {
  const options = {
    outputEnv: "",
    outputDefaultEvidence: "ios-install-session.schema.json",
  };
  for (const arg of args) {
    options.outputEnv = valueAfterEquals(arg, "--output-env") || options.outputEnv;
    options.outputDefaultEvidence = valueAfterEquals(arg, "--output-default-evidence") || options.outputDefaultEvidence;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(
  webappDir,
  process.env[options.outputEnv] || path.join("reports", options.outputDefaultEvidence)
);
const sourcePath = path.join(__dirname, "ios-install-session.schema.json");

mkdirSync(path.dirname(outputPath), { recursive: true });
copyFileSync(sourcePath, outputPath);
console.log(`ios-install-session-schema=${outputPath}`);
