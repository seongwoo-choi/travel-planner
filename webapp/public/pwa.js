function fallbackIosInstallOpenUrl() {
  return new URL("/install.html", window.location.href).toString();
}

function fallbackIosInstallQrUrl(target) {
  try {
    const url = new URL("/api/install-qr.svg", window.location.origin);
    url.searchParams.set("target", target);
    return url.toString();
  } catch {
    return "";
  }
}

function bindIosInstallOpenUrlCard() {
  const card = document.getElementById("iosInstallOpenUrlCard");
  if (!card) return;

  const value = document.getElementById("iosInstallOpenUrlValue");
  const status = document.getElementById("iosInstallOpenUrlStatus");
  const stateBadge = document.getElementById("iosInstallOpenUrlStateBadge");
  const copyButton = document.getElementById("iosInstallOpenUrlCopyButton");
  const shareButton = document.getElementById("iosInstallOpenUrlShareButton");
  const smsLink = document.getElementById("iosInstallOpenUrlSmsLink");
  const mailLink = document.getElementById("iosInstallOpenUrlMailLink");
  const qr = document.getElementById("iosInstallOpenUrlQr");
  const qrImage = document.getElementById("iosInstallOpenUrlQrImage");
  const qrLink = document.getElementById("iosInstallOpenUrlQrLink");
  const installUrl = typeof preferredInstallUrl === "function" ? preferredInstallUrl() : fallbackIosInstallOpenUrl();
  const qrUrl = (typeof preferredInstallQrUrl === "function" && preferredInstallQrUrl()) || fallbackIosInstallQrUrl(installUrl);
  const url = new URL(installUrl);
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isHttps = url.protocol === "https:";
  const message = `Travel Planner iPhone 설치 URL: ${installUrl}`;

  card.dataset.installUrl = installUrl;
  card.dataset.qrUrl = qrUrl;
  if (value) value.textContent = installUrl;
  if (smsLink) smsLink.href = `sms:&body=${encodeURIComponent(message)}`;
  if (mailLink) mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 URL")}&body=${encodeURIComponent(message)}`;
  if (qr) qr.hidden = !qrUrl;
  if (qrImage && qrUrl) {
    qrImage.src = qrUrl;
    qrImage.alt = `iPhone Safari에서 열 Travel Planner 설치 URL QR 코드: ${installUrl}`;
  }
  if (qrLink && qrUrl) {
    qrLink.href = qrUrl;
    qrLink.title = installUrl;
  }

  if (isLocalhost) {
    card.dataset.state = "blocked";
    if (stateBadge) stateBadge.textContent = "주소 교체 필요";
    if (status) status.textContent = "localhost URL은 iPhone에서 Mac이 아니라 iPhone 자신을 가리킵니다. Mac과 iPhone을 같은 Wi-Fi에 두고 Mac의 LAN 주소로 열거나, HTTPS 터널/배포 URL을 사용하세요.";
  } else if (!isHttps) {
    card.dataset.state = "warning";
    if (stateBadge) stateBadge.textContent = "HTTPS 권장";
    if (status) status.textContent = "현재 주소가 http이면 홈 화면 설치 후 offline shell이 제한될 수 있습니다. 가능하면 HTTPS 배포/터널 URL을 iPhone Safari에서 열고, 같은 Wi-Fi LAN 주소는 임시 확인용으로만 쓰세요.";
  } else {
    card.dataset.state = "ready";
    if (stateBadge) stateBadge.textContent = "iPhone 준비됨";
    if (status) status.textContent = "이 URL을 iPhone Safari에서 열고 공유 버튼 > 홈 화면에 추가를 진행하세요.";
  }

  if (shareButton) shareButton.hidden = !navigator.share;
  if (card.dataset.bound === "true") return;

  card.dataset.bound = "true";
  copyButton?.addEventListener("click", async () => {
    const currentUrl = card.dataset.installUrl || fallbackIosInstallOpenUrl();
    try {
      await navigator.clipboard.writeText(currentUrl);
      if (status) status.textContent = "iPhone 설치 URL을 복사했습니다. AirDrop, 메시지, Notes로 옮겨 iPhone Safari에서 여세요.";
    } catch {
      if (status) status.textContent = "복사 prompt를 열었습니다. URL을 복사해 iPhone Safari에서 여세요.";
      window.prompt("iPhone 설치 URL을 복사하세요.", currentUrl);
    }
  });

  shareButton?.addEventListener("click", async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "Travel Planner iPhone 설치",
        text: "이 URL을 iPhone Safari에서 열고 홈 화면에 추가하세요.",
        url: card.dataset.installUrl || fallbackIosInstallOpenUrl(),
      });
      if (status) status.textContent = "iPhone 설치 URL을 공유했습니다.";
    } catch (error) {
      if (error?.name === "AbortError") {
        if (status) status.textContent = "공유가 취소되었습니다. 필요하면 설치 URL 복사를 사용하세요.";
      } else if (status) {
        status.textContent = "공유에 실패했습니다. 설치 URL 복사를 사용하세요.";
      }
    }
  });
}

const SELECTED_SHORT_INSTALL_URL_STORAGE = "travelPlannerSelectedShortInstallUrl";
const IOS_INSTALL_HANDS_ON_CHECKLIST_STORAGE = "travelPlannerIosHandsOnInstallChecklist:v1";
const IOS_FIRST_RUN_CHECKLIST_STORAGE = "travelPlannerIosFirstRunChecklist:v1";
const NEW_PLAN_DRAFT_STORAGE = "travelPlannerNewPlanDraft:v1";
const IOS_HOME_DOCK_LAST_ROUTE_STORAGE = "travelPlannerIosHomeDockLastRoute:v1";
const PROTECTED_ACCESS_KEY_PLACEHOLDER = "YOUR_TRAVEL_ACCESS_KEY";
const PROTECTED_ACCESS_KEY_AUTO_CLEAR_MS = 5 * 60 * 1000;
const IOS_INSTALL_FAST_PATH_PROOF_REFRESH_COMPLETE_MS = 1400;
let iosInstallInfo = null;
let protectedAccessKeyClearTimer = 0;
let selectedShortInstallUrl = "";
let iosInstallSummaryCheck = null;
let iosInstallNextStep = null;
const IOS_INSTALL_SESSION_EVIDENCE_COMMAND = "test -d webapp && cd webapp; npm run ios:install:session:evidence";
const IOS_INSTALL_SESSION_EVIDENCE_NPM_SCRIPT = "npm run ios:install:session:evidence";
let iosInstallCompletionStatus = null;
let iosHomeDockCompletionStatusRefreshPending = false;
let iosHomeDockShellVersion = "";
let iosHomeDockServerShellVersion = "";
let iosHomeDockShellRecoveryFocusApplied = false;
let iosInstallFastPathProofRefreshFeedbackToken = 0;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindIosInstallOpenUrlCard);
} else {
  bindIosInstallOpenUrlCard();
}

const IOS_FIRST_RUN_CHECKLIST_ITEMS = [
  {
    id: "launch",
    label: "Travel 아이콘으로 앱 열기",
    detail: "홈 화면에서 실행해 Safari 주소창 없는 앱 모드인지 확인합니다.",
  },
  {
    id: "proof",
    label: "설치 증거 저장",
    detail: "홈 화면 실행 증거를 서버 reports 폴더에 저장하거나 복사합니다.",
  },
  {
    id: "first-plan",
    label: "첫 여행 플랜 만들기",
    detail: "목적지, 날짜, 동행, 여행 스타일을 넣고 새 플랜을 생성합니다.",
  },
  {
    id: "offline-read",
    label: "오프라인 읽기 확인",
    detail: "한 번 열어본 홈 목록과 상세 플랜이 네트워크 실패 시 snapshot으로 열리는지 확인합니다.",
  },
];

function readIosInstallHandsOnChecklist() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IOS_INSTALL_HANDS_ON_CHECKLIST_STORAGE) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeIosInstallHandsOnChecklist(state, updatedReason = "check") {
  try {
    window.localStorage.setItem(IOS_INSTALL_HANDS_ON_CHECKLIST_STORAGE, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
      updatedReason,
    }));
  } catch {
    // Best-effort local progress for the physical iPhone install flow.
  }
}

function iosInstallHandsOnStepTarget(stepId) {
  switch (stepId) {
    case "before-phone":
    case "before-phone-final":
      return { href: "#iosInstallHandoffStripPrePhoneSequenceButton", label: "추천 준비 명령으로 이동" };
    case "open-safari":
      return { href: "#iosInstallUrlHint", label: "설치 주소로 이동" };
    case "add-home-screen":
    case "launch-travel":
      return { href: "#iosInstallFastPathTitle", label: "1분 설치 루트로 이동" };
    case "save-proof":
      return { href: "#iosInstallProofSaveButton", label: "설치 증거 저장으로 이동" };
    case "final-gate":
      return { href: "#iosInstallCompletionFinalGateButton", label: "Mac final gate로 이동" };
    case "status-board":
      return { href: "/ios-install-status", label: "완료 상태로 이동" };
    default:
      return { href: "/ios-install-status", label: "완료 상태 확인" };
  }
}

function updateIosInstallHandsOnChecklist() {
  const box = document.getElementById("iosInstallHandsOnChecklist");
  if (!box) return;

  const checkboxes = [...box.querySelectorAll("[data-ios-install-hands-on-step]")];
  const checklistSummary = box.querySelector("summary");
  const progress = document.getElementById("iosInstallHandsOnProgress");
  const savedAt = document.getElementById("iosInstallHandsOnSavedAt");
  const nextStep = document.getElementById("iosInstallHandsOnNextStep");
  const nextStepLink = document.getElementById("iosInstallHandsOnNextStepLink");
  const handoffHint = document.getElementById("iosInstallHandsOnHandoffHint");
  const handoffActions = document.getElementById("iosInstallHandsOnHandoffActions");
  const copyButton = document.getElementById("iosInstallHandsOnCopyButton");
  const shareButton = document.getElementById("iosInstallHandsOnShareButton");
  const smsLink = document.getElementById("iosInstallHandsOnSmsLink");
  const mailLink = document.getElementById("iosInstallHandsOnMailLink");
  const state = readIosInstallHandsOnChecklist();
  checkboxes.forEach((checkbox) => {
    checkbox.checked = Boolean(state[checkbox.dataset.iosInstallHandsOnStep || ""]);
  });
  const firstUnchecked = checkboxes.find((checkbox) => !checkbox.checked);
  const nextLabel = firstUnchecked?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
  const nextTarget = iosInstallHandsOnStepTarget(firstUnchecked?.dataset.iosInstallHandsOnStep || "");
  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  const progressText = `${checkedCount}/${checkboxes.length} 체크`;
  const updatedAtMs = Date.parse(state.updatedAt || "");
  const savedAtAction = state.updatedReason === "reset" ? "초기화 저장" : "체크 저장";
  const savedSnapshotText = Number.isFinite(updatedAtMs)
    ? `${savedAtAction}: ${new Date(updatedAtMs).toLocaleString("ko-KR")}`
    : "아직 저장된 체크 현황 없음";
  const handoffHintDescription = `현황 handoff는 현재 기기 브라우저 snapshot(${progressText}, ${savedSnapshotText})입니다. 짧은 문자는 다음 위치와 완료 상태 URL 중심, 복사/공유/상세 메일은 전체 체크 항목까지 보냅니다.`;
  const summaryDescription = firstUnchecked && nextLabel
    ? `직접 체크리스트 ${progressText}. 저장 상태: ${savedSnapshotText}. 다음 단계: ${nextLabel}`
    : `직접 체크리스트 ${progressText}. 저장 상태: ${savedSnapshotText}. 완료 상태 페이지에서 실제 남은 gate를 확인하세요.`;
  const progressDescription = `현재 기기 브라우저의 iPhone 설치 체크리스트 ${progressText}. 실제 gate 완료 여부는 완료 상태 페이지에서 확인하세요.`;
  if (checklistSummary) {
    checklistSummary.title = summaryDescription;
    checklistSummary.setAttribute("aria-label", summaryDescription);
  }
  if (progress) {
    progress.textContent = progressText;
    progress.title = progressDescription;
    progress.setAttribute("aria-label", progressDescription);
  }
  if (handoffHint) {
    handoffHint.textContent = handoffHintDescription;
    handoffHint.title = handoffHintDescription;
    handoffHint.setAttribute("aria-label", handoffHintDescription);
  }
  if (handoffActions) {
    const handoffActionsDescription = `현재 기기 브라우저의 iPhone 설치 체크 현황 handoff ${progressText}. 저장 상태: ${savedSnapshotText}. 짧은 문자는 다음 위치와 완료 상태 URL 중심, 복사/공유/상세 메일은 전체 체크 항목을 포함합니다.`;
    handoffActions.title = handoffActionsDescription;
    handoffActions.setAttribute("aria-label", handoffActionsDescription);
    handoffActions.setAttribute("aria-describedby", "iosInstallHandsOnHandoffHint");
  }
  if (copyButton) {
    const copyDescription = `현재 기기 브라우저의 iPhone 설치 체크 현황 ${progressText}을 텍스트로 복사합니다. 실제 gate 완료 여부는 완료 상태 페이지에서 확인하세요.`;
    copyButton.textContent = `현황 복사 ${checkedCount}/${checkboxes.length}`;
    copyButton.title = copyDescription;
    copyButton.setAttribute("aria-label", copyDescription);
  }
  if (shareButton) {
    const shareDescription = `현재 기기 브라우저의 iPhone 설치 체크 현황 ${progressText}을 공유합니다. 실제 gate 완료 여부는 완료 상태 페이지에서 확인하세요.`;
    shareButton.textContent = `현황 공유 ${checkedCount}/${checkboxes.length}`;
    shareButton.title = shareDescription;
    shareButton.setAttribute("aria-label", shareDescription);
  }
  if (smsLink || mailLink) {
    const handoffText = iosInstallHandsOnChecklistSummaryText();
    const smsHandoffText = iosInstallHandsOnChecklistCompactSummaryText();
    if (smsLink) {
      const smsDescription = `현재 기기 브라우저의 iPhone 설치 체크 현황 ${progressText} 짧은 요약을 문자 앱으로 보냅니다.`;
      smsLink.href = `sms:&body=${encodeURIComponent(smsHandoffText)}`;
      smsLink.textContent = `짧은 문자 ${checkedCount}/${checkboxes.length}`;
      smsLink.title = smsDescription;
      smsLink.setAttribute("aria-label", smsDescription);
    }
    if (mailLink) {
      const mailDescription = `현재 기기 브라우저의 iPhone 설치 체크 상세 현황 ${progressText}을 메일 앱으로 보냅니다.`;
      mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 체크 현황")}&body=${encodeURIComponent(handoffText)}`;
      mailLink.textContent = `상세 메일 ${checkedCount}/${checkboxes.length}`;
      mailLink.title = mailDescription;
      mailLink.setAttribute("aria-label", mailDescription);
    }
  }
  if (nextStep) {
    nextStep.textContent = firstUnchecked
      ? `다음 단계: ${nextLabel}`
      : "모든 항목 체크됨: 완료 상태 페이지에서 실제 남은 gate가 없는지 확인하세요.";
  }
  if (nextStepLink) {
    const nextStepLinkDescription = firstUnchecked && nextLabel
      ? `다음 단계로 이동: ${nextLabel}`
      : "모든 항목 체크됨: 완료 상태 페이지에서 실제 남은 gate 확인";
    nextStepLink.hidden = false;
    nextStepLink.href = nextTarget.href;
    nextStepLink.textContent = nextTarget.label;
    nextStepLink.title = nextStepLinkDescription;
    nextStepLink.setAttribute("aria-label", nextStepLinkDescription);
    nextStepLink.setAttribute("aria-describedby", "iosInstallHandsOnNextStep");
  }
  if (savedAt) {
    if (Number.isFinite(updatedAtMs)) {
      const savedAtText = `이 기기 브라우저 ${savedAtAction}: ${new Date(updatedAtMs).toLocaleString("ko-KR")}`;
      const savedAtDescription = `${savedAtText}. 다른 기기 브라우저와 동기화되지 않는 로컬 체크리스트 저장 시각입니다.`;
      savedAt.hidden = false;
      savedAt.textContent = savedAtText;
      savedAt.title = savedAtDescription;
      savedAt.setAttribute("aria-label", savedAtDescription);
    } else {
      savedAt.hidden = true;
      savedAt.textContent = "";
      savedAt.removeAttribute("title");
      savedAt.removeAttribute("aria-label");
    }
  }
}

function setIosInstallHandsOnStep(stepId, checked = true) {
  const state = readIosInstallHandsOnChecklist();
  state[stepId] = checked;
  writeIosInstallHandsOnChecklist(state);
  updateIosInstallHandsOnChecklist();
}

function inferIosInstallHandsOnProgressFromMode() {
  if (isLikelyIosSafari()) {
    setIosInstallHandsOnStep("open-safari", true);
  }
  if (isStandaloneDisplay()) {
    setIosInstallHandsOnStep("open-safari", true);
    setIosInstallHandsOnStep("add-home-screen", true);
    setIosInstallHandsOnStep("launch-travel", true);
  }
}

function markIosInstallHandsOnCommandStep(command) {
  void command;
  // Copying a Mac command is not proof that it passed; keep pre-phone evidence
  // and HTTPS preflight checklist steps manual until the operator confirms the
  // terminal output.
}

function iosInstallSummaryCheckIsFresh() {
  const summaryGeneratedAt = iosInstallSummaryCheck?.summaryGeneratedAt || "";
  const staleAfterHours = Number(iosInstallSummaryCheck?.iosEvidenceFreshness?.staleAfterHours || 0);
  const generatedAtMs = Date.parse(summaryGeneratedAt);
  if (!summaryGeneratedAt || !Number.isFinite(generatedAtMs) || staleAfterHours < 1) return false;
  return Date.now() - generatedAtMs <= staleAfterHours * 60 * 60 * 1000;
}

function iosInstallSummaryFreshnessState() {
  const summaryGeneratedAt = iosInstallSummaryCheck?.summaryGeneratedAt || "";
  const staleAfterHours = Number(iosInstallSummaryCheck?.iosEvidenceFreshness?.staleAfterHours || 0);
  const generatedAtMs = Date.parse(summaryGeneratedAt);
  if (!summaryGeneratedAt || !Number.isFinite(generatedAtMs) || staleAfterHours < 1) return "unknown";
  return Date.now() - generatedAtMs <= staleAfterHours * 60 * 60 * 1000 ? "fresh" : "stale";
}

function iosInstallSummaryFreshnessDetail() {
  const summaryGeneratedAt = iosInstallSummaryCheck?.summaryGeneratedAt || "";
  const staleAfterHours = Number(iosInstallSummaryCheck?.iosEvidenceFreshness?.staleAfterHours || 0);
  return `summaryFreshness=${iosInstallSummaryFreshnessState()} summaryGeneratedAt=${summaryGeneratedAt || "없음"} staleAfterHours=${staleAfterHours || "없음"}`;
}

function updateIosInstallSummaryFreshnessBadge() {
  const badge = document.getElementById("iosInstallSummaryFreshness");
  if (!badge) return;

  const state = iosInstallSummaryFreshnessState();
  const summaryGeneratedAt = iosInstallSummaryCheck?.summaryGeneratedAt || "";
  const staleAfterHours = Number(iosInstallSummaryCheck?.iosEvidenceFreshness?.staleAfterHours || 0);
  badge.dataset.state = state;
  badge.textContent = state === "fresh"
    ? `summary freshness: fresh · generatedAt=${summaryGeneratedAt} · staleAfter=${staleAfterHours}h`
    : state === "stale"
      ? `summary freshness: stale · generatedAt=${summaryGeneratedAt} · staleAfter=${staleAfterHours}h · final gate를 다시 실행하세요.`
      : "summary freshness: unknown · final gate 자동 완료에는 fresh summary-check evidence가 필요합니다.";
}

function inferIosInstallHandsOnProgressFromSummaryCheck() {
  if (
    iosInstallSummaryCheck?.ok === true
    && iosInstallSummaryCheck?.status === "ready"
    && iosInstallSummaryCheck?.finalEvidenceCommand === "npm run ios:install:evidence:after-phone:final"
    && iosInstallSummaryCheck?.summaryStatus === "complete"
    && iosInstallSummaryCheck?.launchProofAppModeReady === true
    && iosInstallSummaryCheckIsFresh()
  ) {
    setIosInstallHandsOnStep("final-gate", true);
  }
}

function bindIosInstallHandsOnFollowupLinks() {
  document.querySelectorAll('a[href*="/ios-next"], a[href*="/ios-install-status"]').forEach((link) => {
    if (link.dataset.iosInstallHandsOnFollowupBound === "true") return;
    link.dataset.iosInstallHandsOnFollowupBound = "true";
    link.addEventListener("click", () => {
      setIosInstallHandsOnStep("status-board", true);
    });
  });
}

function focusIosInstallHandsOnNextStepTarget(hash) {
  if (!hash || !hash.startsWith("#")) return;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;

  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  target.focus?.({ preventScroll: true });
  target.classList.remove("install-next-step-target-pulse");
  void target.offsetWidth;
  target.classList.add("install-next-step-target-pulse");
  window.setTimeout(() => target.classList.remove("install-next-step-target-pulse"), 1400);
}

function bindIosInstallHandsOnNextStepLink() {
  const link = document.getElementById("iosInstallHandsOnNextStepLink");
  if (!link || link.dataset.iosInstallHandsOnNextStepBound === "true") return;

  const status = document.getElementById("iosInstallStatus");
  link.dataset.iosInstallHandsOnNextStepBound = "true";
  link.addEventListener("click", () => {
    const href = link.getAttribute("href") || "";
    if (href.includes("/ios-install-status")) {
      setIosInstallHandsOnStep("status-board", true);
      return;
    }
    if (!href.startsWith("#")) return;
    const stepDescription = link.getAttribute("aria-label") || link.title || link.textContent || "다음 단계";
    if (status) status.textContent = `${stepDescription} 위치로 이동했습니다. 강조된 영역에서 설치를 이어가세요.`;
    window.setTimeout(() => focusIosInstallHandsOnNextStepTarget(href), 40);
  });
}

function iosInstallHandsOnChecklistSummaryText() {
  const box = document.getElementById("iosInstallHandsOnChecklist");
  const checkboxes = box ? [...box.querySelectorAll("[data-ios-install-hands-on-step]")] : [];
  const state = readIosInstallHandsOnChecklist();
  const checkedCount = checkboxes.filter((checkbox) => Boolean(state[checkbox.dataset.iosInstallHandsOnStep || ""])).length;
  const firstUnchecked = checkboxes.find((checkbox) => !state[checkbox.dataset.iosInstallHandsOnStep || ""]);
  const nextTarget = iosInstallHandsOnStepTarget(firstUnchecked?.dataset.iosInstallHandsOnStep || "");
  const updatedAtMs = Date.parse(state.updatedAt || "");
  const savedAtAction = state.updatedReason === "reset" ? "초기화 저장" : "체크 저장";
  const installChecklistUrl = new URL("/install.html#iosInstallHandsOnChecklist", window.location.href).toString();
  const nextStepUrl = new URL(nextTarget.href, window.location.href).toString();
  const completionStatusUrl = new URL("/ios-install-status", window.location.href).toString();
  const lines = [
    "Travel Planner iPhone 설치 체크 현황",
    `progress=${checkedCount}/${checkboxes.length} 체크`,
    Number.isFinite(updatedAtMs)
      ? `saved=${savedAtAction} ${new Date(updatedAtMs).toLocaleString("ko-KR")}`
      : "saved=아직 이 브라우저에 저장된 체크 현황 없음",
    "storage=현재 기기 브라우저 로컬 저장, 다른 기기와 자동 동기화되지 않음",
    firstUnchecked
      ? `next=${firstUnchecked.closest("label")?.querySelector("span")?.textContent?.trim() || "다음 미완료 단계"}`
      : "next=완료 상태 페이지에서 실제 남은 gate 확인",
    `installChecklist=${installChecklistUrl}`,
    `nextStepUrl=${nextStepUrl}`,
    `completionStatus=${completionStatusUrl}`,
    "",
    "steps:",
    ...checkboxes.map((checkbox) => {
      const label = checkbox.closest("label")?.querySelector("span")?.textContent?.trim() || checkbox.dataset.iosInstallHandsOnStep || "단계";
      return `- [${state[checkbox.dataset.iosInstallHandsOnStep || ""] ? "x" : " "}] ${label}`;
    }),
  ];
  return lines.join("\n");
}

function iosInstallHandsOnChecklistCompactSummaryText() {
  const box = document.getElementById("iosInstallHandsOnChecklist");
  const checkboxes = box ? [...box.querySelectorAll("[data-ios-install-hands-on-step]")] : [];
  const state = readIosInstallHandsOnChecklist();
  const checkedCount = checkboxes.filter((checkbox) => Boolean(state[checkbox.dataset.iosInstallHandsOnStep || ""])).length;
  const firstUnchecked = checkboxes.find((checkbox) => !state[checkbox.dataset.iosInstallHandsOnStep || ""]);
  const nextTarget = iosInstallHandsOnStepTarget(firstUnchecked?.dataset.iosInstallHandsOnStep || "");
  const updatedAtMs = Date.parse(state.updatedAt || "");
  const savedAtAction = state.updatedReason === "reset" ? "초기화 저장" : "체크 저장";
  const installChecklistUrl = new URL("/install.html#iosInstallHandsOnChecklist", window.location.href).toString();
  const nextStepUrl = new URL(nextTarget.href, window.location.href).toString();
  const completionStatusUrl = new URL("/ios-install-status", window.location.href).toString();
  const nextLabel = firstUnchecked?.closest("label")?.querySelector("span")?.textContent?.trim() || "완료 상태 페이지에서 실제 남은 gate 확인";
  return [
    `Travel Planner iPhone 설치 체크 ${checkedCount}/${checkboxes.length}`,
    Number.isFinite(updatedAtMs)
      ? `${savedAtAction}: ${new Date(updatedAtMs).toLocaleString("ko-KR")}`
      : "저장: 아직 이 브라우저에 저장된 체크 현황 없음",
    "저장 범위: 현재 기기 브라우저 로컬, 자동 동기화 없음",
    `다음: ${nextLabel}`,
    `다음 위치: ${nextStepUrl}`,
    `완료 상태: ${completionStatusUrl}`,
  ].join("\n");
}

function bindIosInstallHandsOnChecklist() {
  const box = document.getElementById("iosInstallHandsOnChecklist");
  if (!box || box.dataset.iosInstallHandsOnBound === "true") return;

  const status = document.getElementById("iosInstallStatus");
  box.dataset.iosInstallHandsOnBound = "true";
  box.querySelectorAll("[data-ios-install-hands-on-step]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const state = readIosInstallHandsOnChecklist();
      state[checkbox.dataset.iosInstallHandsOnStep || ""] = checkbox.checked;
      writeIosInstallHandsOnChecklist(state, "check");
      updateIosInstallHandsOnChecklist();
      if (status) status.textContent = "iPhone 설치 체크리스트 진행 상태를 이 기기 브라우저에 저장했습니다. 다른 기기 브라우저와 동기화되지 않습니다.";
    });
  });
  document.getElementById("iosInstallHandsOnCopyButton")?.addEventListener("click", async () => {
    const text = iosInstallHandsOnChecklistSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = "이 기기 브라우저의 iPhone 설치 체크 현황을 복사했습니다. Notes나 메시지로 옮겨 설치 중 참고하세요.";
    } catch {
      if (status) status.textContent = "iPhone 설치 체크 현황 prompt를 열었습니다. 텍스트를 복사해 Notes나 메시지로 옮겨 설치 중 참고하세요.";
      window.prompt("iPhone 설치 체크 현황을 복사하세요.", text);
    }
  });
  document.getElementById("iosInstallHandsOnShareButton")?.addEventListener("click", async () => {
    const text = iosInstallHandsOnChecklistSummaryText();
    const firstUnchecked = document.querySelector(`#iosInstallHandsOnChecklist [data-ios-install-hands-on-step]:not(:checked)`);
    const nextTarget = iosInstallHandsOnStepTarget(firstUnchecked?.dataset.iosInstallHandsOnStep || "");
    const nextStepUrl = new URL(nextTarget.href || "/ios-install-status", window.location.href).toString();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Travel Planner iPhone 설치 체크 현황",
          text,
          url: nextStepUrl,
        });
        if (status) status.textContent = "이 기기 브라우저의 iPhone 설치 체크 현황을 공유했습니다.";
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          if (status) status.textContent = "iPhone 설치 체크 현황 공유를 취소했습니다. 필요하면 다시 공유하세요.";
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = "공유를 열 수 없어 이 기기 브라우저의 iPhone 설치 체크 현황을 복사했습니다. Notes나 메시지에 붙여넣으세요.";
    } catch {
      if (status) status.textContent = "iPhone 설치 체크 현황 공유 prompt를 열었습니다. 텍스트를 복사해 Notes나 메시지로 옮겨 설치 중 참고하세요.";
      window.prompt("iPhone 설치 체크 현황을 복사하세요.", text);
    }
  });
  document.getElementById("iosInstallHandsOnSmsLink")?.addEventListener("click", () => {
    if (status) status.textContent = "iPhone 설치 체크 현황 짧은 요약을 문자 앱으로 넘겼습니다. 진행률, 다음 단계, 완료 상태 URL을 설치 중 참고하세요.";
  });
  document.getElementById("iosInstallHandsOnMailLink")?.addEventListener("click", () => {
    if (status) status.textContent = "iPhone 설치 체크 상세 현황을 메일 앱으로 넘겼습니다. 상세 체크 항목과 완료 상태 URL을 설치 중 참고하세요.";
  });
  document.getElementById("iosInstallHandsOnResetButton")?.addEventListener("click", () => {
    writeIosInstallHandsOnChecklist({}, "reset");
    updateIosInstallHandsOnChecklist();
    if (status) status.textContent = "이 기기 브라우저의 iPhone 설치 체크리스트를 초기화했습니다. 다른 기기 브라우저의 체크 상태는 바뀌지 않습니다.";
  });
  updateIosInstallHandsOnChecklist();
  bindIosInstallHandsOnFollowupLinks();
  bindIosInstallHandsOnNextStepLink();
}

async function loadInstallInfo() {
  try {
    const response = await fetch("/api/install-info", {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      iosInstallInfo = await response.json();
      restoreSelectedShortInstallUrl();
    }
  } catch {
    // The install helper is optional; static hosting can still use the page copy.
  }
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isLikelyIosSafari() {
  if (!isIosDevice()) return false;
  const userAgent = navigator.userAgent;
  const excludedIosBrowsers = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|KAKAOTALK|NAVER|DaumApps|Instagram|FBAN|FBAV|Line\//;
  return /Safari/.test(userAgent) && !excludedIosBrowsers.test(userAgent);
}

function isStandaloneDisplay() {
  // iOS standalone detection is documented by Apple.
  // Source: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function updateStandaloneDisplayMode() {
  document.documentElement.dataset.displayMode = isStandaloneDisplay() ? "standalone" : "browser";
}

function redirectStandaloneInstallGuideToApp() {
  if (isStandaloneDisplay() && ["/install", "/install.html", "/i", "/iphone"].includes(window.location.pathname)) {
    window.location.replace(`/${window.location.search}${window.location.hash}`);
  }
}

function isLocalInstallHost(hostname = window.location.hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function isLocalInstallUrl() {
  return isLocalInstallHost();
}

function preferredInstallUrl() {
  if (iosInstallInfo?.recommendedInstallUrl) {
    return installPageUrl(iosInstallInfo.recommendedInstallUrl);
  }
  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.[0]) {
    return installPageUrl(iosInstallInfo.lanOrigins[0]);
  }
  return installPageUrl(iosInstallInfo?.installUrl || window.location.href);
}

function preferredShortInstallUrl() {
  if (selectedShortInstallUrl) {
    return selectedShortInstallUrl;
  }
  if (iosInstallInfo?.recommendedShortInstallUrl) {
    return iosInstallInfo.recommendedShortInstallUrl;
  }
  try {
    const url = new URL(preferredInstallUrl());
    url.pathname = "/i";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return window.location.href;
  }
}

function proofSaveUrlFrom(value) {
  const url = new URL(value);
  url.pathname = "/install.html";
  url.search = "";
  url.hash = "iosInstallProofSaveButton";
  return url.toString();
}

function preferredProofSaveUrl() {
  if (selectedShortInstallUrl) {
    try {
      return proofSaveUrlFrom(selectedShortInstallUrl);
    } catch {
      // Fall through to the install-info proof link or the generic install URL.
    }
  }
  if (iosInstallInfo?.proofSaveUrl) {
    return iosInstallInfo.proofSaveUrl;
  }
  try {
    return proofSaveUrlFrom(preferredInstallUrl());
  } catch {
    return `${window.location.origin}/install.html#iosInstallProofSaveButton`;
  }
}

function preferredInstallQrUrl() {
  if (selectedShortInstallUrl) {
    try {
      const url = new URL("/api/install-qr.svg", window.location.origin);
      url.searchParams.set("target", selectedShortInstallUrl);
      return url.toString();
    } catch {
      return iosInstallInfo?.installQrSvgUrl || "";
    }
  }
  return iosInstallInfo?.installQrSvgUrl || "";
}

function preferredShortInstallUrlParts() {
  try {
    const url = new URL(preferredShortInstallUrl());
    return {
      host: `${url.protocol}//${url.host}`,
      path: url.pathname || "/i",
    };
  } catch {
    return { host: "", path: "" };
  }
}

function uniqueInstallUrls(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function shortInstallUrlChoices() {
  return uniqueInstallUrls([
    preferredShortInstallUrl(),
    ...(iosInstallInfo?.lanShortInstallUrls || []),
    iosInstallInfo?.shortInstallUrl || "",
    iosInstallInfo?.configuredShortInstallUrl || "",
  ]);
}

function restoreSelectedShortInstallUrl() {
  try {
    const savedUrl = window.localStorage.getItem(SELECTED_SHORT_INSTALL_URL_STORAGE) || "";
    selectedShortInstallUrl = shortInstallUrlChoices().includes(savedUrl) ? savedUrl : "";
  } catch {
    selectedShortInstallUrl = "";
  }
}

function saveSelectedShortInstallUrl(url) {
  selectedShortInstallUrl = url;
  try {
    window.localStorage.setItem(SELECTED_SHORT_INSTALL_URL_STORAGE, url);
  } catch {
    // Selection persistence is a convenience; the current page state still updates.
  }
}

function clearSelectedShortInstallUrl() {
  selectedShortInstallUrl = "";
  try {
    window.localStorage.removeItem(SELECTED_SHORT_INSTALL_URL_STORAGE);
  } catch {
    // Selection persistence is a convenience; the current page state still updates.
  }
}

function installPageUrl(originOrUrl) {
  try {
    const url = new URL(originOrUrl, window.location.href);
    url.pathname = "/install.html";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return window.location.href;
  }
}

function installShareText(url = preferredInstallUrl()) {
  return `Travel Planner 설치 주소입니다. iPhone Safari에서 열고 공유 버튼 > 홈 화면에 추가를 선택하세요.\n${url}`;
}

function installUrlHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function installUrlNeedsLocalhostWarning(url) {
  return isLocalInstallHost(installUrlHostname(url));
}

function installUrlSourceLabel(url) {
  if (selectedShortInstallUrl && url === selectedShortInstallUrl) return "선택한 짧은 주소";
  if (url === preferredShortInstallUrl()) return selectedShortInstallUrl ? "선택한 짧은 주소" : "추천 짧은 주소";
  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.some((origin) => String(url || "").startsWith(origin))) return "같은 Wi-Fi 주소";
  if (installUrlNeedsLocalhostWarning(url)) return "localhost 주소";
  return "추천 설치 주소";
}

function installUrlCopyFeedback(url, actionLabel = "설치 주소") {
  const source = installUrlSourceLabel(url);
  const warning = installUrlNeedsLocalhostWarning(url)
    ? " localhost는 iPhone에서 바로 열 수 없으니 같은 Wi-Fi Mac IP 또는 HTTPS 배포 주소로 다시 복사하세요."
    : "";
  return `${source} ${actionLabel}를 복사했습니다.${warning} iPhone Safari 주소창에 붙여넣고 공유 버튼 > 홈 화면에 추가하세요.`;
}

function installUrlPromptMessage(url, actionLabel = "설치 주소") {
  const source = installUrlSourceLabel(url);
  const warning = installUrlNeedsLocalhostWarning(url)
    ? " localhost 주소라면 iPhone에서 바로 열 수 없습니다. 같은 Wi-Fi Mac IP 또는 HTTPS 배포 주소가 필요합니다."
    : "";
  return `${source} ${actionLabel}를 복사하세요.${warning}`;
}

const IOS_INSTALL_STATUS_NEXT_ACTION_DEFAULT_TEXT = "완료 상태 URL을 복사/공유/문자/메일로 보내 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
const IOS_INSTALL_STATUS_NEXT_HANDOFF_RESET_DELAY_MS = 2400;

function clearIosInstallStatusNextLink() {
  const statusNextLink = document.getElementById("iosInstallStatusNextLink");
  const statusNextHint = document.getElementById("iosInstallStatusNextHint");
  const statusNextActions = document.getElementById("iosInstallStatusNextActions");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  const statusNextCopyButton = document.getElementById("iosInstallStatusNextCopyButton");
  const statusNextShareButton = document.getElementById("iosInstallStatusNextShareButton");
  const statusNextSmsLink = document.getElementById("iosInstallStatusNextSmsLink");
  const statusNextMailLink = document.getElementById("iosInstallStatusNextMailLink");
  if (statusNextLink) {
    statusNextLink.hidden = true;
    statusNextLink.removeAttribute("href");
    statusNextLink.removeAttribute("aria-label");
    statusNextLink.removeAttribute("aria-describedby");
    statusNextLink.removeAttribute("title");
    statusNextLink.classList.remove("install-status-next-link-pulse");
    statusNextLink.textContent = "";
  }
  if (statusNextHint) {
    statusNextHint.hidden = true;
    statusNextHint.textContent = "";
  }
  if (statusNextActions) {
    statusNextActions.hidden = true;
    statusNextActions.removeAttribute("aria-busy");
  }
  if (statusNextActionsStatus) {
    statusNextActionsStatus.hidden = true;
    statusNextActionsStatus.dataset.feedbackToken = "";
    statusNextActionsStatus.textContent = "";
  }
  if (statusNextCopyButton) {
    statusNextCopyButton.hidden = true;
    statusNextCopyButton.disabled = false;
    statusNextCopyButton.dataset.busyToken = "";
    statusNextCopyButton.dataset.statusUrl = "";
    statusNextCopyButton.textContent = "완료 상태 URL 복사";
    statusNextCopyButton.removeAttribute("aria-label");
    statusNextCopyButton.removeAttribute("aria-describedby");
    statusNextCopyButton.removeAttribute("aria-busy");
    statusNextCopyButton.removeAttribute("title");
  }
  if (statusNextShareButton) {
    statusNextShareButton.hidden = true;
    statusNextShareButton.disabled = false;
    statusNextShareButton.dataset.busyToken = "";
    statusNextShareButton.dataset.statusUrl = "";
    statusNextShareButton.textContent = "완료 상태 URL 공유";
    statusNextShareButton.removeAttribute("aria-label");
    statusNextShareButton.removeAttribute("aria-describedby");
    statusNextShareButton.removeAttribute("aria-busy");
    statusNextShareButton.removeAttribute("title");
  }
  if (statusNextSmsLink) {
    statusNextSmsLink.hidden = true;
    statusNextSmsLink.removeAttribute("href");
    statusNextSmsLink.removeAttribute("aria-label");
    statusNextSmsLink.removeAttribute("aria-describedby");
    statusNextSmsLink.removeAttribute("title");
  }
  if (statusNextMailLink) {
    statusNextMailLink.hidden = true;
    statusNextMailLink.removeAttribute("href");
    statusNextMailLink.removeAttribute("aria-label");
    statusNextMailLink.removeAttribute("aria-describedby");
    statusNextMailLink.removeAttribute("title");
  }
}

function resetIosInstallStatusNextActionsStatus(statusNextActionsStatus) {
  if (!statusNextActionsStatus) return;
  nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus);
  statusNextActionsStatus.hidden = false;
  statusNextActionsStatus.textContent = IOS_INSTALL_STATUS_NEXT_ACTION_DEFAULT_TEXT;
}

function nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus) {
  if (!statusNextActionsStatus) return "";
  const token = `${Date.now()}:${Math.random()}`;
  statusNextActionsStatus.dataset.feedbackToken = token;
  return token;
}

function resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, token) {
  if (!statusNextActionsStatus || !token || statusNextActionsStatus.dataset.feedbackToken !== token) return;
  statusNextActionsStatus.hidden = false;
  statusNextActionsStatus.textContent = IOS_INSTALL_STATUS_NEXT_ACTION_DEFAULT_TEXT;
}

function resetIosInstallStatusNextActionButtonLabelIfCurrent(button, label, statusNextActionsStatus, token, title = "", ariaLabel = "") {
  if (!button || (statusNextActionsStatus && (!token || statusNextActionsStatus.dataset.feedbackToken !== token))) return;
  button.textContent = label;
  if (title) button.title = title;
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
}

function nextIosInstallStatusNextActionButtonBusyToken(button) {
  if (!button) return "";
  const token = `${Date.now()}:${Math.random()}`;
  button.dataset.busyToken = token;
  return token;
}

function resetIosInstallStatusNextActionButtonBusyIfCurrent(button, token) {
  if (!button || !token || button.dataset.busyToken !== token) return;
  button.disabled = false;
  button.dataset.busyToken = "";
  button.removeAttribute("aria-busy");
}

function setIosInstallStatusNextActionsBusy(statusNextActions, busy) {
  if (!statusNextActions) return;
  if (busy) statusNextActions.setAttribute("aria-busy", "true");
  else statusNextActions.removeAttribute("aria-busy");
}

function resetIosInstallStatusNextActionsBusyIfCurrent(statusNextActions, statusNextActionsStatus, token) {
  if (!statusNextActions || !statusNextActionsStatus || !token || statusNextActionsStatus.dataset.feedbackToken !== token) return;
  statusNextActions.removeAttribute("aria-busy");
}

function updateIosInstallStatusNextHandoffFeedback(message) {
  const status = document.getElementById("iosInstallStatus");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  const feedbackToken = nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus);
  if (status) status.textContent = message;
  if (statusNextActionsStatus) {
    statusNextActionsStatus.hidden = false;
    statusNextActionsStatus.textContent = message;
  }
  return feedbackToken;
}

function updateIosInstallStatusNextHandoffBusyFeedback(message) {
  const status = document.getElementById("iosInstallStatus");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  const feedbackToken = nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus);
  if (status) status.textContent = message;
  if (statusNextActionsStatus) {
    statusNextActionsStatus.hidden = false;
    statusNextActionsStatus.textContent = message;
  }
  return feedbackToken;
}

function bindIosInstallStatusNextHandoffLink(link, message, activeLabel, defaultLabel, activeTitle, defaultTitle, activeAriaLabel, defaultAriaLabel, busyMessage) {
  if (!link || link.dataset.statusNextHandoffBound === "true") return;
  link.dataset.statusNextHandoffBound = "true";
  link.addEventListener("click", (event) => {
    const statusNextActions = document.getElementById("iosInstallStatusNextActions");
    if (link.dataset.statusNextHandoffBusy === "true") {
      event.preventDefault();
      const feedbackToken = updateIosInstallStatusNextHandoffBusyFeedback(busyMessage || "완료 상태 URL handoff를 이미 여는 중입니다. 잠시 뒤 다시 눌러주세요.");
      scheduleIosInstallStatusNextHandoffReset(link, statusNextActions, defaultLabel, defaultTitle, defaultAriaLabel, feedbackToken);
      return;
    }
    const feedbackToken = updateIosInstallStatusNextHandoffFeedback(message);
    setIosInstallStatusNextActionsBusy(statusNextActions, true);
    link.dataset.statusNextHandoffBusy = "true";
    link.textContent = activeLabel;
    link.title = activeTitle;
    link.setAttribute("aria-label", activeAriaLabel);
    link.setAttribute("aria-disabled", "true");
    link.setAttribute("aria-busy", "true");
    scheduleIosInstallStatusNextHandoffReset(link, statusNextActions, defaultLabel, defaultTitle, defaultAriaLabel, feedbackToken);
  });
}

function scheduleIosInstallStatusNextHandoffReset(link, statusNextActions, defaultLabel, defaultTitle, defaultAriaLabel, feedbackToken) {
  window.setTimeout(() => {
    const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
    if (statusNextActionsStatus?.dataset.feedbackToken !== feedbackToken) return;
    resetIosInstallStatusNextHandoffLinkIfCurrent(link, defaultLabel, defaultTitle, defaultAriaLabel, statusNextActionsStatus, feedbackToken);
    resetIosInstallStatusNextHandoffBusyIfCurrent(link, statusNextActions, statusNextActionsStatus, feedbackToken);
    resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
  }, IOS_INSTALL_STATUS_NEXT_HANDOFF_RESET_DELAY_MS);
}

function resetIosInstallStatusNextHandoffLinkIfCurrent(link, label, title, ariaLabel, statusNextActionsStatus, token) {
  if (!link || !statusNextActionsStatus || !token || statusNextActionsStatus.dataset.feedbackToken !== token) return;
  link.textContent = label;
  link.title = title;
  link.setAttribute("aria-label", ariaLabel);
}

function resetIosInstallStatusNextHandoffBusyIfCurrent(link, statusNextActions, statusNextActionsStatus, token) {
  if (!link || !statusNextActions || !statusNextActionsStatus || !token || statusNextActionsStatus.dataset.feedbackToken !== token) return;
  delete link.dataset.statusNextHandoffBusy;
  link.removeAttribute("aria-disabled");
  link.removeAttribute("aria-busy");
  resetIosInstallStatusNextActionsBusyIfCurrent(statusNextActions, statusNextActionsStatus, token);
}

function showIosInstallStatusNextLink(href, label, commandLabel = "", command = "") {
  const statusNextLink = document.getElementById("iosInstallStatusNextLink");
  const statusNextHint = document.getElementById("iosInstallStatusNextHint");
  const statusNextActions = document.getElementById("iosInstallStatusNextActions");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  const statusNextCopyButton = document.getElementById("iosInstallStatusNextCopyButton");
  const statusNextShareButton = document.getElementById("iosInstallStatusNextShareButton");
  const statusNextSmsLink = document.getElementById("iosInstallStatusNextSmsLink");
  const statusNextMailLink = document.getElementById("iosInstallStatusNextMailLink");
  if (!statusNextLink || !href) return;
  statusNextLink.hidden = false;
  statusNextLink.href = href;
  statusNextLink.textContent = `${label || "다음 단계"} 열기`;
  statusNextLink.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준으로 남은 iPhone 설치 gate를 확인합니다.";
  statusNextLink.setAttribute("aria-label", `Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준으로 ${label || "다음 단계"} 열기`);
  const statusUrl = statusNextLink.href;
  if (statusNextHint) {
    statusNextLink.setAttribute("aria-describedby", "iosInstallStatusNextHint");
  }
  if (statusNextHint) {
    statusNextHint.hidden = false;
    statusNextHint.textContent = [
    `Mac에서 복사한 ${commandLabel || "final gate"} 명령을 실행한 뒤 이 링크로 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.`,
      command ? `명령: ${command}` : "",
      statusUrl ? `확인 링크: ${statusUrl}` : "",
    ].filter(Boolean).join(" ");
  }
  if (statusNextActions && statusUrl) {
    statusNextActions.hidden = false;
    statusNextActions.removeAttribute("aria-busy");
  }
  if (statusNextActionsStatus && statusUrl) {
    statusNextActionsStatus.hidden = false;
    resetIosInstallStatusNextActionsStatus(statusNextActionsStatus);
  }
  if (statusNextCopyButton && statusUrl) {
    statusNextCopyButton.hidden = false;
    statusNextCopyButton.disabled = false;
    statusNextCopyButton.dataset.busyToken = "";
    statusNextCopyButton.dataset.statusUrl = statusUrl;
    statusNextCopyButton.textContent = "완료 상태 URL 복사";
    statusNextCopyButton.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 복사합니다.";
    statusNextCopyButton.setAttribute("aria-label", `${label || "완료 상태"} URL 복사`);
    statusNextCopyButton.setAttribute("aria-describedby", "iosInstallStatusNextHint iosInstallStatusNextActionsStatus");
    statusNextCopyButton.removeAttribute("aria-busy");
  }
  if (statusNextShareButton && statusUrl) {
    statusNextShareButton.hidden = false;
    statusNextShareButton.disabled = false;
    statusNextShareButton.dataset.busyToken = "";
    statusNextShareButton.dataset.statusUrl = statusUrl;
    statusNextShareButton.textContent = "완료 상태 URL 공유";
    statusNextShareButton.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유합니다.";
    statusNextShareButton.setAttribute("aria-label", `${label || "완료 상태"} URL 공유`);
    statusNextShareButton.setAttribute("aria-describedby", "iosInstallStatusNextHint iosInstallStatusNextActionsStatus");
    statusNextShareButton.removeAttribute("aria-busy");
  }
  if (statusUrl) {
    const statusShareText = `Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준으로 Travel Planner iPhone 설치 완료 상태를 확인하세요.\n${statusUrl}`;
    if (statusNextSmsLink) {
      statusNextSmsLink.hidden = false;
      statusNextSmsLink.href = `sms:&body=${encodeURIComponent(statusShareText)}`;
      statusNextSmsLink.textContent = "완료 상태 URL 문자";
      statusNextSmsLink.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 문자로 보냅니다.";
      statusNextSmsLink.setAttribute("aria-label", `${label || "완료 상태"} URL 문자로 보내기`);
      statusNextSmsLink.setAttribute("aria-describedby", "iosInstallStatusNextHint iosInstallStatusNextActionsStatus");
      delete statusNextSmsLink.dataset.statusNextHandoffBusy;
      statusNextSmsLink.removeAttribute("aria-disabled");
      statusNextSmsLink.removeAttribute("aria-busy");
      bindIosInstallStatusNextHandoffLink(
        statusNextSmsLink,
        "완료 상태 URL을 문자 앱으로 넘겼습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.",
        "문자 앱 열림",
        "완료 상태 URL 문자",
        "완료 상태 URL을 문자 앱으로 넘겼습니다.",
        "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 문자로 보냅니다.",
        "완료 상태 URL 문자 앱 열림",
        `${label || "완료 상태"} URL 문자로 보내기`,
        "완료 상태 URL 문자 앱을 이미 여는 중입니다. 잠시 뒤 다시 눌러주세요."
      );
    }
    if (statusNextMailLink) {
      statusNextMailLink.hidden = false;
      statusNextMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 완료 상태")}&body=${encodeURIComponent(statusShareText)}`;
      statusNextMailLink.textContent = "완료 상태 URL 메일";
      statusNextMailLink.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 메일로 보냅니다.";
      statusNextMailLink.setAttribute("aria-label", `${label || "완료 상태"} URL 메일로 보내기`);
      statusNextMailLink.setAttribute("aria-describedby", "iosInstallStatusNextHint iosInstallStatusNextActionsStatus");
      delete statusNextMailLink.dataset.statusNextHandoffBusy;
      statusNextMailLink.removeAttribute("aria-disabled");
      statusNextMailLink.removeAttribute("aria-busy");
      bindIosInstallStatusNextHandoffLink(
        statusNextMailLink,
        "완료 상태 URL을 메일 앱으로 넘겼습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.",
        "메일 앱 열림",
        "완료 상태 URL 메일",
        "완료 상태 URL을 메일 앱으로 넘겼습니다.",
        "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 메일로 보냅니다.",
        "완료 상태 URL 메일 앱 열림",
        `${label || "완료 상태"} URL 메일로 보내기`,
        "완료 상태 URL 메일 앱을 이미 여는 중입니다. 잠시 뒤 다시 눌러주세요."
      );
    }
  }
  statusNextLink.classList.remove("install-status-next-link-pulse");
  void statusNextLink.offsetWidth;
  statusNextLink.classList.add("install-status-next-link-pulse");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  statusNextLink.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  statusNextLink.focus?.();
  window.setTimeout(() => statusNextLink.classList.remove("install-status-next-link-pulse"), 1400);
}

function appendIosInstallStatusNextHintOnce(statusNextHint, text) {
  if (!statusNextHint || !text || statusNextHint.textContent.includes(text)) return;
  statusNextHint.textContent = [
    statusNextHint.textContent,
    text,
  ].filter(Boolean).join(" ");
}

function bindIosInstallStatusNextCopyButton() {
  const statusNextCopyButton = document.getElementById("iosInstallStatusNextCopyButton");
  const status = document.getElementById("iosInstallStatus");
  const statusNextHint = document.getElementById("iosInstallStatusNextHint");
  const statusNextActions = document.getElementById("iosInstallStatusNextActions");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  if (!statusNextCopyButton || statusNextCopyButton.dataset.bound === "true") return;
  statusNextCopyButton.dataset.bound = "true";
  statusNextCopyButton.addEventListener("click", async () => {
    const statusUrl = statusNextCopyButton.dataset.statusUrl || "";
    if (!statusUrl || statusNextCopyButton.disabled) return;
    const feedbackToken = nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus);
    const busyToken = nextIosInstallStatusNextActionButtonBusyToken(statusNextCopyButton);
    setIosInstallStatusNextActionsBusy(statusNextActions, true);
    statusNextCopyButton.disabled = true;
    statusNextCopyButton.setAttribute("aria-busy", "true");
    statusNextCopyButton.textContent = "복사 중";
    statusNextCopyButton.title = "완료 상태 URL을 복사하는 중입니다.";
    statusNextCopyButton.setAttribute("aria-label", "완료 상태 URL 복사 중");
    if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL을 복사하는 중입니다.";
    try {
      await navigator.clipboard.writeText(statusUrl);
      statusNextCopyButton.textContent = "URL 복사됨";
      statusNextCopyButton.title = "완료 상태 URL을 복사했습니다.";
      statusNextCopyButton.setAttribute("aria-label", "완료 상태 URL 복사됨");
      if (status) status.textContent = "완료 상태 URL을 복사했습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
      if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL을 복사했습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
      window.setTimeout(() => {
        resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextCopyButton, "완료 상태 URL 복사", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 복사합니다.", "완료 상태 URL 복사");
        resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
      }, 1600);
    } catch {
      window.prompt("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 복사하세요.", statusUrl);
      statusNextCopyButton.textContent = "수동 복사";
      statusNextCopyButton.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL prompt를 열었습니다.";
      statusNextCopyButton.setAttribute("aria-label", "완료 상태 URL 수동 복사");
      if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL prompt를 열었습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
      appendIosInstallStatusNextHintOnce(statusNextHint, "완료 상태 URL prompt를 닫은 뒤 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.");
      window.setTimeout(() => {
        resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextCopyButton, "완료 상태 URL 복사", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 복사합니다.", "완료 상태 URL 복사");
        resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
      }, 1600);
    } finally {
      resetIosInstallStatusNextActionButtonBusyIfCurrent(statusNextCopyButton, busyToken);
      resetIosInstallStatusNextActionsBusyIfCurrent(statusNextActions, statusNextActionsStatus, feedbackToken);
    }
  });
}

function bindIosInstallStatusNextShareButton() {
  const statusNextShareButton = document.getElementById("iosInstallStatusNextShareButton");
  const status = document.getElementById("iosInstallStatus");
  const statusNextHint = document.getElementById("iosInstallStatusNextHint");
  const statusNextActions = document.getElementById("iosInstallStatusNextActions");
  const statusNextActionsStatus = document.getElementById("iosInstallStatusNextActionsStatus");
  if (!statusNextShareButton || statusNextShareButton.dataset.bound === "true") return;
  statusNextShareButton.dataset.bound = "true";
  statusNextShareButton.addEventListener("click", async () => {
    const statusUrl = statusNextShareButton.dataset.statusUrl || "";
    if (!statusUrl || statusNextShareButton.disabled) return;
    const feedbackToken = nextIosInstallStatusNextActionsFeedbackToken(statusNextActionsStatus);
    const busyToken = nextIosInstallStatusNextActionButtonBusyToken(statusNextShareButton);
    setIosInstallStatusNextActionsBusy(statusNextActions, true);
    statusNextShareButton.disabled = true;
    statusNextShareButton.setAttribute("aria-busy", "true");
    statusNextShareButton.textContent = "공유 준비 중";
    statusNextShareButton.title = "완료 상태 URL 공유를 준비하는 중입니다.";
    statusNextShareButton.setAttribute("aria-label", "완료 상태 URL 공유 준비 중");
    if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL 공유를 준비하는 중입니다.";
    try {
      const shareText = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준으로 Travel Planner iPhone 설치 완료 상태를 확인하세요.";
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "Travel Planner iPhone 설치 완료 상태",
            text: shareText,
            url: statusUrl,
          });
          statusNextShareButton.textContent = "공유 열림";
          statusNextShareButton.title = "완료 상태 URL 공유를 열었습니다.";
          statusNextShareButton.setAttribute("aria-label", "완료 상태 URL 공유 열림");
          if (status) status.textContent = "완료 상태 URL 공유를 열었습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
          if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL 공유를 열었습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
          window.setTimeout(() => {
            resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextShareButton, "완료 상태 URL 공유", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유합니다.", "완료 상태 URL 공유");
            resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
          }, 1600);
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          statusNextShareButton.textContent = "공유 취소됨";
          statusNextShareButton.title = "완료 상태 URL 공유를 취소했습니다.";
          statusNextShareButton.setAttribute("aria-label", "완료 상태 URL 공유 취소됨");
          if (status) status.textContent = "완료 상태 URL 공유를 취소했습니다. 필요하면 다시 공유하세요.";
          if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL 공유를 취소했습니다. 필요하면 다시 공유하세요.";
          window.setTimeout(() => {
            resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextShareButton, "완료 상태 URL 공유", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유합니다.", "완료 상태 URL 공유");
            resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
          }, 1600);
          return;
        }
      }
      }
      try {
        await navigator.clipboard.writeText(statusUrl);
        statusNextShareButton.textContent = "URL 복사됨";
        statusNextShareButton.title = "공유를 열 수 없어 완료 상태 URL을 복사했습니다.";
        statusNextShareButton.setAttribute("aria-label", "완료 상태 URL 복사됨");
        if (status) status.textContent = "공유를 열 수 없어 완료 상태 URL을 복사했습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
        if (statusNextActionsStatus) statusNextActionsStatus.textContent = "공유를 열 수 없어 완료 상태 URL을 복사했습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
        window.setTimeout(() => {
          resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextShareButton, "완료 상태 URL 공유", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유합니다.", "완료 상태 URL 공유");
          resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
        }, 1600);
      } catch {
        window.prompt("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유하세요.", statusUrl);
        statusNextShareButton.textContent = "공유 prompt";
        statusNextShareButton.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL 공유 prompt를 열었습니다.";
        statusNextShareButton.setAttribute("aria-label", "완료 상태 URL 공유 prompt");
        if (statusNextActionsStatus) statusNextActionsStatus.textContent = "완료 상태 URL 공유 prompt를 열었습니다. 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.";
        appendIosInstallStatusNextHintOnce(statusNextHint, "완료 상태 URL 공유 prompt를 닫은 뒤 이 주소에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하세요.");
        window.setTimeout(() => {
          resetIosInstallStatusNextActionButtonLabelIfCurrent(statusNextShareButton, "완료 상태 URL 공유", statusNextActionsStatus, feedbackToken, "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인할 완료 상태 URL을 공유합니다.", "완료 상태 URL 공유");
          resetIosInstallStatusNextActionsStatusIfCurrent(statusNextActionsStatus, feedbackToken);
        }, 1600);
      }
    } finally {
      resetIosInstallStatusNextActionButtonBusyIfCurrent(statusNextShareButton, busyToken);
      resetIosInstallStatusNextActionsBusyIfCurrent(statusNextActions, statusNextActionsStatus, feedbackToken);
    }
  });
}

function bindIosInstallCommandCopyButtons() {
  bindIosInstallStatusNextCopyButton();
  bindIosInstallStatusNextShareButton();
  const status = document.getElementById("iosInstallStatus");
  document.querySelectorAll("[data-ios-install-command]").forEach((button) => {
    if (button.dataset.installCommandBound === "true") return;
    button.dataset.installCommandBound = "true";
    button.addEventListener("click", async () => {
      const command = button.dataset.iosInstallCommand || "";
      const label = button.dataset.iosInstallCommandLabel || "evidence";
      const nextHref = button.dataset.iosInstallCommandNextHref || "";
      const nextLabel = button.dataset.iosInstallCommandNextLabel || "다음 단계";
      try {
        await navigator.clipboard.writeText(command);
        markIosInstallHandsOnCommandStep(command);
        if (status) {
          status.textContent = [
            `Mac 터미널에서 실행할 ${label} evidence 명령을 복사했습니다. repo root 또는 webapp/ 터미널에 붙여넣으세요. 실행이 통과하면 iPhone 들고 바로 따라가기 체크리스트에서 해당 항목을 직접 체크하세요.`,
            nextHref ? `실행 후 ${nextLabel}에서 남은 gate를 확인하세요.` : "",
          ].filter(Boolean).join(" ");
        }
        if (nextHref) showIosInstallStatusNextLink(nextHref, nextLabel, label, command);
        else clearIosInstallStatusNextLink();
      } catch {
        markIosInstallHandsOnCommandStep(command);
        clearIosInstallStatusNextLink();
        if (status) {
          status.textContent = `Mac 터미널에서 실행할 ${label} evidence 명령 prompt를 열었습니다. 복사한 명령이 터미널에서 통과하면 iPhone 들고 바로 따라가기 체크리스트에서 해당 항목을 직접 체크하세요.`;
        }
        window.prompt("Mac 터미널에서 실행할 evidence 명령을 복사하세요. 실행이 통과하면 체크리스트를 직접 체크하세요.", command);
      }
    });
  });
  document.querySelectorAll("[data-ios-install-url-copy]").forEach((button) => {
    if (button.dataset.installUrlCopyBound === "true") return;
    button.dataset.installUrlCopyBound = "true";
    button.addEventListener("click", async () => {
      const path = button.dataset.iosInstallUrlCopy || "";
      const label = button.dataset.iosInstallUrlLabel || "install";
      const url = new URL(path, window.location.href).toString();
      try {
        await navigator.clipboard.writeText(url);
        clearIosInstallStatusNextLink();
        if (status) status.textContent = `${label} URL을 복사했습니다. iPhone 메시지나 메모로 옮겨 열 수 있습니다.`;
      } catch {
        clearIosInstallStatusNextLink();
        window.prompt("설치 URL을 복사하세요.", url);
      }
    });
  });
}

function bindIosInstallCommandCopyButtonsWhenReady() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindIosInstallCommandCopyButtons, { once: true });
  } else {
    bindIosInstallCommandCopyButtons();
  }
}

bindIosInstallCommandCopyButtonsWhenReady();

function updateIosInstallFastPathFinalGateButtonState(savedProof = readIosFirstRunChecklist().proof === true, lockReason = "저장 전에는 final gate 명령 복사 버튼이 잠겨 있습니다.") {
  const button = document.getElementById("iosInstallFastPathFinalGateButton");
  const reason = document.getElementById("iosInstallFastPathFinalGateLockReason");
  if (!button) return;
  if (savedProof) {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.title = "Mac 터미널에서 실행할 최종 evidence archive/gate 명령을 복사합니다.";
    button.setAttribute("aria-label", "1분 설치 루트에서 Mac final gate 명령 복사");
    if (reason) reason.textContent = "proof가 준비되어 final gate 명령 복사 버튼을 사용할 수 있습니다.";
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.title = `${lockReason} Mac final gate 명령은 proof가 준비된 뒤 복사할 수 있습니다.`;
  button.setAttribute("aria-label", `${lockReason} 1분 설치 루트 Mac final gate 명령 복사는 잠겨 있습니다.`);
  if (reason) reason.textContent = lockReason;
}

function focusIosInstallSavedProofStatusCard() {
  const target = document.getElementById("iosInstallSavedProofResult")
    || document.getElementById("iosInstallSavedProofMessage")
    || document.getElementById("iosInstallSavedProofMeta")
    || document.getElementById("iosInstallSavedProof");
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  window.setTimeout(() => target.focus?.(), 180);
}

function focusIosInstallProofSaveButtonFromFastPath() {
  const proof = document.getElementById("iosInstallProof");
  const saveButton = document.getElementById("iosInstallProofSaveButton");
  const target = saveButton || proof;
  if (!target) return;
  (proof || target).scrollIntoView({ behavior: "smooth", block: "start" });
  if (!target.hasAttribute("tabindex") && target !== saveButton) {
    target.setAttribute("tabindex", "-1");
  }
  window.setTimeout(() => {
    target.focus?.();
    saveButton?.classList?.remove("install-proof-save-pulse");
    if (saveButton) {
      void saveButton.offsetWidth;
      saveButton.classList.add("install-proof-save-pulse");
    }
  }, 180);
}

function iosInstallFastPathProofRefreshCompletionFeedback(result) {
  const state = typeof result === "string" ? result : result?.state;
  const summary = typeof result === "object" ? result.summary || "" : "";
  if (state === "ready") {
    return {
      text: "proof 확인 완료",
      title: "최근 iPhone 홈 화면 실행 proof가 준비됐습니다. 결과 영역으로 이동합니다.",
      ariaLabel: "최근 iPhone 홈 화면 실행 proof 확인 완료",
    };
  }
  if (state === "empty") {
    const emptyDetail = summary ? ` ${summary}` : "";
    return {
      text: "proof 없음",
      title: `서버에 저장된 iPhone 홈 화면 실행 proof가 아직 없습니다.${emptyDetail} iPhone에서 설치 증거 저장으로 돌아가세요.`,
      ariaLabel: `최근 iPhone 홈 화면 실행 proof 없음.${emptyDetail} 설치 증거 저장으로 돌아가기 필요`,
    };
  }
  const blockedDetail = summary ? ` ${summary}` : "";
  return {
    text: "proof 확인 필요",
    title: `최근 iPhone 홈 화면 실행 proof에 확인이 필요합니다.${blockedDetail} 결과 영역으로 이동합니다.`,
    ariaLabel: `최근 iPhone 홈 화면 실행 proof 확인 필요.${blockedDetail}`,
  };
}

function metaContent(selector) {
  return document.querySelector(selector)?.getAttribute("content") || "";
}

function readNewPlanDraftDiagnostics() {
  try {
    const raw = window.localStorage?.getItem(NEW_PLAN_DRAFT_STORAGE);
    if (!raw) return { state: "none", updatedAt: "", fieldCount: 0 };
    const draft = JSON.parse(raw);
    const excluded = new Set(["updatedAt", "llmApiKey", "llmProvider", "llmModel"]);
    const fieldCount = Object.keys(draft || {}).filter((key) =>
      !excluded.has(key) && String(draft[key] || "").trim()
    ).length;
    return {
      state: draft?.updatedAt ? "saved" : "saved-no-time",
      updatedAt: draft?.updatedAt || "",
      fieldCount,
    };
  } catch {
    return { state: "unreadable", updatedAt: "", fieldCount: 0 };
  }
}

function absoluteLinkHref(selector) {
  const href = document.querySelector(selector)?.getAttribute("href") || "";
  try {
    return href ? new URL(href, window.location.href).toString() : "";
  } catch {
    return "";
  }
}

function installLaunchProofPayload() {
  const shellState = iosHomeDockShellVersionState();
  return {
    schemaVersion: 1,
    schemaUrl: new URL("/ios-launch-proof.schema.json", window.location.origin).toString(),
    type: "ios-home-screen-launch-proof",
    app: "travel-planner-web",
    standalone: isStandaloneDisplay(),
    displayMode: isStandaloneDisplay() ? "standalone" : "browser",
    appModeState: installModeState(),
    appModeTitle: installModeTitle(),
    appModeDetail: installModeDetail(),
    serviceWorker: "serviceWorker" in navigator
      ? navigator.serviceWorker.controller ? "controlled" : "supported-uncontrolled"
      : "unsupported",
    appShell: shellState.installed || "",
    serverShell: shellState.server || "",
    appShellUpdateNeeded: shellState.updateNeeded,
    path: window.location.pathname || "/",
    url: window.location.href,
    iosDevice: isIosDevice(),
    iosSafari: isLikelyIosSafari(),
    appleWebAppTitle: metaContent('meta[name="apple-mobile-web-app-title"]'),
    manifestUrl: absoluteLinkHref('link[rel="manifest"]'),
    themeColor: metaContent('meta[name="theme-color"]'),
    screenWidth: Math.round(Number(window.screen?.width || 0)),
    screenHeight: Math.round(Number(window.screen?.height || 0)),
    devicePixelRatio: Number(window.devicePixelRatio || 1),
    capturedAt: new Date().toISOString(),
  };
}

function installLaunchProofText() {
  return JSON.stringify(installLaunchProofPayload(), null, 2);
}

function readIosFirstRunChecklist() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IOS_FIRST_RUN_CHECKLIST_STORAGE) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeIosFirstRunChecklist(state) {
  try {
    window.localStorage.setItem(IOS_FIRST_RUN_CHECKLIST_STORAGE, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Best-effort local iPhone onboarding progress.
  }
}

function updateIosFirstRunChecklist() {
  const box = document.getElementById("iosInstallFirstRun");
  const list = document.getElementById("iosInstallFirstRunList");
  const progress = document.getElementById("iosInstallFirstRunProgress");
  if (!box || !list) return;

  box.hidden = !isStandaloneDisplay();
  if (box.hidden) return;

  const state = readIosFirstRunChecklist();
  state.launch = true;
  writeIosFirstRunChecklist(state);
  const doneCount = IOS_FIRST_RUN_CHECKLIST_ITEMS.filter((item) => state[item.id]).length;
  if (progress) {
    progress.textContent = `${doneCount}/${IOS_FIRST_RUN_CHECKLIST_ITEMS.length} 완료`;
  }
  list.replaceChildren(...IOS_FIRST_RUN_CHECKLIST_ITEMS.map((item) => {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state[item.id]);
    checkbox.disabled = item.id === "launch";
    checkbox.addEventListener("change", () => {
      const next = readIosFirstRunChecklist();
      next[item.id] = checkbox.checked;
      writeIosFirstRunChecklist(next);
      updateIosFirstRunChecklist();
    });
    text.innerHTML = `<strong>${item.label}</strong><small>${item.detail}</small>`;
    label.append(checkbox, text);
    li.appendChild(label);
    return li;
  }));
  updateIosHomeDock();
}

function countLocalStorageKeys(prefix) {
  try {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || "";
      if (key.startsWith(prefix)) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

function readIosHomeDockSnapshots() {
  try {
    const snapshots = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || "";
      if (!key.startsWith("travel-planner:home-plan-snapshot:v1:")) continue;
      const snapshot = JSON.parse(window.localStorage.getItem(key) || "{}");
      if (snapshot?.schemaVersion === 1 && Array.isArray(snapshot.plans)) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

function latestIosHomeDockPlans(snapshots) {
  const byId = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.plans.forEach((plan) => {
      if (!plan?.id) return;
      const previous = byId.get(String(plan.id));
      if (!previous || String(previous.updatedAt || "") < String(plan.updatedAt || "")) {
        byId.set(String(plan.id), plan);
      }
    });
  });
  return [...byId.values()]
    .sort((a, b) => String(b.updatedAt || "") < String(a.updatedAt || "") ? -1 : 1)
    .slice(0, 3);
}

function formatIosHomeDockSnapshotTime(snapshots) {
  const latest = snapshots
    .map((snapshot) => snapshot.savedAt || "")
    .filter(Boolean)
    .sort()
    .pop();
  if (!latest) return "";
  try {
    return new Date(latest).toLocaleString("ko-KR", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

function nextIosFirstRunChecklistItem(state) {
  return IOS_FIRST_RUN_CHECKLIST_ITEMS.find((item) => !state[item.id]) || null;
}

function focusIosHomeDockNextStepTarget(item) {
  if (!item) return;
  if (item.id === "proof") {
    const proofPanel = document.getElementById("iosInstallProof");
    const saveButton = document.getElementById("iosInstallProofSaveButton");
    proofPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => saveButton?.focus(), 240);
    return;
  }
  if (item.id === "first-plan") {
    const form = document.getElementById("planForm");
    const firstInput = form?.querySelector("input, textarea, select, button");
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => firstInput?.focus(), 240);
    return;
  }
  if (item.id === "offline-read") {
    const latestPlans = document.getElementById("iosHomeDockLatestPlans");
    const target = latestPlans && !latestPlans.hidden
      ? latestPlans
      : document.getElementById("planList");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const target = document.getElementById(item.id === "offline-read" ? "iosHomeDockLatestPlans" : "iosInstallFirstRun")
    || document.getElementById("planList");
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function readIosNewPlanShortcutInstallActionDiagnostics() {
  const group = document.getElementById("newPlanShortcutHintGroup");
  if (!group || group.hidden) {
    return {
      visible: false,
      mode: "hidden",
      href: "",
      label: "",
      destination: "",
      updatedAt: "",
    };
  }
  return {
    visible: true,
    mode: group.dataset.installActionMode || "unknown",
    href: group.dataset.installActionHref || "",
    label: group.dataset.installActionLabel || "",
    destination: group.dataset.installActionDestination || "",
    updatedAt: group.dataset.installActionUpdatedAt || "",
  };
}

function buildIosHomeDockDiagnosticsText() {
  const state = readIosFirstRunChecklist();
  const snapshots = readIosHomeDockSnapshots();
  const plans = latestIosHomeDockPlans(snapshots);
  const draft = readNewPlanDraftDiagnostics();
  const installAction = readIosNewPlanShortcutInstallActionDiagnostics();
  const diagnosticsButton = document.getElementById("iosHomeDockDiagnosticsButton");
  const installStatus = document.getElementById("iosInstallStatus");
  const recoveryLink = document.getElementById("iosOfflineFallbackRecoveryLink");
  const recoveryChecklist = document.getElementById("iosOfflineFallbackRecoveryChecklist");
  const recoveryCarryoverBanner = document.getElementById("iosOfflineFallbackCarryoverBanner");
  const recoveryCarryoverBannerLink = document.getElementById("iosOfflineFallbackCarryoverBannerLink");
  const planStarterLink = document.getElementById("iosHomeDockPlanStarterLink");
  const lastRouteLink = document.getElementById("iosHomeDockLastRouteLink");
  const lastRouteClearButton = document.getElementById("iosHomeDockLastRouteClearButton");
  const displayModeStatus = document.getElementById("iosHomeDockDisplayModeStatus");
  const installModeCopyButton = document.getElementById("iosInstallModeCopyButton");
  const installModeShareButton = document.getElementById("iosInstallModeShareButton");
  const installModeSmsLink = document.getElementById("iosInstallModeSmsLink");
  const installModeMailLink = document.getElementById("iosInstallModeMailLink");
  const installModeHandoffHint = document.getElementById("iosInstallModeHandoffHint");
  const planStarterButton = document.getElementById("iosHomeDockPlanStarterSampleButton");
  const planSubmitButton = document.getElementById("planFormSubmitButton");
  const planFormMessage = document.getElementById("planFormMessage");
  const recoveryCarryoverStatusLink = document.getElementById("iosOfflineFallbackCarryoverStatusLink");
  const diagnosticsCopyMethod = diagnosticsButton?.dataset.iosHomeDockDiagnosticsCopyMethod || "not-yet-copied";
  const diagnosticsCopyMethodUpdatedAt = diagnosticsButton?.dataset.iosHomeDockDiagnosticsCopyMethodUpdatedAt || "";
  const iosInstallJourneyTargetCue = document.documentElement.dataset.iosInstallJourneyTargetCue || "";
  const iosInstallJourneyTargetCueAt = document.documentElement.dataset.iosInstallJourneyTargetCueAt || "";
  const iosInstallJourneyTargetCueId = document.documentElement.dataset.iosInstallJourneyTargetCueId || "";
  const iosInstallJourneyTargetCueLabel = document.documentElement.dataset.iosInstallJourneyTargetCueLabel || "";
  const installJourneyStatusLink = document.querySelector("[data-ios-install-journey-status-link]");
  const iosInstallJourneyStatusLinkVisible = installJourneyStatusLink && !installJourneyStatusLink.hidden ? "true" : "false";
  const iosInstallJourneyStatusLinkHref = installJourneyStatusLink?.getAttribute("href") || "";
  const iosInstallJourneyStatusLinkLabel = installJourneyStatusLink?.textContent.trim() || "";
  const iosInstallJourneyStatusLinkState = installJourneyStatusLink?.dataset.state || "";
  const iosInstallJourneyStatusLinkNextStep = installJourneyStatusLink?.dataset.nextStep || "";
  const iosInstallJourneyStatusLinkNextStepNumber = installJourneyStatusLink?.dataset.nextStepNumber || "";
  const iosInstallJourneyStatusLinkNextStepTotal = installJourneyStatusLink?.dataset.nextStepTotal || "";
  const iosInstallJourneyStatusLinkNextTargetId = installJourneyStatusLink?.dataset.nextTargetId || "";
  const iosInstallJourneyStatusLinkNextTargetScope = installJourneyStatusLink?.dataset.nextTargetScope || "";
  const iosInstallJourneyStatusLinkNextTargetSamePageExists = installJourneyStatusLink?.dataset.nextTargetSamePageExists || "";
  const iosInstallJourneyStatusLinkNextTargetFallbackVisible = installJourneyStatusLink?.dataset.nextTargetFallbackVisible || "";
  const iosInstallJourneyStatusLinkNextTargetFallbackHref = installJourneyStatusLink?.dataset.nextTargetFallbackHref || "";
  const iosInstallJourneyStatusLinkNextTargetFallbackLabel = installJourneyStatusLink?.dataset.nextTargetFallbackLabel || "";
  const iosInstallJourneyStatusLinkNextTargetFallbackActive = installJourneyStatusLink?.dataset.nextTargetFallbackActive || "";
  const iosInstallJourneyStatusLinkNextTargetEffectiveHref = installJourneyStatusLink?.dataset.nextTargetEffectiveHref || "";
  const iosInstallJourneyStatusLinkNextTargetEffectiveLabel = installJourneyStatusLink?.dataset.nextTargetEffectiveLabel || "";
  const iosInstallJourneyStatusLinkFallbackClicked = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClicked || installJourneyStatusLink?.dataset.nextTargetFallbackClicked || "";
  const iosInstallJourneyStatusLinkFallbackClickedAt = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedAt || installJourneyStatusLink?.dataset.nextTargetFallbackClickedAt || "";
  const iosInstallJourneyStatusLinkFallbackClickedHref = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedHref || installJourneyStatusLink?.dataset.nextTargetFallbackClickedHref || "";
  const iosInstallJourneyStatusLinkFallbackClickedLabel = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedLabel || installJourneyStatusLink?.dataset.nextTargetFallbackClickedLabel || "";
  const iosInstallJourneyStatusLinkFallbackClickedOriginalTargetId = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedOriginalTargetId || installJourneyStatusLink?.dataset.nextTargetFallbackClickedOriginalTargetId || "";
  const iosInstallJourneyStatusLinkFallbackClickedStored = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedStored || "";
  const iosInstallJourneyStatusLinkFallbackCarryover = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryover || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverFresh = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverFresh || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverClickedAt = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverClickedAt || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverHref = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverHref || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverLabel = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverLabel || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverOriginalTargetId = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverOriginalTargetId || "";
  const iosInstallJourneyStatusLinkFallbackCarryoverAgeMs = document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverAgeMs || "";
  const iosHomeDockLastRouteVisible = lastRouteLink && !lastRouteLink.hidden ? "true" : "false";
  const iosHomeDockLastRouteHref = lastRouteLink?.dataset.iosHomeDockLastRouteHref || "";
  const iosHomeDockLastRouteLabel = lastRouteLink?.dataset.iosHomeDockLastRouteLabel || "";
  const iosHomeDockLastRouteUpdatedAt = lastRouteLink?.dataset.iosHomeDockLastRouteUpdatedAt || "";
  const iosHomeDockLastRouteReason = lastRouteLink?.dataset.iosHomeDockLastRouteReason || "";
  const iosHomeDockLastRouteBound = lastRouteLink?.dataset.iosHomeDockLastRouteBound || "";
  const iosHomeDockLastRouteClicked = lastRouteLink?.dataset.iosHomeDockLastRouteClicked || "";
  const iosHomeDockLastRouteClickedAt = lastRouteLink?.dataset.iosHomeDockLastRouteClickedAt || "";
  const iosHomeDockLastRouteClickedHref = lastRouteLink?.dataset.iosHomeDockLastRouteClickedHref || "";
  const iosHomeDockLastRouteClickedLabel = lastRouteLink?.dataset.iosHomeDockLastRouteClickedLabel || "";
  const iosHomeDockLastRouteClickedStatusFeedback = lastRouteLink?.dataset.iosHomeDockLastRouteClickedStatusFeedback || "";
  const iosHomeDockLastRouteClearVisible = lastRouteClearButton && !lastRouteClearButton.hidden ? "true" : "false";
  const iosHomeDockLastRouteClearBound = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearBound || "";
  const iosHomeDockLastRouteClearClicked = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearClicked || "";
  const iosHomeDockLastRouteClearClickedAt = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearClickedAt || "";
  const iosHomeDockLastRouteClearStatusFeedback = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearStatusFeedback || "";
  const iosHomeDockLastRouteClearNextRoute = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextRoute || "";
  const iosHomeDockLastRouteClearNextLabel = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextLabel || "";
  const iosHomeDockLastRouteClearNextTappable = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextTappable || "";
  const iosHomeDockLastRouteClearNextOpened = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextOpened || "";
  const iosHomeDockLastRouteClearNextOpenedAt = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextOpenedAt || "";
  const iosHomeDockLastRouteClearNextOpenedRoute = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextOpenedRoute || "";
  const iosHomeDockLastRouteClearNextOpenedLabel = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextOpenedLabel || "";
  const iosHomeDockLastRouteClearNextOpenedStatusFeedback = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextOpenedStatusFeedback || "";
  const iosHomeDockLastRouteClearNextPersisted = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextPersisted || "";
  const iosHomeDockLastRouteClearNextConsumed = lastRouteClearButton?.dataset.iosHomeDockLastRouteClearNextConsumed || "";
  const iosHomeDockDisplayModeVisible = displayModeStatus && !displayModeStatus.hidden ? "true" : "false";
  const iosHomeDockDisplayMode = displayModeStatus?.dataset.iosHomeDockDisplayMode || "";
  const iosHomeDockDisplayModeLabel = displayModeStatus?.textContent.trim() || "";
  const iosHomeDockDisplayModeTitle = displayModeStatus?.title || "";
  const iosInstallCardElement = document.getElementById("iosInstallCard");
  const iosStandaloneNextAction = document.getElementById("iosStandaloneNextAction");
  const iosStandaloneNextActionStatus = document.getElementById("iosStandaloneNextActionStatus");
  let iosStandaloneNextActionCarryover = {};
  try {
    iosStandaloneNextActionCarryover = JSON.parse(window.sessionStorage.getItem("travel-planner:ios-standalone-next-action:v1") || "{}");
  } catch {
    iosStandaloneNextActionCarryover = {};
  }
  const iosStandaloneNextActionCarryoverAction = iosStandaloneNextActionCarryover?.action || "";
  const iosStandaloneNextActionCarryoverClickedAt = iosStandaloneNextActionCarryover?.clickedAt || "";
  const iosStandaloneNextActionCarryoverRoute = iosStandaloneNextActionCarryover?.route || "";
  const iosStandaloneNextActionCarryoverLabel = iosStandaloneNextActionCarryover?.label || "";
  const iosStandaloneNextActionCarryoverFocusTarget = iosStandaloneNextActionCarryover?.focusTarget || "";
  const iosStandaloneNextActionCarryoverFocusApplied = iosStandaloneNextActionCarryover?.focusApplied || "";
  const iosStandaloneNextActionCarryoverReducedMotion = iosStandaloneNextActionCarryover?.reducedMotion || "";
  const iosStandaloneNextActionCarryoverStatusFeedback = iosStandaloneNextActionCarryover?.statusFeedback || "";
  const iosStandaloneNextActionCarryoverMaxAgeMs = 900000;
  const iosStandaloneNextActionCarryoverClickedTime = Date.parse(iosStandaloneNextActionCarryoverClickedAt || "");
  const iosStandaloneNextActionCarryoverAgeMs = Number.isFinite(iosStandaloneNextActionCarryoverClickedTime) ? String(Math.max(0, Date.now() - iosStandaloneNextActionCarryoverClickedTime)) : "";
  const iosStandaloneNextActionCarryoverAgeSeconds = iosStandaloneNextActionCarryoverAgeMs ? String(Math.floor(Number(iosStandaloneNextActionCarryoverAgeMs) / 1000)) : "";
  const iosStandaloneNextActionCarryoverStale = iosStandaloneNextActionCarryoverAgeMs ? (Number(iosStandaloneNextActionCarryoverAgeMs) > iosStandaloneNextActionCarryoverMaxAgeMs ? "true" : "false") : "";
  const iosStandaloneNextActionCarryoverFresh = iosStandaloneNextActionCarryoverStale === "false" ? "true" : "false";
  const useIosStandaloneNextActionCarryover = iosStandaloneNextActionCarryoverFresh === "true";
  const iosStandaloneNextActionCarryoverIgnoredReason = !iosStandaloneNextActionCarryoverAction
    ? "none"
    : iosStandaloneNextActionCarryoverStale === "true"
      ? "stale"
      : !iosStandaloneNextActionCarryoverClickedAt
        ? "missing-clicked-at"
        : useIosStandaloneNextActionCarryover
          ? ""
          : "unknown";
  const iosStandaloneNextActionCarryoverPromoted = useIosStandaloneNextActionCarryover ? "true" : "false";
  const iosStandaloneNextActionCarryoverIgnoredFeedback = iosStandaloneNextActionCarryoverIgnoredReason === "stale"
    ? "이전 Home Screen CTA 기록은 오래되어 현재 행동으로 사용하지 않습니다."
    : iosStandaloneNextActionCarryoverIgnoredReason === "missing-clicked-at"
      ? "이전 Home Screen CTA 기록에 클릭 시각이 없어 현재 행동으로 사용하지 않습니다."
      : iosStandaloneNextActionCarryoverIgnoredReason === "unknown"
        ? "이전 Home Screen CTA 기록을 현재 행동으로 사용할 수 없습니다."
        : "";
  let iosStandaloneNextActionCarryoverCleared = "false";
  let iosStandaloneNextActionCarryoverClearedReason = "";
  let iosStandaloneNextActionCarryoverClearedAt = "";
  let iosStandaloneNextActionCarryoverCleanupFailed = "false";
  let iosStandaloneNextActionCarryoverCleanupFailedReason = "";
  let iosStandaloneNextActionCarryoverCleanupFailedAt = "";
  if (iosStandaloneNextActionCarryoverIgnoredReason === "stale") {
    try {
      window.sessionStorage.removeItem("travel-planner:ios-standalone-next-action:v1");
      iosStandaloneNextActionCarryoverCleared = "true";
      iosStandaloneNextActionCarryoverClearedReason = "stale";
      iosStandaloneNextActionCarryoverClearedAt = new Date().toISOString();
    } catch {
      iosStandaloneNextActionCarryoverCleanupFailed = "true";
      iosStandaloneNextActionCarryoverCleanupFailedReason = "storage-error";
      iosStandaloneNextActionCarryoverCleanupFailedAt = new Date().toISOString();
    }
  }
  const iosStandaloneNextActionVisible = iosStandaloneNextAction && !iosStandaloneNextAction.hidden ? "true" : "false";
  const iosStandaloneNextActionDatasetVisible = iosStandaloneNextAction?.dataset.visible || iosInstallCardElement?.dataset.standaloneNextActionVisible || "";
  const iosStandaloneNextActionClicked = iosInstallCardElement?.dataset.standaloneNextActionClicked || iosStandaloneNextAction?.dataset.clicked || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? "true" : "");
  const iosStandaloneNextActionClickedAt = iosInstallCardElement?.dataset.standaloneNextActionClickedAt || iosStandaloneNextAction?.dataset.clickedAt || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverClickedAt : "");
  const iosStandaloneNextActionClickedRoute = iosInstallCardElement?.dataset.standaloneNextActionClickedRoute || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverRoute : "");
  const iosStandaloneNextActionClickedLabel = iosInstallCardElement?.dataset.standaloneNextActionClickedLabel || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverLabel : "");
  const iosStandaloneNextActionFocusTarget = iosInstallCardElement?.dataset.standaloneNextActionFocusTarget || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverFocusTarget : "");
  const iosStandaloneNextActionFocusApplied = iosInstallCardElement?.dataset.standaloneNextActionFocusApplied || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverFocusApplied : "");
  const iosStandaloneNextActionReducedMotion = iosInstallCardElement?.dataset.standaloneNextActionReducedMotion || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverReducedMotion : "");
  const iosStandaloneNextActionStatusFeedback = iosStandaloneNextActionStatus?.textContent.trim() || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "new-plan" ? iosStandaloneNextActionCarryoverStatusFeedback : "");
  const iosStandaloneSuccessCheckLines = iosStandaloneSuccessCheckEvidenceLines();
  const iosStandaloneCompletionStatusClicked = iosInstallCardElement?.dataset.standaloneCompletionStatusClicked || iosStandaloneNextAction?.dataset.completionStatusClicked || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "completion-status" ? "true" : "");
  const iosStandaloneCompletionStatusClickedAt = iosInstallCardElement?.dataset.standaloneCompletionStatusClickedAt || iosStandaloneNextAction?.dataset.completionStatusClickedAt || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "completion-status" ? iosStandaloneNextActionCarryoverClickedAt : "");
  const iosStandaloneCompletionStatusClickedRoute = iosInstallCardElement?.dataset.standaloneCompletionStatusClickedRoute || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "completion-status" ? iosStandaloneNextActionCarryoverRoute : "");
  const iosStandaloneCompletionStatusClickedLabel = iosInstallCardElement?.dataset.standaloneCompletionStatusClickedLabel || (useIosStandaloneNextActionCarryover && iosStandaloneNextActionCarryoverAction === "completion-status" ? iosStandaloneNextActionCarryoverLabel : "");
  const iosStandaloneSubmitDock = document.getElementById("iosStandaloneSubmitDock");
  const iosStandaloneSubmitDockButton = document.getElementById("iosStandaloneSubmitDockButton");
  const iosStandaloneSubmitDockStatus = document.getElementById("iosStandaloneSubmitDockStatus");
  const iosStandaloneSubmitDockVisible = iosStandaloneSubmitDock && !iosStandaloneSubmitDock.hidden ? "true" : "false";
  const iosStandaloneSubmitDockState = iosStandaloneSubmitDock?.dataset.state || "";
  const iosStandaloneSubmitDockButtonLabel = iosStandaloneSubmitDockButton?.textContent.trim() || "";
  const iosStandaloneSubmitDockClicked = iosStandaloneSubmitDock?.dataset.clicked || "";
  const iosStandaloneSubmitDockClickedAt = iosStandaloneSubmitDock?.dataset.clickedAt || "";
  const iosStandaloneSubmitDockClickResult = iosStandaloneSubmitDock?.dataset.clickResult || "";
  const iosStandaloneSubmitDockStatusFeedback = iosStandaloneSubmitDockStatus?.textContent.trim() || "";
  const iosStandaloneSubmitDockObserved = iosStandaloneSubmitDock?.dataset.observed || "";
  const iosStandaloneSubmitDockSyncedAt = iosStandaloneSubmitDock?.dataset.syncedAt || "";
  const iosStandaloneSubmitDockSubmitBusy = iosStandaloneSubmitDock?.dataset.submitBusy || "";
  const iosStandaloneSubmitDockSubmitDisabled = iosStandaloneSubmitDock?.dataset.submitDisabled || "";
  const iosStandaloneSubmitDockSubmitStarted = iosStandaloneSubmitDock?.dataset.submitStarted || "";
  const iosStandaloneSubmitDockSubmitStartedAt = iosStandaloneSubmitDock?.dataset.submitStartedAt || "";
  const iosStandaloneSubmitDockSubmitSource = iosStandaloneSubmitDock?.dataset.submitSource || "";
  const iosStandaloneSubmitDockSubmitStatusFeedback = iosStandaloneSubmitDock?.dataset.submitStatusFeedback || "";
  const iosStandaloneSubmitDockSubmitPending = iosStandaloneSubmitDock?.dataset.submitPending || "";
  const iosStandaloneSubmitDockSubmitPendingAt = iosStandaloneSubmitDock?.dataset.submitPendingAt || "";
  const iosStandaloneSubmitDockSubmitPendingSource = iosStandaloneSubmitDock?.dataset.submitPendingSource || "";
  const iosStandaloneSubmitDockSubmitFinished = iosStandaloneSubmitDock?.dataset.submitFinished || "";
  const iosStandaloneSubmitDockSubmitFinishedAt = iosStandaloneSubmitDock?.dataset.submitFinishedAt || "";
  const iosStandaloneSubmitDockSubmitFinishedResult = iosStandaloneSubmitDock?.dataset.submitFinishedResult || "";
  const iosStandaloneSubmitDockSubmitFinishedSource = iosStandaloneSubmitDock?.dataset.submitFinishedSource || "";
  const iosStandaloneSubmitDockSubmitResultObserved = iosStandaloneSubmitDock?.dataset.submitResultObserved || "";
  const iosStandaloneSubmitDockSubmitResultObserverAttrs = iosStandaloneSubmitDock?.dataset.submitResultObserverAttrs || "";
  const iosStandaloneSubmitDockKeyboardHidden = iosStandaloneSubmitDock?.dataset.keyboardHidden || "";
  const iosStandaloneSubmitDockKeyboardHiddenAt = iosStandaloneSubmitDock?.dataset.keyboardHiddenAt || "";
  const iosStandaloneSubmitDockKeyboardRestoredAt = iosStandaloneSubmitDock?.dataset.keyboardRestoredAt || "";
  const iosStandaloneSubmitDockKeyboardFocusName = iosStandaloneSubmitDock?.dataset.keyboardFocusName || "";
  const iosStandaloneSubmitDockInvalid = iosStandaloneSubmitDock?.dataset.invalid || "";
  const iosStandaloneSubmitDockInvalidAt = iosStandaloneSubmitDock?.dataset.invalidAt || "";
  const iosStandaloneSubmitDockInvalidFieldName = iosStandaloneSubmitDock?.dataset.invalidFieldName || "";
  const iosStandaloneSubmitDockInvalidSource = iosStandaloneSubmitDock?.dataset.invalidSource || "";
  const iosStandaloneSubmitDockInvalidFeedback = iosStandaloneSubmitDock?.dataset.invalidFeedback || "";
  const iosStandaloneSubmitDockInvalidFocusTarget = iosStandaloneSubmitDock?.dataset.invalidFocusTarget || "";
  const iosStandaloneSubmitDockInvalidFocusApplied = iosStandaloneSubmitDock?.dataset.invalidFocusApplied || "";
  const iosStandaloneSubmitDockInvalidFocusedAt = iosStandaloneSubmitDock?.dataset.invalidFocusedAt || "";
  const iosStandaloneSubmitDockInvalidReducedMotion = iosStandaloneSubmitDock?.dataset.invalidReducedMotion || "";
const iosStandaloneSubmitDockInvalidInlineVisible = iosStandaloneSubmitDock?.dataset.invalidInlineVisible || "";
const iosStandaloneSubmitDockInvalidInlineFieldName = iosStandaloneSubmitDock?.dataset.invalidInlineFieldName || "";
const iosStandaloneSubmitDockInvalidInlineFeedback = iosStandaloneSubmitDock?.dataset.invalidInlineFeedback || "";
const iosStandaloneSubmitDockInvalidInlineShownAt = iosStandaloneSubmitDock?.dataset.invalidInlineShownAt || "";
const iosStandaloneSubmitDockInvalidInlineClearedAt = iosStandaloneSubmitDock?.dataset.invalidInlineClearedAt || "";
  const iosStandaloneSubmitDockInvalidCleared = iosStandaloneSubmitDock?.dataset.invalidCleared || "";
  const iosStandaloneSubmitDockInvalidClearedAt = iosStandaloneSubmitDock?.dataset.invalidClearedAt || "";
  const iosStandaloneSubmitDockInvalidClearSource = iosStandaloneSubmitDock?.dataset.invalidClearSource || "";
  const iosStandaloneSubmitDockInvalidRemaining = iosStandaloneSubmitDock?.dataset.invalidRemaining || "";
  const iosStandaloneSubmitDockInvalidRemainingFieldName = iosStandaloneSubmitDock?.dataset.invalidRemainingFieldName || "";
  const iosStandaloneSubmitDockInvalidRecoveryNextAction = iosStandaloneSubmitDock?.dataset.invalidRecoveryNextAction || "";
  const iosStandaloneSubmitDockInvalidRecoveryReadyAt = iosStandaloneSubmitDock?.dataset.invalidRecoveryReadyAt || "";
  const iosInstallModeCopyVisible = installModeCopyButton && !installModeCopyButton.hidden ? "true" : "false";
  const iosInstallModeCopyBound = installModeCopyButton?.dataset.iosInstallModeCopyBound || "";
  const iosInstallModeCopied = installModeCopyButton?.dataset.iosInstallModeCopied || "";
  const iosInstallModeCopiedAt = installModeCopyButton?.dataset.iosInstallModeCopiedAt || "";
  const iosInstallModeCopiedState = installModeCopyButton?.dataset.iosInstallModeCopiedState || "";
  const iosInstallModeCopyMethod = installModeCopyButton?.dataset.iosInstallModeCopyMethod || "";
  const iosInstallModeCopyHintDescribedBy = installModeCopyButton?.dataset.iosInstallModeHandoffHintDescribedBy || "";
  const iosInstallModeShareVisible = installModeShareButton && !installModeShareButton.hidden ? "true" : "false";
  const iosInstallModeShareBound = installModeShareButton?.dataset.iosInstallModeShareBound || "";
  const iosInstallModeShared = installModeShareButton?.dataset.iosInstallModeShared || "";
  const iosInstallModeSharedAt = installModeShareButton?.dataset.iosInstallModeSharedAt || "";
  const iosInstallModeSharedState = installModeShareButton?.dataset.iosInstallModeSharedState || "";
  const iosInstallModeShareMethod = installModeShareButton?.dataset.iosInstallModeShareMethod || "";
  const iosInstallModeShareHintDescribedBy = installModeShareButton?.dataset.iosInstallModeHandoffHintDescribedBy || "";
  const iosInstallModeSmsVisible = installModeSmsLink && !installModeSmsLink.hidden ? "true" : "false";
  const iosInstallModeSmsChannel = installModeSmsLink?.dataset.iosInstallModeHandoffChannel || "";
  const iosInstallModeSmsState = installModeSmsLink?.dataset.iosInstallModeHandoffState || "";
  const iosInstallModeSmsDisplayMode = installModeSmsLink?.dataset.iosInstallModeHandoffDisplayMode || "";
  const iosInstallModeSmsPayloadKind = installModeSmsLink?.dataset.iosInstallModeHandoffPayloadKind || "";
  const iosInstallModeSmsLabel = installModeSmsLink?.dataset.iosInstallModeHandoffLabel || "";
  const iosInstallModeSmsClicked = installModeSmsLink?.dataset.iosInstallModeHandoffClicked || "";
  const iosInstallModeSmsClickedAt = installModeSmsLink?.dataset.iosInstallModeHandoffClickedAt || "";
  const iosInstallModeSmsClickedPayloadKind = installModeSmsLink?.dataset.iosInstallModeHandoffClickedPayloadKind || "";
  const iosInstallModeSmsHintDescribedBy = installModeSmsLink?.dataset.iosInstallModeHandoffHintDescribedBy || "";
  const iosInstallModeMailVisible = installModeMailLink && !installModeMailLink.hidden ? "true" : "false";
  const iosInstallModeMailChannel = installModeMailLink?.dataset.iosInstallModeHandoffChannel || "";
  const iosInstallModeMailState = installModeMailLink?.dataset.iosInstallModeHandoffState || "";
  const iosInstallModeMailDisplayMode = installModeMailLink?.dataset.iosInstallModeHandoffDisplayMode || "";
  const iosInstallModeMailPayloadKind = installModeMailLink?.dataset.iosInstallModeHandoffPayloadKind || "";
  const iosInstallModeMailLabel = installModeMailLink?.dataset.iosInstallModeHandoffLabel || "";
  const iosInstallModeMailClicked = installModeMailLink?.dataset.iosInstallModeHandoffClicked || "";
  const iosInstallModeMailClickedAt = installModeMailLink?.dataset.iosInstallModeHandoffClickedAt || "";
  const iosInstallModeMailClickedPayloadKind = installModeMailLink?.dataset.iosInstallModeHandoffClickedPayloadKind || "";
  const iosInstallModeMailHintDescribedBy = installModeMailLink?.dataset.iosInstallModeHandoffHintDescribedBy || "";
  const iosInstallModeHandoffHintVisible = installModeHandoffHint?.dataset.iosInstallModeHandoffHintVisible || "";
  const iosInstallModeHandoffHintSmsRole = installModeHandoffHint?.dataset.iosInstallModeHandoffHintSmsRole || "";
  const iosInstallModeHandoffHintMailRole = installModeHandoffHint?.dataset.iosInstallModeHandoffHintMailRole || "";
  const iosInstallModeHandoffHintPayload = installModeHandoffHint?.dataset.iosInstallModeHandoffHintPayload || "";
  const iosHomeDockPlanStarterLinkVisible = planStarterLink?.dataset.iosHomeDockPlanStarterLinkVisible || "";
  const iosHomeDockPlanStarterLinkRoute = planStarterLink?.dataset.iosHomeDockPlanStarterLinkRoute || "";
  const iosHomeDockPlanStarterLinkLabel = planStarterLink?.dataset.iosHomeDockPlanStarterLinkLabel || "";
  const iosHomeDockPlanStarterLinkState = planStarterLink?.dataset.iosHomeDockPlanStarterLinkState || "";
  const iosHomeDockPlanStarterLinkBound = planStarterLink?.dataset.iosHomeDockPlanStarterLinkBound || "";
  const iosHomeDockPlanStarterLinkClicked = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClicked || "";
  const iosHomeDockPlanStarterLinkClickedAt = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClickedAt || "";
  const iosHomeDockPlanStarterLinkClickedRoute = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClickedRoute || "";
  const iosHomeDockPlanStarterLinkClickedLabel = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClickedLabel || "";
  const iosHomeDockPlanStarterLinkClickedState = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClickedState || "";
  const iosHomeDockPlanStarterLinkClickedStatusFeedback = planStarterLink?.dataset.iosHomeDockPlanStarterLinkClickedStatusFeedback || "";
  const iosHomeDockPlanStarterSampleButtonVisible = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonVisible || "";
  const iosHomeDockPlanStarterSampleButtonLabel = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonLabel || "";
  const iosHomeDockPlanStarterSampleButtonState = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonState || "";
  const iosHomeDockPlanStarterSampleButtonClicked = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonClicked || "";
  const iosHomeDockPlanStarterSampleButtonClickedAt = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonClickedAt || "";
  const iosHomeDockPlanStarterSampleButtonClickedMode = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonClickedMode || "";
  const iosHomeDockPlanStarterSampleButtonClickedStatusFeedback = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonClickedStatusFeedback || "";
  const iosHomeDockPlanStarterSampleButtonFocusTarget = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFocusTarget || "";
  const iosHomeDockPlanStarterSampleButtonFocusScheduled = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFocusScheduled || "";
  const iosHomeDockPlanStarterSampleButtonFocusApplied = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFocusApplied || "";
  const iosHomeDockPlanStarterSampleButtonFocusedAt = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFocusedAt || "";
  const iosHomeDockPlanStarterSampleButtonHighlightApplied = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonHighlightApplied || "";
  const iosHomeDockPlanStarterSampleButtonFollowupHintVisible = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintVisible || "";
  const iosHomeDockPlanStarterSampleButtonFollowupHintText = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintText || "";
  const iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt = planStarterButton?.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt || "";
  const iosHomeDockPlanSubmitButtonVisible = planSubmitButton ? "true" : "";
  const iosHomeDockPlanSubmitButtonLabel = planSubmitButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitButtonTitle = planSubmitButton?.getAttribute("title") || "";
  const iosHomeDockPlanSubmitButtonAccessibleLabel = planSubmitButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitButtonDescribedBy = planSubmitButton?.getAttribute("aria-describedby") || "";
  const iosHomeDockPlanSubmitButtonBound = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonBound || "";
  const iosHomeDockPlanSubmitButtonDisabled = planSubmitButton ? String(planSubmitButton.disabled) : "";
  const iosHomeDockPlanSubmitButtonAriaBusy = planSubmitButton?.getAttribute("aria-busy") || "";
  const iosHomeDockPlanSubmitButtonBusy = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonBusy || "";
  const iosHomeDockPlanSubmitButtonClicked = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonClicked || "";
  const iosHomeDockPlanSubmitButtonClickedAt = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonClickedAt || "";
  const iosHomeDockPlanSubmitButtonClickedStatusFeedback = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitButtonSubmitAttempted = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitAttempted || "";
  const iosHomeDockPlanSubmitButtonSubmitAttemptedAt = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitAttemptedAt || "";
  const iosHomeDockPlanSubmitButtonSubmitResult = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitResult || "";
  const iosHomeDockPlanSubmitButtonSubmitResultAt = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitResultAt || "";
  const iosHomeDockPlanSubmitButtonSubmitFailureKind = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitFailureKind || "";
  const iosHomeDockPlanSubmitButtonSubmitStatusFeedback = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonSubmitStatusFeedback || "";
  const iosHomeDockPlanSubmitButtonRedirectPlanned = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonRedirectPlanned || "false";
  const iosHomeDockPlanSubmitButtonRedirectRoute = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonRedirectRoute || "";
  const iosHomeDockPlanSubmitButtonRedirectPlannedAt = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonRedirectPlannedAt || "";
  const iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible || "false";
  const iosHomeDockPlanSubmitButtonRedirectFallbackRoute = planSubmitButton?.dataset.iosHomeDockPlanSubmitButtonRedirectFallbackRoute || "";
  let iosHomeDockPlanSubmitRedirectSession = null;
  try {
    const redirectSessionJson = sessionStorage.getItem("travel-planner:ios-first-plan-submit-redirect:v1");
    iosHomeDockPlanSubmitRedirectSession = redirectSessionJson ? JSON.parse(redirectSessionJson) : null;
  } catch {
    iosHomeDockPlanSubmitRedirectSession = null;
  }
  const iosHomeDockPlanSubmitRedirectSessionSaved = iosHomeDockPlanSubmitRedirectSession ? "true" : "false";
  const iosHomeDockPlanSubmitRedirectSessionRoute = iosHomeDockPlanSubmitRedirectSession?.route === "/plans/:id" ? "/plans/:id" : "";
  const iosHomeDockPlanSubmitRedirectSessionPlannedAt = iosHomeDockPlanSubmitRedirectSession?.plannedAt || "";
  const iosHomeDockPlanSubmitRedirectSessionSource = iosHomeDockPlanSubmitRedirectSession?.source === "first-plan-submit" ? "first-plan-submit" : "";
  const iosHomeDockPlanSubmitRedirectArrivalVisible = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalVisible || "false";
  const iosHomeDockPlanSubmitRedirectArrivalRoute = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalRoute || "";
  const iosHomeDockPlanSubmitRedirectArrivalSource = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalSource || "";
  const iosHomeDockPlanSubmitRedirectArrivalPlannedAt = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalPlannedAt || "";
  const iosHomeDockPlanSubmitRedirectArrivalArrivedAt = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalArrivedAt || "";
  const iosHomeDockPlanSubmitRedirectArrivalDismissed = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissed || "false";
  const iosHomeDockPlanSubmitRedirectArrivalDismissedAt = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissedAt || "";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButton = document.getElementById("iosFirstPlanRedirectArrivalDismissButton");
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible = iosHomeDockPlanSubmitRedirectArrivalDismissButton ? "true" : "false";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel = iosHomeDockPlanSubmitRedirectArrivalDismissButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel = iosHomeDockPlanSubmitRedirectArrivalDismissButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked || "false";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt || "";
  const iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLink = document.getElementById("iosFirstPlanRedirectArrivalStatusLink");
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible = iosHomeDockPlanSubmitRedirectArrivalStatusLink ? "true" : "false";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute = iosHomeDockPlanSubmitRedirectArrivalStatusLink ? new URL(iosHomeDockPlanSubmitRedirectArrivalStatusLink.getAttribute("href") || "", window.location.href).pathname : "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel = iosHomeDockPlanSubmitRedirectArrivalStatusLink?.textContent.trim() || "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel = iosHomeDockPlanSubmitRedirectArrivalStatusLink?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked || "false";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt || "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute || "";
  const iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalVisible = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalVisible || "false";
  const iosHomeDockPlanSubmitCompletionStatusArrivalRoute = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalRoute || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalSource = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalSource || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissed = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissed || "false";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButton = document.getElementById("iosFirstPlanCompletionStatusArrivalDismissButton");
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible = iosHomeDockPlanSubmitCompletionStatusArrivalDismissButton ? "true" : "false";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel = iosHomeDockPlanSubmitCompletionStatusArrivalDismissButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel = iosHomeDockPlanSubmitCompletionStatusArrivalDismissButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked || "false";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink = document.getElementById("iosFirstPlanCompletionStatusArrivalHomeLink");
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible = iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink ? "true" : "false";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute = iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink ? new URL(iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink.getAttribute("href") || "", window.location.href).pathname : "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel = iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink?.textContent.trim() || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel = iosHomeDockPlanSubmitCompletionStatusArrivalHomeLink?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked || (iosHomeDockPlanSubmitRedirectSession?.completionStatusHomeLinkClicked === true ? "true" : "false");
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt || iosHomeDockPlanSubmitRedirectSession?.completionStatusHomeLinkClickedAt || "";
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute || (iosHomeDockPlanSubmitRedirectSession?.completionStatusHomeLinkClickedRoute === "/" ? "/" : "");
  const iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback || iosHomeDockPlanSubmitRedirectSession?.completionStatusHomeLinkClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalVisible = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalVisible || "false";
  const iosHomeDockPlanSubmitHomeReturnArrivalRoute = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalRoute || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalSource = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalSource || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissed = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissed || "false";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButton = document.getElementById("iosFirstPlanHomeReturnArrivalDismissButton");
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible = iosHomeDockPlanSubmitHomeReturnArrivalDismissButton ? "true" : "false";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel = iosHomeDockPlanSubmitHomeReturnArrivalDismissButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel = iosHomeDockPlanSubmitHomeReturnArrivalDismissButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked || "false";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt || "";
  const iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompleted = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted || (iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompleted === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopCompletedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedAt || iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletedSource = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedSource || (iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletedSource === "first-plan-submit" ? "first-plan-submit" : "");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadge = document.getElementById("iosFirstUseLoopCompletionBadge");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible = iosHomeDockPlanSubmitFirstUseLoopCompletionBadge ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel = iosHomeDockPlanSubmitFirstUseLoopCompletionBadge?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle = iosHomeDockPlanSubmitFirstUseLoopCompletionBadge?.getAttribute("title") || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel = iosHomeDockPlanSubmitFirstUseLoopCompletionBadge?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden || (iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHidden === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt || iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHiddenAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason || (iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHiddenReason === "user-acknowledged" ? "user-acknowledged" : "");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButton = document.getElementById("iosFirstUseLoopCompletionBadgeHideButton");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible = iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButton ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel = iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel = iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked || (iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHideButtonClicked === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt || iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHideButtonClickedAt || "";
  let iosHomeDockPlanSubmitFirstUseLoopResetSession = null;
  try {
    const resetSessionJson = sessionStorage.getItem("travel-planner:ios-first-plan-submit-reset:v1");
    iosHomeDockPlanSubmitFirstUseLoopResetSession = resetSessionJson ? JSON.parse(resetSessionJson) : null;
  } catch {
    iosHomeDockPlanSubmitFirstUseLoopResetSession = null;
  }
  const iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback || iosHomeDockPlanSubmitRedirectSession?.firstUseLoopCompletionBadgeHideButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetButton = document.getElementById("iosFirstUseLoopCompletionResetButton");
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible = iosHomeDockPlanSubmitFirstUseLoopResetButton ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel = iosHomeDockPlanSubmitFirstUseLoopResetButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel = iosHomeDockPlanSubmitFirstUseLoopResetButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.clicked === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.clickedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.reason === "user-requested" ? "user-requested" : "");
  const iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback || iosHomeDockPlanSubmitFirstUseLoopResetSession?.statusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetBanner = document.getElementById("iosFirstUseLoopResetConfirmationBanner");
  const iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible = iosHomeDockPlanSubmitFirstUseLoopResetBanner ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel = iosHomeDockPlanSubmitFirstUseLoopResetBanner?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetBannerReason = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetBannerReason || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.reason === "user-requested" ? "user-requested" : "");
  const iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.clickedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLink = document.getElementById("iosFirstUseLoopResetRestartLink");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible = iosHomeDockPlanSubmitFirstUseLoopResetRestartLink ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute = iosHomeDockPlanSubmitFirstUseLoopResetRestartLink ? `${new URL(iosHomeDockPlanSubmitFirstUseLoopResetRestartLink.getAttribute("href") || "", window.location.href).pathname}${new URL(iosHomeDockPlanSubmitFirstUseLoopResetRestartLink.getAttribute("href") || "", window.location.href).hash}` : "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel = iosHomeDockPlanSubmitFirstUseLoopResetRestartLink?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel = iosHomeDockPlanSubmitFirstUseLoopResetRestartLink?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartLinkClicked === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartLinkClickedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartLinkClickedRoute === "/#planForm" ? "/#planForm" : "");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartLinkClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible || "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissed === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissReason === "user-acknowledged" ? "user-acknowledged" : "");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButton = document.getElementById("iosFirstUseLoopResetRestartArrivalDismissButton");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible = iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButton ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel = iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButton?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel = iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButton?.getAttribute("aria-label") || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissButtonClicked === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissButtonClickedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalDismissButtonClickedStatusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled || "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied || "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalInputStarted === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalInputStartedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalFocusCueCleared === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartArrivalInputStartedStatusFeedback || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBanner = document.getElementById("iosFirstUseLoopResetInputStartedBanner");
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible = iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBanner ? "true" : "false";
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel = iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBanner?.querySelector("[data-ios-first-use-loop-reset-input-started-banner-message]")?.textContent.trim() || iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBanner?.textContent.trim() || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartInputStartedBannerShownAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed || (iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartInputStartedBannerDismissed === true ? "true" : "false");
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartInputStartedBannerDismissedAt || "";
  const iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel = document.documentElement.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel || iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBanner?.querySelector("[data-ios-first-use-loop-reset-input-started-banner-dismiss]")?.textContent.trim() || iosHomeDockPlanSubmitFirstUseLoopResetSession?.restartInputStartedBannerDismissButtonLabel || "";
  const iosHomeDockPlanSubmitMessageVisible = planFormMessage ? "true" : "false";
  const iosHomeDockPlanSubmitMessageId = planFormMessage?.id || "";
  const iosHomeDockPlanSubmitMessageRole = planFormMessage?.getAttribute("role") || "";
  const iosHomeDockPlanSubmitMessageAriaLive = planFormMessage?.getAttribute("aria-live") || "";
  const iosHomeDockPlanSubmitMessageAriaAtomic = planFormMessage?.getAttribute("aria-atomic") || "";
  const iosOfflineFallback = document.documentElement.dataset.iosOfflineFallback || "none";
  const iosOfflineFallbackPath = document.documentElement.dataset.iosOfflineFallbackPath || "";
  const iosOfflineFallbackSourceLabel = document.documentElement.dataset.iosOfflineFallbackSourceLabel || "";
  const iosOfflineFallbackStatusSourceLabel = installStatus?.dataset.iosOfflineFallbackSourceLabel || "";
  const iosOfflineFallbackStatusRecoveryActionLabel = installStatus?.dataset.iosOfflineFallbackRecoveryActionLabel || "";
  const iosOfflineFallbackSourceUrl = document.documentElement.dataset.iosOfflineFallbackSourceUrl || "";
  const iosOfflineFallbackRecoveryTarget = document.documentElement.dataset.iosOfflineFallbackRecoveryTarget || "";
  const iosOfflineFallbackRecoveryTargetId = document.documentElement.dataset.iosOfflineFallbackRecoveryTargetId || "";
  const iosOfflineFallbackRecoveryTargetLabel = document.documentElement.dataset.iosOfflineFallbackRecoveryTargetLabel || "";
  const iosOfflineFallbackRecoveryAction = document.documentElement.dataset.iosOfflineFallbackRecoveryAction || "";
  const iosOfflineFallbackRecoveryActionLabel = document.documentElement.dataset.iosOfflineFallbackRecoveryActionLabel || "";
  const iosOfflineFallbackCompletionChecklist = document.documentElement.dataset.iosOfflineFallbackCompletionChecklist || "";
  const iosOfflineFallbackCompletionChecklistLabel = document.documentElement.dataset.iosOfflineFallbackCompletionChecklistLabel || "";
  const iosOfflineFallbackCompletionHint = document.documentElement.dataset.iosOfflineFallbackCompletionHint || "";
  const iosOfflineFallbackVisibleStatusIncludesCompletionHint = document.documentElement.dataset.iosOfflineFallbackVisibleStatusIncludesCompletionHint || "";
  const iosOfflineFallbackStatusCompletionHint = installStatus?.dataset.iosOfflineFallbackCompletionHint || "";
  const iosOfflineFallbackStatusCompletionHintVisible = installStatus?.dataset.iosOfflineFallbackCompletionHintVisible || "";
  const iosOfflineFallbackStatusAccessibleLabel = installStatus?.dataset.iosOfflineFallbackAccessibleLabel || "";
  const iosOfflineFallbackStatusAccessibleLabelVisible = installStatus?.dataset.iosOfflineFallbackAccessibleLabelVisible || "";
  const iosOfflineFallbackStatusRole = installStatus?.dataset.iosOfflineFallbackStatusRole || "";
  const iosOfflineFallbackStatusAriaLive = installStatus?.dataset.iosOfflineFallbackStatusAriaLive || "";
  const iosOfflineFallbackStatusAriaAtomic = installStatus?.dataset.iosOfflineFallbackStatusAriaAtomic || "";
  const iosOfflineFallbackStatusDescribedBy = installStatus?.dataset.iosOfflineFallbackStatusDescribedBy || "";
  const iosOfflineFallbackRecoveryLinkVisible = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkVisible || "";
  const iosOfflineFallbackRecoveryLinkTarget = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkTarget || "";
  const iosOfflineFallbackRecoveryLinkLabel = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkLabel || "";
  const iosOfflineFallbackRecoveryLinkClass = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClass || "";
  const iosOfflineFallbackRecoveryLinkAction = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkAction || "";
  const iosOfflineFallbackRecoveryLinkBound = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkBound || "";
  const iosOfflineFallbackRecoveryLinkClicked = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClicked || "";
  const iosOfflineFallbackRecoveryLinkClickedAt = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClickedAt || "";
  const iosOfflineFallbackRecoveryLinkStatusFeedback = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkStatusFeedback || "";
  const iosOfflineFallbackRecoveryLinkClickedLabel = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClickedLabel || "";
  const iosOfflineFallbackRecoveryLinkClickedClass = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClickedClass || "";
  const iosOfflineFallbackRecoveryLinkClickedTitle = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClickedTitle || "";
  const iosOfflineFallbackRecoveryLinkClickedAccessibleLabel = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkClickedAccessibleLabel || "";
  const iosOfflineFallbackRecoveryLinkCompletionChecklist = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkCompletionChecklist || "";
  const iosOfflineFallbackRecoveryLinkCompletionChecklistLabel = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkCompletionChecklistLabel || "";
  const iosOfflineFallbackRecoveryLinkCompletionHint = recoveryLink?.dataset.iosOfflineFallbackRecoveryLinkCompletionHint || "";
  const iosOfflineFallbackRecoveryChecklistVisible = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistVisible || "";
  const iosOfflineFallbackRecoveryChecklistItems = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistItems || "";
  const iosOfflineFallbackRecoveryChecklistKeys = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistKeys || "";
  const iosOfflineFallbackRecoveryChecklistRoutes = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistRoutes || "";
  const iosOfflineFallbackRecoveryChecklistLabel = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLabel || "";
  const iosOfflineFallbackRecoveryChecklistLinksVisible = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinksVisible || "";
  const iosOfflineFallbackRecoveryChecklistLinkLabels = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkLabels || "";
  const iosOfflineFallbackRecoveryChecklistLinkRoutes = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkRoutes || "";
  const iosOfflineFallbackRecoveryChecklistLinkClass = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClass || "";
  const iosOfflineFallbackRecoveryChecklistLinkClicked = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClicked || "";
  const iosOfflineFallbackRecoveryChecklistLinkClickedKey = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedKey || "";
  const iosOfflineFallbackRecoveryChecklistLinkClickedRoute = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedRoute || "";
  const iosOfflineFallbackRecoveryChecklistLinkClickedLabel = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedLabel || "";
  const iosOfflineFallbackRecoveryChecklistLinkClickedAt = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedAt || "";
  const iosOfflineFallbackRecoveryChecklistLinkClickedClass = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedClass || "";
  const iosOfflineFallbackRecoveryChecklistLinkStatusFeedback = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistLinkStatusFeedback || "";
  const fallbackRecoveryChecklistSessionStorageKey = "travel-planner:ios-offline-fallback-recovery-checklist-click:v1";
  let fallbackRecoveryChecklistStoredSessionValue = "";
  try {
    fallbackRecoveryChecklistStoredSessionValue = window.sessionStorage?.getItem(fallbackRecoveryChecklistSessionStorageKey) || "";
  } catch {
    fallbackRecoveryChecklistStoredSessionValue = "";
  }
  const iosOfflineFallbackRecoveryChecklistSessionSaved = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistSessionSaved || (fallbackRecoveryChecklistStoredSessionValue ? "true" : "");
  const iosOfflineFallbackRecoveryChecklistSessionKey = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistSessionKey || (fallbackRecoveryChecklistStoredSessionValue ? fallbackRecoveryChecklistSessionStorageKey : "");
  const iosOfflineFallbackRecoveryChecklistSessionValue = recoveryChecklist?.dataset.iosOfflineFallbackRecoveryChecklistSessionValue || fallbackRecoveryChecklistStoredSessionValue;
  let iosOfflineFallbackRecoveryChecklistSessionData = {};
  try {
    iosOfflineFallbackRecoveryChecklistSessionData = iosOfflineFallbackRecoveryChecklistSessionValue ? JSON.parse(iosOfflineFallbackRecoveryChecklistSessionValue) : {};
  } catch {
    iosOfflineFallbackRecoveryChecklistSessionData = {};
  }
  const iosOfflineFallbackRecoveryChecklistSessionClickedKey = iosOfflineFallbackRecoveryChecklistSessionData.key || "";
  const iosOfflineFallbackRecoveryChecklistSessionClickedRoute = iosOfflineFallbackRecoveryChecklistSessionData.route || "";
  const iosOfflineFallbackRecoveryChecklistSessionClickedLabel = iosOfflineFallbackRecoveryChecklistSessionData.label || "";
  const iosOfflineFallbackRecoveryChecklistSessionClickedAt = iosOfflineFallbackRecoveryChecklistSessionData.clickedAt || "";
  const iosOfflineFallbackRecoveryChecklistSessionSourceLabel = iosOfflineFallbackRecoveryChecklistSessionData.source || "";
  const iosOfflineFallbackRecoveryChecklistCarryover = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryover || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverKey = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverKey || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverRoute = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverRoute || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverLabel = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverLabel || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverSource = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverSource || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverClickedAt = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverClickedAt || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback = document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerKey = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerKey || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerClass = recoveryCarryoverBanner?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerClass || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible = recoveryCarryoverBannerLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute = recoveryCarryoverBannerLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel = recoveryCarryoverBannerLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass = recoveryCarryoverBannerLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass || "";
  const iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback = recoveryCarryoverStatusLink?.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback || "";
  const iosOfflineFallbackDocumentTitle = document.documentElement.dataset.iosOfflineFallbackTitle || "";
  const iosOfflineFallbackUpdatedAt = document.documentElement.dataset.iosOfflineFallbackUpdatedAt || "";
  const checklistLines = IOS_FIRST_RUN_CHECKLIST_ITEMS.map((item) =>
    `- ${state[item.id] ? "[x]" : "[ ]"} ${item.label}`
  );
  const planLines = plans.map((plan) =>
    `- ${plan.destination || "목적지 미정"}: ${new URL(`/plans/${encodeURIComponent(plan.id)}`, window.location.origin).toString()}`
  );
  const installModeHandoffJourneyCueLines = (control, prefix, datasetPrefix = "iosInstallModeHandoff") => [
    `${prefix}JourneyTargetCue=${control?.dataset[`${datasetPrefix}JourneyTargetCue`] || ""}`,
    `${prefix}JourneyTargetCueAt=${control?.dataset[`${datasetPrefix}JourneyTargetCueAt`] || ""}`,
    `${prefix}JourneyTargetCueId=${control?.dataset[`${datasetPrefix}JourneyTargetCueId`] || ""}`,
    `${prefix}JourneyTargetCueLabel=${control?.dataset[`${datasetPrefix}JourneyTargetCueLabel`] || ""}`,
    `${prefix}JourneyTargetCueValueFree=${control?.dataset[`${datasetPrefix}JourneyTargetCueValueFree`] || ""}`,
  ];
  return [
    `newPlanShortcutInstallActionVisible=${installAction.visible}`,
    `newPlanShortcutInstallActionMode=${installAction.mode}`,
    `newPlanShortcutInstallActionHref=${installAction.href}`,
    `newPlanShortcutInstallActionLabel=${installAction.label}`,
    `newPlanShortcutInstallActionDestination=${installAction.destination}`,
    `newPlanShortcutInstallActionUpdatedAt=${installAction.updatedAt}`,
    "newPlanShortcutInstallActionDraftValues=excluded",
    "newPlanShortcutInstallActionLlmSecrets=excluded",
    `diagnosticsCopyMethod=${diagnosticsCopyMethod}`,
    `diagnosticsCopyMethodUpdatedAt=${diagnosticsCopyMethodUpdatedAt}`,
    `iosInstallJourneyTargetCue=${iosInstallJourneyTargetCue}`,
    `iosInstallJourneyTargetCueAt=${iosInstallJourneyTargetCueAt}`,
    `iosInstallJourneyTargetCueId=${iosInstallJourneyTargetCueId}`,
    `iosInstallJourneyTargetCueLabel=${iosInstallJourneyTargetCueLabel}`,
    "iosInstallJourneyTargetCueValueFree=true",
    `iosInstallJourneyStatusLinkVisible=${iosInstallJourneyStatusLinkVisible}`,
    `iosInstallJourneyStatusLinkHref=${iosInstallJourneyStatusLinkHref}`,
    `iosInstallJourneyStatusLinkLabel=${iosInstallJourneyStatusLinkLabel}`,
    `iosInstallJourneyStatusLinkState=${iosInstallJourneyStatusLinkState}`,
    `iosInstallJourneyStatusLinkNextStep=${iosInstallJourneyStatusLinkNextStep}`,
    `iosInstallJourneyStatusLinkNextStepNumber=${iosInstallJourneyStatusLinkNextStepNumber}`,
    `iosInstallJourneyStatusLinkNextStepTotal=${iosInstallJourneyStatusLinkNextStepTotal}`,
    `iosInstallJourneyStatusLinkNextTargetId=${iosInstallJourneyStatusLinkNextTargetId}`,
    `iosInstallJourneyStatusLinkNextTargetScope=${iosInstallJourneyStatusLinkNextTargetScope}`,
    `iosInstallJourneyStatusLinkNextTargetSamePageExists=${iosInstallJourneyStatusLinkNextTargetSamePageExists}`,
    `iosInstallJourneyStatusLinkNextTargetFallbackVisible=${iosInstallJourneyStatusLinkNextTargetFallbackVisible}`,
    `iosInstallJourneyStatusLinkNextTargetFallbackHref=${iosInstallJourneyStatusLinkNextTargetFallbackHref}`,
    `iosInstallJourneyStatusLinkNextTargetFallbackLabel=${iosInstallJourneyStatusLinkNextTargetFallbackLabel}`,
    `iosInstallJourneyStatusLinkNextTargetFallbackActive=${iosInstallJourneyStatusLinkNextTargetFallbackActive}`,
    `iosInstallJourneyStatusLinkNextTargetEffectiveHref=${iosInstallJourneyStatusLinkNextTargetEffectiveHref}`,
    `iosInstallJourneyStatusLinkNextTargetEffectiveLabel=${iosInstallJourneyStatusLinkNextTargetEffectiveLabel}`,
    `iosInstallJourneyStatusLinkFallbackClicked=${iosInstallJourneyStatusLinkFallbackClicked}`,
    `iosInstallJourneyStatusLinkFallbackClickedAt=${iosInstallJourneyStatusLinkFallbackClickedAt}`,
    `iosInstallJourneyStatusLinkFallbackClickedHref=${iosInstallJourneyStatusLinkFallbackClickedHref}`,
    `iosInstallJourneyStatusLinkFallbackClickedLabel=${iosInstallJourneyStatusLinkFallbackClickedLabel}`,
    `iosInstallJourneyStatusLinkFallbackClickedOriginalTargetId=${iosInstallJourneyStatusLinkFallbackClickedOriginalTargetId}`,
    `iosInstallJourneyStatusLinkFallbackClickedStored=${iosInstallJourneyStatusLinkFallbackClickedStored}`,
    `iosInstallJourneyStatusLinkFallbackCarryover=${iosInstallJourneyStatusLinkFallbackCarryover}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverFresh=${iosInstallJourneyStatusLinkFallbackCarryoverFresh}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverClickedAt=${iosInstallJourneyStatusLinkFallbackCarryoverClickedAt}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverHref=${iosInstallJourneyStatusLinkFallbackCarryoverHref}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverLabel=${iosInstallJourneyStatusLinkFallbackCarryoverLabel}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverOriginalTargetId=${iosInstallJourneyStatusLinkFallbackCarryoverOriginalTargetId}`,
    `iosInstallJourneyStatusLinkFallbackCarryoverAgeMs=${iosInstallJourneyStatusLinkFallbackCarryoverAgeMs}`,
    "iosInstallJourneyStatusLinkValueFree=true",
    ...installModeHandoffJourneyCueLines(installModeHandoffHint, "iosInstallModeHandoffHint", "iosInstallModeHandoffHint"),
    ...installModeHandoffJourneyCueLines(installModeCopyButton, "iosInstallModeCopyControl"),
    ...installModeHandoffJourneyCueLines(installModeShareButton, "iosInstallModeShareControl"),
    ...installModeHandoffJourneyCueLines(installModeSmsLink, "iosInstallModeSmsControl"),
    ...installModeHandoffJourneyCueLines(installModeMailLink, "iosInstallModeMailControl"),
    `iosHomeDockLastRouteVisible=${iosHomeDockLastRouteVisible}`,
    `iosHomeDockLastRouteHref=${iosHomeDockLastRouteHref}`,
    `iosHomeDockLastRouteLabel=${iosHomeDockLastRouteLabel}`,
    `iosHomeDockLastRouteUpdatedAt=${iosHomeDockLastRouteUpdatedAt}`,
    `iosHomeDockLastRouteReason=${iosHomeDockLastRouteReason}`,
    `iosHomeDockLastRouteBound=${iosHomeDockLastRouteBound}`,
    `iosHomeDockLastRouteClicked=${iosHomeDockLastRouteClicked}`,
    `iosHomeDockLastRouteClickedAt=${iosHomeDockLastRouteClickedAt}`,
    `iosHomeDockLastRouteClickedHref=${iosHomeDockLastRouteClickedHref}`,
    `iosHomeDockLastRouteClickedLabel=${iosHomeDockLastRouteClickedLabel}`,
    `iosHomeDockLastRouteClickedStatusFeedback=${iosHomeDockLastRouteClickedStatusFeedback}`,
    `iosHomeDockLastRouteClearVisible=${iosHomeDockLastRouteClearVisible}`,
    `iosHomeDockLastRouteClearBound=${iosHomeDockLastRouteClearBound}`,
    `iosHomeDockLastRouteClearClicked=${iosHomeDockLastRouteClearClicked}`,
    `iosHomeDockLastRouteClearClickedAt=${iosHomeDockLastRouteClearClickedAt}`,
    `iosHomeDockLastRouteClearStatusFeedback=${iosHomeDockLastRouteClearStatusFeedback}`,
    `iosHomeDockLastRouteClearNextRoute=${iosHomeDockLastRouteClearNextRoute}`,
    `iosHomeDockLastRouteClearNextLabel=${iosHomeDockLastRouteClearNextLabel}`,
    `iosHomeDockLastRouteClearNextTappable=${iosHomeDockLastRouteClearNextTappable}`,
    `iosHomeDockLastRouteClearNextOpened=${iosHomeDockLastRouteClearNextOpened}`,
    `iosHomeDockLastRouteClearNextOpenedAt=${iosHomeDockLastRouteClearNextOpenedAt}`,
    `iosHomeDockLastRouteClearNextOpenedRoute=${iosHomeDockLastRouteClearNextOpenedRoute}`,
    `iosHomeDockLastRouteClearNextOpenedLabel=${iosHomeDockLastRouteClearNextOpenedLabel}`,
    `iosHomeDockLastRouteClearNextOpenedStatusFeedback=${iosHomeDockLastRouteClearNextOpenedStatusFeedback}`,
    `iosHomeDockLastRouteClearNextPersisted=${iosHomeDockLastRouteClearNextPersisted}`,
    `iosHomeDockLastRouteClearNextConsumed=${iosHomeDockLastRouteClearNextConsumed}`,
    `iosHomeDockDisplayModeVisible=${iosHomeDockDisplayModeVisible}`,
    `iosHomeDockDisplayMode=${iosHomeDockDisplayMode}`,
    `iosHomeDockDisplayModeLabel=${iosHomeDockDisplayModeLabel}`,
    `iosHomeDockDisplayModeTitle=${iosHomeDockDisplayModeTitle}`,
    `iosStandaloneNextActionVisible=${iosStandaloneNextActionVisible}`,
    `iosStandaloneNextActionDatasetVisible=${iosStandaloneNextActionDatasetVisible}`,
    ...iosStandaloneSuccessCheckLines,
    `iosStandaloneNextActionClicked=${iosStandaloneNextActionClicked}`,
    `iosStandaloneNextActionClickedAt=${iosStandaloneNextActionClickedAt}`,
    `iosStandaloneNextActionClickedRoute=${iosStandaloneNextActionClickedRoute}`,
    `iosStandaloneNextActionClickedLabel=${iosStandaloneNextActionClickedLabel}`,
    `iosStandaloneNextActionFocusTarget=${iosStandaloneNextActionFocusTarget}`,
    `iosStandaloneNextActionFocusApplied=${iosStandaloneNextActionFocusApplied}`,
    `iosStandaloneNextActionReducedMotion=${iosStandaloneNextActionReducedMotion}`,
    `iosStandaloneNextActionStatusFeedback=${iosStandaloneNextActionStatusFeedback}`,
    `iosStandaloneNextActionCarryoverAction=${iosStandaloneNextActionCarryoverAction}`,
    `iosStandaloneNextActionCarryoverClickedAt=${iosStandaloneNextActionCarryoverClickedAt}`,
    `iosStandaloneNextActionCarryoverRoute=${iosStandaloneNextActionCarryoverRoute}`,
    `iosStandaloneNextActionCarryoverLabel=${iosStandaloneNextActionCarryoverLabel}`,
    `iosStandaloneNextActionCarryoverFocusTarget=${iosStandaloneNextActionCarryoverFocusTarget}`,
    `iosStandaloneNextActionCarryoverFocusApplied=${iosStandaloneNextActionCarryoverFocusApplied}`,
    `iosStandaloneNextActionCarryoverReducedMotion=${iosStandaloneNextActionCarryoverReducedMotion}`,
    `iosStandaloneNextActionCarryoverStatusFeedback=${iosStandaloneNextActionCarryoverStatusFeedback}`,
    `iosStandaloneNextActionCarryoverAgeMs=${iosStandaloneNextActionCarryoverAgeMs}`,
    `iosStandaloneNextActionCarryoverAgeSeconds=${iosStandaloneNextActionCarryoverAgeSeconds}`,
    `iosStandaloneNextActionCarryoverStale=${iosStandaloneNextActionCarryoverStale}`,
    `iosStandaloneNextActionCarryoverFresh=${iosStandaloneNextActionCarryoverFresh}`,
    `iosStandaloneNextActionCarryoverPromoted=${iosStandaloneNextActionCarryoverPromoted}`,
    `iosStandaloneNextActionCarryoverIgnoredReason=${iosStandaloneNextActionCarryoverIgnoredReason}`,
    `iosStandaloneNextActionCarryoverIgnoredFeedback=${iosStandaloneNextActionCarryoverIgnoredFeedback}`,
    `iosStandaloneNextActionCarryoverCleared=${iosStandaloneNextActionCarryoverCleared}`,
    `iosStandaloneNextActionCarryoverClearedReason=${iosStandaloneNextActionCarryoverClearedReason}`,
    `iosStandaloneNextActionCarryoverClearedAt=${iosStandaloneNextActionCarryoverClearedAt}`,
    `iosStandaloneNextActionCarryoverCleanupFailed=${iosStandaloneNextActionCarryoverCleanupFailed}`,
    `iosStandaloneNextActionCarryoverCleanupFailedReason=${iosStandaloneNextActionCarryoverCleanupFailedReason}`,
    `iosStandaloneNextActionCarryoverCleanupFailedAt=${iosStandaloneNextActionCarryoverCleanupFailedAt}`,
    `iosStandaloneNextActionCarryoverMaxAgeMs=${iosStandaloneNextActionCarryoverMaxAgeMs}`,
    `iosStandaloneSubmitDockVisible=${iosStandaloneSubmitDockVisible}`,
    `iosStandaloneSubmitDockState=${iosStandaloneSubmitDockState}`,
    `iosStandaloneSubmitDockButtonLabel=${iosStandaloneSubmitDockButtonLabel}`,
    `iosStandaloneSubmitDockClicked=${iosStandaloneSubmitDockClicked}`,
    `iosStandaloneSubmitDockClickedAt=${iosStandaloneSubmitDockClickedAt}`,
    `iosStandaloneSubmitDockClickResult=${iosStandaloneSubmitDockClickResult}`,
    `iosStandaloneSubmitDockStatusFeedback=${iosStandaloneSubmitDockStatusFeedback}`,
    `iosStandaloneSubmitDockObserved=${iosStandaloneSubmitDockObserved}`,
    `iosStandaloneSubmitDockSyncedAt=${iosStandaloneSubmitDockSyncedAt}`,
    `iosStandaloneSubmitDockSubmitBusy=${iosStandaloneSubmitDockSubmitBusy}`,
    `iosStandaloneSubmitDockSubmitDisabled=${iosStandaloneSubmitDockSubmitDisabled}`,
    `iosStandaloneSubmitDockSubmitStarted=${iosStandaloneSubmitDockSubmitStarted}`,
    `iosStandaloneSubmitDockSubmitStartedAt=${iosStandaloneSubmitDockSubmitStartedAt}`,
    `iosStandaloneSubmitDockSubmitSource=${iosStandaloneSubmitDockSubmitSource}`,
    `iosStandaloneSubmitDockSubmitStatusFeedback=${iosStandaloneSubmitDockSubmitStatusFeedback}`,
    `iosStandaloneSubmitDockSubmitPending=${iosStandaloneSubmitDockSubmitPending}`,
    `iosStandaloneSubmitDockSubmitPendingAt=${iosStandaloneSubmitDockSubmitPendingAt}`,
    `iosStandaloneSubmitDockSubmitPendingSource=${iosStandaloneSubmitDockSubmitPendingSource}`,
    `iosStandaloneSubmitDockSubmitFinished=${iosStandaloneSubmitDockSubmitFinished}`,
    `iosStandaloneSubmitDockSubmitFinishedAt=${iosStandaloneSubmitDockSubmitFinishedAt}`,
    `iosStandaloneSubmitDockSubmitFinishedResult=${iosStandaloneSubmitDockSubmitFinishedResult}`,
    `iosStandaloneSubmitDockSubmitFinishedSource=${iosStandaloneSubmitDockSubmitFinishedSource}`,
    `iosStandaloneSubmitDockSubmitResultObserved=${iosStandaloneSubmitDockSubmitResultObserved}`,
    `iosStandaloneSubmitDockSubmitResultObserverAttrs=${iosStandaloneSubmitDockSubmitResultObserverAttrs}`,
    `iosStandaloneSubmitDockKeyboardHidden=${iosStandaloneSubmitDockKeyboardHidden}`,
    `iosStandaloneSubmitDockKeyboardHiddenAt=${iosStandaloneSubmitDockKeyboardHiddenAt}`,
    `iosStandaloneSubmitDockKeyboardRestoredAt=${iosStandaloneSubmitDockKeyboardRestoredAt}`,
    `iosStandaloneSubmitDockKeyboardFocusName=${iosStandaloneSubmitDockKeyboardFocusName}`,
    `iosStandaloneSubmitDockInvalid=${iosStandaloneSubmitDockInvalid}`,
    `iosStandaloneSubmitDockInvalidAt=${iosStandaloneSubmitDockInvalidAt}`,
    `iosStandaloneSubmitDockInvalidFieldName=${iosStandaloneSubmitDockInvalidFieldName}`,
    `iosStandaloneSubmitDockInvalidSource=${iosStandaloneSubmitDockInvalidSource}`,
    `iosStandaloneSubmitDockInvalidFeedback=${iosStandaloneSubmitDockInvalidFeedback}`,
    `iosStandaloneSubmitDockInvalidFocusTarget=${iosStandaloneSubmitDockInvalidFocusTarget}`,
    `iosStandaloneSubmitDockInvalidFocusApplied=${iosStandaloneSubmitDockInvalidFocusApplied}`,
    `iosStandaloneSubmitDockInvalidFocusedAt=${iosStandaloneSubmitDockInvalidFocusedAt}`,
    `iosStandaloneSubmitDockInvalidReducedMotion=${iosStandaloneSubmitDockInvalidReducedMotion}`,
    `iosStandaloneSubmitDockInvalidInlineVisible=${iosStandaloneSubmitDockInvalidInlineVisible}`,
    `iosStandaloneSubmitDockInvalidInlineFieldName=${iosStandaloneSubmitDockInvalidInlineFieldName}`,
    `iosStandaloneSubmitDockInvalidInlineFeedback=${iosStandaloneSubmitDockInvalidInlineFeedback}`,
    `iosStandaloneSubmitDockInvalidInlineShownAt=${iosStandaloneSubmitDockInvalidInlineShownAt}`,
    `iosStandaloneSubmitDockInvalidInlineClearedAt=${iosStandaloneSubmitDockInvalidInlineClearedAt}`,
    `iosStandaloneSubmitDockInvalidCleared=${iosStandaloneSubmitDockInvalidCleared}`,
    `iosStandaloneSubmitDockInvalidClearedAt=${iosStandaloneSubmitDockInvalidClearedAt}`,
    `iosStandaloneSubmitDockInvalidClearSource=${iosStandaloneSubmitDockInvalidClearSource}`,
    `iosStandaloneSubmitDockInvalidRemaining=${iosStandaloneSubmitDockInvalidRemaining}`,
    `iosStandaloneSubmitDockInvalidRemainingFieldName=${iosStandaloneSubmitDockInvalidRemainingFieldName}`,
    `iosStandaloneSubmitDockInvalidRecoveryNextAction=${iosStandaloneSubmitDockInvalidRecoveryNextAction}`,
    `iosStandaloneSubmitDockInvalidRecoveryReadyAt=${iosStandaloneSubmitDockInvalidRecoveryReadyAt}`,
    `iosStandaloneCompletionStatusClicked=${iosStandaloneCompletionStatusClicked}`,
    `iosStandaloneCompletionStatusClickedAt=${iosStandaloneCompletionStatusClickedAt}`,
    `iosStandaloneCompletionStatusClickedRoute=${iosStandaloneCompletionStatusClickedRoute}`,
    `iosStandaloneCompletionStatusClickedLabel=${iosStandaloneCompletionStatusClickedLabel}`,
    `iosInstallModeCopyVisible=${iosInstallModeCopyVisible}`,
    `iosInstallModeCopyBound=${iosInstallModeCopyBound}`,
    `iosInstallModeCopied=${iosInstallModeCopied}`,
    `iosInstallModeCopiedAt=${iosInstallModeCopiedAt}`,
    `iosInstallModeCopiedState=${iosInstallModeCopiedState}`,
    `iosInstallModeCopyMethod=${iosInstallModeCopyMethod}`,
    `iosInstallModeCopyHintDescribedBy=${iosInstallModeCopyHintDescribedBy}`,
    `iosInstallModeShareVisible=${iosInstallModeShareVisible}`,
    `iosInstallModeShareBound=${iosInstallModeShareBound}`,
    `iosInstallModeShared=${iosInstallModeShared}`,
    `iosInstallModeSharedAt=${iosInstallModeSharedAt}`,
    `iosInstallModeSharedState=${iosInstallModeSharedState}`,
    `iosInstallModeShareMethod=${iosInstallModeShareMethod}`,
    `iosInstallModeShareHintDescribedBy=${iosInstallModeShareHintDescribedBy}`,
    `iosInstallModeSmsVisible=${iosInstallModeSmsVisible}`,
    `iosInstallModeSmsChannel=${iosInstallModeSmsChannel}`,
    `iosInstallModeSmsState=${iosInstallModeSmsState}`,
    `iosInstallModeSmsDisplayMode=${iosInstallModeSmsDisplayMode}`,
    `iosInstallModeSmsPayloadKind=${iosInstallModeSmsPayloadKind}`,
    `iosInstallModeSmsLabel=${iosInstallModeSmsLabel}`,
    `iosInstallModeSmsClicked=${iosInstallModeSmsClicked}`,
    `iosInstallModeSmsClickedAt=${iosInstallModeSmsClickedAt}`,
    `iosInstallModeSmsClickedPayloadKind=${iosInstallModeSmsClickedPayloadKind}`,
    `iosInstallModeSmsHintDescribedBy=${iosInstallModeSmsHintDescribedBy}`,
    `iosInstallModeMailVisible=${iosInstallModeMailVisible}`,
    `iosInstallModeMailChannel=${iosInstallModeMailChannel}`,
    `iosInstallModeMailState=${iosInstallModeMailState}`,
    `iosInstallModeMailDisplayMode=${iosInstallModeMailDisplayMode}`,
    `iosInstallModeMailPayloadKind=${iosInstallModeMailPayloadKind}`,
    `iosInstallModeMailLabel=${iosInstallModeMailLabel}`,
    `iosInstallModeMailClicked=${iosInstallModeMailClicked}`,
    `iosInstallModeMailClickedAt=${iosInstallModeMailClickedAt}`,
    `iosInstallModeMailClickedPayloadKind=${iosInstallModeMailClickedPayloadKind}`,
    `iosInstallModeMailHintDescribedBy=${iosInstallModeMailHintDescribedBy}`,
    `iosInstallModeHandoffHintVisible=${iosInstallModeHandoffHintVisible}`,
    `iosInstallModeHandoffHintSmsRole=${iosInstallModeHandoffHintSmsRole}`,
    `iosInstallModeHandoffHintMailRole=${iosInstallModeHandoffHintMailRole}`,
    `iosInstallModeHandoffHintPayload=${iosInstallModeHandoffHintPayload}`,
    `iosHomeDockPlanStarterLinkVisible=${iosHomeDockPlanStarterLinkVisible}`,
    `iosHomeDockPlanStarterLinkRoute=${iosHomeDockPlanStarterLinkRoute}`,
    `iosHomeDockPlanStarterLinkLabel=${iosHomeDockPlanStarterLinkLabel}`,
    `iosHomeDockPlanStarterLinkState=${iosHomeDockPlanStarterLinkState}`,
    `iosHomeDockPlanStarterLinkBound=${iosHomeDockPlanStarterLinkBound}`,
    `iosHomeDockPlanStarterLinkClicked=${iosHomeDockPlanStarterLinkClicked}`,
    `iosHomeDockPlanStarterLinkClickedAt=${iosHomeDockPlanStarterLinkClickedAt}`,
    `iosHomeDockPlanStarterLinkClickedRoute=${iosHomeDockPlanStarterLinkClickedRoute}`,
    `iosHomeDockPlanStarterLinkClickedLabel=${iosHomeDockPlanStarterLinkClickedLabel}`,
    `iosHomeDockPlanStarterLinkClickedState=${iosHomeDockPlanStarterLinkClickedState}`,
    `iosHomeDockPlanStarterLinkClickedStatusFeedback=${iosHomeDockPlanStarterLinkClickedStatusFeedback}`,
    `iosHomeDockPlanStarterSampleButtonVisible=${iosHomeDockPlanStarterSampleButtonVisible}`,
    `iosHomeDockPlanStarterSampleButtonLabel=${iosHomeDockPlanStarterSampleButtonLabel}`,
    `iosHomeDockPlanStarterSampleButtonState=${iosHomeDockPlanStarterSampleButtonState}`,
    `iosHomeDockPlanStarterSampleButtonClicked=${iosHomeDockPlanStarterSampleButtonClicked}`,
    `iosHomeDockPlanStarterSampleButtonClickedAt=${iosHomeDockPlanStarterSampleButtonClickedAt}`,
    `iosHomeDockPlanStarterSampleButtonClickedMode=${iosHomeDockPlanStarterSampleButtonClickedMode}`,
    `iosHomeDockPlanStarterSampleButtonClickedStatusFeedback=${iosHomeDockPlanStarterSampleButtonClickedStatusFeedback}`,
    `iosHomeDockPlanStarterSampleButtonFocusTarget=${iosHomeDockPlanStarterSampleButtonFocusTarget}`,
    `iosHomeDockPlanStarterSampleButtonFocusScheduled=${iosHomeDockPlanStarterSampleButtonFocusScheduled}`,
    `iosHomeDockPlanStarterSampleButtonFocusApplied=${iosHomeDockPlanStarterSampleButtonFocusApplied}`,
    `iosHomeDockPlanStarterSampleButtonFocusedAt=${iosHomeDockPlanStarterSampleButtonFocusedAt}`,
    `iosHomeDockPlanStarterSampleButtonHighlightApplied=${iosHomeDockPlanStarterSampleButtonHighlightApplied}`,
    `iosHomeDockPlanStarterSampleButtonFollowupHintVisible=${iosHomeDockPlanStarterSampleButtonFollowupHintVisible}`,
    `iosHomeDockPlanStarterSampleButtonFollowupHintText=${iosHomeDockPlanStarterSampleButtonFollowupHintText}`,
    `iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt=${iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt}`,
    `iosHomeDockPlanSubmitButtonVisible=${iosHomeDockPlanSubmitButtonVisible}`,
    `iosHomeDockPlanSubmitButtonLabel=${iosHomeDockPlanSubmitButtonLabel}`,
    `iosHomeDockPlanSubmitButtonTitle=${iosHomeDockPlanSubmitButtonTitle}`,
    `iosHomeDockPlanSubmitButtonAccessibleLabel=${iosHomeDockPlanSubmitButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitButtonDescribedBy=${iosHomeDockPlanSubmitButtonDescribedBy}`,
    `iosHomeDockPlanSubmitButtonBound=${iosHomeDockPlanSubmitButtonBound}`,
    `iosHomeDockPlanSubmitButtonDisabled=${iosHomeDockPlanSubmitButtonDisabled}`,
    `iosHomeDockPlanSubmitButtonAriaBusy=${iosHomeDockPlanSubmitButtonAriaBusy}`,
    `iosHomeDockPlanSubmitButtonBusy=${iosHomeDockPlanSubmitButtonBusy}`,
    `iosHomeDockPlanSubmitButtonClicked=${iosHomeDockPlanSubmitButtonClicked}`,
    `iosHomeDockPlanSubmitButtonClickedAt=${iosHomeDockPlanSubmitButtonClickedAt}`,
    `iosHomeDockPlanSubmitButtonClickedStatusFeedback=${iosHomeDockPlanSubmitButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitButtonSubmitAttempted=${iosHomeDockPlanSubmitButtonSubmitAttempted}`,
    `iosHomeDockPlanSubmitButtonSubmitAttemptedAt=${iosHomeDockPlanSubmitButtonSubmitAttemptedAt}`,
    `iosHomeDockPlanSubmitButtonSubmitResult=${iosHomeDockPlanSubmitButtonSubmitResult}`,
    `iosHomeDockPlanSubmitButtonSubmitResultAt=${iosHomeDockPlanSubmitButtonSubmitResultAt}`,
    `iosHomeDockPlanSubmitButtonSubmitFailureKind=${iosHomeDockPlanSubmitButtonSubmitFailureKind}`,
    `iosHomeDockPlanSubmitButtonSubmitStatusFeedback=${iosHomeDockPlanSubmitButtonSubmitStatusFeedback}`,
    `iosHomeDockPlanSubmitButtonRedirectPlanned=${iosHomeDockPlanSubmitButtonRedirectPlanned}`,
    `iosHomeDockPlanSubmitButtonRedirectRoute=${iosHomeDockPlanSubmitButtonRedirectRoute}`,
    `iosHomeDockPlanSubmitButtonRedirectPlannedAt=${iosHomeDockPlanSubmitButtonRedirectPlannedAt}`,
    `iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible=${iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible}`,
    `iosHomeDockPlanSubmitButtonRedirectFallbackRoute=${iosHomeDockPlanSubmitButtonRedirectFallbackRoute}`,
    `iosHomeDockPlanSubmitRedirectSessionSaved=${iosHomeDockPlanSubmitRedirectSessionSaved}`,
    `iosHomeDockPlanSubmitRedirectSessionRoute=${iosHomeDockPlanSubmitRedirectSessionRoute}`,
    `iosHomeDockPlanSubmitRedirectSessionPlannedAt=${iosHomeDockPlanSubmitRedirectSessionPlannedAt}`,
    `iosHomeDockPlanSubmitRedirectSessionSource=${iosHomeDockPlanSubmitRedirectSessionSource}`,
    `iosHomeDockPlanSubmitRedirectArrivalVisible=${iosHomeDockPlanSubmitRedirectArrivalVisible}`,
    `iosHomeDockPlanSubmitRedirectArrivalRoute=${iosHomeDockPlanSubmitRedirectArrivalRoute}`,
    `iosHomeDockPlanSubmitRedirectArrivalSource=${iosHomeDockPlanSubmitRedirectArrivalSource}`,
    `iosHomeDockPlanSubmitRedirectArrivalPlannedAt=${iosHomeDockPlanSubmitRedirectArrivalPlannedAt}`,
    `iosHomeDockPlanSubmitRedirectArrivalArrivedAt=${iosHomeDockPlanSubmitRedirectArrivalArrivedAt}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissed=${iosHomeDockPlanSubmitRedirectArrivalDismissed}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissedAt=${iosHomeDockPlanSubmitRedirectArrivalDismissedAt}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt}`,
    `iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback=${iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute}`,
    `iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback=${iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalVisible=${iosHomeDockPlanSubmitCompletionStatusArrivalVisible}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalRoute=${iosHomeDockPlanSubmitCompletionStatusArrivalRoute}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalSource=${iosHomeDockPlanSubmitCompletionStatusArrivalSource}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt=${iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt=${iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissed=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissed}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback=${iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute}`,
    `iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback=${iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalVisible=${iosHomeDockPlanSubmitHomeReturnArrivalVisible}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalRoute=${iosHomeDockPlanSubmitHomeReturnArrivalRoute}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalSource=${iosHomeDockPlanSubmitHomeReturnArrivalSource}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt=${iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt=${iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissed=${iosHomeDockPlanSubmitHomeReturnArrivalDismissed}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt=${iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt}`,
    `iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback=${iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompleted=${iosHomeDockPlanSubmitFirstUseLoopCompleted}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletedAt=${iosHomeDockPlanSubmitFirstUseLoopCompletedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletedSource=${iosHomeDockPlanSubmitFirstUseLoopCompletedSource}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback=${iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible=${iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel=${iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel=${iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked=${iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt=${iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason=${iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback=${iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible=${iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel=${iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetBannerReason=${iosHomeDockPlanSubmitFirstUseLoopResetBannerReason}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt=${iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback=${iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback=${iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt}`,
    `iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel=${iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel}`,
    `iosHomeDockPlanSubmitMessageVisible=${iosHomeDockPlanSubmitMessageVisible}`,
    `iosHomeDockPlanSubmitMessageId=${iosHomeDockPlanSubmitMessageId}`,
    `iosHomeDockPlanSubmitMessageRole=${iosHomeDockPlanSubmitMessageRole}`,
    `iosHomeDockPlanSubmitMessageAriaLive=${iosHomeDockPlanSubmitMessageAriaLive}`,
    `iosHomeDockPlanSubmitMessageAriaAtomic=${iosHomeDockPlanSubmitMessageAriaAtomic}`,
    `iosOfflineFallback=${iosOfflineFallback}`,
    `iosOfflineFallbackPath=${iosOfflineFallbackPath}`,
    `iosOfflineFallbackSourceLabel=${iosOfflineFallbackSourceLabel}`,
    `iosOfflineFallbackStatusSourceLabel=${iosOfflineFallbackStatusSourceLabel}`,
    `iosOfflineFallbackStatusRecoveryActionLabel=${iosOfflineFallbackStatusRecoveryActionLabel}`,
    `iosOfflineFallbackSourceUrl=${iosOfflineFallbackSourceUrl}`,
    `iosOfflineFallbackRecoveryTarget=${iosOfflineFallbackRecoveryTarget}`,
    `iosOfflineFallbackRecoveryTargetId=${iosOfflineFallbackRecoveryTargetId}`,
    `iosOfflineFallbackRecoveryTargetLabel=${iosOfflineFallbackRecoveryTargetLabel}`,
    `iosOfflineFallbackRecoveryAction=${iosOfflineFallbackRecoveryAction}`,
    `iosOfflineFallbackRecoveryActionLabel=${iosOfflineFallbackRecoveryActionLabel}`,
    `iosOfflineFallbackCompletionChecklist=${iosOfflineFallbackCompletionChecklist}`,
    `iosOfflineFallbackCompletionChecklistLabel=${iosOfflineFallbackCompletionChecklistLabel}`,
    `iosOfflineFallbackCompletionHint=${iosOfflineFallbackCompletionHint}`,
    `iosOfflineFallbackVisibleStatusIncludesCompletionHint=${iosOfflineFallbackVisibleStatusIncludesCompletionHint}`,
    `iosOfflineFallbackStatusCompletionHint=${iosOfflineFallbackStatusCompletionHint}`,
    `iosOfflineFallbackStatusCompletionHintVisible=${iosOfflineFallbackStatusCompletionHintVisible}`,
    `iosOfflineFallbackStatusAccessibleLabel=${iosOfflineFallbackStatusAccessibleLabel}`,
    `iosOfflineFallbackStatusAccessibleLabelVisible=${iosOfflineFallbackStatusAccessibleLabelVisible}`,
    `iosOfflineFallbackStatusRole=${iosOfflineFallbackStatusRole}`,
    `iosOfflineFallbackStatusAriaLive=${iosOfflineFallbackStatusAriaLive}`,
    `iosOfflineFallbackStatusAriaAtomic=${iosOfflineFallbackStatusAriaAtomic}`,
    `iosOfflineFallbackStatusDescribedBy=${iosOfflineFallbackStatusDescribedBy}`,
    `iosOfflineFallbackRecoveryLinkVisible=${iosOfflineFallbackRecoveryLinkVisible}`,
    `iosOfflineFallbackRecoveryLinkTarget=${iosOfflineFallbackRecoveryLinkTarget}`,
    `iosOfflineFallbackRecoveryLinkLabel=${iosOfflineFallbackRecoveryLinkLabel}`,
    `iosOfflineFallbackRecoveryLinkClass=${iosOfflineFallbackRecoveryLinkClass}`,
    `iosOfflineFallbackRecoveryLinkAction=${iosOfflineFallbackRecoveryLinkAction}`,
    `iosOfflineFallbackRecoveryLinkBound=${iosOfflineFallbackRecoveryLinkBound}`,
    `iosOfflineFallbackRecoveryLinkClicked=${iosOfflineFallbackRecoveryLinkClicked}`,
    `iosOfflineFallbackRecoveryLinkClickedAt=${iosOfflineFallbackRecoveryLinkClickedAt}`,
    `iosOfflineFallbackRecoveryLinkStatusFeedback=${iosOfflineFallbackRecoveryLinkStatusFeedback}`,
    `iosOfflineFallbackRecoveryLinkClickedLabel=${iosOfflineFallbackRecoveryLinkClickedLabel}`,
    `iosOfflineFallbackRecoveryLinkClickedClass=${iosOfflineFallbackRecoveryLinkClickedClass}`,
    `iosOfflineFallbackRecoveryLinkClickedTitle=${iosOfflineFallbackRecoveryLinkClickedTitle}`,
    `iosOfflineFallbackRecoveryLinkClickedAccessibleLabel=${iosOfflineFallbackRecoveryLinkClickedAccessibleLabel}`,
    `iosOfflineFallbackRecoveryLinkCompletionChecklist=${iosOfflineFallbackRecoveryLinkCompletionChecklist}`,
    `iosOfflineFallbackRecoveryLinkCompletionChecklistLabel=${iosOfflineFallbackRecoveryLinkCompletionChecklistLabel}`,
    `iosOfflineFallbackRecoveryLinkCompletionHint=${iosOfflineFallbackRecoveryLinkCompletionHint}`,
    `iosOfflineFallbackRecoveryChecklistVisible=${iosOfflineFallbackRecoveryChecklistVisible}`,
    `iosOfflineFallbackRecoveryChecklistItems=${iosOfflineFallbackRecoveryChecklistItems}`,
    `iosOfflineFallbackRecoveryChecklistKeys=${iosOfflineFallbackRecoveryChecklistKeys}`,
    `iosOfflineFallbackRecoveryChecklistRoutes=${iosOfflineFallbackRecoveryChecklistRoutes}`,
    `iosOfflineFallbackRecoveryChecklistLabel=${iosOfflineFallbackRecoveryChecklistLabel}`,
    `iosOfflineFallbackRecoveryChecklistLinksVisible=${iosOfflineFallbackRecoveryChecklistLinksVisible}`,
    `iosOfflineFallbackRecoveryChecklistLinkLabels=${iosOfflineFallbackRecoveryChecklistLinkLabels}`,
    `iosOfflineFallbackRecoveryChecklistLinkRoutes=${iosOfflineFallbackRecoveryChecklistLinkRoutes}`,
    `iosOfflineFallbackRecoveryChecklistLinkClass=${iosOfflineFallbackRecoveryChecklistLinkClass}`,
    `iosOfflineFallbackRecoveryChecklistLinkClicked=${iosOfflineFallbackRecoveryChecklistLinkClicked}`,
    `iosOfflineFallbackRecoveryChecklistLinkClickedKey=${iosOfflineFallbackRecoveryChecklistLinkClickedKey}`,
    `iosOfflineFallbackRecoveryChecklistLinkClickedRoute=${iosOfflineFallbackRecoveryChecklistLinkClickedRoute}`,
    `iosOfflineFallbackRecoveryChecklistLinkClickedLabel=${iosOfflineFallbackRecoveryChecklistLinkClickedLabel}`,
    `iosOfflineFallbackRecoveryChecklistLinkClickedAt=${iosOfflineFallbackRecoveryChecklistLinkClickedAt}`,
    `iosOfflineFallbackRecoveryChecklistLinkClickedClass=${iosOfflineFallbackRecoveryChecklistLinkClickedClass}`,
    `iosOfflineFallbackRecoveryChecklistLinkStatusFeedback=${iosOfflineFallbackRecoveryChecklistLinkStatusFeedback}`,
    `iosOfflineFallbackRecoveryChecklistSessionSaved=${iosOfflineFallbackRecoveryChecklistSessionSaved}`,
    `iosOfflineFallbackRecoveryChecklistSessionKey=${iosOfflineFallbackRecoveryChecklistSessionKey}`,
    `iosOfflineFallbackRecoveryChecklistSessionValue=${iosOfflineFallbackRecoveryChecklistSessionValue}`,
    `iosOfflineFallbackRecoveryChecklistSessionClickedKey=${iosOfflineFallbackRecoveryChecklistSessionClickedKey}`,
    `iosOfflineFallbackRecoveryChecklistSessionClickedRoute=${iosOfflineFallbackRecoveryChecklistSessionClickedRoute}`,
    `iosOfflineFallbackRecoveryChecklistSessionClickedLabel=${iosOfflineFallbackRecoveryChecklistSessionClickedLabel}`,
    `iosOfflineFallbackRecoveryChecklistSessionClickedAt=${iosOfflineFallbackRecoveryChecklistSessionClickedAt}`,
    `iosOfflineFallbackRecoveryChecklistSessionSourceLabel=${iosOfflineFallbackRecoveryChecklistSessionSourceLabel}`,
    `iosOfflineFallbackRecoveryChecklistCarryover=${iosOfflineFallbackRecoveryChecklistCarryover}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverKey=${iosOfflineFallbackRecoveryChecklistCarryoverKey}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverRoute=${iosOfflineFallbackRecoveryChecklistCarryoverRoute}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverLabel=${iosOfflineFallbackRecoveryChecklistCarryoverLabel}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverSource=${iosOfflineFallbackRecoveryChecklistCarryoverSource}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverClickedAt=${iosOfflineFallbackRecoveryChecklistCarryoverClickedAt}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback=${iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible=${iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerKey=${iosOfflineFallbackRecoveryChecklistCarryoverBannerKey}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute=${iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel=${iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback=${iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerClass=${iosOfflineFallbackRecoveryChecklistCarryoverBannerClass}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible=${iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute=${iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel=${iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass=${iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass}`,
    `iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback=${iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback}`,
    `iosOfflineFallbackDocumentTitle=${iosOfflineFallbackDocumentTitle}`,
    `iosOfflineFallbackUpdatedAt=${iosOfflineFallbackUpdatedAt}`,
    "iosOfflineFallbackBlankWhenInactive=true",
    "iosOfflineFallbackBlankFields=iosOfflineFallbackPath,iosOfflineFallbackSourceLabel,iosOfflineFallbackStatusSourceLabel,iosOfflineFallbackStatusRecoveryActionLabel,iosOfflineFallbackSourceUrl,iosOfflineFallbackRecoveryTarget,iosOfflineFallbackRecoveryTargetId,iosOfflineFallbackRecoveryTargetLabel,iosOfflineFallbackRecoveryAction,iosOfflineFallbackRecoveryActionLabel,iosOfflineFallbackCompletionChecklist,iosOfflineFallbackCompletionChecklistLabel,iosOfflineFallbackCompletionHint,iosOfflineFallbackVisibleStatusIncludesCompletionHint,iosOfflineFallbackStatusCompletionHint,iosOfflineFallbackStatusCompletionHintVisible,iosOfflineFallbackStatusAccessibleLabel,iosOfflineFallbackStatusAccessibleLabelVisible,iosOfflineFallbackStatusRole,iosOfflineFallbackStatusAriaLive,iosOfflineFallbackStatusAriaAtomic,iosOfflineFallbackStatusDescribedBy,iosOfflineFallbackRecoveryLinkVisible,iosOfflineFallbackRecoveryLinkTarget,iosOfflineFallbackRecoveryLinkLabel,iosOfflineFallbackRecoveryLinkClass,iosOfflineFallbackRecoveryLinkAction,iosOfflineFallbackRecoveryLinkBound,iosOfflineFallbackRecoveryLinkClicked,iosOfflineFallbackRecoveryLinkClickedAt,iosOfflineFallbackRecoveryLinkStatusFeedback,iosOfflineFallbackRecoveryLinkClickedLabel,iosOfflineFallbackRecoveryLinkClickedClass,iosOfflineFallbackRecoveryLinkClickedTitle,iosOfflineFallbackRecoveryLinkClickedAccessibleLabel,iosOfflineFallbackRecoveryLinkCompletionChecklist,iosOfflineFallbackRecoveryLinkCompletionChecklistLabel,iosOfflineFallbackRecoveryLinkCompletionHint,iosOfflineFallbackRecoveryChecklistVisible,iosOfflineFallbackRecoveryChecklistItems,iosOfflineFallbackRecoveryChecklistKeys,iosOfflineFallbackRecoveryChecklistRoutes,iosOfflineFallbackRecoveryChecklistLabel,iosOfflineFallbackRecoveryChecklistLinksVisible,iosOfflineFallbackRecoveryChecklistLinkLabels,iosOfflineFallbackRecoveryChecklistLinkRoutes,iosOfflineFallbackRecoveryChecklistLinkClass,iosOfflineFallbackRecoveryChecklistLinkClicked,iosOfflineFallbackRecoveryChecklistLinkClickedKey,iosOfflineFallbackRecoveryChecklistLinkClickedRoute,iosOfflineFallbackRecoveryChecklistLinkClickedLabel,iosOfflineFallbackRecoveryChecklistLinkClickedAt,iosOfflineFallbackRecoveryChecklistLinkClickedClass,iosOfflineFallbackRecoveryChecklistLinkStatusFeedback,iosOfflineFallbackRecoveryChecklistSessionSaved,iosOfflineFallbackRecoveryChecklistSessionKey,iosOfflineFallbackRecoveryChecklistSessionValue,iosOfflineFallbackRecoveryChecklistSessionClickedKey,iosOfflineFallbackRecoveryChecklistSessionClickedRoute,iosOfflineFallbackRecoveryChecklistSessionClickedLabel,iosOfflineFallbackRecoveryChecklistSessionClickedAt,iosOfflineFallbackRecoveryChecklistSessionSourceLabel,iosOfflineFallbackRecoveryChecklistCarryover,iosOfflineFallbackRecoveryChecklistCarryoverKey,iosOfflineFallbackRecoveryChecklistCarryoverRoute,iosOfflineFallbackRecoveryChecklistCarryoverLabel,iosOfflineFallbackRecoveryChecklistCarryoverSource,iosOfflineFallbackRecoveryChecklistCarryoverClickedAt,iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback,iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible,iosOfflineFallbackRecoveryChecklistCarryoverBannerKey,iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute,iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel,iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback,iosOfflineFallbackRecoveryChecklistCarryoverBannerClass,iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible,iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute,iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel,iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass,iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback,iosOfflineFallbackDocumentTitle,iosOfflineFallbackUpdatedAt",
    "Travel Planner iPhone Home Screen diagnostics",
    `- URL: ${window.location.href}`,
    `- displayMode: ${isStandaloneDisplay() ? "standalone" : "browser"}`,
    `- installSessionHandoffClicked: ${document.documentElement.dataset.iosInstallSessionHandoffClicked || "false"}`,
    `- installSessionHandoffKind: ${document.documentElement.dataset.iosInstallSessionHandoffKind || "(none)"}`,
    `- installSessionHandoffLabel: ${document.documentElement.dataset.iosInstallSessionHandoffLabel || "(none)"}`,
    `- installSessionHandoffClickedAt: ${document.documentElement.dataset.iosInstallSessionHandoffClickedAt || "(none)"}`,
    `- installSessionHandoffCarryover: ${document.documentElement.dataset.iosInstallSessionHandoffCarryover || "false"}`,
    `- installSessionHandoffStatusFeedback: ${document.documentElement.dataset.iosInstallSessionHandoffStatusFeedback || "(none)"}`,
    `- installSessionHandoffStorageFailed: ${document.documentElement.dataset.iosInstallSessionHandoffStorageFailed || "false"}`,
    `- installSessionHandoffSummaryVisible: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryVisible || "false"}`,
    `- installSessionHandoffSummaryClearVisible: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearVisible || "false"}`,
    `- installSessionHandoffSummaryClearLabel: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearLabel || "(none)"}`,
    `- installSessionHandoffSummaryClearTitle: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearTitle || "(none)"}`,
    `- installSessionHandoffSummaryClearAccessibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearAccessibleLabel || "(none)"}`,
    `- installSessionHandoffSummaryClearClicked: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearClicked || "false"}`,
    `- installSessionHandoffSummaryClearClickedAt: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearClickedAt || "(none)"}`,
    `- installSessionHandoffSummaryClearStatusFeedback: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearStatusFeedback || "(none)"}`,
    `- installSessionHandoffRestartHintVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartHintVisible || "false"}`,
    `- installSessionHandoffRestartHintReason: ${document.documentElement.dataset.iosInstallSessionHandoffRestartHintReason || "(none)"}`,
    `- installSessionHandoffRestartHintRole: ${document.documentElement.dataset.iosInstallSessionHandoffRestartHintRole || "(none)"}`,
    `- installSessionHandoffRestartHintAriaLive: ${document.documentElement.dataset.iosInstallSessionHandoffRestartHintAriaLive || "(none)"}`,
    `- installSessionHandoffRestartHintAriaAtomic: ${document.documentElement.dataset.iosInstallSessionHandoffRestartHintAriaAtomic || "(none)"}`,
    `- installSessionHandoffRestartGroupVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupVisible || "false"}`,
    `- installSessionHandoffRestartGroupRole: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupRole || "(none)"}`,
    `- installSessionHandoffRestartGroupAccessibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupAccessibleLabel || "(none)"}`,
    `- installSessionHandoffRestartGroupLabelledBy: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupLabelledBy || "(none)"}`,
    `- installSessionHandoffRestartGroupVisibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupVisibleLabel || "(none)"}`,
    `- installSessionHandoffRestartGroupLabelVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupLabelVisible || "false"}`,
    `- installSessionHandoffRestartGroupDescription: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupDescription || "(none)"}`,
    `- installSessionHandoffRestartGroupDescriptionVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupDescriptionVisible || "false"}`,
    `- installSessionHandoffRestartNextStep: ${document.documentElement.dataset.iosInstallSessionHandoffRestartNextStep || "(none)"}`,
    `- installSessionHandoffRestartNextStepVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartNextStepVisible || "false"}`,
    `- installSessionHandoffRestartGroupDescribedBy: ${document.documentElement.dataset.iosInstallSessionHandoffRestartGroupDescribedBy || "(none)"}`,
    `- installSessionHandoffRestartSmsVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsVisible || "false"}`,
    `- installSessionHandoffRestartSmsLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsLabel || "(none)"}`,
    `- installSessionHandoffRestartSmsTitle: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsTitle || "(none)"}`,
    `- installSessionHandoffRestartSmsAccessibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsAccessibleLabel || "(none)"}`,
    `- installSessionHandoffRestartSmsClicked: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsClicked || "false"}`,
    `- installSessionHandoffRestartSmsClickedAt: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsClickedAt || "(none)"}`,
    `- installSessionHandoffRestartSmsTargetAvailable: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsTargetAvailable || "false"}`,
    `- installSessionHandoffRestartSmsStatusFeedback: ${document.documentElement.dataset.iosInstallSessionHandoffRestartSmsStatusFeedback || "(none)"}`,
    `- installSessionHandoffRestartMailVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailVisible || "false"}`,
    `- installSessionHandoffRestartMailLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailLabel || "(none)"}`,
    `- installSessionHandoffRestartMailTitle: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailTitle || "(none)"}`,
    `- installSessionHandoffRestartMailAccessibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailAccessibleLabel || "(none)"}`,
    `- installSessionHandoffRestartMailClicked: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailClicked || "false"}`,
    `- installSessionHandoffRestartMailClickedAt: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailClickedAt || "(none)"}`,
    `- installSessionHandoffRestartMailTargetAvailable: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailTargetAvailable || "false"}`,
    `- installSessionHandoffRestartMailStatusFeedback: ${document.documentElement.dataset.iosInstallSessionHandoffRestartMailStatusFeedback || "(none)"}`,
    `- installSessionHandoffRestartQrVisible: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrVisible || "false"}`,
    `- installSessionHandoffRestartQrLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrLabel || "(none)"}`,
    `- installSessionHandoffRestartQrTitle: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrTitle || "(none)"}`,
    `- installSessionHandoffRestartQrAccessibleLabel: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrAccessibleLabel || "(none)"}`,
    `- installSessionHandoffRestartQrClicked: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrClicked || "false"}`,
    `- installSessionHandoffRestartQrClickedAt: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrClickedAt || "(none)"}`,
    `- installSessionHandoffRestartQrTargetAvailable: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrTargetAvailable || "false"}`,
    `- installSessionHandoffRestartQrStatusFeedback: ${document.documentElement.dataset.iosInstallSessionHandoffRestartQrStatusFeedback || "(none)"}`,
    `- installSessionHandoffSummaryCleared: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryCleared || "false"}`,
    `- installSessionHandoffSummaryClearedAt: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearedAt || "(none)"}`,
    `- installSessionHandoffSummaryClearStorageFailed: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryClearStorageFailed || "false"}`,
    `- installSessionHandoffSummaryRole: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryRole || "(none)"}`,
    `- installSessionHandoffSummaryAriaLive: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryAriaLive || "(none)"}`,
    `- installSessionHandoffSummaryAriaAtomic: ${document.documentElement.dataset.iosInstallSessionHandoffSummaryAriaAtomic || "(none)"}`,
    `- serviceWorker: ${"serviceWorker" in navigator ? navigator.serviceWorker.controller ? "controlled" : "supported-uncontrolled" : "unsupported"}`,
    `- appShell: ${iosHomeDockShellVersion || "(unknown)"}`,
    `- updatePromptVisible: ${document.getElementById("serviceWorkerUpdatePrompt") ? "true" : "false"}`,
    `- updatePromptApplied: ${document.getElementById("serviceWorkerUpdatePrompt")?.dataset.iosServiceWorkerUpdatePromptApplied || document.documentElement.dataset.iosServiceWorkerUpdatePromptApplied || "false"}`,
    `- updatePromptAppliedAt: ${document.getElementById("serviceWorkerUpdatePrompt")?.dataset.iosServiceWorkerUpdatePromptAppliedAt || document.documentElement.dataset.iosServiceWorkerUpdatePromptAppliedAt || "(none)"}`,
    `- updatePromptReloadPending: ${document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPending || "false"}`,
    `- updatePromptReloadPendingAt: ${document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPendingAt || "(none)"}`,
    `- updateReloadArrivalVisible: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalVisible || "false"}`,
    `- updateReloadArrivalArrivedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalArrivedAt || "(none)"}`,
    `- updateReloadArrivalProofLinkClicked: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClicked || "false"}`,
    `- updateReloadArrivalProofFocusTarget: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusTarget || "(none)"}`,
    `- updateReloadArrivalProofFocusScheduled: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusScheduled || "false"}`,
    `- updateReloadArrivalProofFocusApplied: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied || "false"}`,
    `- updateReloadArrivalProofFocusedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusedAt || "(none)"}`,
    `- updateReloadArrivalProofResaved: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofResaved || "false"}`,
    `- updateReloadArrivalProofResavedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofResavedAt || "(none)"}`,
    `- updateReloadArrivalNextAction: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalNextAction || "(none)"}`,
    `- updateReloadArrivalFinalGateFocusTarget: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusTarget || "(none)"}`,
    `- updateReloadArrivalFinalGateFocusScheduled: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusScheduled || "false"}`,
    `- updateReloadArrivalFinalGateFocusApplied: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusApplied || "false"}`,
    `- updateReloadArrivalFinalGateFocusedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusedAt || "(none)"}`,
    `- updateReloadArrivalFinalGateButtonLabel: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateButtonLabel || "(none)"}`,
    `- updateReloadArrivalFinalGateCommandCopied: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopied || "false"}`,
    `- updateReloadArrivalFinalGateCommandCopiedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopiedAt || "(none)"}`,
    `- updateReloadArrivalFinalGateCommandCopyMethod: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod || "(none)"}`,
    `- updateReloadArrivalCompletionStatusLinkVisible: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkVisible || "false"}`,
    `- updateReloadArrivalCompletionStatusLinkClicked: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClicked || "false"}`,
    `- updateReloadArrivalCompletionStatusLinkClickedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedAt || "(none)"}`,
    `- updateReloadArrivalCompletionStatusLinkClickedRoute: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedRoute || "(none)"}`,
    `- updateReloadArrivalCompletionStatusLinkClickedStatusFeedback: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedStatusFeedback || "(none)"}`,
    `- updateReloadArrivalStatusReviewPending: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPending || "false"}`,
    `- updateReloadArrivalStatusReviewRoute: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewRoute || "(none)"}`,
    `- updateReloadArrivalStatusReviewPendingAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPendingAt || "(none)"}`,
    `- updateReloadArrivalStatusReviewVisible: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewVisible || "false"}`,
    `- updateReloadArrivalStatusReviewArrivedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewArrivedAt || "(none)"}`,
    `- updateReloadArrivalStatusReviewDismissed: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissed || "false"}`,
    `- updateReloadArrivalStatusReviewDismissButtonClicked: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClicked || "false"}`,
    `- updateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback || "(none)"}`,
    `- updateReloadArrivalStatusReviewActionLinkVisible: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkVisible || "false"}`,
    `- updateReloadArrivalStatusReviewActionLinkRoute: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkRoute || "(none)"}`,
    `- updateReloadArrivalStatusReviewActionLinkClicked: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClicked || "false"}`,
    `- updateReloadArrivalStatusReviewActionLinkClickedAt: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClickedAt || "(none)"}`,
    `- updateReloadArrivalStatusReviewActionLinkFocusApplied: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusApplied || "false"}`,
    `- updateReloadArrivalStatusReviewActionLinkStatusFeedback: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkStatusFeedback || "(none)"}`,
    `- updateReloadArrivalStatusReviewCompletionCueVisible: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueVisible || "false"}`,
    `- updateReloadArrivalStatusReviewCompletionCueTarget: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueTarget || "(none)"}`,
    `- updateReloadArrivalStatusReviewCompletionCueRefreshTarget: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueRefreshTarget || "(none)"}`,
    `- installCompletionNextGateCueVisible: ${document.documentElement.dataset.iosInstallCompletionNextGateCueVisible || "false"}`,
    `- installCompletionNextGateCueLabel: ${document.documentElement.dataset.iosInstallCompletionNextGateCueLabel || "(none)"}`,
    `- installCompletionNextGateCueState: ${document.documentElement.dataset.iosInstallCompletionNextGateCueState || "(none)"}`,
    `- installCompletionNextGateCueReason: ${document.documentElement.dataset.iosInstallCompletionNextGateCueReason || "(none)"}`,
    `- installCompletionNextGateCueTarget: ${document.documentElement.dataset.iosInstallCompletionNextGateCueTarget || "(none)"}`,
    `- installCompletionNextGateCueActionLinkVisible: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkVisible || "false"}`,
    `- installCompletionNextGateCueActionLinkRoute: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkRoute || "(none)"}`,
    `- installCompletionNextGateCueActionLinkLabel: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkLabel || "(none)"}`,
    `- installCompletionNextGateCueActionLinkClicked: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkClicked || "false"}`,
    `- installCompletionNextGateCueActionLinkClickedAt: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkClickedAt || "(none)"}`,
    `- installCompletionNextGateCueActionLinkFocusTarget: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusTarget || "(none)"}`,
    `- installCompletionNextGateCueActionLinkFocusApplied: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusApplied || "false"}`,
    `- installCompletionNextGateCueActionLinkFocusedAt: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusedAt || "(none)"}`,
    `- installCompletionNextGateCueActionLinkStatusFeedback: ${document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkStatusFeedback || "(none)"}`,
    `- updateReloadArrivalDismissed: ${document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalDismissed || "false"}`,
    `- online: ${navigator.onLine === false ? "false" : "true"}`,
    `- installProof: ${state.proof ? "saved" : "not-saved"}`,
    `- homeSnapshots: ${countLocalStorageKeys("travel-planner:home-plan-snapshot:v1:")}`,
    `- detailSnapshots: ${countLocalStorageKeys("travel-planner:plan-detail-snapshot:v1:")}`,
    `- latestSnapshotSavedAt: ${formatIosHomeDockSnapshotTime(snapshots) || "(none)"}`,
    `- newPlanDraft: ${draft.state}`,
    `- newPlanDraftUpdatedAt: ${draft.updatedAt || "(none)"}`,
    `- newPlanDraftFieldCount: ${draft.fieldCount}`,
    "- newPlanDraftSecretFields: excluded",
    "",
    "Checklist:",
    ...checklistLines,
    "",
    "Latest snapshotted plans:",
    ...(planLines.length ? planLines : ["- (none)"]),
  ].join("\n");
}

function buildIosHomeDockDraftStatusText() {
  const draft = readNewPlanDraftDiagnostics();
  return [
    "Travel Planner iPhone new-plan draft status",
    `url=${new URL("/#planForm", window.location.href).toString()}`,
    `draft=${draft.state}`,
    `updatedAt=${draft.updatedAt || "(none)"}`,
    `nonEmptyFieldCount=${draft.fieldCount}`,
    "fieldValues=excluded",
    "llmSecrets=excluded",
  ].join("\n");
}

function buildIosHomeDockDraftStatusSmsText() {
  const draft = readNewPlanDraftDiagnostics();
  return [
    `Travel draft=${draft.state}`,
    `fields=${draft.fieldCount}`,
    `updatedAt=${draft.updatedAt || "none"}`,
    "values=excluded",
    "secrets=excluded",
    new URL("/#planForm", window.location.href).toString(),
  ].join(" | ");
}

function bindIosHomeDockDraftStatusCopyButton() {
  const button = document.getElementById("iosHomeDockDraftStatusCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockDraftStatusBound === "true") return;
  button.dataset.iosHomeDockDraftStatusBound = "true";
  button.addEventListener("click", async () => {
    const originalLabel = button.textContent;
    const text = buildIosHomeDockDraftStatusText();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "초안 상태 복사됨";
      if (status) status.textContent = "새 플랜 draft 상태를 비밀값 없이 복사했습니다. 입력 내용은 제외했습니다.";
    } catch {
      window.prompt("새 플랜 draft 상태를 복사하세요. 입력 내용과 LLM 비밀값은 제외했습니다.", text);
      button.textContent = "초안 상태 표시됨";
      if (status) status.textContent = "클립보드 접근이 막혀 새 플랜 draft 상태를 prompt로 표시했습니다.";
    }
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1800);
  });
}

function bindIosHomeDockDraftStatusMessageLinks() {
  const smsLink = document.getElementById("iosHomeDockDraftStatusSmsLink");
  const mailLink = document.getElementById("iosHomeDockDraftStatusMailLink");
  const status = document.getElementById("iosInstallStatus");
  const prepareLinks = () => {
    const smsText = buildIosHomeDockDraftStatusSmsText();
    const mailText = buildIosHomeDockDraftStatusText();
    if (smsLink) smsLink.href = `sms:?&body=${encodeURIComponent(smsText)}`;
    if (mailLink) mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner 새 플랜 초안 상태")}&body=${encodeURIComponent(mailText)}`;
  };
  if (smsLink && smsLink.dataset.iosHomeDockDraftStatusSmsBound !== "true") {
    smsLink.dataset.iosHomeDockDraftStatusSmsBound = "true";
    smsLink.addEventListener("click", () => {
      prepareLinks();
      if (status) status.textContent = "새 플랜 draft 상태를 비밀값 없이 문자로 보냅니다. 입력 내용은 제외했습니다.";
    });
  }
  if (mailLink && mailLink.dataset.iosHomeDockDraftStatusMailBound !== "true") {
    mailLink.dataset.iosHomeDockDraftStatusMailBound = "true";
    mailLink.addEventListener("click", () => {
      prepareLinks();
      if (status) status.textContent = "새 플랜 draft 상태를 비밀값 없이 메일로 보냅니다. 입력 내용은 제외했습니다.";
    });
  }
  prepareLinks();
}

function highlightIosHomeDockDraftResumeTarget(form) {
  if (!form) return;
  form.classList.remove("is-draft-resume-target");
  window.setTimeout(() => form.classList.add("is-draft-resume-target"), 0);
  window.setTimeout(() => form.classList.remove("is-draft-resume-target"), 2400);
}

function iosNewPlanShortcutInstallReturnConfig() {
  const isStandalone = typeof isStandaloneDisplay === "function" && isStandaloneDisplay();
  const isIosSafari = typeof isLikelyIosSafari === "function" && isLikelyIosSafari();
  if (isStandalone) {
    return {
      mode: "home-screen-app",
      href: "/ios-install-status",
      label: "설치 확인",
      context: "홈 화면 앱 모드입니다. 설치 완료 상태에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인합니다.",
      destination: "설치 완료 상태로 이동합니다.",
    };
  }
  if (isIosSafari) {
    return {
      mode: "ios-safari",
      href: "/install.html#iosInstallFastPathTitle",
      label: "1분 설치",
      context: "iPhone Safari에서 열렸습니다. 1분 설치 루트에서 공유 버튼과 홈 화면 추가 단계를 이어갑니다.",
      destination: "설치 가이드 1분 설치 루트로 이동합니다.",
    };
  }
  return {
    mode: "browser-tab",
    href: "/install.html#iosInstallFastPathTitle",
    label: "1분 설치",
    context: "브라우저 탭에서 열렸습니다. 1분 설치 루트에서 iPhone Safari와 홈 화면 추가 단계를 다시 확인합니다.",
    destination: "설치 가이드 1분 설치 루트로 이동합니다.",
  };
}

function iosNewPlanShortcutInstallRouteReturnText() {
  return iosNewPlanShortcutInstallReturnConfig().context;
}

function iosNewPlanShortcutInstallGroupContextText() {
  const isStandalone = typeof isStandaloneDisplay === "function" && isStandaloneDisplay();
  if (isStandalone) return "설치 확인과 안내 닫기";
  return "1분 설치 루트 복귀, 설치 완료 상태 확인, 안내 닫기";
}

function resetIosNewPlanShortcutInstallDismissLabel(label) {
  if (!label) return;

  label.textContent = "설치/닫기";
  label.title = "새 플랜 shortcut 설치 확인, 설치 루트 복귀, 완료 상태 확인, 안내 닫기 action group";
  label.setAttribute("aria-label", "새 플랜 shortcut 설치 확인, 설치 루트 복귀, 완료 상태 확인, 안내 닫기 action group");
}

function configureIosNewPlanShortcutInstallDismissLabel(label) {
  if (!label) return;

  const isStandalone = typeof isStandaloneDisplay === "function" && isStandaloneDisplay();
  label.textContent = isStandalone ? "설치 확인/닫기" : "1분 설치/닫기";
  label.title = isStandalone
    ? "홈 화면 앱 모드에서는 설치 완료 상태 확인과 안내 닫기를 제공합니다."
    : "iPhone Safari 또는 브라우저 탭에서는 1분 설치 루트, 설치 완료 상태 확인, 안내 닫기를 제공합니다.";
  label.setAttribute("aria-label", label.title);
}

function resetIosNewPlanShortcutInstallRouteLink(link) {
  if (!link) return;

  link.href = "/install.html#iosInstallFastPathTitle";
  link.textContent = "1분 설치";
  link.title = "iPhone 홈 화면 설치 가이드의 1분 설치 루트로 돌아갑니다. draft 값과 LLM 비밀값은 포함하지 않습니다.";
  link.setAttribute("aria-label", "iPhone 홈 화면 설치 가이드 1분 설치 루트로 돌아가기");
  link.setAttribute("aria-describedby", "newPlanShortcutInstallDismissLabel newPlanShortcutHint newPlanDraftPrivacyHint");
}

function resetIosNewPlanShortcutInstallStatusLink(link) {
  if (!link) return;

  link.href = "/ios-install-status";
  link.textContent = "설치 완료 상태";
  link.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인합니다.";
  link.setAttribute("aria-label", "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 iPhone 설치 완료 상태 페이지 열기");
  link.setAttribute("aria-describedby", "newPlanShortcutInstallDismissLabel newPlanShortcutHint newPlanDraftPrivacyHint");
}

function configureIosNewPlanShortcutInstallRouteLink(link) {
  if (!link) return;

  const installReturn = iosNewPlanShortcutInstallReturnConfig();
  link.hidden = false;
  link.href = installReturn.href;
  link.textContent = installReturn.label;
  link.title = `${installReturn.context} draft 값과 LLM 비밀값은 포함하지 않습니다.`;
  link.setAttribute("aria-label", `${installReturn.context} draft 값과 LLM 비밀값 없이 열기`);
  link.setAttribute("aria-describedby", "newPlanShortcutInstallDismissLabel newPlanShortcutHint newPlanDraftPrivacyHint");
}

function configureIosNewPlanShortcutInstallStatusLink(link) {
  if (!link) return;

  if (typeof isStandaloneDisplay === "function" && isStandaloneDisplay()) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href = "/ios-install-status";
  link.title = "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인합니다.";
  link.setAttribute("aria-label", "Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 iPhone 설치 완료 상태 페이지 열기");
  link.setAttribute("aria-describedby", "newPlanShortcutInstallDismissLabel newPlanShortcutHint newPlanDraftPrivacyHint");
}

function updateIosNewPlanShortcutHint(message) {
  const hint = document.getElementById("newPlanShortcutHint");
  const group = document.getElementById("newPlanShortcutHintGroup");
  const formUrlCopyButton = document.getElementById("newPlanShortcutHintFormUrlCopyButton");
  const formUrlShareButton = document.getElementById("newPlanShortcutHintFormUrlShareButton");
  const formUrlSmsLink = document.getElementById("newPlanShortcutHintFormUrlSmsLink");
  const formUrlMailLink = document.getElementById("newPlanShortcutHintFormUrlMailLink");
  const draftStatusCopyButton = document.getElementById("newPlanShortcutHintDraftStatusCopyButton");
  const draftStatusShareButton = document.getElementById("newPlanShortcutHintDraftStatusShareButton");
  const draftStatusSmsLink = document.getElementById("newPlanShortcutHintDraftStatusSmsLink");
  const draftStatusMailLink = document.getElementById("newPlanShortcutHintDraftStatusMailLink");
  const installDismissLabel = document.getElementById("newPlanShortcutInstallDismissLabel");
  const installGuideLink = document.getElementById("newPlanShortcutHintInstallGuideLink");
  const installStatusLink = document.getElementById("newPlanShortcutHintInstallStatusLink");
  const dismissButton = document.getElementById("newPlanShortcutHintDismissButton");
  if (!hint) return;
  if (group) {
    group.hidden = false;
    resetIosNewPlanShortcutGroupMetadata(group);
  }
  hint.className = "form-message";
  hint.textContent = message;
  if (formUrlCopyButton) {
    formUrlCopyButton.hidden = false;
    formUrlCopyButton.title = "새 플랜 입력 폼 링크만 복사합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.";
    formUrlCopyButton.setAttribute("aria-label", "새 플랜 입력 폼 링크만 복사");
    formUrlCopyButton.setAttribute("aria-describedby", "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (formUrlShareButton) {
    formUrlShareButton.hidden = false;
    formUrlShareButton.title = "새 플랜 입력 폼 링크만 공유합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.";
    formUrlShareButton.setAttribute("aria-label", "새 플랜 입력 폼 링크만 공유");
    formUrlShareButton.setAttribute("aria-describedby", "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (formUrlSmsLink) {
    const formUrl = new URL("/#planForm", window.location.href).toString();
    formUrlSmsLink.hidden = false;
    formUrlSmsLink.href = `sms:?&body=${encodeURIComponent(`Travel Planner 새 플랜 입력: ${formUrl}`)}`;
    formUrlSmsLink.title = "새 플랜 입력 폼 링크만 문자로 보냅니다. draft 값과 LLM 비밀값은 포함하지 않습니다.";
    formUrlSmsLink.setAttribute("aria-label", "새 플랜 입력 폼 링크만 문자로 보내기");
    formUrlSmsLink.setAttribute("aria-describedby", "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (formUrlMailLink) {
    const formUrl = new URL("/#planForm", window.location.href).toString();
    formUrlMailLink.hidden = false;
    formUrlMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner 새 플랜 입력 링크")}&body=${encodeURIComponent(["Travel Planner 새 플랜 입력 폼", `url=${formUrl}`, "draftValues=excluded", "llmSecrets=excluded"].join("\n"))}`;
    formUrlMailLink.title = "새 플랜 입력 폼 링크만 메일로 보냅니다. draft 값과 LLM 비밀값은 포함하지 않습니다.";
    formUrlMailLink.setAttribute("aria-label", "새 플랜 입력 폼 링크만 메일로 보내기");
    formUrlMailLink.setAttribute("aria-describedby", "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (draftStatusCopyButton) {
    draftStatusCopyButton.hidden = false;
    draftStatusCopyButton.title = "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 복사합니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    draftStatusCopyButton.setAttribute("aria-label", "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 복사");
    draftStatusCopyButton.setAttribute("aria-describedby", "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (draftStatusShareButton) {
    draftStatusShareButton.hidden = false;
    draftStatusShareButton.title = "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 공유합니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    draftStatusShareButton.setAttribute("aria-label", "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 공유");
    draftStatusShareButton.setAttribute("aria-describedby", "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (draftStatusSmsLink) {
    draftStatusSmsLink.hidden = false;
    draftStatusSmsLink.href = `sms:?&body=${encodeURIComponent(buildIosHomeDockDraftStatusSmsText())}`;
    draftStatusSmsLink.title = "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 문자로 보냅니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    draftStatusSmsLink.setAttribute("aria-label", "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 문자로 보내기");
    draftStatusSmsLink.setAttribute("aria-describedby", "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  if (draftStatusMailLink) {
    draftStatusMailLink.hidden = false;
    draftStatusMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner 새 플랜 초안 상태")}&body=${encodeURIComponent(buildIosHomeDockDraftStatusText())}`;
    draftStatusMailLink.title = "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 메일로 보냅니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    draftStatusMailLink.setAttribute("aria-label", "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 메일로 보내기");
    draftStatusMailLink.setAttribute("aria-describedby", "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
  configureIosNewPlanShortcutInstallDismissLabel(installDismissLabel);
  configureIosNewPlanShortcutInstallRouteLink(installGuideLink);
  configureIosNewPlanShortcutInstallStatusLink(installStatusLink);
  if (dismissButton) {
    dismissButton.hidden = false;
    dismissButton.title = "새 플랜 shortcut 도착 안내만 닫습니다. 저장된 초안과 현재 입력값은 유지합니다.";
    dismissButton.setAttribute("aria-label", "새 플랜 shortcut 도착 안내만 닫기. 저장된 초안과 현재 입력값은 유지");
    dismissButton.setAttribute("aria-describedby", "newPlanShortcutInstallDismissLabel newPlanShortcutHint newPlanDraftPrivacyHint");
  }
}

function setIosNewPlanShortcutHintActionState(state, label) {
  const group = document.getElementById("newPlanShortcutHintGroup");
  if (!group) return;
  group.dataset.actionState = state;
  group.setAttribute("aria-label", label || "새 플랜 shortcut 도착 안내");
  group.title = label || "새 플랜 shortcut 도착 안내";
  if (state === "busy") {
    group.setAttribute("aria-busy", "true");
  } else {
    group.removeAttribute("aria-busy");
  }
}

function resetIosNewPlanShortcutGroupMetadata(group = document.getElementById("newPlanShortcutHintGroup")) {
  if (!group || group.hidden || group.getAttribute("aria-busy") === "true") return;

  const installReturn = iosNewPlanShortcutInstallReturnConfig();
  group.removeAttribute("data-action-state");
  group.dataset.installActionMode = installReturn.mode;
  group.dataset.installActionHref = installReturn.href;
  group.dataset.installActionLabel = installReturn.label;
  group.dataset.installActionDestination = installReturn.destination;
  group.dataset.installActionUpdatedAt = new Date().toISOString();
  group.setAttribute("aria-label", `새 플랜 shortcut 도착 안내와 입력 링크, 초안 상태, ${iosNewPlanShortcutInstallGroupContextText()} handoff`);
  group.setAttribute("aria-describedby", "newPlanShortcutHint newPlanShortcutInputLinkLabel newPlanShortcutDraftStatusLabel newPlanShortcutInstallDismissLabel newPlanDraftPrivacyHint");
  group.title = `새 플랜 shortcut 도착 안내, 입력 링크 handoff, 초안 상태 handoff, ${iosNewPlanShortcutInstallGroupContextText()}를 제공합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.`;
}

function resetIosNewPlanShortcutButtonMetadata(button, type) {
  if (!button) return;
  const configs = {
    formCopy: {
      title: "새 플랜 입력 폼 링크만 복사합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.",
      ariaLabel: "새 플랜 입력 폼 링크만 복사",
      describedBy: "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint",
    },
    formShare: {
      title: "새 플랜 입력 폼 링크만 공유합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.",
      ariaLabel: "새 플랜 입력 폼 링크만 공유",
      describedBy: "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint",
    },
    draftCopy: {
      title: "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 복사합니다. 입력 내용과 LLM 비밀값은 제외합니다.",
      ariaLabel: "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 복사",
      describedBy: "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint",
    },
    draftShare: {
      title: "새 플랜 shortcut 도착 상태에서 이 iPhone 브라우저의 draft 상태만 공유합니다. 입력 내용과 LLM 비밀값은 제외합니다.",
      ariaLabel: "새 플랜 shortcut 도착 상태의 draft 상태 비밀값 제외 공유",
      describedBy: "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint",
    },
  };
  const config = configs[type];
  if (!config) return;
  button.title = config.title;
  button.setAttribute("aria-label", config.ariaLabel);
  button.setAttribute("aria-describedby", config.describedBy);
}

function resetIosNewPlanShortcutLinkMetadata(link, type) {
  if (!link) return;

  const formDescribedBy = "newPlanShortcutInputLinkLabel newPlanShortcutHint newPlanDraftPrivacyHint";
  const draftDescribedBy = "newPlanShortcutDraftStatusLabel newPlanShortcutHint newPlanDraftPrivacyHint";
  const configs = {
    formSms: {
      title: "새 플랜 입력 폼 링크만 문자 앱으로 보냅니다. 초안 입력값과 LLM secret은 포함하지 않습니다.",
      ariaLabel: "새 플랜 입력 폼 링크만 문자로 보내기",
      ariaDescribedBy: formDescribedBy,
    },
    formMail: {
      title: "새 플랜 입력 폼 링크만 메일 앱으로 보냅니다. 초안 입력값과 LLM secret은 포함하지 않습니다.",
      ariaLabel: "새 플랜 입력 폼 링크만 메일로 보내기",
      ariaDescribedBy: formDescribedBy,
    },
    draftSms: {
      title: "새 플랜 초안 입력값 없이 상태 요약만 문자 앱으로 보냅니다.",
      ariaLabel: "새 플랜 초안 상태 요약만 문자로 보내기",
      ariaDescribedBy: draftDescribedBy,
    },
    draftMail: {
      title: "새 플랜 초안 입력값 없이 상태 요약만 메일 앱으로 보냅니다.",
      ariaLabel: "새 플랜 초안 상태 요약만 메일로 보내기",
      ariaDescribedBy: draftDescribedBy,
    },
  };
  const config = configs[type];
  if (!config) return;

  link.title = config.title;
  link.setAttribute("aria-label", config.ariaLabel);
  link.setAttribute("aria-describedby", config.ariaDescribedBy);
}

function clearIosNewPlanShortcutHint() {
  const hint = document.getElementById("newPlanShortcutHint");
  const group = document.getElementById("newPlanShortcutHintGroup");
  const formUrlCopyButton = document.getElementById("newPlanShortcutHintFormUrlCopyButton");
  const formUrlShareButton = document.getElementById("newPlanShortcutHintFormUrlShareButton");
  const formUrlSmsLink = document.getElementById("newPlanShortcutHintFormUrlSmsLink");
  const formUrlMailLink = document.getElementById("newPlanShortcutHintFormUrlMailLink");
  const draftStatusCopyButton = document.getElementById("newPlanShortcutHintDraftStatusCopyButton");
  const draftStatusShareButton = document.getElementById("newPlanShortcutHintDraftStatusShareButton");
  const draftStatusSmsLink = document.getElementById("newPlanShortcutHintDraftStatusSmsLink");
  const draftStatusMailLink = document.getElementById("newPlanShortcutHintDraftStatusMailLink");
  const installDismissLabel = document.getElementById("newPlanShortcutInstallDismissLabel");
  const installGuideLink = document.getElementById("newPlanShortcutHintInstallGuideLink");
  const installStatusLink = document.getElementById("newPlanShortcutHintInstallStatusLink");
  const dismissButton = document.getElementById("newPlanShortcutHintDismissButton");
  if (!hint) return;
  hint.className = "form-message hidden";
  hint.textContent = "";
  if (group) {
    group.hidden = true;
    group.removeAttribute("aria-busy");
    group.removeAttribute("data-action-state");
    delete group.dataset.installActionMode;
    delete group.dataset.installActionHref;
    delete group.dataset.installActionLabel;
    delete group.dataset.installActionDestination;
    delete group.dataset.installActionUpdatedAt;
    group.setAttribute("aria-label", "새 플랜 shortcut 도착 안내와 입력 링크, 초안 상태, 설치/닫기 handoff");
    group.setAttribute("aria-describedby", "newPlanShortcutHint newPlanShortcutInputLinkLabel newPlanShortcutDraftStatusLabel newPlanShortcutInstallDismissLabel newPlanDraftPrivacyHint");
    group.removeAttribute("title");
  }
  if (formUrlCopyButton) formUrlCopyButton.hidden = true;
  if (formUrlShareButton) formUrlShareButton.hidden = true;
  if (formUrlSmsLink) formUrlSmsLink.hidden = true;
  if (formUrlMailLink) formUrlMailLink.hidden = true;
  if (draftStatusCopyButton) draftStatusCopyButton.hidden = true;
  if (draftStatusShareButton) draftStatusShareButton.hidden = true;
  if (draftStatusSmsLink) draftStatusSmsLink.hidden = true;
  if (draftStatusMailLink) draftStatusMailLink.hidden = true;
  resetIosNewPlanShortcutInstallDismissLabel(installDismissLabel);
  resetIosNewPlanShortcutInstallRouteLink(installGuideLink);
  resetIosNewPlanShortcutInstallStatusLink(installStatusLink);
  if (installGuideLink) installGuideLink.hidden = true;
  if (installStatusLink) installStatusLink.hidden = true;
  if (dismissButton) dismissButton.hidden = true;
}

function bindIosNewPlanShortcutHintDismiss() {
  const form = document.getElementById("planForm");
  const formUrlCopyButton = document.getElementById("newPlanShortcutHintFormUrlCopyButton");
  const formUrlShareButton = document.getElementById("newPlanShortcutHintFormUrlShareButton");
  const formUrlSmsLink = document.getElementById("newPlanShortcutHintFormUrlSmsLink");
  const formUrlMailLink = document.getElementById("newPlanShortcutHintFormUrlMailLink");
  const draftStatusCopyButton = document.getElementById("newPlanShortcutHintDraftStatusCopyButton");
  const draftStatusShareButton = document.getElementById("newPlanShortcutHintDraftStatusShareButton");
  const draftStatusSmsLink = document.getElementById("newPlanShortcutHintDraftStatusSmsLink");
  const draftStatusMailLink = document.getElementById("newPlanShortcutHintDraftStatusMailLink");
  const installGuideLink = document.getElementById("newPlanShortcutHintInstallGuideLink");
  const installStatusLink = document.getElementById("newPlanShortcutHintInstallStatusLink");
  const dismissButton = document.getElementById("newPlanShortcutHintDismissButton");
  if (!form || form.dataset.iosNewPlanShortcutHintDismissBound === "true") return;
  form.dataset.iosNewPlanShortcutHintDismissBound = "true";
  form.addEventListener("input", clearIosNewPlanShortcutHint);
  form.addEventListener("change", clearIosNewPlanShortcutHint);
  if (formUrlCopyButton) {
    formUrlCopyButton.addEventListener("click", async () => {
      if (formUrlCopyButton.dataset.iosNewPlanShortcutActionBusy === "true") {
        updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크 복사가 이미 진행 중입니다. draft 값과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크 복사가 이미 진행 중입니다.");
        return;
      }
      const originalLabel = formUrlCopyButton.textContent;
      const url = new URL("/#planForm", window.location.href).toString();
      formUrlCopyButton.dataset.iosNewPlanShortcutActionBusy = "true";
      formUrlCopyButton.disabled = true;
      formUrlCopyButton.setAttribute("aria-busy", "true");
      formUrlCopyButton.textContent = "폼 링크 복사 중";
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 값 없이 폼 링크를 복사하는 중입니다.");
      try {
        await navigator.clipboard.writeText(url);
        formUrlCopyButton.textContent = "폼 링크 복사됨";
        updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크를 복사했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 입력 폼 링크 복사가 완료됐습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
      } catch {
        window.prompt("새 플랜 입력 폼 링크를 복사하세요. draft 값과 LLM 비밀값은 포함하지 않습니다.", url);
        formUrlCopyButton.textContent = "폼 링크 표시됨";
        updateIosNewPlanShortcutHint("클립보드 접근이 막혀 새 플랜 입력 폼 링크를 prompt로 표시했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
        setIosNewPlanShortcutHintActionState("fallback", "새 플랜 입력 폼 링크를 prompt로 표시했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
      }
      window.setTimeout(() => {
        formUrlCopyButton.dataset.iosNewPlanShortcutActionBusy = "false";
        formUrlCopyButton.disabled = false;
        formUrlCopyButton.removeAttribute("aria-busy");
        formUrlCopyButton.textContent = originalLabel;
        resetIosNewPlanShortcutButtonMetadata(formUrlCopyButton, "formCopy");
        resetIosNewPlanShortcutGroupMetadata();
      }, 1800);
    });
  }
  if (formUrlShareButton) {
    formUrlShareButton.addEventListener("click", async () => {
      if (formUrlShareButton.dataset.iosNewPlanShortcutActionBusy === "true") {
        updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크 공유가 이미 진행 중입니다. draft 값과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크 공유가 이미 진행 중입니다.");
        return;
      }
      const originalLabel = formUrlShareButton.textContent;
      const url = new URL("/#planForm", window.location.href).toString();
      formUrlShareButton.dataset.iosNewPlanShortcutActionBusy = "true";
      formUrlShareButton.disabled = true;
      formUrlShareButton.setAttribute("aria-busy", "true");
      formUrlShareButton.textContent = "폼 링크 공유 중";
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 값 없이 폼 링크를 공유하는 중입니다.");
      try {
        if (navigator.share) {
          await navigator.share({
            title: "Travel Planner 새 플랜 입력",
            text: "Travel Planner 새 플랜 입력 폼",
            url,
          });
          formUrlShareButton.textContent = "폼 링크 공유됨";
          updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크를 공유했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
          setIosNewPlanShortcutHintActionState("done", "새 플랜 입력 폼 링크 공유가 완료됐습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
        } else {
          await navigator.clipboard.writeText(url);
          formUrlShareButton.textContent = "폼 링크 복사됨";
          updateIosNewPlanShortcutHint("공유를 열 수 없어 새 플랜 입력 폼 링크를 복사했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
          setIosNewPlanShortcutHintActionState("fallback", "공유를 열 수 없어 새 플랜 입력 폼 링크를 복사했습니다.");
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          formUrlShareButton.textContent = "공유 취소됨";
          updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크 공유를 취소했습니다. draft 값과 LLM 비밀값은 공유하지 않았습니다.");
          setIosNewPlanShortcutHintActionState("cancelled", "새 플랜 입력 폼 링크 공유가 취소됐습니다. draft 값과 LLM 비밀값은 공유하지 않았습니다.");
        } else {
          try {
            await navigator.clipboard.writeText(url);
            formUrlShareButton.textContent = "폼 링크 복사됨";
            updateIosNewPlanShortcutHint("공유를 완료하지 못해 새 플랜 입력 폼 링크를 복사했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
            setIosNewPlanShortcutHintActionState("fallback", "공유를 완료하지 못해 새 플랜 입력 폼 링크를 복사했습니다.");
          } catch {
            window.prompt("새 플랜 입력 폼 링크를 공유하세요. draft 값과 LLM 비밀값은 포함하지 않습니다.", url);
            formUrlShareButton.textContent = "폼 링크 표시됨";
            updateIosNewPlanShortcutHint("공유와 클립보드 접근이 막혀 새 플랜 입력 폼 링크를 prompt로 표시했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
            setIosNewPlanShortcutHintActionState("fallback", "새 플랜 입력 폼 링크를 prompt로 표시했습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
          }
        }
      } finally {
        window.setTimeout(() => {
          formUrlShareButton.dataset.iosNewPlanShortcutActionBusy = "false";
          formUrlShareButton.disabled = false;
          formUrlShareButton.removeAttribute("aria-busy");
          formUrlShareButton.textContent = originalLabel;
          resetIosNewPlanShortcutButtonMetadata(formUrlShareButton, "formShare");
          resetIosNewPlanShortcutGroupMetadata();
        }, 1800);
      }
    });
  }
  if (formUrlSmsLink) {
    formUrlSmsLink.addEventListener("click", (event) => {
      if (formUrlSmsLink.dataset.iosNewPlanShortcutActionBusy === "true") {
        event.preventDefault();
        updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크 문자 handoff가 이미 열리는 중입니다. draft 값과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크 문자 handoff가 이미 열리는 중입니다.");
        return;
      }
      const originalLabel = formUrlSmsLink.textContent;
      const formUrl = new URL("/#planForm", window.location.href).toString();
      formUrlSmsLink.dataset.iosNewPlanShortcutActionBusy = "true";
      formUrlSmsLink.setAttribute("aria-busy", "true");
      formUrlSmsLink.setAttribute("aria-disabled", "true");
      formUrlSmsLink.textContent = "폼 문자 여는 중";
      formUrlSmsLink.href = `sms:?&body=${encodeURIComponent(`Travel Planner 새 플랜 입력: ${formUrl}`)}`;
      updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크만 문자로 보냅니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크를 draft 값 없이 문자로 보내는 중입니다.");
      window.setTimeout(() => {
        formUrlSmsLink.dataset.iosNewPlanShortcutActionBusy = "false";
        formUrlSmsLink.removeAttribute("aria-busy");
        formUrlSmsLink.removeAttribute("aria-disabled");
        formUrlSmsLink.textContent = originalLabel;
        resetIosNewPlanShortcutLinkMetadata(formUrlSmsLink, "formSms");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 폼 링크 문자 handoff를 열었습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
        window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
      }, 2200);
    });
  }
  if (formUrlMailLink) {
    formUrlMailLink.addEventListener("click", (event) => {
      if (formUrlMailLink.dataset.iosNewPlanShortcutActionBusy === "true") {
        event.preventDefault();
        updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크 메일 handoff가 이미 열리는 중입니다. draft 값과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크 메일 handoff가 이미 열리는 중입니다.");
        return;
      }
      const originalLabel = formUrlMailLink.textContent;
      const formUrl = new URL("/#planForm", window.location.href).toString();
      formUrlMailLink.dataset.iosNewPlanShortcutActionBusy = "true";
      formUrlMailLink.setAttribute("aria-busy", "true");
      formUrlMailLink.setAttribute("aria-disabled", "true");
      formUrlMailLink.textContent = "폼 메일 여는 중";
      formUrlMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner 새 플랜 입력 링크")}&body=${encodeURIComponent(["Travel Planner 새 플랜 입력 폼", `url=${formUrl}`, "draftValues=excluded", "llmSecrets=excluded"].join("\n"))}`;
      updateIosNewPlanShortcutHint("새 플랜 입력 폼 링크만 메일로 보냅니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 폼 링크를 draft 값 없이 메일로 보내는 중입니다.");
      window.setTimeout(() => {
        formUrlMailLink.dataset.iosNewPlanShortcutActionBusy = "false";
        formUrlMailLink.removeAttribute("aria-busy");
        formUrlMailLink.removeAttribute("aria-disabled");
        formUrlMailLink.textContent = originalLabel;
        resetIosNewPlanShortcutLinkMetadata(formUrlMailLink, "formMail");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 폼 링크 메일 handoff를 열었습니다. draft 값과 LLM 비밀값은 포함하지 않았습니다.");
        window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
      }, 2200);
    });
  }
  if (draftStatusCopyButton) {
    draftStatusCopyButton.addEventListener("click", async () => {
      if (draftStatusCopyButton.dataset.iosNewPlanShortcutActionBusy === "true") {
        updateIosNewPlanShortcutHint("새 플랜 draft 상태 복사가 이미 진행 중입니다. 입력 내용과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태 복사가 이미 진행 중입니다.");
        return;
      }
      const originalLabel = draftStatusCopyButton.textContent;
      const text = buildIosHomeDockDraftStatusText();
      draftStatusCopyButton.dataset.iosNewPlanShortcutActionBusy = "true";
      draftStatusCopyButton.disabled = true;
      draftStatusCopyButton.setAttribute("aria-busy", "true");
      draftStatusCopyButton.textContent = "초안 상태 복사 중";
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태를 비밀값 없이 복사하는 중입니다.");
      try {
        await navigator.clipboard.writeText(text);
        draftStatusCopyButton.textContent = "초안 상태 복사됨";
        updateIosNewPlanShortcutHint("새 플랜 shortcut 도착 상태에서 draft 상태를 비밀값 없이 복사했습니다. 입력 내용은 제외했습니다.");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 draft 상태 복사가 완료됐습니다. 입력 내용과 LLM 비밀값은 제외했습니다.");
      } catch {
        window.prompt("새 플랜 draft 상태를 복사하세요. 입력 내용과 LLM 비밀값은 제외했습니다.", text);
        draftStatusCopyButton.textContent = "초안 상태 표시됨";
        updateIosNewPlanShortcutHint("클립보드 접근이 막혀 새 플랜 draft 상태를 prompt로 표시했습니다. 입력 내용은 제외했습니다.");
        setIosNewPlanShortcutHintActionState("fallback", "새 플랜 shortcut helper에서 draft 상태를 prompt로 표시했습니다. 입력 내용과 LLM 비밀값은 제외했습니다.");
      }
      window.setTimeout(() => {
        draftStatusCopyButton.dataset.iosNewPlanShortcutActionBusy = "false";
        draftStatusCopyButton.disabled = false;
        draftStatusCopyButton.removeAttribute("aria-busy");
        draftStatusCopyButton.textContent = originalLabel;
        resetIosNewPlanShortcutButtonMetadata(draftStatusCopyButton, "draftCopy");
        resetIosNewPlanShortcutGroupMetadata();
      }, 1800);
    });
  }
  if (draftStatusShareButton) {
    draftStatusShareButton.addEventListener("click", async () => {
      if (draftStatusShareButton.dataset.iosNewPlanShortcutActionBusy === "true") {
        updateIosNewPlanShortcutHint("새 플랜 draft 상태 공유가 이미 진행 중입니다. 입력 내용과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태 공유가 이미 진행 중입니다.");
        return;
      }
      const originalLabel = draftStatusShareButton.textContent;
      const text = buildIosHomeDockDraftStatusText();
      draftStatusShareButton.dataset.iosNewPlanShortcutActionBusy = "true";
      draftStatusShareButton.disabled = true;
      draftStatusShareButton.setAttribute("aria-busy", "true");
      draftStatusShareButton.textContent = "초안 상태 공유 중";
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태를 비밀값 없이 공유하는 중입니다.");
      try {
        if (navigator.share) {
          await navigator.share({
            title: "Travel Planner 새 플랜 초안 상태",
            text,
          });
          draftStatusShareButton.textContent = "초안 상태 공유됨";
          updateIosNewPlanShortcutHint("새 플랜 shortcut 도착 상태에서 draft 상태를 비밀값 없이 공유했습니다. 입력 내용은 제외했습니다.");
          setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 draft 상태 공유가 완료됐습니다. 입력 내용과 LLM 비밀값은 제외했습니다.");
        } else {
          await navigator.clipboard.writeText(text);
          draftStatusShareButton.textContent = "초안 상태 복사됨";
          updateIosNewPlanShortcutHint("공유를 열 수 없어 새 플랜 draft 상태를 비밀값 없이 복사했습니다. 입력 내용은 제외했습니다.");
          setIosNewPlanShortcutHintActionState("fallback", "공유를 열 수 없어 새 플랜 draft 상태를 비밀값 없이 복사했습니다.");
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          draftStatusShareButton.textContent = "공유 취소됨";
          updateIosNewPlanShortcutHint("새 플랜 draft 상태 공유를 취소했습니다. 입력 내용과 LLM 비밀값은 공유하지 않았습니다.");
          setIosNewPlanShortcutHintActionState("cancelled", "새 플랜 draft 상태 공유가 취소됐습니다. 입력 내용과 LLM 비밀값은 공유하지 않았습니다.");
        } else {
          try {
            await navigator.clipboard.writeText(text);
            draftStatusShareButton.textContent = "초안 상태 복사됨";
            updateIosNewPlanShortcutHint("공유를 완료하지 못해 새 플랜 draft 상태를 비밀값 없이 복사했습니다. 입력 내용은 제외했습니다.");
            setIosNewPlanShortcutHintActionState("fallback", "공유를 완료하지 못해 새 플랜 draft 상태를 비밀값 없이 복사했습니다.");
          } catch {
            window.prompt("새 플랜 draft 상태를 공유하세요. 입력 내용과 LLM 비밀값은 제외했습니다.", text);
            draftStatusShareButton.textContent = "초안 상태 표시됨";
            updateIosNewPlanShortcutHint("공유와 클립보드 접근이 막혀 새 플랜 draft 상태를 prompt로 표시했습니다. 입력 내용은 제외했습니다.");
            setIosNewPlanShortcutHintActionState("fallback", "공유와 클립보드 접근이 막혀 새 플랜 draft 상태를 prompt로 표시했습니다.");
          }
        }
      } finally {
        window.setTimeout(() => {
          draftStatusShareButton.dataset.iosNewPlanShortcutActionBusy = "false";
          draftStatusShareButton.disabled = false;
          draftStatusShareButton.removeAttribute("aria-busy");
          draftStatusShareButton.textContent = originalLabel;
          resetIosNewPlanShortcutButtonMetadata(draftStatusShareButton, "draftShare");
          resetIosNewPlanShortcutGroupMetadata();
        }, 1800);
      }
    });
  }
  if (draftStatusSmsLink) {
    draftStatusSmsLink.addEventListener("click", (event) => {
      if (draftStatusSmsLink.dataset.iosNewPlanShortcutActionBusy === "true") {
        event.preventDefault();
        updateIosNewPlanShortcutHint("새 플랜 draft 상태 문자 handoff가 이미 열리는 중입니다. 입력 내용과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태 문자 handoff가 이미 열리는 중입니다.");
        return;
      }
      const originalLabel = draftStatusSmsLink.textContent;
      draftStatusSmsLink.dataset.iosNewPlanShortcutActionBusy = "true";
      draftStatusSmsLink.setAttribute("aria-busy", "true");
      draftStatusSmsLink.setAttribute("aria-disabled", "true");
      draftStatusSmsLink.textContent = "문자 여는 중";
      draftStatusSmsLink.href = `sms:?&body=${encodeURIComponent(buildIosHomeDockDraftStatusSmsText())}`;
      updateIosNewPlanShortcutHint("새 플랜 shortcut 도착 상태에서 draft 상태를 비밀값 없이 문자로 보냅니다. 입력 내용은 제외했습니다.");
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태를 비밀값 없이 문자로 보내는 중입니다.");
      window.setTimeout(() => {
        draftStatusSmsLink.dataset.iosNewPlanShortcutActionBusy = "false";
        draftStatusSmsLink.removeAttribute("aria-busy");
        draftStatusSmsLink.removeAttribute("aria-disabled");
        draftStatusSmsLink.textContent = originalLabel;
        resetIosNewPlanShortcutLinkMetadata(draftStatusSmsLink, "draftSms");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 draft 상태 문자 handoff를 열었습니다. 입력 내용과 LLM 비밀값은 제외했습니다.");
        window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
      }, 2200);
    });
  }
  if (draftStatusMailLink) {
    draftStatusMailLink.addEventListener("click", (event) => {
      if (draftStatusMailLink.dataset.iosNewPlanShortcutActionBusy === "true") {
        event.preventDefault();
        updateIosNewPlanShortcutHint("새 플랜 draft 상태 메일 handoff가 이미 열리는 중입니다. 입력 내용과 LLM 비밀값은 포함하지 않습니다.");
        setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태 메일 handoff가 이미 열리는 중입니다.");
        return;
      }
      const originalLabel = draftStatusMailLink.textContent;
      draftStatusMailLink.dataset.iosNewPlanShortcutActionBusy = "true";
      draftStatusMailLink.setAttribute("aria-busy", "true");
      draftStatusMailLink.setAttribute("aria-disabled", "true");
      draftStatusMailLink.textContent = "메일 여는 중";
      draftStatusMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner 새 플랜 초안 상태")}&body=${encodeURIComponent(buildIosHomeDockDraftStatusText())}`;
      updateIosNewPlanShortcutHint("새 플랜 shortcut 도착 상태에서 draft 상태를 비밀값 없이 메일로 보냅니다. 입력 내용은 제외했습니다.");
      setIosNewPlanShortcutHintActionState("busy", "새 플랜 shortcut helper에서 draft 상태를 비밀값 없이 메일로 보내는 중입니다.");
      window.setTimeout(() => {
        draftStatusMailLink.dataset.iosNewPlanShortcutActionBusy = "false";
        draftStatusMailLink.removeAttribute("aria-busy");
        draftStatusMailLink.removeAttribute("aria-disabled");
        draftStatusMailLink.textContent = originalLabel;
        resetIosNewPlanShortcutLinkMetadata(draftStatusMailLink, "draftMail");
        setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 draft 상태 메일 handoff를 열었습니다. 입력 내용과 LLM 비밀값은 제외했습니다.");
        window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
      }, 2200);
    });
  }
  if (installGuideLink) {
    installGuideLink.addEventListener("click", () => {
      const installReturn = iosNewPlanShortcutInstallReturnConfig();
      updateIosNewPlanShortcutHint(`${installReturn.destination} ${installReturn.context} draft 값과 LLM 비밀값은 링크에 포함하지 않습니다.`);
      setIosNewPlanShortcutHintActionState("done", `새 플랜 shortcut helper에서 ${installReturn.destination} ${installReturn.context} draft 값과 LLM 비밀값은 포함하지 않습니다.`);
      window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
    });
  }
  if (installStatusLink) {
    installStatusLink.addEventListener("click", () => {
      updateIosNewPlanShortcutHint("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 확인하러 이동합니다. 새 플랜 draft 값과 LLM 비밀값은 링크에 포함하지 않습니다.");
      setIosNewPlanShortcutHintActionState("done", "새 플랜 shortcut helper에서 설치 완료 상태 페이지로 이동합니다. draft 값과 LLM 비밀값은 포함하지 않습니다.");
      window.setTimeout(() => resetIosNewPlanShortcutGroupMetadata(), 1600);
    });
  }
  if (dismissButton) dismissButton.addEventListener("click", clearIosNewPlanShortcutHint);
}

function iosNewPlanShortcutLaunchModeText() {
  const isStandalone = typeof isStandaloneDisplay === "function" && isStandaloneDisplay();
  const isIosSafari = typeof isLikelyIosSafari === "function" && isLikelyIosSafari();
  if (isStandalone) return "홈 화면 앱 모드로 열렸습니다.";
  if (isIosSafari) return "iPhone Safari에서 열렸습니다. 홈 화면에 추가한 뒤 Travel 아이콘으로 열면 앱 모드가 됩니다.";
  return "브라우저 탭에서 열렸습니다. 설치 완료 상태 링크로 iPhone Home Screen gate를 확인할 수 있습니다.";
}

function focusIosNewPlanFormHashTarget() {
  if (window.location.hash !== "#planForm") return;
  const form = document.getElementById("planForm");
  if (!form) return;
  const status = document.getElementById("iosInstallStatus");
  const draft = readNewPlanDraftDiagnostics();
  const hasDraft = draft.state === "saved" || draft.state === "saved-no-time";
  const launchModeText = iosNewPlanShortcutLaunchModeText();
  window.setTimeout(() => {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    form.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    highlightIosHomeDockDraftResumeTarget(form);
    const firstField = form.querySelector("input, select, textarea, button");
    firstField?.focus?.();
  }, 0);
  if (status) {
    status.textContent = hasDraft
      ? `${launchModeText} 새 여행 플랜 shortcut으로 이동했습니다. 이 iPhone 브라우저에 저장된 draft ${draft.fieldCount}개 필드를 이어서 작성합니다. 입력 내용과 LLM 비밀값은 표시하지 않습니다.`
      : `${launchModeText} 새 여행 플랜 shortcut으로 입력 폼에 이동했습니다. 입력하면 이 iPhone 브라우저에 비밀값 제외 draft가 자동 저장됩니다.`;
  }
  updateIosNewPlanShortcutHint(hasDraft
    ? `${launchModeText} 새 여행 플랜 shortcut으로 도착했습니다. 저장된 draft ${draft.fieldCount}개 필드를 이어서 작성하세요. 실제 입력값과 LLM 비밀값은 이 안내에 표시하지 않습니다.`
    : `${launchModeText} 새 여행 플랜 shortcut으로 도착했습니다. 첫 입력부터 작성하면 이 iPhone 브라우저에 비밀값 제외 draft가 자동 저장됩니다.`);
}

function bindIosHomeDockDraftResumeLink() {
  const link = document.getElementById("iosHomeDockDraftResumeLink");
  const status = document.getElementById("iosInstallStatus");
  const form = document.getElementById("planForm");
  if (!link || !form || link.dataset.iosHomeDockDraftResumeBound === "true") return;
  link.dataset.iosHomeDockDraftResumeBound = "true";
  link.addEventListener("click", () => {
    const draft = readNewPlanDraftDiagnostics();
    const hasDraft = draft.state === "saved" || draft.state === "saved-no-time";
    window.setTimeout(() => {
      highlightIosHomeDockDraftResumeTarget(form);
      const firstField = form.querySelector("input, select, textarea, button");
      firstField?.focus?.();
    }, 0);
    const launchModeText = iosNewPlanShortcutLaunchModeText();
    if (status) {
      status.textContent = hasDraft
        ? `${launchModeText} 새 플랜 draft ${draft.fieldCount}개 필드를 이어서 작성합니다. 입력 내용과 LLM 비밀값은 상태 안내에 표시하지 않습니다.`
        : `${launchModeText} 새 플랜 입력 폼으로 이동했습니다. 입력하면 이 iPhone 브라우저에 비밀값 제외 draft가 자동 저장됩니다.`;
    }
    updateIosNewPlanShortcutHint(hasDraft
      ? `${launchModeText} 홈 화면 dock에서 저장된 draft ${draft.fieldCount}개 필드 이어쓰기로 도착했습니다. 실제 입력값과 LLM 비밀값은 이 안내에 표시하지 않습니다.`
      : `${launchModeText} 홈 화면 dock에서 새 초안 시작으로 도착했습니다. 입력하면 이 iPhone 브라우저에 비밀값 제외 draft가 자동 저장됩니다.`);
  });
}

function bindIosHomeDockDraftStatusShareButton() {
  const button = document.getElementById("iosHomeDockDraftStatusShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockDraftStatusShareBound === "true") return;
  button.dataset.iosHomeDockDraftStatusShareBound = "true";
  button.addEventListener("click", async () => {
    const originalLabel = button.textContent;
    const text = buildIosHomeDockDraftStatusText();
    button.disabled = true;
    button.textContent = "초안 상태 공유 중";
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Travel Planner 새 플랜 초안 상태",
          text,
        });
        button.textContent = "초안 상태 공유됨";
        if (status) status.textContent = "새 플랜 draft 상태를 비밀값 없이 공유했습니다. 입력 내용은 제외했습니다.";
      } else {
        await navigator.clipboard.writeText(text);
        button.textContent = "초안 상태 복사됨";
        if (status) status.textContent = "공유를 열 수 없어 새 플랜 draft 상태를 비밀값 없이 복사했습니다.";
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        button.textContent = "공유 취소됨";
        if (status) status.textContent = "새 플랜 draft 상태 공유를 취소했습니다.";
      } else {
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "초안 상태 복사됨";
          if (status) status.textContent = "공유를 완료하지 못해 새 플랜 draft 상태를 비밀값 없이 복사했습니다.";
        } catch {
          window.prompt("새 플랜 draft 상태를 공유하세요. 입력 내용과 LLM 비밀값은 제외했습니다.", text);
          button.textContent = "초안 상태 표시됨";
          if (status) status.textContent = "공유와 클립보드 접근이 막혀 새 플랜 draft 상태를 prompt로 표시했습니다.";
        }
      }
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalLabel;
      }, 1800);
    }
  });
}

function clearIosSnapshotKeys() {
  const prefixes = [
    "travel-planner:home-plan-snapshot:v1:",
    "travel-planner:plan-detail-snapshot:v1:",
  ];
  let removed = 0;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || "";
      if (prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => {
      window.localStorage.removeItem(key);
      removed += 1;
    });
  } catch {
    removed = 0;
  }
  return removed;
}

function bindIosHomeDockDiagnosticsButton() {
  const button = document.getElementById("iosHomeDockDiagnosticsButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockDiagnosticsBound === "true") return;
  button.dataset.iosHomeDockDiagnosticsBound = "true";
  const diagnosticsDescription = "새 플랜 shortcut install action visible, mode, href, label, destination, updatedAt, diagnosticsCopyMethod/diagnosticsCopyMethodUpdatedAt, iosInstallSessionHandoffClicked/iosInstallSessionHandoffKind/iosInstallSessionHandoffLabel/iosInstallSessionHandoffClickedAt/iosInstallSessionHandoffCarryover/iosInstallSessionHandoffStatusFeedback/iosInstallSessionHandoffStorageFailed/iosInstallSessionHandoffSummaryVisible/iosInstallSessionHandoffSummaryClearVisible/iosInstallSessionHandoffSummaryClearLabel/iosInstallSessionHandoffSummaryClearTitle/iosInstallSessionHandoffSummaryClearAccessibleLabel/iosInstallSessionHandoffSummaryClearClicked/iosInstallSessionHandoffSummaryClearClickedAt/iosInstallSessionHandoffSummaryClearStatusFeedback/iosInstallSessionHandoffRestartHintVisible/iosInstallSessionHandoffRestartHintReason/iosInstallSessionHandoffRestartHintRole/iosInstallSessionHandoffRestartHintAriaLive/iosInstallSessionHandoffRestartHintAriaAtomic/iosInstallSessionHandoffRestartGroupVisible/iosInstallSessionHandoffRestartGroupRole/iosInstallSessionHandoffRestartGroupAccessibleLabel/iosInstallSessionHandoffRestartGroupLabelledBy/iosInstallSessionHandoffRestartGroupVisibleLabel/iosInstallSessionHandoffRestartGroupLabelVisible/iosInstallSessionHandoffRestartGroupDescription/iosInstallSessionHandoffRestartGroupDescriptionVisible/iosInstallSessionHandoffRestartNextStep/iosInstallSessionHandoffRestartNextStepVisible/iosInstallSessionHandoffRestartGroupDescribedBy/iosInstallSessionHandoffRestartSmsVisible/iosInstallSessionHandoffRestartSmsLabel/iosInstallSessionHandoffRestartSmsTitle/iosInstallSessionHandoffRestartSmsAccessibleLabel/iosInstallSessionHandoffRestartSmsClicked/iosInstallSessionHandoffRestartSmsClickedAt/iosInstallSessionHandoffRestartSmsTargetAvailable/iosInstallSessionHandoffRestartSmsStatusFeedback/iosInstallSessionHandoffRestartMailVisible/iosInstallSessionHandoffRestartMailLabel/iosInstallSessionHandoffRestartMailTitle/iosInstallSessionHandoffRestartMailAccessibleLabel/iosInstallSessionHandoffRestartMailClicked/iosInstallSessionHandoffRestartMailClickedAt/iosInstallSessionHandoffRestartMailTargetAvailable/iosInstallSessionHandoffRestartMailStatusFeedback/iosInstallSessionHandoffRestartQrVisible/iosInstallSessionHandoffRestartQrLabel/iosInstallSessionHandoffRestartQrTitle/iosInstallSessionHandoffRestartQrAccessibleLabel/iosInstallSessionHandoffRestartQrClicked/iosInstallSessionHandoffRestartQrClickedAt/iosInstallSessionHandoffRestartQrTargetAvailable/iosInstallSessionHandoffRestartQrStatusFeedback/iosInstallSessionHandoffSummaryCleared/iosInstallSessionHandoffSummaryClearedAt/iosInstallSessionHandoffSummaryClearStorageFailed/iosInstallSessionHandoffSummaryRole/iosInstallSessionHandoffSummaryAriaLive/iosInstallSessionHandoffSummaryAriaAtomic, iosHomeDockLastRouteVisible/iosHomeDockLastRouteHref/iosHomeDockLastRouteLabel/iosHomeDockLastRouteUpdatedAt/iosHomeDockLastRouteReason/iosHomeDockLastRouteBound/iosHomeDockLastRouteClicked/iosHomeDockLastRouteClickedAt/iosHomeDockLastRouteClickedHref/iosHomeDockLastRouteClickedLabel/iosHomeDockLastRouteClickedStatusFeedback/iosHomeDockLastRouteClearVisible/iosHomeDockLastRouteClearBound/iosHomeDockLastRouteClearClicked/iosHomeDockLastRouteClearClickedAt/iosHomeDockLastRouteClearStatusFeedback/iosHomeDockLastRouteClearNextRoute/iosHomeDockLastRouteClearNextLabel/iosHomeDockLastRouteClearNextTappable/iosHomeDockLastRouteClearNextOpened/iosHomeDockLastRouteClearNextOpenedAt/iosHomeDockLastRouteClearNextOpenedRoute/iosHomeDockLastRouteClearNextOpenedLabel/iosHomeDockLastRouteClearNextOpenedStatusFeedback/iosHomeDockLastRouteClearNextPersisted/iosHomeDockLastRouteClearNextConsumed/iosHomeDockDisplayModeVisible/iosHomeDockDisplayMode/iosHomeDockDisplayModeLabel/iosHomeDockDisplayModeTitle/iosStandaloneNextActionVisible/iosStandaloneNextActionDatasetVisible/iosStandaloneSuccessCheckVisible/iosStandaloneSuccessCheckItems/iosStandaloneSuccessCheckLabels/iosStandaloneSuccessCheckTargets/iosStandaloneSuccessCheckActionLabels/iosStandaloneSuccessCheckValueFree/iosStandaloneNextActionClicked/iosStandaloneNextActionClickedAt/iosStandaloneNextActionClickedRoute/iosStandaloneNextActionClickedLabel/iosStandaloneNextActionFocusTarget/iosStandaloneNextActionFocusApplied/iosStandaloneNextActionReducedMotion/iosStandaloneNextActionStatusFeedback/iosStandaloneNextActionCarryoverAction/iosStandaloneNextActionCarryoverClickedAt/iosStandaloneNextActionCarryoverRoute/iosStandaloneNextActionCarryoverLabel/iosStandaloneNextActionCarryoverFocusTarget/iosStandaloneNextActionCarryoverFocusApplied/iosStandaloneNextActionCarryoverReducedMotion/iosStandaloneNextActionCarryoverStatusFeedback/iosStandaloneNextActionCarryoverAgeMs/iosStandaloneNextActionCarryoverAgeSeconds/iosStandaloneNextActionCarryoverStale/iosStandaloneNextActionCarryoverFresh/iosStandaloneNextActionCarryoverPromoted/iosStandaloneNextActionCarryoverIgnoredReason/iosStandaloneNextActionCarryoverIgnoredFeedback/iosStandaloneNextActionCarryoverCleared/iosStandaloneNextActionCarryoverClearedReason/iosStandaloneNextActionCarryoverClearedAt/iosStandaloneNextActionCarryoverCleanupFailed/iosStandaloneNextActionCarryoverCleanupFailedReason/iosStandaloneNextActionCarryoverCleanupFailedAt/iosStandaloneNextActionCarryoverMaxAgeMs/iosStandaloneSubmitDockVisible/iosStandaloneSubmitDockState/iosStandaloneSubmitDockButtonLabel/iosStandaloneSubmitDockClicked/iosStandaloneSubmitDockClickedAt/iosStandaloneSubmitDockClickResult/iosStandaloneSubmitDockStatusFeedback/iosStandaloneSubmitDockObserved/iosStandaloneSubmitDockSyncedAt/iosStandaloneSubmitDockSubmitBusy/iosStandaloneSubmitDockSubmitDisabled/iosStandaloneSubmitDockKeyboardHidden/iosStandaloneSubmitDockKeyboardHiddenAt/iosStandaloneSubmitDockKeyboardRestoredAt/iosStandaloneSubmitDockKeyboardFocusName/iosStandaloneSubmitDockInvalid/iosStandaloneSubmitDockInvalidAt/iosStandaloneSubmitDockInvalidFieldName/iosStandaloneSubmitDockInvalidSource/iosStandaloneSubmitDockInvalidFeedback/iosStandaloneSubmitDockInvalidFocusTarget/iosStandaloneSubmitDockInvalidFocusApplied/iosStandaloneSubmitDockInvalidFocusedAt/iosStandaloneSubmitDockInvalidReducedMotion/iosStandaloneCompletionStatusClicked/iosStandaloneCompletionStatusClickedAt/iosStandaloneCompletionStatusClickedRoute/iosStandaloneCompletionStatusClickedLabel/iosInstallModeCopyVisible/iosInstallModeCopyBound/iosInstallModeCopied/iosInstallModeCopiedAt/iosInstallModeCopiedState/iosInstallModeCopyMethod/iosInstallModeCopyHintDescribedBy/iosInstallModeShareVisible/iosInstallModeShareBound/iosInstallModeShared/iosInstallModeSharedAt/iosInstallModeSharedState/iosInstallModeShareMethod/iosInstallModeShareHintDescribedBy/iosInstallModeSmsVisible/iosInstallModeSmsChannel/iosInstallModeSmsState/iosInstallModeSmsDisplayMode/iosInstallModeSmsPayloadKind/iosInstallModeSmsLabel/iosInstallModeSmsClicked/iosInstallModeSmsClickedAt/iosInstallModeSmsClickedPayloadKind/iosInstallModeSmsHintDescribedBy/iosInstallModeMailVisible/iosInstallModeMailChannel/iosInstallModeMailState/iosInstallModeMailDisplayMode/iosInstallModeMailPayloadKind/iosInstallModeMailLabel/iosInstallModeMailClicked/iosInstallModeMailClickedAt/iosInstallModeMailClickedPayloadKind/iosInstallModeMailHintDescribedBy/iosInstallModeHandoffHintVisible/iosInstallModeHandoffHintSmsRole/iosInstallModeHandoffHintMailRole/iosInstallModeHandoffHintPayload, iosHomeDockPlanStarterLinkVisible/iosHomeDockPlanStarterLinkRoute/iosHomeDockPlanStarterLinkLabel/iosHomeDockPlanStarterLinkState/iosHomeDockPlanStarterLinkBound/iosHomeDockPlanStarterLinkClicked/iosHomeDockPlanStarterLinkClickedAt/iosHomeDockPlanStarterLinkClickedRoute/iosHomeDockPlanStarterLinkClickedLabel/iosHomeDockPlanStarterLinkClickedState/iosHomeDockPlanStarterLinkClickedStatusFeedback, iosHomeDockPlanStarterSampleButtonVisible/iosHomeDockPlanStarterSampleButtonLabel/iosHomeDockPlanStarterSampleButtonState/iosHomeDockPlanStarterSampleButtonClicked/iosHomeDockPlanStarterSampleButtonClickedAt/iosHomeDockPlanStarterSampleButtonClickedMode/iosHomeDockPlanStarterSampleButtonClickedStatusFeedback/iosHomeDockPlanStarterSampleButtonFocusTarget/iosHomeDockPlanStarterSampleButtonFocusScheduled/iosHomeDockPlanStarterSampleButtonFocusApplied/iosHomeDockPlanStarterSampleButtonFocusedAt/iosHomeDockPlanStarterSampleButtonHighlightApplied/iosHomeDockPlanStarterSampleButtonFollowupHintVisible/iosHomeDockPlanStarterSampleButtonFollowupHintText/iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt, iosHomeDockPlanSubmitButtonVisible/iosHomeDockPlanSubmitButtonLabel/iosHomeDockPlanSubmitButtonTitle/iosHomeDockPlanSubmitButtonAccessibleLabel/iosHomeDockPlanSubmitButtonDescribedBy/iosHomeDockPlanSubmitButtonBound/iosHomeDockPlanSubmitButtonDisabled/iosHomeDockPlanSubmitButtonAriaBusy/iosHomeDockPlanSubmitButtonBusy/iosHomeDockPlanSubmitButtonClicked/iosHomeDockPlanSubmitButtonClickedAt/iosHomeDockPlanSubmitButtonClickedStatusFeedback/iosHomeDockPlanSubmitButtonSubmitAttempted/iosHomeDockPlanSubmitButtonSubmitAttemptedAt/iosHomeDockPlanSubmitButtonSubmitResult/iosHomeDockPlanSubmitButtonSubmitResultAt/iosHomeDockPlanSubmitButtonSubmitFailureKind/iosHomeDockPlanSubmitButtonSubmitStatusFeedback/iosHomeDockPlanSubmitButtonRedirectPlanned/iosHomeDockPlanSubmitButtonRedirectRoute/iosHomeDockPlanSubmitButtonRedirectPlannedAt/iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible/iosHomeDockPlanSubmitButtonRedirectFallbackRoute/iosHomeDockPlanSubmitRedirectSessionSaved/iosHomeDockPlanSubmitRedirectSessionRoute/iosHomeDockPlanSubmitRedirectSessionPlannedAt/iosHomeDockPlanSubmitRedirectSessionSource/iosHomeDockPlanSubmitRedirectArrivalVisible/iosHomeDockPlanSubmitRedirectArrivalRoute/iosHomeDockPlanSubmitRedirectArrivalSource/iosHomeDockPlanSubmitRedirectArrivalPlannedAt/iosHomeDockPlanSubmitRedirectArrivalArrivedAt/iosHomeDockPlanSubmitRedirectArrivalDismissed/iosHomeDockPlanSubmitRedirectArrivalDismissedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible/iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible/iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalVisible/iosHomeDockPlanSubmitCompletionStatusArrivalRoute/iosHomeDockPlanSubmitCompletionStatusArrivalSource/iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissed/iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback/iosHomeDockPlanSubmitHomeReturnArrivalVisible/iosHomeDockPlanSubmitHomeReturnArrivalRoute/iosHomeDockPlanSubmitHomeReturnArrivalSource/iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissed/iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopCompleted/iosHomeDockPlanSubmitFirstUseLoopCompletedAt/iosHomeDockPlanSubmitFirstUseLoopCompletedSource/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetBannerReason/iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel/iosHomeDockPlanSubmitMessageVisible/iosHomeDockPlanSubmitMessageId/iosHomeDockPlanSubmitMessageRole/iosHomeDockPlanSubmitMessageAriaLive/iosHomeDockPlanSubmitMessageAriaAtomic, iosOfflineFallback/iosOfflineFallbackPath/iosOfflineFallbackSourceLabel/iosOfflineFallbackStatusSourceLabel/iosOfflineFallbackStatusRecoveryActionLabel/iosOfflineFallbackSourceUrl/iosOfflineFallbackRecoveryTarget/iosOfflineFallbackRecoveryTargetId/iosOfflineFallbackRecoveryTargetLabel/iosOfflineFallbackRecoveryAction/iosOfflineFallbackRecoveryActionLabel/iosOfflineFallbackCompletionChecklist/iosOfflineFallbackCompletionChecklistLabel/iosOfflineFallbackCompletionHint/iosOfflineFallbackVisibleStatusIncludesCompletionHint/iosOfflineFallbackStatusCompletionHint/iosOfflineFallbackStatusCompletionHintVisible/iosOfflineFallbackStatusAccessibleLabel/iosOfflineFallbackStatusAccessibleLabelVisible/iosOfflineFallbackStatusRole/iosOfflineFallbackStatusAriaLive/iosOfflineFallbackStatusAriaAtomic/iosOfflineFallbackStatusDescribedBy/iosOfflineFallbackRecoveryLinkVisible/iosOfflineFallbackRecoveryLinkTarget/iosOfflineFallbackRecoveryLinkLabel/iosOfflineFallbackRecoveryLinkClass/iosOfflineFallbackRecoveryLinkAction/iosOfflineFallbackRecoveryLinkBound/iosOfflineFallbackRecoveryLinkClicked/iosOfflineFallbackRecoveryLinkClickedAt/iosOfflineFallbackRecoveryLinkStatusFeedback/iosOfflineFallbackRecoveryLinkClickedLabel/iosOfflineFallbackRecoveryLinkClickedClass/iosOfflineFallbackRecoveryLinkClickedTitle/iosOfflineFallbackRecoveryLinkClickedAccessibleLabel/iosOfflineFallbackRecoveryLinkCompletionChecklist/iosOfflineFallbackRecoveryLinkCompletionChecklistLabel/iosOfflineFallbackRecoveryLinkCompletionHint/iosOfflineFallbackRecoveryChecklistVisible/iosOfflineFallbackRecoveryChecklistItems/iosOfflineFallbackRecoveryChecklistKeys/iosOfflineFallbackRecoveryChecklistRoutes/iosOfflineFallbackRecoveryChecklistLabel/iosOfflineFallbackRecoveryChecklistLinksVisible/iosOfflineFallbackRecoveryChecklistLinkLabels/iosOfflineFallbackRecoveryChecklistLinkRoutes/iosOfflineFallbackRecoveryChecklistLinkClass/iosOfflineFallbackRecoveryChecklistLinkClicked/iosOfflineFallbackRecoveryChecklistLinkClickedKey/iosOfflineFallbackRecoveryChecklistLinkClickedRoute/iosOfflineFallbackRecoveryChecklistLinkClickedLabel/iosOfflineFallbackRecoveryChecklistLinkClickedAt/iosOfflineFallbackRecoveryChecklistLinkClickedClass/iosOfflineFallbackRecoveryChecklistLinkStatusFeedback/iosOfflineFallbackRecoveryChecklistSessionSaved/iosOfflineFallbackRecoveryChecklistSessionKey/iosOfflineFallbackRecoveryChecklistSessionValue/iosOfflineFallbackRecoveryChecklistSessionClickedKey/iosOfflineFallbackRecoveryChecklistSessionClickedRoute/iosOfflineFallbackRecoveryChecklistSessionClickedLabel/iosOfflineFallbackRecoveryChecklistSessionClickedAt/iosOfflineFallbackRecoveryChecklistSessionSourceLabel/iosOfflineFallbackRecoveryChecklistCarryover/iosOfflineFallbackRecoveryChecklistCarryoverKey/iosOfflineFallbackRecoveryChecklistCarryoverRoute/iosOfflineFallbackRecoveryChecklistCarryoverLabel/iosOfflineFallbackRecoveryChecklistCarryoverSource/iosOfflineFallbackRecoveryChecklistCarryoverClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerKey/iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerClass/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback/iosOfflineFallbackDocumentTitle/iosOfflineFallbackUpdatedAt/iosOfflineFallbackBlankWhenInactive/iosOfflineFallbackBlankFields와 draft/LLM secret 제외 표시를 포함한 iPhone 진단 정보 복사";
  button.title = diagnosticsDescription;
  button.setAttribute("aria-label", diagnosticsDescription);
  const updateDiagnosticsCopyMethodDescription = (method, updatedAt) => {
    const methodDescription = `${diagnosticsDescription}. diagnosticsCopyMethod=${method}. diagnosticsCopyMethodUpdatedAt=${updatedAt}.`;
    button.title = methodDescription;
    button.setAttribute("aria-label", methodDescription);
  };
  button.addEventListener("click", async () => {
    const diagnosticsCopyMethodUpdatedAt = new Date().toISOString();
    button.dataset.iosHomeDockDiagnosticsCopyMethod = "clipboard";
    button.dataset.iosHomeDockDiagnosticsCopyMethodUpdatedAt = diagnosticsCopyMethodUpdatedAt;
    updateDiagnosticsCopyMethodDescription("clipboard", diagnosticsCopyMethodUpdatedAt);
    const text = buildIosHomeDockDiagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "clipboard 복사됨";
      if (status) status.textContent = `iPhone 진단에 diagnosticsCopyMethod=clipboard, diagnosticsCopyMethodUpdatedAt=${diagnosticsCopyMethodUpdatedAt}, iosHomeDockPlanStarterLinkVisible/iosHomeDockPlanStarterLinkRoute/iosHomeDockPlanStarterLinkLabel/iosHomeDockPlanStarterLinkState/iosHomeDockPlanStarterLinkBound/iosHomeDockPlanStarterLinkClicked/iosHomeDockPlanStarterLinkClickedAt/iosHomeDockPlanStarterLinkClickedRoute/iosHomeDockPlanStarterLinkClickedLabel/iosHomeDockPlanStarterLinkClickedState/iosHomeDockPlanStarterLinkClickedStatusFeedback, iosHomeDockPlanStarterSampleButtonVisible/iosHomeDockPlanStarterSampleButtonLabel/iosHomeDockPlanStarterSampleButtonState/iosHomeDockPlanStarterSampleButtonClicked/iosHomeDockPlanStarterSampleButtonClickedAt/iosHomeDockPlanStarterSampleButtonClickedMode/iosHomeDockPlanStarterSampleButtonClickedStatusFeedback/iosHomeDockPlanStarterSampleButtonFocusTarget/iosHomeDockPlanStarterSampleButtonFocusScheduled/iosHomeDockPlanStarterSampleButtonFocusApplied/iosHomeDockPlanStarterSampleButtonFocusedAt/iosHomeDockPlanStarterSampleButtonHighlightApplied/iosHomeDockPlanStarterSampleButtonFollowupHintVisible/iosHomeDockPlanStarterSampleButtonFollowupHintText/iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt, iosHomeDockPlanSubmitButtonVisible/iosHomeDockPlanSubmitButtonLabel/iosHomeDockPlanSubmitButtonTitle/iosHomeDockPlanSubmitButtonAccessibleLabel/iosHomeDockPlanSubmitButtonDescribedBy/iosHomeDockPlanSubmitButtonBound/iosHomeDockPlanSubmitButtonDisabled/iosHomeDockPlanSubmitButtonAriaBusy/iosHomeDockPlanSubmitButtonBusy/iosHomeDockPlanSubmitButtonClicked/iosHomeDockPlanSubmitButtonClickedAt/iosHomeDockPlanSubmitButtonClickedStatusFeedback/iosHomeDockPlanSubmitButtonSubmitAttempted/iosHomeDockPlanSubmitButtonSubmitAttemptedAt/iosHomeDockPlanSubmitButtonSubmitResult/iosHomeDockPlanSubmitButtonSubmitResultAt/iosHomeDockPlanSubmitButtonSubmitFailureKind/iosHomeDockPlanSubmitButtonSubmitStatusFeedback/iosHomeDockPlanSubmitButtonRedirectPlanned/iosHomeDockPlanSubmitButtonRedirectRoute/iosHomeDockPlanSubmitButtonRedirectPlannedAt/iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible/iosHomeDockPlanSubmitButtonRedirectFallbackRoute/iosHomeDockPlanSubmitRedirectSessionSaved/iosHomeDockPlanSubmitRedirectSessionRoute/iosHomeDockPlanSubmitRedirectSessionPlannedAt/iosHomeDockPlanSubmitRedirectSessionSource/iosHomeDockPlanSubmitRedirectArrivalVisible/iosHomeDockPlanSubmitRedirectArrivalRoute/iosHomeDockPlanSubmitRedirectArrivalSource/iosHomeDockPlanSubmitRedirectArrivalPlannedAt/iosHomeDockPlanSubmitRedirectArrivalArrivedAt/iosHomeDockPlanSubmitRedirectArrivalDismissed/iosHomeDockPlanSubmitRedirectArrivalDismissedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible/iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible/iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalVisible/iosHomeDockPlanSubmitCompletionStatusArrivalRoute/iosHomeDockPlanSubmitCompletionStatusArrivalSource/iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissed/iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback/iosHomeDockPlanSubmitHomeReturnArrivalVisible/iosHomeDockPlanSubmitHomeReturnArrivalRoute/iosHomeDockPlanSubmitHomeReturnArrivalSource/iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissed/iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopCompleted/iosHomeDockPlanSubmitFirstUseLoopCompletedAt/iosHomeDockPlanSubmitFirstUseLoopCompletedSource/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetBannerReason/iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel/iosHomeDockPlanSubmitMessageVisible/iosHomeDockPlanSubmitMessageId/iosHomeDockPlanSubmitMessageRole/iosHomeDockPlanSubmitMessageAriaLive/iosHomeDockPlanSubmitMessageAriaAtomic, iosOfflineFallback/iosOfflineFallbackPath/iosOfflineFallbackSourceLabel/iosOfflineFallbackStatusSourceLabel/iosOfflineFallbackStatusRecoveryActionLabel/iosOfflineFallbackSourceUrl/iosOfflineFallbackRecoveryTarget/iosOfflineFallbackRecoveryTargetId/iosOfflineFallbackRecoveryTargetLabel/iosOfflineFallbackRecoveryAction/iosOfflineFallbackRecoveryActionLabel/iosOfflineFallbackCompletionChecklist/iosOfflineFallbackCompletionChecklistLabel/iosOfflineFallbackCompletionHint/iosOfflineFallbackVisibleStatusIncludesCompletionHint/iosOfflineFallbackStatusCompletionHint/iosOfflineFallbackStatusCompletionHintVisible/iosOfflineFallbackStatusAccessibleLabel/iosOfflineFallbackStatusAccessibleLabelVisible/iosOfflineFallbackStatusRole/iosOfflineFallbackStatusAriaLive/iosOfflineFallbackStatusAriaAtomic/iosOfflineFallbackStatusDescribedBy/iosOfflineFallbackRecoveryLinkVisible/iosOfflineFallbackRecoveryLinkTarget/iosOfflineFallbackRecoveryLinkLabel/iosOfflineFallbackRecoveryLinkClass/iosOfflineFallbackRecoveryLinkAction/iosOfflineFallbackRecoveryLinkBound/iosOfflineFallbackRecoveryLinkClicked/iosOfflineFallbackRecoveryLinkClickedAt/iosOfflineFallbackRecoveryLinkStatusFeedback/iosOfflineFallbackRecoveryLinkClickedLabel/iosOfflineFallbackRecoveryLinkClickedClass/iosOfflineFallbackRecoveryLinkClickedTitle/iosOfflineFallbackRecoveryLinkClickedAccessibleLabel/iosOfflineFallbackRecoveryLinkCompletionChecklist/iosOfflineFallbackRecoveryLinkCompletionChecklistLabel/iosOfflineFallbackRecoveryLinkCompletionHint/iosOfflineFallbackRecoveryChecklistVisible/iosOfflineFallbackRecoveryChecklistItems/iosOfflineFallbackRecoveryChecklistKeys/iosOfflineFallbackRecoveryChecklistRoutes/iosOfflineFallbackRecoveryChecklistLabel/iosOfflineFallbackRecoveryChecklistLinksVisible/iosOfflineFallbackRecoveryChecklistLinkLabels/iosOfflineFallbackRecoveryChecklistLinkRoutes/iosOfflineFallbackRecoveryChecklistLinkClass/iosOfflineFallbackRecoveryChecklistLinkClicked/iosOfflineFallbackRecoveryChecklistLinkClickedKey/iosOfflineFallbackRecoveryChecklistLinkClickedRoute/iosOfflineFallbackRecoveryChecklistLinkClickedLabel/iosOfflineFallbackRecoveryChecklistLinkClickedAt/iosOfflineFallbackRecoveryChecklistLinkClickedClass/iosOfflineFallbackRecoveryChecklistLinkStatusFeedback/iosOfflineFallbackRecoveryChecklistSessionSaved/iosOfflineFallbackRecoveryChecklistSessionKey/iosOfflineFallbackRecoveryChecklistSessionValue/iosOfflineFallbackRecoveryChecklistSessionClickedKey/iosOfflineFallbackRecoveryChecklistSessionClickedRoute/iosOfflineFallbackRecoveryChecklistSessionClickedLabel/iosOfflineFallbackRecoveryChecklistSessionClickedAt/iosOfflineFallbackRecoveryChecklistSessionSourceLabel/iosOfflineFallbackRecoveryChecklistCarryover/iosOfflineFallbackRecoveryChecklistCarryoverKey/iosOfflineFallbackRecoveryChecklistCarryoverRoute/iosOfflineFallbackRecoveryChecklistCarryoverLabel/iosOfflineFallbackRecoveryChecklistCarryoverSource/iosOfflineFallbackRecoveryChecklistCarryoverClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerKey/iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerClass/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback/iosOfflineFallbackDocumentTitle/iosOfflineFallbackUpdatedAt/iosOfflineFallbackBlankWhenInactive/iosOfflineFallbackBlankFields, 새 플랜 shortcut install action 진단, value-free 제외 표시를 포함해 복사했습니다.`;
      window.setTimeout(() => {
        button.textContent = "iPhone 진단 복사";
      }, 1400);
    } catch {
      const promptCopyMethodUpdatedAt = new Date().toISOString();
      button.dataset.iosHomeDockDiagnosticsCopyMethod = "prompt";
      button.dataset.iosHomeDockDiagnosticsCopyMethodUpdatedAt = promptCopyMethodUpdatedAt;
      updateDiagnosticsCopyMethodDescription("prompt", promptCopyMethodUpdatedAt);
      const promptText = buildIosHomeDockDiagnosticsText();
      button.textContent = "prompt 열림";
      if (status) status.textContent = `iPhone clipboard를 바로 쓸 수 없어 prompt를 열었습니다. diagnosticsCopyMethod=prompt, diagnosticsCopyMethodUpdatedAt=${promptCopyMethodUpdatedAt}, iosHomeDockPlanStarterLinkVisible/iosHomeDockPlanStarterLinkRoute/iosHomeDockPlanStarterLinkLabel/iosHomeDockPlanStarterLinkState/iosHomeDockPlanStarterLinkBound/iosHomeDockPlanStarterLinkClicked/iosHomeDockPlanStarterLinkClickedAt/iosHomeDockPlanStarterLinkClickedRoute/iosHomeDockPlanStarterLinkClickedLabel/iosHomeDockPlanStarterLinkClickedState/iosHomeDockPlanStarterLinkClickedStatusFeedback, iosHomeDockPlanStarterSampleButtonVisible/iosHomeDockPlanStarterSampleButtonLabel/iosHomeDockPlanStarterSampleButtonState/iosHomeDockPlanStarterSampleButtonClicked/iosHomeDockPlanStarterSampleButtonClickedAt/iosHomeDockPlanStarterSampleButtonClickedMode/iosHomeDockPlanStarterSampleButtonClickedStatusFeedback/iosHomeDockPlanStarterSampleButtonFocusTarget/iosHomeDockPlanStarterSampleButtonFocusScheduled/iosHomeDockPlanStarterSampleButtonFocusApplied/iosHomeDockPlanStarterSampleButtonFocusedAt/iosHomeDockPlanStarterSampleButtonHighlightApplied/iosHomeDockPlanStarterSampleButtonFollowupHintVisible/iosHomeDockPlanStarterSampleButtonFollowupHintText/iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt, iosHomeDockPlanSubmitButtonVisible/iosHomeDockPlanSubmitButtonLabel/iosHomeDockPlanSubmitButtonTitle/iosHomeDockPlanSubmitButtonAccessibleLabel/iosHomeDockPlanSubmitButtonDescribedBy/iosHomeDockPlanSubmitButtonBound/iosHomeDockPlanSubmitButtonDisabled/iosHomeDockPlanSubmitButtonAriaBusy/iosHomeDockPlanSubmitButtonBusy/iosHomeDockPlanSubmitButtonClicked/iosHomeDockPlanSubmitButtonClickedAt/iosHomeDockPlanSubmitButtonClickedStatusFeedback/iosHomeDockPlanSubmitButtonSubmitAttempted/iosHomeDockPlanSubmitButtonSubmitAttemptedAt/iosHomeDockPlanSubmitButtonSubmitResult/iosHomeDockPlanSubmitButtonSubmitResultAt/iosHomeDockPlanSubmitButtonSubmitFailureKind/iosHomeDockPlanSubmitButtonSubmitStatusFeedback/iosHomeDockPlanSubmitButtonRedirectPlanned/iosHomeDockPlanSubmitButtonRedirectRoute/iosHomeDockPlanSubmitButtonRedirectPlannedAt/iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible/iosHomeDockPlanSubmitButtonRedirectFallbackRoute/iosHomeDockPlanSubmitRedirectSessionSaved/iosHomeDockPlanSubmitRedirectSessionRoute/iosHomeDockPlanSubmitRedirectSessionPlannedAt/iosHomeDockPlanSubmitRedirectSessionSource/iosHomeDockPlanSubmitRedirectArrivalVisible/iosHomeDockPlanSubmitRedirectArrivalRoute/iosHomeDockPlanSubmitRedirectArrivalSource/iosHomeDockPlanSubmitRedirectArrivalPlannedAt/iosHomeDockPlanSubmitRedirectArrivalArrivedAt/iosHomeDockPlanSubmitRedirectArrivalDismissed/iosHomeDockPlanSubmitRedirectArrivalDismissedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonVisible/iosHomeDockPlanSubmitRedirectArrivalDismissButtonLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitRedirectArrivalStatusLinkVisible/iosHomeDockPlanSubmitRedirectArrivalStatusLinkRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkAccessibleLabel/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute/iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalVisible/iosHomeDockPlanSubmitCompletionStatusArrivalRoute/iosHomeDockPlanSubmitCompletionStatusArrivalSource/iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissed/iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonVisible/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkVisible/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkAccessibleLabel/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute/iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback/iosHomeDockPlanSubmitHomeReturnArrivalVisible/iosHomeDockPlanSubmitHomeReturnArrivalRoute/iosHomeDockPlanSubmitHomeReturnArrivalSource/iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissed/iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonVisible/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopCompleted/iosHomeDockPlanSubmitFirstUseLoopCompletedAt/iosHomeDockPlanSubmitFirstUseLoopCompletedSource/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeTitle/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonVisible/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason/iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetBannerReason/iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonVisible/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonAccessibleLabel/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared/iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerVisible/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerLabel/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt/iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel/iosHomeDockPlanSubmitMessageVisible/iosHomeDockPlanSubmitMessageId/iosHomeDockPlanSubmitMessageRole/iosHomeDockPlanSubmitMessageAriaLive/iosHomeDockPlanSubmitMessageAriaAtomic, iosOfflineFallback/iosOfflineFallbackPath/iosOfflineFallbackSourceLabel/iosOfflineFallbackStatusSourceLabel/iosOfflineFallbackStatusRecoveryActionLabel/iosOfflineFallbackSourceUrl/iosOfflineFallbackRecoveryTarget/iosOfflineFallbackRecoveryTargetId/iosOfflineFallbackRecoveryTargetLabel/iosOfflineFallbackRecoveryAction/iosOfflineFallbackRecoveryActionLabel/iosOfflineFallbackCompletionChecklist/iosOfflineFallbackCompletionChecklistLabel/iosOfflineFallbackCompletionHint/iosOfflineFallbackVisibleStatusIncludesCompletionHint/iosOfflineFallbackStatusCompletionHint/iosOfflineFallbackStatusCompletionHintVisible/iosOfflineFallbackStatusAccessibleLabel/iosOfflineFallbackStatusAccessibleLabelVisible/iosOfflineFallbackStatusRole/iosOfflineFallbackStatusAriaLive/iosOfflineFallbackStatusAriaAtomic/iosOfflineFallbackStatusDescribedBy/iosOfflineFallbackRecoveryLinkVisible/iosOfflineFallbackRecoveryLinkTarget/iosOfflineFallbackRecoveryLinkLabel/iosOfflineFallbackRecoveryLinkClass/iosOfflineFallbackRecoveryLinkAction/iosOfflineFallbackRecoveryLinkBound/iosOfflineFallbackRecoveryLinkClicked/iosOfflineFallbackRecoveryLinkClickedAt/iosOfflineFallbackRecoveryLinkStatusFeedback/iosOfflineFallbackRecoveryLinkClickedLabel/iosOfflineFallbackRecoveryLinkClickedClass/iosOfflineFallbackRecoveryLinkClickedTitle/iosOfflineFallbackRecoveryLinkClickedAccessibleLabel/iosOfflineFallbackRecoveryLinkCompletionChecklist/iosOfflineFallbackRecoveryLinkCompletionChecklistLabel/iosOfflineFallbackRecoveryLinkCompletionHint/iosOfflineFallbackRecoveryChecklistVisible/iosOfflineFallbackRecoveryChecklistItems/iosOfflineFallbackRecoveryChecklistKeys/iosOfflineFallbackRecoveryChecklistRoutes/iosOfflineFallbackRecoveryChecklistLabel/iosOfflineFallbackRecoveryChecklistLinksVisible/iosOfflineFallbackRecoveryChecklistLinkLabels/iosOfflineFallbackRecoveryChecklistLinkRoutes/iosOfflineFallbackRecoveryChecklistLinkClass/iosOfflineFallbackRecoveryChecklistLinkClicked/iosOfflineFallbackRecoveryChecklistLinkClickedKey/iosOfflineFallbackRecoveryChecklistLinkClickedRoute/iosOfflineFallbackRecoveryChecklistLinkClickedLabel/iosOfflineFallbackRecoveryChecklistLinkClickedAt/iosOfflineFallbackRecoveryChecklistLinkClickedClass/iosOfflineFallbackRecoveryChecklistLinkStatusFeedback/iosOfflineFallbackRecoveryChecklistSessionSaved/iosOfflineFallbackRecoveryChecklistSessionKey/iosOfflineFallbackRecoveryChecklistSessionValue/iosOfflineFallbackRecoveryChecklistSessionClickedKey/iosOfflineFallbackRecoveryChecklistSessionClickedRoute/iosOfflineFallbackRecoveryChecklistSessionClickedLabel/iosOfflineFallbackRecoveryChecklistSessionClickedAt/iosOfflineFallbackRecoveryChecklistSessionSourceLabel/iosOfflineFallbackRecoveryChecklistCarryover/iosOfflineFallbackRecoveryChecklistCarryoverKey/iosOfflineFallbackRecoveryChecklistCarryoverRoute/iosOfflineFallbackRecoveryChecklistCarryoverLabel/iosOfflineFallbackRecoveryChecklistCarryoverSource/iosOfflineFallbackRecoveryChecklistCarryoverClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerKey/iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback/iosOfflineFallbackRecoveryChecklistCarryoverBannerClass/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass/iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback/iosOfflineFallbackDocumentTitle/iosOfflineFallbackUpdatedAt/iosOfflineFallbackBlankWhenInactive/iosOfflineFallbackBlankFields, 새 플랜 shortcut install action 진단, value-free 제외 표시가 포함됩니다.`;
      window.prompt("iPhone 진단 정보를 복사하세요. 새 플랜 shortcut install action 진단과 value-free 제외 표시가 포함됩니다.", promptText);
      window.setTimeout(() => {
        button.textContent = "iPhone 진단 복사";
      }, 1600);
    }
  });
}

function bindIosHomeDockAppUpdateButton() {
  const button = document.getElementById("iosHomeDockAppUpdateButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockAppUpdateBound === "true") return;
  button.dataset.iosHomeDockAppUpdateBound = "true";
  button.addEventListener("click", async () => {
    if (!("serviceWorker" in navigator)) {
      button.textContent = "업데이트 미지원";
      if (status) status.textContent = "이 브라우저는 service worker 업데이트 확인을 지원하지 않습니다.";
      window.setTimeout(() => {
        button.textContent = "앱 업데이트 확인";
      }, 1600);
      return;
    }
    button.textContent = "업데이트 확인 중";
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        button.textContent = "앱 shell 없음";
        if (status) status.textContent = "아직 설치된 service worker가 없습니다. Safari에서 홈 화면에 추가한 뒤 다시 확인하세요.";
        window.setTimeout(() => {
          button.textContent = "앱 업데이트 확인";
        }, 1800);
        return;
      }
      await registration.update();
      showServiceWorkerUpdatePrompt(registration);
      await refreshIosHomeDockShellVersion();
      updateIosHomeDock();
      const shellState = iosHomeDockShellVersionState();
      const shellRecovery = window.location.hash === "#iosHomeDockShellRecovery";
      button.textContent = registration.waiting ? "새 버전 준비됨" : "최신 확인됨";
      if (status) {
        status.textContent = registration.waiting
          ? "새 Travel Planner 앱 shell이 준비됐습니다. 화면 아래의 새 버전 적용 버튼을 눌러 반영하세요."
          : shellRecovery && !shellState.updateNeeded
            ? "앱 shell이 최신 상태입니다. 이제 설치 증거 저장 위치로 이동해 proof를 다시 저장하세요."
          : shellState.updateNeeded
            ? "서버 최신 shell과 현재 앱 shell이 아직 다릅니다. 새 버전 적용 안내가 보이면 먼저 적용한 뒤 다시 확인하세요."
          : "설치된 Travel Planner 앱 shell 업데이트를 확인했습니다. 새 service worker가 있으면 자동으로 안내됩니다.";
      }
      if (shellRecovery && !registration.waiting && !shellState.updateNeeded) {
        const proofPanel = document.getElementById("iosInstallProof");
        const saveButton = document.getElementById("iosInstallProofSaveButton");
        proofPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => saveButton?.focus?.(), 240);
      }
    } catch {
      button.textContent = "확인 실패";
      if (status) status.textContent = "앱 업데이트 확인을 완료하지 못했습니다. 네트워크 연결 후 다시 시도하세요.";
    }
    window.setTimeout(() => {
      button.textContent = "앱 업데이트 확인";
    }, 1800);
  });
}

function buildIosHomeDockShellVersionText() {
  const shellState = iosHomeDockShellVersionState();
  const updateNudge = document.getElementById("iosHomeDockShellUpdateNudge");
  const updateDetail = document.getElementById("iosHomeDockShellUpdateDetail");
  const updateButton = document.getElementById("iosHomeDockShellUpdateCheckButton");
  const updatePrompt = document.getElementById("serviceWorkerUpdatePrompt");
  const updatePromptApplyButton = document.getElementById("serviceWorkerUpdateApplyButton");
  const updateReloadArrival = document.getElementById("iosServiceWorkerUpdateReloadArrivalBanner");
  const root = document.documentElement;
  return [
    "Travel Planner iPhone app shell",
    `url=${window.location.href}`,
    `displayMode=${isStandaloneDisplay() ? "standalone" : "browser"}`,
    `serviceWorker=${"serviceWorker" in navigator ? navigator.serviceWorker.controller ? "controlled" : "supported-uncontrolled" : "unsupported"}`,
    `appShell=${shellState.installed || "(unknown)"}`,
    `serverShell=${shellState.server || "(unknown)"}`,
    `updateNeeded=${shellState.updateNeeded ? "true" : "false"}`,
    `updateNudgeVisible=${updateNudge && !updateNudge.hidden ? "true" : "false"}`,
    `updateNudgeState=${updateNudge?.dataset.state || ""}`,
    `updateNudgeInstalledShell=${updateNudge?.dataset.iosHomeDockShellUpdateNudgeInstalled || ""}`,
    `updateNudgeServerShell=${updateNudge?.dataset.iosHomeDockShellUpdateNudgeServer || ""}`,
    `updateNudgeAction=${updateNudge?.dataset.iosHomeDockShellUpdateNudgeAction || ""}`,
    `updateNudgeDetail=${updateDetail?.textContent.trim() || ""}`,
    `updateNudgeCheckButtonLabel=${updateButton?.textContent.trim() || ""}`,
    `updateNudgeCheckButtonClicked=${updateButton?.dataset.iosHomeDockShellUpdateNudgeClicked || ""}`,
    `updateNudgeCheckButtonClickedAt=${updateButton?.dataset.iosHomeDockShellUpdateNudgeClickedAt || ""}`,
    `updatePromptVisible=${updatePrompt && !updatePrompt.hidden ? "true" : "false"}`,
    `updatePromptWaiting=${updatePrompt?.dataset.iosServiceWorkerUpdatePromptWaiting || ""}`,
    `updatePromptLabel=${updatePrompt?.querySelector("span")?.textContent.trim() || ""}`,
    `updatePromptApplyButtonLabel=${updatePromptApplyButton?.textContent.trim() || ""}`,
    `updatePromptApplied=${updatePrompt?.dataset.iosServiceWorkerUpdatePromptApplied || document.documentElement.dataset.iosServiceWorkerUpdatePromptApplied || ""}`,
    `updatePromptAppliedAt=${updatePrompt?.dataset.iosServiceWorkerUpdatePromptAppliedAt || document.documentElement.dataset.iosServiceWorkerUpdatePromptAppliedAt || ""}`,
    `updatePromptReloadPending=${document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPending || ""}`,
    `updatePromptReloadPendingAt=${document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPendingAt || ""}`,
    `updateReloadArrivalVisible=${updateReloadArrival && !updateReloadArrival.hidden ? "true" : root.dataset.iosServiceWorkerUpdateReloadArrivalVisible || ""}`,
    `updateReloadArrivalAppliedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalAppliedAt || ""}`,
    `updateReloadArrivalReloadPendingAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalReloadPendingAt || ""}`,
    `updateReloadArrivalArrivedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalArrivedAt || ""}`,
    `updateReloadArrivalProofLinkClicked=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClicked || ""}`,
    `updateReloadArrivalProofFocusTarget=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusTarget || ""}`,
    `updateReloadArrivalProofFocusScheduled=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusScheduled || ""}`,
    `updateReloadArrivalProofFocusApplied=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied || ""}`,
    `updateReloadArrivalProofFocusedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusedAt || ""}`,
    `updateReloadArrivalProofResaved=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofResaved || ""}`,
    `updateReloadArrivalProofResavedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalProofResavedAt || ""}`,
    `updateReloadArrivalNextAction=${root.dataset.iosServiceWorkerUpdateReloadArrivalNextAction || ""}`,
    `updateReloadArrivalFinalGateFocusTarget=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusTarget || ""}`,
    `updateReloadArrivalFinalGateFocusScheduled=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusScheduled || ""}`,
    `updateReloadArrivalFinalGateFocusApplied=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusApplied || ""}`,
    `updateReloadArrivalFinalGateFocusedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusedAt || ""}`,
    `updateReloadArrivalFinalGateButtonLabel=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateButtonLabel || ""}`,
    `updateReloadArrivalFinalGateCommandCopied=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopied || ""}`,
    `updateReloadArrivalFinalGateCommandCopiedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopiedAt || ""}`,
    `updateReloadArrivalFinalGateCommandCopyMethod=${root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod || ""}`,
    `updateReloadArrivalCompletionStatusLinkVisible=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkVisible || ""}`,
    `updateReloadArrivalCompletionStatusLinkRoute=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkRoute || ""}`,
    `updateReloadArrivalCompletionStatusLinkLabel=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkLabel || ""}`,
    `updateReloadArrivalCompletionStatusLinkClicked=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClicked || ""}`,
    `updateReloadArrivalCompletionStatusLinkClickedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedAt || ""}`,
    `updateReloadArrivalCompletionStatusLinkClickedRoute=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedRoute || ""}`,
    `updateReloadArrivalCompletionStatusLinkClickedStatusFeedback=${root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedStatusFeedback || ""}`,
    `updateReloadArrivalStatusReviewPending=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPending || ""}`,
    `updateReloadArrivalStatusReviewRoute=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewRoute || ""}`,
    `updateReloadArrivalStatusReviewPendingAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPendingAt || ""}`,
    `updateReloadArrivalStatusReviewVisible=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewVisible || ""}`,
    `updateReloadArrivalStatusReviewArrivedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewArrivedAt || ""}`,
    `updateReloadArrivalStatusReviewDismissed=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissed || ""}`,
    `updateReloadArrivalStatusReviewDismissButtonClicked=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClicked || ""}`,
    `updateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback || ""}`,
    `updateReloadArrivalStatusReviewActionLinkVisible=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkVisible || ""}`,
    `updateReloadArrivalStatusReviewActionLinkRoute=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkRoute || ""}`,
    `updateReloadArrivalStatusReviewActionLinkLabel=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkLabel || ""}`,
    `updateReloadArrivalStatusReviewActionLinkClicked=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClicked || ""}`,
    `updateReloadArrivalStatusReviewActionLinkClickedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClickedAt || ""}`,
    `updateReloadArrivalStatusReviewActionLinkFocusTarget=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusTarget || ""}`,
    `updateReloadArrivalStatusReviewActionLinkFocusScheduled=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusScheduled || ""}`,
    `updateReloadArrivalStatusReviewActionLinkFocusApplied=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusApplied || ""}`,
    `updateReloadArrivalStatusReviewActionLinkFocusedAt=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusedAt || ""}`,
    `updateReloadArrivalStatusReviewActionLinkStatusFeedback=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkStatusFeedback || ""}`,
    `updateReloadArrivalStatusReviewCompletionCueVisible=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueVisible || ""}`,
    `updateReloadArrivalStatusReviewCompletionCueTarget=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueTarget || ""}`,
    `updateReloadArrivalStatusReviewCompletionCueLabel=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueLabel || ""}`,
    `updateReloadArrivalStatusReviewCompletionCueRefreshTarget=${root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueRefreshTarget || ""}`,
    `installCompletionNextGateCueVisible=${root.dataset.iosInstallCompletionNextGateCueVisible || ""}`,
    `installCompletionNextGateCueLabel=${root.dataset.iosInstallCompletionNextGateCueLabel || ""}`,
    `installCompletionNextGateCueState=${root.dataset.iosInstallCompletionNextGateCueState || ""}`,
    `installCompletionNextGateCueReason=${root.dataset.iosInstallCompletionNextGateCueReason || ""}`,
    `installCompletionNextGateCueTarget=${root.dataset.iosInstallCompletionNextGateCueTarget || ""}`,
    `installCompletionNextGateCueActionLinkVisible=${root.dataset.iosInstallCompletionNextGateCueActionLinkVisible || ""}`,
    `installCompletionNextGateCueActionLinkRoute=${root.dataset.iosInstallCompletionNextGateCueActionLinkRoute || ""}`,
    `installCompletionNextGateCueActionLinkLabel=${root.dataset.iosInstallCompletionNextGateCueActionLinkLabel || ""}`,
    `installCompletionNextGateCueActionLinkClicked=${root.dataset.iosInstallCompletionNextGateCueActionLinkClicked || ""}`,
    `installCompletionNextGateCueActionLinkClickedAt=${root.dataset.iosInstallCompletionNextGateCueActionLinkClickedAt || ""}`,
    `installCompletionNextGateCueActionLinkFocusTarget=${root.dataset.iosInstallCompletionNextGateCueActionLinkFocusTarget || ""}`,
    `installCompletionNextGateCueActionLinkFocusApplied=${root.dataset.iosInstallCompletionNextGateCueActionLinkFocusApplied || ""}`,
    `installCompletionNextGateCueActionLinkFocusedAt=${root.dataset.iosInstallCompletionNextGateCueActionLinkFocusedAt || ""}`,
    `installCompletionNextGateCueActionLinkStatusFeedback=${root.dataset.iosInstallCompletionNextGateCueActionLinkStatusFeedback || ""}`,
    `updateReloadArrivalDismissed=${root.dataset.iosServiceWorkerUpdateReloadArrivalDismissed || ""}`,
  ].join("\n");
}

function bindIosHomeDockShellVersionCopyButton() {
  const button = document.getElementById("iosHomeDockShellVersionCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockShellVersionCopyBound === "true") return;
  button.dataset.iosHomeDockShellVersionCopyBound = "true";
  button.addEventListener("click", async () => {
    if (!iosHomeDockShellVersion) {
      await refreshIosHomeDockShellVersion();
      updateIosHomeDock();
    }
    const text = buildIosHomeDockShellVersionText();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "shell 복사됨";
      if (status) status.textContent = "현재 iPhone 앱 shell 버전과 service worker 상태를 복사했습니다.";
      window.setTimeout(() => {
        button.textContent = "shell 버전 복사";
      }, 1400);
    } catch {
      window.prompt("현재 iPhone 앱 shell 정보를 복사하세요.", text);
    }
  });
}

function bindIosHomeDockShellUpdateNudgeButton() {
  const button = document.getElementById("iosHomeDockShellUpdateCheckButton");
  const target = document.getElementById("iosHomeDockAppUpdateButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockShellUpdateNudgeBound === "true") return;
  button.dataset.iosHomeDockShellUpdateNudgeBound = "true";
  button.addEventListener("click", () => {
    button.dataset.iosHomeDockShellUpdateNudgeClicked = "true";
    button.dataset.iosHomeDockShellUpdateNudgeClickedAt = new Date().toISOString();
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target?.focus?.(), 160);
    if (status) status.textContent = "앱 업데이트 확인 버튼으로 이동했습니다. 새 버전 적용 안내가 보이면 적용한 뒤 상태 새로고침과 설치 증거 저장을 다시 진행하세요.";
  });
}

function bindIosHomeDockProofButton() {
  const button = document.getElementById("iosHomeDockProofButton");
  if (!button || button.dataset.iosHomeDockProofBound === "true") return;
  button.dataset.iosHomeDockProofBound = "true";
  button.addEventListener("click", () => {
    const proofPanel = document.getElementById("iosInstallProof");
    const saveButton = document.getElementById("iosInstallProofSaveButton");
    proofPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => saveButton?.focus(), 240);
  });
}

function bindIosHomeDockNextStep() {
  const nextStep = document.getElementById("iosHomeDockNextStep");
  if (!nextStep || nextStep.dataset.iosHomeDockNextStepBound === "true") return;
  nextStep.dataset.iosHomeDockNextStepBound = "true";
  const activate = () => {
    const nextItem = nextIosFirstRunChecklistItem(readIosFirstRunChecklist());
    focusIosHomeDockNextStepTarget(nextItem);
  };
  nextStep.addEventListener("click", activate);
  nextStep.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });
}

function bindIosHomeDockPlanStarterButton() {
  const submitButton = document.getElementById("planFormSubmitButton");
  if (submitButton && submitButton.dataset.iosHomeDockPlanSubmitButtonBound !== "true") {
    submitButton.dataset.iosHomeDockPlanSubmitButtonBound = "true";
    submitButton.addEventListener("click", () => {
      const label = submitButton.textContent.trim();
      const feedback = `새 여행 플랜 만들기 버튼을 눌렀습니다. label=${label}; draftValues=excluded; llmSecrets=excluded`;
      submitButton.dataset.iosHomeDockPlanSubmitButtonClicked = "true";
      submitButton.dataset.iosHomeDockPlanSubmitButtonClickedAt = new Date().toISOString();
      submitButton.dataset.iosHomeDockPlanSubmitButtonClickedStatusFeedback = feedback;
      const hint = document.getElementById("newPlanShortcutHint");
      if (hint) {
        hint.hidden = false;
        hint.className = "form-message";
        hint.textContent = feedback;
      }
    });
  }
  const link = document.getElementById("iosHomeDockPlanStarterLink");
  if (link && link.dataset.iosHomeDockPlanStarterLinkBound !== "true") {
    link.dataset.iosHomeDockPlanStarterLinkBound = "true";
    link.addEventListener("click", () => {
      const route = link.getAttribute("href") || "";
      const label = link.textContent.trim();
      const state = link.dataset.iosHomeDockPlanStarterLinkState || "";
      const feedback = `첫 여행 플랜 시작 링크를 열었습니다. label=${label}; route=${route}; state=${state}`;
      link.dataset.iosHomeDockPlanStarterLinkClicked = "true";
      link.dataset.iosHomeDockPlanStarterLinkClickedAt = new Date().toISOString();
      link.dataset.iosHomeDockPlanStarterLinkClickedRoute = route;
      link.dataset.iosHomeDockPlanStarterLinkClickedLabel = label;
      link.dataset.iosHomeDockPlanStarterLinkClickedState = state;
      link.dataset.iosHomeDockPlanStarterLinkClickedStatusFeedback = feedback;
      const nextStep = document.getElementById("iosHomeDockNextStep");
      if (nextStep) nextStep.textContent = feedback;
    });
  }
  const button = document.getElementById("iosHomeDockPlanStarterSampleButton");
  if (!button || button.dataset.iosHomeDockPlanStarterBound === "true") return;
  button.dataset.iosHomeDockPlanStarterBound = "true";
  button.addEventListener("click", () => {
    const focusSampleTarget = () => {
      const form = document.getElementById("planForm");
      const firstInput = form?.querySelector("input, textarea, select, button");
      form?.scrollIntoView({ behavior: "smooth", block: "start" });
      button.dataset.iosHomeDockPlanStarterSampleButtonFocusTarget = form ? "planForm" : "";
      button.dataset.iosHomeDockPlanStarterSampleButtonFocusScheduled = firstInput ? "true" : "false";
      button.dataset.iosHomeDockPlanStarterSampleButtonFocusApplied = "pending";
      if (form) {
        highlightIosHomeDockDraftResumeTarget(form);
        button.dataset.iosHomeDockPlanStarterSampleButtonHighlightApplied = "true";
      } else {
        button.dataset.iosHomeDockPlanStarterSampleButtonHighlightApplied = "false";
      }
      window.setTimeout(() => {
        firstInput?.focus();
        button.dataset.iosHomeDockPlanStarterSampleButtonFocusApplied = firstInput ? "true" : "false";
        button.dataset.iosHomeDockPlanStarterSampleButtonFocusedAt = new Date().toISOString();
      }, 240);
    };
    const showSampleFollowupHint = (message) => {
      const hint = document.getElementById("newPlanShortcutHint");
      if (!hint) return;
      hint.hidden = false;
      hint.className = "form-message";
      hint.textContent = message;
      hint.setAttribute("role", "status");
      hint.setAttribute("aria-live", "polite");
      hint.setAttribute("aria-atomic", "true");
      button.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintVisible = "true";
      button.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintText = message;
      button.dataset.iosHomeDockPlanStarterSampleButtonFollowupHintUpdatedAt = new Date().toISOString();
    };
    const recordSampleButtonClick = (mode, feedback) => {
      button.dataset.iosHomeDockPlanStarterSampleButtonClicked = "true";
      button.dataset.iosHomeDockPlanStarterSampleButtonClickedAt = new Date().toISOString();
      button.dataset.iosHomeDockPlanStarterSampleButtonClickedMode = mode;
      button.dataset.iosHomeDockPlanStarterSampleButtonClickedStatusFeedback = feedback;
      const nextStep = document.getElementById("iosHomeDockNextStep");
      if (nextStep) nextStep.textContent = feedback;
    };
    if (typeof window.fillMissionStarterForm === "function") {
      window.fillMissionStarterForm({ source: "ios-home-screen" });
      focusSampleTarget();
      showSampleFollowupHint("예시가 입력됐습니다. 목적지, 날짜, 동행, 스타일을 확인한 뒤 플랜 만들기를 누르세요. 입력값은 진단에 복사하지 않습니다.");
      recordSampleButtonClick("mission-starter-form", "첫 여행 플랜 예시를 입력했습니다. 입력값은 진단에 복사하지 않습니다.");
      button.textContent = "예시 입력됨";
      window.setTimeout(() => {
        button.textContent = "예시로 빠르게 채우기";
      }, 1400);
      return;
    }
    focusSampleTarget();
    showSampleFollowupHint("첫 여행 플랜 입력 폼으로 이동했습니다. 목적지, 날짜, 동행, 스타일을 입력한 뒤 플랜 만들기를 누르세요.");
    recordSampleButtonClick("form-focus-fallback", "첫 여행 플랜 입력 폼으로 이동했습니다. 입력값은 진단에 복사하지 않습니다.");
  });
}

async function readIosHomeDockCompletionStatusText() {
  try {
    const response = typeof api === "function"
      ? await api("/api/ios-install-completion-status.txt", { headers: { Accept: "text/plain" } })
      : await fetch("/api/ios-install-completion-status.txt", {
          headers: typeof withAccessKeyHeaders === "function"
            ? withAccessKeyHeaders({ Accept: "text/plain" })
            : { Accept: "text/plain" },
        });
    if (response.ok) return response.text();
  } catch {
    // Fall back to the client-side completion summary below.
  }
  return typeof installCompletionStatusText === "function"
    ? installCompletionStatusText()
    : [
        "Travel Planner iPhone install completion status",
        "completionStatusPageUrl=/ios-install-status",
        "completionStatusUrl=/api/ios-install-completion-status.txt",
      ].join("\n");
}

async function refreshIosHomeDockCompletionStatus() {
  if (iosHomeDockCompletionStatusRefreshPending) return;
  iosHomeDockCompletionStatusRefreshPending = true;
  try {
    const response = typeof api === "function"
      ? await api("/api/ios-install-completion-status", { headers: { Accept: "application/json" } })
      : await fetch("/api/ios-install-completion-status", {
          headers: typeof withAccessKeyHeaders === "function"
            ? withAccessKeyHeaders({ Accept: "application/json" })
            : { Accept: "application/json" },
        });
    if (response.ok) {
      iosInstallCompletionStatus = await response.json();
    }
  } catch {
    // Keep the existing summary-check based fallback when completion status is unavailable.
  } finally {
    iosHomeDockCompletionStatusRefreshPending = false;
  }
}

async function refreshIosHomeDockShellVersion() {
  try {
    const response = await fetch("/health.json", { headers: { Accept: "application/json" } });
    if (response.ok) {
      const health = await response.json();
      iosHomeDockShellVersion = health.serviceWorkerCacheName || "";
    }
  } catch {
    // Keep the previous visible app shell version when health metadata is unavailable.
  }
  try {
    const latestUrl = new URL("/health.json", window.location.href);
    latestUrl.searchParams.set("shellCheck", String(Date.now()));
    const latestResponse = await fetch(latestUrl.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (latestResponse.ok) {
      const latestHealth = await latestResponse.json();
      iosHomeDockServerShellVersion = latestHealth.serviceWorkerCacheName || "";
    }
  } catch {
    // Offline installed apps can still show the app-shell version from the cached health metadata.
  }
}

function iosHomeDockShellVersionState() {
  const installed = iosHomeDockShellVersion || "";
  const server = iosHomeDockServerShellVersion || "";
  return {
    installed,
    server,
    updateNeeded: Boolean(installed && server && installed !== server),
  };
}

function iosHomeDockLastRouteLabel(pathname, hash) {
  if (pathname.startsWith("/plans/")) return "마지막 플랜 상세";
  if (pathname === "/ios-install-status") return "완료 상태 이어가기";
  if (hash === "#planForm") return "새 플랜 입력 이어가기";
  if (hash === "#iosInstallProofSaveButton") return "설치 증거 이어가기";
  if (hash === "#iosInstallFirstRun") return "설치 체크 이어가기";
  return "마지막 위치 이어가기";
}

function readIosHomeDockLastRoute() {
  try {
    const route = JSON.parse(window.localStorage.getItem(IOS_HOME_DOCK_LAST_ROUTE_STORAGE) || "{}");
    if (!route || typeof route !== "object" || !route.href) return null;
    return route;
  } catch {
    return null;
  }
}

function writeIosHomeDockLastRoute(reason = "route") {
  if (!isStandaloneDisplay()) return;
  const pathname = window.location.pathname || "/";
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  if (pathname === "/" && !hash) return;
  const href = pathname + search + hash;
  const route = {
    schemaVersion: 1,
    href,
    pathname,
    hash,
    label: iosHomeDockLastRouteLabel(pathname, hash),
    reason,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(IOS_HOME_DOCK_LAST_ROUTE_STORAGE, JSON.stringify(route));
  } catch {
    // Best-effort Home Screen resume pointer; never block app use.
  }
}

function bindIosHomeDockLastRouteTracking() {
  if (document.documentElement.dataset.iosHomeDockLastRouteBound === "true") return;
  document.documentElement.dataset.iosHomeDockLastRouteBound = "true";
  window.addEventListener("hashchange", () => writeIosHomeDockLastRoute("hashchange"));
  window.addEventListener("pagehide", () => writeIosHomeDockLastRoute("pagehide"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeIosHomeDockLastRoute("visibility-hidden");
  });
}

function buildIosHomeDockCompletionStatusHandoffText() {
  const statusUrl = new URL("/ios-install-status", window.location.href).toString();
  const statusTextUrl = new URL("/api/ios-install-completion-status.txt", window.location.href).toString();
  const statusJsonUrl = new URL("/api/ios-install-completion-status", window.location.href).toString();
  const finalGateCommand = iosInstallFinishTerminalCommand();
  return [
    "Travel Planner iPhone install completion status",
    "criteria=Home Screen proof + Mac final gate + first-plan creation + completion-status review",
    `statusPage=${statusUrl}`,
    `statusText=${statusTextUrl}`,
    `statusJson=${statusJsonUrl}`,
    `finalGate=${finalGateCommand}`,
  ].join("\n");
}

function bindIosHomeDockCompletionStatusCopyButton() {
  const button = document.getElementById("iosHomeDockCompletionStatusCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockCompletionStatusBound === "true") return;
  button.dataset.iosHomeDockCompletionStatusBound = "true";
  button.addEventListener("click", async () => {
    const text = await readIosHomeDockCompletionStatusText();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "복사됨";
      if (status) status.textContent = "iPhone 설치 완료 상태를 복사했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 함께 확인할 수 있습니다.";
      window.setTimeout(() => {
        button.textContent = "완료 상태 복사";
      }, 1600);
    } catch {
      window.prompt("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 iPhone 설치 완료 상태를 복사하세요.", text);
    }
  });
}

function bindIosHomeDockCompletionStatusShareButton() {
  const button = document.getElementById("iosHomeDockCompletionStatusShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockCompletionStatusShareBound === "true") return;
  if (!navigator.share) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.dataset.iosHomeDockCompletionStatusShareBound = "true";
  button.addEventListener("click", async () => {
    const text = await readIosHomeDockCompletionStatusText();
    try {
      await navigator.share({
        title: "Travel Planner iPhone 설치 완료 상태",
        text,
        url: new URL("/ios-install-status", window.location.href).toString(),
      });
      if (status) status.textContent = "iPhone 설치 완료 상태를 공유했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 함께 확인하세요.";
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = "공유를 완료하지 못해 완료 상태를 클립보드에 복사했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 함께 확인하세요.";
      } catch {
        window.prompt("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 iPhone 설치 완료 상태를 복사하세요.", text);
      }
    }
  });
}

function iosInstallFinishTerminalCommand() {
  return "test -d webapp && cd webapp; npm run ios:install:finish";
}

function bindIosHomeDockFinalGateCopyButton() {
  const button = document.getElementById("iosHomeDockFinalGateCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockFinalGateBound === "true") return;
  button.dataset.iosHomeDockFinalGateBound = "true";
  button.addEventListener("click", async () => {
    const command = iosInstallFinishTerminalCommand();
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = "복사됨";
      if (status) status.textContent = "Mac에서 실행할 최종 evidence archive/gate 명령을 복사했습니다.";
      window.setTimeout(() => {
        button.textContent = "최종 gate 복사";
      }, 1600);
    } catch {
      window.prompt("Mac에서 실행할 최종 evidence archive/gate 명령을 복사하세요.", command);
    }
  });
}

function bindIosHomeDockFinalGateShareButton() {
  const button = document.getElementById("iosHomeDockFinalGateShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockFinalGateShareBound === "true") return;
  if (!navigator.share) {
    button.hidden = true;
    return;
  }
  button.dataset.iosHomeDockFinalGateShareBound = "true";
  button.addEventListener("click", async () => {
    const command = iosInstallFinishTerminalCommand();
    const text = [
      "Travel Planner iPhone final Mac gate",
      `command=${command}`,
      `status=${new URL("/ios-install-status", window.location.href).toString()}`,
    ].join("\n");
    try {
      await navigator.share({
        title: "Travel Planner iPhone 최종 gate",
        text,
        url: new URL("/ios-install-status", window.location.href).toString(),
      });
      if (status) status.textContent = "Mac에서 실행할 최종 gate 명령을 공유했습니다.";
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(command);
        if (status) status.textContent = "공유를 완료하지 못해 최종 gate 명령을 클립보드에 복사했습니다.";
      } catch {
        window.prompt("Mac에서 실행할 최종 evidence archive/gate 명령을 복사하세요.", command);
      }
    }
  });
}

function bindIosHomeDockOfflineReadButton() {
  const button = document.getElementById("iosHomeDockOfflineReadButton");
  if (!button || button.dataset.iosHomeDockOfflineReadBound === "true") return;
  button.dataset.iosHomeDockOfflineReadBound = "true";
  button.addEventListener("click", () => {
    const status = document.getElementById("iosInstallStatus");
    const snapshotCount = countLocalStorageKeys("travel-planner:home-plan-snapshot:v1:")
      + countLocalStorageKeys("travel-planner:plan-detail-snapshot:v1:");
    if (snapshotCount <= 0) {
      const planList = document.getElementById("planList");
      planList?.scrollIntoView({ behavior: "smooth", block: "start" });
      button.textContent = "snapshot 먼저 만들기";
      if (status) {
        status.textContent = "오프라인 확인 전 최근 여행 목록이나 상세 플랜을 한 번 열어 snapshot을 먼저 만들어주세요.";
      }
      window.setTimeout(() => {
        button.textContent = "오프라인 확인 완료";
      }, 1600);
      return;
    }
    const state = readIosFirstRunChecklist();
    state["offline-read"] = true;
    writeIosFirstRunChecklist(state);
    updateIosFirstRunChecklist();
    updateIosHomeDock();
    button.textContent = "오프라인 확인됨";
    if (status) {
      status.textContent = `오프라인 snapshot ${snapshotCount}개를 확인했습니다. 이 iPhone의 첫 실행 체크가 완료됐습니다.`;
    }
  });
}

function bindIosHomeDockSnapshotClearButton() {
  const button = document.getElementById("iosHomeDockSnapshotClearButton");
  if (!button || button.dataset.iosHomeDockSnapshotClearBound === "true") return;
  button.dataset.iosHomeDockSnapshotClearBound = "true";
  button.addEventListener("click", () => {
    const ok = window.confirm("이 iPhone에 저장된 홈/상세 오프라인 snapshot만 지웁니다. 서버에 저장된 여행 플랜은 삭제되지 않습니다. 계속할까요?");
    if (!ok) return;
    const removed = clearIosSnapshotKeys();
    const state = readIosFirstRunChecklist();
    state["offline-read"] = false;
    writeIosFirstRunChecklist(state);
    updateIosFirstRunChecklist();
    updateIosHomeDock();
    button.textContent = `${removed}개 정리됨`;
    window.setTimeout(() => {
      button.textContent = "오프라인 snapshot 정리";
    }, 1400);
  });
}

function bindIosHomeDockRefreshButton() {
  const button = document.getElementById("iosHomeDockRefreshButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosHomeDockRefreshBound === "true") return;
  button.dataset.iosHomeDockRefreshBound = "true";
  button.addEventListener("click", async () => {
    updateIosFirstRunChecklist();
    button.textContent = "상태 확인 중";
    await Promise.all([
      refreshIosHomeDockCompletionStatus(),
      refreshIosHomeDockShellVersion(),
    ]);
    updateIosHomeDock();
    const complete = iosInstallCompletionStatus?.complete === true;
    const shell = iosHomeDockShellVersion ? ` 현재 앱 shell은 ${iosHomeDockShellVersion}입니다.` : "";
    button.textContent = complete ? "완료 확인됨" : "상태 갱신됨";
    if (status) {
      status.textContent = complete
        ? `iPhone 설치 완료 상태를 다시 확인했습니다. Home Screen dock이 완료 상태로 정리됐습니다.${shell}`
        : `iPhone 설치 상태를 다시 확인했습니다. 아직 남은 Home Screen proof, 체크, Mac final gate, 첫 플랜 생성, 완료 상태 review 항목을 이어서 진행하세요.${shell}`;
    }
    window.setTimeout(() => {
      button.textContent = "상태 새로고침";
    }, 1200);
  });
}

function focusIosHomeDockShellRecoveryTarget() {
  if (iosHomeDockShellRecoveryFocusApplied || window.location.hash !== "#iosHomeDockShellRecovery") return;
  const dock = document.getElementById("iosHomeDock");
  const button = document.getElementById("iosHomeDockAppUpdateButton");
  const status = document.getElementById("iosInstallStatus");
  if (!dock || dock.hidden || !button) return;
  iosHomeDockShellRecoveryFocusApplied = true;
  dock.scrollIntoView({ behavior: "smooth", block: "start" });
  if (status) {
    status.textContent = "저장된 proof가 오래된 앱 shell을 보고했습니다. 앱 업데이트 확인을 누른 뒤 새 버전 적용, 상태 새로고침, 설치 증거 저장을 다시 진행하세요.";
  }
  window.setTimeout(() => button.focus?.(), 240);
}

function clearIosHomeDockShellRecoveryHashWhenProofSaved() {
  if (window.location.hash !== "#iosHomeDockShellRecovery") return;
  const state = readIosFirstRunChecklist();
  if (!state.proof) return;
  try {
    window.history.replaceState(null, "", "#iosInstallAfterPhone");
  } catch {
    window.location.hash = "iosInstallAfterPhone";
  }
}

function updateIosHomeDock() {
  const dock = document.getElementById("iosHomeDock");
  if (!dock) return;

  dock.hidden = !isStandaloneDisplay();
  if (dock.hidden) return;

  const state = readIosFirstRunChecklist();
  const doneCount = IOS_FIRST_RUN_CHECKLIST_ITEMS.filter((item) => state[item.id]).length;
  const progress = document.getElementById("iosHomeDockProgress");
  const snapshots = document.getElementById("iosHomeDockSnapshotStatus");
  const draftStatus = document.getElementById("iosHomeDockDraftStatus");
  const draftResumeLink = document.getElementById("iosHomeDockDraftResumeLink");
  const lastRouteLink = document.getElementById("iosHomeDockLastRouteLink");
  const lastRouteClearButton = document.getElementById("iosHomeDockLastRouteClearButton");
  const proof = document.getElementById("iosHomeDockProofStatus");
  const finalGateStatus = document.getElementById("iosHomeDockFinalGateStatus");
  const shellVersion = document.getElementById("iosHomeDockShellVersion");
  const displayModeStatus = document.getElementById("iosHomeDockDisplayModeStatus");
  const shellUpdateNudge = document.getElementById("iosHomeDockShellUpdateNudge");
  const shellUpdateDetail = document.getElementById("iosHomeDockShellUpdateDetail");
  const shellUpdateCheckButton = document.getElementById("iosHomeDockShellUpdateCheckButton");
  const proofButton = document.getElementById("iosHomeDockProofButton");
  const proofNudge = document.getElementById("iosHomeDockProofNudge");
  const finalGateNudge = document.getElementById("iosHomeDockFinalGateNudge");
  const finalGateCopyButton = document.getElementById("iosHomeDockFinalGateCopyButton");
  const finalGateShareButton = document.getElementById("iosHomeDockFinalGateShareButton");
  const finalGateSmsLink = document.getElementById("iosHomeDockFinalGateSmsLink");
  const finalGateMailLink = document.getElementById("iosHomeDockFinalGateMailLink");
  const completionStatusSmsLink = document.getElementById("iosHomeDockCompletionStatusSmsLink");
  const completionStatusMailLink = document.getElementById("iosHomeDockCompletionStatusMailLink");
  const planStarter = document.getElementById("iosHomeDockPlanStarter");
  const planStarterTitle = document.getElementById("iosHomeDockPlanStarterTitle");
  const planStarterDetail = document.getElementById("iosHomeDockPlanStarterDetail");
  const planStarterLink = document.getElementById("iosHomeDockPlanStarterLink");
  const planStarterButton = document.getElementById("iosHomeDockPlanStarterSampleButton");
  const nextStep = document.getElementById("iosHomeDockNextStep");
  const offlineReadButton = document.getElementById("iosHomeDockOfflineReadButton");
  const latestPlans = document.getElementById("iosHomeDockLatestPlans");
  const homeSnapshots = readIosHomeDockSnapshots();
  const snapshotSavedAt = formatIosHomeDockSnapshotTime(homeSnapshots);
  const draft = readNewPlanDraftDiagnostics();
  const proofDone = Boolean(state.proof);
  const firstPlanDone = Boolean(state["first-plan"]);
  const offlineReadDone = Boolean(state["offline-read"]);
  const offlineSnapshotCount = countLocalStorageKeys("travel-planner:home-plan-snapshot:v1:")
    + countLocalStorageKeys("travel-planner:plan-detail-snapshot:v1:");
  const firstRunComplete = doneCount === IOS_FIRST_RUN_CHECKLIST_ITEMS.length;
  const serverCompletionKnown = typeof iosInstallCompletionStatus?.complete === "boolean";
  const installCompletionReady = serverCompletionKnown
    ? iosInstallCompletionStatus.complete === true
    : iosInstallSummaryCheck?.ok === true
      && iosInstallSummaryCheck?.status === "ready"
      && iosInstallSummaryCheck?.summaryStatus === "complete"
      && iosInstallSummaryCheck?.finalEvidenceCommand === "npm run ios:install:evidence:after-phone:final"
      && iosInstallSummaryCheck?.launchProofAppModeReady === true;
  const finalGateKnownReady = serverCompletionKnown
    ? iosInstallCompletionStatus.finalEvidenceCommandReady === true
    : iosInstallSummaryCheck?.ok === true
      && iosInstallSummaryCheck?.status === "ready"
      && iosInstallSummaryCheck?.finalEvidenceCommand === "npm run ios:install:evidence:after-phone:final";
  const finalGatePending = proofDone && !finalGateKnownReady;
  const dockState = firstRunComplete && installCompletionReady
    ? "complete"
    : proofDone
      ? "finish"
      : "setup";
  dock.dataset.state = dockState;
  dock.setAttribute("aria-label", dockState === "complete"
    ? "iPhone 빠른 실행, 설치 체크와 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 완료"
    : dockState === "finish"
      ? "iPhone 빠른 실행, 설치 마무리 진행 중"
      : "iPhone 빠른 실행, 설치 증거 저장 필요");
  if (displayModeStatus) {
    const displayMode = isStandaloneDisplay() ? "standalone" : "browser";
    displayModeStatus.textContent = displayMode === "standalone" ? "홈 화면 앱 실행 중" : "브라우저 실행 중";
    displayModeStatus.title = displayMode === "standalone"
      ? "Safari 주소창 없이 Travel 홈 화면 앱으로 실행 중입니다."
      : "Safari나 브라우저 탭으로 실행 중입니다. 홈 화면 Travel 아이콘으로 다시 열어 proof를 저장하세요.";
    displayModeStatus.setAttribute("aria-label", displayModeStatus.title);
    displayModeStatus.dataset.iosHomeDockDisplayMode = displayMode;
    displayModeStatus.dataset.iosHomeDockDisplayModeVisible = "true";
  }
  if (progress) {
    progress.textContent = `설치 체크 ${doneCount}/${IOS_FIRST_RUN_CHECKLIST_ITEMS.length} 완료`;
    progress.href = "#iosInstallFirstRun";
    progress.title = "iPhone 첫 실행 체크 목록으로 이동합니다.";
    progress.setAttribute("aria-label", `iPhone 첫 실행 체크 ${doneCount}/${IOS_FIRST_RUN_CHECKLIST_ITEMS.length} 완료, 체크 목록 열기`);
    progress.dataset.state = firstRunComplete ? "ok" : "todo";
  }
  if (snapshots) {
    const homeCount = countLocalStorageKeys("travel-planner:home-plan-snapshot:v1:");
    const detailCount = countLocalStorageKeys("travel-planner:plan-detail-snapshot:v1:");
    snapshots.textContent = `오프라인 snapshot: 홈 ${homeCount}개 · 상세 ${detailCount}개${snapshotSavedAt ? ` · ${snapshotSavedAt}` : ""}`;
    const hasSnapshots = homeCount + detailCount > 0;
    snapshots.href = hasSnapshots ? "#iosHomeDockLatestPlans" : "#planList";
    snapshots.title = hasSnapshots
      ? "저장된 오프라인 snapshot에서 최근 여행을 확인합니다."
      : "최근 여행 목록이나 상세 플랜을 열어 오프라인 snapshot을 만듭니다.";
    snapshots.setAttribute("aria-label", hasSnapshots
      ? `오프라인 snapshot 홈 ${homeCount}개, 상세 ${detailCount}개 확인`
      : "오프라인 snapshot 없음, 여행 목록으로 이동해 snapshot 만들기");
    snapshots.dataset.state = hasSnapshots ? "ok" : "todo";
  }
  if (draftStatus) {
    const hasDraft = draft.state === "saved" || draft.state === "saved-no-time";
    const needsReview = draft.state === "unreadable";
    draftStatus.textContent = hasDraft
      ? `새 플랜 초안: ${draft.fieldCount}개 필드`
      : needsReview
      ? "새 플랜 초안: 확인 필요"
      : "새 플랜 초안: 없음";
    draftStatus.href = "#planForm";
    draftStatus.title = hasDraft
      ? `이 iPhone 브라우저에 비밀값 제외 새 플랜 draft가 저장되어 있습니다. 저장 시각: ${draft.updatedAt || "확인 불가"}. 입력 내용은 이 상태 pill에 표시하지 않습니다. 초안 상태 복사 버튼으로 값 없는 진단만 복사할 수 있습니다.`
      : needsReview
      ? "이 iPhone 브라우저의 새 플랜 draft 상태를 읽지 못했습니다. 새 플랜 폼에서 다시 저장하거나 삭제하세요."
      : "이 iPhone 브라우저에 저장된 새 플랜 draft가 없습니다. 새 플랜 폼에 입력하면 비밀값 제외 draft가 자동 저장됩니다. 초안 상태 복사 버튼으로 값 없는 진단만 복사할 수 있습니다.";
    draftStatus.setAttribute("aria-label", draftStatus.title);
    draftStatus.dataset.state = hasDraft ? "ok" : needsReview ? "warn" : "todo";
  }
  if (draftResumeLink) {
    const hasDraft = draft.state === "saved" || draft.state === "saved-no-time";
    draftResumeLink.textContent = hasDraft ? "초안 이어쓰기" : "새 초안 시작";
    draftResumeLink.href = "#planForm";
    draftResumeLink.title = hasDraft
      ? `이 iPhone 브라우저에 저장된 새 플랜 draft ${draft.fieldCount}개 필드를 이어서 작성합니다. 입력 내용과 LLM 비밀값은 링크에 표시하지 않습니다.`
      : "새 플랜 입력 폼으로 이동해 이 iPhone 브라우저에 비밀값 제외 draft를 시작합니다.";
    draftResumeLink.setAttribute("aria-label", draftResumeLink.title);
    draftResumeLink.dataset.state = hasDraft ? "ok" : "todo";
  }
  const lastRoute = readIosHomeDockLastRoute();
  if (lastRouteLink) {
    lastRouteLink.hidden = !lastRoute;
    lastRouteLink.dataset.iosHomeDockLastRouteVisible = lastRoute ? "true" : "false";
    if (lastRouteLink.dataset.iosHomeDockLastRouteBound !== "true") {
      lastRouteLink.dataset.iosHomeDockLastRouteBound = "true";
      lastRouteLink.addEventListener("click", () => {
        lastRouteLink.dataset.iosHomeDockLastRouteClicked = "true";
        lastRouteLink.dataset.iosHomeDockLastRouteClickedAt = new Date().toISOString();
        lastRouteLink.dataset.iosHomeDockLastRouteClickedHref = lastRouteLink.getAttribute("href") || "";
        lastRouteLink.dataset.iosHomeDockLastRouteClickedLabel = lastRouteLink.textContent.trim() || "";
        lastRouteLink.dataset.iosHomeDockLastRouteClickedStatusFeedback = "마지막 위치 이어가기를 열었습니다. draftValues=excluded; llmSecrets=excluded";
      });
    }
    if (lastRoute) {
      lastRouteLink.href = lastRoute.href;
      lastRouteLink.textContent = lastRoute.label || "마지막 위치 이어가기";
      lastRouteLink.title = "이 iPhone 홈 화면 앱에서 마지막으로 저장한 위치로 돌아갑니다. 저장 시각: " + (lastRoute.updatedAt || "확인 불가") + ". 입력값과 LLM 비밀값은 저장하지 않습니다.";
      lastRouteLink.setAttribute("aria-label", (lastRoute.label || "마지막 위치 이어가기") + ", 입력값과 LLM 비밀값 없이 저장된 위치 열기");
      lastRouteLink.dataset.iosHomeDockLastRouteHref = lastRoute.href || "";
      lastRouteLink.dataset.iosHomeDockLastRouteLabel = lastRoute.label || "";
      lastRouteLink.dataset.iosHomeDockLastRouteUpdatedAt = lastRoute.updatedAt || "";
      lastRouteLink.dataset.iosHomeDockLastRouteReason = lastRoute.reason || "";
    }
  }
  if (lastRouteClearButton) {
    const clearNextTappable = lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextTappable === "true";
    const clearButtonVisible = Boolean(lastRoute) || clearNextTappable;
    lastRouteClearButton.hidden = !clearButtonVisible;
    lastRouteClearButton.dataset.iosHomeDockLastRouteClearVisible = clearButtonVisible ? "true" : "false";
    if (!lastRoute && clearNextTappable) {
      const nextLabel = lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextLabel || "다음 행동 열기";
      lastRouteClearButton.textContent = nextLabel;
      lastRouteClearButton.title = `마지막 위치를 지웠습니다. 다음으로 ${nextLabel}을 엽니다.`;
      lastRouteClearButton.setAttribute("aria-label", `마지막 위치 삭제 후 다음 행동 열기: ${nextLabel}`);
      lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextPersisted = "true";
    }
    if (lastRouteClearButton.dataset.iosHomeDockLastRouteClearBound !== "true") {
      lastRouteClearButton.dataset.iosHomeDockLastRouteClearBound = "true";
      lastRouteClearButton.addEventListener("click", () => {
        if (lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextTappable === "true") {
          const route = lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextRoute || "#iosInstallFirstRun";
          const label = lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextLabel || "다음 행동 열기";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextOpened = "true";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextOpenedAt = new Date().toISOString();
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextOpenedRoute = route;
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextOpenedLabel = label;
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextOpenedStatusFeedback = "마지막 위치 삭제 후 다음 행동을 열었습니다. draftValues=preserved; llmSecrets=preserved";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextTappable = "false";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextPersisted = "false";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextConsumed = "true";
          lastRouteClearButton.dataset.iosHomeDockLastRouteClearVisible = "false";
          lastRouteClearButton.hidden = true;
          window.location.href = route;
          return;
        }
        try {
          window.localStorage.removeItem(IOS_HOME_DOCK_LAST_ROUTE_STORAGE);
        } catch {
          // Keep the clear button state visible when localStorage is unavailable.
        }
        const clearFeedback = "마지막 위치 이어가기를 지웠습니다. draftValues=preserved; llmSecrets=preserved";
        const nextRoute = firstPlanDone ? "#planList" : proofDone ? "#planForm" : "#iosInstallFirstRun";
        const nextLabel = firstPlanDone ? "최근 여행 보기" : proofDone ? "새 여행 플랜 입력" : "설치 체크 열기";
        lastRouteClearButton.hidden = false;
        lastRouteClearButton.textContent = nextLabel;
        lastRouteClearButton.title = `마지막 위치를 지웠습니다. 다음으로 ${nextLabel}을 엽니다.`;
        lastRouteClearButton.setAttribute("aria-label", `마지막 위치 삭제 후 다음 행동 열기: ${nextLabel}`);
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearClicked = "true";
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearClickedAt = new Date().toISOString();
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearStatusFeedback = clearFeedback;
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextRoute = nextRoute;
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextLabel = nextLabel;
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextTappable = "true";
        lastRouteClearButton.dataset.iosHomeDockLastRouteClearVisible = "true";
        if (lastRouteLink) {
          lastRouteLink.hidden = true;
          lastRouteLink.dataset.iosHomeDockLastRouteVisible = "false";
          lastRouteLink.dataset.iosHomeDockLastRouteHref = "";
          lastRouteLink.dataset.iosHomeDockLastRouteLabel = "";
          lastRouteLink.dataset.iosHomeDockLastRouteUpdatedAt = "";
          lastRouteLink.dataset.iosHomeDockLastRouteReason = "cleared";
        }
        if (nextStep) {
          nextStep.dataset.state = "todo";
          nextStep.textContent = `마지막 위치를 지웠습니다. 다음으로 ${nextLabel}을 열 수 있습니다.`;
          nextStep.tabIndex = 0;
          nextStep.setAttribute("aria-label", `마지막 위치 삭제 후 다음 행동: ${nextLabel}`);
        }
      });
    }
    if (lastRoute) {
      lastRouteClearButton.textContent = "마지막 위치 지우기";
      lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextTappable = "false";
      lastRouteClearButton.dataset.iosHomeDockLastRouteClearNextPersisted = "false";
      lastRouteClearButton.title = "이 iPhone에 저장된 마지막 위치 링크만 지웁니다. draft와 LLM 비밀값은 건드리지 않습니다.";
      lastRouteClearButton.setAttribute("aria-label", "마지막 위치 이어가기 지우기, draft와 LLM 비밀값 보존");
    }
  }
  if (proof) {
    proof.textContent = proofDone
      ? "설치 증거 저장 완료"
      : "설치 증거 저장 전";
    proof.href = proofDone ? "/api/ios-launch-proof.txt" : "#iosInstallProofSaveButton";
    proof.title = proofDone
      ? "최근 Home Screen 실행 proof 요약을 엽니다."
      : "Home Screen 실행 proof 저장 위치로 이동합니다.";
    proof.setAttribute("aria-label", proofDone
      ? "최근 Home Screen 실행 proof 요약 열기"
      : "Home Screen 실행 proof 저장 위치 열기");
    proof.dataset.state = proofDone ? "ok" : "todo";
  }
  if (finalGateStatus) {
    finalGateStatus.textContent = finalGateKnownReady
      ? "Mac final gate 완료"
      : proofDone
        ? "Mac final gate 대기"
        : "Mac final gate 확인 전";
    finalGateStatus.dataset.state = finalGateKnownReady ? "ok" : proofDone ? "warn" : "todo";
    finalGateStatus.setAttribute("aria-label", finalGateKnownReady
      ? "Mac final gate 완료 상태 페이지 열기"
      : proofDone
        ? "Mac final gate 대기 상태 페이지 열기"
        : "Mac final gate 확인 전 상태 페이지 열기");
    finalGateStatus.title = finalGateKnownReady
      ? "Mac final gate가 완료됐습니다. 설치 완료 상태 페이지를 엽니다."
      : proofDone
        ? "설치 증거는 저장됐고 Mac final gate가 아직 필요합니다. 설치 완료 상태 페이지를 엽니다."
        : "설치 증거 저장 전입니다. 설치 완료 상태 페이지를 엽니다.";
  }
  if (shellVersion) {
    const shellState = iosHomeDockShellVersionState();
    const shortVersion = shellState.installed.replace("travel-planner-shell-", "");
    const shortServerVersion = shellState.server.replace("travel-planner-shell-", "");
    shellVersion.textContent = shellState.updateNeeded
      ? `앱 shell ${shortVersion} · 서버 ${shortServerVersion}`
      : shortVersion
        ? `앱 shell ${shortVersion}`
        : "앱 shell 확인 전";
    shellVersion.dataset.state = shellState.updateNeeded ? "warn" : shortVersion ? "ok" : "todo";
    shellVersion.title = shellState.updateNeeded
      ? `현재 앱 shell cache는 ${shellState.installed}이고 서버 최신 metadata는 ${shellState.server}입니다. 앱 업데이트 확인을 눌러 새 버전을 적용하세요.`
      : shortVersion
      ? `현재 설치된 앱 shell cache는 ${shellState.installed}입니다.`
      : "현재 설치된 앱 shell cache 버전을 아직 확인하지 못했습니다.";
    shellVersion.setAttribute("aria-label", shellState.updateNeeded
      ? `현재 설치된 앱 shell cache ${shellState.installed}, 서버 최신 shell ${shellState.server}, 업데이트 필요`
      : shortVersion
      ? `현재 설치된 앱 shell cache ${shellState.installed}`
      : "현재 설치된 앱 shell cache 확인 전");
  }
  if (shellUpdateNudge) {
    const shellUpdateState = iosHomeDockShellVersionState();
    const shortInstalledShell = shellUpdateState.installed.replace("travel-planner-shell-", "");
    const shortServerShell = shellUpdateState.server.replace("travel-planner-shell-", "");
    shellUpdateNudge.hidden = !shellUpdateState.updateNeeded;
    shellUpdateNudge.dataset.state = shellUpdateState.updateNeeded ? "warn" : "ok";
    shellUpdateNudge.dataset.iosHomeDockShellUpdateNudgeVisible = shellUpdateState.updateNeeded ? "true" : "false";
    shellUpdateNudge.dataset.iosHomeDockShellUpdateNudgeInstalled = shellUpdateState.installed || "";
    shellUpdateNudge.dataset.iosHomeDockShellUpdateNudgeServer = shellUpdateState.server || "";
    shellUpdateNudge.dataset.iosHomeDockShellUpdateNudgeAction = shellUpdateState.updateNeeded ? "focus-app-update-button" : "none";
    if (shellUpdateDetail) {
      shellUpdateDetail.textContent = shellUpdateState.updateNeeded
        ? `현재 iPhone 앱 shell ${shortInstalledShell || "확인 전"}이 서버 ${shortServerShell || "확인 전"}와 다릅니다. 앱 업데이트 확인을 눌러 새 버전 적용 후 설치 증거를 다시 저장하세요.`
        : "현재 iPhone 앱 shell이 서버 metadata와 일치합니다.";
    }
    if (shellUpdateCheckButton) {
      shellUpdateCheckButton.hidden = !shellUpdateState.updateNeeded;
      shellUpdateCheckButton.dataset.iosHomeDockShellUpdateNudgeAction = shellUpdateState.updateNeeded ? "focus-app-update-button" : "none";
    }
  }
  if (proofButton) proofButton.hidden = proofDone;
  if (proofNudge) proofNudge.hidden = proofDone;
  if (finalGateNudge) finalGateNudge.hidden = !finalGatePending;
  if (finalGateCopyButton) finalGateCopyButton.hidden = !finalGatePending;
  if (finalGateShareButton) finalGateShareButton.hidden = !finalGatePending || !navigator.share;
  if (finalGateSmsLink || finalGateMailLink) {
    const command = iosInstallFinishTerminalCommand();
    const statusUrl = new URL("/ios-install-status", window.location.href).toString();
    const text = [
      "Travel Planner iPhone final Mac gate",
      `command=${command}`,
      `status=${statusUrl}`,
    ].join("\n");
    if (finalGateSmsLink) {
      finalGateSmsLink.hidden = !finalGatePending;
      finalGateSmsLink.href = `sms:&body=${encodeURIComponent(text)}`;
    }
    if (finalGateMailLink) {
      finalGateMailLink.hidden = !finalGatePending;
      finalGateMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 최종 gate")}&body=${encodeURIComponent(text)}`;
    }
  }
  if (completionStatusSmsLink || completionStatusMailLink) {
    const text = buildIosHomeDockCompletionStatusHandoffText();
    if (completionStatusSmsLink) {
      completionStatusSmsLink.href = `sms:&body=${encodeURIComponent(text)}`;
    }
    if (completionStatusMailLink) {
      completionStatusMailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 완료 상태")}&body=${encodeURIComponent(text)}`;
    }
  }
  if (planStarter) {
    planStarter.dataset.state = firstPlanDone ? "done" : proofDone ? "ready" : "waiting";
    if (planStarterTitle) {
      planStarterTitle.textContent = firstPlanDone
        ? "첫 여행 플랜 준비됨"
        : proofDone
          ? "이제 첫 여행 플랜을 만들 차례"
          : "첫 여행 플랜 시작 전";
    }
    if (planStarterDetail) {
      planStarterDetail.textContent = firstPlanDone
        ? "최근 여행 목록이나 아래 snapshot에서 이어서 열 수 있습니다."
        : proofDone
          ? "목적지, 날짜, 동행, 여행 스타일을 넣고 iPhone 홈 화면 앱에서 바로 첫 플랜을 만들어보세요."
          : "먼저 설치 증거를 저장하면 바로 새 일정 입력 폼으로 이어갈 수 있습니다.";
    }
    if (planStarterLink) {
      const planStarterRoute = proofDone ? firstPlanDone ? "#planList" : "#planForm" : "#iosInstallProofSaveButton";
      const planStarterLabel = proofDone ? firstPlanDone ? "최근 여행 보기" : "새 여행 플랜 입력" : "설치 증거 먼저 저장";
      const planStarterState = firstPlanDone ? "done" : proofDone ? "ready" : "waiting";
      planStarterLink.href = planStarterRoute;
      planStarterLink.textContent = planStarterLabel;
      planStarterLink.dataset.iosHomeDockPlanStarterLinkVisible = "true";
      planStarterLink.dataset.iosHomeDockPlanStarterLinkRoute = planStarterRoute;
      planStarterLink.dataset.iosHomeDockPlanStarterLinkLabel = planStarterLabel;
      planStarterLink.dataset.iosHomeDockPlanStarterLinkState = planStarterState;
    }
    if (planStarterButton) {
      const sampleButtonVisible = proofDone && !firstPlanDone;
      planStarterButton.hidden = !sampleButtonVisible;
      planStarterButton.dataset.iosHomeDockPlanStarterSampleButtonVisible = sampleButtonVisible ? "true" : "false";
      planStarterButton.dataset.iosHomeDockPlanStarterSampleButtonLabel = "예시로 빠르게 채우기";
      planStarterButton.dataset.iosHomeDockPlanStarterSampleButtonState = firstPlanDone ? "done" : proofDone ? "ready" : "waiting";
    }
  }
  if (nextStep) {
    const nextItem = nextIosFirstRunChecklistItem(state);
    const nextItemDetail = nextItem?.id === "offline-read"
      ? offlineSnapshotCount > 0
        ? "네트워크가 약할 때 최근 여행 목록이나 상세 플랜이 snapshot으로 다시 열리는지 확인하세요."
        : "최근 여행 목록이나 상세 플랜을 한 번 열어 snapshot을 만든 뒤 오프라인 읽기를 확인하세요."
      : nextItem?.detail || "";
    nextStep.dataset.state = nextItem ? "todo" : "done";
    nextStep.textContent = nextItem
      ? `다음 단계: ${nextItem.label} · ${nextItemDetail}`
      : installCompletionReady
        ? "설치 완료: Travel 아이콘으로 새 여행 플랜을 만들거나 완료 상태 페이지를 공유해 설치 상태를 남기세요."
        : "설치 체크 완료: 이제 첫 여행 플랜을 만들거나 완료 상태를 복사/공유해 Mac final gate까지 확인하세요.";
    nextStep.tabIndex = nextItem ? 0 : -1;
    nextStep.setAttribute("aria-label", nextItem ? `다음 설치 단계로 이동: ${nextItem.label}` : "설치 체크 완료");
  }
  if (offlineReadButton) {
    offlineReadButton.hidden = !firstPlanDone;
    offlineReadButton.disabled = offlineReadDone;
    offlineReadButton.textContent = offlineReadDone
      ? "오프라인 확인됨"
      : offlineSnapshotCount > 0
        ? "오프라인 확인 완료"
        : "snapshot 먼저 만들기";
  }
  if (latestPlans) {
    const plans = latestIosHomeDockPlans(homeSnapshots);
    latestPlans.hidden = plans.length === 0;
    latestPlans.replaceChildren(...plans.map((plan) => {
      const link = document.createElement("a");
      link.className = "ios-home-dock-plan-link";
      link.href = `/plans/${encodeURIComponent(plan.id)}`;
      const destination = document.createElement("strong");
      destination.textContent = plan.destination || "목적지 미정";
      const metadata = document.createElement("span");
      metadata.textContent = `${plan.startDate || "날짜 미정"} · v${plan.latestVersion || 1}`;
      link.replaceChildren(destination, metadata);
      return link;
    }));
  }
  bindIosHomeDockLastRouteTracking();
  bindIosHomeDockShellUpdateNudgeButton();
  bindIosHomeDockProofButton();
  bindIosHomeDockNextStep();
  bindIosHomeDockPlanStarterButton();
  bindIosHomeDockFinalGateCopyButton();
  bindIosHomeDockFinalGateShareButton();
  bindIosHomeDockCompletionStatusCopyButton();
  bindIosHomeDockCompletionStatusShareButton();
  bindIosHomeDockOfflineReadButton();
  bindIosHomeDockAppUpdateButton();
  bindIosHomeDockShellVersionCopyButton();
    bindIosHomeDockDiagnosticsButton();
    bindIosHomeDockDraftResumeLink();
    bindIosHomeDockDraftStatusCopyButton();
    bindIosHomeDockDraftStatusShareButton();
    bindIosHomeDockDraftStatusMessageLinks();
  bindIosHomeDockSnapshotClearButton();
  bindIosHomeDockRefreshButton();
  focusIosHomeDockShellRecoveryTarget();
}

window.addEventListener("travel-ios-first-run-checklist-change", () => {
  clearIosHomeDockShellRecoveryHashWhenProofSaved();
  updateIosFirstRunChecklist();
  updateIosHomeDock();
});

window.addEventListener("hashchange", focusIosNewPlanFormHashTarget);

window.addEventListener("DOMContentLoaded", () => {
  bindIosNewPlanShortcutHintDismiss();
  Promise.all([
    refreshIosHomeDockCompletionStatus(),
    refreshIosHomeDockShellVersion(),
  ]).then(() => {
    updateIosHomeDock();
    focusIosNewPlanFormHashTarget();
  });
});

window.addEventListener("focus", () => {
  refreshIosHomeDockCompletionStatus().then(() => updateIosHomeDock());
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  refreshIosHomeDockCompletionStatus().then(() => updateIosHomeDock());
});

function updateSavedLaunchProofBox(state, message, meta = "") {
  const box = document.getElementById("iosInstallSavedProof");
  const messageEl = document.getElementById("iosInstallSavedProofMessage");
  const metaEl = document.getElementById("iosInstallSavedProofMeta");
  if (!box) return;

  box.hidden = false;
  box.dataset.state = state;
  if (messageEl) messageEl.textContent = message;
  if (metaEl) {
    metaEl.hidden = !meta;
    metaEl.textContent = meta;
  }
}

async function fetchSavedLaunchProofCheck() {
  const path = "/api/ios-launch-proof/check";
  if (typeof api === "function") {
    return api(path, { headers: { Accept: "application/json" } });
  }
  return fetch(path, {
    headers: typeof withAccessKeyHeaders === "function"
      ? withAccessKeyHeaders({ Accept: "application/json" })
      : { Accept: "application/json" },
  });
}

async function refreshSavedLaunchProofStatus(manual = false) {
  if (manual) updateSavedLaunchProofBox("loading", "최근 저장된 홈 화면 실행 증거를 다시 확인하는 중입니다.");
  try {
    const response = await fetchSavedLaunchProofCheck();
    let check = {};
    try {
      check = await response.json();
    } catch {
      check = {};
    }

    if (response.ok) {
      const state = check.ok ? "ready" : "blocked";
      const message = check.ok
        ? "최근 iPhone 홈 화면 실행 증거가 준비됨 상태입니다."
        : check.summary || "최근 iPhone 홈 화면 실행 증거에 확인이 필요합니다.";
      const meta = [
        check.capturedAt ? `캡처 ${check.capturedAt}` : "",
        check.savedAt ? `저장 ${check.savedAt}` : "",
        check.serviceWorker ? `service worker ${check.serviceWorker}` : "",
      ].filter(Boolean).join(" · ");
      updateSavedLaunchProofBox(state, message, meta);
      if (check.ok) {
        const firstRunState = readIosFirstRunChecklist();
        if (!firstRunState.proof) {
          firstRunState.proof = true;
          writeIosFirstRunChecklist(firstRunState);
          updateIosFirstRunChecklist();
        }
        updateIosInstallFastPathFinalGateButtonState(true);
      } else {
        updateIosInstallFastPathFinalGateButtonState(
          false,
          "서버 saved proof 확인이 막혀 final gate 명령 복사 버튼이 다시 잠겼습니다. iPhone에서 proof를 새로 저장하거나 최근 증거를 다시 확인하세요."
        );
      }
      return { state, summary: message };
    }

    if (response.status === 404) {
      const message = "아직 서버에 저장된 iPhone 홈 화면 실행 증거가 없습니다.";
      updateSavedLaunchProofBox("empty", message, "Travel 아이콘으로 실행한 뒤 설치 증거 저장을 누르세요.");
      return { state: "empty", summary: message };
    }

    if (response.status === 401) {
      const message = "최근 설치 증거를 확인하려면 접근 키가 필요합니다.";
      updateSavedLaunchProofBox("blocked", message, "앱 홈에서 접근 키를 저장한 뒤 다시 시도하세요.");
      return { state: "blocked", summary: message };
    }

    const message = `최근 설치 증거를 확인하지 못했습니다. HTTP ${response.status}`;
    updateSavedLaunchProofBox("blocked", message, check.error || "");
    return { state: "blocked", summary: message };
  } catch {
    const message = "최근 설치 증거를 확인하지 못했습니다.";
    if (manual) updateSavedLaunchProofBox("blocked", message, "서버 실행 상태와 iPhone 접근 URL을 확인하세요.");
    return { state: "blocked", summary: message };
  }
}

function bindSavedLaunchProofStatusActions() {
  const refreshButton = document.getElementById("iosInstallSavedProofRefreshButton");
  const fastPathRefreshButton = document.getElementById("iosInstallFastPathProofRefreshButton");
  const summaryLinks = [
    document.getElementById("iosInstallSavedProofSummaryLink"),
    document.getElementById("iosHomeDockFinalGateProofSummaryLink"),
    ...document.querySelectorAll("[data-ios-proof-summary-link='true']"),
  ].filter(Boolean);
  if (refreshButton && refreshButton.dataset.savedProofRefreshBound !== "true") {
    refreshButton.dataset.savedProofRefreshBound = "true";
    refreshButton.addEventListener("click", () => refreshSavedLaunchProofStatus(true));
  }
  if (fastPathRefreshButton && fastPathRefreshButton.dataset.fastPathProofRefreshBound !== "true") {
    fastPathRefreshButton.dataset.fastPathProofRefreshBound = "true";
    fastPathRefreshButton.addEventListener("click", async () => {
      const busyToken = String(++iosInstallFastPathProofRefreshFeedbackToken);
      fastPathRefreshButton.dataset.proofRefreshFeedbackToken = busyToken;
      fastPathRefreshButton.textContent = "proof 확인 중";
      fastPathRefreshButton.disabled = true;
      fastPathRefreshButton.setAttribute("aria-busy", "true");
      fastPathRefreshButton.title = "서버에 저장된 최근 iPhone 홈 화면 실행 proof를 확인하는 중입니다.";
      fastPathRefreshButton.setAttribute("aria-label", "최근 iPhone 홈 화면 실행 proof 확인 중");
      try {
        const proofRefreshState = await refreshSavedLaunchProofStatus(true);
        const proofRefreshStateValue = typeof proofRefreshState === "string" ? proofRefreshState : proofRefreshState?.state;
        const completionFeedback = iosInstallFastPathProofRefreshCompletionFeedback(proofRefreshState);
        fastPathRefreshButton.textContent = completionFeedback.text;
        fastPathRefreshButton.title = completionFeedback.title;
        fastPathRefreshButton.setAttribute("aria-label", completionFeedback.ariaLabel);
        if (proofRefreshStateValue === "empty") {
          focusIosInstallProofSaveButtonFromFastPath();
        } else {
          focusIosInstallSavedProofStatusCard();
        }
      } finally {
        fastPathRefreshButton.disabled = false;
        fastPathRefreshButton.removeAttribute("aria-busy");
        const completionToken = String(++iosInstallFastPathProofRefreshFeedbackToken);
        fastPathRefreshButton.dataset.proofRefreshFeedbackToken = completionToken;
        window.setTimeout(() => {
          if (fastPathRefreshButton.dataset.proofRefreshFeedbackToken !== completionToken) return;
          fastPathRefreshButton.title = "서버에 저장된 최근 iPhone 홈 화면 실행 proof를 다시 확인합니다.";
          fastPathRefreshButton.setAttribute("aria-label", "최근 iPhone 홈 화면 실행 proof 다시 확인");
          fastPathRefreshButton.textContent = "최근 proof 다시 확인";
        }, IOS_INSTALL_FAST_PATH_PROOF_REFRESH_COMPLETE_MS);
      }
    });
  }
  for (const summaryLink of summaryLinks) {
    if (summaryLink.dataset.savedProofSummaryBound === "true") continue;
    summaryLink.dataset.savedProofSummaryBound = "true";
    summaryLink.addEventListener("click", async (event) => {
      if (typeof api !== "function" && typeof withAccessKeyHeaders !== "function") return;
      event.preventDefault();
      try {
        const response = typeof api === "function"
          ? await api(summaryLink.getAttribute("href"), { headers: { Accept: "text/plain" } })
          : await fetch(summaryLink.getAttribute("href"), {
              headers: withAccessKeyHeaders({ Accept: "text/plain" }),
            });
        const body = await response.text();
        if (response.ok) {
          window.prompt("최근 iOS 홈 화면 실행 증거 요약", body);
          return;
        }
        updateSavedLaunchProofBox("blocked", `최근 증거 요약을 불러오지 못했습니다. HTTP ${response.status}`);
      } catch {
        updateSavedLaunchProofBox("blocked", "최근 증거 요약을 불러오지 못했습니다.", "서버 실행 상태를 확인하세요.");
      }
    });
  }
}

let iosInstallProofSaveHashFocusApplied = false;
let iosInstallFinalGateHashFocusApplied = false;
let iosInstallHandsOnChecklistHashFocusApplied = false;

function focusInstallProofSaveButtonFromHash() {
  if (window.location.hash === "#iosInstallProof") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#iosInstallProofSaveButton`);
  }
  if (window.location.hash !== "#iosInstallProofSaveButton") {
    iosInstallProofSaveHashFocusApplied = false;
    return;
  }
  if (iosInstallProofSaveHashFocusApplied) return;
  const proof = document.getElementById("iosInstallProof");
  const saveButton = document.getElementById("iosInstallProofSaveButton");
  if (!proof || !saveButton || proof.hidden) return;
  iosInstallProofSaveHashFocusApplied = true;
  window.setTimeout(() => {
    saveButton.scrollIntoView({ behavior: "smooth", block: "center" });
    saveButton.focus?.();
    saveButton.classList.remove("install-proof-save-pulse");
    void saveButton.offsetWidth;
    saveButton.classList.add("install-proof-save-pulse");
    window.setTimeout(() => saveButton.classList.remove("install-proof-save-pulse"), 1400);
  }, 120);
}

function focusInstallFinalGateButtonFromHash() {
  if (window.location.hash !== "#iosInstallCompletionFinalGateButton") {
    iosInstallFinalGateHashFocusApplied = false;
    return;
  }
  if (iosInstallFinalGateHashFocusApplied) return;
  const button = document.getElementById("iosInstallCompletionFinalGateButton");
  if (!button) return;
  iosInstallFinalGateHashFocusApplied = true;
  window.setTimeout(() => {
    button.scrollIntoView({ behavior: "smooth", block: "center" });
    button.focus?.();
    button.classList.remove("install-final-gate-pulse");
    void button.offsetWidth;
    button.classList.add("install-final-gate-pulse");
    window.setTimeout(() => button.classList.remove("install-final-gate-pulse"), 1400);
  }, 120);
}

function focusIosInstallHandsOnChecklistFromHash() {
  if (window.location.hash !== "#iosInstallHandsOnChecklist") {
    iosInstallHandsOnChecklistHashFocusApplied = false;
    return;
  }
  if (iosInstallHandsOnChecklistHashFocusApplied) return;
  const checklist = document.getElementById("iosInstallHandsOnChecklist");
  if (!checklist) return;
  iosInstallHandsOnChecklistHashFocusApplied = true;
  checklist.open = true;
  window.setTimeout(() => {
    focusIosInstallHandsOnNextStepTarget("#iosInstallHandsOnChecklist");
    const nextStepLink = document.getElementById("iosInstallHandsOnNextStepLink");
    window.setTimeout(() => nextStepLink?.focus?.({ preventScroll: true }), 180);
    const status = document.getElementById("iosInstallStatus");
    if (status) status.textContent = "설치 체크리스트 위치로 이동했습니다. 다음 단계로 이동 링크에서 현재 기기 브라우저 체크 현황을 이어가세요.";
  }, 120);
}

function updateInstallLaunchProof() {
  updateInstallHandoffStrip();
  const proof = document.getElementById("iosInstallProof");
  const text = document.getElementById("iosInstallProofText");
  const shareButton = document.getElementById("iosInstallProofShareButton");
  const afterPhone = document.getElementById("iosInstallAfterPhone");
  if (!proof) return;

  proof.hidden = !isStandaloneDisplay();
  if (proof.hidden) return;
  focusInstallProofSaveButtonFromHash();

  if (text) text.value = installLaunchProofText();
  if (shareButton) shareButton.hidden = !navigator.share;
  if (afterPhone) {
    const state = readIosFirstRunChecklist();
    afterPhone.hidden = !state.proof;
  }
  nudgeStandaloneProofSaveOnce();
}

window.addEventListener("hashchange", () => {
  iosInstallProofSaveHashFocusApplied = false;
  iosInstallFinalGateHashFocusApplied = false;
  iosInstallHandsOnChecklistHashFocusApplied = false;
  focusInstallProofSaveButtonFromHash();
  focusInstallFinalGateButtonFromHash();
  focusIosInstallHandsOnChecklistFromHash();
  focusIosInstallHandsOnChecklistFromHash();
});

function updateInstallHandoffStrip() {
  const strip = document.getElementById("iosInstallHandoffStrip");
  if (!strip) return;

  const title = document.getElementById("iosInstallHandoffStripTitle");
  const detail = document.getElementById("iosInstallHandoffStripDetail");
  const beforeButton = document.getElementById("iosInstallHandoffStripBeforeButton");
  const beforeFinalButton = document.getElementById("iosInstallHandoffStripBeforeFinalButton");
  const prePhoneSequenceButton = document.getElementById("iosInstallHandoffStripPrePhoneSequenceButton");
  const handoffSessionEvidenceButton = document.getElementById("iosInstallHandoffStripHandoffSessionEvidenceButton");
  const handoffEvidenceButton = document.getElementById("iosInstallHandoffStripHandoffEvidenceButton");
  const sessionEvidenceButton = document.getElementById("iosInstallHandoffStripSessionEvidenceButton");
  const sessionCheckSchemaButton = document.getElementById("iosInstallHandoffStripSessionCheckSchemaButton");
  const sessionQrLink = document.getElementById("iosInstallHandoffStripSessionQrLink");
  const sessionCopyButton = document.getElementById("iosInstallHandoffStripSessionCopyButton");
  const proofLink = document.getElementById("iosInstallHandoffStripProofLink");
  const afterPhoneButton = document.getElementById("iosInstallHandoffStripAfterPhoneButton");
  const finishCopyButton = document.getElementById("iosInstallHandoffStripFinishCopyButton");
  const appLink = document.getElementById("iosInstallHandoffStripAppLink");
  const proofDone = Boolean(readIosFirstRunChecklist().proof);
  const standalone = isStandaloneDisplay();

  strip.dataset.state = proofDone ? "finish" : standalone ? "proof" : "handoff";
  if (title) {
    title.textContent = proofDone
      ? "Mac 마무리 단계"
      : standalone
        ? "Travel 앱 proof 저장"
        : "Mac -> iPhone 바로 넘기기";
  }
  if (detail) {
    detail.textContent = proofDone
      ? "홈 화면 실행 proof가 저장됐습니다. Mac에서 최종 evidence archive/gate를 실행한 뒤 앱 홈에서 첫 여행 플랜을 시작하세요."
      : standalone
        ? "홈 화면 Travel 앱으로 열렸습니다. proof를 저장하면 Mac 최종 확인 단계로 넘어갑니다."
        : "설치 전 evidence와 최종 HTTPS preflight를 확인한 뒤 iPhone 카메라로 세션 QR을 열고, Travel 아이콘 실행 후 proof 저장까지 이어가세요.";
  }
  if (beforeButton) beforeButton.hidden = proofDone || standalone;
  if (beforeFinalButton) beforeFinalButton.hidden = proofDone || standalone;
  if (prePhoneSequenceButton) prePhoneSequenceButton.hidden = proofDone || standalone;
  if (handoffSessionEvidenceButton) handoffSessionEvidenceButton.hidden = proofDone || standalone;
  if (handoffEvidenceButton) handoffEvidenceButton.hidden = proofDone || standalone;
  if (sessionEvidenceButton) sessionEvidenceButton.hidden = proofDone || standalone;
  if (sessionCheckSchemaButton) sessionCheckSchemaButton.hidden = proofDone || standalone;
  if (sessionQrLink) sessionQrLink.hidden = proofDone || standalone;
  if (sessionCopyButton) sessionCopyButton.hidden = proofDone || standalone;
  if (proofLink) proofLink.hidden = proofDone || !standalone;
  if (afterPhoneButton) afterPhoneButton.hidden = !proofDone;
  if (finishCopyButton) finishCopyButton.hidden = !proofDone;
  if (appLink) appLink.hidden = !proofDone;
  bindInstallHandoffStripFinishCopyButton();
}

function installHandoffStripFinishText() {
  return [
    "Travel Planner iPhone install finish",
    "",
    "Mac에서 실행:",
    "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
    "",
    "iPhone에서 이어서:",
    `${window.location.origin}/#iosHomeDock`,
    "앱 홈에서 첫 여행 플랜을 만들고, 필요하면 예시로 빠르게 채우기를 누르세요.",
  ].join("\n");
}

function bindInstallHandoffStripFinishCopyButton() {
  const button = document.getElementById("iosInstallHandoffStripFinishCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installHandoffStripFinishBound === "true") return;
  button.dataset.installHandoffStripFinishBound = "true";
  button.addEventListener("click", async () => {
    const text = installHandoffStripFinishText();
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = "설치 마무리 순서를 복사했습니다. Mac 명령 실행 후 앱 홈에서 첫 여행 플랜을 시작하세요.";
    } catch {
      window.prompt("설치 마무리 순서를 복사하세요.", text);
    }
  });
}

function nudgeStandaloneProofSaveOnce() {
  const proof = document.getElementById("iosInstallProof");
  const saveButton = document.getElementById("iosInstallProofSaveButton");
  const status = document.getElementById("iosInstallStatus");
  if (!proof || !saveButton || proof.hidden || !isStandaloneDisplay()) return;
  if (readIosFirstRunChecklist().proof) return;
  if (proof.dataset.standaloneProofNudgeShown === "true") return;
  try {
    if (sessionStorage.getItem("travelPlannerIosStandaloneProofNudgeShown") === "true") return;
    sessionStorage.setItem("travelPlannerIosStandaloneProofNudgeShown", "true");
  } catch {
    // Continue with the in-memory DOM guard when sessionStorage is unavailable.
  }
  proof.dataset.standaloneProofNudgeShown = "true";
  window.setTimeout(() => {
    proof.scrollIntoView({ behavior: "smooth", block: "start" });
    saveButton.focus?.();
    if (status) {
      status.textContent = "홈 화면 Travel 앱으로 열렸습니다. 설치 증거 저장을 누르면 Mac 최종 gate로 넘어갈 수 있습니다.";
    }
  }, 250);
}

function bindInstallLaunchProofActions() {
  const text = document.getElementById("iosInstallProofText");
  const copyButton = document.getElementById("iosInstallProofCopyButton");
  const shareButton = document.getElementById("iosInstallProofShareButton");
  const saveButton = document.getElementById("iosInstallProofSaveButton");
  const afterPhoneCopyButton = document.getElementById("iosInstallAfterPhoneCopyButton");
  const summaryLink = document.getElementById("iosInstallProofSummaryLink");
  const status = document.getElementById("iosInstallStatus");
  const finalEvidenceCommand = "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final";

  if (text && text.dataset.installProofTextBound !== "true") {
    text.dataset.installProofTextBound = "true";
    const selectProof = () => text.select();
    text.addEventListener("focus", selectProof);
    text.addEventListener("click", selectProof);
  }

  if (copyButton && copyButton.dataset.installProofCopyBound !== "true") {
    copyButton.dataset.installProofCopyBound = "true";
    copyButton.addEventListener("click", async () => {
      const proofText = installLaunchProofText();
      try {
        await navigator.clipboard.writeText(proofText);
        if (text) text.value = proofText;
        if (status) status.textContent = "홈 화면 앱 실행 증거를 복사했습니다.";
      } catch {
        window.prompt("홈 화면 앱 실행 증거를 복사하세요.", proofText);
      }
    });
  }

  if (shareButton && shareButton.dataset.installProofShareBound !== "true") {
    shareButton.dataset.installProofShareBound = "true";
    shareButton.addEventListener("click", async () => {
      const proofText = installLaunchProofText();
      try {
        await navigator.share({
          title: "Travel Planner iOS 설치 증거",
          text: proofText,
        });
        if (text) text.value = proofText;
        if (status) status.textContent = "홈 화면 앱 실행 증거를 공유했습니다.";
      } catch (error) {
        if (error?.name !== "AbortError" && status) {
          status.textContent = "설치 증거 공유를 완료하지 못했습니다. 복사 버튼을 사용하세요.";
        }
      }
    });
  }

  if (saveButton && saveButton.dataset.installProofSaveBound !== "true") {
    saveButton.dataset.installProofSaveBound = "true";
    saveButton.addEventListener("click", async () => {
      const completingShellRecovery = window.location.hash === "#iosHomeDockShellRecovery";
      await refreshIosHomeDockShellVersion();
      updateIosHomeDock();
      const proof = installLaunchProofPayload();
      const serviceWorkerUpdateSession = readIosServiceWorkerUpdateSession();
      const completingServiceWorkerUpdate = serviceWorkerUpdateSession?.applied === true && serviceWorkerUpdateSession?.reloadPending === true;
      try {
        const requestOptions = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(proof),
        };
        const response = typeof api === "function"
          ? await api("/api/ios-launch-proof", requestOptions)
          : await fetch("/api/ios-launch-proof", {
              ...requestOptions,
              headers: typeof withAccessKeyHeaders === "function"
                ? withAccessKeyHeaders(requestOptions.headers)
                : requestOptions.headers,
            });
        let result = {};
        try {
          result = await response.json();
        } catch {
          result = { summary: `HTTP ${response.status}` };
        }
        const proofText = JSON.stringify(proof, null, 2);
        const saved = response.ok && result.saved;
        if (text) text.value = proofText;
        if (status && saved) {
          status.textContent = completingShellRecovery
            ? `앱 shell recovery 후 홈 화면 실행 증거를 다시 저장했습니다. 아래 최종 gate 명령 복사 버튼에 초점을 맞췄으니 Mac에서 실행해 완료 상태를 다시 확인하세요. 명령: ${finalEvidenceCommand}`
            : completingServiceWorkerUpdate
            ? "새 앱 shell 적용 후 홈 화면 실행 증거를 다시 저장했습니다. Mac에서 최종 gate를 다시 실행해 완료 상태를 확인하세요."
            : "홈 화면 앱 실행 증거를 서버 reports 폴더에 저장했습니다. 이제 Mac에서 설치 후 evidence 명령을 먼저 실행하고, 이어서 최종 archive/gate 명령을 실행하세요.";
        }
        if (saved && completingShellRecovery) {
          try {
            await navigator.clipboard.writeText(finalEvidenceCommand);
            if (status) {
              status.textContent = `앱 shell recovery 후 홈 화면 실행 증거를 다시 저장했고 최종 gate 명령도 클립보드에 복사했습니다. Mac에서 실행해 완료 상태를 다시 확인하세요. 명령: ${finalEvidenceCommand}`;
            }
          } catch {
            // Keep the focused copy-button fallback when clipboard auto-copy is unavailable.
          }
        }
        if (!saved) {
          const reason = (result.issues || []).join(", ") || result.summary || "확인 필요";
          try {
            await navigator.clipboard.writeText(proofText);
            if (status) status.textContent = `설치 증거 저장이 막혔지만 증거 JSON을 클립보드에 복사했습니다: ${reason}`;
          } catch {
            window.prompt("설치 증거 JSON을 복사해 Mac의 webapp/reports/ios-launch-proof.json에 저장하세요.", proofText);
            if (status) status.textContent = `설치 증거 저장이 막혔습니다. 프롬프트의 증거 JSON을 복사해 보관하세요: ${reason}`;
          }
        }
        if (saved) {
          if (completingServiceWorkerUpdate) {
            const proofResavedAt = new Date().toISOString();
            const statusFeedback = "새 앱 shell 적용 후 설치 증거를 다시 저장했습니다. Mac final gate를 다시 실행하세요. draftValues=excluded; llmSecrets=excluded";
            document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofResaved = "true";
            document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalProofResavedAt = proofResavedAt;
            document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalNextAction = "mac-final-gate";
            document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = statusFeedback;
            writeIosServiceWorkerUpdateSession({
              ...(readIosServiceWorkerUpdateSession() || serviceWorkerUpdateSession),
              reloadArrivalProofResaved: true,
              reloadArrivalProofResavedAt: proofResavedAt,
              reloadArrivalNextAction: "mac-final-gate",
              reloadArrivalStatusFeedback: statusFeedback,
            });
          }
          setIosInstallHandsOnStep("launch-travel", true);
          setIosInstallHandsOnStep("save-proof", true);
          const state = readIosFirstRunChecklist();
          state.proof = true;
          writeIosFirstRunChecklist(state);
          updateIosFirstRunChecklist();
          updateIosInstallFastPathFinalGateButtonState(true);
          updateInstallLaunchProof();
          updateInstallHandoffStrip();
          updateInstallCompletionChecklist();
          refreshSavedLaunchProofStatus(false);
          refreshInstallNextStepStatus(false);
          window.setTimeout(() => {
            afterPhoneCopyButton?.scrollIntoView({ behavior: "smooth", block: "center" });
            afterPhoneCopyButton?.focus();
            if (completingServiceWorkerUpdate) {
              const finalGateFocusedAt = new Date().toISOString();
              const finalGateFocusApplied = afterPhoneCopyButton ? document.activeElement === afterPhoneCopyButton : false;
              document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusTarget = "iosInstallAfterPhoneCopyButton";
              document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusScheduled = "true";
              document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusApplied = finalGateFocusApplied ? "true" : "false";
              document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusedAt = finalGateFocusedAt;
              document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateButtonLabel = afterPhoneCopyButton?.textContent.trim() || "";
              writeIosServiceWorkerUpdateSession({
                ...(readIosServiceWorkerUpdateSession() || serviceWorkerUpdateSession),
                reloadArrivalFinalGateFocusTarget: "iosInstallAfterPhoneCopyButton",
                reloadArrivalFinalGateFocusScheduled: true,
                reloadArrivalFinalGateFocusApplied: finalGateFocusApplied,
                reloadArrivalFinalGateFocusedAt: finalGateFocusedAt,
                reloadArrivalFinalGateButtonLabel: afterPhoneCopyButton?.textContent.trim() || "",
              });
            }
          }, 120);
        }
      } catch {
        const proofText = JSON.stringify(proof, null, 2);
        try {
          await navigator.clipboard.writeText(proofText);
          if (text) text.value = proofText;
          if (status) status.textContent = "설치 증거를 서버에 저장하지 못했지만 증거 JSON을 클립보드에 복사했습니다. Mac의 webapp/reports/ios-launch-proof.json에 저장하세요.";
        } catch {
          window.prompt("설치 증거 JSON을 복사해 Mac의 webapp/reports/ios-launch-proof.json에 저장하세요.", proofText);
          if (text) text.value = proofText;
          if (status) status.textContent = "설치 증거를 서버에 저장하지 못했습니다. 프롬프트의 증거 JSON을 복사해 보관하세요.";
        }
      }
    });
  }

  if (afterPhoneCopyButton && afterPhoneCopyButton.dataset.afterPhoneCopyBound !== "true") {
    afterPhoneCopyButton.dataset.afterPhoneCopyBound = "true";
    afterPhoneCopyButton.addEventListener("click", async () => {
      const serviceWorkerUpdateSession = readIosServiceWorkerUpdateSession();
      const completingServiceWorkerUpdate = serviceWorkerUpdateSession?.reloadArrivalProofResaved === true && serviceWorkerUpdateSession?.reloadArrivalNextAction === "mac-final-gate";
      try {
        await navigator.clipboard.writeText(finalEvidenceCommand);
        if (status) status.textContent = "Mac에서 실행할 최종 evidence archive/gate 명령을 복사했습니다.";
        if (completingServiceWorkerUpdate) {
          const copiedAt = new Date().toISOString();
          const statusFeedback = "새 앱 shell 적용 후 Mac final gate 명령을 클립보드에 복사했습니다. draftValues=excluded; llmSecrets=excluded";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopied = "true";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopiedAt = copiedAt;
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod = "clipboard";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = statusFeedback;
          writeIosServiceWorkerUpdateSession({
            ...(readIosServiceWorkerUpdateSession() || serviceWorkerUpdateSession),
            reloadArrivalFinalGateCommandCopied: true,
            reloadArrivalFinalGateCommandCopiedAt: copiedAt,
            reloadArrivalFinalGateCommandCopyMethod: "clipboard",
            reloadArrivalStatusFeedback: statusFeedback,
          });
          showIosServiceWorkerUpdateCompletionStatusLink("clipboard");
        }
      } catch {
        window.prompt("Mac에서 실행할 최종 evidence archive/gate 명령을 복사하세요.", finalEvidenceCommand);
        if (completingServiceWorkerUpdate) {
          const copiedAt = new Date().toISOString();
          const statusFeedback = "새 앱 shell 적용 후 Mac final gate 명령을 prompt로 열었습니다. draftValues=excluded; llmSecrets=excluded";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopied = "true";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopiedAt = copiedAt;
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod = "prompt";
          document.documentElement.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = statusFeedback;
          writeIosServiceWorkerUpdateSession({
            ...(readIosServiceWorkerUpdateSession() || serviceWorkerUpdateSession),
            reloadArrivalFinalGateCommandCopied: true,
            reloadArrivalFinalGateCommandCopiedAt: copiedAt,
            reloadArrivalFinalGateCommandCopyMethod: "prompt",
            reloadArrivalStatusFeedback: statusFeedback,
          });
          showIosServiceWorkerUpdateCompletionStatusLink("prompt");
        }
      }
    });
  }

  if (summaryLink && summaryLink.dataset.installProofSummaryBound !== "true") {
    summaryLink.dataset.installProofSummaryBound = "true";
    summaryLink.addEventListener("click", async (event) => {
      if (typeof api !== "function" && typeof withAccessKeyHeaders !== "function") return;
      event.preventDefault();
      try {
        const response = typeof api === "function"
          ? await api(summaryLink.getAttribute("href"), { headers: { Accept: "text/plain" } })
          : await fetch(summaryLink.getAttribute("href"), {
              headers: withAccessKeyHeaders({ Accept: "text/plain" }),
            });
        const body = await response.text();
        if (response.ok) {
          window.prompt("최근 iOS 홈 화면 실행 증거 요약", body);
          if (status) status.textContent = "최근 저장된 홈 화면 실행 증거 요약을 불러왔습니다.";
          return;
        }
        if (status) status.textContent = `저장 증거 요약을 불러오지 못했습니다: HTTP ${response.status}`;
      } catch {
        if (status) status.textContent = "저장 증거 요약을 불러오지 못했습니다. 서버 실행 상태를 확인하세요.";
      }
    });
  }
}

function updateInstallHandoffLinks() {
  const smsLink = document.getElementById("iosInstallSmsLink");
  const mailLink = document.getElementById("iosInstallMailLink");
  const url = preferredInstallUrl();
  const smsUrl = preferredShortInstallUrl();
  const message = installShareText(url);
  const smsMessage = installShareText(smsUrl);

  if (smsLink) {
    smsLink.href = `sms:&body=${encodeURIComponent(smsMessage)}`;
    if (smsLink.dataset.installSmsCleanupBound !== "true") {
      smsLink.dataset.installSmsCleanupBound = "true";
      smsLink.addEventListener("click", clearIosInstallStatusNextLink);
    }
  }
  if (mailLink) {
    mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치")}&body=${encodeURIComponent(message)}`;
    if (mailLink.dataset.installMailCleanupBound !== "true") {
      mailLink.dataset.installMailCleanupBound = "true";
      mailLink.addEventListener("click", clearIosInstallStatusNextLink);
    }
  }
  updateInstallSessionHandoffLinks();
}

function updateInstallDeploymentHint() {
  const hint = document.getElementById("iosInstallDeploymentHint");
  if (!hint) return;

  if (isStandaloneDisplay()) {
    hint.hidden = true;
    return;
  }

  hint.hidden = false;
  if (iosInstallInfo?.deploymentRecommendation) {
    hint.textContent = iosInstallInfo.deploymentRecommendation;
    return;
  }
  hint.textContent = isPreferredInstallUrlHttps()
    ? "HTTPS 주소라 iPhone 홈 화면 설치와 service worker 동작에 적합합니다."
    : "iPhone에서 계속 쓰려면 HTTPS 배포 주소를 권장합니다. 로컬 주소는 같은 Wi-Fi 설치 확인용으로 사용하세요.";
}

function updateDeployChecklist() {
  const checklist = document.getElementById("iosDeployChecklist");
  const httpsCheck = document.getElementById("iosDeployHttpsCheck");
  if (!checklist) return;

  if (isStandaloneDisplay()) {
    checklist.hidden = true;
    return;
  }

  checklist.hidden = false;
  if (!httpsCheck) return;

  if (isPreferredInstallUrlHttps()) {
    httpsCheck.dataset.state = "ok";
    httpsCheck.textContent = "HTTPS 설치 주소가 준비됐습니다.";
    return;
  }

  httpsCheck.dataset.state = "warn";
  httpsCheck.textContent = iosInstallInfo?.isLocalhost
    ? "현재 추천 주소는 같은 Wi-Fi 로컬 설치 확인용입니다. 계속 쓰려면 HTTPS 배포 주소를 준비하세요."
    : "현재 추천 주소는 HTTP입니다. 계속 쓰려면 HTTPS 배포 주소를 준비하세요.";
}

function updateSafariHint() {
  const hint = document.getElementById("iosSafariHint");
  if (!hint) return;
  hint.hidden = isStandaloneDisplay() || !isIosDevice() || isLikelyIosSafari();
}

function bindInstallUrlInput() {
  const input = document.getElementById("iosInstallUrlInput");
  if (!input || input.dataset.installUrlBound === "true") return;
  input.dataset.installUrlBound = "true";

  const selectInstallUrl = () => input.select();
  input.addEventListener("focus", selectInstallUrl);
  input.addEventListener("click", selectInstallUrl);
}

function bindInstallShortUrlInput() {
  const input = document.getElementById("iosInstallShortUrlInput");
  if (!input || input.dataset.installShortUrlBound === "true") return;
  input.dataset.installShortUrlBound = "true";

  const selectInstallUrl = () => input.select();
  input.addEventListener("focus", selectInstallUrl);
  input.addEventListener("click", selectInstallUrl);
}

function isPreferredInstallUrlHttps() {
  try {
    return new URL(preferredInstallUrl()).protocol === "https:";
  } catch {
    return window.location.protocol === "https:";
  }
}

function readinessItem(text, state) {
  return { text, state };
}

function installReadinessItems() {
  if (isStandaloneDisplay()) {
    return [
      readinessItem("홈 화면 앱으로 실행 중입니다.", "ok"),
      readinessItem("Safari 주소창 없이 Travel Planner를 사용할 수 있습니다.", "ok"),
    ];
  }

  const items = [];
  items.push(isLikelyIosSafari()
    ? readinessItem("iPhone/iPad Safari 환경으로 보입니다.", "ok")
    : isIosDevice()
      ? readinessItem("iPhone이지만 Safari가 아닌 브라우저로 보입니다. Safari에서 다시 열어 홈 화면에 추가하세요.", "warn")
    : readinessItem("최종 설치는 iPhone Safari에서 진행하세요.", "todo"));

  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.[0]) {
    items.push(readinessItem("localhost 대신 같은 Wi-Fi 설치 주소를 준비했습니다.", "ok"));
  } else if (isLocalInstallUrl()) {
    items.push(readinessItem("localhost는 iPhone에서 바로 열 수 없습니다. Mac IP나 HTTPS 배포 주소가 필요합니다.", "warn"));
  } else {
    items.push(readinessItem("현재 주소를 iPhone Safari에서 열 수 있습니다.", "ok"));
  }

  items.push(isPreferredInstallUrlHttps()
    ? readinessItem("HTTPS 주소라 service worker와 홈 화면 설치 경험이 안정적입니다.", "ok")
    : readinessItem("HTTP 주소입니다. 홈 화면 추가 후 오프라인 동작은 HTTPS 배포에서 더 안정적입니다.", "warn"));

  items.push("serviceWorker" in navigator
    ? readinessItem("이 브라우저는 service worker를 지원합니다.", "ok")
    : readinessItem("이 브라우저는 service worker를 지원하지 않습니다.", "warn"));

  return items;
}

function updateInstallReadiness() {
  const list = document.getElementById("iosInstallReadiness");
  if (!list) return;

  list.replaceChildren(...installReadinessItems().map((item) => {
    const element = document.createElement("li");
    element.dataset.state = item.state;
    element.textContent = item.text;
    return element;
  }));
}

function installModeState() {
  if (isStandaloneDisplay()) return "standalone";
  if (isLikelyIosSafari()) return "safari";
  return "browser";
}

function installModeTitle(state = installModeState()) {
  if (state === "standalone") return "Travel 홈 화면 앱으로 실행 중";
  if (state === "safari") return "Safari 설치 화면으로 열림";
  return "Safari로 다시 열기 필요";
}

function installModeDetail(state = installModeState()) {
  if (state === "standalone") return "주소창 없는 앱 모드입니다. 이제 설치 증거 저장과 Mac 최종 gate만 남았습니다.";
  if (state === "safari") return "공유 버튼 > 홈 화면에 추가를 누른 뒤 Travel 아이콘으로 다시 실행하세요.";
  return "홈 화면 추가가 보이지 않으면 설치 주소를 복사해 iPhone Safari 주소창에서 여세요.";
}

function installModeBadgeLabel(state = installModeState()) {
  if (state === "standalone") return "홈 화면 앱";
  if (state === "safari") return "Safari 준비";
  return "Safari 필요";
}

function installJourneyStatusText(state = installModeState()) {
  if (state === "standalone") return "Travel 홈 화면 앱으로 열렸습니다. 이제 proof 저장, 첫 플랜 생성, 완료 상태 확인을 이어가세요.";
  if (state === "safari") return "iPhone Safari에서 열렸습니다. 공유 버튼을 누르고 홈 화면에 추가한 뒤 Travel 아이콘으로 다시 여세요.";
  return "아직 Safari 설치 단계 전입니다. 설치 URL을 iPhone Safari로 보내거나 QR을 스캔해 Safari에서 여세요.";
}

function installJourneyStatusLinkTarget(state = installModeState()) {
  if (state === "standalone") {
    return { href: "#iosInstallFirstRun", label: "다음 4/4: 첫 실행 체크", step: "travel", stepNumber: "4", targetId: "iosInstallFirstRun", targetScope: "same-page" };
  }
  if (state === "safari") {
    return { href: "/install.html#iosInstallFastPathTitle", label: "다음 3/4: 홈 화면에 추가", step: "home", stepNumber: "3", targetId: "iosInstallFastPathTitle", targetScope: "install-page" };
  }
  return { href: "/install.html#iosInstallOpenUrlCard", label: "다음 1/4: 설치 URL/QR", step: "url", stepNumber: "1", targetId: "iosInstallOpenUrlCard", targetScope: "install-page" };
}

const IOS_INSTALL_JOURNEY_FALLBACK_CLICK_STORAGE_KEY = "travel-planner:ios-install-journey-fallback-click:v1";
const IOS_INSTALL_JOURNEY_FALLBACK_CLICK_MAX_AGE_MS = 15 * 60 * 1000;

function readIosInstallJourneyFallbackClickCarryover() {
  try {
    const raw = window.sessionStorage.getItem(IOS_INSTALL_JOURNEY_FALLBACK_CLICK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeIosInstallJourneyFallbackClickCarryover(payload) {
  try {
    window.sessionStorage.setItem(IOS_INSTALL_JOURNEY_FALLBACK_CLICK_STORAGE_KEY, JSON.stringify(payload));
    return "true";
  } catch {
    return "false";
  }
}

function updateIosInstallJourney(state = installModeState()) {
  const activeStep = state === "standalone" ? "travel" : state === "safari" ? "home" : "safari";
  const order = ["url", "safari", "home", "travel"];
  const activeIndex = order.indexOf(activeStep);
  const statusText = installJourneyStatusText(state);
  const statusLinkTarget = installJourneyStatusLinkTarget(state);
  const statusLinkTargetSamePageExists = document.getElementById(statusLinkTarget.targetId) ? "true" : "false";
  const statusLinkTargetFallbackVisible = statusLinkTarget.targetScope === "same-page" && statusLinkTargetSamePageExists !== "true" ? "true" : "false";
  const statusLinkTargetFallbackText = statusLinkTargetFallbackVisible === "true"
    ? " 다음 대상이 현재 화면에 보이지 않으면 설치 URL/QR로 돌아가 다시 이어가세요."
    : "";
  const fallbackCarryover = readIosInstallJourneyFallbackClickCarryover();
  const fallbackCarryoverClickedAt = fallbackCarryover.clickedAt || "";
  const fallbackCarryoverClickedTime = Date.parse(fallbackCarryoverClickedAt);
  const fallbackCarryoverAgeMs = Number.isFinite(fallbackCarryoverClickedTime) ? Math.max(0, Date.now() - fallbackCarryoverClickedTime) : NaN;
  const fallbackCarryoverFresh = Number.isFinite(fallbackCarryoverAgeMs) && fallbackCarryoverAgeMs <= IOS_INSTALL_JOURNEY_FALLBACK_CLICK_MAX_AGE_MS ? "true" : "false";
  const fallbackCarryoverArrived = fallbackCarryoverFresh === "true" && document.getElementById("iosInstallOpenUrlCard") ? "true" : "false";
  const fallbackCarryoverText = fallbackCarryoverArrived === "true"
    ? ` ${fallbackCarryover.label || "복구 링크"}에서 돌아왔습니다. 설치 URL/QR에서 다시 이어가세요.`
    : "";
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryover = fallbackCarryoverArrived;
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverFresh = fallbackCarryoverFresh;
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverClickedAt = fallbackCarryoverClickedAt;
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverHref = fallbackCarryover.href || "";
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverLabel = fallbackCarryover.label || "";
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverOriginalTargetId = fallbackCarryover.originalTargetId || "";
  document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackCarryoverAgeMs = Number.isFinite(fallbackCarryoverAgeMs) ? String(fallbackCarryoverAgeMs) : "";
  document.querySelectorAll("[data-ios-install-journey]").forEach((journey) => {
    journey.dataset.activeStep = activeStep;
    journey.querySelectorAll("[data-ios-install-journey-step]").forEach((step) => {
      const isActive = step.dataset.iosInstallJourneyStep === activeStep;
      const stepIndex = order.indexOf(step.dataset.iosInstallJourneyStep || "");
      const isComplete = stepIndex >= 0 && activeIndex >= 0 && stepIndex < activeIndex;
      step.dataset.active = isActive ? "true" : "false";
      step.dataset.complete = isComplete ? "true" : "false";
      if (isActive) {
        step.setAttribute("aria-current", "step");
        step.setAttribute("aria-label", `${step.textContent.trim()} 현재 단계`);
      } else {
        step.removeAttribute("aria-current");
        step.setAttribute("aria-label", `${step.textContent.trim()} ${isComplete ? "완료됨" : "대기 중"}`);
      }
    });
  });
  document.querySelectorAll("[data-ios-install-journey-status]").forEach((status) => {
    status.textContent = statusText + statusLinkTargetFallbackText + fallbackCarryoverText;
    status.dataset.state = state;
    status.dataset.nextTargetFallbackVisible = statusLinkTargetFallbackVisible;
    status.dataset.nextTargetFallbackHref = "/install.html#iosInstallOpenUrlCard";
    status.dataset.nextTargetFallbackLabel = "설치 URL/QR로 돌아가기";
    status.dataset.nextTargetFallbackCarryover = fallbackCarryoverArrived;
    status.dataset.nextTargetFallbackCarryoverFresh = fallbackCarryoverFresh;
    status.dataset.nextTargetFallbackCarryoverClickedAt = fallbackCarryoverClickedAt;
  });
  document.querySelectorAll("[data-ios-install-journey-status-link]").forEach((link) => {
    const effectiveHref = statusLinkTargetFallbackVisible === "true" ? "/install.html#iosInstallOpenUrlCard" : statusLinkTarget.href;
    const effectiveLabel = statusLinkTargetFallbackVisible === "true" ? "복구: 설치 URL/QR로 돌아가기" : statusLinkTarget.label;
    link.href = effectiveHref;
    link.textContent = effectiveLabel;
    link.dataset.state = state;
    link.dataset.nextStep = statusLinkTarget.step;
    link.dataset.nextStepNumber = statusLinkTarget.stepNumber;
    link.dataset.nextStepTotal = "4";
    link.dataset.nextTargetId = statusLinkTarget.targetId;
    link.dataset.nextTargetScope = statusLinkTarget.targetScope;
    link.dataset.nextTargetSamePageExists = statusLinkTargetSamePageExists;
    link.dataset.nextTargetFallbackVisible = statusLinkTargetFallbackVisible;
    link.dataset.nextTargetFallbackHref = "/install.html#iosInstallOpenUrlCard";
    link.dataset.nextTargetFallbackLabel = "설치 URL/QR로 돌아가기";
    link.dataset.nextTargetFallbackActive = statusLinkTargetFallbackVisible;
    link.dataset.nextTargetEffectiveHref = effectiveHref;
    link.dataset.nextTargetEffectiveLabel = effectiveLabel;
    link.title = statusText + statusLinkTargetFallbackText;
    link.setAttribute("aria-label", effectiveLabel + ". " + statusText + statusLinkTargetFallbackText);
  });
}

function iosInstallJourneyTargetLabel(id) {
  switch (id) {
    case "iosInstallOpenUrlCard":
      return "설치 URL/QR 카드";
    case "iosInstallFastPathTitle":
      return "1분 설치 루트";
    case "iosInstallProofSaveButton":
      return "설치 증거 저장";
    case "iosInstallFirstRun":
      return "첫 실행 체크";
    case "iosHomeDock":
      return "iPhone 빠른 실행";
    default:
      return "설치 단계";
  }
}

function cueIosInstallJourneyTargetFromHash(hash = window.location.hash) {
  const id = String(hash || "").replace(/^#/, "");
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.remove("install-journey-target-cue");
  void target.offsetWidth;
  target.classList.add("install-journey-target-cue");
  const cueLabel = iosInstallJourneyTargetLabel(id);
  const cueAt = new Date().toISOString();
  target.dataset.iosInstallJourneyTargetCue = "true";
  target.dataset.iosInstallJourneyTargetCueAt = cueAt;
  target.dataset.iosInstallJourneyTargetCueLabel = cueLabel;
  document.documentElement.dataset.iosInstallJourneyTargetCue = "true";
  document.documentElement.dataset.iosInstallJourneyTargetCueAt = cueAt;
  document.documentElement.dataset.iosInstallJourneyTargetCueId = id;
  document.documentElement.dataset.iosInstallJourneyTargetCueLabel = cueLabel;
  document.querySelectorAll("[data-ios-install-journey-status]").forEach((status) => {
    status.textContent = cueLabel + "로 이동했습니다. 필요한 다음 설치 단계를 이어가세요.";
    status.dataset.targetCue = "true";
    status.dataset.targetCueAt = cueAt;
    status.dataset.targetCueLabel = cueLabel;
  });
  window.setTimeout(() => {
    target.classList.remove("install-journey-target-cue");
  }, 1500);
}

function bindIosInstallJourneyTargetCue() {
  if (document.documentElement.dataset.iosInstallJourneyTargetCueBound === "true") return;
  document.documentElement.dataset.iosInstallJourneyTargetCueBound = "true";
  document.addEventListener("click", (event) => {
    const link = event.target?.closest?.("[data-ios-install-journey] a, [data-ios-install-journey-status-link]");
    if (!link) return;
    if (link.matches("[data-ios-install-journey-status-link]") && link.dataset.nextTargetFallbackActive === "true") {
      const clickedAt = new Date().toISOString();
      const effectiveHref = link.dataset.nextTargetEffectiveHref || link.getAttribute("href") || "";
      const effectiveLabel = link.dataset.nextTargetEffectiveLabel || link.textContent.trim() || "";
      link.dataset.nextTargetFallbackClicked = "true";
      link.dataset.nextTargetFallbackClickedAt = clickedAt;
      link.dataset.nextTargetFallbackClickedHref = effectiveHref;
      link.dataset.nextTargetFallbackClickedLabel = effectiveLabel;
      link.dataset.nextTargetFallbackClickedOriginalTargetId = link.dataset.nextTargetId || "";
      const fallbackStored = writeIosInstallJourneyFallbackClickCarryover({
        clicked: true,
        clickedAt,
        href: effectiveHref,
        label: effectiveLabel,
        originalTargetId: link.dataset.nextTargetId || "",
        valueFree: true,
      });
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClicked = "true";
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedAt = clickedAt;
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedHref = effectiveHref;
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedLabel = effectiveLabel;
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedOriginalTargetId = link.dataset.nextTargetId || "";
      document.documentElement.dataset.iosInstallJourneyStatusLinkFallbackClickedStored = fallbackStored;
      document.querySelectorAll("[data-ios-install-journey-status]").forEach((status) => {
        status.textContent = effectiveLabel + "로 이동합니다. 설치 URL/QR에서 다시 이어가세요.";
        status.dataset.nextTargetFallbackClicked = "true";
        status.dataset.nextTargetFallbackClickedAt = clickedAt;
        status.dataset.nextTargetFallbackClickedHref = effectiveHref;
        status.dataset.nextTargetFallbackClickedLabel = effectiveLabel;
        status.dataset.nextTargetFallbackClickedStored = fallbackStored;
      });
    }
    const url = new URL(link.getAttribute("href") || "", window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
    window.setTimeout(() => cueIosInstallJourneyTargetFromHash(url.hash), 80);
  });
  window.addEventListener("hashchange", () => cueIosInstallJourneyTargetFromHash(), { passive: true });
  if (window.location.hash) window.setTimeout(() => cueIosInstallJourneyTargetFromHash(), 120);
}

function updateInstallModeCallout() {
  const callout = document.getElementById("iosInstallModeCallout");
  const badge = document.getElementById("iosInstallBadge");
  if (!callout) return;

  const title = callout.querySelector("strong");
  const detail = callout.querySelector("span");
  const state = installModeState();
  const modeTitle = installModeTitle(state);
  const modeDetail = installModeDetail(state);
  const badgeLabel = installModeBadgeLabel(state);
  callout.dataset.state = state;
  callout.dataset.iosInstallModeTitle = modeTitle;
  callout.dataset.iosInstallModeDetail = modeDetail;
  callout.dataset.iosInstallModeBadgeLabel = badgeLabel;
  callout.dataset.iosInstallModeDisplayMode = isStandaloneDisplay() ? "standalone" : "browser";
  callout.title = `${modeTitle}. ${modeDetail}`;
  callout.setAttribute("aria-label", callout.title);
  if (title) title.textContent = modeTitle;
  if (detail) detail.textContent = modeDetail;
  if (badge) {
    badge.textContent = badgeLabel;
    badge.dataset.iosInstallModeBadgeState = state;
    badge.dataset.iosInstallModeBadgeDisplayMode = isStandaloneDisplay() ? "standalone" : "browser";
    badge.title = callout.title;
    badge.setAttribute("aria-label", callout.title);
  }
  updateIosInstallModeHandoffLinks();
  updateIosInstallJourney(state);
}

function installJourneyTargetCueEvidenceLines() {
  const root = document.documentElement.dataset;
  return [
    `iosInstallJourneyTargetCue=${root.iosInstallJourneyTargetCue || ""}`,
    `iosInstallJourneyTargetCueAt=${root.iosInstallJourneyTargetCueAt || ""}`,
    `iosInstallJourneyTargetCueId=${root.iosInstallJourneyTargetCueId || ""}`,
    `iosInstallJourneyTargetCueLabel=${root.iosInstallJourneyTargetCueLabel || ""}`,
    "iosInstallJourneyTargetCueValueFree=true",
  ];
}

function installJourneyTargetCueHandoffNote() {
  const label = document.documentElement.dataset.iosInstallJourneyTargetCueLabel || "";
  return label
    ? `마지막 이동 위치(${label})도 evidence에 포함됩니다.`
    : "마지막 이동 위치가 있으면 evidence에 함께 포함됩니다.";
}

function iosStandaloneSuccessCheckEvidenceLines() {
  const panel = document.getElementById("iosStandaloneSuccessCheck");
  const items = Array.from(panel?.querySelectorAll("[data-ios-standalone-success-check-item]") || []);
  const visible = panel && !panel.closest("[hidden]") ? "true" : "false";
  return [
    `iosStandaloneSuccessCheckVisible=${visible}`,
    `iosStandaloneSuccessCheckItems=${items.map((item) => item.dataset.iosStandaloneSuccessCheckItem || "").filter(Boolean).join(",")}`,
    `iosStandaloneSuccessCheckLabels=${items.map((item) => item.querySelector("span")?.textContent.trim() || "").filter(Boolean).join(" | ")}`,
    `iosStandaloneSuccessCheckTargets=${items.map((item) => item.dataset.iosStandaloneSuccessCheckTarget || item.querySelector("a")?.getAttribute("href") || "").filter(Boolean).join(",")}`,
    `iosStandaloneSuccessCheckActionLabels=${items.map((item) => item.querySelector("a")?.textContent.trim() || "").filter(Boolean).join(" | ")}`,
    `iosStandaloneSuccessCheckValueFree=${panel?.dataset.valueFree || ""}`,
  ];
}

function installModeEvidenceText() {
  const state = installModeState();
  return [
    "Travel Planner iPhone install mode",
    `url=${window.location.href}`,
    `displayMode=${isStandaloneDisplay() ? "standalone" : "browser"}`,
    `appModeState=${state}`,
    `appModeTitle=${installModeTitle(state)}`,
    `appModeDetail=${installModeDetail(state)}`,
    `appModeBadgeLabel=${installModeBadgeLabel(state)}`,
    `launchProofAppModeReady=${state === "standalone" ? "true" : "false"}`,
    ...iosStandaloneSuccessCheckEvidenceLines(),
    "handoffSmsRole=compact",
    "handoffMailRole=detailed",
    "handoffHint=SMS compact, mail detailed",
    ...installJourneyTargetCueEvidenceLines(),
    "draftValues=excluded",
    "llmSecrets=excluded",
  ].join("\n");
}

function installModeEvidenceSmsText() {
  const state = installModeState();
  return [
    `Travel mode: ${installModeBadgeLabel(state)}`,
    `appModeState=${state}`,
    `displayMode=${isStandaloneDisplay() ? "standalone" : "browser"}`,
    ...iosStandaloneSuccessCheckEvidenceLines(),
    ...installJourneyTargetCueEvidenceLines(),
    `ready=${state === "standalone" ? "true" : "false"}`,
    "sms=compact",
    "mail=detailed",
    `url=${window.location.href}`,
    "draftValues=excluded",
    "llmSecrets=excluded",
  ].join("\n");
}

function bindIosInstallModeCopyButton() {
  const button = document.getElementById("iosInstallModeCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosInstallModeCopyBound === "true") return;
  button.dataset.iosInstallModeCopyBound = "true";
  button.addEventListener("click", async () => {
    updateInstallModeCallout();
    const text = installModeEvidenceText();
    const copiedAt = new Date().toISOString();
    try {
      await navigator.clipboard.writeText(text);
      button.dataset.iosInstallModeCopyMethod = "clipboard";
      button.textContent = "모드 복사됨";
      if (status) status.textContent = `현재 iPhone 설치 실행 모드를 복사했습니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
    } catch {
      window.prompt("현재 iPhone 설치 실행 모드를 복사하세요. draftValues=excluded; llmSecrets=excluded", text);
      button.dataset.iosInstallModeCopyMethod = "prompt";
      button.textContent = "모드 prompt 표시";
      if (status) status.textContent = `클립보드 대신 prompt로 현재 iPhone 설치 실행 모드를 표시했습니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
    }
    button.dataset.iosInstallModeCopied = "true";
    button.dataset.iosInstallModeCopiedAt = copiedAt;
    button.dataset.iosInstallModeCopiedState = installModeState();
    window.setTimeout(() => {
      button.textContent = "모드 상태 복사";
    }, 1800);
  });
}

function bindIosInstallModeShareButton() {
  const button = document.getElementById("iosInstallModeShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.iosInstallModeShareBound === "true") return;
  button.dataset.iosInstallModeShareBound = "true";
  button.hidden = !navigator.share;
  button.addEventListener("click", async () => {
    updateInstallModeCallout();
    const text = installModeEvidenceText();
    const sharedAt = new Date().toISOString();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Travel Planner iPhone install mode",
          text,
        });
        button.dataset.iosInstallModeShareMethod = "native-share";
        button.textContent = "모드 공유됨";
        if (status) status.textContent = `현재 iPhone 설치 실행 모드를 공유했습니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
      } else {
        throw new Error("native share unavailable");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        button.dataset.iosInstallModeShareMethod = "clipboard";
        button.textContent = "모드 복사됨";
        if (status) status.textContent = `공유 대신 현재 iPhone 설치 실행 모드를 클립보드에 복사했습니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
      } catch {
        window.prompt("현재 iPhone 설치 실행 모드를 복사하세요. draftValues=excluded; llmSecrets=excluded", text);
        button.dataset.iosInstallModeShareMethod = "prompt";
        button.textContent = "모드 prompt 표시";
        if (status) status.textContent = `공유/클립보드 대신 prompt로 현재 iPhone 설치 실행 모드를 표시했습니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
      }
    }
    button.dataset.iosInstallModeShared = "true";
    button.dataset.iosInstallModeSharedAt = sharedAt;
    button.dataset.iosInstallModeSharedState = installModeState();
    window.setTimeout(() => {
      button.textContent = "모드 상태 공유";
    }, 1800);
  });
}

function updateIosInstallModeHandoffLinks() {
  const smsLink = document.getElementById("iosInstallModeSmsLink");
  const mailLink = document.getElementById("iosInstallModeMailLink");
  const hint = document.getElementById("iosInstallModeHandoffHint");
  const copyButton = document.getElementById("iosInstallModeCopyButton");
  const shareButton = document.getElementById("iosInstallModeShareButton");
  if (!smsLink && !mailLink) return;
  const text = installModeEvidenceText();
  const smsText = installModeEvidenceSmsText();
  const state = installModeState();
  const journeyCueRoot = document.documentElement.dataset;
  const journeyTargetCue = journeyCueRoot.iosInstallJourneyTargetCue || "";
  const journeyTargetCueAt = journeyCueRoot.iosInstallJourneyTargetCueAt || "";
  const journeyTargetCueId = journeyCueRoot.iosInstallJourneyTargetCueId || "";
  const journeyTargetCueLabel = journeyCueRoot.iosInstallJourneyTargetCueLabel || "";
  const journeyCueHandoffNote = installJourneyTargetCueHandoffNote();
  if (smsLink) {
    smsLink.href = `sms:&body=${encodeURIComponent(smsText)}`;
    smsLink.textContent = "모드 문자(짧게)";
    smsLink.title = "현재 iPhone 설치 실행 모드 상태를 짧은 문자 요약으로 보냅니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    smsLink.setAttribute("aria-label", "현재 iPhone 설치 실행 모드 짧은 문자 요약 보내기");
    smsLink.dataset.iosInstallModeHandoffChannel = "sms";
    smsLink.dataset.iosInstallModeHandoffState = state;
    smsLink.dataset.iosInstallModeHandoffDisplayMode = isStandaloneDisplay() ? "standalone" : "browser";
    smsLink.dataset.iosInstallModeHandoffPayload = "value-free";
    smsLink.dataset.iosInstallModeHandoffPayloadKind = "compact";
    smsLink.dataset.iosInstallModeHandoffLabel = "compact-sms";
  }
  if (mailLink) {
    mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 모드")}&body=${encodeURIComponent(text)}`;
    mailLink.textContent = "모드 메일(상세)";
    mailLink.title = "현재 iPhone 설치 실행 모드 상태를 상세 메일 evidence로 보냅니다. 입력 내용과 LLM 비밀값은 제외합니다.";
    mailLink.setAttribute("aria-label", "현재 iPhone 설치 실행 모드 상세 메일 evidence 보내기");
    mailLink.dataset.iosInstallModeHandoffChannel = "mail";
    mailLink.dataset.iosInstallModeHandoffState = state;
    mailLink.dataset.iosInstallModeHandoffDisplayMode = isStandaloneDisplay() ? "standalone" : "browser";
    mailLink.dataset.iosInstallModeHandoffPayload = "value-free";
    mailLink.dataset.iosInstallModeHandoffPayloadKind = "detailed";
    mailLink.dataset.iosInstallModeHandoffLabel = "detailed-mail";
  }
  if (hint) {
    hint.textContent = `문자는 짧은 앱 모드 요약만 보내고, 메일은 상세 evidence를 보냅니다. ${journeyCueHandoffNote} 입력 내용과 LLM 비밀값은 제외됩니다.`;
    hint.dataset.iosInstallModeHandoffHintVisible = "true";
    hint.dataset.iosInstallModeHandoffHintSmsRole = "compact";
    hint.dataset.iosInstallModeHandoffHintMailRole = "detailed";
    hint.dataset.iosInstallModeHandoffHintPayload = "value-free";
    hint.dataset.iosInstallModeHandoffHintJourneyTargetCue = journeyTargetCue;
    hint.dataset.iosInstallModeHandoffHintJourneyTargetCueId = journeyTargetCueId;
    hint.dataset.iosInstallModeHandoffHintJourneyTargetCueLabel = journeyTargetCueLabel;
    hint.dataset.iosInstallModeHandoffHintJourneyTargetCueAt = journeyTargetCueAt;
    hint.dataset.iosInstallModeHandoffHintJourneyTargetCueValueFree = "true";
  }
  [
    copyButton,
    shareButton,
    smsLink,
    mailLink,
  ].forEach((control) => {
    if (!control) return;
    control.setAttribute("aria-describedby", "iosInstallModeHandoffHint");
    control.dataset.iosInstallModeHandoffHintDescribedBy = "iosInstallModeHandoffHint";
    control.dataset.iosInstallModeHandoffJourneyTargetCue = journeyTargetCue;
    control.dataset.iosInstallModeHandoffJourneyTargetCueId = journeyTargetCueId;
    control.dataset.iosInstallModeHandoffJourneyTargetCueLabel = journeyTargetCueLabel;
    control.dataset.iosInstallModeHandoffJourneyTargetCueAt = journeyTargetCueAt;
    control.dataset.iosInstallModeHandoffJourneyTargetCueValueFree = "true";
  });
}

function bindIosInstallModeHandoffLinks() {
  const status = document.getElementById("iosInstallStatus");
  [
    ["iosInstallModeSmsLink", "sms", "짧은 문자 요약"],
    ["iosInstallModeMailLink", "mail", "상세 메일 evidence"],
  ].forEach(([id, channel, label]) => {
    const link = document.getElementById(id);
    if (!link || link.dataset.iosInstallModeHandoffBound === "true") return;
    link.dataset.iosInstallModeHandoffBound = "true";
    link.addEventListener("click", () => {
      updateIosInstallModeHandoffLinks();
      link.dataset.iosInstallModeHandoffClicked = "true";
      link.dataset.iosInstallModeHandoffClickedAt = new Date().toISOString();
      link.dataset.iosInstallModeHandoffClickedChannel = channel;
      link.dataset.iosInstallModeHandoffClickedState = installModeState();
      link.dataset.iosInstallModeHandoffClickedPayloadKind = link.dataset.iosInstallModeHandoffPayloadKind || "";
      if (status) status.textContent = `현재 iPhone 설치 실행 모드를 ${label}로 보냅니다. ${installJourneyTargetCueHandoffNote()} draftValues=excluded; llmSecrets=excluded`;
    });
  });
}

function installCompletionItems() {
  const state = readIosFirstRunChecklist();
  const standalone = isStandaloneDisplay();
  const firstPlanDone = Boolean(state["first-plan"]);
  const completionStatusPageOpen = window.location.pathname === "/ios-install-status" || window.location.pathname === "/ios-install-status.html";
  const finalGateChecked = Boolean(iosInstallSummaryCheck);
  const expectedFinalEvidenceCommand = iosInstallSummaryCheck?.expectedFinalEvidenceCommand || "npm run ios:install:evidence:after-phone:final";
  const finalEvidenceCommand = iosInstallSummaryCheck?.finalEvidenceCommand || "";
  const finalGateCommandMatches = finalEvidenceCommand === expectedFinalEvidenceCommand;
  const finalSummaryComplete = iosInstallSummaryCheck?.summaryStatus === "complete";
  const finalAppModeReady = iosInstallSummaryCheck?.launchProofAppModeReady === true;
  const finalFreshnessReady = iosInstallSummaryCheckIsFresh();
  const finalGateReady = iosInstallSummaryCheck?.ok === true && iosInstallSummaryCheck?.status === "ready" && finalGateCommandMatches && finalSummaryComplete && finalAppModeReady && finalFreshnessReady;
  const completionStatusReviewed = completionStatusPageOpen && firstPlanDone && finalGateReady;
  const finalGateStatusSummary = finalGateChecked && iosInstallSummaryCheck.status && iosInstallSummaryCheck.status !== "missing"
    ? finalGateCommandMatches
      ? !finalSummaryComplete
        ? iosInstallSummaryCheck.nextStep || "최종 summary가 아직 complete가 아닙니다. 남은 iPhone proof 또는 Mac gate 단계를 마무리하세요."
        : !finalAppModeReady
          ? "홈 화면 Travel 앱 proof가 아직 appModeState=standalone으로 확인되지 않았습니다. Travel 아이콘에서 proof를 다시 저장한 뒤 최종 gate를 실행하세요."
          : !finalFreshnessReady
            ? `Mac 최종 gate evidence가 오래됐거나 생성 시각이 없습니다. npm run ios:install:evidence:after-phone:final 을 다시 실행하세요. ${iosInstallSummaryFreshnessDetail()}`
            : iosInstallSummaryCheck.summary || "Mac 최종 gate 결과에 확인이 필요합니다."
      : `Mac 최종 gate 명령을 다시 확인하세요. 기대: ${expectedFinalEvidenceCommand}, 기록: ${finalEvidenceCommand || "없음"}`
    : "";
  return [
    {
      label: "Safari 설치 화면",
      detail: standalone
        ? "홈 화면 앱으로 실행 중입니다."
        : isLikelyIosSafari()
          ? "Safari에서 공유 버튼 > 홈 화면에 추가를 진행하세요."
          : "iPhone Safari에서 설치 주소를 다시 열어야 합니다.",
      state: standalone || isLikelyIosSafari() ? "ok" : "todo",
    },
    {
      label: "Travel 아이콘 실행",
      detail: standalone
        ? "Safari 주소창 없이 Travel Planner가 열렸습니다."
        : "홈 화면에 추가한 뒤 Travel 아이콘으로 다시 실행하세요.",
      state: standalone ? "ok" : "todo",
    },
    {
      label: "설치 증거 저장",
      detail: state.proof
        ? "이 iPhone에서 홈 화면 실행 증거를 저장했습니다."
        : standalone
          ? "설치 증거 저장 버튼을 눌러 서버 reports 폴더에 증거를 남기세요."
          : "Travel 아이콘으로 실행하면 설치 증거 저장 버튼이 나타납니다.",
      state: state.proof ? "ok" : standalone ? "warn" : "todo",
    },
    {
      label: "첫 플랜 생성",
      detail: firstPlanDone
        ? "홈 화면 Travel 앱에서 첫 여행 플랜 생성을 완료했습니다."
        : state.proof
          ? "앱 홈에서 첫 여행 플랜을 만들어 설치 후 실제 사용 루프를 확인하세요."
          : "설치 증거 저장 후 앱 홈에서 첫 여행 플랜을 만들어야 합니다.",
      state: firstPlanDone ? "ok" : state.proof ? "warn" : "todo",
    },
    {
      label: "Mac 최종 gate",
      detail: finalGateReady
        ? `Mac 최종 evidence archive/gate가 통과했습니다. 명령: ${expectedFinalEvidenceCommand}`
        : finalGateChecked && iosInstallSummaryCheck.status && iosInstallSummaryCheck.status !== "missing"
          ? finalGateStatusSummary
          : state.proof
        ? "Mac에서 npm run ios:install:evidence:after-phone:final 을 실행하면 완료 판정이 확정됩니다."
        : "증거 저장 후 Mac에서 npm run ios:install:evidence:after-phone:final 을 실행해야 완료입니다.",
      state: finalGateReady ? "ok" : state.proof ? "warn" : "todo",
    },
    {
      label: "완료 상태 review",
      detail: completionStatusReviewed
        ? "완료 상태 페이지에서 첫 플랜 생성과 Mac 최종 gate까지 충족된 상태를 확인했습니다."
        : completionStatusPageOpen && firstPlanDone
          ? "완료 상태 페이지에 도착했습니다. 남은 gate를 확인하고 Mac 최종 gate 결과를 새로고침하세요."
          : completionStatusPageOpen
            ? "완료 상태 페이지에 도착했지만 첫 플랜 생성과 Mac 최종 gate 확인이 아직 남아 있습니다."
          : firstPlanDone
          ? "첫 플랜 생성 후 /ios-install-status에서 남은 gate가 없는지 확인하세요."
          : "첫 플랜 생성 후 완료 상태 페이지에서 남은 gate를 확인해야 합니다.",
      state: completionStatusReviewed ? "ok" : completionStatusPageOpen || firstPlanDone ? "warn" : "todo",
    },
  ];
}

function iosInstallCompletionStatusTextUrl() {
  return new URL("/api/ios-install-completion-status.txt", window.location.href).toString();
}

function iosInstallCompletionStatusPageUrl() {
  return new URL("/ios-install-status", window.location.href).toString();
}

function preferredInstallNextActionScanUrl() {
  try {
    const url = new URL(selectedShortInstallUrl || preferredInstallUrl());
    url.pathname = "/ios-next";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "/ios-next";
  }
}

function iosInstallMacEvidenceSequenceCommand() {
  return iosInstallFinishTerminalCommand();
}

function installCompletionStatusText() {
  const items = installCompletionItems();
  const doneCount = items.filter((item) => item.state === "ok").length;
  const nextGate = items.find((item) => item.state !== "ok");
  const nextGateTarget = installCompletionNextGateTarget(nextGate);
  const summary = iosInstallSummaryCheck || {};
  return [
    "Travel Planner iPhone install completion status",
    "criteria=Home Screen proof + Mac final gate + first-plan creation + completion-status review",
    `generatedAt=${new Date().toISOString()}`,
    `completionStatusPageUrl=${iosInstallCompletionStatusPageUrl()}`,
    `completionStatusUrl=${iosInstallCompletionStatusTextUrl()}`,
    `nextActionScanUrl=${preferredInstallNextActionScanUrl()}`,
    `completion=${doneCount}/${items.length}` ,
    `nextGateLabel=${nextGate?.label || "complete"}` ,
    `nextGateState=${nextGate?.state || "ok"}` ,
    `nextGateTarget=${nextGateTarget}` ,
    `summaryCheckStatus=${summary.status || ""}` ,
    `summaryStatus=${summary.summaryStatus || ""}` ,
    `summaryGeneratedAt=${summary.summaryGeneratedAt || ""}` ,
    `summaryFresh=${iosInstallSummaryCheckIsFresh() ? "true" : "false"}` ,
    `summaryFreshnessState=${iosInstallSummaryFreshnessState()}` ,
    `summaryFreshnessDetail=${iosInstallSummaryFreshnessDetail()}` ,
    `launchProofAppModeReady=${summary.launchProofAppModeReady === true ? "true" : "false"}` ,
    `launchProofAppModeState=${summary.launchProofAppModeState || ""}` ,
    `finalEvidenceCommand=${summary.finalEvidenceCommand || "npm run ios:install:evidence:after-phone:final"}` ,
    "afterPhoneEvidenceTerminalCommand=test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
    `finalEvidenceTerminalCommand=${iosInstallFinishTerminalCommand()}`,
    `completionMacEvidenceSequenceTerminalCommand=${iosInstallMacEvidenceSequenceCommand()}` ,
    `nextStep=${summary.nextStep || ""}` ,
    `sessionUrl=${preferredInstallSessionUrl()}` ,
    `proofSaveUrl=${preferredProofSaveUrl()}` ,
    "",
    "Checklist:",
    ...items.map((item) => `- ${item.state}: ${item.label} - ${item.detail}`),
  ].join("\n");
}
function installCompletionStatusSmsText() {
  const summary = iosInstallSummaryCheck || {};
  return [
    "Travel Planner iPhone install status",
    "criteria=Home Screen proof + Mac final gate + first-plan creation + completion-status review",
    `summary=${summary.summaryStatus || summary.status || "unknown"}` ,
    `summaryFresh=${iosInstallSummaryFreshnessState()}` ,
    `appModeReady=${summary.launchProofAppModeReady === true ? "true" : "false"}` ,
    `appMode=${summary.launchProofAppModeState || ""}` ,
    `next=${summary.nextStep || ""}` ,
    `macSequence=${iosInstallMacEvidenceSequenceCommand()}` ,
    `nextActionScan=${preferredInstallNextActionScanUrl()}` ,
    `session=${preferredInstallSessionUrl()}` ,
    `proof=${preferredProofSaveUrl()}` ,
  ].filter(Boolean).join("\n");
}

function installCompletionNextGateTarget(item) {
  if (!item) return "";
  if (item.label === "Travel 아이콘 실행") return "/install.html";
  if (item.label === "설치 증거 저장") return "#iosInstallProofSaveButton";
  if (item.label === "첫 플랜 생성") return "/#planForm";
  if (item.label === "Mac 최종 gate") return "#iosInstallCompletionRefreshButton";
  if (item.label === "완료 상태 review") return "/ios-install-status";
  return "";
}

function updateInstallCompletionStatusHandoffLinks() {
  const smsLink = document.getElementById("iosInstallCompletionStatusSmsLink");
  const mailLink = document.getElementById("iosInstallCompletionStatusMailLink");
  const statusLink = document.getElementById("iosInstallCompletionStatusLink");
  const completionScanLink = document.getElementById("iosInstallCompletionNextActionScanLink");
  if (smsLink) smsLink.href = `sms:&body=${encodeURIComponent(installCompletionStatusSmsText())}`;
  if (mailLink) {
    mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 완료 상태")}&body=${encodeURIComponent(installCompletionStatusText())}`;
  }
  if (statusLink) statusLink.href = "/ios-install-status";
  if (completionScanLink) completionScanLink.href = preferredInstallNextActionScanUrl();
}
function bindInstallAppModeProofActions() {
  const gateButton = document.getElementById("iosInstallAppModeProofGateButton");
  const retryButton = document.getElementById("iosInstallAppModeProofRetryButton");
  const refreshButton = document.getElementById("iosInstallAppModeProofRefreshButton");
  const statusCopyButton = document.getElementById("iosInstallCompletionStatusCopyButton");
  const statusShareButton = document.getElementById("iosInstallCompletionStatusShareButton");
  const status = document.getElementById("iosInstallStatus");

  if (gateButton && gateButton.dataset.appModeProofGateBound !== "true") {
    gateButton.dataset.appModeProofGateBound = "true";
    gateButton.addEventListener("click", async () => {
      const command = iosInstallFinishTerminalCommand();
      try {
        await navigator.clipboard.writeText(command);
        if (status) status.textContent = "최종 app-mode gate 명령을 복사했습니다. Mac 터미널에서 실행하세요.";
      } catch {
        window.prompt("최종 app-mode gate 명령을 복사하세요.", command);
      }
    });
  }

  if (refreshButton && refreshButton.dataset.appModeProofRefreshBound !== "true") {
    refreshButton.dataset.appModeProofRefreshBound = "true";
    refreshButton.addEventListener("click", () => refreshInstallSummaryCheckStatus(true));
  }

  if (statusCopyButton && statusCopyButton.dataset.completionStatusCopyBound !== "true") {
    statusCopyButton.dataset.completionStatusCopyBound = "true";
    statusCopyButton.addEventListener("click", async () => {
      const text = installCompletionStatusText();
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = "iPhone 설치 완료 상태를 복사했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 함께 확인할 수 있습니다.";
      } catch {
        window.prompt("Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 iPhone 설치 완료 상태를 복사하세요.", text);
      }
    });
  }

  if (statusShareButton && statusShareButton.dataset.completionStatusShareBound !== "true") {
    if (navigator.share) {
      statusShareButton.hidden = false;
      statusShareButton.dataset.completionStatusShareBound = "true";
      statusShareButton.addEventListener("click", async () => {
        try {
          await navigator.share({
            title: "Travel Planner iPhone 설치 완료 상태",
            text: installCompletionStatusText(),
            url: preferredInstallSessionUrl(),
          });
          if (status) status.textContent = "iPhone 설치 완료 상태를 공유했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 함께 확인하세요.";
        } catch (error) {
          if (error?.name !== "AbortError" && status) {
            status.textContent = "완료 상태 공유를 완료하지 못했습니다. Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준이 담긴 완료 상태 복사를 사용하세요.";
          }
        }
      });
    }
  }

  if (retryButton && retryButton.dataset.appModeProofRetryBound !== "true") {
    retryButton.dataset.appModeProofRetryBound = "true";
    retryButton.addEventListener("click", () => {
      const proofPanel = document.getElementById("iosInstallProof");
      const saveButton = document.getElementById("iosInstallProofSaveButton");
      const fallbackTarget = document.getElementById("iosInstallFastPathTitle");
      const target = isStandaloneDisplay() ? proofPanel : fallbackTarget;
      const scrollTarget = target?.closest?.("section, div, details") || target;
      if (scrollTarget?.scrollIntoView) scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      if (isStandaloneDisplay()) saveButton?.focus?.();
      if (status) {
        status.textContent = isStandaloneDisplay()
          ? "Travel 홈 화면 앱에서 설치 증거 저장을 다시 누르세요."
          : "먼저 홈 화면의 Travel 아이콘으로 실행한 뒤 proof를 저장하세요.";
      }
    });
  }
}
function updateInstallAppModeProofStatus() {
  const box = document.getElementById("iosInstallAppModeProofStatus");
  if (!box) return;

  const title = box.querySelector("strong");
  const detail = box.querySelector("span");
  const state = readIosFirstRunChecklist();
  const appModeReady = iosInstallSummaryCheck?.launchProofAppModeReady === true;
  const appModeState = iosInstallSummaryCheck?.launchProofAppModeState || "";
  const summaryStatus = iosInstallSummaryCheck?.status || "";
  const hasSummary = Boolean(iosInstallSummaryCheck);
  const gateButton = document.getElementById("iosInstallAppModeProofGateButton");
  const retryButton = document.getElementById("iosInstallAppModeProofRetryButton");

  box.dataset.state = appModeReady ? "ok" : state.proof ? "warn" : "todo";
  if (title) {
    title.textContent = appModeReady
      ? "홈 화면 앱 proof 확인됨"
      : state.proof
        ? "앱 모드 proof 재확인 필요"
        : "홈 화면 앱 proof 확인 전";
  }
  if (gateButton) gateButton.hidden = appModeReady;
  if (retryButton) retryButton.hidden = appModeReady;
  if (detail) {
    detail.textContent = appModeReady
      ? `저장된 최종 summary가 appModeState=${appModeState || "standalone"} 증거를 확인했습니다.`
      : state.proof
        ? `proof는 저장됐지만 최종 summary의 app-mode gate가 아직 준비되지 않았습니다${summaryStatus ? ` (${summaryStatus})` : ""}. Mac에서 최종 gate를 다시 실행하거나 Travel 아이콘에서 proof를 다시 저장하세요.`
        : hasSummary
          ? "최종 summary는 있지만 아직 Home Screen Travel 앱 proof가 없습니다. Travel 아이콘으로 실행한 뒤 설치 증거 저장을 누르세요."
          : "Travel 아이콘으로 실행한 뒤 proof를 저장하면 appModeState=standalone 여부가 여기에 표시됩니다.";
  }
}
function updateInstallCompletionChecklist() {
  const box = document.getElementById("iosInstallCompletion");
  const progress = document.getElementById("iosInstallCompletionProgress");
  const summary = document.getElementById("iosInstallCompletionSummary");
  const list = document.getElementById("iosInstallCompletionList");
  const sessionLink = document.getElementById("iosInstallCompletionSessionLink");
  const sessionQrLink = document.getElementById("iosInstallCompletionSessionQrLink");
  if (!box || !list) return;

  const items = installCompletionItems();
  const nextGate = items.find((item) => item.state !== "ok");
  const nextGateTarget = installCompletionNextGateTarget(nextGate);
  inferIosInstallHandsOnProgressFromSummaryCheck();
  const sessionUrl = preferredInstallSessionUrl();
  const doneCount = items.filter((item) => item.state === "ok").length;
  box.dataset.state = doneCount === items.length ? "done" : "pending";
  if (progress) progress.textContent = `${doneCount}/${items.length} 완료`;
  if (summary) {
    summary.textContent = doneCount === items.length
      ? "iPhone 설치와 Mac evidence gate가 모두 완료됐습니다."
      : "Travel 아이콘 실행 proof 저장, 첫 플랜 생성, Mac 최종 gate 결과 새로고침, 완료 상태 review까지 끝나야 완료입니다.";
  }
  let nextGateCue = document.getElementById("iosInstallCompletionNextGateCue");
  if (!nextGateCue) {
    nextGateCue = document.createElement("p");
    nextGateCue.id = "iosInstallCompletionNextGateCue";
    nextGateCue.className = "install-deployment-hint";
    summary?.insertAdjacentElement("afterend", nextGateCue);
  }
  nextGateCue.dataset.state = nextGate ? "stale" : "fresh";
  nextGateCue.replaceChildren();
  const nextGateReason = nextGate ? nextGate.state === "warn" ? "warning-state" : "incomplete" : "complete";
  const nextGateReasonText = nextGateReason === "warning-state"
    ? "이 gate가 주의 상태라서 다음 확인 대상입니다."
    : nextGateReason === "incomplete"
      ? "이 gate가 아직 완료되지 않아 다음 행동입니다."
      : "모든 gate가 완료됐습니다.";
  if (nextGate) {
    nextGateCue.append(document.createTextNode(`다음 미완료 gate: ${nextGate.label}. ${nextGate.detail} ${nextGateReasonText} `));
    const nextGateLink = document.createElement("a");
    nextGateLink.id = "iosInstallCompletionNextGateCueActionLink";
    nextGateLink.className = "install-link";
    nextGateLink.href = nextGateTarget || "#iosInstallCompletion";
    nextGateLink.textContent = "다음 gate 열기";
    nextGateLink.setAttribute("aria-label", `다음 미완료 gate 열기: ${nextGate.label}`);
    nextGateLink.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      const focusTarget = nextGateTarget.startsWith("#") ? nextGateTarget.slice(1) : "";
      const statusFeedback = `다음 미완료 gate로 이동합니다. gate=${nextGate.label}; draftValues=excluded; llmSecrets=excluded`;
      document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkClicked = "true";
      document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkClickedAt = clickedAt;
      document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusTarget = focusTarget;
      document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkStatusFeedback = statusFeedback;
      if (focusTarget) {
        window.setTimeout(() => {
          const target = document.getElementById(focusTarget);
          target?.focus?.({ preventScroll: true });
          document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusApplied = document.activeElement === target ? "true" : "false";
          document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkFocusedAt = new Date().toISOString();
        }, 260);
      }
    });
    nextGateCue.append(nextGateLink);
  } else {
    nextGateCue.textContent = "모든 iPhone 설치 완료 gate가 확인됐습니다.";
  }
  document.documentElement.dataset.iosInstallCompletionNextGateCueVisible = "true";
  document.documentElement.dataset.iosInstallCompletionNextGateCueLabel = nextGate?.label || "complete";
  document.documentElement.dataset.iosInstallCompletionNextGateCueState = nextGate?.state || "ok";
  document.documentElement.dataset.iosInstallCompletionNextGateCueReason = nextGateReason;
  document.documentElement.dataset.iosInstallCompletionNextGateCueTarget = nextGateTarget;
  document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkVisible = nextGate ? "true" : "false";
  document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkRoute = nextGate ? nextGateTarget : "";
  document.documentElement.dataset.iosInstallCompletionNextGateCueActionLinkLabel = nextGate ? "다음 gate 열기" : "";
  updateIosInstallSummaryFreshnessBadge();
  updateInstallAppModeProofStatus();
  updateInstallCompletionStatusHandoffLinks();
  list.replaceChildren(...items.map((item) => {
    const element = document.createElement("li");
    element.dataset.state = item.state;
    element.innerHTML = `<strong>${item.label}</strong><span>${item.detail}</span>`;
    return element;
  }));
  if (sessionLink) sessionLink.href = sessionUrl;
  if (sessionQrLink) {
    sessionQrLink.href = preferredInstallSessionQrUrl();
    sessionQrLink.title = sessionUrl;
  }
}

async function fetchInstallSummaryCheck() {
  const path = "/api/ios-install-summary-check";
  if (typeof api === "function") {
    return api(path, { headers: { Accept: "application/json" } });
  }
  return fetch(path, {
    headers: typeof withAccessKeyHeaders === "function"
      ? withAccessKeyHeaders({ Accept: "application/json" })
      : { Accept: "application/json" },
  });
}

async function refreshInstallSummaryCheckStatus(manual = false) {
  const button = document.getElementById("iosInstallCompletionRefreshButton");
  if (manual && button) button.textContent = "최종 gate 확인 중";
  try {
    const response = await fetchInstallSummaryCheck();
    let check = {};
    try {
      check = await response.json();
    } catch {
      check = {};
    }
    iosInstallSummaryCheck = response.ok
      ? check
      : {
          ok: false,
          status: response.status === 404 ? "missing" : "unavailable",
          summary: response.status === 404
            ? "Mac 최종 gate 결과가 아직 없습니다."
            : `Mac 최종 gate 결과를 확인하지 못했습니다. HTTP ${response.status}`,
        };
  } catch {
    iosInstallSummaryCheck = {
      ok: false,
      status: "unavailable",
      summary: "Mac 최종 gate 결과를 확인하지 못했습니다.",
    };
  }
  updateInstallCompletionChecklist();
  if (manual && button) {
    button.textContent = iosInstallSummaryCheck?.ok
      ? "최종 gate 통과 확인됨"
      : "최종 gate 결과 새로고침";
    window.setTimeout(() => {
      button.textContent = "최종 gate 결과 새로고침";
    }, 1400);
  }
}

function updateInstallNextAction() {
  const box = document.getElementById("iosInstallNextAction");
  const badge = document.getElementById("iosInstallNextActionBadge");
  const summary = document.getElementById("iosInstallNextActionSummary");
  const command = document.getElementById("iosInstallNextActionCommand");
  const links = document.getElementById("iosInstallNextActionLinks");
  const installLink = document.getElementById("iosInstallNextActionInstallLink");
  const shortLink = document.getElementById("iosInstallNextActionShortLink");
  const qrLink = document.getElementById("iosInstallNextActionQrLink");
  const proofLink = document.getElementById("iosInstallNextActionProofLink");
  const sessionLink = document.getElementById("iosInstallNextActionSessionLink");
  const sessionQrLink = document.getElementById("iosInstallNextActionSessionQrLink");
  const scanLink = document.getElementById("iosInstallNextActionScanLink");
  const queue = document.getElementById("iosInstallNextActionQueue");
  const phoneStep = document.getElementById("iosInstallNextActionPhone");
  const macStep = document.getElementById("iosInstallNextActionMac");
  const sessionCheckBox = document.getElementById("iosInstallSessionCheck");
  const sessionCheckTitle = document.getElementById("iosInstallSessionCheckTitle");
  const sessionCheckDetail = document.getElementById("iosInstallSessionCheckDetail");
  const sessionCheckCopyButton = document.getElementById("iosInstallSessionCheckCopyButton");
  const sessionCheckScriptCopyButton = document.getElementById("iosInstallSessionCheckScriptCopyButton");
  const copyButton = document.getElementById("iosInstallNextActionCopyButton");
  const proofButton = document.getElementById("iosInstallNextActionProofButton");
  if (!box) return;

  const step = iosInstallNextStep;
  const phoneFirst = step?.phoneFirst === true;
  box.dataset.action = step?.action || "unknown";
  box.dataset.phoneFirst = phoneFirst ? "true" : "false";
  if (badge) badge.textContent = step ? (phoneFirst ? "iPhone 먼저" : step.action || "다음 행동") : "확인 전";
  const commandLabel = step?.nextCommandLabel || (phoneFirst ? "iPhone 증거 저장 후 실행할 Mac 명령" : "다음 Mac 명령");
  if (summary) {
    summary.textContent = step
      ? [step.title, step.phoneStep, step.nextCommandPrerequisite].filter(Boolean).join(" ")
      : "저장된 evidence를 읽어 다음 Mac/iPhone 행동을 확인합니다.";
  }
  const nextCommand = step?.nextTerminalCommand || step?.nextCommand || "";
  if (command) {
    command.hidden = !nextCommand;
    command.textContent = nextCommand;
    if (nextCommand) {
      command.setAttribute("aria-label", `${commandLabel}: ${nextCommand}`);
    } else {
      command.removeAttribute("aria-label");
    }
  }
  if (queue) {
    queue.hidden = !step;
  }
  if (phoneStep) {
    const phoneMessage = step?.phoneStep ||
      (phoneFirst
        ? "iPhone에서 홈 화면 설치와 증거 저장을 먼저 끝내세요."
        : "Mac evidence를 먼저 준비한 뒤 iPhone 설치를 진행하세요.");
    phoneStep.textContent = phoneMessage;
    phoneStep.parentElement.dataset.state = phoneFirst
      ? "active"
      : step?.action === "complete"
        ? "done"
        : "waiting";
  }
  if (macStep) {
    const macMessage = nextCommand
      ? `${commandLabel}: ${nextCommand}`
      : "현재 필요한 Mac evidence 명령이 없습니다.";
    macStep.textContent = macMessage;
    macStep.parentElement.dataset.state = phoneFirst
      ? "waiting"
      : step?.action === "complete"
        ? "done"
        : "active";
  }
  if (sessionCheckBox) {
    const sessionCheck = step?.sessionCheck || {};
    const sequenceCount = Number(sessionCheck.recoverySequenceCount || 0);
    const hasSessionCheck = Boolean(step && (sessionCheck.state || sessionCheck.path || sessionCheck.status || sessionCheck.recoveryUrl || sequenceCount));
    sessionCheckBox.hidden = !hasSessionCheck;
    sessionCheckBox.dataset.state = sessionCheck.ok ? "ok" : "todo";
    if (sessionCheckTitle) {
      sessionCheckTitle.textContent = sessionCheck.ok
        ? "세션 복구 evidence 준비됨"
        : "세션 복구 evidence 필요";
    }
    if (sessionCheckDetail) {
      const repairCommand = sessionCheck.recommendedCommand || IOS_INSTALL_SESSION_EVIDENCE_COMMAND;
      const trigger = sessionCheck.recoveryTriggerField
        ? `${sessionCheck.recoveryTriggerField}=${sessionCheck.recoveryTriggerValue ? "true" : "false"}`
        : "appShellUpdateNeeded=true";
      sessionCheckDetail.textContent = sessionCheck.ok
        ? `${trigger}, 복구 ${sequenceCount || 0}단계, final gate ${sessionCheck.finalGateCommand || "확인됨"}`
        : `iPhone 설치 전에 ${repairCommand} 실행이 필요합니다.`;
    }
    if (sessionCheckCopyButton) {
      const shouldShowCopy = hasSessionCheck && !sessionCheck.ok;
      const repairCommand = sessionCheck.recommendedCommand || IOS_INSTALL_SESSION_EVIDENCE_COMMAND;
      sessionCheckCopyButton.hidden = !shouldShowCopy;
      sessionCheckCopyButton.textContent = shouldShowCopy ? "repo root 명령 복사" : "세션 evidence 준비됨";
      sessionCheckCopyButton.setAttribute("aria-label", "repo root에서 실행할 iOS install session evidence 명령 복사");
      sessionCheckCopyButton.dataset.iosInstallSessionEvidenceCommand = repairCommand;
    }
    if (sessionCheckScriptCopyButton) {
      const shouldShowScriptCopy = hasSessionCheck && !sessionCheck.ok;
      const repairScript = sessionCheck.recommendedNpmScript || IOS_INSTALL_SESSION_EVIDENCE_NPM_SCRIPT;
      sessionCheckScriptCopyButton.hidden = !shouldShowScriptCopy;
      sessionCheckScriptCopyButton.textContent = "npm script 복사";
      sessionCheckScriptCopyButton.setAttribute("aria-label", "webapp 디렉터리에서 실행할 iOS install session evidence npm script 복사");
      sessionCheckScriptCopyButton.dataset.iosInstallSessionEvidenceNpmScript = repairScript;
    }
  }
  if (copyButton) {
    copyButton.hidden = !nextCommand;
    copyButton.textContent = step?.phoneFirst ? "설치 후 최종 gate 명령 복사" : "다음 명령 복사";
    if (nextCommand) {
      copyButton.setAttribute("aria-label", commandLabel);
    } else {
      copyButton.removeAttribute("aria-label");
    }
  }
  if (proofButton) {
    proofButton.hidden = !phoneFirst;
  }
  const target = {
    installUrl: preferredInstallUrl(),
    shortInstallUrl: preferredShortInstallUrl(),
    qrUrl: preferredInstallQrUrl(),
    proofSaveUrl: preferredProofSaveUrl(),
    sessionUrl: preferredInstallSessionUrl(),
    sessionQrUrl: preferredInstallSessionQrUrl(),
    nextActionScanUrl: preferredInstallNextActionScanUrl(),
    ...(step?.installTarget || {}),
  };
  const showLinks = Boolean(target.installUrl || target.shortInstallUrl || target.qrUrl || target.proofSaveUrl || target.sessionUrl || target.sessionQrUrl || target.nextActionScanUrl);
  if (links) links.hidden = !showLinks;
  if (installLink && target.installUrl) installLink.href = target.installUrl;
  if (shortLink && target.shortInstallUrl) shortLink.href = target.shortInstallUrl;
  if (qrLink && target.qrUrl) qrLink.href = target.qrUrl;
  if (proofLink && target.proofSaveUrl) proofLink.href = target.proofSaveUrl;
  if (sessionLink && target.sessionUrl) sessionLink.href = target.sessionUrl;
  if (sessionQrLink && target.sessionQrUrl) {
    sessionQrLink.href = target.sessionQrUrl;
    sessionQrLink.title = target.sessionUrl || target.sessionQrUrl;
  }
  if (scanLink && target.nextActionScanUrl) scanLink.href = target.nextActionScanUrl;
  updateInstallSessionHandoffLinks();
}

async function fetchInstallNextStep() {
  const path = "/api/ios-install-next";
  if (typeof api === "function") {
    return api(path, { headers: { Accept: "application/json" } });
  }
  return fetch(path, {
    headers: typeof withAccessKeyHeaders === "function"
      ? withAccessKeyHeaders({ Accept: "application/json" })
      : { Accept: "application/json" },
  });
}

async function refreshInstallNextStepStatus(manual = false) {
  const button = document.getElementById("iosInstallNextActionRefreshButton");
  if (manual && button) button.textContent = "다음 행동 확인 중";
  try {
    const response = await fetchInstallNextStep();
    iosInstallNextStep = response.ok
      ? await response.json()
      : {
          action: "unavailable",
          title: `다음 행동을 확인하지 못했습니다. HTTP ${response.status}`,
          phoneStep: "서버 실행 상태와 접근 키를 확인하세요.",
        };
  } catch {
    iosInstallNextStep = {
      action: "unavailable",
      title: "다음 행동을 확인하지 못했습니다.",
      phoneStep: "서버 실행 상태를 확인하세요.",
    };
  }
  updateInstallNextAction();
  if (manual && button) {
    button.textContent = "다음 행동 새로고침";
  }
}

function bindInstallNextActionButtons() {
  const refreshButton = document.getElementById("iosInstallNextActionRefreshButton");
  const copyButton = document.getElementById("iosInstallNextActionCopyButton");
  const proofButton = document.getElementById("iosInstallNextActionProofButton");
  const sessionCheckCopyButton = document.getElementById("iosInstallSessionCheckCopyButton");
  const sessionCheckScriptCopyButton = document.getElementById("iosInstallSessionCheckScriptCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (refreshButton && refreshButton.dataset.installNextRefreshBound !== "true") {
    refreshButton.dataset.installNextRefreshBound = "true";
    refreshButton.addEventListener("click", () => refreshInstallNextStepStatus(true));
  }
  if (copyButton && copyButton.dataset.installNextCopyBound !== "true") {
    copyButton.dataset.installNextCopyBound = "true";
    copyButton.addEventListener("click", async () => {
      const nextCommand = iosInstallNextStep?.nextTerminalCommand || iosInstallNextStep?.nextCommand || "";
      if (!nextCommand) return;
      const commandLabel = iosInstallNextStep?.nextCommandLabel || (iosInstallNextStep?.phoneFirst ? "iPhone 증거 저장 후 실행할 Mac 명령" : "현재 다음 행동 명령");
      try {
        await navigator.clipboard.writeText(nextCommand);
        if (status) status.textContent = `${commandLabel}을 복사했습니다.`;
      } catch {
        window.prompt(`${commandLabel}을 복사하세요.`, nextCommand);
      }
    });
  }
  if (sessionCheckCopyButton && sessionCheckCopyButton.dataset.installSessionCheckCopyBound !== "true") {
    sessionCheckCopyButton.dataset.installSessionCheckCopyBound = "true";
    sessionCheckCopyButton.addEventListener("click", async () => {
      const repairCommand = sessionCheckCopyButton.dataset.iosInstallSessionEvidenceCommand || IOS_INSTALL_SESSION_EVIDENCE_COMMAND;
      await copyWithButtonFeedback(
        sessionCheckCopyButton,
        repairCommand,
        "세션 evidence 명령을 복사했습니다."
      );
    });
  }
  if (sessionCheckScriptCopyButton && sessionCheckScriptCopyButton.dataset.installSessionCheckScriptCopyBound !== "true") {
    sessionCheckScriptCopyButton.dataset.installSessionCheckScriptCopyBound = "true";
    sessionCheckScriptCopyButton.addEventListener("click", async () => {
      const repairScript = sessionCheckScriptCopyButton.dataset.iosInstallSessionEvidenceNpmScript || IOS_INSTALL_SESSION_EVIDENCE_NPM_SCRIPT;
      await copyWithButtonFeedback(
        sessionCheckScriptCopyButton,
        repairScript,
        "세션 evidence npm script를 복사했습니다."
      );
    });
  }
  if (proofButton && proofButton.dataset.installNextProofBound !== "true") {
    proofButton.dataset.installNextProofBound = "true";
    proofButton.addEventListener("click", () => {
      const target = isStandaloneDisplay()
        ? document.getElementById("iosInstallProof")
        : document.getElementById("iosInstallFastPathTitle");
      const scrollTarget = target?.closest?.("section, div, details") || target;
      if (scrollTarget?.scrollIntoView) {
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (status) {
        status.textContent = isStandaloneDisplay()
          ? "설치 증거 저장 버튼을 누르세요."
          : "Safari 공유 버튼 > 홈 화면에 추가 후 Travel 아이콘으로 실행하세요.";
      }
    });
  }
}

function bindInstallCompletionRefreshButton() {
  const button = document.getElementById("iosInstallCompletionRefreshButton");
  if (!button || button.dataset.installCompletionRefreshBound === "true") return;
  button.dataset.installCompletionRefreshBound = "true";
  button.addEventListener("click", () => refreshInstallSummaryCheckStatus(true));
}

function bindProtectedInstallUrlCopyButton() {
  const button = document.getElementById("iosProtectedInstallUrlCopyButton");
  const filledButton = document.getElementById("iosProtectedInstallFilledUrlCopyButton");
  const filledShareButton = document.getElementById("iosProtectedInstallFilledUrlShareButton");
  const filledSmsButton = document.getElementById("iosProtectedInstallFilledUrlSmsButton");
  const filledMailButton = document.getElementById("iosProtectedInstallFilledUrlMailButton");
  const revealButton = document.getElementById("iosProtectedInstallAccessKeyRevealButton");
  const clearButton = document.getElementById("iosProtectedInstallAccessKeyClearButton");
  const keyInput = document.getElementById("iosProtectedInstallAccessKeyInput");
  const input = document.getElementById("iosProtectedInstallUrlInput");
  const status = document.getElementById("iosInstallStatus");
  const timerLabel = document.getElementById("iosProtectedInstallAccessKeyTimer");
  const resetProtectedKeyInput = (message = "") => {
    if (protectedAccessKeyClearTimer) {
      window.clearTimeout(protectedAccessKeyClearTimer);
      protectedAccessKeyClearTimer = 0;
    }
    if (keyInput) {
      keyInput.value = "";
      keyInput.type = "password";
    }
    if (revealButton) revealButton.textContent = "임시 키 보기";
    if (timerLabel) timerLabel.textContent = "입력 후 5분이 지나면 자동으로 비웁니다.";
    if (message && status) status.textContent = message;
  };
  const scheduleProtectedKeyAutoClear = () => {
    if (!keyInput || !keyInput.value) {
      resetProtectedKeyInput();
      return;
    }
    if (protectedAccessKeyClearTimer) {
      window.clearTimeout(protectedAccessKeyClearTimer);
    }
    if (timerLabel) timerLabel.textContent = "입력 후 5분 뒤 자동으로 비웁니다.";
    protectedAccessKeyClearTimer = window.setTimeout(() => {
      resetProtectedKeyInput("임시 접근 키 입력을 5분 후 자동으로 비웠습니다. 저장하거나 서버로 보내지 않았습니다.");
    }, PROTECTED_ACCESS_KEY_AUTO_CLEAR_MS);
  };
  const completedProtectedUrl = (emptyMessage) => {
    const completedUrl = protectedInstallUrlWithAccessKey(keyInput?.value || "");
    if (!completedUrl) {
      keyInput?.focus();
      if (status) status.textContent = emptyMessage;
      return "";
    }
    return completedUrl;
  };
  if (filledShareButton && typeof navigator.share === "function") {
    filledShareButton.hidden = false;
  }
  if (keyInput && keyInput.dataset.protectedInstallAutoClearBound !== "true") {
    keyInput.dataset.protectedInstallAutoClearBound = "true";
    keyInput.addEventListener("input", () => {
      clearIosInstallStatusNextLink();
      scheduleProtectedKeyAutoClear();
    });
  }
  if (revealButton && revealButton.dataset.protectedInstallRevealBound !== "true") {
    revealButton.dataset.protectedInstallRevealBound = "true";
    revealButton.addEventListener("click", () => {
      if (!keyInput) return;
      const showing = keyInput.type === "text";
      keyInput.type = showing ? "password" : "text";
      revealButton.textContent = showing ? "임시 키 보기" : "임시 키 숨기기";
      clearIosInstallStatusNextLink();
      if (status) {
        status.textContent = showing
          ? "임시 접근 키를 다시 숨겼습니다."
          : "임시 접근 키를 화면에 표시했습니다. 주변에 보이지 않게 주의하세요.";
      }
    });
  }
  if (clearButton && clearButton.dataset.protectedInstallClearBound !== "true") {
    clearButton.dataset.protectedInstallClearBound = "true";
    clearButton.addEventListener("click", () => {
      clearIosInstallStatusNextLink();
      resetProtectedKeyInput("임시 접근 키 입력을 비웠습니다. 저장하거나 서버로 보내지 않았습니다.");
      keyInput?.focus();
    });
  }
  if (button && button.dataset.protectedInstallCopyBound !== "true") {
    button.dataset.protectedInstallCopyBound = "true";
    button.addEventListener("click", async () => {
      const template = input?.value || protectedInstallUrlTemplate();
      if (!template) return;
      try {
        await navigator.clipboard.writeText(template);
        clearIosInstallStatusNextLink();
        if (status) status.textContent = "보호 설치 주소 템플릿을 복사했습니다. placeholder만 실제 접근 키로 바꿔 iPhone에 보내세요.";
      } catch {
        clearIosInstallStatusNextLink();
        window.prompt("보호 설치 주소 템플릿을 복사하세요.", template);
      }
    });
  }
  if (filledButton && filledButton.dataset.protectedInstallFilledCopyBound !== "true") {
    filledButton.dataset.protectedInstallFilledCopyBound = "true";
    filledButton.addEventListener("click", async () => {
      const completedUrl = completedProtectedUrl("접근 키를 입력하면 키 포함 설치 주소를 만들 수 있습니다.");
      if (!completedUrl) return;
      try {
        await navigator.clipboard.writeText(completedUrl);
        clearIosInstallStatusNextLink();
        resetProtectedKeyInput("키 포함 설치 주소를 복사했습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
      } catch {
        clearIosInstallStatusNextLink();
        window.prompt("키 포함 설치 주소를 복사하세요.", completedUrl);
        resetProtectedKeyInput("키 포함 설치 주소 prompt를 닫았습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
      }
    });
  }
  if (filledShareButton && filledShareButton.dataset.protectedInstallFilledShareBound !== "true") {
    filledShareButton.dataset.protectedInstallFilledShareBound = "true";
    filledShareButton.addEventListener("click", async () => {
      const completedUrl = completedProtectedUrl("접근 키를 입력하면 키 포함 설치 주소를 공유할 수 있습니다.");
      if (!completedUrl) return;
      if (typeof navigator.share !== "function") {
        clearIosInstallStatusNextLink();
        window.prompt("키 포함 설치 주소를 공유하세요.", completedUrl);
        resetProtectedKeyInput("키 포함 설치 주소 prompt를 닫았습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
        return;
      }
      try {
        await navigator.share({
          title: "Travel Planner iPhone 설치",
          text: "iPhone Safari에서 열고 홈 화면에 추가하세요.",
          url: completedUrl,
        });
        clearIosInstallStatusNextLink();
        resetProtectedKeyInput("키 포함 설치 주소 공유를 시작했습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
      } catch (error) {
        if (error?.name !== "AbortError" && status) {
          clearIosInstallStatusNextLink();
          status.textContent = "공유를 완료하지 못했습니다. 키 포함 설치 주소 복사를 사용하세요.";
        }
      }
    });
  }
  if (filledSmsButton && filledSmsButton.dataset.protectedInstallFilledSmsBound !== "true") {
    filledSmsButton.dataset.protectedInstallFilledSmsBound = "true";
    filledSmsButton.addEventListener("click", () => {
      const completedUrl = completedProtectedUrl("접근 키를 입력하면 키 포함 설치 주소를 문자로 보낼 수 있습니다.");
      if (!completedUrl) return;
      const message = installShareText(completedUrl);
      clearIosInstallStatusNextLink();
      resetProtectedKeyInput("키 포함 설치 주소를 문자 앱으로 넘겼습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
      window.location.href = `sms:&body=${encodeURIComponent(message)}`;
    });
  }
  if (filledMailButton && filledMailButton.dataset.protectedInstallFilledMailBound !== "true") {
    filledMailButton.dataset.protectedInstallFilledMailBound = "true";
    filledMailButton.addEventListener("click", () => {
      const completedUrl = completedProtectedUrl("접근 키를 입력하면 키 포함 설치 주소를 메일로 보낼 수 있습니다.");
      if (!completedUrl) return;
      const message = installShareText(completedUrl);
      clearIosInstallStatusNextLink();
      resetProtectedKeyInput("키 포함 설치 주소를 메일 앱으로 넘겼습니다. 입력한 키는 저장하거나 서버로 보내지 않았습니다.");
      window.location.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치")}&body=${encodeURIComponent(message)}`;
    });
  }
}

function updateInstallUrlHint() {
  const hint = document.getElementById("iosInstallUrlHint");
  const label = document.getElementById("iosInstallUrlLabel");
  const input = document.getElementById("iosInstallUrlInput");
  if (!hint) return;

  if (isStandaloneDisplay()) {
    hint.hidden = true;
    return;
  }

  hint.hidden = false;
  if (input) input.value = preferredInstallUrl();

  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.[0]) {
    if (label) label.textContent = "같은 Wi-Fi에서 iPhone으로 열 주소";
    return;
  }

  if (isLocalInstallUrl()) {
    if (label) label.textContent = "iPhone에서 열 수 있는 Mac IP 또는 HTTPS 주소가 필요합니다";
    return;
  }

  if (label) label.textContent = "iPhone에서 열 주소";
}

function updateInstallShortUrlHint() {
  const hint = document.getElementById("iosInstallShortUrlHint");
  const label = document.getElementById("iosInstallShortUrlLabel");
  const input = document.getElementById("iosInstallShortUrlInput");
  const host = document.getElementById("iosInstallShortUrlHost");
  const path = document.getElementById("iosInstallShortUrlPath");
  const decision = document.getElementById("iosInstallShortUrlDecision");
  const alternates = document.getElementById("iosInstallShortUrlAlternates");
  const resetButton = document.getElementById("iosInstallResetShortUrlButton");
  if (!hint) return;

  if (isStandaloneDisplay()) {
    hint.hidden = true;
    return;
  }

  hint.hidden = false;
  if (input) input.value = preferredShortInstallUrl();
  if (resetButton) resetButton.hidden = !selectedShortInstallUrl;
  const parts = preferredShortInstallUrlParts();
  if (host) host.textContent = parts.host;
  if (path) path.textContent = parts.path;
  const choices = shortInstallUrlChoices();
  const activeShortUrl = preferredShortInstallUrl();
  if (decision) {
    const sourceLabel = selectedShortInstallUrl ? "선택한 후보" : "추천 후보";
    const switchHint = choices.length > 1 ? " 다른 후보를 누르면 QR과 proof-save 링크도 함께 바뀝니다." : "";
    decision.textContent = `${sourceLabel}를 짧은 주소 복사, QR, proof-save 링크에 사용합니다.${switchHint}`;
  }
  if (alternates) {
    alternates.hidden = choices.length <= 1;
    alternates.replaceChildren(...choices.map((url, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.shortInstallUrl = url;
      button.setAttribute("aria-pressed", url === activeShortUrl ? "true" : "false");
      button.textContent = url === activeShortUrl ? "선택됨" : index === 0 ? "추천 짧은 주소" : `후보 ${index + 1}`;
      button.title = url;
      button.addEventListener("click", async () => {
        saveSelectedShortInstallUrl(url);
        updateInstallShortUrlHint();
        try {
          await navigator.clipboard.writeText(url);
          const status = document.getElementById("iosInstallStatus");
          if (status) status.textContent = installUrlCopyFeedback(url, "설치 주소");
        } catch {
          window.prompt(installUrlPromptMessage(url, "짧은 설치 주소"), url);
        }
      });
      return button;
    }));
  }

  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.[0]) {
    if (label) label.textContent = "같은 Wi-Fi에서 iPhone에 입력할 짧은 주소";
    return;
  }

  if (label) label.textContent = "iPhone 입력용 짧은 주소";
}

function protectedInstallUrlTemplate() {
  return iosInstallInfo?.protectedRecommendedShortInstallUrlTemplate ||
    iosInstallInfo?.protectedRecommendedInstallUrlTemplate ||
    "";
}

function protectedInstallUrlWithAccessKey(accessKey) {
  const template = protectedInstallUrlTemplate();
  const key = (accessKey || "").trim();
  if (!template || !key) return "";

  try {
    const url = new URL(template);
    let replaced = false;
    for (const [name, value] of url.searchParams.entries()) {
      if (value === PROTECTED_ACCESS_KEY_PLACEHOLDER) {
        url.searchParams.set(name, key);
        replaced = true;
      }
    }
    if (replaced) return url.toString();
  } catch {
    // Fall back to a narrow placeholder replacement below.
  }

  return template.replace(PROTECTED_ACCESS_KEY_PLACEHOLDER, encodeURIComponent(key));
}

function updateProtectedInstallUrlHint() {
  const hint = document.getElementById("iosProtectedInstallUrlHint");
  const input = document.getElementById("iosProtectedInstallUrlInput");
  if (!hint) return;

  const template = protectedInstallUrlTemplate();
  hint.hidden = isStandaloneDisplay() || !template;
  if (input) input.value = template;
}

function preferredInstallQrTargetUrl() {
  return selectedShortInstallUrl || iosInstallInfo?.installQrTargetUrl || preferredInstallUrl();
}

function updateInstallQrHint() {
  const box = document.getElementById("iosInstallQr");
  const image = document.getElementById("iosInstallQrImage");
  const link = document.getElementById("iosInstallQrLink");
  const targetSummary = document.getElementById("iosInstallQrTargetSummary");
  const targetCopyButton = document.getElementById("iosInstallQrTargetCopyButton");
  if (!box) return;

  const qrUrl = preferredInstallQrUrl();
  box.hidden = isStandaloneDisplay() || !qrUrl;
  if (box.hidden) return;

  const target = preferredInstallQrTargetUrl();
  if (targetSummary) {
    const sourceLabel = selectedShortInstallUrl ? "선택한 짧은 주소" : "추천 설치 주소";
    targetSummary.textContent = `QR target: ${sourceLabel} - ${target}`;
    targetSummary.title = target;
  }
  if (targetCopyButton) {
    targetCopyButton.title = `QR target 복사: ${target}`;
    if (targetCopyButton.dataset.installQrTargetCopyBound !== "true") {
      targetCopyButton.dataset.installQrTargetCopyBound = "true";
      targetCopyButton.addEventListener("click", async () => {
        const currentTarget = preferredInstallQrTargetUrl();
        const status = document.getElementById("iosInstallStatus");
        try {
          await navigator.clipboard.writeText(currentTarget);
          if (status) status.textContent = installUrlCopyFeedback(currentTarget, "QR target 주소");
        } catch {
          window.prompt(installUrlPromptMessage(currentTarget, "QR target 주소"), currentTarget);
        }
      });
    }
  }
  if (image) {
    image.src = qrUrl;
    image.alt = `iPhone Safari에서 열 Travel Planner 설치 QR 코드: ${target}`;
  }
  if (link) {
    link.href = qrUrl;
    link.title = target;
  }
}

function updateIosInstallCard() {
  const card = document.getElementById("iosInstallCard");
  const status = document.getElementById("iosInstallStatus");
  const badge = document.getElementById("iosInstallBadge");
  if (!card || !status || !badge) return;
  bindIosInstallOpenUrlCard();
  const title = document.getElementById("iosInstallTitle");
  const eyebrow = card.querySelector(".eyebrow");
  const standaloneNextAction = document.getElementById("iosStandaloneNextAction");
  const standaloneNewPlanLink = document.getElementById("iosStandaloneNewPlanLink");
  const standaloneCompletionStatusLink = document.getElementById("iosStandaloneCompletionStatusLink");
  const standaloneNextActionStatus = document.getElementById("iosStandaloneNextActionStatus");
  const setInstallCardCopy = (heading, eyebrowLabel) => {
    if (title) title.textContent = heading;
    if (eyebrow) eyebrow.textContent = eyebrowLabel;
    card.dataset.installHeading = heading;
    card.dataset.installEyebrow = eyebrowLabel;
  };
  const setStandaloneNextActionVisible = (visible) => {
    if (standaloneNextAction) {
      standaloneNextAction.hidden = !visible;
      standaloneNextAction.dataset.visible = visible ? "true" : "false";
    }
    card.dataset.standaloneNextActionVisible = visible ? "true" : "false";
  };
  const bindStandaloneNewPlanLink = () => {
    if (!standaloneNewPlanLink || standaloneNewPlanLink.dataset.bound === "true") return;
    standaloneNewPlanLink.dataset.bound = "true";
    standaloneNewPlanLink.addEventListener("click", (event) => {
      event.preventDefault();
      const clickedAt = new Date().toISOString();
      const route = "#planForm";
      const label = standaloneNewPlanLink.textContent.trim() || "새 플랜 시작";
      card.dataset.standaloneNextActionClicked = "true";
      card.dataset.standaloneNextActionClickedAt = clickedAt;
      card.dataset.standaloneNextActionClickedRoute = route;
      card.dataset.standaloneNextActionClickedLabel = label;
      if (standaloneNextAction) {
        standaloneNextAction.dataset.clicked = "true";
        standaloneNextAction.dataset.clickedAt = clickedAt;
      }
      const form = document.getElementById("planForm");
      const destinationInput = form?.querySelector('[name="destination"]');
      if (standaloneNextActionStatus) {
        standaloneNextActionStatus.textContent = "새 여행 플랜 입력으로 이동했습니다.";
      }
      window.location.hash = "planForm";
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      card.dataset.standaloneNextActionReducedMotion = prefersReducedMotion ? "true" : "false";
      if (form) {
        form.classList.add("install-standalone-next-action-focus");
        form.scrollIntoView({ block: "start", behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
      if (destinationInput) {
        destinationInput.focus({ preventScroll: true });
        card.dataset.standaloneNextActionFocusTarget = "destination";
        card.dataset.standaloneNextActionFocusApplied = document.activeElement === destinationInput ? "true" : "false";
      } else if (form) {
        form.setAttribute("tabindex", "-1");
        form.focus({ preventScroll: true });
        card.dataset.standaloneNextActionFocusTarget = "planForm";
        card.dataset.standaloneNextActionFocusApplied = document.activeElement === form ? "true" : "false";
      } else {
        card.dataset.standaloneNextActionFocusTarget = "missing";
        card.dataset.standaloneNextActionFocusApplied = "false";
      }
      try {
        window.sessionStorage.setItem("travel-planner:ios-standalone-next-action:v1", JSON.stringify({
          schemaVersion: 1,
          action: "new-plan",
          clickedAt,
          route,
          label,
          focusTarget: card.dataset.standaloneNextActionFocusTarget || "",
          focusApplied: card.dataset.standaloneNextActionFocusApplied || "",
          reducedMotion: card.dataset.standaloneNextActionReducedMotion || "",
          statusFeedback: standaloneNextActionStatus?.textContent.trim() || "",
        }));
      } catch {
        // Ignore storage failures; the CTA already moved focus in the current page.
      }
      window.setTimeout(() => {
        form?.classList.remove("install-standalone-next-action-focus");
      }, 1800);
    });
  };
  const updateStandaloneSubmitDock = (visible) => {
    const existingDock = document.getElementById("iosStandaloneSubmitDock");
    if (!visible) {
      existingDock?.remove();
      document.body.classList.remove("ios-standalone-submit-dock-visible");
      card.dataset.standaloneSubmitDockVisible = "false";
      return;
    }
    const form = document.getElementById("planForm");
    const submitButton = document.getElementById("planFormSubmitButton") || form?.querySelector('button[type="submit"], input[type="submit"]');
    if (!form || !submitButton) {
      existingDock?.remove();
      document.body.classList.remove("ios-standalone-submit-dock-visible");
      card.dataset.standaloneSubmitDockVisible = "missing";
      card.dataset.standaloneSubmitDockState = "missing-submit";
      return;
    }
    let dock = existingDock;
    let quickButton = document.getElementById("iosStandaloneSubmitDockButton");
    let dockStatus = document.getElementById("iosStandaloneSubmitDockStatus");
    if (!dock) {
      dock = document.createElement("aside");
      dock.id = "iosStandaloneSubmitDock";
      dock.className = "ios-standalone-submit-dock";
      dock.setAttribute("aria-label", "Home Screen 빠른 플랜 생성");
      dock.setAttribute("role", "region");
      quickButton = document.createElement("button");
      quickButton.id = "iosStandaloneSubmitDockButton";
      quickButton.type = "button";
      quickButton.className = "ios-standalone-submit-dock-button";
      quickButton.textContent = "플랜 만들기";
      dockStatus = document.createElement("span");
      dockStatus.id = "iosStandaloneSubmitDockStatus";
      dockStatus.className = "ios-standalone-submit-dock-status";
      dockStatus.setAttribute("role", "status");
      dockStatus.setAttribute("aria-live", "polite");
      dockStatus.textContent = "입력을 마치면 바로 생성할 수 있습니다.";
      dock.append(quickButton, dockStatus);
      document.body.append(dock);
    }
    dock.hidden = false;
    const syncDockState = () => {
      const busy = submitButton.getAttribute("aria-busy") === "true";
      const disabled = submitButton.disabled ? "true" : "false";
      dock.dataset.state = busy ? "busy" : submitButton.disabled ? "disabled" : "ready";
      dock.dataset.submitBusy = busy ? "true" : "false";
      dock.dataset.submitDisabled = disabled;
      dock.dataset.syncedAt = new Date().toISOString();
      card.dataset.standaloneSubmitDockState = dock.dataset.state;
      const submitResult = submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitResult || "";
      if (dock.dataset.submitPending === "true" && !busy && submitResult) {
        dock.dataset.submitPending = "false";
        dock.dataset.submitFinished = "true";
        dock.dataset.submitFinishedAt = submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitResultAt || new Date().toISOString();
        dock.dataset.submitFinishedResult = submitResult;
        dock.dataset.submitFinishedSource = "original-submit-button";
        dock.dataset.submitStatusFeedback = submitResult === "success"
          ? "플랜 생성 요청이 완료됐습니다."
          : "플랜 생성 요청이 완료되지 않았습니다.";
      }
      quickButton.disabled = submitButton.disabled || busy;
      quickButton.setAttribute("aria-busy", busy ? "true" : "false");
      if (busy) {
        dockStatus.textContent = "플랜을 생성하는 중입니다.";
      } else if (submitButton.disabled) {
        dockStatus.textContent = "플랜 생성 버튼이 아직 준비되지 않았습니다.";
      } else if (!dock.dataset.clicked) {
        dockStatus.textContent = "입력을 마치면 바로 생성할 수 있습니다.";
      }
    };
    syncDockState();
    card.dataset.standaloneSubmitDockVisible = "true";
    document.body.classList.add("ios-standalone-submit-dock-visible");
    if (dock.dataset.observed !== "true" && typeof MutationObserver === "function") {
      const observer = new MutationObserver(syncDockState);
      observer.observe(submitButton, {
        attributes: true,
        attributeFilter: [
          "aria-busy",
          "disabled",
          "data-ios-home-dock-plan-submit-button-submit-result",
          "data-ios-home-dock-plan-submit-button-submit-result-at",
        ],
      });
      dock.dataset.observed = "true";
      dock.dataset.submitResultObserved = "true";
      dock.dataset.submitResultObserverAttrs = "result,result-at";
    } else if (dock.dataset.observed !== "true") {
      dock.dataset.observed = "unsupported";
      dock.dataset.submitResultObserved = "unsupported";
    }
    const markInvalidDockField = (field, source) => {
      const fieldName = field?.getAttribute?.("name") || field?.id || field?.tagName?.toLowerCase?.() || "unknown";
      const feedback = "필수 입력을 확인하세요.";
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      dock.dataset.invalid = "true";
      dock.dataset.invalidAt = new Date().toISOString();
      dock.dataset.invalidFieldName = fieldName;
      dock.dataset.invalidSource = source;
      dock.dataset.invalidFeedback = feedback;
      dock.dataset.invalidFocusTarget = fieldName;
      dock.dataset.invalidReducedMotion = prefersReducedMotion ? "true" : "false";
      dock.dataset.invalidCleared = "false";
      dock.dataset.invalidRemaining = "true";
      dock.dataset.invalidRemainingFieldName = fieldName;
      dock.dataset.invalidRecoveryNextAction = "";
      dock.dataset.invalidRecoveryReadyAt = "";
      dock.dataset.clickResult = "invalid";
      dockStatus.textContent = feedback;
  document.getElementById("iosStandaloneSubmitDockInvalidInline")?.remove();
  const inlineTarget = field?.closest?.("label") || field?.parentElement;
  if (inlineTarget) {
    const inlineHint = document.createElement("p");
    inlineHint.id = "iosStandaloneSubmitDockInvalidInline";
    inlineHint.className = "ios-standalone-submit-dock-invalid-inline";
    inlineHint.setAttribute("role", "status");
    inlineHint.setAttribute("aria-live", "polite");
    inlineHint.textContent = feedback;
    inlineTarget.append(inlineHint);
    dock.dataset.invalidInlineVisible = "true";
    dock.dataset.invalidInlineFieldName = fieldName;
    dock.dataset.invalidInlineFeedback = feedback;
    dock.dataset.invalidInlineShownAt = new Date().toISOString();
    const clearInlineHint = () => {
      inlineHint.remove();
      dock.dataset.invalidInlineVisible = "false";
      dock.dataset.invalidInlineClearedAt = new Date().toISOString();
    };
    field?.addEventListener?.("input", clearInlineHint, { once: true });
    field?.addEventListener?.("change", clearInlineHint, { once: true });
  } else {
    dock.dataset.invalidInlineVisible = "false";
    dock.dataset.invalidInlineFieldName = fieldName;
  }
      if (field?.scrollIntoView) {
        field.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
      field?.classList?.add("ios-standalone-submit-dock-invalid-focus");
      field?.focus?.({ preventScroll: true });
      dock.dataset.invalidFocusApplied = document.activeElement === field ? "true" : "false";
      dock.dataset.invalidFocusedAt = new Date().toISOString();
      window.setTimeout(() => {
        field?.classList?.remove("ios-standalone-submit-dock-invalid-focus");
      }, 1800);
    };
    const clearInvalidDockIfReady = (source) => {
      if (dock.dataset.invalid !== "true") return;
      const remainingInvalid = form.querySelector(":invalid");
      if (remainingInvalid) {
        dock.dataset.invalidRemaining = "true";
        dock.dataset.invalidRemainingFieldName = remainingInvalid.getAttribute("name") || remainingInvalid.id || remainingInvalid.tagName.toLowerCase();
        return;
      }
      const clearedAt = new Date().toISOString();
      dock.dataset.invalid = "false";
      dock.dataset.invalidCleared = "true";
      dock.dataset.invalidClearedAt = clearedAt;
      dock.dataset.invalidClearSource = source;
      dock.dataset.invalidRemaining = "false";
      dock.dataset.invalidRemainingFieldName = "";
      dock.dataset.invalidRecoveryNextAction = "tap-submit-dock";
      dock.dataset.invalidRecoveryReadyAt = clearedAt;
      dock.dataset.invalidFieldName = "";
      dock.dataset.invalidSource = "";
      dock.dataset.invalidFeedback = "";
      dock.dataset.invalidFocusTarget = "";
      dock.dataset.invalidFocusApplied = "";
      dockStatus.textContent = "필수 입력 확인이 해소됐습니다. 하단 버튼으로 첫 플랜을 만들 수 있습니다.";
    };
    const setKeyboardDockHidden = (hidden, focusName = "") => {
      if (!document.body.contains(dock)) return;
      dock.dataset.keyboardHidden = hidden ? "true" : "false";
      dock.dataset.keyboardFocusName = focusName;
      if (hidden) {
        dock.dataset.keyboardHiddenAt = new Date().toISOString();
        dock.classList.add("ios-standalone-submit-dock-keyboard-hidden");
        document.body.classList.remove("ios-standalone-submit-dock-visible");
      } else {
        dock.dataset.keyboardRestoredAt = new Date().toISOString();
        dock.classList.remove("ios-standalone-submit-dock-keyboard-hidden");
        document.body.classList.add("ios-standalone-submit-dock-visible");
      }
    };
    if (dock.dataset.invalidBound !== "true") {
      dock.dataset.invalidBound = "true";
      form.addEventListener("invalid", (event) => {
        markInvalidDockField(event.target, "invalid-event");
      }, true);
    }
    if (dock.dataset.invalidRecoveryBound !== "true") {
      dock.dataset.invalidRecoveryBound = "true";
      form.addEventListener("input", () => clearInvalidDockIfReady("input"));
      form.addEventListener("change", () => clearInvalidDockIfReady("change"));
    }
    if (dock.dataset.keyboardBound !== "true") {
      dock.dataset.keyboardBound = "true";
      form.addEventListener("focusin", (event) => {
        const target = event.target;
        if (target?.matches?.("input, textarea, select")) {
          setKeyboardDockHidden(true, target.getAttribute("name") || target.id || target.tagName.toLowerCase());
        }
      });
      form.addEventListener("focusout", () => {
        window.setTimeout(() => {
          const active = document.activeElement;
          if (!active?.matches?.("input, textarea, select") || !form.contains(active)) {
            setKeyboardDockHidden(false);
          }
        }, 80);
      });
    }
    if (quickButton.dataset.bound !== "true") {
      quickButton.dataset.bound = "true";
      quickButton.addEventListener("click", () => {
        const clickedAt = new Date().toISOString();
        const currentSubmitButton = document.getElementById("planFormSubmitButton") || document.getElementById("planForm")?.querySelector('button[type="submit"], input[type="submit"]');
        dock.dataset.clicked = "true";
        dock.dataset.clickedAt = clickedAt;
        if (!currentSubmitButton || currentSubmitButton.disabled || currentSubmitButton.getAttribute("aria-busy") === "true") {
          dock.dataset.clickResult = "blocked";
          dock.dataset.submitPending = "false";
          dock.dataset.submitPendingSource = "blocked";
          dockStatus.textContent = "플랜 생성 버튼이 아직 준비되지 않았습니다.";
          return;
        }
        const currentForm = document.getElementById("planForm");
        if (currentForm?.reportValidity && !currentForm.reportValidity()) {
          dock.dataset.submitPending = "false";
          dock.dataset.submitPendingSource = "invalid";
          markInvalidDockField(currentForm.querySelector(":invalid"), "pre-submit");
          return;
        }
        if (dock.dataset.invalid === "true") {
          const clearedAt = new Date().toISOString();
          dock.dataset.invalidCleared = "true";
          dock.dataset.invalidClearedAt = clearedAt;
          dock.dataset.invalidClearSource = "pre-submit-valid";
          dock.dataset.invalidRecoveryNextAction = "tap-submit-dock";
          dock.dataset.invalidRecoveryReadyAt = clearedAt;
        }
        dock.dataset.invalid = "false";
        dock.dataset.invalidFieldName = "";
        dock.dataset.invalidSource = "";
        dock.dataset.invalidFeedback = "";
        dock.dataset.invalidRemaining = "false";
        dock.dataset.invalidRemainingFieldName = "";
        dock.dataset.clickResult = "submitted";
        dock.dataset.state = "busy";
        dock.dataset.submitBusy = "true";
        dock.dataset.submitStarted = "true";
        const submitStartedAt = new Date().toISOString();
        dock.dataset.submitStartedAt = submitStartedAt;
        dock.dataset.submitSource = "floating-dock";
        dock.dataset.submitStatusFeedback = "플랜 생성을 시작합니다.";
        dock.dataset.submitPending = "true";
        dock.dataset.submitPendingAt = submitStartedAt;
        dock.dataset.submitPendingSource = "floating-dock";
        dock.dataset.submitFinished = "false";
        dock.dataset.submitFinishedResult = "";
        dock.dataset.submitFinishedSource = "";
        dock.dataset.syncedAt = new Date().toISOString();
        quickButton.disabled = true;
        quickButton.setAttribute("aria-busy", "true");
        dockStatus.textContent = "플랜 생성을 시작합니다.";
        currentSubmitButton.click();
      });
    }
  };
  const bindStandaloneCompletionStatusLink = () => {
    if (!standaloneCompletionStatusLink || standaloneCompletionStatusLink.dataset.bound === "true") return;
    standaloneCompletionStatusLink.dataset.bound = "true";
    standaloneCompletionStatusLink.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      const route = standaloneCompletionStatusLink.getAttribute("href") || "/ios-install-status";
      const label = standaloneCompletionStatusLink.textContent.trim() || "완료 상태 확인";
      card.dataset.standaloneCompletionStatusClicked = "true";
      card.dataset.standaloneCompletionStatusClickedAt = clickedAt;
      card.dataset.standaloneCompletionStatusClickedRoute = route;
      card.dataset.standaloneCompletionStatusClickedLabel = label;
      if (standaloneNextAction) {
        standaloneNextAction.dataset.completionStatusClicked = "true";
        standaloneNextAction.dataset.completionStatusClickedAt = clickedAt;
      }
      const statusFeedback = "완료 상태 화면으로 이동합니다.";
      if (standaloneNextActionStatus) {
        standaloneNextActionStatus.textContent = statusFeedback;
      }
      try {
        window.sessionStorage.setItem("travel-planner:ios-standalone-next-action:v1", JSON.stringify({
          schemaVersion: 1,
          action: "completion-status",
          clickedAt,
          route,
          label,
          statusFeedback,
        }));
      } catch {
        // Ignore storage failures; navigation can continue.
      }
    });
  };
  bindStandaloneNewPlanLink();
  bindStandaloneCompletionStatusLink();
  updateInstallModeCallout();
  updateInstallHandoffLinks();
  updateInstallDeploymentHint();
  updateDeployChecklist();
  updateSafariHint();
  updateInstallLaunchProof();
  updateInstallQrHint();
  updateIosFirstRunChecklist();
  updateIosHomeDock();
  updateInstallCompletionChecklist();

  if (isStandaloneDisplay()) {
    card.dataset.installState = "installed";
    setInstallCardCopy("Travel 앱 실행 중", "홈 화면 앱");
    setStandaloneNextActionVisible(true);
    updateStandaloneSubmitDock(true);
    badge.textContent = installModeBadgeLabel("standalone");
    status.textContent = "홈 화면 앱으로 실행 중입니다. 이제 Safari 주소창 없이 Travel Planner를 사용할 수 있습니다.";
    updateInstallUrlHint();
    updateInstallShortUrlHint();
    updateInstallQrHint();
    updateIosFirstRunChecklist();
    updateIosHomeDock();
    updateInstallReadiness();
    updateInstallCompletionChecklist();
    return;
  }

  card.dataset.installState = isIosDevice() ? "ios" : "other";
  setInstallCardCopy("iPhone 홈 화면에 설치", "iOS 설치");
  setStandaloneNextActionVisible(false);
  updateStandaloneSubmitDock(false);
  badge.textContent = installModeBadgeLabel(installModeState());
  if (isIosDevice() && !isLikelyIosSafari()) {
    status.textContent = "이 화면은 iPhone에서 열렸지만 Safari가 아닌 브라우저로 보입니다. Safari에서 다시 연 뒤 공유 버튼 > 홈 화면에 추가를 선택하세요.";
    updateInstallUrlHint();
    updateInstallShortUrlHint();
    updateInstallQrHint();
    updateInstallReadiness();
    return;
  }
  if (iosInstallInfo?.isLocalhost && iosInstallInfo.lanOrigins?.[0]) {
    status.textContent = "현재 Mac 주소는 localhost입니다. iPhone에서는 아래 같은 Wi-Fi 주소를 Safari에서 열고 홈 화면에 추가하세요.";
    updateInstallUrlHint();
    updateInstallShortUrlHint();
    updateInstallQrHint();
    updateInstallReadiness();
    return;
  }
  if (isLocalInstallUrl()) {
    status.textContent = "현재 주소가 localhost입니다. iPhone에서는 Mac의 같은 Wi-Fi IP 주소나 HTTPS 배포 주소로 열어야 홈 화면 설치를 확인할 수 있습니다.";
    updateInstallUrlHint();
    updateInstallShortUrlHint();
    updateInstallQrHint();
    updateInstallReadiness();
    return;
  }
  status.textContent = isIosDevice()
    ? "Safari 공유 버튼에서 홈 화면에 추가를 선택하면 이 iPhone에 설치됩니다."
    : "현재 주소를 iPhone Safari에서 연 뒤 공유 버튼 > 홈 화면에 추가로 설치하세요.";
  updateInstallUrlHint();
  updateInstallShortUrlHint();
  updateInstallQrHint();
  updateInstallReadiness();
}

function bindIosInstallCopyButton() {
  const button = document.getElementById("iosInstallCopyUrlButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installCopyBound === "true") return;
  button.dataset.installCopyBound = "true";
  button.addEventListener("click", async () => {
    const url = preferredInstallUrl();
    try {
      await navigator.clipboard.writeText(url);
      clearIosInstallStatusNextLink();
      if (status) status.textContent = installUrlCopyFeedback(url, "설치 주소");
    } catch {
      clearIosInstallStatusNextLink();
      window.prompt(installUrlPromptMessage(url, "설치 주소"), url);
    }
  });
}

function bindIosSafariCopyUrlButton() {
  const button = document.getElementById("iosSafariCopyUrlButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.safariCopyBound === "true") return;
  button.dataset.safariCopyBound = "true";
  button.addEventListener("click", async () => {
    const url = preferredInstallUrl();
    try {
      await navigator.clipboard.writeText(url);
      clearIosInstallStatusNextLink();
      if (status) status.textContent = installUrlCopyFeedback(url, "Safari 주소");
    } catch {
      clearIosInstallStatusNextLink();
      window.prompt(installUrlPromptMessage(url, "Safari 주소"), url);
    }
  });
}

function bindIosInstallShortCopyButton() {
  const button = document.getElementById("iosInstallCopyShortUrlButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installShortCopyBound === "true") return;
  button.dataset.installShortCopyBound = "true";
  button.addEventListener("click", async () => {
    const url = preferredShortInstallUrl();
    try {
      await navigator.clipboard.writeText(url);
      clearIosInstallStatusNextLink();
      if (status) status.textContent = installUrlCopyFeedback(url, "짧은 설치 주소");
    } catch {
      clearIosInstallStatusNextLink();
      window.prompt(installUrlPromptMessage(url, "짧은 설치 주소"), url);
    }
  });
}

function bindIosInstallShortResetButton() {
  const button = document.getElementById("iosInstallResetShortUrlButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installShortResetBound === "true") return;
  button.dataset.installShortResetBound = "true";
  button.addEventListener("click", () => {
    clearSelectedShortInstallUrl();
    updateInstallShortUrlHint();
    if (status) status.textContent = "짧은 설치 주소를 추천 주소로 되돌렸습니다.";
  });
}

function selectedQrTargetEvidenceCommand() {
  const target = preferredShortInstallUrl();
  let flags = "--require-install-qr";
  try {
    if (new URL(target).protocol === "https:") flags += " --follow-recommended";
  } catch {
    // Keep the local command shape when the target cannot be parsed.
  }
  return `test -d webapp && cd webapp; npm run ios:install:check -- ${flags} --install-qr-target=${JSON.stringify(target)}`;
}

function bindIosInstallQrTargetCommandButton() {
  const button = document.getElementById("iosInstallCopyQrTargetCommandButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installQrTargetCommandBound === "true") return;
  button.dataset.installQrTargetCommandBound = "true";
  button.addEventListener("click", async () => {
    const command = selectedQrTargetEvidenceCommand();
    try {
      await navigator.clipboard.writeText(command);
      clearIosInstallStatusNextLink();
      if (status) status.textContent = "선택한 iPhone 짧은 주소의 QR evidence 명령을 복사했습니다. Mac 터미널에 붙여넣으세요.";
    } catch {
      clearIosInstallStatusNextLink();
      window.prompt("선택 QR evidence 명령을 복사하세요.", command);
    }
  });
}

function installHandoffFallbackText() {
  return [
    "Travel Planner iPhone Home Screen install handoff",
    "",
    "Open on iPhone Safari:",
    preferredInstallUrl(),
    "If this opens in KakaoTalk, Naver, Gmail, Instagram, LINE, Chrome, Firefox, or another in-app browser, copy this URL into Safari first.",
    "",
    "Short URL for manual typing:",
    preferredShortInstallUrl(),
    "Type the short URL in Safari, not an in-app browser, before using Add to Home Screen.",
    "",
    "Proof save URL after Home Screen launch:",
    preferredProofSaveUrl(),
    "Use this proof save URL only after launching the Travel icon from the Home Screen.",
    "",
    "Short operator path:",
    "Prepare before iPhone: test -d webapp && cd webapp; npm run ios:install:prepare",
    "Status/recovery: test -d webapp && cd webapp; npm run ios:install:status",
    "Finish after proof save: test -d webapp && cd webapp; npm run ios:install:finish",
    "",
    "Mac commands before opening iPhone:",
    "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
    "Final HTTPS preflight before opening iPhone:",
    "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final",
    "Run the final preflight in Mac Terminal and confirm it passes before opening the iPhone URL.",
    "Final pre-phone sequence with next action refresh:",
    "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final:next",
    "",
    "Next action endpoints:",
    `${window.location.origin}/api/ios-install-next`,
    `${window.location.origin}/api/ios-install-next.txt`,
    "",
    "Steps:",
    "1. Open the URL in iPhone Safari.",
    "2. If the link opened inside another app, copy it into Safari and continue there.",
    "3. Tap the Safari share button.",
    "4. Choose Add to Home Screen.",
    "5. Launch the Travel icon from the Home Screen.",
    "6. Open the proof save URL if needed, then tap 설치 증거 저장 in the installed app.",
    "",
    "After first Home Screen launch:",
    "1. Save the Home Screen launch proof.",
    "2. Create the first travel plan with destination, dates, companions, and travel style.",
    "3. Reopen the plan once to confirm the Home Screen app can read recent plans and offline snapshots.",
    "4. Use the iPhone quick-start panel if it shows another incomplete setup step.",
    "",
    "Next-action contract:",
    "phoneFirst=true means do the iPhone install and proof save before running the copied Mac command.",
    "nextCommandLabel labels the copied Mac command.",
    "nextCommandPrerequisite explains when that Mac command is safe to run.",
    "Final gate prerequisite: Run only after Add to Home Screen, Travel icon launch, and install proof save.",
    "",
    "Mac evidence commands from repo root or webapp/:",
    "Before iPhone install: test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
    `Selected QR target readiness: ${selectedQrTargetEvidenceCommand()}`,
    "After proof save: test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
    "Final archive/gate after proof save: test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
  ].join("\n");
}

function installSessionAppModeFallbackLines() {
  const state = installModeState();
  return [
    `launchProofAppModeReady=${state === "standalone" ? "true" : "false"}`,
    `appModeState=${state}`,
    `appModeTitle=${installModeTitle(state)}`,
    `displayMode=${isStandaloneDisplay() ? "standalone" : "browser"}`,
  ];
}

function installSessionFallbackText() {
  const nextCommand = iosInstallNextStep?.nextTerminalCommand || iosInstallNextStep?.nextCommand || "";
  const protectedTemplate = iosInstallInfo?.protectedRecommendedShortInstallUrlTemplate
    || iosInstallInfo?.protectedRecommendedInstallUrlTemplate
    || "";
  return [
    "Travel Planner iPhone install session",
    "status=browser-fallback",
    `sessionUrl=${preferredInstallSessionUrl()}`,
    "",
    "Open on iPhone Safari:",
    preferredInstallUrl(),
    `shortUrl=${preferredShortInstallUrl()}`,
    `qrUrl=${preferredInstallQrUrl()}`,
    `proofSaveUrl=${preferredProofSaveUrl()}`,
    ...(protectedTemplate ? [
      "",
      "Protected install:",
      protectedTemplate,
      "Replace YOUR_TRAVEL_ACCESS_KEY only in the protected install URL handoff; this session note does not include real access keys.",
    ] : []),
    "",
    "Current next action:",
    `action=${iosInstallNextStep?.action || "unknown"}`,
    `phoneFirst=${iosInstallNextStep?.phoneFirst === true ? "true" : "false"}`,
    `title=${iosInstallNextStep?.title || "Refresh the next-action card for current evidence status."}`,
    `phoneStep=${iosInstallNextStep?.phoneStep || ""}`,
    `terminalCommand=${nextCommand}`,
    `prerequisite=${iosInstallNextStep?.nextCommandPrerequisite || ""}`,
    "",
    "Short operator path:",
    "Prepare before iPhone: test -d webapp && cd webapp; npm run ios:install:prepare",
    "Status/recovery: test -d webapp && cd webapp; npm run ios:install:status",
    "Finish after proof save: test -d webapp && cd webapp; npm run ios:install:finish",
    "",
    "Mac evidence commands:",
    "Before iPhone install: test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
    "After proof save: test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
    "Final archive/gate after proof save: test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
  ].join("\n");
}

function preferredInstallSessionUrl() {
  try {
    const url = new URL(selectedShortInstallUrl || preferredInstallUrl());
    url.pathname = "/api/ios-install-session.txt";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return new URL("/api/ios-install-session.txt", window.location.origin).toString();
  }
}

function preferredInstallSessionQrUrl() {
  try {
    const url = new URL("/api/ios-install-session-qr.svg", window.location.origin);
    url.searchParams.set("target", preferredInstallSessionUrl());
    return url.toString();
  } catch {
    return "/api/ios-install-session-qr.svg";
  }
}

function installSessionSmsText() {
  const protectedTemplate = iosInstallInfo?.protectedRecommendedShortInstallUrlTemplate
    || iosInstallInfo?.protectedRecommendedInstallUrlTemplate
    || "";
  return [
    "Travel Planner iPhone install session",
    "Open on iPhone Safari:",
    preferredInstallUrl(),
    `Session summary: ${preferredInstallSessionUrl()}`,
    `Proof save after Home Screen launch: ${preferredProofSaveUrl()}`,
    "Operator path:",
    "Prepare: test -d webapp && cd webapp; npm run ios:install:prepare",
    "Status: test -d webapp && cd webapp; npm run ios:install:status",
    "Finish: test -d webapp && cd webapp; npm run ios:install:finish",
    ...(protectedTemplate ? [
      "Protected: use the install page's key-included SMS/mail handoff; this session SMS does not include access keys.",
    ] : []),
  ].join("\n");
}

const IOS_INSTALL_SESSION_HANDOFF_CLICK_STORAGE_KEY = "travel-planner:ios-install-session-handoff-click:v1";

function updateInstallSessionHandoffRestartHint(visible, reason) {
  const root = document.documentElement;
  const hint = document.getElementById("iosInstallSessionHandoffRestartHint");
  const group = document.getElementById("iosInstallSessionHandoffRestartActionGroup");
  const groupLabel = document.getElementById("iosInstallSessionHandoffRestartGroupLabel");
  const groupDescription = document.getElementById("iosInstallSessionHandoffRestartGroupDescription");
  const groupNextStep = document.getElementById("iosInstallSessionHandoffRestartNextStep");
  const buttons = [
    ["Sms", document.getElementById("iosInstallSessionHandoffRestartSmsButton")],
    ["Mail", document.getElementById("iosInstallSessionHandoffRestartMailButton")],
    ["Qr", document.getElementById("iosInstallSessionHandoffRestartQrButton")],
  ];
  if (!hint) return;
  hint.hidden = !visible;
  hint.dataset.visible = visible ? "true" : "false";
  hint.dataset.reason = reason || "";
  hint.dataset.role = hint.getAttribute("role") || "";
  hint.dataset.ariaLive = hint.getAttribute("aria-live") || "";
  hint.dataset.ariaAtomic = hint.getAttribute("aria-atomic") || "";
  if (group) {
    group.hidden = !visible;
    group.dataset.restartGroupVisible = visible ? "true" : "false";
    group.dataset.restartGroupRole = group.getAttribute("role") || "";
    group.dataset.restartGroupAccessibleLabel = group.getAttribute("aria-label") || "";
    group.dataset.restartGroupLabelledBy = group.getAttribute("aria-labelledby") || "";
    group.dataset.restartGroupVisibleLabel = groupLabel?.textContent.trim() || "";
    group.dataset.restartGroupLabelVisible = groupLabel ? (visible ? "true" : "false") : "false";
    group.dataset.restartGroupDescription = groupDescription?.textContent.trim() || "";
    group.dataset.restartGroupDescriptionVisible = groupDescription ? (visible ? "true" : "false") : "false";
    group.dataset.restartNextStep = groupNextStep?.textContent.trim() || "";
    group.dataset.restartNextStepVisible = groupNextStep ? (visible ? "true" : "false") : "false";
    group.dataset.restartGroupDescribedBy = group.getAttribute("aria-describedby") || "";
  }
  buttons.forEach(([suffix, button]) => {
    if (!button) return;
    button.hidden = !visible;
    button.dataset.restartVisible = visible ? "true" : "false";
    button.dataset.restartLabel = button.textContent.trim();
    button.dataset.restartTitle = button.title || "";
    button.dataset.restartAccessibleLabel = button.getAttribute("aria-label") || "";
    root.dataset[`iosInstallSessionHandoffRestart${suffix}Visible`] = button.dataset.restartVisible;
    root.dataset[`iosInstallSessionHandoffRestart${suffix}Label`] = button.dataset.restartLabel;
    root.dataset[`iosInstallSessionHandoffRestart${suffix}Title`] = button.dataset.restartTitle;
    root.dataset[`iosInstallSessionHandoffRestart${suffix}AccessibleLabel`] = button.dataset.restartAccessibleLabel;
  });
  root.dataset.iosInstallSessionHandoffRestartGroupVisible = group?.dataset.restartGroupVisible || "false";
  root.dataset.iosInstallSessionHandoffRestartGroupRole = group?.dataset.restartGroupRole || "";
  root.dataset.iosInstallSessionHandoffRestartGroupAccessibleLabel = group?.dataset.restartGroupAccessibleLabel || "";
  root.dataset.iosInstallSessionHandoffRestartGroupLabelledBy = group?.dataset.restartGroupLabelledBy || "";
  root.dataset.iosInstallSessionHandoffRestartGroupVisibleLabel = group?.dataset.restartGroupVisibleLabel || "";
  root.dataset.iosInstallSessionHandoffRestartGroupLabelVisible = group?.dataset.restartGroupLabelVisible || "false";
  root.dataset.iosInstallSessionHandoffRestartGroupDescription = group?.dataset.restartGroupDescription || "";
  root.dataset.iosInstallSessionHandoffRestartGroupDescriptionVisible = group?.dataset.restartGroupDescriptionVisible || "false";
  root.dataset.iosInstallSessionHandoffRestartNextStep = group?.dataset.restartNextStep || "";
  root.dataset.iosInstallSessionHandoffRestartNextStepVisible = group?.dataset.restartNextStepVisible || "false";
  root.dataset.iosInstallSessionHandoffRestartGroupDescribedBy = group?.dataset.restartGroupDescribedBy || "";
  root.dataset.iosInstallSessionHandoffRestartHintVisible = visible ? "true" : "false";
  root.dataset.iosInstallSessionHandoffRestartHintReason = reason || "";
  root.dataset.iosInstallSessionHandoffRestartHintRole = hint.dataset.role;
  root.dataset.iosInstallSessionHandoffRestartHintAriaLive = hint.dataset.ariaLive;
  root.dataset.iosInstallSessionHandoffRestartHintAriaAtomic = hint.dataset.ariaAtomic;
}

function installSessionHandoffClickFeedback(kind) {
  if (kind === "compact-sms") {
    return "세션 문자를 엽니다. 문자 본문에는 설치 URL, 세션 요약, proof 저장 URL, prepare/status/finish 경로가 들어 있습니다.";
  }
  if (kind === "detailed-mail") {
    return "세션 메일을 엽니다. 메일 본문에는 현재 next action, operator path, 상세 evidence 명령이 함께 들어 있습니다.";
  }
  if (kind === "session-qr") {
    return "세션 QR을 엽니다. iPhone Safari에서 스캔하면 현재 설치 세션 요약으로 바로 이어집니다.";
  }
  return "설치 세션 handoff를 엽니다. iPhone에서 Safari로 이어 현재 단계부터 진행하세요.";
}

function updateInstallSessionHandoffSummary(payload, carryover) {
  const summary = document.getElementById("iosInstallSessionHandoffSummary");
  if (!summary || !payload?.kind) return;
  const root = document.documentElement;
  const clearButton = document.getElementById("iosInstallSessionHandoffSummaryClearButton");
  const label = payload.label || "설치 세션 handoff";
  const feedback = payload.feedback || installSessionHandoffClickFeedback(payload.kind);
  updateInstallSessionHandoffRestartHint(false, "handoff-opened");
  summary.hidden = false;
  summary.textContent = `${carryover ? "돌아온 화면에 남은" : "마지막으로 연"} ${label}: ${feedback}`;
  summary.dataset.handoffKind = payload.kind;
  summary.dataset.handoffLabel = label;
  summary.dataset.handoffClickedAt = payload.clickedAt || "";
  summary.dataset.handoffCarryover = carryover ? "true" : "false";
  if (clearButton) {
    clearButton.hidden = false;
    clearButton.dataset.summaryClearAvailable = "true";
    clearButton.dataset.summaryClearLabel = clearButton.textContent.trim();
    clearButton.dataset.summaryClearTitle = clearButton.title || "";
    clearButton.dataset.summaryClearAccessibleLabel = clearButton.getAttribute("aria-label") || "";
  }
  root.dataset.iosInstallSessionHandoffSummaryVisible = "true";
  root.dataset.iosInstallSessionHandoffSummaryClearVisible = clearButton ? "true" : "false";
  root.dataset.iosInstallSessionHandoffSummaryClearLabel = clearButton?.dataset.summaryClearLabel || "";
  root.dataset.iosInstallSessionHandoffSummaryClearTitle = clearButton?.dataset.summaryClearTitle || "";
  root.dataset.iosInstallSessionHandoffSummaryClearAccessibleLabel = clearButton?.dataset.summaryClearAccessibleLabel || "";
  root.dataset.iosInstallSessionHandoffSummaryRole = summary.getAttribute("role") || "";
  root.dataset.iosInstallSessionHandoffSummaryAriaLive = summary.getAttribute("aria-live") || "";
  root.dataset.iosInstallSessionHandoffSummaryAriaAtomic = summary.getAttribute("aria-atomic") || "";
}

function clearInstallSessionHandoffSummary(status) {
  const root = document.documentElement;
  const summary = document.getElementById("iosInstallSessionHandoffSummary");
  const clearButton = document.getElementById("iosInstallSessionHandoffSummaryClearButton");
  const clearedAt = new Date().toISOString();
  if (summary) {
    summary.hidden = true;
    summary.textContent = "";
    summary.dataset.handoffKind = "";
    summary.dataset.handoffLabel = "";
    summary.dataset.handoffClickedAt = "";
    summary.dataset.handoffCarryover = "false";
  }
  if (clearButton) {
    clearButton.hidden = true;
    clearButton.dataset.summaryClearAvailable = "false";
    clearButton.dataset.summaryClearedAt = clearedAt;
  }
  try {
    window.sessionStorage?.removeItem(IOS_INSTALL_SESSION_HANDOFF_CLICK_STORAGE_KEY);
  } catch {
    root.dataset.iosInstallSessionHandoffSummaryClearStorageFailed = "true";
  }
  root.dataset.iosInstallSessionHandoffClicked = "false";
  root.dataset.iosInstallSessionHandoffKind = "";
  root.dataset.iosInstallSessionHandoffLabel = "";
  root.dataset.iosInstallSessionHandoffClickedAt = "";
  root.dataset.iosInstallSessionHandoffCarryover = "false";
  root.dataset.iosInstallSessionHandoffStatusFeedback = "";
  root.dataset.iosInstallSessionHandoffSummaryVisible = "false";
  root.dataset.iosInstallSessionHandoffSummaryClearVisible = "false";
  root.dataset.iosInstallSessionHandoffSummaryCleared = "true";
  root.dataset.iosInstallSessionHandoffSummaryClearedAt = clearedAt;
  updateInstallSessionHandoffRestartHint(true, "summary-cleared");
  const feedback = "세션 handoff 요약을 지웠습니다. 새 세션 문자/메일/QR을 열면 다시 표시됩니다.";
  root.dataset.iosInstallSessionHandoffSummaryClearClicked = "true";
  root.dataset.iosInstallSessionHandoffSummaryClearClickedAt = clearedAt;
  root.dataset.iosInstallSessionHandoffSummaryClearStatusFeedback = feedback;
  if (status) status.textContent = feedback;
}

function recordInstallSessionHandoffRestartClick(channel, status) {
  const root = document.documentElement;
  const config = {
    Sms: {
      buttonId: "iosInstallSessionHandoffRestartSmsButton",
      linkId: "iosInstallSessionSmsLink",
      feedback: "세션 문자를 다시 엽니다. 새 handoff 요약은 세션 문자 링크가 열리면 다시 표시됩니다.",
    },
    Mail: {
      buttonId: "iosInstallSessionHandoffRestartMailButton",
      linkId: "iosInstallSessionMailLink",
      feedback: "세션 메일을 다시 엽니다. 상세 handoff 요약은 세션 메일 링크가 열리면 다시 표시됩니다.",
    },
    Qr: {
      buttonId: "iosInstallSessionHandoffRestartQrButton",
      linkId: "iosInstallSessionQrLink",
      feedback: "세션 QR을 다시 엽니다. iPhone Safari에서 스캔하면 새 설치 세션으로 이어집니다.",
    },
  }[channel];
  if (!config) return;
  const button = document.getElementById(config.buttonId);
  const target = document.getElementById(config.linkId);
  const clickedAt = new Date().toISOString();
  root.dataset[`iosInstallSessionHandoffRestart${channel}Clicked`] = "true";
  root.dataset[`iosInstallSessionHandoffRestart${channel}ClickedAt`] = clickedAt;
  root.dataset[`iosInstallSessionHandoffRestart${channel}TargetAvailable`] = target ? "true" : "false";
  root.dataset[`iosInstallSessionHandoffRestart${channel}StatusFeedback`] = config.feedback;
  if (button) {
    button.dataset.restartClicked = "true";
    button.dataset.restartClickedAt = clickedAt;
  }
  if (status) status.textContent = config.feedback;
  if (target) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
    target.click();
  }
}

function recordInstallSessionHandoffRestartSmsClick(status) {
  recordInstallSessionHandoffRestartClick("Sms", status);
}

function recordInstallSessionHandoffRestartMailClick(status) {
  recordInstallSessionHandoffRestartClick("Mail", status);
}

function recordInstallSessionHandoffRestartQrClick(status) {
  recordInstallSessionHandoffRestartClick("Qr", status);
}

function applyInstallSessionHandoffClickMarkers(payload, carryover = false) {
  if (!payload?.kind) return;
  const root = document.documentElement;
  root.dataset.iosInstallSessionHandoffClicked = "true";
  root.dataset.iosInstallSessionHandoffKind = payload.kind;
  root.dataset.iosInstallSessionHandoffLabel = payload.label || "";
  root.dataset.iosInstallSessionHandoffClickedAt = payload.clickedAt || "";
  root.dataset.iosInstallSessionHandoffCarryover = carryover ? "true" : "false";
  root.dataset.iosInstallSessionHandoffStatusFeedback = payload.feedback || installSessionHandoffClickFeedback(payload.kind);
  updateInstallSessionHandoffSummary(payload, carryover);
}

function restoreInstallSessionHandoffClickStatus(status) {
  let payload = {};
  try {
    payload = JSON.parse(window.sessionStorage?.getItem(IOS_INSTALL_SESSION_HANDOFF_CLICK_STORAGE_KEY) || "{}");
  } catch {
    payload = {};
  }
  if (!payload?.kind) return;
  applyInstallSessionHandoffClickMarkers(payload, true);
  if (status && !status.textContent) {
    status.textContent = `${payload.feedback || installSessionHandoffClickFeedback(payload.kind)} 이전 handoff 클릭 기록이 이 세션에 남아 있습니다.`;
  }
}

function recordInstallSessionHandoffClick(kind, label, status) {
  const payload = {
    kind,
    label,
    clickedAt: new Date().toISOString(),
    feedback: installSessionHandoffClickFeedback(kind),
  };
  applyInstallSessionHandoffClickMarkers(payload, false);
  try {
    window.sessionStorage?.setItem(IOS_INSTALL_SESSION_HANDOFF_CLICK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    document.documentElement.dataset.iosInstallSessionHandoffStorageFailed = "true";
  }
  clearIosInstallStatusNextLink();
  if (status) status.textContent = payload.feedback;
}

function updateInstallSessionHandoffLinks() {
  const smsLink = document.getElementById("iosInstallSessionSmsLink");
  const mailLink = document.getElementById("iosInstallSessionMailLink");
  const qrLink = document.getElementById("iosInstallSessionQrLink");
  const clearButton = document.getElementById("iosInstallSessionHandoffSummaryClearButton");
  const restartSmsButton = document.getElementById("iosInstallSessionHandoffRestartSmsButton");
  const restartMailButton = document.getElementById("iosInstallSessionHandoffRestartMailButton");
  const restartQrButton = document.getElementById("iosInstallSessionHandoffRestartQrButton");
  const status = document.getElementById("iosInstallStatus");
  if (!smsLink && !mailLink && !qrLink && !clearButton && !restartSmsButton && !restartMailButton && !restartQrButton) return;

  restoreInstallSessionHandoffClickStatus(status);
  if (clearButton && clearButton.dataset.installSessionHandoffSummaryClearBound !== "true") {
    clearButton.dataset.installSessionHandoffSummaryClearBound = "true";
    clearButton.addEventListener("click", () => clearInstallSessionHandoffSummary(status));
  }
  if (restartSmsButton && restartSmsButton.dataset.installSessionHandoffRestartSmsBound !== "true") {
    restartSmsButton.dataset.installSessionHandoffRestartSmsBound = "true";
    restartSmsButton.addEventListener("click", () => recordInstallSessionHandoffRestartSmsClick(status));
  }
  if (restartMailButton && restartMailButton.dataset.installSessionHandoffRestartMailBound !== "true") {
    restartMailButton.dataset.installSessionHandoffRestartMailBound = "true";
    restartMailButton.addEventListener("click", () => recordInstallSessionHandoffRestartMailClick(status));
  }
  if (restartQrButton && restartQrButton.dataset.installSessionHandoffRestartQrBound !== "true") {
    restartQrButton.dataset.installSessionHandoffRestartQrBound = "true";
    restartQrButton.addEventListener("click", () => recordInstallSessionHandoffRestartQrClick(status));
  }
  const text = installSessionFallbackText();
  if (smsLink) {
    smsLink.href = `sms:&body=${encodeURIComponent(installSessionSmsText())}`;
    if (smsLink.dataset.installSessionSmsCleanupBound !== "true") {
      smsLink.dataset.installSessionSmsCleanupBound = "true";
      smsLink.addEventListener("click", () => recordInstallSessionHandoffClick("compact-sms", "세션 문자", status));
    }
  }
  if (mailLink) {
    mailLink.href = `mailto:?subject=${encodeURIComponent("Travel Planner iPhone 설치 세션")}&body=${encodeURIComponent(text)}`;
    if (mailLink.dataset.installSessionMailCleanupBound !== "true") {
      mailLink.dataset.installSessionMailCleanupBound = "true";
      mailLink.addEventListener("click", () => recordInstallSessionHandoffClick("detailed-mail", "세션 메일", status));
    }
  }
  if (qrLink) {
    qrLink.href = preferredInstallSessionQrUrl();
    qrLink.title = preferredInstallSessionUrl();
    if (qrLink.dataset.installSessionQrCleanupBound !== "true") {
      qrLink.dataset.installSessionQrCleanupBound = "true";
      qrLink.addEventListener("click", () => recordInstallSessionHandoffClick("session-qr", "세션 QR", status));
    }
  }
}

async function fetchInstallHandoffText() {
  const path = "/api/ios-install-handoff.txt";
  if (typeof api === "function") {
    return api(path, { headers: { Accept: "text/plain" } });
  }
  return fetch(path, {
    headers: typeof withAccessKeyHeaders === "function"
      ? withAccessKeyHeaders({ Accept: "text/plain" })
      : { Accept: "text/plain" },
  });
}

async function installHandoffTextForShare() {
  try {
    const response = await fetchInstallHandoffText();
    if (response.ok) return response.text();
  } catch {
    // Static hosting can still use the client-side fallback note.
  }
  return installHandoffFallbackText();
}

async function fetchInstallSessionText() {
  const path = "/api/ios-install-session.txt";
  if (typeof api === "function") {
    return api(path, { headers: { Accept: "text/plain" } });
  }
  return fetch(path, {
    headers: typeof withAccessKeyHeaders === "function"
      ? withAccessKeyHeaders({ Accept: "text/plain" })
      : { Accept: "text/plain" },
  });
}

async function installSessionTextForCopy() {
  try {
    const response = await fetchInstallSessionText();
    if (response.ok) return response.text();
  } catch {
    // Static hosting can still copy a useful browser-side session note.
  }
  return installSessionFallbackText();
}

function bindIosInstallHandoffCopyButton() {
  const button = document.getElementById("iosInstallHandoffCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installHandoffCopyBound === "true") return;
  button.dataset.installHandoffCopyBound = "true";
  button.addEventListener("click", async () => {
    const handoffText = await installHandoffTextForShare();
    try {
      await navigator.clipboard.writeText(handoffText);
      if (status) status.textContent = "iPhone 설치 안내 묶음을 복사했습니다. 메시지나 메모로 iPhone에 보내세요.";
    } catch {
      window.prompt("iPhone 설치 안내 묶음을 복사하세요.", handoffText);
    }
  });
}

function bindIosInstallSessionCopyButton() {
  const button = document.getElementById("iosInstallSessionCopyButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installSessionCopyBound === "true") return;
  button.dataset.installSessionCopyBound = "true";
  button.addEventListener("click", async () => {
    const sessionText = await installSessionTextForCopy();
    try {
      await navigator.clipboard.writeText(sessionText);
      if (status) status.textContent = "현재 iPhone 설치 세션 요약을 복사했습니다. 지금 할 일과 최종 gate 명령을 한 번에 확인하세요.";
    } catch {
      window.prompt("현재 iPhone 설치 세션 요약을 복사하세요.", sessionText);
    }
  });
}

function bindIosInstallSessionShareButton() {
  const button = document.getElementById("iosInstallSessionShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installSessionShareBound === "true") return;
  if (!navigator.share) return;

  button.hidden = false;
  button.dataset.installSessionShareBound = "true";
  button.addEventListener("click", async () => {
    const sessionText = await installSessionTextForCopy();
    try {
      await navigator.share({
        title: "Travel Planner iPhone 설치 세션",
        text: sessionText,
        url: preferredInstallUrl(),
      });
      if (status) status.textContent = "현재 iPhone 설치 세션 요약을 공유했습니다. iPhone에서 Safari로 열고 현재 단계부터 진행하세요.";
    } catch (error) {
      if (error?.name !== "AbortError" && status) {
        status.textContent = "설치 세션 공유를 완료하지 못했습니다. 설치 세션 복사 버튼을 사용하세요.";
      }
    }
  });
}

function bindIosInstallHandoffShareButton() {
  const button = document.getElementById("iosInstallHandoffShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installHandoffShareBound === "true") return;
  if (!navigator.share) return;

  button.hidden = false;
  button.dataset.installHandoffShareBound = "true";
  button.addEventListener("click", async () => {
    const handoffText = await installHandoffTextForShare();
    try {
      await navigator.share({
        title: "Travel Planner iPhone 설치 안내",
        text: handoffText,
        url: preferredInstallUrl(),
      });
      if (status) status.textContent = "iPhone 설치 안내 묶음을 공유했습니다. iPhone에서 열고 순서대로 진행하세요.";
    } catch (error) {
      if (error?.name !== "AbortError" && status) {
        status.textContent = "설치 안내 공유를 완료하지 못했습니다. 설치 안내 복사 버튼을 사용하세요.";
      }
    }
  });
}

function bindIosInstallShareButton() {
  const button = document.getElementById("iosInstallShareButton");
  const status = document.getElementById("iosInstallStatus");
  if (!button || button.dataset.installShareBound === "true") return;
  if (!navigator.share) return;

  button.hidden = false;
  button.dataset.installShareBound = "true";
  button.addEventListener("click", async () => {
    const url = preferredInstallUrl();
    try {
      await navigator.share({
        title: "Travel Planner 설치",
        text: installShareText(url),
        url,
      });
      clearIosInstallStatusNextLink();
      if (status) status.textContent = "설치 주소를 공유했습니다. iPhone Safari에서 열고 홈 화면에 추가하세요.";
    } catch (error) {
      if (error?.name !== "AbortError" && status) {
        clearIosInstallStatusNextLink();
        status.textContent = "공유를 완료하지 못했습니다. 주소 복사 버튼으로 설치 주소를 옮겨보세요.";
      }
    }
  });
}

function announceIosOfflineFallbackChecklistCarryover() {
  const sessionKey = "travel-planner:ios-offline-fallback-recovery-checklist-click:v1";
  let sessionValue = "";
  try {
    sessionValue = window.sessionStorage?.getItem(sessionKey) || "";
  } catch {
    sessionValue = "";
  }
  if (!sessionValue) return;

  let parsed = {};
  try {
    parsed = JSON.parse(sessionValue);
  } catch {
    parsed = {};
  }

  const key = typeof parsed.key === "string" ? parsed.key : "";
  const route = typeof parsed.route === "string" ? parsed.route : "";
  const label = typeof parsed.label === "string" ? parsed.label : "";
  const source = typeof parsed.source === "string" ? parsed.source : "";
  const clickedAt = typeof parsed.clickedAt === "string" ? parsed.clickedAt : "";
  if (!key && !route && !label) return;

  const feedback = `${label || "선택한 완료 기준"} 확인에서 이어왔습니다. ${source ? `${source} 복구 흐름입니다. ` : ""}홈 화면 proof, Mac final gate, 첫 플랜 생성, 완료 상태 리뷰까지 확인하세요.`;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryover = "true";
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverKey = key;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverRoute = route;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverLabel = label;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverSource = source;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverClickedAt = clickedAt;
  document.documentElement.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusFeedback = feedback;

  const status = document.getElementById("iosInstallStatus");
  if (status && status.dataset.iosOfflineFallbackChecklistCarryoverShown !== "true") {
    status.dataset.iosOfflineFallbackChecklistCarryoverShown = "true";
    status.textContent = feedback;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
  }
  if (status && route) {
    let statusLink = document.getElementById("iosOfflineFallbackCarryoverStatusLink");
    if (!statusLink) {
      statusLink = document.createElement("a");
      statusLink.id = "iosOfflineFallbackCarryoverStatusLink";
      status.insertAdjacentElement("afterend", statusLink);
    }
    const statusLinkLabel = `${label || "선택한 완료 기준"} 이어가기`;
    statusLink.hidden = false;
    statusLink.className = "ios-offline-fallback-carryover-status-link";
    statusLink.href = route;
    statusLink.textContent = statusLinkLabel;
    statusLink.title = `${statusLinkLabel}: ${feedback}`;
    statusLink.setAttribute("aria-label", `${statusLinkLabel}. ${feedback}`);
    statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkVisible = "true";
    statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkRoute = route;
    statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkLabel = statusLinkLabel;
    statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClass = "ios-offline-fallback-carryover-status-link";
    if (statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkBound !== "true") {
      statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkBound = "true";
      statusLink.addEventListener("click", () => {
        const statusLinkFeedback = `${statusLinkLabel}로 이동합니다. ${feedback}`;
        statusLink.classList.add("is-active");
        statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClicked = "true";
        statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedAt = new Date().toISOString();
        statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedClass = "is-active";
        statusLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverStatusLinkClickedStatusFeedback = statusLinkFeedback;
        status.textContent = statusLinkFeedback;
      });
    }
  }

  if (!status && document.body) {
    let banner = document.getElementById("iosOfflineFallbackCarryoverBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "iosOfflineFallbackCarryoverBanner";
      document.body.insertAdjacentElement("afterbegin", banner);
    }
    banner.className = "ios-offline-fallback-carryover-banner";
    banner.textContent = "";
    const bannerText = document.createElement("span");
    bannerText.textContent = feedback;
    banner.appendChild(bannerText);
    if (route) {
      let bannerLink = document.getElementById("iosOfflineFallbackCarryoverBannerLink");
      if (!bannerLink) {
        bannerLink = document.createElement("a");
        bannerLink.id = "iosOfflineFallbackCarryoverBannerLink";
      }
      if (bannerLink.parentElement !== banner) banner.appendChild(bannerLink);
      const bannerLinkLabel = `${label || "선택한 완료 기준"}으로 이동`;
      bannerLink.className = "ios-offline-fallback-carryover-banner-link";
      bannerLink.href = route;
      bannerLink.textContent = bannerLinkLabel;
      bannerLink.title = bannerLinkLabel;
      bannerLink.setAttribute("aria-label", bannerLinkLabel);
      bannerLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkVisible = "true";
      bannerLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkRoute = route;
      bannerLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkLabel = bannerLinkLabel;
      bannerLink.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLinkClass = "ios-offline-fallback-carryover-banner-link";
    }
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerVisible = "true";
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerKey = key;
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerRoute = route;
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerLabel = label;
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerFeedback = feedback;
    banner.dataset.iosOfflineFallbackRecoveryChecklistCarryoverBannerClass = "ios-offline-fallback-carryover-banner";
  }
}

function announceIosInstallOfflineFallback() {
  const pathname = window.location.pathname;
  if (pathname !== "/ios-install-status" && pathname !== "/ios-next") return;
  const fallbackKind = pathname === "/ios-install-status" ? "completion-status" : "next-action";
  const sourceLabel = pathname === "/ios-install-status" ? "완료 상태 URL" : "다음 액션 URL";
  document.documentElement.dataset.iosOfflineFallback = fallbackKind;
  document.documentElement.dataset.iosOfflineFallbackPath = pathname;
  document.documentElement.dataset.iosOfflineFallbackSourceLabel = sourceLabel;
  document.documentElement.dataset.iosOfflineFallbackSourceUrl = window.location.href;
  document.documentElement.dataset.iosOfflineFallbackRecoveryTarget = "/install.html#iosInstallFastPathTitle";
  document.documentElement.dataset.iosOfflineFallbackRecoveryTargetId = "iosInstallFastPathTitle";
  document.documentElement.dataset.iosOfflineFallbackRecoveryTargetLabel = "1분 설치 루트";
  document.documentElement.dataset.iosOfflineFallbackRecoveryAction = "open-ios-install-fast-path";
  document.documentElement.dataset.iosOfflineFallbackRecoveryActionLabel = "1분 설치 루트 열기";
  document.documentElement.dataset.iosOfflineFallbackCompletionChecklist = "home-screen-proof,mac-final-gate,first-plan,completion-status-review";
  document.documentElement.dataset.iosOfflineFallbackCompletionChecklistLabel = "홈 화면 proof > Mac final gate > 첫 플랜 생성 > 완료 상태 리뷰";
  document.documentElement.dataset.iosOfflineFallbackCompletionHint = "복구 후 홈 화면 proof, Mac final gate, 첫 플랜 생성, 완료 상태 리뷰까지 확인";
  document.documentElement.dataset.iosOfflineFallbackVisibleStatusIncludesCompletionHint = "true";
  document.title = fallbackKind === "completion-status"
    ? "완료 상태 오프라인 복구 - Travel Planner iPhone 설치"
    : "다음 액션 오프라인 복구 - Travel Planner iPhone 설치";
  document.documentElement.dataset.iosOfflineFallbackTitle = document.title;
  document.documentElement.dataset.iosOfflineFallbackUpdatedAt = new Date().toISOString();
  const status = document.getElementById("iosInstallStatus");
  const fastPath = document.getElementById("iosInstallFastPathTitle");
  const completionHint = document.documentElement.dataset.iosOfflineFallbackCompletionHint;
  const recoveryActionLabel = document.documentElement.dataset.iosOfflineFallbackRecoveryActionLabel;
  if (status) {
    status.textContent = pathname === "/ios-install-status"
      ? `${sourceLabel}이 오프라인 fallback으로 cached 설치 가이드를 열었습니다. 1분 설치 루트에서 Home Screen proof, Mac final gate, 첫 플랜 생성, 완료 상태 review 기준을 다시 확인하세요. ${completionHint}`
      : `${sourceLabel}이 오프라인 fallback으로 cached 설치 가이드를 열었습니다. 1분 설치 루트에서 설치 진행을 이어가세요. ${completionHint}`;
    const accessibleLabel = `오프라인 fallback 설치 복구 상태. ${sourceLabel}. ${recoveryActionLabel}. ${completionHint}`;
    status.title = accessibleLabel;
    status.setAttribute("aria-label", accessibleLabel);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    status.setAttribute("aria-describedby", "iosInstallFastPathTitle");
    status.dataset.iosOfflineFallbackCompletionHint = completionHint;
    status.dataset.iosOfflineFallbackCompletionHintVisible = "true";
    status.dataset.iosOfflineFallbackSourceLabel = sourceLabel;
    status.dataset.iosOfflineFallbackRecoveryActionLabel = recoveryActionLabel;
    status.dataset.iosOfflineFallbackAccessibleLabel = accessibleLabel;
    status.dataset.iosOfflineFallbackAccessibleLabelVisible = "true";
    status.dataset.iosOfflineFallbackStatusRole = "status";
    status.dataset.iosOfflineFallbackStatusAriaLive = "polite";
    status.dataset.iosOfflineFallbackStatusAriaAtomic = "true";
    status.dataset.iosOfflineFallbackStatusDescribedBy = "iosInstallFastPathTitle";
    let recoveryLink = document.getElementById("iosOfflineFallbackRecoveryLink");
    if (!recoveryLink) {
      recoveryLink = document.createElement("a");
      recoveryLink.id = "iosOfflineFallbackRecoveryLink";
      status.insertAdjacentElement("afterend", recoveryLink);
    }
    recoveryLink.href = "#iosInstallFastPathTitle";
    recoveryLink.className = "ios-offline-fallback-recovery-link";
    recoveryLink.textContent = recoveryActionLabel;
    recoveryLink.title = `${sourceLabel} 복구: ${recoveryActionLabel}`;
    recoveryLink.setAttribute("aria-label", `${sourceLabel} 복구: ${recoveryActionLabel}`);
    recoveryLink.dataset.iosOfflineFallbackRecoveryLinkVisible = "true";
    recoveryLink.dataset.iosOfflineFallbackRecoveryLinkTarget = "iosInstallFastPathTitle";
    recoveryLink.dataset.iosOfflineFallbackRecoveryLinkLabel = recoveryActionLabel;
    recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClass = "ios-offline-fallback-recovery-link";
    recoveryLink.dataset.iosOfflineFallbackRecoveryLinkAction = "scroll-focus-iosInstallFastPathTitle";
    let recoveryChecklist = document.getElementById("iosOfflineFallbackRecoveryChecklist");
    if (!recoveryChecklist) {
      recoveryChecklist = document.createElement("div");
      recoveryChecklist.id = "iosOfflineFallbackRecoveryChecklist";
      recoveryLink.insertAdjacentElement("afterend", recoveryChecklist);
    }
    const recoveryChecklistItems = [
      { key: "home-screen-proof", route: "#iosInstallProofSaveButton", label: "홈 화면 proof" },
      { key: "mac-final-gate", route: "#iosInstallCompletionFinalGateButton", label: "Mac final gate" },
      { key: "first-plan", route: "/", label: "첫 플랜 생성" },
      { key: "completion-status-review", route: "/ios-install-status", label: "완료 상태 리뷰" },
    ];
    recoveryChecklist.className = "ios-offline-fallback-recovery-checklist";
    recoveryChecklist.textContent = "";
    const recoveryChecklistTitle = document.createElement("strong");
    recoveryChecklistTitle.textContent = "복구 후 다음 확인";
    const recoveryChecklistList = document.createElement("ul");
    recoveryChecklistItems.forEach((item) => {
      const recoveryChecklistItem = document.createElement("li");
      recoveryChecklistItem.dataset.iosOfflineFallbackRecoveryChecklistItemKey = item.key;
      recoveryChecklistItem.dataset.iosOfflineFallbackRecoveryChecklistItemRoute = item.route;
      const recoveryChecklistLink = document.createElement("a");
      recoveryChecklistLink.className = "ios-offline-fallback-recovery-checklist-link";
      recoveryChecklistLink.href = item.route;
      recoveryChecklistLink.textContent = item.label;
      recoveryChecklistLink.title = `${item.label} 확인으로 이동`;
      recoveryChecklistLink.setAttribute("aria-label", `${item.label} 확인으로 이동`);
      recoveryChecklistLink.addEventListener("click", (event) => {
        const feedback = `${item.label} 확인으로 이동합니다. ${completionHint}`;
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClicked = "true";
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedKey = item.key;
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedRoute = item.route;
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedLabel = item.label;
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedAt = new Date().toISOString();
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedClass = "is-active";
        recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkStatusFeedback = feedback;
        const sessionKey = "travel-planner:ios-offline-fallback-recovery-checklist-click:v1";
        const sessionValue = JSON.stringify({
          key: item.key,
          route: item.route,
          label: item.label,
          source: sourceLabel,
          clickedAt: recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClickedAt,
        });
        try {
          window.sessionStorage?.setItem(sessionKey, sessionValue);
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionSaved = "true";
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionKey = sessionKey;
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionValue = sessionValue;
        } catch {
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionSaved = "false";
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionKey = sessionKey;
          recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistSessionValue = "";
        }
        recoveryChecklistLink.classList.add("is-active");
        status.textContent = feedback;
        if (item.route.startsWith("#")) {
          event.preventDefault();
          const target = document.querySelector(item.route);
          if (target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          target?.focus?.({ preventScroll: true });
        }
      });
      recoveryChecklistItem.appendChild(recoveryChecklistLink);
      recoveryChecklistList.appendChild(recoveryChecklistItem);
    });
    recoveryChecklist.append(recoveryChecklistTitle, recoveryChecklistList);
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistVisible = "true";
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistItems = recoveryChecklistItems.map((item) => item.label).join(",");
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistKeys = recoveryChecklistItems.map((item) => item.key).join(",");
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistRoutes = recoveryChecklistItems.map((item) => item.route).join(",");
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLabel = "복구 후 다음 확인";
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinksVisible = "true";
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkLabels = recoveryChecklistItems.map((item) => item.label).join(",");
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkRoutes = recoveryChecklistItems.map((item) => item.route).join(",");
    recoveryChecklist.dataset.iosOfflineFallbackRecoveryChecklistLinkClass = "ios-offline-fallback-recovery-checklist-link";
    if (recoveryLink.dataset.iosOfflineFallbackRecoveryLinkBound !== "true") {
      recoveryLink.dataset.iosOfflineFallbackRecoveryLinkBound = "true";
      recoveryLink.addEventListener("click", (event) => {
        event.preventDefault();
        const target = document.getElementById("iosInstallFastPathTitle");
        if (target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        target?.focus?.({ preventScroll: true });
        const recoveryLinkStatusFeedback = `${sourceLabel} 복구 링크로 1분 설치 루트로 이동했습니다. ${completionHint}`;
        const clickedLabel = "1분 설치 루트로 이동됨";
        status.textContent = recoveryLinkStatusFeedback;
        recoveryLink.textContent = clickedLabel;
        recoveryLink.classList.add("is-active");
        const clickedTitle = `${sourceLabel} 복구 완료: ${clickedLabel}`;
        const clickedAccessibleLabel = `${sourceLabel} 복구 완료: ${clickedLabel}. ${completionHint}`;
        recoveryLink.title = clickedTitle;
        recoveryLink.setAttribute("aria-label", clickedAccessibleLabel);
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClicked = "true";
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClickedAt = new Date().toISOString();
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkStatusFeedback = recoveryLinkStatusFeedback;
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClickedLabel = clickedLabel;
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClickedClass = "is-active";
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClickedTitle = clickedTitle;
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkClickedAccessibleLabel = clickedAccessibleLabel;
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkCompletionChecklist = document.documentElement.dataset.iosOfflineFallbackCompletionChecklist || "";
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkCompletionChecklistLabel = document.documentElement.dataset.iosOfflineFallbackCompletionChecklistLabel || "";
        recoveryLink.dataset.iosOfflineFallbackRecoveryLinkCompletionHint = completionHint;
      });
    }
  }
  fastPath?.scrollIntoView?.({ block: "start" });
  if (fastPath && fastPath.dataset.iosOfflineFallbackFocused !== "true") {
    fastPath.dataset.iosOfflineFallbackFocused = "true";
    if (!fastPath.hasAttribute("tabindex")) fastPath.setAttribute("tabindex", "-1");
    window.setTimeout(() => fastPath.focus?.(), 160);
  }
}

async function initializeIosInstallCard() {
  updateStandaloneDisplayMode();
  redirectStandaloneInstallGuideToApp();
  announceIosInstallOfflineFallback();
  announceIosOfflineFallbackChecklistCarryover();
  updateInstallModeCallout();
  bindIosInstallJourneyTargetCue();
  inferIosInstallHandsOnProgressFromMode();
  bindInstallUrlInput();
  bindInstallShortUrlInput();
  bindIosInstallModeCopyButton();
  bindIosInstallModeShareButton();
  bindIosInstallModeHandoffLinks();
  bindIosInstallCopyButton();
  bindIosSafariCopyUrlButton();
  bindIosInstallShortCopyButton();
  bindIosInstallShortResetButton();
  bindIosInstallQrTargetCommandButton();
  bindIosInstallHandoffCopyButton();
  bindIosInstallSessionCopyButton();
  bindIosInstallSessionShareButton();
  bindIosInstallHandoffShareButton();
  bindIosInstallShareButton();
  bindIosInstallHandsOnChecklist();
  bindInstallLaunchProofActions();
  bindSavedLaunchProofStatusActions();
  bindInstallNextActionButtons();
  bindInstallCompletionRefreshButton();
  bindInstallAppModeProofActions();
  bindProtectedInstallUrlCopyButton();
  updateIosInstallCard();
  updateProtectedInstallUrlHint();
  updateIosInstallFastPathFinalGateButtonState();
  refreshSavedLaunchProofStatus(false);
  refreshInstallSummaryCheckStatus();
  refreshInstallNextStepStatus();
  if (!iosInstallInfo) {
    await loadInstallInfo();
    updateIosInstallCard();
    updateProtectedInstallUrlHint();
  }
  focusInstallProofSaveButtonFromHash();
  focusInstallFinalGateButtonFromHash();
}

function showServiceWorkerUpdatePrompt(registration) {
  if (!registration.waiting || document.getElementById("serviceWorkerUpdatePrompt")) return;

  const prompt = document.createElement("div");
  prompt.id = "serviceWorkerUpdatePrompt";
  prompt.className = "service-worker-update";
  prompt.dataset.iosServiceWorkerUpdatePromptVisible = "true";
  prompt.dataset.iosServiceWorkerUpdatePromptWaiting = "true";
  prompt.dataset.iosServiceWorkerUpdatePromptApplied = "false";
  prompt.dataset.iosServiceWorkerUpdatePromptAppliedAt = "";
  prompt.dataset.iosServiceWorkerUpdatePromptReloadPending = "false";
  prompt.innerHTML = `
    <span>새 Travel Planner 버전이 준비됐습니다.</span>
    <button id="serviceWorkerUpdateApplyButton" type="button">새 버전 적용</button>
  `;
  prompt.querySelector("button")?.addEventListener("click", () => {
    const appliedAt = new Date().toISOString();
    const applyButton = document.getElementById("serviceWorkerUpdateApplyButton");
    const status = document.getElementById("iosInstallStatus");
    prompt.dataset.iosServiceWorkerUpdatePromptApplied = "true";
    prompt.dataset.iosServiceWorkerUpdatePromptAppliedAt = appliedAt;
    document.documentElement.dataset.iosServiceWorkerUpdatePromptApplied = "true";
    document.documentElement.dataset.iosServiceWorkerUpdatePromptAppliedAt = appliedAt;
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || {}),
      applied: true,
      appliedAt,
      reloadPending: false,
      source: "service-worker-update-prompt",
    });
    if (applyButton) applyButton.textContent = "적용 중";
    if (status) status.textContent = "새 Travel Planner 앱 shell을 적용 중입니다. 잠시 후 화면이 자동으로 다시 열립니다.";
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  document.body.append(prompt);
}

function readIosServiceWorkerUpdateSession() {
  try {
    const raw = sessionStorage.getItem("travel-planner:ios-service-worker-update:v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeIosServiceWorkerUpdateSession(session) {
  try {
    sessionStorage.setItem("travel-planner:ios-service-worker-update:v1", JSON.stringify(session));
  } catch {
    // Ignore storage failures; the in-page update markers still work for the current session.
  }
}

function showIosServiceWorkerUpdateCompletionStatusLink(copyMethod) {
  const status = document.getElementById("iosInstallStatus");
  if (!status) return;
  const root = document.documentElement;
  let link = document.getElementById("iosServiceWorkerUpdateCompletionStatusLink");
  if (!link) {
    link = document.createElement("a");
    link.id = "iosServiceWorkerUpdateCompletionStatusLink";
    link.className = "install-link";
    link.href = "/ios-install-status";
    link.textContent = "완료 상태 다시 확인";
    link.setAttribute("aria-label", "새 앱 shell 적용 후 Mac final gate 완료 상태 다시 확인");
    link.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClicked = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedAt = clickedAt;
      root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedRoute = "/ios-install-status";
      root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedStatusFeedback = "새 앱 shell 적용 후 완료 상태 리뷰로 이동합니다. draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPending = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewRoute = "/ios-install-status";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPendingAt = clickedAt;
      writeIosServiceWorkerUpdateSession({
        ...(readIosServiceWorkerUpdateSession() || {}),
        reloadArrivalCompletionStatusLinkClicked: true,
        reloadArrivalCompletionStatusLinkClickedAt: clickedAt,
        reloadArrivalCompletionStatusLinkClickedRoute: "/ios-install-status",
        reloadArrivalCompletionStatusLinkClickedStatusFeedback: "새 앱 shell 적용 후 완료 상태 리뷰로 이동합니다. draftValues=excluded; llmSecrets=excluded",
        reloadArrivalStatusReviewPending: true,
        reloadArrivalStatusReviewRoute: "/ios-install-status",
        reloadArrivalStatusReviewPendingAt: clickedAt,
      });
    });
    status.insertAdjacentElement("afterend", link);
  }
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkVisible = "true";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkRoute = "/ios-install-status";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkLabel = link.textContent.trim();
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod = copyMethod;
  writeIosServiceWorkerUpdateSession({
    ...(readIosServiceWorkerUpdateSession() || {}),
    reloadArrivalCompletionStatusLinkVisible: true,
    reloadArrivalCompletionStatusLinkRoute: "/ios-install-status",
    reloadArrivalCompletionStatusLinkLabel: link.textContent.trim(),
    reloadArrivalFinalGateCommandCopyMethod: copyMethod,
  });
}

function initIosServiceWorkerUpdateReloadArrivalBanner() {
  const session = readIosServiceWorkerUpdateSession();
  if (!session || session.applied !== true || session.reloadPending !== true) return;

  const root = document.documentElement;
  const arrivedAt = typeof session.reloadArrivedAt === "string" ? session.reloadArrivedAt : new Date().toISOString();
  root.dataset.iosServiceWorkerUpdateReloadArrivalVisible = session.reloadArrivalDismissed === true ? "false" : "true";
  root.dataset.iosServiceWorkerUpdateReloadArrivalAppliedAt = typeof session.appliedAt === "string" ? session.appliedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalReloadPendingAt = typeof session.reloadPendingAt === "string" ? session.reloadPendingAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalArrivedAt = arrivedAt;
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClicked = session.reloadArrivalProofLinkClicked === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClickedAt = typeof session.reloadArrivalProofLinkClickedAt === "string" ? session.reloadArrivalProofLinkClickedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusTarget = typeof session.reloadArrivalProofFocusTarget === "string" ? session.reloadArrivalProofFocusTarget : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusScheduled = session.reloadArrivalProofFocusScheduled === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied = session.reloadArrivalProofFocusApplied === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusedAt = typeof session.reloadArrivalProofFocusedAt === "string" ? session.reloadArrivalProofFocusedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofResaved = session.reloadArrivalProofResaved === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalProofResavedAt = typeof session.reloadArrivalProofResavedAt === "string" ? session.reloadArrivalProofResavedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalNextAction = session.reloadArrivalNextAction === "mac-final-gate" ? "mac-final-gate" : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusTarget = typeof session.reloadArrivalFinalGateFocusTarget === "string" ? session.reloadArrivalFinalGateFocusTarget : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusScheduled = session.reloadArrivalFinalGateFocusScheduled === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusApplied = session.reloadArrivalFinalGateFocusApplied === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateFocusedAt = typeof session.reloadArrivalFinalGateFocusedAt === "string" ? session.reloadArrivalFinalGateFocusedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateButtonLabel = typeof session.reloadArrivalFinalGateButtonLabel === "string" ? session.reloadArrivalFinalGateButtonLabel : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopied = session.reloadArrivalFinalGateCommandCopied === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopiedAt = typeof session.reloadArrivalFinalGateCommandCopiedAt === "string" ? session.reloadArrivalFinalGateCommandCopiedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalFinalGateCommandCopyMethod = session.reloadArrivalFinalGateCommandCopyMethod === "clipboard" || session.reloadArrivalFinalGateCommandCopyMethod === "prompt" ? session.reloadArrivalFinalGateCommandCopyMethod : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkVisible = session.reloadArrivalCompletionStatusLinkVisible === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkRoute = session.reloadArrivalCompletionStatusLinkRoute === "/ios-install-status" ? "/ios-install-status" : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkLabel = typeof session.reloadArrivalCompletionStatusLinkLabel === "string" ? session.reloadArrivalCompletionStatusLinkLabel : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClicked = session.reloadArrivalCompletionStatusLinkClicked === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedAt = typeof session.reloadArrivalCompletionStatusLinkClickedAt === "string" ? session.reloadArrivalCompletionStatusLinkClickedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedRoute = session.reloadArrivalCompletionStatusLinkClickedRoute === "/ios-install-status" ? "/ios-install-status" : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalCompletionStatusLinkClickedStatusFeedback = typeof session.reloadArrivalCompletionStatusLinkClickedStatusFeedback === "string" ? session.reloadArrivalCompletionStatusLinkClickedStatusFeedback : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPending = session.reloadArrivalStatusReviewPending === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewRoute = session.reloadArrivalStatusReviewRoute === "/ios-install-status" ? "/ios-install-status" : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPendingAt = typeof session.reloadArrivalStatusReviewPendingAt === "string" ? session.reloadArrivalStatusReviewPendingAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalDismissed = session.reloadArrivalDismissed === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalDismissedAt = typeof session.reloadArrivalDismissedAt === "string" ? session.reloadArrivalDismissedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = typeof session.reloadArrivalStatusFeedback === "string" ? session.reloadArrivalStatusFeedback : "";

  writeIosServiceWorkerUpdateSession({
    ...session,
    reloadArrived: true,
    reloadArrivedAt: arrivedAt,
  });

  if (session.reloadArrivalDismissed === true || document.getElementById("iosServiceWorkerUpdateReloadArrivalBanner")) return;
  const dock = document.getElementById("iosHomeDock");
  const target = dock && !dock.hidden ? dock : document.querySelector("main") || document.body;
  if (!target) return;

  const banner = document.createElement("section");
  banner.id = "iosServiceWorkerUpdateReloadArrivalBanner";
  banner.className = "ios-service-worker-update-reload-arrival-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.setAttribute("aria-atomic", "true");
  banner.setAttribute("title", "새 Travel 앱 shell 적용 완료");
  const message = document.createElement("span");
  message.textContent = "새 Travel 앱 shell이 적용되었습니다. 설치 증거를 다시 저장한 뒤 최종 gate를 확인하세요.";
  const proofLink = document.createElement("a");
  proofLink.className = "install-link";
  proofLink.href = "#iosInstallProofSaveButton";
  proofLink.textContent = "설치 증거 다시 저장";
  proofLink.setAttribute("aria-label", "설치 증거 저장 버튼으로 이동");
  proofLink.addEventListener("click", () => {
    const clickedAt = new Date().toISOString();
    const statusFeedback = "새 앱 shell 적용 후 설치 증거 저장 위치로 이동했습니다. draftValues=excluded; llmSecrets=excluded";
    const saveButton = document.getElementById("iosInstallProofSaveButton");
    root.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClicked = "true";
    root.dataset.iosServiceWorkerUpdateReloadArrivalProofLinkClickedAt = clickedAt;
    root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusTarget = "iosInstallProofSaveButton";
    root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusScheduled = "true";
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = statusFeedback;
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || session),
      reloadArrivalProofLinkClicked: true,
      reloadArrivalProofLinkClickedAt: clickedAt,
      reloadArrivalProofFocusTarget: "iosInstallProofSaveButton",
      reloadArrivalProofFocusScheduled: true,
      reloadArrivalStatusFeedback: statusFeedback,
    });
    window.setTimeout(() => {
      if (saveButton) {
        saveButton.focus?.();
        root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied = document.activeElement === saveButton ? "true" : "false";
      } else {
        root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied = "false";
      }
      const focusedAt = new Date().toISOString();
      root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusedAt = focusedAt;
      writeIosServiceWorkerUpdateSession({
        ...(readIosServiceWorkerUpdateSession() || session),
        reloadArrivalProofFocusTarget: "iosInstallProofSaveButton",
        reloadArrivalProofFocusScheduled: true,
        reloadArrivalProofFocusApplied: root.dataset.iosServiceWorkerUpdateReloadArrivalProofFocusApplied === "true",
        reloadArrivalProofFocusedAt: focusedAt,
      });
    }, 260);
  });
  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "ios-service-worker-update-reload-arrival-dismiss";
  dismissButton.textContent = "확인";
  dismissButton.setAttribute("aria-label", "새 앱 shell 적용 완료 안내 닫기");
  dismissButton.addEventListener("click", () => {
    const dismissedAt = new Date().toISOString();
    const statusFeedback = "새 앱 shell 적용 완료 안내를 확인했습니다. draftValues=excluded; llmSecrets=excluded";
    root.dataset.iosServiceWorkerUpdateReloadArrivalVisible = "false";
    root.dataset.iosServiceWorkerUpdateReloadArrivalDismissed = "true";
    root.dataset.iosServiceWorkerUpdateReloadArrivalDismissedAt = dismissedAt;
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusFeedback = statusFeedback;
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || session),
      reloadArrivalDismissed: true,
      reloadArrivalDismissedAt: dismissedAt,
      reloadArrivalStatusFeedback: statusFeedback,
    });
    banner.remove();
  });
  banner.append(message, proofLink, dismissButton);
  target.prepend(banner);
}

function initIosServiceWorkerUpdateStatusReviewArrivalBanner() {
  if (window.location.pathname !== "/ios-install-status") return;
  const session = readIosServiceWorkerUpdateSession();
  if (!session || session.reloadArrivalStatusReviewPending !== true || session.reloadArrivalStatusReviewRoute !== "/ios-install-status") return;
  const root = document.documentElement;
  const arrivedAt = typeof session.reloadArrivalStatusReviewArrivedAt === "string" ? session.reloadArrivalStatusReviewArrivedAt : new Date().toISOString();
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewVisible = session.reloadArrivalStatusReviewDismissed === true ? "false" : "true";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewRoute = "/ios-install-status";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewSource = "service-worker-update";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewPendingAt = typeof session.reloadArrivalStatusReviewPendingAt === "string" ? session.reloadArrivalStatusReviewPendingAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewArrivedAt = arrivedAt;
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissed = session.reloadArrivalStatusReviewDismissed === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissedAt = typeof session.reloadArrivalStatusReviewDismissedAt === "string" ? session.reloadArrivalStatusReviewDismissedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClicked = session.reloadArrivalStatusReviewDismissButtonClicked === true ? "true" : "false";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedAt = typeof session.reloadArrivalStatusReviewDismissButtonClickedAt === "string" ? session.reloadArrivalStatusReviewDismissButtonClickedAt : "";
  root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback = typeof session.reloadArrivalStatusReviewDismissButtonClickedStatusFeedback === "string" ? session.reloadArrivalStatusReviewDismissButtonClickedStatusFeedback : "";
  writeIosServiceWorkerUpdateSession({
    ...session,
    reloadArrivalStatusReviewArrived: true,
    reloadArrivalStatusReviewArrivedAt: arrivedAt,
  });
  const renderCompletionCue = () => {
    const completion = document.getElementById("iosInstallCompletion");
    if (!completion || document.getElementById("iosServiceWorkerUpdateStatusReviewCompletionCue")) return;
    const cueText = "새 앱 shell 적용 후 도착한 완료 상태 리뷰입니다. 아래 4개 gate를 확인하고 최종 gate 결과 새로고침을 누르세요.";
    const cue = document.createElement("p");
    cue.id = "iosServiceWorkerUpdateStatusReviewCompletionCue";
    cue.className = "install-deployment-hint";
    cue.dataset.state = "fresh";
    cue.textContent = cueText;
    const insertBefore = document.getElementById("iosInstallSummaryFreshness") || document.getElementById("iosInstallCompletionRefreshButton");
    completion.insertBefore(cue, insertBefore || null);
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueVisible = "true";
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueTarget = "iosInstallCompletion";
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueLabel = cueText;
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewCompletionCueRefreshTarget = "iosInstallCompletionRefreshButton";
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || session),
      reloadArrivalStatusReviewCompletionCueVisible: true,
      reloadArrivalStatusReviewCompletionCueTarget: "iosInstallCompletion",
      reloadArrivalStatusReviewCompletionCueLabel: cueText,
      reloadArrivalStatusReviewCompletionCueRefreshTarget: "iosInstallCompletionRefreshButton",
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderCompletionCue, { once: true });
  } else {
    renderCompletionCue();
  }
  if (session.reloadArrivalStatusReviewDismissed === true || document.getElementById("iosServiceWorkerUpdateStatusReviewArrivalBanner")) return;
  const renderBanner = () => {
    if (document.getElementById("iosServiceWorkerUpdateStatusReviewArrivalBanner")) return;
    const target = document.querySelector("main") || document.body;
    if (!target) return;
    const banner = document.createElement("section");
    banner.id = "iosServiceWorkerUpdateStatusReviewArrivalBanner";
    banner.className = "ios-service-worker-update-reload-arrival-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.setAttribute("title", "새 앱 shell 적용 후 완료 상태 리뷰 도착");
    const message = document.createElement("span");
    message.textContent = "새 앱 shell 적용 후 완료 상태 리뷰 화면에 도착했습니다. 남은 gate를 확인하세요.";
    const actionLink = document.createElement("a");
    actionLink.className = "install-link";
    actionLink.href = "#iosInstallCompletion";
    actionLink.textContent = "완료 상태 영역 보기";
    actionLink.setAttribute("aria-label", "새 앱 shell 완료 상태 판정 영역으로 이동");
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkVisible = "true";
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkRoute = "#iosInstallCompletion";
    root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkLabel = actionLink.textContent;
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || session),
      reloadArrivalStatusReviewActionLinkVisible: true,
      reloadArrivalStatusReviewActionLinkRoute: "#iosInstallCompletion",
      reloadArrivalStatusReviewActionLinkLabel: actionLink.textContent,
    });
    actionLink.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      const statusFeedback = "새 앱 shell 적용 후 완료 상태 판정 영역으로 이동했습니다. draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClicked = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkClickedAt = clickedAt;
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusTarget = "iosInstallCompletion";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusScheduled = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkStatusFeedback = statusFeedback;
      writeIosServiceWorkerUpdateSession({
        ...(readIosServiceWorkerUpdateSession() || session),
        reloadArrivalStatusReviewActionLinkClicked: true,
        reloadArrivalStatusReviewActionLinkClickedAt: clickedAt,
        reloadArrivalStatusReviewActionLinkFocusTarget: "iosInstallCompletion",
        reloadArrivalStatusReviewActionLinkFocusScheduled: true,
        reloadArrivalStatusReviewActionLinkStatusFeedback: statusFeedback,
      });
      window.setTimeout(() => {
        const target = document.getElementById("iosInstallCompletion");
        if (target) {
          target.setAttribute("tabindex", "-1");
          target.focus?.({ preventScroll: true });
        }
        const focusedAt = new Date().toISOString();
        root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusApplied = document.activeElement === target ? "true" : "false";
        root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewActionLinkFocusedAt = focusedAt;
        writeIosServiceWorkerUpdateSession({
          ...(readIosServiceWorkerUpdateSession() || session),
          reloadArrivalStatusReviewActionLinkFocusApplied: document.activeElement === target,
          reloadArrivalStatusReviewActionLinkFocusedAt: focusedAt,
        });
      }, 260);
    });
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "ios-service-worker-update-reload-arrival-dismiss";
    dismissButton.textContent = "확인";
    dismissButton.setAttribute("aria-label", "새 앱 shell 완료 상태 리뷰 도착 안내 닫기");
    dismissButton.addEventListener("click", () => {
      const dismissedAt = new Date().toISOString();
      const statusFeedback = "새 앱 shell 적용 후 완료 상태 리뷰 도착 안내를 확인했습니다. draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewVisible = "false";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissed = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissedAt = dismissedAt;
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClicked = "true";
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedAt = dismissedAt;
      root.dataset.iosServiceWorkerUpdateReloadArrivalStatusReviewDismissButtonClickedStatusFeedback = statusFeedback;
      writeIosServiceWorkerUpdateSession({
        ...(readIosServiceWorkerUpdateSession() || session),
        reloadArrivalStatusReviewDismissed: true,
        reloadArrivalStatusReviewDismissedAt: dismissedAt,
        reloadArrivalStatusReviewDismissButtonClicked: true,
        reloadArrivalStatusReviewDismissButtonClickedAt: dismissedAt,
        reloadArrivalStatusReviewDismissButtonClickedStatusFeedback: statusFeedback,
      });
      banner.remove();
    });
    banner.append(message, actionLink, dismissButton);
    target.prepend(banner);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
}

window.addEventListener("DOMContentLoaded", initializeIosInstallCard);
window.addEventListener("pageshow", initializeIosInstallCard);
window.addEventListener("DOMContentLoaded", initIosServiceWorkerUpdateReloadArrivalBanner);
window.addEventListener("pageshow", initIosServiceWorkerUpdateReloadArrivalBanner);
window.addEventListener("DOMContentLoaded", initIosServiceWorkerUpdateStatusReviewArrivalBanner);
window.addEventListener("pageshow", initIosServiceWorkerUpdateStatusReviewArrivalBanner);

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    const reloadPendingAt = new Date().toISOString();
    document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPending = "true";
    document.documentElement.dataset.iosServiceWorkerUpdatePromptReloadPendingAt = reloadPendingAt;
    writeIosServiceWorkerUpdateSession({
      ...(readIosServiceWorkerUpdateSession() || {}),
      reloadPending: true,
      reloadPendingAt,
      source: "service-worker-update-prompt",
    });
    const prompt = document.getElementById("serviceWorkerUpdatePrompt");
    if (prompt) {
      prompt.dataset.iosServiceWorkerUpdatePromptReloadPending = "true";
      prompt.dataset.iosServiceWorkerUpdatePromptReloadPendingAt = reloadPendingAt;
    }
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").then((registration) => {
      showServiceWorkerUpdatePrompt(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showServiceWorkerUpdatePrompt(registration);
          }
        });
      });
    }).catch(() => {
      // PWA support is optional; the app still works as a normal web page.
    });
  });
}

(function initIosFirstPlanRedirectArrivalBanner() {
  const sessionKey = "travel-planner:ios-first-plan-submit-redirect:v1";
  const bannerId = "iosFirstPlanRedirectArrivalBanner";
  const root = document.documentElement;

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeSession = (session, arrivedAt) => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        planned: true,
        route: "/plans/:id",
        plannedAt: typeof session?.plannedAt === "string" ? session.plannedAt : "",
        source: "first-plan-submit",
        arrived: true,
        arrivedAt,
      }));
    } catch {
      // Ignore storage failures; the in-page arrival banner is still useful.
    }
  };

  const writeDismissedSession = (session, dismissedAt) => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        planned: true,
        route: "/plans/:id",
        plannedAt: typeof session?.plannedAt === "string" ? session.plannedAt : "",
        source: "first-plan-submit",
        arrived: true,
        arrivedAt: typeof session?.arrivedAt === "string" ? session.arrivedAt : "",
        dismissed: true,
        dismissedAt,
        dismissButtonClicked: true,
        dismissButtonClickedAt: dismissedAt,
        dismissButtonClickedStatusFeedback: "첫 플랜 상세 도착 배너를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded",
        statusLinkClicked: session?.statusLinkClicked === true,
        statusLinkClickedAt: typeof session?.statusLinkClickedAt === "string" ? session.statusLinkClickedAt : "",
        statusLinkClickedRoute: session?.statusLinkClickedRoute === "/ios-install-status" ? "/ios-install-status" : "",
        statusLinkClickedStatusFeedback: typeof session?.statusLinkClickedStatusFeedback === "string" ? session.statusLinkClickedStatusFeedback : "",
      }));
    } catch {
      // Ignore storage failures; hiding the visible banner still works.
    }
  };

  const isPlanDetailPath = /^\/plans\/[^/]+/.test(window.location.pathname);
  if (!isPlanDetailPath) return;

  const session = readSession();
  if (!session || session.route !== "/plans/:id" || session.source !== "first-plan-submit") return;

  if (session.dismissed === true) {
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalVisible = "false";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalRoute = "/plans/:id";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalSource = "first-plan-submit";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalPlannedAt = typeof session.plannedAt === "string" ? session.plannedAt : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalArrivedAt = typeof session.arrivedAt === "string" ? session.arrivedAt : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissed = "true";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissedAt = typeof session.dismissedAt === "string" ? session.dismissedAt : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked = session.dismissButtonClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt = typeof session.dismissButtonClickedAt === "string" ? session.dismissButtonClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback = typeof session.dismissButtonClickedStatusFeedback === "string" ? session.dismissButtonClickedStatusFeedback : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked = session.statusLinkClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt = typeof session.statusLinkClickedAt === "string" ? session.statusLinkClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute = session.statusLinkClickedRoute === "/ios-install-status" ? "/ios-install-status" : "";
    root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback = typeof session.statusLinkClickedStatusFeedback === "string" ? session.statusLinkClickedStatusFeedback : "";
    return;
  }

  const arrivedAt = new Date().toISOString();
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalVisible = "true";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalRoute = "/plans/:id";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalSource = "first-plan-submit";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalPlannedAt = typeof session.plannedAt === "string" ? session.plannedAt : "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalArrivedAt = arrivedAt;
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissed = "false";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissedAt = "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked = "false";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt = "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback = "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClicked = session.statusLinkClicked === true ? "true" : "false";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedAt = typeof session.statusLinkClickedAt === "string" ? session.statusLinkClickedAt : "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedRoute = session.statusLinkClickedRoute === "/ios-install-status" ? "/ios-install-status" : "";
  root.dataset.iosHomeDockPlanSubmitRedirectArrivalStatusLinkClickedStatusFeedback = typeof session.statusLinkClickedStatusFeedback === "string" ? session.statusLinkClickedStatusFeedback : "";
  writeSession(session, arrivedAt);

  const renderBanner = () => {
    if (document.getElementById(bannerId)) return;
    const target = document.querySelector("main") || document.body;
    if (!target) return;
    const banner = document.createElement("section");
    banner.id = bannerId;
    banner.className = "ios-first-plan-redirect-arrival-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.setAttribute("title", "첫 플랜 생성 후 상세 화면 도착 확인");
    const message = document.createElement("span");
    message.textContent = "첫 여행 플랜 생성 후 상세 화면에 도착했습니다.";
    const homeLink = document.createElement("a");
    homeLink.id = "iosFirstPlanCompletionStatusArrivalHomeLink";
    homeLink.className = "ios-first-plan-completion-status-arrival-home-link";
    homeLink.href = "/";
    homeLink.textContent = "앱 홈으로 돌아가기";
    homeLink.setAttribute("aria-label", "Travel Planner 앱 홈으로 돌아가기");
    homeLink.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClicked = "true";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedAt = clickedAt;
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedRoute = "/";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalHomeLinkClickedStatusFeedback = "첫 플랜 설치 완료 상태 도착 후 앱 홈으로 돌아갑니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          ...session,
          completionStatusArrived: true,
          completionStatusArrivedAt: arrivedAt,
          completionStatusHomeLinkClicked: true,
          completionStatusHomeLinkClickedAt: clickedAt,
          completionStatusHomeLinkClickedRoute: "/",
          completionStatusHomeLinkClickedStatusFeedback: "첫 플랜 설치 완료 상태 도착 후 앱 홈으로 돌아갑니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded",
        }));
      } catch {
        // Ignore storage failures; the normal home navigation still works.
      }
    });
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.id = "iosFirstPlanRedirectArrivalDismissButton";
    dismissButton.className = "ios-first-plan-redirect-arrival-dismiss";
    dismissButton.textContent = "확인";
    dismissButton.setAttribute("aria-label", "첫 플랜 상세 화면 도착 확인 메시지 닫기");
    dismissButton.addEventListener("click", () => {
      const dismissedAt = new Date().toISOString();
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalVisible = "false";
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissed = "true";
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitRedirectArrivalDismissButtonClickedStatusFeedback = "첫 플랜 상세 도착 배너를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      writeDismissedSession(session, dismissedAt);
      banner.remove();
    });
    banner.append(message, homeLink, dismissButton);
    target.prepend(banner);
    focusPlanForm();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
})();

(function initIosFirstPlanCompletionStatusArrivalBanner() {
  const sessionKey = "travel-planner:ios-first-plan-submit-redirect:v1";
  const bannerId = "iosFirstPlanCompletionStatusArrivalBanner";
  const root = document.documentElement;

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  if (window.location.pathname !== "/ios-install-status") return;

  const session = readSession();
  if (!session || session.source !== "first-plan-submit" || session.statusLinkClicked !== true || session.statusLinkClickedRoute !== "/ios-install-status") return;

  if (session.completionStatusArrivalDismissed === true) {
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalVisible = "false";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalRoute = "/ios-install-status";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalSource = "first-plan-submit";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt = typeof session.statusLinkClickedAt === "string" ? session.statusLinkClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt = typeof session.completionStatusArrivedAt === "string" ? session.completionStatusArrivedAt : "";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissed = "true";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt = typeof session.completionStatusArrivalDismissedAt === "string" ? session.completionStatusArrivalDismissedAt : "";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked = session.completionStatusArrivalDismissButtonClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt = typeof session.completionStatusArrivalDismissButtonClickedAt === "string" ? session.completionStatusArrivalDismissButtonClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback = typeof session.completionStatusArrivalDismissButtonClickedStatusFeedback === "string" ? session.completionStatusArrivalDismissButtonClickedStatusFeedback : "";
    return;
  }

  const arrivedAt = new Date().toISOString();
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalVisible = "true";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalRoute = "/ios-install-status";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalSource = "first-plan-submit";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalStatusLinkClickedAt = typeof session.statusLinkClickedAt === "string" ? session.statusLinkClickedAt : "";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalArrivedAt = arrivedAt;
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissed = "false";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt = "";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked = "false";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt = "";
  root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback = "";

  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      ...session,
      completionStatusArrived: true,
      completionStatusArrivedAt: arrivedAt,
      completionStatusArrivalDismissed: false,
    }));
  } catch {
    // Ignore storage failures; the visible status-page arrival banner still works.
  }

  const renderBanner = () => {
    if (document.getElementById(bannerId)) return;
    const target = document.querySelector("main") || document.body;
    if (!target) return;
    const banner = document.createElement("section");
    banner.id = bannerId;
    banner.className = "ios-first-plan-completion-status-arrival-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.setAttribute("title", "첫 플랜 생성 후 설치 완료 상태 도착 확인");
    const message = document.createElement("span");
    message.textContent = "첫 여행 플랜 생성 후 설치 완료 상태 확인 화면에 도착했습니다.";
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.id = "iosFirstPlanCompletionStatusArrivalDismissButton";
    dismissButton.className = "ios-first-plan-completion-status-arrival-dismiss";
    dismissButton.textContent = "확인";
    dismissButton.setAttribute("aria-label", "첫 플랜 설치 완료 상태 도착 확인 메시지 닫기");
    dismissButton.addEventListener("click", () => {
      const dismissedAt = new Date().toISOString();
      const statusFeedback = "첫 플랜 생성 후 설치 완료 상태 도착 메시지를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalVisible = "false";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissed = "true";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitCompletionStatusArrivalDismissButtonClickedStatusFeedback = statusFeedback;
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          ...session,
          completionStatusArrived: true,
          completionStatusArrivedAt: arrivedAt,
          completionStatusArrivalDismissed: true,
          completionStatusArrivalDismissedAt: dismissedAt,
          completionStatusArrivalDismissButtonClicked: true,
          completionStatusArrivalDismissButtonClickedAt: dismissedAt,
          completionStatusArrivalDismissButtonClickedStatusFeedback: statusFeedback,
        }));
      } catch {
        // Ignore storage failures; hiding the visible status-page banner still works.
      }
      banner.remove();
    });
    banner.append(message, dismissButton);
    target.prepend(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
})();

(function initIosFirstPlanHomeReturnArrivalBanner() {
  const sessionKey = "travel-planner:ios-first-plan-submit-redirect:v1";
  const bannerId = "iosFirstPlanHomeReturnArrivalBanner";
  const root = document.documentElement;

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const isHomePath = window.location.pathname === "/" || window.location.pathname === "/index.html";
  if (!isHomePath) return;

  const session = readSession();
  if (!session || session.source !== "first-plan-submit" || session.completionStatusHomeLinkClicked !== true || session.completionStatusHomeLinkClickedRoute !== "/") return;

  if (session.homeReturnArrivalDismissed === true) {
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalVisible = "false";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalRoute = "/";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalSource = "first-plan-submit";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt = typeof session.completionStatusHomeLinkClickedAt === "string" ? session.completionStatusHomeLinkClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt = typeof session.homeReturnArrivedAt === "string" ? session.homeReturnArrivedAt : "";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissed = "true";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt = typeof session.homeReturnArrivalDismissedAt === "string" ? session.homeReturnArrivalDismissedAt : "";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked = session.homeReturnArrivalDismissButtonClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt = typeof session.homeReturnArrivalDismissButtonClickedAt === "string" ? session.homeReturnArrivalDismissButtonClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback = typeof session.homeReturnArrivalDismissButtonClickedStatusFeedback === "string" ? session.homeReturnArrivalDismissButtonClickedStatusFeedback : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted = session.firstUseLoopCompleted === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedAt = typeof session.firstUseLoopCompletedAt === "string" ? session.firstUseLoopCompletedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedSource = session.firstUseLoopCompletedSource === "first-plan-submit" ? "first-plan-submit" : "";
    return;
  }

  const arrivedAt = new Date().toISOString();
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalVisible = "true";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalRoute = "/";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalSource = "first-plan-submit";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalHomeLinkClickedAt = typeof session.completionStatusHomeLinkClickedAt === "string" ? session.completionStatusHomeLinkClickedAt : "";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalArrivedAt = arrivedAt;
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissed = "false";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt = "";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked = "false";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt = "";
  root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted = session.firstUseLoopCompleted === true ? "true" : "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedAt = typeof session.firstUseLoopCompletedAt === "string" ? session.firstUseLoopCompletedAt : "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedSource = session.firstUseLoopCompletedSource === "first-plan-submit" ? "first-plan-submit" : "";

  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      ...session,
      homeReturnArrived: true,
      homeReturnArrivedAt: arrivedAt,
      homeReturnArrivalDismissed: false,
    }));
  } catch {
    // Ignore storage failures; the visible home-return banner still works.
  }

  const renderBanner = () => {
    if (document.getElementById(bannerId)) return;
    const target = document.querySelector("main") || document.body;
    if (!target) return;
    const banner = document.createElement("section");
    banner.id = bannerId;
    banner.className = "ios-first-plan-home-return-arrival-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.setAttribute("title", "첫 플랜 생성 후 앱 홈 복귀 확인");
    const message = document.createElement("span");
    message.textContent = "첫 여행 플랜 생성과 설치 완료 상태 확인 후 앱 홈으로 돌아왔습니다.";
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.id = "iosFirstPlanHomeReturnArrivalDismissButton";
    dismissButton.className = "ios-first-plan-home-return-arrival-dismiss";
    dismissButton.textContent = "확인";
    dismissButton.setAttribute("aria-label", "첫 플랜 완료 후 앱 홈 복귀 확인 메시지 닫기");
    dismissButton.addEventListener("click", () => {
      const dismissedAt = new Date().toISOString();
      const statusFeedback = "첫 플랜 생성과 설치 완료 상태 확인 후 앱 홈 복귀 메시지를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalVisible = "false";
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissed = "true";
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitHomeReturnArrivalDismissButtonClickedStatusFeedback = statusFeedback;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedSource = "first-plan-submit";
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          ...session,
          homeReturnArrived: true,
          homeReturnArrivedAt: arrivedAt,
          homeReturnArrivalDismissed: true,
          homeReturnArrivalDismissedAt: dismissedAt,
          homeReturnArrivalDismissButtonClicked: true,
          homeReturnArrivalDismissButtonClickedAt: dismissedAt,
          homeReturnArrivalDismissButtonClickedStatusFeedback: statusFeedback,
          firstUseLoopCompleted: true,
          firstUseLoopCompletedAt: dismissedAt,
          firstUseLoopCompletedSource: "first-plan-submit",
        }));
      } catch {
        // Ignore storage failures; hiding the visible home-return banner still works.
      }
      banner.remove();
    });
    banner.append(message, dismissButton);
    target.prepend(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
})();

(function initIosFirstUseLoopCompletionBadge() {
  const sessionKey = "travel-planner:ios-first-plan-submit-redirect:v1";
  const badgeId = "iosFirstUseLoopCompletionBadge";
  const root = document.documentElement;

  const readSession = () => {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const isHomePath = window.location.pathname === "/" || window.location.pathname === "/index.html";
  if (!isHomePath) return;

  const session = readSession();
  if (!session || session.firstUseLoopCompleted !== true || session.firstUseLoopCompletedSource !== "first-plan-submit") return;

  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted = "true";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedAt = typeof session.firstUseLoopCompletedAt === "string" ? session.firstUseLoopCompletedAt : "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletedSource = "first-plan-submit";
  if (session.firstUseLoopCompletionBadgeHidden === true) {
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden = "true";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt = typeof session.firstUseLoopCompletionBadgeHiddenAt === "string" ? session.firstUseLoopCompletionBadgeHiddenAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason = session.firstUseLoopCompletionBadgeHiddenReason === "user-acknowledged" ? "user-acknowledged" : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked = session.firstUseLoopCompletionBadgeHideButtonClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt = typeof session.firstUseLoopCompletionBadgeHideButtonClickedAt === "string" ? session.firstUseLoopCompletionBadgeHideButtonClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback = typeof session.firstUseLoopCompletionBadgeHideButtonClickedStatusFeedback === "string" ? session.firstUseLoopCompletionBadgeHideButtonClickedStatusFeedback : "";
    return;
  }
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden = "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked = "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback = "";

  const renderBadge = () => {
    if (document.getElementById(badgeId)) return;
    const target = document.querySelector("main") || document.body;
    if (!target) return;
    const badge = document.createElement("aside");
    badge.id = badgeId;
    badge.className = "ios-first-use-loop-completion-badge";
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("aria-atomic", "true");
    badge.setAttribute("title", "iPhone 첫 사용 루프 완료");
    badge.setAttribute("aria-label", "iPhone 첫 사용 루프 완료 상태");
    const label = document.createElement("span");
    label.textContent = "iPhone 첫 사용 완료";
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.id = "iosFirstUseLoopCompletionResetButton";
    resetButton.className = "ios-first-use-loop-completion-reset";
    resetButton.textContent = "상태 초기화";
    resetButton.setAttribute("aria-label", "iPhone 첫 사용 완료 상태 초기화");
    resetButton.addEventListener("click", () => {
      const clickedAt = new Date().toISOString();
      const statusFeedback = "iPhone 첫 사용 완료 상태를 초기화했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      try {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.setItem("travel-planner:ios-first-plan-submit-reset:v1", JSON.stringify({
          clicked: true,
          clickedAt,
          reason: "user-requested",
          source: "first-plan-submit",
          statusFeedback,
        }));
      } catch {
        // Ignore storage failures; hiding the visible completion badge still works.
      }
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedAt = clickedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonResetReason = "user-requested";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetButtonClickedStatusFeedback = statusFeedback;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetBannerReason = "user-requested";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetBannerShownAt = clickedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompleted = "false";
      const existingResetBanner = document.getElementById("iosFirstUseLoopResetConfirmationBanner");
      if (existingResetBanner) existingResetBanner.remove();
      const resetBanner = document.createElement("section");
      resetBanner.id = "iosFirstUseLoopResetConfirmationBanner";
      resetBanner.className = "ios-first-use-loop-reset-confirmation-banner";
      resetBanner.setAttribute("role", "status");
      resetBanner.setAttribute("aria-live", "polite");
      resetBanner.setAttribute("aria-atomic", "true");
      resetBanner.setAttribute("title", "iPhone 첫 사용 상태 초기화 완료");
      const resetMessage = document.createElement("span");
      resetMessage.textContent = "iPhone 첫 사용 상태를 초기화했습니다. 다시 테스트할 수 있습니다.";
      const restartLink = document.createElement("a");
      restartLink.id = "iosFirstUseLoopResetRestartLink";
      restartLink.className = "ios-first-use-loop-reset-restart-link";
      restartLink.href = "/#planForm";
      restartLink.textContent = "다시 첫 사용 테스트 시작";
      restartLink.setAttribute("aria-label", "새 플랜 생성 폼으로 이동해 iPhone 첫 사용 테스트 다시 시작");
      restartLink.addEventListener("click", () => {
        const clickedAt = new Date().toISOString();
        const restartFeedback = "iPhone 첫 사용 테스트를 다시 시작합니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClicked = "true";
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedAt = clickedAt;
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedRoute = "/#planForm";
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartLinkClickedStatusFeedback = restartFeedback;
        try {
          sessionStorage.setItem("travel-planner:ios-first-plan-submit-reset:v1", JSON.stringify({
            clicked: true,
            clickedAt,
            reason: "user-requested",
            source: "first-plan-submit",
            statusFeedback,
            restartLinkClicked: true,
            restartLinkClickedAt: clickedAt,
            restartLinkClickedRoute: "/#planForm",
            restartLinkClickedStatusFeedback: restartFeedback,
          }));
        } catch {
          // Ignore storage failures; the normal restart link navigation still works.
        }
      });
      resetBanner.append(resetMessage, restartLink);
      badge.replaceWith(resetBanner);
    });
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.id = "iosFirstUseLoopCompletionBadgeHideButton";
    hideButton.className = "ios-first-use-loop-completion-badge-hide";
    hideButton.textContent = "확인";
    hideButton.setAttribute("aria-label", "iPhone 첫 사용 완료 배지 숨기기");
    hideButton.addEventListener("click", () => {
      const hiddenAt = new Date().toISOString();
      const statusFeedback = "iPhone 첫 사용 완료 배지를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHidden = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenAt = hiddenAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHiddenReason = "user-acknowledged";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedAt = hiddenAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopCompletionBadgeHideButtonClickedStatusFeedback = statusFeedback;
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          ...session,
          firstUseLoopCompletionBadgeHidden: true,
          firstUseLoopCompletionBadgeHiddenAt: hiddenAt,
          firstUseLoopCompletionBadgeHiddenReason: "user-acknowledged",
          firstUseLoopCompletionBadgeHideButtonClicked: true,
          firstUseLoopCompletionBadgeHideButtonClickedAt: hiddenAt,
          firstUseLoopCompletionBadgeHideButtonClickedStatusFeedback: statusFeedback,
        }));
      } catch {
        // Ignore storage failures; hiding the visible completion badge still works.
      }
      badge.remove();
    });
    badge.append(label, resetButton, hideButton);
    target.prepend(badge);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBadge, { once: true });
  } else {
    renderBadge();
  }
})();

(function initIosFirstUseLoopResetRestartArrivalBanner() {
  const resetSessionKey = "travel-planner:ios-first-plan-submit-reset:v1";
  const bannerId = "iosFirstUseLoopResetRestartArrivalBanner";
  const root = document.documentElement;

  const readResetSession = () => {
    try {
      const raw = sessionStorage.getItem(resetSessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const isPlanFormHome = (window.location.pathname === "/" || window.location.pathname === "/index.html") && window.location.hash === "#planForm";
  if (!isPlanFormHome) return;

  const session = readResetSession();
  if (!session || session.restartLinkClicked !== true || session.restartLinkClickedRoute !== "/#planForm" || session.reason !== "user-requested") return;

  if (session.restartArrivalDismissed === true) {
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible = "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute = "/#planForm";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason = "user-requested";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt = typeof session.restartLinkClickedAt === "string" ? session.restartLinkClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt = typeof session.restartArrivalArrivedAt === "string" ? session.restartArrivalArrivedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed = "true";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt = typeof session.restartArrivalDismissedAt === "string" ? session.restartArrivalDismissedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason = session.restartArrivalDismissReason === "user-acknowledged" ? "user-acknowledged" : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked = session.restartArrivalDismissButtonClicked === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt = typeof session.restartArrivalDismissButtonClickedAt === "string" ? session.restartArrivalDismissButtonClickedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback = typeof session.restartArrivalDismissButtonClickedStatusFeedback === "string" ? session.restartArrivalDismissButtonClickedStatusFeedback : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted = session.restartArrivalInputStarted === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt = typeof session.restartArrivalInputStartedAt === "string" ? session.restartArrivalInputStartedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared = session.restartArrivalFocusCueCleared === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback = typeof session.restartArrivalInputStartedStatusFeedback === "string" ? session.restartArrivalInputStartedStatusFeedback : "";
    return;
  }

  const arrivedAt = new Date().toISOString();
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible = "true";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRoute = "/#planForm";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalReason = "user-requested";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalRestartLinkClickedAt = typeof session.restartLinkClickedAt === "string" ? session.restartLinkClickedAt : "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalArrivedAt = arrivedAt;
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed = "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked = "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback = "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted = session.restartArrivalInputStarted === true ? "true" : "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt = typeof session.restartArrivalInputStartedAt === "string" ? session.restartArrivalInputStartedAt : "";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared = session.restartArrivalFocusCueCleared === true ? "true" : "false";
  root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback = typeof session.restartArrivalInputStartedStatusFeedback === "string" ? session.restartArrivalInputStartedStatusFeedback : "";

  try {
    sessionStorage.setItem(resetSessionKey, JSON.stringify({
      ...session,
      restartArrivalVisible: true,
      restartArrivalRoute: "/#planForm",
      restartArrivalReason: "user-requested",
      restartArrivalArrivedAt: arrivedAt,
      restartArrivalDismissed: false,
    }));
  } catch {
    // Ignore storage failures; the visible restart-arrival banner still works.
  }

  const focusPlanForm = () => {
    const form = document.getElementById("planForm");
    if (!form) return;
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusTarget = "planForm";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusScheduled = "true";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted = session.restartArrivalInputStarted === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt = typeof session.restartArrivalInputStartedAt === "string" ? session.restartArrivalInputStartedAt : "";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared = session.restartArrivalFocusCueCleared === true ? "true" : "false";
    root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback = typeof session.restartArrivalInputStartedStatusFeedback === "string" ? session.restartArrivalInputStartedStatusFeedback : "";
    if (!form.hasAttribute("tabindex")) form.setAttribute("tabindex", "-1");
    form.classList.add("ios-first-use-loop-reset-restart-arrival-focus");
    let inputStarted = false;
    const markInputStarted = () => {
      if (inputStarted) return;
      inputStarted = true;
      const inputStartedAt = new Date().toISOString();
      form.classList.remove("ios-first-use-loop-reset-restart-arrival-focus");
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStarted = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedAt = inputStartedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusCueCleared = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalInputStartedStatusFeedback = "첫 사용 재테스트 입력을 시작했습니다. draftValues=excluded; savedPlanId=excluded; llmSecrets=excluded";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerShownAt = inputStartedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed = "false";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt = "";
      const existingInputStartedBanner = document.getElementById("iosFirstUseLoopResetInputStartedBanner");
      if (existingInputStartedBanner) existingInputStartedBanner.remove();
      const inputStartedBanner = document.createElement("section");
      inputStartedBanner.id = "iosFirstUseLoopResetInputStartedBanner";
      inputStartedBanner.className = "ios-first-use-loop-reset-input-started-banner";
      inputStartedBanner.setAttribute("role", "status");
      inputStartedBanner.setAttribute("aria-live", "polite");
      inputStartedBanner.setAttribute("aria-atomic", "true");
      inputStartedBanner.setAttribute("title", "iPhone 첫 사용 재테스트 입력 시작");
      const inputStartedBannerMessage = document.createElement("span");
      inputStartedBannerMessage.dataset.iosFirstUseLoopResetInputStartedBannerMessage = "true";
      inputStartedBannerMessage.textContent = "첫 사용 재테스트 입력을 시작했습니다.";
      const inputStartedBannerDismissLabel = "확인";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel = inputStartedBannerDismissLabel;
      const inputStartedBannerDismiss = document.createElement("button");
      inputStartedBannerDismiss.type = "button";
      inputStartedBannerDismiss.className = "ios-first-use-loop-reset-input-started-banner-dismiss";
      inputStartedBannerDismiss.dataset.iosFirstUseLoopResetInputStartedBannerDismiss = "true";
      inputStartedBannerDismiss.textContent = inputStartedBannerDismissLabel;
      inputStartedBannerDismiss.addEventListener("click", () => {
        const dismissedAt = new Date().toISOString();
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissed = "true";
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissedAt = dismissedAt;
        root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetInputStartedBannerDismissButtonLabel = inputStartedBannerDismissLabel;
        inputStartedBanner.remove();
        try {
          sessionStorage.setItem(resetSessionKey, JSON.stringify({
            ...session,
            restartInputStartedBannerDismissed: true,
            restartInputStartedBannerDismissedAt: dismissedAt,
            restartInputStartedBannerDismissButtonLabel: inputStartedBannerDismissLabel,
          }));
        } catch {
          // Ignore storage failures; dismissing the visible cue still works.
        }
      });
      inputStartedBanner.append(inputStartedBannerMessage, inputStartedBannerDismiss);
      form.prepend(inputStartedBanner);
      try {
        sessionStorage.setItem(resetSessionKey, JSON.stringify({
          ...session,
          restartArrivalInputStarted: true,
          restartArrivalInputStartedAt: inputStartedAt,
          restartArrivalFocusCueCleared: true,
          restartArrivalInputStartedStatusFeedback: "첫 사용 재테스트 입력을 시작했습니다. draftValues=excluded; savedPlanId=excluded; llmSecrets=excluded",
          restartInputStartedBannerShownAt: inputStartedAt,
          restartInputStartedBannerDismissed: false,
          restartInputStartedBannerDismissedAt: "",
          restartInputStartedBannerDismissButtonLabel: inputStartedBannerDismissLabel,
        }));
      } catch {
        // Ignore storage failures; the visible focus cue has already been cleared.
      }
    };
    form.addEventListener("input", markInputStarted, { capture: true, once: true });
    form.addEventListener("change", markInputStarted, { capture: true, once: true });
    requestAnimationFrame(() => {
      form.focus({ preventScroll: true });
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusApplied = document.activeElement === form ? "true" : "false";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalFocusedAt = new Date().toISOString();
    });
  };

  const renderBanner = () => {
    if (document.getElementById(bannerId)) return;
    const target = document.getElementById("planForm") || document.querySelector("main") || document.body;
    if (!target) return;
    const banner = document.createElement("section");
    banner.id = bannerId;
    banner.className = "ios-first-use-loop-reset-restart-arrival-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.setAttribute("title", "iPhone 첫 사용 테스트 재시작 준비");
    const message = document.createElement("span");
    message.textContent = "첫 사용 상태가 초기화되었습니다. 새 플랜 생성으로 다시 테스트할 수 있습니다.";
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.id = "iosFirstUseLoopResetRestartArrivalDismissButton";
    dismissButton.className = "ios-first-use-loop-reset-restart-arrival-dismiss";
    dismissButton.textContent = "확인";
    dismissButton.setAttribute("aria-label", "첫 사용 재테스트 준비 메시지 닫기");
    dismissButton.addEventListener("click", () => {
      const dismissedAt = new Date().toISOString();
      const statusFeedback = "첫 사용 재테스트 준비 메시지를 확인했습니다. savedPlanId=excluded; draftValues=excluded; llmSecrets=excluded";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalVisible = "false";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissed = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissReason = "user-acknowledged";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClicked = "true";
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedAt = dismissedAt;
      root.dataset.iosHomeDockPlanSubmitFirstUseLoopResetRestartArrivalDismissButtonClickedStatusFeedback = statusFeedback;
      try {
        sessionStorage.setItem(resetSessionKey, JSON.stringify({
          ...session,
          restartArrivalVisible: true,
          restartArrivalRoute: "/#planForm",
          restartArrivalReason: "user-requested",
          restartArrivalArrivedAt: arrivedAt,
          restartArrivalDismissed: true,
          restartArrivalDismissedAt: dismissedAt,
          restartArrivalDismissReason: "user-acknowledged",
          restartArrivalDismissButtonClicked: true,
          restartArrivalDismissButtonClickedAt: dismissedAt,
          restartArrivalDismissButtonClickedStatusFeedback: statusFeedback,
        }));
      } catch {
        // Ignore storage failures; hiding the visible restart-arrival banner still works.
      }
      banner.remove();
    });
    banner.append(message, dismissButton);
    target.prepend(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
})();
