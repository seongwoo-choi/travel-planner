const ACCESS_KEY_STORAGE = "travelPlannerAccessKey";
const ACCESS_KEY_SESSION_STORAGE = "travelPlannerSessionAccessKey";
const ACCESS_KEY_URL_PARAMS = ["travelAccessKey", "travel_access_key", "accessKey", "access_key"];
const LLM_OPTIONS_STORAGE = "travelPlannerLlmOptions";
const OPERATOR_STATUS_MAX_RETRY_SECONDS = 300;
let connectivityBanner = null;
let refreshAccessKeyTools = () => {};

function getAccessKey() {
  return window.sessionStorage.getItem(ACCESS_KEY_SESSION_STORAGE) || window.localStorage.getItem(ACCESS_KEY_STORAGE) || "";
}

function getAccessKeyStorageMode() {
  if (window.sessionStorage.getItem(ACCESS_KEY_SESSION_STORAGE)) return "session";
  if (window.localStorage.getItem(ACCESS_KEY_STORAGE)) return "local";
  return "";
}

function accessKeyStorageLabel() {
  const mode = getAccessKeyStorageMode();
  if (mode === "session") return "세션";
  if (mode === "local") return "계속 저장";
  return "없음";
}

function notifyAccessKeyStorageChanged() {
  window.dispatchEvent(new CustomEvent("travel-access-key-storage-change", {
    detail: { mode: getAccessKeyStorageMode() },
  }));
}

function accessKeyButtonLabel() {
  const mode = getAccessKeyStorageMode();
  if (mode === "session") return "접근 키 변경 (세션)";
  if (mode === "local") return "접근 키 변경 (계속 저장)";
  return "접근 키 설정";
}

function accessKeySessionButtonLabel() {
  const mode = getAccessKeyStorageMode();
  if (mode === "local") return "세션으로 전환";
  if (mode === "session") return "이미 세션 저장";
  return "세션 저장 없음";
}

function accessKeySavedMessage() {
  return getAccessKeyStorageMode() === "session"
    ? "접근 키를 현재 탭 세션에만 저장했습니다."
    : "접근 키를 이 브라우저에 계속 저장했습니다.";
}

function setAccessKey(value, persist = true) {
  const key = String(value || "").trim();
  window.localStorage.removeItem(ACCESS_KEY_STORAGE);
  window.sessionStorage.removeItem(ACCESS_KEY_SESSION_STORAGE);
  if (key) {
    const storage = persist ? window.localStorage : window.sessionStorage;
    const storageKey = persist ? ACCESS_KEY_STORAGE : ACCESS_KEY_SESSION_STORAGE;
    storage.setItem(storageKey, key);
  }
  notifyAccessKeyStorageChanged();
  return key;
}

function captureAccessKeyFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashIsParams = window.location.hash.startsWith("#?");
  const hashValue = hashIsParams ? window.location.hash.slice(2) : "";
  const hashParams = new URLSearchParams(hashValue);
  const keyName = ACCESS_KEY_URL_PARAMS.find((name) => searchParams.has(name) || hashParams.has(name));
  if (!keyName) return "";
  const key = String(searchParams.get(keyName) || hashParams.get(keyName) || "").trim();
  if (!key) return "";
  setAccessKey(key, true);
  for (const name of ACCESS_KEY_URL_PARAMS) {
    searchParams.delete(name);
    hashParams.delete(name);
  }
  const cleanSearch = searchParams.toString();
  const cleanHash = hashParams.toString();
  const cleanHashSuffix = hashIsParams ? (cleanHash ? `#?${cleanHash}` : "") : window.location.hash;
  const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${cleanHashSuffix}`;
  window.history.replaceState(window.history.state, "", cleanUrl);
  return key;
}

captureAccessKeyFromUrl();

function clearAccessKey() {
  window.localStorage.removeItem(ACCESS_KEY_STORAGE);
  window.sessionStorage.removeItem(ACCESS_KEY_SESSION_STORAGE);
  notifyAccessKeyStorageChanged();
}

function moveAccessKeyToSession() {
  const key = window.localStorage.getItem(ACCESS_KEY_STORAGE) || "";
  if (!key) return false;
  setAccessKey(key, false);
  return true;
}

function promptAccessKey() {
  const key = window.prompt("접근 키를 입력하세요.") || "";
  if (!key.trim()) return "";
  const persist = window.confirm("이 브라우저에 접근 키를 계속 저장할까요?\n취소하면 현재 탭 세션에만 저장합니다.");
  return setAccessKey(key, persist);
}

function retryAccessKeyWithBusyButton(button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "확인 중...";
  const key = promptAccessKey();
  if (!key) {
    button.disabled = false;
    button.textContent = originalLabel;
  }
  return key;
}

function bindSecretInputToggle(input) {
  if (!input || input.dataset.secretToggleBound === "true") return;
  input.dataset.secretToggleBound = "true";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary inline-action";
  button.textContent = "표시";
  button.title = "입력 중인 API key를 임시로 표시합니다. 값은 저장하지 않습니다.";
  button.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "표시" : "숨김";
  });
  input.insertAdjacentElement("afterend", button);
}

function hideSecretInput(input) {
  if (!input) return;
  input.type = "password";
  const button = input.nextElementSibling;
  if (button?.tagName === "BUTTON") button.textContent = "표시";
}

function clearLlmApiKeyInputs(root = document) {
  root.querySelectorAll('input[name="llmApiKey"]').forEach((input) => {
    input.value = "";
    hideSecretInput(input);
  });
  window.dispatchEvent(new CustomEvent("travel-llm-api-key-inputs-cleared"));
}

window.addEventListener("pagehide", () => {
  clearLlmApiKeyInputs();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) clearLlmApiKeyInputs();
});

function getLlmFormPreferences() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LLM_OPTIONS_STORAGE) || "{}");
    return {
      llmProvider: typeof parsed.llmProvider === "string" ? parsed.llmProvider : "",
      llmModel: typeof parsed.llmModel === "string" ? parsed.llmModel : "",
    };
  } catch (err) {
    console.debug("llm option preference load failed", err);
    return { llmProvider: "", llmModel: "" };
  }
}

function saveLlmFormPreferences(values = {}) {
  const prefs = {
    llmProvider: String(values.llmProvider || "").trim(),
    llmModel: String(values.llmModel || "").trim(),
  };
  try {
    window.localStorage.setItem(LLM_OPTIONS_STORAGE, JSON.stringify(prefs));
  } catch (err) {
    console.debug("llm option preference save failed", err);
  }
}

function clearLlmFormPreferences() {
  window.localStorage.removeItem(LLM_OPTIONS_STORAGE);
}

function saveLlmFormPreferencesFromForm(form) {
  if (!form) return;
  saveLlmFormPreferences({
    llmProvider: form.querySelector('select[name="llmProvider"]')?.value || "",
    llmModel: form.querySelector('input[name="llmModel"]')?.value || "",
  });
}

function restoreLlmFormPreferences(form) {
  if (!form) return;
  const prefs = getLlmFormPreferences();
  const providerSelect = form.querySelector('select[name="llmProvider"]');
  const modelInput = form.querySelector('input[name="llmModel"]');
  if (
    providerSelect &&
    prefs.llmProvider &&
    Array.from(providerSelect.options).some((option) => option.value === prefs.llmProvider)
  ) {
    providerSelect.value = prefs.llmProvider;
  }
  if (modelInput && !modelInput.value && prefs.llmModel) {
    modelInput.value = prefs.llmModel;
  }
}

function bindLlmFormPreferences(form, onChange) {
  if (!form) return;
  restoreLlmFormPreferences(form);
  const providerSelect = form.querySelector('select[name="llmProvider"]');
  const modelInput = form.querySelector('input[name="llmModel"]');
  const remember = () => {
    saveLlmFormPreferencesFromForm(form);
    if (onChange) onChange();
  };
  if (providerSelect) providerSelect.addEventListener("change", remember);
  if (modelInput) modelInput.addEventListener("input", remember);
}

function createOperatorStatusRetryScheduler(loadStatusFn, getStatusFn = () => window.travelPlannerStatus) {
  let retryTimer = null;

  function clearRetry() {
    if (retryTimer) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function retryWhenVisible() {
    if (document.visibilityState === "hidden") return;
    Promise.resolve(loadStatusFn()).catch((err) => {
      console.debug("operator status retry failed", err);
    });
  }

  window.addEventListener("pagehide", clearRetry);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (getStatusFn()?.operatorDetailsState === "rate-limited" && !retryTimer) {
      retryWhenVisible();
    }
  });

  return function schedule(status) {
    const retryAfterValue = Number(status?.operatorRetryAfterSeconds || 0);
    if (
      status?.operatorDetailsState !== "rate-limited" ||
      !Number.isFinite(retryAfterValue) ||
      retryAfterValue <= 0
    ) {
      clearRetry();
      return;
    }
    const retryAfter = Math.min(OPERATOR_STATUS_MAX_RETRY_SECONDS, Math.ceil(retryAfterValue));
    clearRetry();
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      retryWhenVisible();
    }, retryAfter * 1000);
  };
}

function updateAccessKeyToolLabels(changeButton, sessionButton) {
  changeButton.textContent = accessKeyButtonLabel();
  sessionButton.textContent = accessKeySessionButtonLabel();
  const canMoveToSession = getAccessKeyStorageMode() === "local";
  sessionButton.disabled = !canMoveToSession;
  sessionButton.title = canMoveToSession
    ? "계속 저장된 접근 키를 현재 탭 세션으로 옮깁니다."
    : "계속 저장된 접근 키가 있을 때 사용할 수 있습니다.";
}

function withAccessKeyHeaders(headers = {}) {
  const key = getAccessKey();
  return key ? { ...headers, "X-Travel-Access-Key": key } : headers;
}

async function handleAuthRetry(path, options) {
  clearAccessKey();
  const key = promptAccessKey();
  if (!key) return null;
  return fetch(path, {
    ...options,
    headers: withAccessKeyHeaders(options?.headers || {}),
  });
}

function handleRateLimitResponse(res) {
  if (res.status !== 429) return false;
  const retryAfter = Number(res.headers.get("Retry-After") || "");
  const retryMessage = retryAfter > 0 ? `${retryAfter}초 후 다시 시도해주세요.` : "잠시 후 다시 시도해주세요.";
  showConnectivityBanner(`요청이 너무 많습니다. ${retryMessage}`);
  return true;
}

async function api(path, options = {}) {
  const headers = withAccessKeyHeaders({ "Content-Type": "application/json", ...(options.headers || {}) });
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers,
    });
  } catch (err) {
    showConnectivityBanner("서버에 연결할 수 없습니다. Wi-Fi, 서버 실행 상태, 접속 URL을 확인해주세요.");
    throw err;
  }
  if (res.ok) hideConnectivityBanner();
  if (handleRateLimitResponse(res)) return res;
  if (res.status !== 401) return res;
  const retry = await handleAuthRetry(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!retry) return res;
  if (retry.ok) hideConnectivityBanner();
  handleRateLimitResponse(retry);
  return retry;
}

async function optionalApi(path, options = {}) {
  const headers = withAccessKeyHeaders({ "Content-Type": "application/json", ...(options.headers || {}) });
  try {
    const res = await fetch(path, {
      ...options,
      headers,
    });
    if (handleRateLimitResponse(res)) return res;
    if (res.ok) hideConnectivityBanner();
    return res;
  } catch (err) {
    return null;
  }
}

function downloadFilename(res, fallback) {
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1] || fallback;
}

async function authDownload(path) {
  const target = new URL(path, window.location.origin);
  const sameOrigin = target.origin === window.location.origin;
  let res;
  try {
    res = await fetch(target.toString(), {
      headers: sameOrigin ? withAccessKeyHeaders() : {},
    });
  } catch (err) {
    showConnectivityBanner("다운로드 서버에 연결할 수 없습니다. 서버 실행 상태를 확인해주세요.");
    return;
  }
  if (sameOrigin && res.status === 401) {
    clearAccessKey();
    res = await handleAuthRetry(target.toString(), { headers: {} });
    if (!res) return;
  }
  if (handleRateLimitResponse(res)) return;
  if (!res.ok) {
    alert("다운로드에 실패했습니다.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadFilename(res, "travel-planner-download");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showConnectivityBanner(message) {
  if (!connectivityBanner) {
    connectivityBanner = document.createElement("div");
    connectivityBanner.className = "connectivity-banner";
    document.body.appendChild(connectivityBanner);
  }
  connectivityBanner.textContent = message;
  connectivityBanner.classList.remove("hidden");
}

function hideConnectivityBanner() {
  if (connectivityBanner) {
    connectivityBanner.classList.add("hidden");
  }
}

function updateOnlineStatus() {
  if (navigator.onLine) {
    hideConnectivityBanner();
    return;
  }
  showConnectivityBanner("오프라인 상태입니다. 저장된 화면은 볼 수 있지만 새 플랜 생성/조회는 서버 연결이 필요합니다.");
}

function renderAccessKeyTools() {
  const tools = document.createElement("div");
  tools.className = "auth-tools";
  const changeButton = document.createElement("button");
  changeButton.type = "button";
  changeButton.className = "secondary";
  changeButton.textContent = accessKeyButtonLabel();

  const sessionButton = document.createElement("button");
  sessionButton.type = "button";
  sessionButton.className = "secondary";
  sessionButton.textContent = "세션으로 전환";

  changeButton.addEventListener("click", () => {
    const key = promptAccessKey();
    if (key) {
      updateAccessKeyToolLabels(changeButton, sessionButton);
      alert(accessKeySavedMessage());
    }
  });

  sessionButton.addEventListener("click", () => {
    if (!moveAccessKeyToSession()) return;
    updateAccessKeyToolLabels(changeButton, sessionButton);
    alert("접근 키를 현재 탭 세션에만 저장하도록 전환했습니다.");
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "secondary";
  clearButton.textContent = "접근 키 삭제";
  clearButton.addEventListener("click", () => {
    clearAccessKey();
    updateAccessKeyToolLabels(changeButton, sessionButton);
    alert("저장된 접근 키를 삭제했습니다.");
  });

  const clearLlmButton = document.createElement("button");
  clearLlmButton.type = "button";
  clearLlmButton.className = "secondary";
  clearLlmButton.textContent = "LLM 선택 초기화";
  clearLlmButton.title = "저장된 provider/model 자동 입력값만 삭제합니다. API key는 저장하지 않습니다.";
  clearLlmButton.addEventListener("click", () => {
    clearLlmFormPreferences();
    alert("저장된 LLM provider/model 자동 입력값을 삭제했습니다.");
  });

  refreshAccessKeyTools = () => updateAccessKeyToolLabels(changeButton, sessionButton);
  refreshAccessKeyTools();
  tools.appendChild(changeButton);
  tools.appendChild(sessionButton);
  tools.appendChild(clearButton);
  tools.appendChild(clearLlmButton);
  document.body.appendChild(tools);
}

document.addEventListener("DOMContentLoaded", () => {
  renderAccessKeyTools();
  updateOnlineStatus();
});
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
window.addEventListener("storage", (event) => {
  if (![ACCESS_KEY_STORAGE, ACCESS_KEY_SESSION_STORAGE].includes(event.key)) return;
  refreshAccessKeyTools();
  notifyAccessKeyStorageChanged();
});
