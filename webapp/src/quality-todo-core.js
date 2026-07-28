export function qualityTodoPlanLabel(plan) {
  return [
    plan.destination || "목적지 미정",
    plan.startDate || "",
    plan.id ? `#${plan.id}` : "",
  ].filter(Boolean).join(" · ");
}

export function planNeedsQualityAudit(plan) {
  const nextAction = String(plan?.qualityNextAction || "").trim();
  if (nextAction) return nextAction === "quality-audit";
  return Number(plan?.qualityCheckCount || 0) <= 0;
}

export function qualityTodoPath(plan) {
  if (!plan?.id) return "";
  const auditParam = planNeedsQualityAudit(plan) ? "&qualityAudit=1" : "";
  return `/plan.html?id=${encodeURIComponent(plan.id)}${auditParam}#qualityRefine`;
}

function normalizeBaseUrl(baseUrl = "") {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

export function qualityTodoFilterCount(summary = {}, filter = "quality-action") {
  switch (String(filter || "quality-action").trim()) {
    case "quality-urgent":
      return Number.isFinite(Number(summary.qualityUrgent)) ? Number(summary.qualityUrgent) : 0;
    case "quality-regression":
      return Number.isFinite(Number(summary.qualityRegression)) ? Number(summary.qualityRegression) : 0;
    case "quality":
      return Number.isFinite(Number(summary.quality)) ? Number(summary.quality) : 0;
    case "quality-unaudited":
      return Number.isFinite(Number(summary.qualityUnaudited)) ? Number(summary.qualityUnaudited) : 0;
    case "quality-ok":
      return Number.isFinite(Number(summary.qualityOk)) ? Number(summary.qualityOk) : 0;
    case "quality-improved":
      return Number.isFinite(Number(summary.qualityImproved)) ? Number(summary.qualityImproved) : 0;
    case "quality-action":
    default:
      return Number.isFinite(Number(summary.qualityAction)) ? Number(summary.qualityAction) : 0;
  }
}

export function qualityTodoFilterLabel(_summary = {}, filter = "quality-action") {
  switch (String(filter || "quality-action").trim()) {
    case "quality-urgent":
      return "긴급 후보";
    case "quality-regression":
      return "품질 악화";
    case "quality":
      return "품질 확인";
    case "quality-unaudited":
      return "품질 미점검";
    case "quality-ok":
      return "품질 OK";
    case "quality-improved":
      return "품질 개선";
    case "quality-action":
    default:
      return "고도화 후보";
  }
}

function qualityGateMatrixItem(summary = {}, options = {}) {
  const count = Number.isFinite(Number(options.count)) ? Number(options.count) : 0;
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(0, Math.floor(Number(options.limit))) : 0;
  const path = String(options.path || "").trim();
  const textPath = String(options.textPath || "").trim();
  const failed = count > limit;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  return {
    key: String(options.key || ""),
    label: String(options.label || ""),
    count,
    limit,
    failed,
    status: failed ? "failed" : "passed",
    path,
    url: baseUrl && path ? `${baseUrl}${path}` : "",
    textPath,
    textUrl: baseUrl && textPath ? `${baseUrl}${textPath}` : "",
  };
}

function qualityGateMatrixText(matrix = {}) {
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const commandBundle = String(matrix.commandBundle || matrix.meta?.commandBundle || "").trim();
  const failedCount = Number(matrix.meta?.failedCount || 0);
  const gateCount = Number(matrix.meta?.gateCount || gates.length);
  const nextLine = matrix.meta?.nextFilter
    ? `- 다음 기준: ${matrix.meta.nextLabel || matrix.meta.nextFilter} (${matrix.meta.nextFilter})${matrix.meta.nextReason ? ` · ${matrix.meta.nextReason}` : ""}`
    : "";
  return [
    "Travel Planner 품질 게이트 매트릭스",
    `- 상태: ${failedCount > 0 ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
    nextLine,
    ...gates.map((gate, index) => [
      `${index + 1}. ${gate.label || gate.key}`,
      `- 게이트: 후보 ${gate.count}개 / 허용 ${gate.limit}개 · ${gate.failed ? "실패" : "통과"}`,
      gate.path ? `- API: ${gate.path}` : "",
      gate.textPath ? `- TEXT: ${gate.textPath}` : "",
    ].filter(Boolean).join("\n")),
    actions.length ? [
      "추천 액션",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    commands.length ? [
      "CI 명령",
      ...commands.map((command) => `- ${command.label || command.key}: ${command.command}`),
    ].join("\n") : "",
    commandBundle ? [
      "CI 명령 묶음",
      commandBundle,
    ].join("\n") : "",
  ].filter(Boolean).join("\n\n");
}

function escapeCsvField(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function qualityGateCsvText(matrix = {}) {
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const rows = [
    ["section", "key", "label", "status", "count", "limit", "path", "textPath", "command"],
    ...gates.map((gate) => [
      "gate",
      gate.key || "",
      gate.label || "",
      gate.status || (gate.failed ? "failed" : "passed"),
      Number(gate.count || 0),
      Number(gate.limit || 0),
      gate.path || "",
      gate.textPath || "",
      "",
    ]),
    ...actions.map((action) => [
      "action",
      action.key || "",
      action.label || "",
      "",
      "",
      "",
      action.path || "",
      "",
      "",
    ]),
    ...commands.map((command) => [
      "command",
      command.key || "",
      command.label || "",
      "",
      "",
      "",
      command.path || "",
      "",
      command.command || "",
    ]),
  ];
  return `${rows.map((row) => row.map(escapeCsvField).join(",")).join("\n")}\n`;
}

function qualityGateReportMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  const artifactLines = [
    meta.csvPath ? `- CSV: ${meta.csvPath}` : "",
    meta.metricsPath ? `- Metrics: ${meta.metricsPath}` : "",
    meta.eventsPath ? `- Events: ${meta.eventsPath}` : "",
    meta.alertPath ? `- Alert: ${meta.alertPath}` : "",
    meta.healthPath ? `- Health: ${meta.healthPath}` : "",
    meta.remediationPath ? `- Remediation: ${meta.remediationPath}` : "",
    meta.junitPath ? `- JUnit XML: ${meta.junitPath}` : "",
    meta.sarifPath ? `- SARIF: ${meta.sarifPath}` : "",
    meta.stepSummaryPath ? `- Step Summary: ${meta.stepSummaryPath}` : "",
    meta.prCommentPath ? `- PR Comment: ${meta.prCommentPath}` : "",
    meta.artifactsPath ? `- Artifacts: ${meta.artifactsPath}` : "",
    meta.ciGuidePath ? `- CI 가이드: ${meta.ciGuidePath}` : "",
  ].filter(Boolean);
  return [
    "# Travel Planner 품질 게이트 리포트",
    [
      `- 상태: ${failedCount > 0 ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
      meta.generatedAt ? `- 생성 시각: ${meta.generatedAt}` : "",
      meta.nextFilter ? `- 다음 기준: ${meta.nextLabel || meta.nextFilter} (${meta.nextFilter})` : "",
      meta.nextReason ? `- 다음 이유: ${meta.nextReason}` : "",
    ].filter(Boolean).join("\n"),
    gates.length ? [
      "## 게이트 결과",
      "| 게이트 | 후보 | 허용 | 결과 |",
      "|---|---:|---:|---|",
      ...gates.map((gate) => `| ${gate.label || gate.key} | ${Number(gate.count || 0)} | ${Number(gate.limit || 0)} | ${gate.failed ? "실패" : "통과"} |`),
    ].join("\n") : "",
    actions.length ? [
      "## 추천 액션",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    artifactLines.length ? [
      "## 주요 산출물",
      ...artifactLines,
    ].join("\n") : "",
    commands.length ? [
      "## CI 명령",
      ...commands.map((command) => `- ${command.label || command.key}: \`${command.command || ""}\``),
    ].join("\n") : "",
  ].filter(Boolean).join("\n\n") + "\n";
}

function prometheusLabel(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function prometheusMetric(name, value, labels = {}) {
  const labelText = Object.entries(labels)
    .filter(([, labelValue]) => labelValue !== undefined && labelValue !== null && String(labelValue) !== "")
    .map(([key, labelValue]) => `${key}="${prometheusLabel(labelValue)}"`)
    .join(",");
  return `${name}${labelText ? `{${labelText}}` : ""} ${Number(value) || 0}`;
}

function qualityGateMetricsText(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  return [
    "# HELP travel_planner_quality_gates_failed Whether any Travel Planner quality gate failed.",
    "# TYPE travel_planner_quality_gates_failed gauge",
    prometheusMetric("travel_planner_quality_gates_failed", failedCount > 0 ? 1 : 0),
    "# HELP travel_planner_quality_gates_failed_count Number of failed Travel Planner quality gates.",
    "# TYPE travel_planner_quality_gates_failed_count gauge",
    prometheusMetric("travel_planner_quality_gates_failed_count", failedCount),
    "# HELP travel_planner_quality_gates_gate_count Number of evaluated Travel Planner quality gates.",
    "# TYPE travel_planner_quality_gates_gate_count gauge",
    prometheusMetric("travel_planner_quality_gates_gate_count", gateCount),
    "# HELP travel_planner_quality_gate_candidates Candidate count for each Travel Planner quality gate.",
    "# TYPE travel_planner_quality_gate_candidates gauge",
    ...gates.map((gate) => prometheusMetric("travel_planner_quality_gate_candidates", gate.count, { gate: gate.key || "", label: gate.label || "" })),
    "# HELP travel_planner_quality_gate_limit Allowed candidate count for each Travel Planner quality gate.",
    "# TYPE travel_planner_quality_gate_limit gauge",
    ...gates.map((gate) => prometheusMetric("travel_planner_quality_gate_limit", gate.limit, { gate: gate.key || "", label: gate.label || "" })),
    "# HELP travel_planner_quality_gate_failed Whether each Travel Planner quality gate failed.",
    "# TYPE travel_planner_quality_gate_failed gauge",
    ...gates.map((gate) => prometheusMetric("travel_planner_quality_gate_failed", gate.failed ? 1 : 0, { gate: gate.key || "", label: gate.label || "" })),
  ].join("\n") + "\n";
}

function qualityGateEventsNdjson(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const generatedAt = meta.generatedAt || new Date().toISOString();
  const records = [
    {
      type: "quality-gate-summary",
      generatedAt,
      failed: Boolean(meta.failed),
      failedCount: Number(meta.failedCount || 0),
      gateCount: Number(meta.gateCount || gates.length),
      nextFilter: meta.nextFilter || "",
      nextLabel: meta.nextLabel || "",
    },
    ...gates.map((gate) => ({
      type: "quality-gate-result",
      generatedAt,
      key: gate.key || "",
      label: gate.label || "",
      status: gate.status || (gate.failed ? "failed" : "passed"),
      failed: Boolean(gate.failed),
      count: Number(gate.count || 0),
      limit: Number(gate.limit || 0),
      path: gate.path || "",
      textPath: gate.textPath || "",
    })),
    ...actions.map((action) => ({
      type: "quality-gate-action",
      generatedAt,
      key: action.key || "",
      label: action.label || "",
      path: action.path || "",
      text: action.text || "",
    })),
    ...commands.map((command) => ({
      type: "quality-gate-command",
      generatedAt,
      key: command.key || "",
      label: command.label || "",
      path: command.path || "",
      command: command.command || "",
    })),
  ];
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function qualityGateAlert(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  const failed = Boolean(meta.failed || failedCount > 0);
  const failedGates = gates.filter((gate) => gate.failed);
  const status = failed ? "failed" : "passed";
  const severity = failedGates.some((gate) => gate.key === "urgent" || gate.key === "urgent-soft") ? "critical" : failed ? "warning" : "ok";
  const summary = failed
    ? `품질 게이트 실패 ${failedCount}/${gateCount}`
    : `품질 게이트 통과 0/${gateCount}`;
  return {
    type: "quality-gate-alert",
    schemaVersion: 1,
    generatedAt: meta.generatedAt || new Date().toISOString(),
    status,
    severity,
    failed,
    failedCount,
    gateCount,
    title: `Travel Planner ${summary}`,
    message: failedGates.length
      ? `${summary}: ${failedGates.map((gate) => gate.label || gate.key).join(", ")}`
      : `${summary}. 다음 고도화로 넘어가도 됩니다.`,
    nextFilter: meta.nextFilter || "",
    nextLabel: meta.nextLabel || "",
    nextReason: meta.nextReason || "",
    failedGates: failedGates.map((gate) => ({
      key: gate.key || "",
      label: gate.label || "",
      count: Number(gate.count || 0),
      limit: Number(gate.limit || 0),
      path: gate.path || "",
      textPath: gate.textPath || "",
    })),
    actions: actions.map((action) => ({
      key: action.key || "",
      label: action.label || "",
      path: action.path || "",
      url: action.url || "",
      text: action.text || "",
    })),
    links: {
      matrix: "/api/plans/quality-gates",
      text: "/api/plans/quality-gates.txt",
      report: meta.reportPath || "",
      metrics: meta.metricsPath || "",
      events: meta.eventsPath || "",
      artifacts: meta.artifactsPath || "",
    },
  };
}

function qualityGateHealthText(matrix = {}) {
  const meta = matrix.meta || {};
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || 0);
  const failed = Boolean(meta.failed || failedCount > 0);
  return failed ? `failed ${failedCount}/${gateCount}\n` : `ok 0/${gateCount}\n`;
}

function qualityGateRemediationMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const failedGates = gates.filter((gate) => gate.failed);
  const failedCount = Number(meta.failedCount || failedGates.length);
  const gateCount = Number(meta.gateCount || gates.length);
  const commandByKey = Object.fromEntries(commands.map((command) => [command.key, command.command || ""]));
  return [
    "# Travel Planner 품질 게이트 보강 Runbook",
    [
      `- 상태: ${failedCount > 0 ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
      meta.generatedAt ? `- 생성 시각: ${meta.generatedAt}` : "",
      meta.nextFilter ? `- 다음 기준: ${meta.nextLabel || meta.nextFilter} (${meta.nextFilter})` : "",
      meta.nextReason ? `- 다음 이유: ${meta.nextReason}` : "",
    ].filter(Boolean).join("\n"),
    failedGates.length ? [
      "## 실패 게이트",
      ...failedGates.map((gate) => `- ${gate.label || gate.key}: 후보 ${Number(gate.count || 0)}개 / 허용 ${Number(gate.limit || 0)}개${gate.textPath ? ` · ${gate.textPath}` : ""}`),
    ].join("\n") : [
      "## 실패 게이트",
      "- 현재 실패한 품질 게이트가 없습니다.",
    ].join("\n"),
    actions.length ? [
      "## 바로 할 일",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    [
      "## 복사해서 실행할 명령",
      commandByKey["npm-text"] ? `- 기본 게이트: \`${commandByKey["npm-text"]}\`` : "",
      commandByKey["npm-health"] ? `- 헬스체크: \`${commandByKey["npm-health"]}\`` : "",
      commandByKey["npm-alert"] ? `- 알림 payload: \`${commandByKey["npm-alert"]}\`` : "",
      commandByKey["npm-report"] ? `- 공유 리포트: \`${commandByKey["npm-report"]}\`` : "",
      commandByKey["npm-events"] ? `- 이벤트 로그: \`${commandByKey["npm-events"]}\`` : "",
    ].filter(Boolean).join("\n"),
    [
      "## 참고 산출물",
      meta.reportPath ? `- Report: ${meta.reportPath}` : "",
      meta.alertPath ? `- Alert: ${meta.alertPath}` : "",
      meta.healthPath ? `- Health: ${meta.healthPath}` : "",
      meta.eventsPath ? `- Events: ${meta.eventsPath}` : "",
      meta.metricsPath ? `- Metrics: ${meta.metricsPath}` : "",
      meta.artifactsPath ? `- Artifacts: ${meta.artifactsPath}` : "",
    ].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n\n") + "\n";
}

function codeFence(language, body) {
  return [`\`\`\`${language || ""}`, String(body || "").trim(), "```"].join("\n");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function qualityGateCiGuideMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const ciExamples = Array.isArray(matrix.ciExamples) ? matrix.ciExamples : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  const sourceUrls = Array.from(new Set(ciExamples.flatMap((example) => Array.isArray(example.sourceUrls) ? example.sourceUrls : [])));
  return [
    "# Travel Planner 품질 게이트 CI 가이드",
    [
      `- 상태: ${failedCount > 0 ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
      meta.generatedAt ? `- 생성 시각: ${meta.generatedAt}` : "",
      meta.baseUrl ? `- 기준 URL: ${meta.baseUrl}` : "",
      meta.nextFilter ? `- 다음 기준: ${meta.nextLabel || meta.nextFilter} (${meta.nextFilter})` : "",
    ].filter(Boolean).join("\n"),
    meta.badgePath ? [
      "## 배지",
      `- Shields JSON: ${meta.badgePath}`,
      meta.badgeSvgPath ? `- SVG: ${meta.badgeSvgPath}` : "",
      meta.badgeMarkdownPath ? `- Markdown: ${meta.badgeMarkdownPath}` : "",
      meta.badgeMarkdown ? meta.badgeMarkdown : "",
      meta.badgeUrl ? `- URL: ${meta.badgeUrl}` : "",
    ].filter(Boolean).join("\n") : "",
    meta.junitPath ? [
      "## JUnit",
      `- XML: ${meta.junitPath}`,
      meta.junitGatePath ? `- Gate XML: ${meta.junitGatePath}` : "",
      meta.junitUrl ? `- URL: ${meta.junitUrl}` : "",
    ].filter(Boolean).join("\n") : "",
    meta.sarifPath ? [
      "## SARIF",
      `- JSON: ${meta.sarifPath}`,
      meta.sarifGatePath ? `- Gate JSON: ${meta.sarifGatePath}` : "",
      meta.sarifUrl ? `- URL: ${meta.sarifUrl}` : "",
    ].filter(Boolean).join("\n") : "",
    (meta.stepSummaryPath || meta.annotationsPath || meta.outputsPath || meta.prCommentPath || meta.artifactsPath || meta.csvPath || meta.reportPath || meta.metricsPath || meta.eventsPath || meta.alertPath || meta.healthPath || meta.remediationPath) ? [
      "## GitHub Actions 산출물",
      meta.stepSummaryPath ? `- Step Summary: ${meta.stepSummaryPath}` : "",
      meta.annotationsPath ? `- Annotations: ${meta.annotationsPath}` : "",
      meta.outputsPath ? `- Outputs: ${meta.outputsPath}` : "",
      meta.prCommentPath ? `- PR Comment: ${meta.prCommentPath}` : "",
      meta.artifactsPath ? `- Artifacts: ${meta.artifactsPath}` : "",
      meta.csvPath ? `- CSV: ${meta.csvPath}` : "",
      meta.reportPath ? `- Report: ${meta.reportPath}` : "",
      meta.metricsPath ? `- Metrics: ${meta.metricsPath}` : "",
      meta.eventsPath ? `- Events: ${meta.eventsPath}` : "",
      meta.alertPath ? `- Alert: ${meta.alertPath}` : "",
      meta.healthPath ? `- Health: ${meta.healthPath}` : "",
      meta.remediationPath ? `- Remediation: ${meta.remediationPath}` : "",
    ].filter(Boolean).join("\n") : "",
    gates.length ? [
      "## 게이트",
      ...gates.map((gate) => `- ${gate.label || gate.key}: ${gate.failed ? "실패" : "통과"} · 후보 ${gate.count} / 허용 ${gate.limit}${gate.textPath ? ` · ${gate.textPath}` : ""}`),
    ].join("\n") : "",
    actions.length ? [
      "## 추천 액션",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    commands.length ? [
      "## 명령",
      ...commands.map((command) => [
        `### ${command.label || command.key}`,
        command.path ? `- API: ${command.path}` : "",
        codeFence(command.command?.startsWith("npm ") ? "bash" : "bash", command.command),
      ].filter(Boolean).join("\n\n")),
    ].join("\n\n") : "",
    ciExamples.length ? [
      "## CI 예시",
      ...ciExamples.map((example) => [
        `### ${example.label || example.key}`,
        example.path ? `- API: ${example.path}` : "",
        example.filename ? `- 파일: ${example.filename}` : "",
        codeFence(example.language || "", example.body),
      ].filter(Boolean).join("\n\n")),
    ].join("\n\n") : "",
    sourceUrls.length ? [
      "## 출처",
      ...sourceUrls.map((url) => `- ${url}`),
    ].join("\n") : "",
  ].filter(Boolean).join("\n\n") + "\n";
}

function qualityGateStepSummaryMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  return [
    "# Travel Planner 품질 게이트",
    [
      `- 결과: ${failedCount > 0 ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
      meta.generatedAt ? `- 생성 시각: ${meta.generatedAt}` : "",
      meta.nextFilter ? `- 다음 기준: ${meta.nextLabel || meta.nextFilter} (${meta.nextFilter})` : "",
    ].filter(Boolean).join("\n"),
    gates.length ? [
      "## 게이트 결과",
      "| 게이트 | 후보 | 허용 | 결과 |",
      "|---|---:|---:|---|",
      ...gates.map((gate) => `| ${gate.label || gate.key} | ${Number(gate.count || 0)} | ${Number(gate.limit || 0)} | ${gate.failed ? "실패" : "통과"} |`),
    ].join("\n") : "",
    actions.length ? [
      "## 추천 액션",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    [
      "## 산출물",
      meta.sarifPath ? `- SARIF: ${meta.sarifPath}` : "",
      meta.junitPath ? `- JUnit XML: ${meta.junitPath}` : "",
      meta.outputsPath ? `- Outputs: ${meta.outputsPath}` : "",
      meta.annotationsPath ? `- Annotations: ${meta.annotationsPath}` : "",
      meta.prCommentPath ? `- PR Comment: ${meta.prCommentPath}` : "",
      meta.artifactsPath ? `- Artifacts: ${meta.artifactsPath}` : "",
      meta.csvPath ? `- CSV: ${meta.csvPath}` : "",
      meta.reportPath ? `- Report: ${meta.reportPath}` : "",
      meta.metricsPath ? `- Metrics: ${meta.metricsPath}` : "",
      meta.eventsPath ? `- Events: ${meta.eventsPath}` : "",
      meta.alertPath ? `- Alert: ${meta.alertPath}` : "",
      meta.healthPath ? `- Health: ${meta.healthPath}` : "",
      meta.remediationPath ? `- Remediation: ${meta.remediationPath}` : "",
      meta.ciGuidePath ? `- CI 가이드: ${meta.ciGuidePath}` : "",
      meta.badgeMarkdown ? `- 배지: ${meta.badgeMarkdown}` : "",
    ].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n\n") + "\n";
}

function qualityGatePrCommentMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || gates.length);
  const failed = Boolean(meta.failed || failedCount > 0);
  return [
    `## Travel Planner 품질 게이트 ${failed ? "실패" : "통과"}`,
    `**상태:** ${failed ? `실패 ${failedCount}/${gateCount}` : `통과 0/${gateCount}`}`,
    meta.nextFilter ? `**다음 기준:** ${meta.nextLabel || meta.nextFilter} (${meta.nextFilter})` : "",
    gates.length ? [
      "<details>",
      "<summary>게이트 결과</summary>",
      "",
      "| 게이트 | 후보 | 허용 | 결과 |",
      "|---|---:|---:|---|",
      ...gates.map((gate) => `| ${gate.label || gate.key} | ${Number(gate.count || 0)} | ${Number(gate.limit || 0)} | ${gate.failed ? "실패" : "통과"} |`),
      "",
      "</details>",
    ].join("\n") : "",
    actions.length ? [
      "### 추천 액션",
      ...actions.map((action) => `- ${action.text || action.label || action.key}`),
    ].join("\n") : "",
    [
      "### 산출물",
      meta.stepSummaryPath ? `- Step Summary: \`${meta.stepSummaryPath}\`` : "",
      meta.sarifPath ? `- SARIF: \`${meta.sarifPath}\`` : "",
      meta.junitPath ? `- JUnit XML: \`${meta.junitPath}\`` : "",
      meta.outputsPath ? `- Outputs: \`${meta.outputsPath}\`` : "",
      meta.annotationsPath ? `- Annotations: \`${meta.annotationsPath}\`` : "",
      meta.prCommentPath ? `- PR Comment: \`${meta.prCommentPath}\`` : "",
      meta.artifactsPath ? `- Artifacts: \`${meta.artifactsPath}\`` : "",
      meta.csvPath ? `- CSV: \`${meta.csvPath}\`` : "",
      meta.reportPath ? `- Report: \`${meta.reportPath}\`` : "",
      meta.metricsPath ? `- Metrics: \`${meta.metricsPath}\`` : "",
      meta.eventsPath ? `- Events: \`${meta.eventsPath}\`` : "",
      meta.alertPath ? `- Alert: \`${meta.alertPath}\`` : "",
      meta.healthPath ? `- Health: \`${meta.healthPath}\`` : "",
      meta.remediationPath ? `- Remediation: \`${meta.remediationPath}\`` : "",
      meta.ciGuidePath ? `- CI 가이드: \`${meta.ciGuidePath}\`` : "",
    ].filter(Boolean).join("\n"),
    "<!-- travel-planner-quality-gates -->",
  ].filter(Boolean).join("\n\n") + "\n";
}

function escapeWorkflowCommandValue(value, property = false) {
  const escaped = String(value || "")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  return property ? escaped.replace(/:/g, "%3A").replace(/,/g, "%2C") : escaped;
}

function qualityGateAnnotationsText(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const failedGates = gates.filter((gate) => gate.failed);
  if (!failedGates.length) {
    return `::notice title=${escapeWorkflowCommandValue("Travel Planner 품질 게이트", true)}::${escapeWorkflowCommandValue("모든 품질 게이트를 통과했습니다.")}\n`;
  }
  return `${failedGates.map((gate) => {
    const label = gate.label || gate.key || "품질 게이트";
    const details = `${label}: 후보 ${Number(gate.count || 0)}개 / 허용 ${Number(gate.limit || 0)}개`;
    const target = gate.textPath || gate.path || meta.stepSummaryPath || meta.ciGuidePath || "";
    const message = target ? `${details}. 확인: ${target}` : details;
    return `::error title=${escapeWorkflowCommandValue(`Travel Planner ${label}`, true)}::${escapeWorkflowCommandValue(message)}`;
  }).join("\n")}\n`;
}

function githubOutputValue(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function qualityGateOutputsText(matrix = {}) {
  const meta = matrix.meta || {};
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || 0);
  const failed = Boolean(meta.failed || failedCount > 0);
  return [
    ["quality_gates_failed", failed ? "true" : "false"],
    ["quality_gates_status", failed ? "failed" : "passed"],
    ["quality_gates_failed_count", failedCount],
    ["quality_gates_gate_count", gateCount],
    ["quality_gates_summary", failed ? `failed ${failedCount}/${gateCount}` : `passed 0/${gateCount}`],
    ["quality_gates_next_filter", meta.nextFilter || ""],
    ["quality_gates_next_label", meta.nextLabel || ""],
    ["quality_gates_sarif_path", meta.sarifPath || ""],
    ["quality_gates_step_summary_path", meta.stepSummaryPath || ""],
    ["quality_gates_annotations_path", meta.annotationsPath || ""],
    ["quality_gates_pr_comment_path", meta.prCommentPath || ""],
    ["quality_gates_artifacts_path", meta.artifactsPath || ""],
    ["quality_gates_csv_path", meta.csvPath || ""],
    ["quality_gates_report_path", meta.reportPath || ""],
    ["quality_gates_metrics_path", meta.metricsPath || ""],
    ["quality_gates_events_path", meta.eventsPath || ""],
    ["quality_gates_alert_path", meta.alertPath || ""],
    ["quality_gates_health_path", meta.healthPath || ""],
    ["quality_gates_remediation_path", meta.remediationPath || ""],
    ["quality_gates_ci_guide_path", meta.ciGuidePath || ""],
  ].map(([key, value]) => `${key}=${githubOutputValue(value)}`).join("\n") + "\n";
}

function qualityGateArtifacts(matrix = {}) {
  const meta = matrix.meta || {};
  const artifact = (key, label, path, gatePath, contentType, kind, description) => ({
    key,
    label,
    path: path || "",
    gatePath: gatePath || "",
    url: meta.baseUrl && path ? `${meta.baseUrl}${path}` : "",
    gateUrl: meta.baseUrl && gatePath ? `${meta.baseUrl}${gatePath}` : "",
    contentType,
    kind,
    description,
  });
  return {
    type: "quality-gate-artifacts",
    schemaVersion: 1,
    generatedAt: meta.generatedAt || new Date().toISOString(),
    failed: Boolean(meta.failed),
    failedCount: Number(meta.failedCount || 0),
    gateCount: Number(meta.gateCount || 0),
    artifacts: [
      artifact("matrix-json", "Gate matrix JSON", "/api/plans/quality-gates", "/api/plans/quality-gates?failOnFailed=true", "application/json", "machine", "전체 품질 게이트 매트릭스 JSON"),
      artifact("matrix-text", "Gate matrix text", "/api/plans/quality-gates.txt", "/api/plans/quality-gates.txt?failOnFailed=true", "text/plain", "human", "전체 품질 게이트 매트릭스 text"),
      artifact("matrix-csv", "Gate matrix CSV", meta.csvPath, meta.csvGatePath, "text/csv", "report", "품질 게이트 결과를 스프레드시트에 붙이기 쉬운 CSV"),
      artifact("report-markdown", "Gate report Markdown", meta.reportPath, meta.reportGatePath, "text/markdown", "report", "사람에게 공유하기 좋은 품질 게이트 Markdown 리포트"),
      artifact("metrics-prometheus", "Gate metrics", meta.metricsPath, meta.metricsGatePath, "text/plain", "monitoring", "Prometheus 스타일 품질 게이트 metrics"),
      artifact("events-ndjson", "Gate events NDJSON", meta.eventsPath, meta.eventsGatePath, "application/x-ndjson", "log", "줄 단위로 소비하기 쉬운 품질 게이트 이벤트"),
      artifact("alert-json", "Gate alert JSON", meta.alertPath, meta.alertGatePath, "application/json", "alert", "외부 알림과 스케줄러가 바로 읽는 품질 게이트 alert payload"),
      artifact("health-text", "Gate health", meta.healthPath, meta.healthPath, "text/plain", "monitoring", "HTTP 200/503로 바로 판단하는 품질 게이트 헬스체크"),
      artifact("remediation-markdown", "Gate remediation", meta.remediationPath, meta.remediationGatePath, "text/markdown", "runbook", "실패 게이트를 고치기 위한 짧은 보강 Runbook"),
      artifact("badge-json", "Badge JSON", meta.badgePath, "", "application/json", "badge", "Shields 호환 품질 게이트 배지 JSON"),
      artifact("badge-svg", "Badge SVG", meta.badgeSvgPath, "", "image/svg+xml", "badge", "품질 게이트 SVG 배지"),
      artifact("badge-markdown", "Badge Markdown", meta.badgeMarkdownPath, "", "text/markdown", "badge", "README에 붙일 Markdown 배지"),
      artifact("junit", "JUnit XML", meta.junitPath, meta.junitGatePath, "application/xml", "ci-report", "CI 테스트 리포트용 JUnit XML"),
      artifact("sarif", "SARIF JSON", meta.sarifPath, meta.sarifGatePath, "application/json", "ci-report", "GitHub code scanning 업로드용 SARIF JSON"),
      artifact("step-summary", "Step Summary", meta.stepSummaryPath, meta.stepSummaryGatePath, "text/markdown", "github-actions", "GITHUB_STEP_SUMMARY에 붙일 Markdown"),
      artifact("pr-comment", "PR Comment", meta.prCommentPath, meta.prCommentGatePath, "text/markdown", "github", "GitHub PR 댓글 본문용 Markdown"),
      artifact("annotations", "Annotations", meta.annotationsPath, meta.annotationsGatePath, "text/plain", "github-actions", "GitHub Actions annotation workflow command"),
      artifact("outputs", "Outputs", meta.outputsPath, meta.outputsGatePath, "text/plain", "github-actions", "GITHUB_OUTPUT에 붙일 key-value text"),
      artifact("ci-guide", "CI Guide", meta.ciGuidePath, meta.ciGuideGatePath, "text/markdown", "human", "품질 게이트 CI 가이드 Markdown"),
      artifact("commands-json", "Commands JSON", "/api/plans/quality-gates.commands", "/api/plans/quality-gates.commands?failOnFailed=true", "application/json", "machine", "CI 명령 목록 JSON"),
      artifact("commands-text", "Commands text", "/api/plans/quality-gates.commands.txt", "/api/plans/quality-gates.commands.txt?failOnFailed=true", "text/plain", "machine", "CI 명령 묶음 text"),
      artifact("local-shell", "Local shell", "/api/plans/quality-gates.local.sh", "", "text/x-shellscript", "example", "로컬 shell 실행 예시"),
      artifact("github-actions", "GitHub Actions", "/api/plans/quality-gates.github-actions.yml", "", "text/yaml", "example", "GitHub Actions workflow 예시"),
    ],
  };
}

function qualityGateBadge(matrix = {}) {
  const meta = matrix.meta || {};
  const failedCount = Number(meta.failedCount || 0);
  const gateCount = Number(meta.gateCount || 0);
  const failed = Boolean(meta.failed || failedCount > 0);
  return {
    schemaVersion: 1,
    label: "quality gates",
    message: failed ? `failed ${failedCount}/${gateCount}` : `passing 0/${gateCount}`,
    color: failed ? "red" : "brightgreen",
  };
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function qualityGateBadgeSvg(matrix = {}) {
  const badge = qualityGateBadge(matrix);
  const label = badge.label || "quality gates";
  const message = badge.message || "unknown";
  const color = badge.color === "brightgreen" ? "#44cc11" : "#e05d44";
  const labelWidth = Math.max(88, label.length * 7 + 12);
  const messageWidth = Math.max(76, message.length * 7 + 12);
  const width = labelWidth + messageWidth;
  const labelTextX = Math.round(labelWidth / 2);
  const messageTextX = labelWidth + Math.round(messageWidth / 2);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeSvgText(`${label}: ${message}`)}">`,
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${labelWidth}" height="20" fill="#555"/>`,
    `<rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>`,
    `<rect width="${width}" height="20" fill="url(#s)"/>`,
    `</g>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    `<text x="${labelTextX}" y="15" fill="#010101" fill-opacity=".3">${escapeSvgText(label)}</text>`,
    `<text x="${labelTextX}" y="14">${escapeSvgText(label)}</text>`,
    `<text x="${messageTextX}" y="15" fill="#010101" fill-opacity=".3">${escapeSvgText(message)}</text>`,
    `<text x="${messageTextX}" y="14">${escapeSvgText(message)}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}

function qualityGateBadgeMarkdown(matrix = {}) {
  const meta = matrix.meta || {};
  const imageUrl = meta.badgeSvgUrl || meta.badgeSvgPath || "";
  const targetUrl = meta.ciGuideUrl || meta.ciGuidePath || meta.badgeUrl || meta.badgePath || "";
  if (!imageUrl) return "";
  return targetUrl ? `[![quality gates](${imageUrl})](${targetUrl})` : `![quality gates](${imageUrl})`;
}

function qualityGateJUnitXml(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const failedGates = gates.filter((gate) => gate.failed);
  const properties = [
    meta.generatedAt ? `<property name="generatedAt" value="${escapeXml(meta.generatedAt)}"/>` : "",
    meta.baseUrl ? `<property name="baseUrl" value="${escapeXml(meta.baseUrl)}"/>` : "",
    meta.nextFilter ? `<property name="nextFilter" value="${escapeXml(meta.nextFilter)}"/>` : "",
  ].filter(Boolean).join("");
  const testcases = gates.map((gate) => {
    const name = gate.label || gate.key || "quality gate";
    const details = `candidate count ${Number(gate.count || 0)} / allowed ${Number(gate.limit || 0)}${gate.textPath ? ` (${gate.textPath})` : ""}`;
    const failure = gate.failed
      ? `<failure message="${escapeXml(details)}">${escapeXml(details)}</failure>`
      : "";
    return `<testcase classname="travel-planner.quality-gates" name="${escapeXml(name)}" time="0">${failure}</testcase>`;
  }).join("");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="travel-planner quality gates" tests="${gates.length}" failures="${failedGates.length}" errors="0" skipped="0" time="0">`,
    properties ? `<properties>${properties}</properties>` : "",
    testcases,
    `</testsuite>`,
  ].join("");
}

function qualityGateSarifJson(matrix = {}) {
  const meta = matrix.meta || {};
  const gates = Array.isArray(matrix.gates) ? matrix.gates : [];
  const ruleId = (gate, index) => `travel-planner.quality-gates.${String(gate.key || index + 1).replace(/[^A-Za-z0-9_.-]+/g, "-")}`;
  const rules = gates.map((gate, index) => ({
    id: ruleId(gate, index),
    name: gate.label || gate.key || `quality gate ${index + 1}`,
    shortDescription: {
      text: gate.label || gate.key || `quality gate ${index + 1}`,
    },
    fullDescription: {
      text: `Travel Planner 품질 게이트는 후보 ${Number(gate.count || 0)}개를 허용 ${Number(gate.limit || 0)}개 이하로 유지해야 합니다.`,
    },
    helpUri: gate.textUrl || gate.textPath || gate.url || gate.path || meta.ciGuideUrl || meta.ciGuidePath || undefined,
    properties: {
      gateKey: gate.key || "",
      count: Number(gate.count || 0),
      limit: Number(gate.limit || 0),
      failed: Boolean(gate.failed),
      path: gate.path || "",
      textPath: gate.textPath || "",
    },
  }));
  const results = gates
    .map((gate, index) => ({ gate, index }))
    .filter(({ gate }) => gate.failed)
    .map(({ gate, index }) => {
      const label = gate.label || gate.key || `quality gate ${index + 1}`;
      const message = `${label} 실패: 후보 ${Number(gate.count || 0)}개 / 허용 ${Number(gate.limit || 0)}개.`;
      return {
        ruleId: ruleId(gate, index),
        ruleIndex: index,
        level: "error",
        message: {
          text: message,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: gate.textUrl || gate.textPath || gate.url || gate.path || meta.ciGuideUrl || meta.ciGuidePath || "travel-planner-quality-gates",
              },
              region: {
                startLine: 1,
              },
            },
          },
        ],
        properties: {
          gateKey: gate.key || "",
          count: Number(gate.count || 0),
          limit: Number(gate.limit || 0),
          path: gate.path || "",
          textPath: gate.textPath || "",
        },
      };
    });
  const driver = {
    name: "Travel Planner Quality Gates",
    semanticVersion: "1.0.0",
    rules,
  };
  if (meta.ciGuideUrl || meta.ciGuidePath) {
    driver.informationUri = meta.ciGuideUrl || meta.ciGuidePath;
  }
  return `${JSON.stringify({
    $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver,
        },
        invocations: [
          {
            executionSuccessful: !Boolean(meta.failed),
            endTimeUtc: meta.generatedAt || new Date().toISOString(),
            properties: {
              failedCount: Number(meta.failedCount || 0),
              gateCount: Number(meta.gateCount || gates.length),
              nextFilter: meta.nextFilter || "",
              baseUrl: meta.baseUrl || "",
            },
          },
        ],
        results,
        properties: {
          type: "quality-gates",
          schemaVersion: Number(meta.schemaVersion || 1),
          failed: Boolean(meta.failed),
          sarifPath: meta.sarifPath || "",
          sarifGatePath: meta.sarifGatePath || "",
        },
      },
    ],
  }, null, 2)}\n`;
}

function quoteShellArg(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

export function buildQualityGateCommands(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl) || "http://localhost:3000";
  const textPath = "/api/plans/quality-gates.txt?failOnFailed=true";
  const jsonPath = "/api/plans/quality-gates?failOnFailed=true";
  const csvPath = "/api/plans/quality-gates.csv?failOnFailed=true";
  const reportPath = "/api/plans/quality-gates.report.md?failOnFailed=true";
  const metricsPath = "/api/plans/quality-gates.metrics?failOnFailed=true";
  const eventsPath = "/api/plans/quality-gates.events.ndjson?failOnFailed=true";
  const alertPath = "/api/plans/quality-gates.alert.json?failOnFailed=true";
  const healthPath = "/api/plans/quality-gates.health";
  const remediationPath = "/api/plans/quality-gates.remediation.md?failOnFailed=true";
  const commandsTextPath = "/api/plans/quality-gates.commands.txt?failOnFailed=true";
  const commandsJsonPath = "/api/plans/quality-gates.commands?failOnFailed=true";
  const ciGuidePath = "/api/plans/quality-gates.ci.md?failOnFailed=true";
  const junitPath = "/api/plans/quality-gates.junit.xml?failOnFailed=true";
  const sarifPath = "/api/plans/quality-gates.sarif.json?failOnFailed=true";
  const stepSummaryPath = "/api/plans/quality-gates.step-summary.md?failOnFailed=true";
  const annotationsPath = "/api/plans/quality-gates.annotations.txt?failOnFailed=true";
  const outputsPath = "/api/plans/quality-gates.outputs.txt?failOnFailed=true";
  const prCommentPath = "/api/plans/quality-gates.pr-comment.md?failOnFailed=true";
  const artifactsPath = "/api/plans/quality-gates.artifacts.json?failOnFailed=true";
  const textUrl = `${baseUrl}${textPath}`;
  const jsonUrl = `${baseUrl}${jsonPath}`;
  const csvUrl = `${baseUrl}${csvPath}`;
  const reportUrl = `${baseUrl}${reportPath}`;
  const metricsUrl = `${baseUrl}${metricsPath}`;
  const eventsUrl = `${baseUrl}${eventsPath}`;
  const alertUrl = `${baseUrl}${alertPath}`;
  const healthUrl = `${baseUrl}${healthPath}`;
  const remediationUrl = `${baseUrl}${remediationPath}`;
  const commandsTextUrl = `${baseUrl}${commandsTextPath}`;
  const commandsJsonUrl = `${baseUrl}${commandsJsonPath}`;
  const ciGuideUrl = `${baseUrl}${ciGuidePath}`;
  const junitUrl = `${baseUrl}${junitPath}`;
  const sarifUrl = `${baseUrl}${sarifPath}`;
  const stepSummaryUrl = `${baseUrl}${stepSummaryPath}`;
  const annotationsUrl = `${baseUrl}${annotationsPath}`;
  const outputsUrl = `${baseUrl}${outputsPath}`;
  const prCommentUrl = `${baseUrl}${prCommentPath}`;
  const artifactsUrl = `${baseUrl}${artifactsPath}`;
  return [
    { key: "curl-text", label: "curl text", path: textPath, url: textUrl, command: `curl -fsS ${quoteShellArg(textUrl)}` },
    { key: "curl-json", label: "curl JSON", path: jsonPath, url: jsonUrl, command: `curl -fsS ${quoteShellArg(jsonUrl)}` },
    { key: "curl-csv", label: "curl CSV", path: csvPath, url: csvUrl, command: `curl -fsS ${quoteShellArg(csvUrl)}` },
    { key: "curl-report", label: "curl report", path: reportPath, url: reportUrl, command: `curl -fsS ${quoteShellArg(reportUrl)}` },
    { key: "curl-metrics", label: "curl metrics", path: metricsPath, url: metricsUrl, command: `curl -fsS ${quoteShellArg(metricsUrl)}` },
    { key: "curl-events", label: "curl events", path: eventsPath, url: eventsUrl, command: `curl -fsS ${quoteShellArg(eventsUrl)}` },
    { key: "curl-alert", label: "curl alert", path: alertPath, url: alertUrl, command: `curl -fsS ${quoteShellArg(alertUrl)}` },
    { key: "curl-health", label: "curl health", path: healthPath, url: healthUrl, command: `curl -fsS ${quoteShellArg(healthUrl)}` },
    { key: "curl-remediation", label: "curl remediation", path: remediationPath, url: remediationUrl, command: `curl -fsS ${quoteShellArg(remediationUrl)}` },
    { key: "curl-commands-text", label: "curl commands text", path: commandsTextPath, url: commandsTextUrl, command: `curl -fsS ${quoteShellArg(commandsTextUrl)}` },
    { key: "curl-commands-json", label: "curl commands JSON", path: commandsJsonPath, url: commandsJsonUrl, command: `curl -fsS ${quoteShellArg(commandsJsonUrl)}` },
    { key: "curl-ci-guide", label: "curl CI guide", path: ciGuidePath, url: ciGuideUrl, command: `curl -fsS ${quoteShellArg(ciGuideUrl)}` },
    { key: "curl-junit", label: "curl JUnit XML", path: junitPath, url: junitUrl, command: `curl -fsS ${quoteShellArg(junitUrl)}` },
    { key: "curl-sarif", label: "curl SARIF", path: sarifPath, url: sarifUrl, command: `curl -fsS ${quoteShellArg(sarifUrl)}` },
    { key: "curl-step-summary", label: "curl Step Summary", path: stepSummaryPath, url: stepSummaryUrl, command: `curl -fsS ${quoteShellArg(stepSummaryUrl)}` },
    { key: "curl-annotations", label: "curl annotations", path: annotationsPath, url: annotationsUrl, command: `curl -sS ${quoteShellArg(annotationsUrl)}` },
    { key: "curl-outputs", label: "curl outputs", path: outputsPath, url: outputsUrl, command: `curl -sS ${quoteShellArg(outputsUrl)}` },
    { key: "curl-pr-comment", label: "curl PR comment", path: prCommentPath, url: prCommentUrl, command: `curl -fsS ${quoteShellArg(prCommentUrl)}` },
    { key: "curl-artifacts", label: "curl artifacts", path: artifactsPath, url: artifactsUrl, command: `curl -fsS ${quoteShellArg(artifactsUrl)}` },
    { key: "npm-text", label: "npm text", command: "npm run quality:gates:gate" },
    { key: "npm-json", label: "npm JSON", command: "npm run quality:gates:gate:json" },
    { key: "npm-csv", label: "npm CSV", command: "npm run quality:gates:csv:gate" },
    { key: "npm-report", label: "npm report", command: "npm run quality:gates:report:gate" },
    { key: "npm-metrics", label: "npm metrics", command: "npm run quality:gates:metrics:gate" },
    { key: "npm-events", label: "npm events", command: "npm run quality:gates:events:gate" },
    { key: "npm-alert", label: "npm alert", command: "npm run quality:gates:alert:gate" },
    { key: "npm-health", label: "npm health", command: "npm run quality:gates:health" },
    { key: "npm-remediation", label: "npm remediation", command: "npm run quality:gates:remediation:gate" },
    { key: "npm-commands-text", label: "npm commands text", command: "npm run quality:gates:commands:gate" },
    { key: "npm-commands-json", label: "npm commands JSON", command: "npm run quality:gates:commands:gate:json" },
    { key: "npm-ci-guide", label: "npm CI guide", command: "npm run quality:gates:ci-guide:gate" },
    { key: "npm-junit", label: "npm JUnit XML", command: "npm run quality:gates:junit:gate" },
    { key: "npm-sarif", label: "npm SARIF", command: "npm run quality:gates:sarif:gate" },
    { key: "npm-step-summary", label: "npm Step Summary", command: "npm run quality:gates:step-summary:gate" },
    { key: "npm-annotations", label: "npm annotations", command: "npm run quality:gates:annotations:gate" },
    { key: "npm-outputs", label: "npm outputs", command: "npm run quality:gates:outputs:gate" },
    { key: "npm-pr-comment", label: "npm PR comment", command: "npm run quality:gates:pr-comment:gate" },
    { key: "npm-artifacts", label: "npm artifacts", command: "npm run quality:gates:artifacts:gate" },
  ];
}

export function buildQualityGateCiExamples(options = {}) {
  const commands = Array.isArray(options.commands) ? options.commands : buildQualityGateCommands(options);
  const byKey = Object.fromEntries(commands.map((command) => [command.key, command.command]));
  const baseUrl = normalizeBaseUrl(options.baseUrl) || "http://localhost:3000";
  const localShellPath = "/api/plans/quality-gates.local.sh";
  const githubActionsPath = "/api/plans/quality-gates.github-actions.yml";
  const npmGateCommand = byKey["npm-text"] || "npm run quality:gates:gate";
  const npmCommandsGateCommand = byKey["npm-commands-text"] || "npm run quality:gates:commands:gate";
  const npmCsvCommand = "npm run quality:gates:csv";
  const npmReportCommand = "npm run quality:gates:report";
  const npmMetricsCommand = "npm run quality:gates:metrics";
  const npmEventsCommand = "npm run quality:gates:events";
  const npmAlertCommand = "npm run quality:gates:alert";
  const npmHealthCommand = "npm run quality:gates:health";
  const npmRemediationCommand = "npm run quality:gates:remediation";
  const npmSarifCommand = "npm run quality:gates:sarif";
  const npmStepSummaryCommand = "npm run quality:gates:step-summary";
  const npmAnnotationsCommand = "npm run quality:gates:annotations:gate";
  const npmOutputsCommand = "npm run quality:gates:outputs:gate";
  const npmPrCommentCommand = "npm run quality:gates:pr-comment";
  return [
    {
      key: "local-shell",
      label: "Local shell",
      path: localShellPath,
      url: `${baseUrl}${localShellPath}`,
      language: "bash",
      contentType: "text/x-shellscript",
      body: [
        "cd webapp",
        "npm start &",
        "server_pid=$!",
        "trap 'kill \"$server_pid\" 2>/dev/null || true' EXIT",
        "sleep 2",
        `${npmCsvCommand} > travel-quality-gates.csv`,
        `${npmReportCommand} > travel-quality-gates-report.md`,
        `${npmMetricsCommand} > travel-quality-gates.prom`,
        `${npmEventsCommand} > travel-quality-gates.ndjson`,
        `${npmAlertCommand} > travel-quality-gates-alert.json`,
        `${npmRemediationCommand} > travel-quality-gates-remediation.md`,
        `${npmSarifCommand} > travel-quality-gates.sarif.json`,
        `${npmStepSummaryCommand} > travel-quality-gates-summary.md`,
        `${npmPrCommentCommand} > travel-quality-gates-pr-comment.md`,
        `${npmOutputsCommand} > travel-quality-gates.outputs`,
        `${npmAnnotationsCommand} || true`,
        npmHealthCommand,
        npmGateCommand,
        npmCommandsGateCommand,
      ].join("\n"),
    },
    {
      key: "github-actions-node",
      label: "GitHub Actions Node",
      filename: ".github/workflows/travel-quality-gates.yml",
      path: githubActionsPath,
      url: `${baseUrl}${githubActionsPath}`,
      language: "yaml",
      contentType: "text/yaml",
      sourceUrls: [
        "https://github.com/actions/checkout",
        "https://github.com/actions/setup-node",
        "https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file",
        "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary",
      ],
      body: [
        "name: Travel Quality Gates",
        "",
        "on:",
        "  pull_request:",
        "  push:",
        "    branches: [main]",
        "",
        "permissions:",
        "  contents: read",
        "  security-events: write",
        "  actions: read",
        "",
        "jobs:",
        "  quality-gates:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v6",
        "      - uses: actions/setup-node@v6",
        "        with:",
        "          node-version: 24",
        "          package-manager-cache: false",
        "      - run: npm ci",
        "        working-directory: webapp",
        "      - id: quality-gates",
        "        run: |",
        "          npm start &",
        "          server_pid=$!",
        "          trap 'kill \"$server_pid\" 2>/dev/null || true' EXIT",
        "          sleep 2",
        `          ${npmCsvCommand} > travel-quality-gates.csv`,
        `          ${npmReportCommand} > travel-quality-gates-report.md`,
        `          ${npmMetricsCommand} > travel-quality-gates.prom`,
        `          ${npmEventsCommand} > travel-quality-gates.ndjson`,
        `          ${npmAlertCommand} > travel-quality-gates-alert.json`,
        `          ${npmRemediationCommand} > travel-quality-gates-remediation.md`,
        `          ${npmSarifCommand} > travel-quality-gates.sarif.json`,
        `          ${npmPrCommentCommand} > travel-quality-gates-pr-comment.md`,
        `          ${npmStepSummaryCommand} >> "$GITHUB_STEP_SUMMARY"`,
        `          ${npmOutputsCommand} >> "$GITHUB_OUTPUT"`,
        `          ${npmAnnotationsCommand} || true`,
        `          ${npmHealthCommand}`,
        `          ${npmGateCommand}`,
        `          ${npmCommandsGateCommand}`,
        "        working-directory: webapp",
        "      - uses: github/codeql-action/upload-sarif@v4",
        "        if: always()",
        "        with:",
        "          sarif_file: webapp/travel-quality-gates.sarif.json",
        "          category: travel-planner-quality-gates",
      ].join("\n"),
    },
  ];
}

function qualityGateMatrixActions(gates = [], options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const failedKeys = new Set(gates.filter((gate) => gate.failed).map((gate) => gate.key));
  const actions = [];
  const pushAction = (key, label, path, description) => {
    if (actions.some((action) => action.key === key)) return;
    const url = baseUrl && path ? `${baseUrl}${path}` : "";
    const target = url || path;
    actions.push({
      key,
      label,
      path,
      url,
      text: target ? `${label}: ${target} ${description}` : `${label}: ${description}`,
    });
  };
  if (failedKeys.has("urgent") || failedKeys.has("urgent-soft")) {
    pushAction("urgent-todo", "긴급 TODO", "/api/plans/quality-todo.txt?urgent=true&all=true", "로 우선도 80 이상 후보를 먼저 보강하세요.");
  }
  if (failedKeys.has("next") || failedKeys.has("next-soft")) {
    pushAction("next-todo", "다음 TODO", "/api/plans/quality-todo.txt?next=true&all=true", "로 현재 추천 품질 필터 후보를 묶어 보강하세요.");
  }
  if (failedKeys.has("strict") || failedKeys.has("soft")) {
    pushAction("quality-todo", "전체 TODO", "/api/plans/quality-todo.txt?all=true", "로 전체 고도화 후보를 묶어 보강하세요.");
  }
  if (!actions.length) {
    actions.push({
      key: "pass",
      label: "통과",
      text: "모든 기준을 통과했습니다. 신규 플랜 생성이나 다음 고도화로 넘어가도 됩니다.",
    });
  }
  return actions;
}

export function buildQualityGateMatrix(summary = {}, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const nextFilter = String(summary.qualityNextFilter || "").trim();
  const nextLabel = String(summary.qualityNextLabel || "").trim();
  const nextReason = String(summary.qualityNextReason || "").trim();
  const nextCount = nextFilter ? qualityTodoFilterCount(summary, nextFilter) : 0;
  const gates = [
    qualityGateMatrixItem(summary, { key: "strict", label: "전체 strict", count: summary.qualityAction, limit: 0, path: summary.qualityGatePath, textPath: summary.qualityGateTextPath, baseUrl }),
    qualityGateMatrixItem(summary, { key: "soft", label: "전체 완화 5", count: summary.qualityAction, limit: 5, path: summary.qualitySoftGatePath, textPath: summary.qualitySoftGateTextPath, baseUrl }),
    qualityGateMatrixItem(summary, { key: "urgent", label: "긴급 strict", count: summary.qualityUrgent, limit: 0, path: summary.qualityUrgentGatePath, textPath: summary.qualityUrgentGateTextPath, baseUrl }),
    qualityGateMatrixItem(summary, { key: "urgent-soft", label: "긴급 완화 5", count: summary.qualityUrgent, limit: 5, path: summary.qualityUrgentSoftGatePath, textPath: summary.qualityUrgentSoftGateTextPath, baseUrl }),
  ];
  if (nextFilter) {
    gates.push(
      qualityGateMatrixItem(summary, { key: "next", label: `${nextLabel || "다음"} strict`, count: nextCount, limit: 0, path: summary.qualityNextGatePath, textPath: summary.qualityNextGateTextPath, baseUrl }),
      qualityGateMatrixItem(summary, { key: "next-soft", label: `${nextLabel || "다음"} 완화 5`, count: nextCount, limit: 5, path: summary.qualityNextSoftGatePath, textPath: summary.qualityNextSoftGateTextPath, baseUrl })
    );
  }
  const failedCount = gates.filter((gate) => gate.failed).length;
  const actions = qualityGateMatrixActions(gates, { baseUrl });
  const commands = buildQualityGateCommands({ baseUrl });
  const commandBundle = commands.map((command) => command.command).filter(Boolean).join("\n");
  const ciExamples = buildQualityGateCiExamples({ commands, baseUrl });
  const matrix = {
    meta: {
      type: "quality-gates",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      failed: failedCount > 0,
      failedCount,
      gateCount: gates.length,
      actionCount: actions.length,
      commandCount: commands.length,
      ciExampleCount: ciExamples.length,
      badgePath: "/api/plans/quality-gates.badge.json",
      badgeUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.badge.json` : "",
      badgeSvgPath: "/api/plans/quality-gates.badge.svg",
      badgeSvgUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.badge.svg` : "",
      badgeMarkdownPath: "/api/plans/quality-gates.badge.md",
      badgeMarkdownUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.badge.md` : "",
      csvPath: "/api/plans/quality-gates.csv",
      csvGatePath: "/api/plans/quality-gates.csv?failOnFailed=true",
      csvUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.csv` : "",
      reportPath: "/api/plans/quality-gates.report.md",
      reportGatePath: "/api/plans/quality-gates.report.md?failOnFailed=true",
      reportUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.report.md` : "",
      metricsPath: "/api/plans/quality-gates.metrics",
      metricsGatePath: "/api/plans/quality-gates.metrics?failOnFailed=true",
      metricsUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.metrics` : "",
      eventsPath: "/api/plans/quality-gates.events.ndjson",
      eventsGatePath: "/api/plans/quality-gates.events.ndjson?failOnFailed=true",
      eventsUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.events.ndjson` : "",
      alertPath: "/api/plans/quality-gates.alert.json",
      alertGatePath: "/api/plans/quality-gates.alert.json?failOnFailed=true",
      alertUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.alert.json` : "",
      healthPath: "/api/plans/quality-gates.health",
      healthUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.health` : "",
      remediationPath: "/api/plans/quality-gates.remediation.md",
      remediationGatePath: "/api/plans/quality-gates.remediation.md?failOnFailed=true",
      remediationUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.remediation.md` : "",
      junitPath: "/api/plans/quality-gates.junit.xml",
      junitGatePath: "/api/plans/quality-gates.junit.xml?failOnFailed=true",
      junitUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.junit.xml` : "",
      sarifPath: "/api/plans/quality-gates.sarif.json",
      sarifGatePath: "/api/plans/quality-gates.sarif.json?failOnFailed=true",
      sarifUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.sarif.json` : "",
      stepSummaryPath: "/api/plans/quality-gates.step-summary.md",
      stepSummaryGatePath: "/api/plans/quality-gates.step-summary.md?failOnFailed=true",
      stepSummaryUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.step-summary.md` : "",
      annotationsPath: "/api/plans/quality-gates.annotations.txt",
      annotationsGatePath: "/api/plans/quality-gates.annotations.txt?failOnFailed=true",
      annotationsUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.annotations.txt` : "",
      outputsPath: "/api/plans/quality-gates.outputs.txt",
      outputsGatePath: "/api/plans/quality-gates.outputs.txt?failOnFailed=true",
      outputsUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.outputs.txt` : "",
      prCommentPath: "/api/plans/quality-gates.pr-comment.md",
      prCommentGatePath: "/api/plans/quality-gates.pr-comment.md?failOnFailed=true",
      prCommentUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.pr-comment.md` : "",
      artifactsPath: "/api/plans/quality-gates.artifacts.json",
      artifactsGatePath: "/api/plans/quality-gates.artifacts.json?failOnFailed=true",
      artifactsUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.artifacts.json` : "",
      ciGuidePath: "/api/plans/quality-gates.ci.md",
      ciGuideUrl: baseUrl ? `${baseUrl}/api/plans/quality-gates.ci.md` : "",
      commandBundle,
      nextFilter,
      nextLabel,
      nextReason,
      baseUrl,
      baseUrlSource: String(options.baseUrlSource || ""),
    },
    gates,
    actions,
    commands,
    ciExamples,
    commandBundle,
  };
  matrix.meta.badgeMarkdown = qualityGateBadgeMarkdown(matrix);
  return {
    ...matrix,
    badge: qualityGateBadge(matrix),
    badgeSvg: qualityGateBadgeSvg(matrix),
    badgeMarkdown: matrix.meta.badgeMarkdown,
    junitXml: qualityGateJUnitXml(matrix),
    sarifJson: qualityGateSarifJson(matrix),
    stepSummaryText: qualityGateStepSummaryMarkdown(matrix),
    prCommentText: qualityGatePrCommentMarkdown(matrix),
    annotationsText: qualityGateAnnotationsText(matrix),
    outputsText: qualityGateOutputsText(matrix),
    artifacts: qualityGateArtifacts(matrix),
    gateText: qualityGateMatrixText(matrix),
    csvText: qualityGateCsvText(matrix),
    reportText: qualityGateReportMarkdown(matrix),
    metricsText: qualityGateMetricsText(matrix),
    eventsText: qualityGateEventsNdjson(matrix),
    alert: qualityGateAlert(matrix),
    healthText: qualityGateHealthText(matrix),
    remediationText: qualityGateRemediationMarkdown(matrix),
    ciGuideText: qualityGateCiGuideMarkdown(matrix),
  };
}

export function qualityTodoUrl(plan, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const refinePath = qualityTodoPath(plan);
  return baseUrl && refinePath ? `${baseUrl}${refinePath}` : "";
}

export function qualityTodoPlanText(plan, index, options = {}) {
  const needsAudit = planNeedsQualityAudit(plan);
  const priority = String(plan?.qualityActionPriorityLabel || "").trim();
  const reason = String(plan?.qualityActionReason || "").trim() || "품질 보강 필요";
  const link = qualityTodoUrl(plan, options) || qualityTodoPath(plan);
  const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Math.floor(Number(options.offset))) : 0;
  return [
    `${offset + index + 1}. ${qualityTodoPlanLabel(plan)}`,
    priority ? `- 우선도: ${priority}` : "",
    `- 이유: ${reason}`,
    `- 다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}`,
    `- 링크: ${link}`,
  ].filter(Boolean).join("\n");
}

export function qualityTodoText(summary = {}, plans = [], options = {}) {
  const optionAction = Number(options.totalActionCount);
  const action = Number.isFinite(optionAction) ? optionAction : Number(summary.qualityAction);
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.floor(Number(options.minPriority))) : 0;
  const optionUnfilteredAction = Number(options.unfilteredActionCount);
  const unfilteredAction = Number.isFinite(optionUnfilteredAction) ? optionUnfilteredAction : null;
  const optionFilterLabel = String(options.filterLabel || "").trim();
  const actionLabel = optionFilterLabel || "고도화 후보";
  const urgentActionCount = Number.isFinite(Number(summary.qualityUrgent)) ? Number(summary.qualityUrgent) : null;
  const qualityNextFilter = String(summary.qualityNextFilter || "").trim();
  const qualityNextLabel = String(summary.qualityNextLabel || "").trim();
  const qualityNextReason = String(summary.qualityNextReason || "").trim();
  const qualityNextApiPath = String(summary.qualityNextApiPath || "").trim();
  const qualityNextTodoPath = String(summary.qualityNextTodoPath || "").trim();
  const qualityNextTodoTextPath = String(summary.qualityNextTodoTextPath || "").trim();
  const qualityGateTextPath = String(summary.qualityGateTextPath || "").trim();
  const qualitySoftGateTextPath = String(summary.qualitySoftGateTextPath || "").trim();
  const qualityUrgentGateTextPath = String(summary.qualityUrgentGateTextPath || "").trim();
  const qualityUrgentSoftGateTextPath = String(summary.qualityUrgentSoftGateTextPath || "").trim();
  const qualityNextGateTextPath = String(summary.qualityNextGateTextPath || "").trim();
  const qualityNextSoftGateTextPath = String(summary.qualityNextSoftGateTextPath || "").trim();
  const qualityNextText = qualityNextFilter || qualityNextLabel || qualityNextReason
    ? `- 다음 품질 필터: ${qualityNextLabel || qualityNextFilter || "없음"}${qualityNextFilter ? ` (${qualityNextFilter})` : ""}${qualityNextReason ? ` · ${qualityNextReason}` : ""}`
    : "";
  const qualityNextCallText = qualityNextApiPath || qualityNextTodoPath || qualityNextTodoTextPath
    ? `- 다음 호출: ${qualityNextApiPath || "목록 없음"}${qualityNextTodoPath ? ` · TODO ${qualityNextTodoPath}` : ""}${qualityNextTodoTextPath ? ` · TEXT ${qualityNextTodoTextPath}` : ""}`
    : "";
  const qualityGateCallText = qualityGateTextPath || qualitySoftGateTextPath || qualityUrgentGateTextPath || qualityUrgentSoftGateTextPath || qualityNextGateTextPath || qualityNextSoftGateTextPath
    ? `- 게이트 호출: ${qualityGateTextPath ? `STRICT ${qualityGateTextPath}` : ""}${qualitySoftGateTextPath ? ` · SOFT ${qualitySoftGateTextPath}` : ""}${qualityUrgentGateTextPath ? ` · URGENT ${qualityUrgentGateTextPath}` : ""}${qualityUrgentSoftGateTextPath ? ` · URGENT-SOFT ${qualityUrgentSoftGateTextPath}` : ""}${qualityNextGateTextPath ? ` · NEXT ${qualityNextGateTextPath}` : ""}${qualityNextSoftGateTextPath ? ` · NEXT-SOFT ${qualityNextSoftGateTextPath}` : ""}`
    : "";
  const filterEmpty = minPriority > 0 && Number.isFinite(unfilteredAction) && unfilteredAction > 0 && action <= 0;
  const requestedOffset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0;
  const requestedLimit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : null;
  const returnedCount = plans.length;
  const endOffset = requestedOffset + returnedCount;
  const remainingCount = Number.isFinite(action) ? Math.max(0, action - endOffset) : 0;
  const nextOffset = remainingCount > 0 ? endOffset : null;
  const countText = Number.isFinite(action) && (requestedOffset > 0 || action > returnedCount)
    ? `${action} 중 ${returnedCount ? `${requestedOffset + 1}-${endOffset}번째` : "반환 0개"}`
    : String(returnedCount);
  const nextBatchPath = String(options.nextApiPath || "").trim();
  const nextBatchCli = String(options.nextCliCommand || "").trim();
  const nextBatchHint = nextOffset === null
    ? ""
    : `- 다음 배치: limit ${requestedLimit || returnedCount || 10}, offset ${nextOffset}로 이어서 조회.${nextBatchPath ? ` API ${nextBatchPath}` : ""}${nextBatchCli ? ` · CLI ${nextBatchCli}` : ""}`;
  const statusText = filterEmpty
    ? "- 상태: 지정 우선도 이상의 품질 고도화 후보가 없습니다. minPriority를 낮추거나 필터 없이 조회하세요."
    : Number.isFinite(action) && action <= 0
    ? "- 상태: 현재 처리할 품질 고도화 후보가 없습니다."
    : returnedCount <= 0
    ? "- 상태: 요청한 offset 범위에 품질 고도화 후보가 없습니다."
    : "";
  const legacyCountText = Number.isFinite(action) && action > returnedCount && requestedOffset <= 0
    ? `${action} 중 상위 ${plans.length}개`
    : countText;
  const failOnAction = Boolean(options.failOnAction);
  const actionGateLimit = Number.isFinite(Number(options.actionGateLimit))
    ? Math.max(0, Math.min(5000, Math.floor(Number(options.actionGateLimit))))
    : Number.isFinite(Number(options.maxActions))
    ? Math.max(0, Math.min(5000, Math.floor(Number(options.maxActions))))
    : 0;
  const actionGateCount = Number.isFinite(Number(options.actionGateCount)) ? Number(options.actionGateCount) : Number.isFinite(action) ? action : 0;
  const failedOnAction = failOnAction && actionGateCount > actionGateLimit;
  const gateText = failOnAction
    ? `- 게이트: 후보 ${actionGateCount}개 / 허용 ${actionGateLimit}개 · ${failedOnAction ? "실패 (exit 3)" : "통과"}`
    : "";
  return [
    "Travel Planner 품질 고도화 TODO",
    `- ${actionLabel}${minPriority > 0 ? ` (우선도 ${minPriority} 이상)` : ""}: ${legacyCountText}`,
    urgentActionCount === null ? "" : `- 긴급 후보: ${urgentActionCount}`,
    qualityNextText,
    qualityNextCallText,
    qualityGateCallText,
    statusText,
    plans.length ? `- 묶음 실행 프롬프트: 상위 후보 ${plans.length}개를 우선도 높은 순서대로 처리. 미점검은 품질 점검 생성, 품질 경고/악화는 이유에 맞춰 품질 보강.` : "",
    nextBatchHint,
    gateText,
    ...plans.map((plan, index) => qualityTodoPlanText(plan, index, options)),
  ].filter(Boolean).join("\n\n");
}

export function buildQualityTodoPayload(summary = {}, plans = [], options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const todoPlans = plans.map((plan) => ({
    ...plan,
    qualityRefinePath: qualityTodoPath(plan),
    qualityRefineUrl: qualityTodoUrl(plan, { baseUrl }),
  }));
  const requestedLimit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : null;
  const requestedOffset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0;
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.floor(Number(options.minPriority))) : 0;
  const nextMode = Boolean(options.next);
  const todoFilter = String(options.filter || "").trim();
  const selectionSource = nextMode ? "next" : todoFilter ? "filter" : "default";
  const unfilteredActionCount = Number.isFinite(Number(summary.qualityAction)) ? Number(summary.qualityAction) : null;
  const urgentActionCount = Number.isFinite(Number(summary.qualityUrgent)) ? Number(summary.qualityUrgent) : null;
  const qualityNextFilter = String(summary.qualityNextFilter || "").trim();
  const qualityNextLabel = String(summary.qualityNextLabel || "").trim();
  const qualityNextReason = String(summary.qualityNextReason || "").trim();
  const qualityNextApiPath = String(summary.qualityNextApiPath || "").trim();
  const qualityNextTodoPath = String(summary.qualityNextTodoPath || "").trim();
  const qualityNextTodoTextPath = String(summary.qualityNextTodoTextPath || "").trim();
  const qualityGatePath = String(summary.qualityGatePath || "").trim();
  const qualityGateTextPath = String(summary.qualityGateTextPath || "").trim();
  const qualitySoftGatePath = String(summary.qualitySoftGatePath || "").trim();
  const qualitySoftGateTextPath = String(summary.qualitySoftGateTextPath || "").trim();
  const qualityUrgentGatePath = String(summary.qualityUrgentGatePath || "").trim();
  const qualityUrgentGateTextPath = String(summary.qualityUrgentGateTextPath || "").trim();
  const qualityUrgentSoftGatePath = String(summary.qualityUrgentSoftGatePath || "").trim();
  const qualityUrgentSoftGateTextPath = String(summary.qualityUrgentSoftGateTextPath || "").trim();
  const qualityNextGatePath = String(summary.qualityNextGatePath || "").trim();
  const qualityNextGateTextPath = String(summary.qualityNextGateTextPath || "").trim();
  const qualityNextSoftGatePath = String(summary.qualityNextSoftGatePath || "").trim();
  const qualityNextSoftGateTextPath = String(summary.qualityNextSoftGateTextPath || "").trim();
  const totalActionCount = Number.isFinite(Number(options.totalActionCount)) ? Number(options.totalActionCount) : unfilteredActionCount;
  const rangeStart = todoPlans.length ? requestedOffset + 1 : null;
  const rangeEnd = todoPlans.length ? requestedOffset + todoPlans.length : null;
  const remainingCount = totalActionCount === null ? null : Math.max(0, totalActionCount - requestedOffset - todoPlans.length);
  const hasMore = remainingCount === null ? false : remainingCount > 0;
  const isEmpty = todoPlans.length === 0;
  const filterEmpty = minPriority > 0 && Number.isFinite(unfilteredActionCount) && unfilteredActionCount > 0 && totalActionCount === 0;
  const status = filterEmpty ? "empty-filter" : totalActionCount === 0 ? "no-action" : isEmpty ? "empty-batch" : "ready";
  const statusMessage = status === "empty-filter"
    ? "지정 우선도 이상의 품질 고도화 후보가 없습니다."
    : status === "no-action"
    ? "현재 처리할 품질 고도화 후보가 없습니다."
    : status === "empty-batch"
    ? "요청한 offset 범위에 품질 고도화 후보가 없습니다."
    : "품질 고도화 후보를 우선도순으로 처리할 수 있습니다.";
  const recommendedAction = status === "empty-filter"
    ? "lower-min-priority"
    : status === "no-action"
    ? "none"
    : status === "empty-batch"
    ? "reset-offset"
    : "process-batch";
  const nextOffset = hasMore ? requestedOffset + todoPlans.length : null;
  const nextLimit = requestedLimit || todoPlans.length || 10;
  const currentLimit = requestedLimit || todoPlans.length || 10;
  const allMode = Boolean(options.all);
  const urgentMode = (Boolean(options.urgent) || todoFilter === "quality-urgent") && minPriority === 80;
  const prioritySource = urgentMode ? "urgent" : minPriority > 0 ? "min-priority" : "none";
  const failOnEmpty = Boolean(options.failOnEmpty);
  const failOnAction = Boolean(options.failOnAction);
  const maxActions = Number.isFinite(Number(options.maxActions)) ? Math.max(0, Math.min(5000, Math.floor(Number(options.maxActions)))) : null;
  const actionGateLimit = maxActions === null ? 0 : maxActions;
  const actionGateCount = Number.isFinite(Number(totalActionCount)) ? Number(totalActionCount) : 0;
  const failedOnEmpty = failOnEmpty && isEmpty;
  const failedOnAction = failOnAction && actionGateCount > actionGateLimit;
  const failed = failedOnEmpty || failedOnAction;
  const exitCode = failedOnAction ? 3 : failedOnEmpty ? 2 : 0;
  const priorityQuery = urgentMode ? "&urgent=true" : minPriority > 0 ? `&minPriority=${minPriority}` : "";
  const priorityCliArg = urgentMode ? " --urgent" : minPriority > 0 ? ` --min-priority=${minPriority}` : "";
  const modeQuery = nextMode ? "&next=true" : "";
  const modeCliArg = nextMode ? " --next" : "";
  const gateQuery = `${failOnEmpty ? "&failOnEmpty=true" : ""}${failOnAction && maxActions === null ? "&failOnAction=true" : ""}${maxActions !== null ? `&maxActions=${maxActions}` : ""}`;
  const gateCliArg = `${failOnEmpty ? " --fail-on-empty" : ""}${failOnAction && maxActions === null ? " --fail-on-action" : ""}${maxActions !== null ? ` --max-actions=${maxActions}` : ""}`;
  const currentQuery = `${allMode ? `all=true&offset=${requestedOffset}` : `limit=${currentLimit}&offset=${requestedOffset}`}${priorityQuery}${modeQuery}${gateQuery}`;
  const currentApiPath = `/api/plans/quality-todo?${currentQuery}`;
  const currentTextPath = `/api/plans/quality-todo.txt?${currentQuery}`;
  const currentCliArgs = `${allMode ? `--all --offset=${requestedOffset}` : `--limit=${currentLimit} --offset=${requestedOffset}`}${priorityCliArg}${modeCliArg}${gateCliArg}`;
  const allQuery = `all=true&offset=${requestedOffset}${priorityQuery}${modeQuery}${gateQuery}`;
  const allApiPath = `/api/plans/quality-todo?${allQuery}`;
  const allTextPath = `/api/plans/quality-todo.txt?${allQuery}`;
  const allCliArgs = `--all --offset=${requestedOffset}${priorityCliArg}${modeCliArg}${gateCliArg}`;
  const nextQuery = nextOffset === null ? "" : `${allMode ? `all=true&offset=${nextOffset}` : `limit=${nextLimit}&offset=${nextOffset}`}${priorityQuery}${modeQuery}${gateQuery}`;
  const nextApiPath = nextQuery ? `/api/plans/quality-todo?${nextQuery}` : "";
  const nextTextPath = nextQuery ? `/api/plans/quality-todo.txt?${nextQuery}` : "";
  const nextCliArgs = nextOffset === null ? "" : `${allMode ? `--all --offset=${nextOffset}` : `--limit=${nextLimit} --offset=${nextOffset}`}${priorityCliArg}${modeCliArg}${gateCliArg}`;
  const optionFilterLabel = String(options.filterLabel || "").trim();
  const filterLabel = optionFilterLabel || (minPriority > 0 ? `우선도 ${minPriority} 이상` : "전체 고도화 후보");
  const batchSummary = rangeStart === null ? `${filterLabel} · 반환 0개` : `${filterLabel} · ${rangeStart}-${rangeEnd}번째`;
  return {
    meta: {
      type: "quality-todo",
      schemaVersion: 1,
      source: String(options.source || "unknown"),
      allMode,
      nextMode,
      urgentMode,
      failOnEmpty,
      failOnAction,
      maxActions,
      actionGateLimit,
      actionGateCount,
      actionGateStatus: failOnAction ? failedOnAction ? "failed" : "passed" : "off",
      failedOnEmpty,
      failedOnAction,
      failed,
      exitCode,
      prioritySource,
      selectionSource,
      status,
      statusMessage,
      recommendedAction,
      isEmpty,
      generatedAt: new Date().toISOString(),
      requestedLimit,
      requestedOffset,
      returnedCount: todoPlans.length,
      minPriority,
      todoFilter,
      filterLabel,
      actionCountScope: todoFilter || (minPriority > 0 ? "min-priority" : "all"),
      filterEmpty,
      unfilteredActionCount,
      urgentActionCount,
      qualityNextFilter,
      qualityNextLabel,
      qualityNextReason,
      qualityNextApiPath,
      qualityNextApiUrl: baseUrl && qualityNextApiPath ? `${baseUrl}${qualityNextApiPath}` : "",
      qualityNextTodoPath,
      qualityNextTodoUrl: baseUrl && qualityNextTodoPath ? `${baseUrl}${qualityNextTodoPath}` : "",
      qualityNextTodoTextPath,
      qualityNextTodoTextUrl: baseUrl && qualityNextTodoTextPath ? `${baseUrl}${qualityNextTodoTextPath}` : "",
      qualityGatePath,
      qualityGateUrl: baseUrl && qualityGatePath ? `${baseUrl}${qualityGatePath}` : "",
      qualityGateTextPath,
      qualityGateTextUrl: baseUrl && qualityGateTextPath ? `${baseUrl}${qualityGateTextPath}` : "",
      qualitySoftGatePath,
      qualitySoftGateUrl: baseUrl && qualitySoftGatePath ? `${baseUrl}${qualitySoftGatePath}` : "",
      qualitySoftGateTextPath,
      qualitySoftGateTextUrl: baseUrl && qualitySoftGateTextPath ? `${baseUrl}${qualitySoftGateTextPath}` : "",
      qualityUrgentGatePath,
      qualityUrgentGateUrl: baseUrl && qualityUrgentGatePath ? `${baseUrl}${qualityUrgentGatePath}` : "",
      qualityUrgentGateTextPath,
      qualityUrgentGateTextUrl: baseUrl && qualityUrgentGateTextPath ? `${baseUrl}${qualityUrgentGateTextPath}` : "",
      qualityUrgentSoftGatePath,
      qualityUrgentSoftGateUrl: baseUrl && qualityUrgentSoftGatePath ? `${baseUrl}${qualityUrgentSoftGatePath}` : "",
      qualityUrgentSoftGateTextPath,
      qualityUrgentSoftGateTextUrl: baseUrl && qualityUrgentSoftGateTextPath ? `${baseUrl}${qualityUrgentSoftGateTextPath}` : "",
      qualityNextGatePath,
      qualityNextGateUrl: baseUrl && qualityNextGatePath ? `${baseUrl}${qualityNextGatePath}` : "",
      qualityNextGateTextPath,
      qualityNextGateTextUrl: baseUrl && qualityNextGateTextPath ? `${baseUrl}${qualityNextGateTextPath}` : "",
      qualityNextSoftGatePath,
      qualityNextSoftGateUrl: baseUrl && qualityNextSoftGatePath ? `${baseUrl}${qualityNextSoftGatePath}` : "",
      qualityNextSoftGateTextPath,
      qualityNextSoftGateTextUrl: baseUrl && qualityNextSoftGateTextPath ? `${baseUrl}${qualityNextSoftGateTextPath}` : "",
      rangeStart,
      rangeEnd,
      batchLabel: rangeStart === null ? "반환 0개" : `${rangeStart}-${rangeEnd}번째`,
      batchSummary,
      totalActionCount,
      remainingCount,
      hasMore,
      currentQuery,
      currentApiPath,
      currentApiUrl: baseUrl ? `${baseUrl}${currentApiPath}` : "",
      currentTextPath,
      currentTextUrl: baseUrl ? `${baseUrl}${currentTextPath}` : "",
      currentCliArgs,
      currentCliCommand: `npm run quality:todo -- ${currentCliArgs}`,
      currentCurlCommand: baseUrl ? `curl -s "${baseUrl}${currentApiPath}"` : "",
      currentTextCurlCommand: baseUrl ? `curl -s "${baseUrl}${currentTextPath}"` : "",
      allQuery,
      allApiPath,
      allApiUrl: baseUrl ? `${baseUrl}${allApiPath}` : "",
      allTextPath,
      allTextUrl: baseUrl ? `${baseUrl}${allTextPath}` : "",
      allCliArgs,
      allCliCommand: `npm run quality:todo -- ${allCliArgs}`,
      allCurlCommand: baseUrl ? `curl -s "${baseUrl}${allApiPath}"` : "",
      allTextCurlCommand: baseUrl ? `curl -s "${baseUrl}${allTextPath}"` : "",
      nextOffset,
      nextQuery,
      nextApiPath,
      nextApiUrl: baseUrl && nextApiPath ? `${baseUrl}${nextApiPath}` : "",
      nextTextPath,
      nextTextUrl: baseUrl && nextTextPath ? `${baseUrl}${nextTextPath}` : "",
      nextCliArgs,
      nextCliCommand: nextCliArgs ? `npm run quality:todo -- ${nextCliArgs}` : "",
      nextCurlCommand: baseUrl && nextApiPath ? `curl -s "${baseUrl}${nextApiPath}"` : "",
      nextTextCurlCommand: baseUrl && nextTextPath ? `curl -s "${baseUrl}${nextTextPath}"` : "",
      baseUrl,
      baseUrlSource: String(options.baseUrlSource || ""),
    },
    summary,
    plans: todoPlans,
    nextPlan: todoPlans[0] || null,
    todoText: qualityTodoText(summary, todoPlans, { baseUrl, limit: requestedLimit, offset: requestedOffset, minPriority, totalActionCount, unfilteredActionCount, filterLabel, nextApiPath, nextCliCommand: nextCliArgs ? `npm run quality:todo -- ${nextCliArgs}` : "", failOnAction, actionGateLimit, actionGateCount }),
  };
}
