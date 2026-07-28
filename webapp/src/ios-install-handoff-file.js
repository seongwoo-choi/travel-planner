#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

const PROTECTED_ACCESS_KEY_HANDLING = {
  placeholder: "YOUR_TRAVEL_ACCESS_KEY",
  localCompositionOnly: true,
  storesEnteredKey: false,
  sendsEnteredKeyToServer: false,
  clearsTemporaryInputAfterCopy: true,
};

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg.startsWith("--origin=")) return { ...options, origin: arg.slice("--origin=".length) };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    origin: "",
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function originFrom(value) {
  const fallback = `http://localhost:${process.env.PORT || "3000"}`;
  try {
    return new URL(value || process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN || fallback).origin;
  } catch {
    return fallback;
  }
}

function urlFor(origin, pathname) {
  return new URL(pathname, `${origin}/`).toString();
}

function accessKeyTemplateUrl(url) {
  const target = new URL(url);
  target.searchParams.set("travelAccessKey", "YOUR_TRAVEL_ACCESS_KEY");
  return target.toString();
}

function buildHandoff(origin) {
  const installUrl = urlFor(origin, "/install.html");
  const shortInstallUrl = urlFor(origin, "/i");
  return {
    generatedAt: new Date().toISOString(),
    origin,
    installUrl,
    shortInstallUrl,
    proofSaveHash: "#iosInstallProofSaveButton",
    proofSaveTargetId: "iosInstallProofSaveButton",
    proofSaveUrl: urlFor(origin, "/install.html#iosInstallProofSaveButton"),
    postInstallAppHomeUrl: urlFor(origin, "/#iosHomeDock"),
    postInstallNewPlanUrl: urlFor(origin, "/#planForm"),
    protectedInstallUrlTemplate: accessKeyTemplateUrl(installUrl),
    protectedShortInstallUrlTemplate: accessKeyTemplateUrl(shortInstallUrl),
    protectedInstallAccessKeyHandling: PROTECTED_ACCESS_KEY_HANDLING,
    qrUrl: urlFor(origin, "/api/install-qr.svg"),
    installInfoUrl: urlFor(origin, "/api/install-info.txt"),
    nextStepUrl: urlFor(origin, "/api/ios-install-next"),
    nextStepTextUrl: urlFor(origin, "/api/ios-install-next.txt"),
    runbookUrl: urlFor(origin, "/api/ios-install-runbook.txt"),
    proofSummaryUrl: urlFor(origin, "/api/ios-launch-proof.txt"),
    commands: {
      nextStep: "npm run ios:install:next",
      beforePhone: "npm run ios:install:evidence:before-phone",
      handoffSessionEvidence: "npm run ios:install:handoff-session:evidence",
      afterPhone: "npm run ios:install:evidence:after-phone",
      finalGate: "npm run ios:install:evidence:after-phone:final",
      nextStepTerminal: "test -d webapp && cd webapp; npm run ios:install:next",
      beforePhoneTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
      handoffSessionEvidenceTerminal: "test -d webapp && cd webapp; npm run ios:install:handoff-session:evidence",
      afterPhoneTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
      finalGateTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
    },
    nextActionContract: {
      phoneFirstField: "phoneFirst",
      nextCommandLabelField: "nextCommandLabel",
      nextCommandPrerequisiteField: "nextCommandPrerequisite",
      finalGateCommand: "npm run ios:install:evidence:after-phone:final",
      finalGateTerminalCommand: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
      finalGatePrerequisite: "Run only after Add to Home Screen, Travel icon launch, and install proof save.",
    },
  };
}

function renderMarkdown(handoff) {
  return `# Travel Planner iPhone install handoff

Generated: ${handoff.generatedAt}

## Open on iPhone Safari

Install URL: ${handoff.installUrl}

If this opens in KakaoTalk, Naver, Gmail, Instagram, LINE, Chrome, Firefox, or another in-app browser, copy this URL into Safari first.

Short URL: ${handoff.shortInstallUrl}

Type the short URL in Safari, not an in-app browser, before using Add to Home Screen.

Proof save URL: ${handoff.proofSaveUrl}

Proof save hash: ${handoff.proofSaveHash}

Proof save target id: ${handoff.proofSaveTargetId}

Use this proof save URL only after launching the Travel icon from the Home Screen.

Post-install app home URL: ${handoff.postInstallAppHomeUrl}

Post-install new-plan URL: ${handoff.postInstallNewPlanUrl}

Protected install URL template: ${handoff.protectedInstallUrlTemplate}

Protected short URL template: ${handoff.protectedShortInstallUrlTemplate}

Access key placeholder: ${handoff.protectedInstallAccessKeyHandling.placeholder}

Local-only key composition: ${handoff.protectedInstallAccessKeyHandling.localCompositionOnly ? "true" : "false"}

Stores entered key: ${handoff.protectedInstallAccessKeyHandling.storesEnteredKey ? "true" : "false"}

Sends entered key to server: ${handoff.protectedInstallAccessKeyHandling.sendsEnteredKeyToServer ? "true" : "false"}

Clears temporary key input after copy: ${handoff.protectedInstallAccessKeyHandling.clearsTemporaryInputAfterCopy ? "true" : "false"}

Camera QR: ${handoff.qrUrl}

## Mac commands

Before touching the phone:

\`\`\`bash
${handoff.commands.nextStep}
${handoff.commands.beforePhone}
${handoff.commands.handoffSessionEvidence}
\`\`\`

Handoff/session evidence command: ${handoff.commands.handoffSessionEvidence}

After adding to Home Screen, launching the Travel icon, and tapping install proof save:

\`\`\`bash
${handoff.commands.afterPhone}
\`\`\`

Final archive and gate:

\`\`\`bash
${handoff.commands.finalGate}
\`\`\`

Next-action contract:

- ${handoff.nextActionContract.phoneFirstField}=true means do the iPhone install and proof save first.
- ${handoff.nextActionContract.nextCommandLabelField} labels the copied Mac command.
- ${handoff.nextActionContract.nextCommandPrerequisiteField} explains when that Mac command is safe to run.
- Final gate prerequisite: ${handoff.nextActionContract.finalGatePrerequisite}

Paste-ready from repo root or webapp:

\`\`\`bash
${handoff.commands.nextStepTerminal}
${handoff.commands.beforePhoneTerminal}
${handoff.commands.handoffSessionEvidenceTerminal}
${handoff.commands.afterPhoneTerminal}
${handoff.commands.finalGateTerminal}
\`\`\`

Handoff/session evidence terminal command: ${handoff.commands.handoffSessionEvidenceTerminal}

## iPhone steps

1. Open the install URL in iPhone Safari.
2. If the link opened inside another app, copy it into Safari and continue there.
3. Tap the Safari share button.
4. Choose Add to Home Screen.
5. Tap Add.
6. Launch the Travel icon from the Home Screen.
7. Open ${handoff.proofSaveUrl} if needed, then tap install proof save in the installed app.

## After first Home Screen launch

1. Save the Home Screen launch proof.
2. Open ${handoff.postInstallAppHomeUrl} if you need to return to the Travel app home.
3. Create the first travel plan at ${handoff.postInstallNewPlanUrl} with destination, dates, companions, and travel style.
4. Reopen the plan once to confirm the Home Screen app can read recent plans and offline snapshots.
5. Use the iPhone quick-start panel if it shows another incomplete setup step.

## Server helpers

Install info: ${handoff.installInfoUrl}

Next step JSON: ${handoff.nextStepUrl}

Next step text: ${handoff.nextStepTextUrl}

Proof save URL: ${handoff.proofSaveUrl}

Proof save hash: ${handoff.proofSaveHash}

Proof save target id: ${handoff.proofSaveTargetId}

Post-install app home URL: ${handoff.postInstallAppHomeUrl}

Post-install new-plan URL: ${handoff.postInstallNewPlanUrl}

Runbook: ${handoff.runbookUrl}

Proof summary: ${handoff.proofSummaryUrl}

## Ready signal

Treat the install as complete only after the final archive and gate command passes with saved iPhone Home Screen launch proof.
`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = webappPath(
    options.output
      || (options.outputEnv ? process.env[options.outputEnv] : "")
      || options.outputDefault,
  );
  const handoff = buildHandoff(originFrom(options.origin));
  const body = renderMarkdown(handoff);
  if (outputPath) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, body, "utf8");
    console.error(`ios-install-handoff=${outputPath}`);
  }
  console.log(body.trimEnd());
}

main();
