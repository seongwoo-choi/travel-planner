#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    outputPath: "",
    outputEnv: "",
    outputDefaultEvidence: "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--output=")) {
      args.outputPath = arg.slice("--output=".length);
    } else if (arg.startsWith("--output-env=")) {
      args.outputEnv = arg.slice("--output-env=".length);
    } else if (arg.startsWith("--output-default-evidence=")) {
      args.outputDefaultEvidence = arg.slice("--output-default-evidence=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || "";
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || "reports",
      args.outputDefaultEvidence,
    );
  }

  return args;
}

function buildSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://travel-planner.local/schemas/ops-evidence-manifest-check.schema.json",
    title: "Travel Planner evidence manifest check result",
    metadata: {
      target: "evidence-manifest-check-result",
      artifact: "ops-evidence-manifest-check.json",
      validatesTarget: "evidence-manifest",
      operatorCheckFailureFields: {
        failures: "operatorCheckFailures",
        details: "operatorCheckFailureDetails",
      },
    },
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "checkedAt",
      "status",
      "manifestPath",
      "manifestGeneratedAt",
      "evidenceDir",
      "operatorCheckFailures",
      "operatorCheckFailureDetails",
      "summaryRoleArtifactsExpected",
      "summaryRoleArtifacts",
      "summaryRoleIndexFailures",
      "summaryRoleIndexFailureDetails",
      "failures",
      "metadataFailures",
      "failureKinds",
      "failureKindArtifacts",
      "artifacts",
    ],
    properties: {
      schemaVersion: { const: 1 },
      checkedAt: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["ok", "failed"] },
      manifestPath: { type: "string" },
      manifestGeneratedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
      evidenceDir: { type: "string" },
      operatorCheckFailures: { $ref: "#/$defs/stringList" },
      operatorCheckFailureDetails: {
        type: "array",
        items: { $ref: "#/$defs/operatorCheckFailureDetail" },
      },
      summaryRoleArtifactsExpected: { $ref: "#/$defs/roleArtifactMap" },
      summaryRoleArtifacts: { $ref: "#/$defs/roleArtifactMap" },
      summaryRoleIndexFailures: { $ref: "#/$defs/stringList" },
      summaryRoleIndexFailureDetails: {
        type: "array",
        items: { $ref: "#/$defs/summaryRoleIndexFailureDetail" },
      },
      failures: { $ref: "#/$defs/stringList" },
      metadataFailures: { $ref: "#/$defs/stringList" },
      failureKinds: { $ref: "#/$defs/failureKinds" },
      failureKindArtifacts: { $ref: "#/$defs/failureKindArtifacts" },
      artifacts: {
        type: "array",
        items: { $ref: "#/$defs/artifactCheck" },
      },
    },
    $defs: {
      stringList: {
        type: "array",
        items: { type: "string" },
      },
      roleArtifactMap: {
        type: "object",
        additionalProperties: { $ref: "#/$defs/stringList" },
      },
      summaryRoleIndexFailureDetail: {
        type: "object",
        additionalProperties: false,
        required: ["failure", "role", "expected", "recorded", "expectedRoles", "recordedRoles"],
        properties: {
          failure: { type: "string" },
          role: { anyOf: [{ type: "string" }, { type: "null" }] },
          expected: { $ref: "#/$defs/stringList" },
          recorded: { $ref: "#/$defs/stringList" },
          expectedRoles: { $ref: "#/$defs/stringList" },
          recordedRoles: { $ref: "#/$defs/stringList" },
        },
      },
      operatorCheckFailureDetail: {
        type: "object",
        additionalProperties: false,
        required: ["failure", "id", "field", "expected", "recorded"],
        properties: {
          failure: { type: "string" },
          id: { anyOf: [{ type: "string" }, { type: "null" }] },
          field: { anyOf: [{ type: "string" }, { type: "null" }] },
          expected: { anyOf: [{ type: "string" }, { type: "null" }] },
          recorded: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
      failureKinds: {
        type: "object",
        additionalProperties: false,
        required: ["metadata", "summaryRoleIndex", "operatorChecks", "missing", "notAFile", "bytes", "sha256", "presence", "other"],
        properties: {
          metadata: { type: "number" },
          summaryRoleIndex: { type: "number" },
          operatorChecks: { type: "number" },
          missing: { type: "number" },
          notAFile: { type: "number" },
          bytes: { type: "number" },
          sha256: { type: "number" },
          presence: { type: "number" },
          other: { type: "number" },
        },
      },
      failureKindArtifacts: {
        type: "object",
        additionalProperties: false,
        required: ["metadata", "summaryRoleIndex", "operatorChecks", "missing", "notAFile", "bytes", "sha256", "presence", "other"],
        properties: {
          metadata: { $ref: "#/$defs/stringList" },
          summaryRoleIndex: { $ref: "#/$defs/stringList" },
          operatorChecks: { $ref: "#/$defs/stringList" },
          missing: { $ref: "#/$defs/stringList" },
          notAFile: { $ref: "#/$defs/stringList" },
          bytes: { $ref: "#/$defs/stringList" },
          sha256: { $ref: "#/$defs/stringList" },
          presence: { $ref: "#/$defs/stringList" },
          other: { $ref: "#/$defs/stringList" },
        },
      },
      artifactCheck: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "path", "status", "errors", "expected", "actual"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          status: { type: "string", enum: ["ok", "failed"] },
          errors: { $ref: "#/$defs/stringList" },
          expected: {
            type: "object",
            additionalProperties: true,
            properties: {
              present: { type: "boolean" },
              bytes: { type: "number" },
              sha256: { anyOf: [{ type: "string" }, { type: "null" }] },
              modifiedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
              metadata: { $ref: "#/$defs/metadataSnapshot" },
            },
          },
          actual: {
            type: "object",
            additionalProperties: true,
            properties: {
              present: { type: "boolean" },
              bytes: { type: "number" },
              sha256: { anyOf: [{ type: "string" }, { type: "null" }] },
              modifiedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
      },
      metadataSnapshot: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: true,
            properties: {
              artifactKind: { anyOf: [{ type: "string" }, { type: "null" }] },
              target: { anyOf: [{ type: "string" }, { type: "null" }] },
              validatesTarget: { anyOf: [{ type: "string" }, { type: "null" }] },
              summaryRoles: {
                anyOf: [
                  { $ref: "#/$defs/stringList" },
                  { type: "null" },
                ],
              },
              required: {
                type: "object",
                additionalProperties: true,
                properties: {
                  artifactKind: { type: "string" },
                  target: { type: "string" },
                  validatesTarget: { type: "string" },
                  summaryRoles: { $ref: "#/$defs/stringList" },
                },
              },
            },
          },
        ],
      },
    },
  };
}

function writeOutput(outputPath, contents) {
  const absolutePath = path.resolve(process.cwd(), outputPath);
  const outputDir = path.dirname(absolutePath);
  const tempPath = `${absolutePath}.tmp-${process.pid}`;

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(tempPath, contents);
    fs.renameSync(tempPath, absolutePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = `${JSON.stringify(buildSchema(), null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, output);
  }

  process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(`ops-evidence-manifest-check-schema failed: ${error.message}`);
  process.exitCode = 1;
}
