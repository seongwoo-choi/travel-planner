export const IOS_INSTALL_NEXT_COMMANDS = {
  beforePhone: "npm run ios:install:evidence:before-phone",
  afterPhone: "npm run ios:install:evidence:after-phone",
  afterPhoneFinal: "npm run ios:install:evidence:after-phone:final",
  handoffEvidence: "npm run ios:install:handoff:evidence",
  sessionEvidence: "npm run ios:install:session:evidence",
  handoffSessionEvidence: "npm run ios:install:handoff-session:evidence",
  sessionCheckSchema: "npm run ios:install:session:check:schema:file",
  finalGate: "npm run ios:install:evidence:after-phone:final",
  beforePhoneTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
  afterPhoneTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
  afterPhoneFinalTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
  handoffEvidenceTerminal: "test -d webapp && cd webapp; npm run ios:install:handoff:evidence",
  sessionEvidenceTerminal: "test -d webapp && cd webapp; npm run ios:install:session:evidence",
  handoffSessionEvidenceTerminal: "test -d webapp && cd webapp; npm run ios:install:handoff-session:evidence",
  sessionCheckSchemaTerminal: "test -d webapp && cd webapp; npm run ios:install:session:check:schema:file",
  finalGateTerminal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
};

export function isIosInstallReportReady(report) {
  return Boolean(report?.ok && report.data?.ok === true);
}

const INSTALL_START_FRESH_AFTER_HOURS = 24;

function buildInstallStartFreshness(modifiedAt) {
  const modifiedAtMs = Date.parse(modifiedAt || "");
  if (!Number.isFinite(modifiedAtMs)) {
    return {
      state: "unknown",
      ageHours: null,
      staleAfterHours: INSTALL_START_FRESH_AFTER_HOURS,
    };
  }

  const ageHours = Math.max(0, (Date.now() - modifiedAtMs) / (60 * 60 * 1000));
  return {
    state: ageHours <= INSTALL_START_FRESH_AFTER_HOURS ? "fresh" : "stale",
    ageHours: Number(ageHours.toFixed(2)),
    staleAfterHours: INSTALL_START_FRESH_AFTER_HOURS,
  };
}

function buildInstallStartRecommendation(summary) {
  if (!summary.ok) {
    return {
      action: "Run before-phone evidence to generate a current install-start handoff before opening the iPhone URL.",
      command: IOS_INSTALL_NEXT_COMMANDS.beforePhoneTerminal,
    };
  }
  if (summary.freshnessState === "stale") {
    return {
      action: "Regenerate before-phone evidence before using this install-start URL on the iPhone.",
      command: IOS_INSTALL_NEXT_COMMANDS.beforePhoneTerminal,
    };
  }
  if (summary.readiness === "same-wifi-rehearsal") {
    return {
      action: "Use this only as a same-Wi-Fi rehearsal, or configure TRAVEL_PLANNER_PUBLIC_ORIGIN with HTTPS before final Home Screen evidence.",
      command: "npm run ios:install:start:gate",
    };
  }
  return {
    action: "Run the named final pre-phone sequence, confirm it passes, then open the saved iPhone Safari URL.",
    command: summary.beforePhoneFinalThenNextTerminalCommand
      || "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final:next",
  };
}

function buildInstallStartSummary(report) {
  const data = report?.data || {};
  const freshness = buildInstallStartFreshness(report?.modifiedAt || "");
  const summary = {
    ok: report?.ok === true,
    state: report?.state || "",
    path: report?.path || "",
    modifiedAt: report?.modifiedAt || "",
    freshnessState: freshness.state,
    freshnessAgeHours: freshness.ageHours,
    freshnessStaleAfterHours: freshness.staleAfterHours,
    readiness: data.readiness || "",
    warning: data.warning || "",
    recommendedShortInstallUrl: data.recommendedShortInstallUrl || "",
    recommendedInstallUrl: data.recommendedInstallUrl || "",
    sessionQrUrl: data.sessionQrUrl || "",
    nextActionBoardUrl: data.nextActionBoardUrl || "",
    proofSaveHash: data.proofSaveHash || "",
    proofSaveTargetId: data.proofSaveTargetId || "",
    proofSaveUrl: data.proofSaveUrl || "",
    postInstallAppHomeUrl: data.postInstallAppHomeUrl || "",
    postInstallNewPlanUrl: data.postInstallNewPlanUrl || "",
    appHomeFirstPlanUrl: data.appHomeFirstPlanUrl || "",
    beforePhoneTerminalCommand: data.commands?.beforePhone || "",
    beforePhoneFinalTerminalCommand: data.commands?.beforePhoneFinal || "",
    beforePhoneFinalThenNextTerminalCommand: data.commands?.beforePhoneFinalThenNext || "",
    afterPhoneThenAllTerminalCommand: data.commands?.afterPhoneThenAll || "",
    afterPhoneThenAllFinalTerminalCommand: data.commands?.afterPhoneThenAllFinal || "",
    stepCount: Array.isArray(data.steps) ? data.steps.length : 0,
  };
  const recommendation = buildInstallStartRecommendation(summary);
  return {
    ...summary,
    recommendedAction: recommendation.action,
    recommendedCommand: recommendation.command,
  };
}

function summaryCheckFinalCommandMatches(report) {
  return report?.data?.expectedFinalEvidenceCommand === IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinal
    && report?.data?.finalEvidenceCommand === IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinal;
}

function buildSessionCheckSummary(report) {
  const data = report?.data || {};
  const ok = report?.ok === true && data.ok === true;
  return {
    ok,
    state: report?.state || "",
    path: report?.path || "",
    modifiedAt: report?.modifiedAt || "",
    status: data.status || "",
    recoveryUrl: data.recoveryUrl || "",
    recoveryTriggerField: data.recoveryTriggerField || "",
    recoveryTriggerValue: data.recoveryTriggerValue === true,
    recoverySequenceCount: data.recoverySequenceCount || 0,
    finalGateCommand: data.finalGateCommand || "",
    issueCount: Array.isArray(data.issues) ? data.issues.length : 0,
    recommendedCommand: ok ? "" : IOS_INSTALL_NEXT_COMMANDS.sessionEvidenceTerminal,
    recommendedNpmScript: ok ? "" : IOS_INSTALL_NEXT_COMMANDS.sessionEvidence,
  };
}

export function buildIosInstallNextStep({ reports, outputReports = reports, installTarget = {} }) {
  const installStart = buildInstallStartSummary(reports.installStart);
  const sessionCheck = buildSessionCheckSummary(reports.sessionCheck);
  const base = {
    schemaVersion: 1,
    commands: IOS_INSTALL_NEXT_COMMANDS,
    installTarget,
    installStart,
    sessionCheck,
    reports: outputReports,
  };

  if (reports.summaryCheck?.data?.ok === true
    && reports.summaryCheck?.data?.status === "ready"
    && summaryCheckFinalCommandMatches(reports.summaryCheck)) {
    return {
      ...base,
      action: "complete",
      title: "iPhone install evidence is complete.",
      nextCommand: "",
      nextTerminalCommand: "",
      nextCommandLabel: "",
      nextCommandPrerequisite: "",
      phoneFirst: false,
      phoneStep: "Open the installed Travel icon and keep using the app.",
    };
  }

  if (isIosInstallReportReady(reports.proof) && isIosInstallReportReady(reports.launchProofCheck)) {
    return {
      ...base,
      action: "run-final-gate",
      title: "Home Screen proof is saved. Run the final HTTPS after-phone archive/gate sequence.",
      nextCommand: IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinal,
      nextTerminalCommand: IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinalTerminal,
      nextCommandLabel: "Mac final HTTPS after-phone archive/gate sequence",
      nextCommandPrerequisite: "The iPhone Home Screen launch proof is already saved.",
      phoneFirst: false,
      phoneStep: "After the command passes, tap 최종 gate 결과 새로고침 in the iPhone install card.",
    };
  }

  if (isIosInstallReportReady(reports.strict) && !sessionCheck.ok) {
    return {
      ...base,
      action: "run-before-phone",
      title: "Pre-install readiness passed, but the install session recovery contract needs evidence.",
      nextCommand: IOS_INSTALL_NEXT_COMMANDS.sessionEvidence,
      nextTerminalCommand: IOS_INSTALL_NEXT_COMMANDS.sessionEvidenceTerminal,
      nextCommandLabel: "Mac install session recovery evidence command",
      nextCommandPrerequisite: "Run this before opening the iPhone URL so the session includes structured appShellRecovery metadata.",
      phoneFirst: false,
      phoneStep: "Wait to install on the iPhone until session evidence is ready and the next action says to install on phone.",
    };
  }

  if (isIosInstallReportReady(reports.strict)) {
    return {
      ...base,
      action: "install-on-phone",
      title: "Pre-install readiness passed. Install on the iPhone, save proof, then run the final Mac gate.",
      nextCommand: IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinal,
      nextTerminalCommand: IOS_INSTALL_NEXT_COMMANDS.afterPhoneFinalTerminal,
      nextCommandLabel: "Mac final HTTPS after-phone sequence after iPhone proof",
      nextCommandPrerequisite: "Run this Mac sequence only after Add to Home Screen, launch, and 설치 증거 저장 are complete.",
      phoneFirst: true,
      phoneStep: "Open the iPhone install URL in Safari, Add to Home Screen, launch Travel, tap 설치 증거 저장, then run the copied final Mac command.",
    };
  }

  return {
    ...base,
    action: "run-before-phone",
    title: "Start with the pre-install readiness evidence command.",
    nextCommand: IOS_INSTALL_NEXT_COMMANDS.beforePhone,
    nextTerminalCommand: IOS_INSTALL_NEXT_COMMANDS.beforePhoneTerminal,
    nextCommandLabel: "Mac pre-install readiness command",
    nextCommandPrerequisite: "",
    phoneFirst: false,
    phoneStep: "Wait to install on the iPhone until this command passes and shows a reachable install URL.",
  };
}

export function buildIosInstallNextStepText(next) {
  return [
    `action=${next.action || ""}`,
    `title=${next.title || ""}`,
    `nextCommand=${next.nextCommand || ""}`,
    `nextTerminalCommand=${next.nextTerminalCommand || ""}`,
    `nextCommandLabel=${next.nextCommandLabel || ""}`,
    `nextCommandPrerequisite=${next.nextCommandPrerequisite || ""}`,
    `phoneFirst=${next.phoneFirst ? "true" : "false"}`,
    `phoneStep=${next.phoneStep || ""}`,
    `installUrl=${next.installTarget?.installUrl || ""}`,
    `shortInstallUrl=${next.installTarget?.shortInstallUrl || ""}`,
    `qrUrl=${next.installTarget?.qrUrl || ""}`,
    `proofSaveHash=${next.installTarget?.proofSaveHash || ""}`,
    `proofSaveTargetId=${next.installTarget?.proofSaveTargetId || ""}`,
    `proofSaveUrl=${next.installTarget?.proofSaveUrl || ""}`,
    `handoffEvidenceCommand=${next.commands?.handoffEvidence || ""}`,
    `handoffEvidenceTerminalCommand=${next.commands?.handoffEvidenceTerminal || ""}`,
    `sessionEvidenceCommand=${next.commands?.sessionEvidence || ""}`,
    `sessionEvidenceTerminalCommand=${next.commands?.sessionEvidenceTerminal || ""}`,
    `handoffSessionEvidenceCommand=${next.commands?.handoffSessionEvidence || ""}`,
    `handoffSessionEvidenceTerminalCommand=${next.commands?.handoffSessionEvidenceTerminal || ""}`,
    `sessionCheckSchemaCommand=${next.commands?.sessionCheckSchema || ""}`,
    `sessionCheckSchemaTerminalCommand=${next.commands?.sessionCheckSchemaTerminal || ""}`,
    `installStartModifiedAt=${next.installStart?.modifiedAt || ""}`,
    `installStartFreshnessState=${next.installStart?.freshnessState || ""}`,
    `installStartFreshnessAgeHours=${next.installStart?.freshnessAgeHours ?? ""}`,
    `installStartFreshnessStaleAfterHours=${next.installStart?.freshnessStaleAfterHours || ""}`,
    `installStartReadiness=${next.installStart?.readiness || ""}`,
    `installStartWarning=${next.installStart?.warning || ""}`,
    `installStartShortInstallUrl=${next.installStart?.recommendedShortInstallUrl || ""}`,
    `installStartSessionQrUrl=${next.installStart?.sessionQrUrl || ""}`,
    `installStartProofSaveHash=${next.installStart?.proofSaveHash || ""}`,
    `installStartProofSaveTargetId=${next.installStart?.proofSaveTargetId || ""}`,
    `installStartProofSaveUrl=${next.installStart?.proofSaveUrl || ""}`,
    `installStartPostInstallAppHomeUrl=${next.installStart?.postInstallAppHomeUrl || ""}`,
    `installStartPostInstallNewPlanUrl=${next.installStart?.postInstallNewPlanUrl || ""}`,
    `installStartNextActionBoardUrl=${next.installStart?.nextActionBoardUrl || ""}`,
    `installStartBeforePhoneTerminalCommand=${next.installStart?.beforePhoneTerminalCommand || ""}`,
    `installStartBeforePhoneFinalTerminalCommand=${next.installStart?.beforePhoneFinalTerminalCommand || ""}`,
    `installStartBeforePhoneFinalThenNextTerminalCommand=${next.installStart?.beforePhoneFinalThenNextTerminalCommand || ""}`,
    `installStartAfterPhoneThenAllTerminalCommand=${next.installStart?.afterPhoneThenAllTerminalCommand || ""}`,
    `installStartAfterPhoneThenAllFinalTerminalCommand=${next.installStart?.afterPhoneThenAllFinalTerminalCommand || ""}`,
    `installStartRecommendedAction=${next.installStart?.recommendedAction || ""}`,
    `installStartRecommendedCommand=${next.installStart?.recommendedCommand || ""}`,
    `sessionCheckOk=${next.sessionCheck?.ok ? "true" : "false"}`,
    `sessionCheckStatus=${next.sessionCheck?.status || ""}`,
    `sessionCheckRecoveryUrl=${next.sessionCheck?.recoveryUrl || ""}`,
    `sessionCheckRecoveryTrigger=${next.sessionCheck?.recoveryTriggerField || ""}=${next.sessionCheck?.recoveryTriggerValue ? "true" : "false"}`,
    `sessionCheckRecoverySequenceCount=${next.sessionCheck?.recoverySequenceCount ?? ""}`,
    `sessionCheckFinalGateCommand=${next.sessionCheck?.finalGateCommand || ""}`,
    `sessionCheckIssueCount=${next.sessionCheck?.issueCount ?? ""}`,
    `sessionCheckRecommendedCommand=${next.sessionCheck?.recommendedCommand || ""}`,
    `sessionCheckRecommendedNpmScript=${next.sessionCheck?.recommendedNpmScript || ""}`,
  ].join("\n") + "\n";
}
