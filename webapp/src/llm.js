import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ORCHESTRATOR_FILE =
  process.env.TRAVEL_ORCHESTRATOR_PATH ||
  path.join(__dirname, "..", "..", ".claude", "skills", "travel-orchestrator", "SKILL.md");
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";
const OPENAI_PATH_SUFFIX = "/chat/completions";

function formatList(items) {
  return items.filter(Boolean).join(", ");
}

async function loadOrchestratorSkill() {
  if (loadOrchestratorSkill.cached !== undefined) return loadOrchestratorSkill.cached;
  try {
    const text = await fs.readFile(ORCHESTRATOR_FILE, "utf-8");
    loadOrchestratorSkill.cached = text.trim() || DEFAULT_ORCHESTRATOR_GUIDE;
  } catch (_err) {
    loadOrchestratorSkill.cached = DEFAULT_ORCHESTRATOR_GUIDE;
  }
  return loadOrchestratorSkill.cached;
}

const DEFAULT_ORCHESTRATOR_GUIDE =
  "여행 요구사항 수집, 날씨/교통/현지 정보 수집, 일정 최적화, 예약 준비, 여행 플랜 보고서 순서로 계획한다.";

const PLAN_QUALITY_GUARDRAILS = [
  "일정은 체류 기간에 맞춰 Day 1부터 마지막 날까지 빠짐없이 작성한다.",
  "하루에 핵심 동선은 2~3개 이하로 묶고, 이동/식사/휴식 버퍼를 명시한다.",
  "날씨, 영업시간, 교통, 예약 가능 여부처럼 실시간 확인이 필요한 내용은 확인 필요로 표시한다.",
  "비가 오거나 휴무일 때 바꿀 수 있는 실내/근거리 대안을 최소 1개 포함한다.",
  "예약 준비와 다음 고도화 질문은 사용자가 바로 행동할 수 있는 체크리스트 문장으로 쓴다.",
];

function tripDayCount(payload) {
  const nights = Number(payload.nights) || 1;
  return Math.max(1, nights + 1);
}

function fallbackItinerary(payload) {
  const days = tripDayCount(payload);
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    if (day === 1) {
      return `### Day ${day}
- 이동 및 숙소 체크인
- 목적지 주변에서 짧은 적응 일정
- 저녁 식사 후 다음 날 동선 확인`;
    }
    if (day === days) {
      return `### Day ${day}
- 체크아웃 전 짐 정리
- 귀환 교통 전 가까운 명소 또는 카페 1곳
- 공항/역/터미널 이동 시간 여유 확보`;
    }
    return `### Day ${day}
- 오전: 동선이 가까운 핵심 명소 1곳
- 오후: 식사와 휴식을 포함한 핵심 명소 1곳
- 우천/휴무 대안: 실내 장소 또는 숙소 근처 일정으로 교체`;
  }).join("\n\n");
}

function buildPlanQualityAudit(payload, planText) {
  const text = String(planText || "");
  const expectedDays = Array.from({ length: tripDayCount(payload) }, (_, index) => index + 1);
  const missingDays = expectedDays.filter((day) => {
    const dayPattern = new RegExp(`(?:Day\\s*${day}\\b|${day}\\s*일차)`, "i");
    return !dayPattern.test(text);
  });
  const hasRealtimeCaveat = /확인 필요|실시간|영업시간|예약 가능|잔여석|날씨/i.test(text);
  const hasWeatherAlternative = /우천|비가|실내|휴무|대안/i.test(text);
  const hasPacingBuffer = /버퍼|여유|휴식|식사|이동 시간|체크인|체크아웃/i.test(text);
  const hasReservationChecklist = /예약|교통편|숙박|체크리스트|준비/i.test(text);
  const checks = [
    {
      ok: missingDays.length === 0,
      label: "체류 일수",
      detail: missingDays.length === 0 ? `${expectedDays.length}일 모두 표시` : `누락 가능: Day ${missingDays.join(", Day ")}`,
    },
    {
      ok: hasRealtimeCaveat,
      label: "실시간 확인",
      detail: hasRealtimeCaveat ? "확인 필요 항목 표시" : "날씨/영업시간/교통 확인 필요 문구 보강",
    },
    {
      ok: hasWeatherAlternative,
      label: "우천/휴무 대안",
      detail: hasWeatherAlternative ? "대안 포함" : "실내/근거리 대안 보강",
    },
    {
      ok: hasPacingBuffer,
      label: "동선 버퍼",
      detail: hasPacingBuffer ? "여유/휴식/이동 고려" : "식사/휴식/이동 여유 보강",
    },
    {
      ok: hasReservationChecklist,
      label: "예약 준비",
      detail: hasReservationChecklist ? "예약/준비 항목 포함" : "예약 전 확인 체크리스트 보강",
    },
  ];
  return [
    "## 자동 품질 점검",
    ...checks.map((item) => `- ${item.ok ? "OK" : "확인"} ${item.label}: ${item.detail}`),
  ].join("\n");
}

function appendPlanQualityAudit(payload, planText) {
  const text = String(planText || "").trim();
  if (/##\s*자동 품질 점검/.test(text)) return text;
  return `${text}\n\n${buildPlanQualityAudit(payload, text)}`;
}

function buildPrompt(payload, previousPlan = null, feedback = null, orchestratorGuide = DEFAULT_ORCHESTRATOR_GUIDE) {
  const lines = [
    `목적지: ${payload.destination}`,
    `출발지: ${payload.departure || "서울"}`,
    `국가/지역: ${payload.country || "미제공"}`,
    `국내/해외: ${payload.scope}`,
    `동행: ${payload.companions}`,
    `인원: ${payload.travelers}명`,
    `체류: ${payload.nights}박 (${payload.startDate} ~ ${payload.endDate})`,
    `예산(1인): ${payload.budgetPerPerson ? `${payload.budgetPerPerson.toLocaleString()}원` : "미제공"}`,
    `여행스타일: ${payload.tripType || "미제공"}`,
    `숙박 선호: ${payload.accommodation || "미지정"}`,
    `교통 선호: ${payload.transportPref || "auto"}`,
    `요청: ${formatList([payload.highlights, payload.notes]) || "미제공"}`,
  ];
  let prompt = `너는 Claude Code의 travel-orchestrator 스킬을 따르는 여행 플래너다.
아래 SKILL.md 내용을 기준으로 웹앱 안에서 실행 가능한 여행 계획을 만든다.
실시간 날씨, 교통, 현지 정보, 예약을 직접 조회하지 못한 경우에는 "확인 필요"로 표시하고, 대신 사용자가 바로 검증할 수 있는 체크리스트와 대안을 제시한다.

[travel-orchestrator SKILL.md]
${orchestratorGuide}

[사용자 요구사항]
${lines.map((line) => `- ${line}`).join("\n")}

[품질 가드]
${PLAN_QUALITY_GUARDRAILS.map((line) => `- ${line}`).join("\n")}

[출력 형식]
# 여행 플랜
## 요구사항 요약
## 정보 수집 체크
- 날씨
- 교통
- 현지 장소/맛집
## 최적 일정
## 예약 준비
## 여행 팁
## 품질 점검
## 다음 고도화 질문
`;

  if (previousPlan && feedback) {
    prompt += `\n\n[기존 플랜]\n${previousPlan}\n\n[개선 요청]\n${feedback}\n\n요청을 반영해서 수정본을 작성해줘.`;
  }
  return prompt;
}

function fallbackPlan(payload, feedback = null) {
  const extra = feedback ? `\n\n### 개선 반영\n${feedback}` : "";
  return `# 여행 플랜

## 요구사항 요약
- 목적지: ${payload.destination}
- 출발지: ${payload.departure || "서울"}
- 날짜: ${payload.startDate} ~ ${payload.endDate}
- 동행: ${payload.companions} / ${payload.travelers}명
- 범위: ${payload.scope}
- 숙박 선호: ${payload.accommodation || "미지정"}
- 교통 선호: ${payload.transportPref || "auto"}

## 정보 수집 체크
- 날씨: 확인 필요
- 교통: 확인 필요
- 현지 장소/맛집: 확인 필요

## 최적 일정
${fallbackItinerary(payload)}

## 예약 준비
- 교통편과 숙박은 실제 예약 전 시간/잔여석 확인 필요

## 여행 팁
- 이동 시간이 길어지면 하루 명소 수를 줄이고 식사/휴식 시간을 먼저 확보

## 품질 점검
${PLAN_QUALITY_GUARDRAILS.map((line) => `- ${line}`).join("\n")}

## 다음 고도화 질문
- 꼭 넣고 싶은 장소가 있나요?
- 교통비와 숙박비 중 어디를 더 아끼고 싶나요?
${extra}

> 현재 LLM API가 없어서 travel-orchestrator 형식의 템플릿 플랜으로 제공됩니다.`;
}

function fallbackAnswer(plan, question) {
  return `# 플랜 질문 답변

질문: ${question}

현재는 LLM API가 없어 저장된 플랜을 기반으로 한 템플릿 답변을 제공합니다.

- 목적지: ${plan.destination || "미정"}
- 일정: ${plan.startDate || "미정"} ~ ${plan.endDate || "미정"}
- 핵심 확인: 날씨, 교통편, 영업시간은 실제 출발 전에 다시 확인하세요.
- 수정이 필요하면 Discord에서 고도화 버튼 또는 /again 명령으로 반영할 수 있습니다.`;
}

async function buildQuestionPrompt(plan, planText, question) {
  const orchestratorGuide = await loadOrchestratorSkill();
  return `너는 Claude Code의 travel-orchestrator 스킬을 따르는 여행 플래너다.
아래 스킬 기준과 저장된 여행 플랜만 근거로 사용자의 질문에 한국어로 답한다.
답변은 짧고 실행 가능하게 작성한다.
새 일정을 저장하거나 기존 플랜을 수정하지 말고, 수정이 필요해 보이면 어떤 피드백으로 고도화하면 좋을지 제안한다.
실시간 조회가 필요한 내용은 "확인 필요"로 표시한다.

[travel-orchestrator SKILL.md]
${orchestratorGuide}

[플랜 메타]
- 플랜 ID: ${plan.id}
- 목적지: ${plan.destination}
- 출발지: ${plan.departure || "서울"}
- 기간: ${plan.startDate} ~ ${plan.endDate}
- 동행: ${plan.companions} / ${plan.travelers}명

[현재 플랜]
${planText || "플랜 본문이 없습니다."}

[질문]
${question}

[출력 형식]
# 답변
## 판단
## 이유
## 필요하면 이렇게 고도화
`;
}

async function callOpenAiCompatible(prompt, options = {}) {
  const rawEndpoint = process.env.OPENAI_API_URL || process.env.LLM_API_URL || DEFAULT_OPENAI_ENDPOINT;
  const endpoint = rawEndpoint.endsWith(OPENAI_PATH_SUFFIX)
    ? rawEndpoint
    : `${rawEndpoint.replace(/\/$/, "")}${OPENAI_PATH_SUFFIX}`;
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  const model = options.model || process.env.LLM_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("LLM 키가 없습니다.");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "너는 여행 플래너다. 실무형 일정과 대략 비용을 제안한다." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API 실패: ${res.status}`);
  }
  const body = await res.json();
  return {
    plan: body?.choices?.[0]?.message?.content?.trim() || "LLM 응답이 비었습니다.",
    model,
  };
}

async function callClaudeCompatible(prompt, options = {}) {
  const endpoint = process.env.CLAUDE_API_URL || DEFAULT_CLAUDE_ENDPOINT;
  const apiKey = options.apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  const model = options.model || process.env.CLAUDE_MODEL || process.env.LLM_MODEL || "claude-3-haiku-20240307";
  if (!apiKey) throw new Error("Claude 키가 없습니다.");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API 실패: ${res.status}`);
  }

  const body = await res.json();
  const text =
    typeof body?.content?.[0]?.text === "string"
      ? body.content[0].text
      : body?.content?.[0]?.content?.[0]?.text;
  return { plan: (text || "LLM 응답이 비었습니다.").trim(), model };
}

export async function generatePlan(payload, previousPlan = null, feedback = null, llmOptions = {}) {
  const orchestratorGuide = await loadOrchestratorSkill();
  const prompt = buildPrompt(payload, previousPlan, feedback, orchestratorGuide);
  const options = llmOptions || {};
  const provider = (options.provider || process.env.LLM_PROVIDER || "auto").toLowerCase();
  if (provider === "mock") {
    return { model: "mock-template", prompt, plan: appendPlanQualityAudit(payload, fallbackPlan(payload, feedback)) };
  }

  try {
    const result =
      provider === "claude" || provider === "anthropic"
        ? await callClaudeCompatible(prompt, options)
        : provider === "auto" || provider === "codex" || provider === "openai"
        ? await callOpenAiCompatible(prompt, options)
        : await callOpenAiCompatible(prompt, options);
    return { model: result.model, prompt, plan: appendPlanQualityAudit(payload, result.plan) };
  } catch (err) {
    return { model: "mock-template", prompt, plan: appendPlanQualityAudit(payload, fallbackPlan(payload, feedback)), error: err.message };
  }
}

export async function answerPlanQuestion(plan, planText, question) {
  const prompt = await buildQuestionPrompt(plan, planText, question);
  const provider = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  if (provider === "mock") {
    return { model: "mock-template", prompt, answer: fallbackAnswer(plan, question) };
  }

  try {
    const result =
      provider === "claude"
        ? await callClaudeCompatible(prompt)
        : provider === "auto" || provider === "codex" || provider === "openai"
        ? await callOpenAiCompatible(prompt)
        : await callOpenAiCompatible(prompt);
    return { model: result.model, prompt, answer: result.plan };
  } catch (err) {
    return { model: "mock-template", prompt, answer: fallbackAnswer(plan, question), error: err.message };
  }
}
