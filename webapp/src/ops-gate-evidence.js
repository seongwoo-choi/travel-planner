#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GATES = {
  health: {
    label: 'Health API gate',
    args: ['run', 'health:api:gate'],
    evidenceEnv: { TRAVEL_HEALTH_EVIDENCE: '1' },
    defaultOutput: 'reports/health-api-gate.txt',
    envSummary: [
      { name: 'TRAVEL_HEALTH_URL' },
      { name: 'TRAVEL_PUBLIC_BASE_URL' },
      { name: 'TRAVEL_HEALTH_TIMEOUT_MS' },
    ],
  },
  api: {
    label: 'Protected API gate',
    args: ['run', 'api:quality-gates:gate'],
    evidenceEnv: { TRAVEL_API_FETCH_EVIDENCE: '1' },
    defaultOutput: 'reports/api-quality-gates.txt',
    envSummary: [
      { name: 'TRAVEL_PUBLIC_BASE_URL' },
      { name: 'TRAVEL_ACCESS_KEY', mode: 'presence' },
      { name: 'TRAVEL_API_FETCH_TIMEOUT_MS' },
    ],
  },
};

function parseArgs(argv) {
  const args = {
    gate: '',
    outputPath: '',
    outputEnv: '',
    outputDefault: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--gate=')) {
      args.gate = arg.slice('--gate='.length);
    } else if (arg.startsWith('--output=')) {
      args.outputPath = arg.slice('--output='.length);
    } else if (arg.startsWith('--output-env=')) {
      args.outputEnv = arg.slice('--output-env='.length);
    } else if (arg.startsWith('--output-default=')) {
      args.outputDefault = arg.slice('--output-default='.length);
    } else if (arg.startsWith('--output-default-evidence=')) {
      args.outputDefaultEvidence = arg.slice('--output-default-evidence='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.gate || !GATES[args.gate]) {
    throw new Error(`Expected --gate to be one of: ${Object.keys(GATES).join(', ')}`);
  }

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || '';
  }

  if (!args.outputPath && args.outputDefault) {
    args.outputPath = args.outputDefault;
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || 'reports',
      args.outputDefaultEvidence,
    );
  }

  if (!args.outputPath) {
    args.outputPath = GATES[args.gate].defaultOutput;
  }

  return args;
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

function renderEnvSummary(gate, env) {
  return (gate.envSummary || [])
    .map((item) => {
      if (item.mode === 'presence') {
        return `- ${item.name}: ${env[item.name] ? 'configured' : 'missing'}`;
      }

      return `- ${item.name}: ${env[item.name] || 'unset'}`;
    })
    .join('\n');
}

function buildEvidence(gate, result, env) {
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const generatedAt = new Date().toISOString();
  const envSummary = renderEnvSummary(gate, env);

  return `# Gate Evidence

- Gate: ${gate.label}
- Command: npm ${gate.args.join(' ')}
- Generated at: ${generatedAt}
- Exit code: ${exitCode}
- Signal: ${result.signal || ''}
- Error: ${result.error ? result.error.message : ''}

## Environment summary

${envSummary || '- No environment summary configured.'}

## stdout

${result.stdout || ''}

## stderr

${result.stderr || ''}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const gate = GATES[args.gate];
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, gate.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...gate.evidenceEnv,
    },
    encoding: 'utf8',
  });
  const contents = buildEvidence(gate, result, process.env);
  const exitCode = typeof result.status === 'number' ? result.status : 1;

  writeOutput(args.outputPath, contents);
  process.stdout.write(contents);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

try {
  main();
} catch (error) {
  console.error(`ops-gate-evidence failed: ${error.message}`);
  process.exitCode = 1;
}
