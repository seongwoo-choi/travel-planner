import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isSqlitePath, readSqliteDb, writeSqliteDb } from "./sqlite-plan-store.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "webapp", "data", "plans.json");
const mutationQueues = new Map();
const LOCK_WAIT_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 20;

function createDbTemplate() {
  return { plans: [] };
}

function normalizeDateInput(startDate, nights = 2) {
  const start = startDate ? new Date(startDate) : new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + Number(nights ?? 2));
  const pad = (v) => String(v).padStart(2, "0");
  const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    startDate: toYmd(start),
    endDate: toYmd(end),
  };
}

async function readDb(dbPath = DEFAULT_DB_PATH) {
  if (isSqlitePath(dbPath)) {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    return readSqliteDb(dbPath);
  }
  try {
    const raw = await fs.readFile(dbPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return createDbTemplate();
    throw err;
  }
}

async function writeDb(db, dbPath = DEFAULT_DB_PATH) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  if (isSqlitePath(dbPath)) {
    writeSqliteDb(db, dbPath);
    return;
  }
  const tempPath = `${dbPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(db, null, 2), "utf-8");
    await fs.rename(tempPath, dbPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function migrateJsonPlansToSqlite(jsonPath, sqlitePath) {
  if (isSqlitePath(jsonPath) || !isSqlitePath(sqlitePath)) {
    throw new TypeError("migration requires a JSON source and SQLite target");
  }
  const source = await readDb(jsonPath);
  return withDbMutation(sqlitePath, async () => {
    const target = await readDb(sqlitePath);
    if (target.plans.length > 0) {
      throw new Error("SQLite migration target is not empty");
    }
    await writeDb(source, sqlitePath);
    return { planCount: source.plans.length, sourcePath: jsonPath, targetPath: sqlitePath };
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function staleLock(lockPath) {
  try {
    const stats = await fs.stat(lockPath);
    return Date.now() - stats.mtimeMs >= LOCK_WAIT_TIMEOUT_MS;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

async function withFileLock(dbPath, operation) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const lockPath = `${dbPath}.lock`;
  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf-8");
      await handle.close();
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await staleLock(lockPath)) {
        await fs.unlink(lockPath).catch((unlinkError) => {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        });
        continue;
      }
      if (Date.now() - startedAt >= LOCK_WAIT_TIMEOUT_MS) {
        throw new Error(`timed out waiting for storage lock: ${lockPath}`);
      }
      await delay(LOCK_RETRY_MS);
    }
  }

  try {
    return await operation();
  } finally {
    await fs.unlink(lockPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function withDbMutation(dbPath, operation) {
  const key = path.resolve(dbPath);
  const previous = mutationQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => withFileLock(key, operation));
  mutationQueues.set(key, current);
  return current.finally(() => {
    if (mutationQueues.get(key) === current) mutationQueues.delete(key);
  });
}

function toLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function planStatus(plan) {
  const today = toLocalDate();
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  if (today < start) return "upcoming";
  if (today <= end) return "active";
  return "completed";
}

function matchesStatusFilter(plan, filter = "all") {
  const normalized = String(filter || "all").trim();
  if (normalized === "all") return true;
  if (normalized === "pinned") return Boolean(plan.pinned);
  if (normalized === "quality") {
    const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
    const latest = revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1) || {};
    return extractQualityAuditChecks(latest.planText).some((item) => !item.ok);
  }
  if (normalized === "quality-action") {
    const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
    const latest = revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1) || {};
    const checks = extractQualityAuditChecks(latest.planText);
    return checks.length === 0 || checks.some((item) => !item.ok);
  }
  if (normalized === "quality-urgent") {
    return Number(latestRevisionMeta(plan).qualityActionPriority || 0) >= 80;
  }
  if (normalized === "quality-ok") {
    const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
    const latest = revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1) || {};
    const checks = extractQualityAuditChecks(latest.planText);
    return checks.length > 0 && checks.every((item) => item.ok);
  }
  if (normalized === "quality-unaudited") {
    const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
    const latest = revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1) || {};
    return extractQualityAuditChecks(latest.planText).length === 0;
  }
  if (normalized === "quality-regression") {
    return Number(latestRevisionMeta(plan).qualityWarningDelta || 0) > 0;
  }
  if (normalized === "quality-improved") {
    return Number(latestRevisionMeta(plan).qualityWarningDelta || 0) < 0;
  }
  return planStatus(plan) === normalized;
}

function latestRevisionMeta(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  const latest = revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1) || {};
  const latestVersion = Number(latest.version);
  const previous = [...revisions]
    .filter((item) => item !== latest && Number(item.version) < latestVersion)
    .sort((a, b) => Number(a.version || 0) - Number(b.version || 0))
    .at(-1);
  const qualityChecks = extractQualityAuditChecks(latest.planText);
  const qualityWarnings = qualityChecks.filter((item) => !item.ok);
  const previousQualityChecks = extractQualityAuditChecks(previous?.planText);
  const previousQualityWarnings = previousQualityChecks.filter((item) => !item.ok);
  const qualityPreviousWarningCount = previousQualityChecks.length ? previousQualityWarnings.length : null;
  const qualityWarningDelta = qualityPreviousWarningCount === null ? null : qualityWarnings.length - qualityPreviousWarningCount;
  const qualityAction = qualityActionMeta(qualityChecks, qualityWarnings, qualityWarningDelta);
  return {
    model: latest.model || null,
    llmAuthMode: latest.llmAuthMode || null,
    llmProvider: latest.llmProvider || null,
    llmModelOverride: Boolean(latest.llmModelOverride),
    qualityCheckCount: qualityChecks.length,
    qualityWarningCount: qualityWarnings.length,
    qualityPreviousWarningCount,
    qualityWarningDelta,
    qualityWarnings: qualityWarnings.map((item) => item.label),
    ...qualityAction,
  };
}

function qualityActionMeta(qualityChecks = [], qualityWarnings = [], qualityWarningDelta = null) {
  if (!qualityChecks.length) {
    const priority = 70;
    return {
      qualityActionPriority: priority,
      qualityActionPriorityLabel: qualityActionPriorityLabel(priority),
      qualityActionReason: "품질 점검 생성",
      qualityNextAction: "quality-audit",
    };
  }
  if (Number(qualityWarningDelta || 0) > 0) {
    const priority = 100 + Number(qualityWarningDelta || 0);
    return {
      qualityActionPriority: priority,
      qualityActionPriorityLabel: qualityActionPriorityLabel(priority),
      qualityActionReason: `악화 +${qualityWarningDelta} 먼저 보강`,
      qualityNextAction: "quality-refine",
    };
  }
  if (qualityWarnings.length) {
    const priority = 80 + qualityWarnings.length;
    return {
      qualityActionPriority: priority,
      qualityActionPriorityLabel: qualityActionPriorityLabel(priority),
      qualityActionReason: `확인 ${qualityWarnings.length} 보강`,
      qualityNextAction: "quality-refine",
    };
  }
  const priority = 0;
  return {
    qualityActionPriority: priority,
    qualityActionPriorityLabel: "",
    qualityActionReason: "",
    qualityNextAction: "quality-ok",
  };
}

function qualityActionPriorityLabel(priority) {
  const value = Number(priority || 0);
  if (!value) return "";
  if (value >= 100) return `긴급 ${value}`;
  if (value >= 80) return `높음 ${value}`;
  if (value >= 70) return `점검 ${value}`;
  return `낮음 ${value}`;
}

function extractQualityAuditChecks(planText) {
  const lines = String(planText || "").split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s*자동 품질 점검\s*$/.test(line.trim()));
  if (start === -1) return [];
  const checks = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s+/.test(line)) break;
    const match = line.match(/^-\s*(OK|확인)\s+([^:：]+)[:：]\s*(.+)$/);
    if (match) {
      checks.push({
        ok: match[1] === "OK",
        label: match[2].trim(),
      });
    }
  }
  return checks;
}

function sortPlanSummaries(items, filter = "all", options = {}) {
  const normalized = String(filter || "all").trim();
  return items.sort((a, b) => {
    if (normalized === "quality-action" || normalized === "quality-urgent") {
      if (a.qualityActionPriority !== b.qualityActionPriority) {
        return Number(b.qualityActionPriority || 0) - Number(a.qualityActionPriority || 0);
      }
      if (a.qualityWarningCount !== b.qualityWarningCount) {
        return Number(b.qualityWarningCount || 0) - Number(a.qualityWarningCount || 0);
      }
    }
    if (normalized === "quality" && a.qualityWarningCount !== b.qualityWarningCount) {
      return Number(b.qualityWarningCount || 0) - Number(a.qualityWarningCount || 0);
    }
    if (normalized === "quality-regression" && a.qualityWarningDelta !== b.qualityWarningDelta) {
      return Number(b.qualityWarningDelta || 0) - Number(a.qualityWarningDelta || 0);
    }
    if (normalized === "quality-improved" && a.qualityWarningDelta !== b.qualityWarningDelta) {
      return Number(a.qualityWarningDelta || 0) - Number(b.qualityWarningDelta || 0);
    }
    if (options.pinnedFirst && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}


export async function listPlans(limit = 20, dbPath = DEFAULT_DB_PATH, filter = "all") {
  const db = await readDb(dbPath);
  const all = sortPlanSummaries(
    db.plans
      .filter((plan) => matchesStatusFilter(plan, filter))
      .map((plan) => ({
      id: plan.id,
      destination: plan.destination,
      departure: plan.departure,
      country: plan.country,
      scope: plan.scope,
      companions: plan.companions,
      travelers: plan.travelers,
      nights: plan.nights,
      accommodation: plan.accommodation,
      transportPref: plan.transportPref,
      startDate: plan.startDate,
      endDate: plan.endDate,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      latestVersion: plan.latestVersion,
      source: plan.source,
      discordUserId: plan.discordUserId,
      pinned: Boolean(plan.pinned),
      pinnedAt: plan.pinnedAt || null,
      personalNote: plan.personalNote || null,
      tripStatus: planStatus(plan),
      ...latestRevisionMeta(plan),
      })),
    filter
  ).slice(0, limit);
  return all;
}

export async function listPlansByDiscordUser(discordUserId, limit = 10, dbPath = DEFAULT_DB_PATH, filter = "all") {
  const db = await readDb(dbPath);
  return sortPlanSummaries(
    db.plans
      .filter((plan) => plan.discordUserId === String(discordUserId))
      .filter((plan) => matchesStatusFilter(plan, filter))
      .map((plan) => ({
      id: plan.id,
      destination: plan.destination,
      departure: plan.departure,
      country: plan.country,
      scope: plan.scope,
      companions: plan.companions,
      travelers: plan.travelers,
      nights: plan.nights,
      accommodation: plan.accommodation,
      transportPref: plan.transportPref,
      startDate: plan.startDate,
      endDate: plan.endDate,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      latestVersion: plan.latestVersion,
      source: plan.source,
      discordUserId: plan.discordUserId,
      pinned: Boolean(plan.pinned),
      pinnedAt: plan.pinnedAt || null,
      personalNote: plan.personalNote || null,
      tripStatus: planStatus(plan),
      ...latestRevisionMeta(plan),
      })),
    filter
  ).slice(0, limit);
}

export async function listPinnedPlansByDiscordUser(discordUserId, limit = 10, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  return db.plans
    .filter((plan) => plan.discordUserId === String(discordUserId) && plan.pinned)
    .map((plan) => ({
      id: plan.id,
      destination: plan.destination,
      departure: plan.departure,
      country: plan.country,
      scope: plan.scope,
      companions: plan.companions,
      travelers: plan.travelers,
      nights: plan.nights,
      accommodation: plan.accommodation,
      transportPref: plan.transportPref,
      startDate: plan.startDate,
      endDate: plan.endDate,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      latestVersion: plan.latestVersion,
      source: plan.source,
      discordUserId: plan.discordUserId,
      pinned: Boolean(plan.pinned),
      pinnedAt: plan.pinnedAt || null,
      personalNote: plan.personalNote || null,
      tripStatus: planStatus(plan),
      ...latestRevisionMeta(plan),
    }))
    .sort((a, b) => ((a.pinnedAt || a.updatedAt) < (b.pinnedAt || b.updatedAt) ? 1 : -1))
    .slice(0, limit);
}

function toPlanListItem(plan) {
  return {
    id: plan.id,
    destination: plan.destination,
    departure: plan.departure,
    country: plan.country,
    scope: plan.scope,
    companions: plan.companions,
    travelers: plan.travelers,
    nights: plan.nights,
    accommodation: plan.accommodation,
    transportPref: plan.transportPref,
    startDate: plan.startDate,
    endDate: plan.endDate,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    latestVersion: plan.latestVersion,
    source: plan.source,
    discordUserId: plan.discordUserId,
    pinned: Boolean(plan.pinned),
    pinnedAt: plan.pinnedAt || null,
    personalNote: plan.personalNote || null,
    tripStatus: planStatus(plan),
    ...latestRevisionMeta(plan),
  };
}

function planSearchText(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return [
    plan.destination,
    plan.departure,
    plan.country,
    plan.scope,
    plan.companions,
    plan.tripType,
    plan.accommodation,
    plan.transportPref,
    plan.startDate,
    plan.endDate,
    plan.notes,
    plan.highlights,
    plan.personalNote,
    ...revisions.map((revision) => revision.feedback),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function searchPlans(query, limit = 20, dbPath = DEFAULT_DB_PATH, discordUserId = null, filter = "all") {
  const db = await readDb(dbPath);
  const tokens = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  return sortPlanSummaries(
    db.plans
      .filter((plan) => !discordUserId || plan.discordUserId === String(discordUserId))
      .filter((plan) => matchesStatusFilter(plan, filter))
      .filter((plan) => {
      const haystack = planSearchText(plan);
      return tokens.every((token) => haystack.includes(token));
      })
      .map(toPlanListItem),
    filter,
    { pinnedFirst: true }
  ).slice(0, limit);
}

export async function exportPlansBackup(dbPath = DEFAULT_DB_PATH, options = {}) {
  const db = await readDb(dbPath);
  const discordUserId = options.discordUserId ? String(options.discordUserId) : null;
  const plans = discordUserId
    ? (db.plans || []).filter((plan) => plan.discordUserId === discordUserId)
    : db.plans || [];
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    scope: discordUserId ? "discord-user" : "all",
    discordUserId,
    plans,
  };
}

export async function getPlan(planId, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  return db.plans.find((plan) => plan.id === id) || null;
}

export async function getPlanForDiscordUser(planId, discordUserId, dbPath = DEFAULT_DB_PATH) {
  const ownerId = String(discordUserId || "").trim();
  if (!ownerId) return null;
  const plan = await getPlan(planId, dbPath);
  return plan?.discordUserId === ownerId ? plan : null;
}

function normalizePayload(payload) {
  const {
    destination = "미정",
    departure = "서울",
    country = "",
    scope = "domestic",
    companions = "커플",
    travelers = 2,
    nights = 2,
    tripType = "",
    accommodation = "",
    baseLocation = "",
    arrivalTime = "",
    departureTime = "",
    transportPref = "auto",
    startDate = "",
    endDate = "",
    budgetPerPerson = null,
    notes = "",
    highlights = "",
    source = "",
    discordUserId = "",
    discordUserName = "",
    discordChannelId = "",
    discordGuildId = "",
  } = payload;

  const safeNights = Number(nights);
  if (!Number.isInteger(safeNights) || safeNights < 0 || safeNights > 30) {
    throw new RangeError("nights must be an integer between 0 and 30");
  }
  const dateInfo = normalizeDateInput(startDate, safeNights);
  const finalStart = startDate || dateInfo.startDate;
  const finalEnd = endDate || dateInfo.endDate;

  return {
    destination: String(destination).trim() || "미정",
    departure: String(departure).trim() || "서울",
    country: String(country).trim() || null,
    scope: scope === "international" ? "international" : "domestic",
    companions: String(companions).trim() || "커플",
    travelers: Math.max(1, Number(travelers) || 2),
    nights: safeNights,
    tripType: String(tripType).trim() || null,
    accommodation: String(accommodation).trim() || null,
    baseLocation: String(baseLocation).trim() || null,
    arrivalTime: String(arrivalTime).trim() || null,
    departureTime: String(departureTime).trim() || null,
    transportPref: String(transportPref).trim() || "auto",
    startDate: finalStart,
    endDate: finalEnd,
    budgetPerPerson: budgetPerPerson ? Number(String(budgetPerPerson).replace(/,/g, "")) : null,
    notes: String(notes).trim() || null,
    highlights: String(highlights).trim() || null,
    source: String(source).trim() || null,
    discordUserId: String(discordUserId).trim() || null,
    discordUserName: String(discordUserName).trim() || null,
    discordChannelId: String(discordChannelId).trim() || null,
    discordGuildId: String(discordGuildId).trim() || null,
  };
}

function buildPlanEnvelope(payload, planText, model, prompt, feedback = null, version = 1, generationMeta = {}) {
  return {
    version,
    createdAt: new Date().toISOString(),
    model,
    llmAuthMode: generationMeta.llmAuthMode || null,
    llmProvider: generationMeta.llmProvider || null,
    llmModelOverride: Boolean(generationMeta.llmModelOverride),
    generationStatus: generationMeta.status || (generationMeta.error ? "error" : "ready"),
    groundedPlan: generationMeta.groundedPlan || null,
    evidence: generationMeta.evidence || null,
    planningConstraints: Array.isArray(generationMeta.planningConstraints)
      ? generationMeta.planningConstraints
      : [],
    prompt,
    feedback: feedback ? String(feedback).trim() : null,
    planText,
    input: payload,
  };
}

function inferExpenseCategory(label) {
  const text = String(label || "").toLowerCase();
  const rules = [
    ["교통", /택시|버스|지하철|기차|ktx|srt|항공|비행기|렌트|주차|톨비|주유|충전/],
    ["숙소", /숙소|호텔|리조트|펜션|게스트하우스|에어비앤비|체크인/],
    ["식비", /밥|식사|점심|저녁|아침|조식|중식|석식|맛집|식당|고기|회|국밥|라멘|피자|치킨/],
    ["카페", /카페|커피|디저트|빵|베이커리|아이스크림/],
    ["관광", /입장|티켓|전시|박물관|미술관|투어|체험|액티비티|공연/],
    ["쇼핑", /쇼핑|기념품|선물|마트|편의점|시장|아울렛/],
    ["기타", /.+/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

export async function createPlan(payload, generation, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, async () => {
    const db = await readDb(dbPath);
    const normalized = normalizePayload(payload);
    const nextId = db.plans.reduce((acc, item) => Math.max(acc, item.id || 0), 0) + 1;
    const now = new Date().toISOString();
    const revision = buildPlanEnvelope(normalized, generation.plan, generation.model, generation.prompt, null, 1, generation);
    const plan = {
      id: nextId,
      ...normalized,
      pinned: false,
      pinnedAt: null,
      personalNote: null,
      createdAt: now,
      updatedAt: now,
      latestVersion: 1,
      revisions: [revision],
    };
    db.plans.push(plan);
    await writeDb(db, dbPath);
    return plan;
  });
}

async function duplicatePlanUnlocked(planId, overrides = {}, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const sourcePlan = db.plans.find((item) => item.id === id);
  if (!sourcePlan) {
    throw new Error(`Plan ${id} not found`);
  }

  const nextId = db.plans.reduce((acc, item) => Math.max(acc, item.id || 0), 0) + 1;
  const now = new Date().toISOString();
  const latest =
    (sourcePlan.revisions || []).find((item) => item.version === sourcePlan.latestVersion) ||
    (sourcePlan.revisions || []).at(-1) ||
    {};
  const normalized = normalizePayload({
    ...sourcePlan,
    ...overrides,
    notes: [sourcePlan.notes, `duplicated from #${sourcePlan.id}`].filter(Boolean).join("\n"),
  });
  const revision = buildPlanEnvelope(
    normalized,
    latest.planText || "플랜 본문이 없습니다.",
    latest.model || "duplicate",
    latest.prompt || "",
    `duplicated from #${sourcePlan.id}`,
    1,
    {
      llmAuthMode: latest.llmAuthMode || null,
      llmProvider: latest.llmProvider || null,
      llmModelOverride: Boolean(latest.llmModelOverride),
    }
  );
  const plan = {
    id: nextId,
    ...normalized,
    pinned: false,
    pinnedAt: null,
    personalNote: sourcePlan.personalNote || null,
    createdAt: now,
    updatedAt: now,
    latestVersion: 1,
    revisions: [revision],
  };
  db.plans.push(plan);
  await writeDb(db, dbPath);
  return plan;
}

async function refinePlanUnlocked(planId, generation, feedback, dbPath = DEFAULT_DB_PATH, options = {}) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }
  if (options.expectedVersion !== undefined && plan.latestVersion !== Number(options.expectedVersion)) {
    throw new Error(`plan version conflict: expected ${options.expectedVersion}, current ${plan.latestVersion}`);
  }
  const latest = plan.revisions?.[plan.revisions.length - 1];
  if (latest?.groundedPlan && !generation?.groundedPlan) {
    throw new TypeError("grounded plans require a grounded refinement");
  }

  const normalized = normalizePayload(plan);
  if (plan.notes && feedback) {
    normalized.notes = `${plan.notes}\n${feedback}`.trim();
  } else if (feedback) {
    normalized.notes = String(feedback).trim();
  }

  const nextVersion = plan.latestVersion + 1;
  const revision = buildPlanEnvelope(
    normalized,
    generation.plan,
    generation.model,
    generation.prompt,
    feedback,
    nextVersion,
    generation
  );
  plan.latestVersion = nextVersion;
  plan.updatedAt = new Date().toISOString();
  plan.revisions.push(revision);
  await writeDb(db, dbPath);
  return { ...plan };
}

async function updatePlanScheduleUnlocked(planId, schedule, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  const safeNights = Number(schedule.nights ?? plan.nights ?? 2);
  if (!Number.isInteger(safeNights) || safeNights < 0 || safeNights > 30) {
    throw new RangeError("nights must be an integer between 0 and 30");
  }
  const dateInfo = normalizeDateInput(schedule.startDate || plan.startDate, safeNights);
  plan.nights = safeNights;
  plan.startDate = dateInfo.startDate;
  plan.endDate = dateInfo.endDate;
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { ...plan };
}

async function updatePlanPartyBudgetUnlocked(planId, details, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  plan.travelers = Math.max(1, Number(details.travelers ?? plan.travelers) || Number(plan.travelers) || 1);
  const budget = details.budgetPerPerson ?? plan.budgetPerPerson ?? null;
  plan.budgetPerPerson = budget ? Math.max(0, Number(String(budget).replace(/,/g, "")) || 0) : null;
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { ...plan };
}

async function updatePlanPersonalNoteUnlocked(planId, personalNote, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  plan.personalNote = String(personalNote || "").trim() || null;
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { ...plan };
}

async function addPlanExpenseUnlocked(planId, details, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  const amount = Math.round(Number(String(details.amount || "").replace(/,/g, "")) || 0);
  if (amount <= 0) {
    throw new Error("Expense amount must be greater than 0");
  }

  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const label = String(details.label || "지출").trim() || "지출";
  const category = String(details.category || "").trim() || inferExpenseCategory(label);
  const expense = {
    id: expenses.reduce((acc, item) => Math.max(acc, item.id || 0), 0) + 1,
    label,
    category,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(details.date || "").trim()) ? String(details.date).trim() : null,
    amount,
    paidBy: String(details.paidBy || "").trim() || null,
    createdAt: new Date().toISOString(),
  };
  plan.expenses = [...expenses, expense];
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { plan: { ...plan }, expense };
}

async function deletePlanExpenseUnlocked(planId, expenseId, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const targetId = Number(expenseId);
  const target = expenses.find((item) => item.id === targetId);
  if (!target) {
    throw new Error(`Expense ${targetId} not found`);
  }

  plan.expenses = expenses.filter((item) => item.id !== targetId);
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { plan: { ...plan }, deletedExpense: target };
}

async function updatePlanExpenseUnlocked(planId, expenseId, details, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const targetId = Number(expenseId);
  const target = expenses.find((item) => item.id === targetId);
  if (!target) {
    throw new Error(`Expense ${targetId} not found`);
  }

  let categoryTouched = false;
  if (details.category != null && String(details.category).trim()) {
    categoryTouched = true;
    const category = String(details.category).trim();
    target.category = category === "-" ? null : category;
  }
  if (details.label != null && String(details.label).trim()) {
    target.label = String(details.label).trim();
    if (!target.category && !categoryTouched) {
      target.category = inferExpenseCategory(target.label);
    }
  }
  if (details.date != null && String(details.date).trim()) {
    const date = String(details.date).trim();
    if (date === "-") {
      target.date = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      target.date = date;
    } else {
      throw new Error("Expense date must be YYYY-MM-DD");
    }
  }
  if (details.amount != null && String(details.amount).trim()) {
    const amount = Math.round(Number(String(details.amount).replace(/,/g, "")) || 0);
    if (amount <= 0) {
      throw new Error("Expense amount must be greater than 0");
    }
    target.amount = amount;
  }
  if (details.paidBy != null && String(details.paidBy).trim()) {
    const paidBy = String(details.paidBy).trim();
    target.paidBy = paidBy === "-" ? null : paidBy;
  }
  target.updatedAt = new Date().toISOString();
  plan.expenses = expenses;
  plan.updatedAt = new Date().toISOString();
  await writeDb(db, dbPath);
  return { plan: { ...plan }, expense: target };
}

async function setPlanPinnedUnlocked(planId, pinned, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  const id = Number(planId);
  const plan = db.plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plan ${id} not found`);
  }

  plan.pinned = Boolean(pinned);
  plan.pinnedAt = plan.pinned ? new Date().toISOString() : null;
  await writeDb(db, dbPath);
  return { ...plan };
}

export async function findLatestPlanByDiscordUser(discordUserId, dbPath = DEFAULT_DB_PATH) {
  const db = await readDb(dbPath);
  return (
    db.plans
      .filter((plan) => plan.discordUserId === String(discordUserId))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] || null
  );
}

export function duplicatePlan(planId, overrides = {}, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => duplicatePlanUnlocked(planId, overrides, dbPath));
}

export function refinePlan(planId, generation, feedback, dbPath = DEFAULT_DB_PATH, options = {}) {
  return withDbMutation(dbPath, () => refinePlanUnlocked(planId, generation, feedback, dbPath, options));
}

export function updatePlanSchedule(planId, schedule, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => updatePlanScheduleUnlocked(planId, schedule, dbPath));
}

export function updatePlanPartyBudget(planId, details, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => updatePlanPartyBudgetUnlocked(planId, details, dbPath));
}

export function updatePlanPersonalNote(planId, personalNote, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => updatePlanPersonalNoteUnlocked(planId, personalNote, dbPath));
}

export function addPlanExpense(planId, details, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => addPlanExpenseUnlocked(planId, details, dbPath));
}

export function deletePlanExpense(planId, expenseId, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => deletePlanExpenseUnlocked(planId, expenseId, dbPath));
}

export function updatePlanExpense(planId, expenseId, details, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => updatePlanExpenseUnlocked(planId, expenseId, details, dbPath));
}

export function setPlanPinned(planId, pinned, dbPath = DEFAULT_DB_PATH) {
  return withDbMutation(dbPath, () => setPlanPinnedUnlocked(planId, pinned, dbPath));
}

export { normalizePayload, normalizeDateInput };
