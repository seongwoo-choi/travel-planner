# 여행 계획 자동 고도화 웹앱 (Node.js)

요청한 스펙:
`몇박몇일` + `동행` + `국내/해외` + `출발지/숙박/교통 선호` 입력 → LLM(Codex 또는 Claude)으로 일정 생성 → 저장 → 계속 개선(리파인) → 재생성.

여행 세부 계획은 `.claude/skills/travel-orchestrator/SKILL.md`에 작성된 Claude Code travel-orchestrator 스킬을 프롬프트에 반영해 생성합니다. 생성/고도화 프롬프트에는 체류 일수 누락 방지, 하루 2~3개 핵심 동선, 이동/식사/휴식 버퍼, 실시간 확인 필요 표시, 우천/휴무 대안, 즉시 실행 가능한 예약 체크리스트를 요구하는 품질 가드도 함께 들어갑니다. 응답 저장 전에는 `자동 품질 점검` 섹션을 붙여 체류 일수, 실시간 확인 문구, 우천/휴무 대안, 동선 버퍼, 예약 준비 항목을 OK/확인으로 요약하고, 홈 목록과 상세 화면 상단에도 이 점검 결과를 배지로 보여줍니다. 홈 목록과 Discord 플랜 목록/선택 메뉴/요약은 이전 버전에 자동 품질 점검이 있으면 `개선 N` 또는 `추가 N`으로 경고 개수 변화도 함께 보여줍니다. 홈 목록의 `고도화 후보` 필터로 품질 확인 또는 미점검 플랜을 악화/확인 항목/미점검 우선순위로 모아보고, `품질 확인` 필터로 `확인` 항목이 남은 플랜만 확인 항목이 많은 순으로 모아볼 수 있고, `품질 악화`와 `품질 개선` 필터로 직전 버전보다 확인 항목이 늘거나 줄어든 플랜만 변화량이 큰 순으로 모아볼 수 있습니다. 홈 목록에는 전체 품질 요약 패널과 `고도화 후보`, `품질 확인`, `품질 OK`, `품질 미점검`, `품질 악화`, `품질 개선` 빠른 필터 버튼도 있어 드롭다운을 열지 않고 현재 카운트, 품질 OK 비율, 긴급 후보 수, 고도화 후보 구성, 기본/다음 품질 게이트 통과 여부, 많이 남은 확인 항목, 다음 액션을 확인한 뒤 `다음 목록 열기`로 바로 전환하거나 `다음 TODO 복사`로 `next=true` 기준 품질 TODO 텍스트를, `다음 TODO 전체`로 `next=true&all=true` 기준 전체 추천 품질 TODO를 복사하고, `게이트 요약`, `CSV`, `Report`, `Metrics`, `Events`, `Alert`, `Health`, `Runbook`, 실패 시 HTTP 409 본문도 복사하는 `CI 게이트`, `CI 명령`, `CI JSON 명령`, `CSV CI`, `Report CI`, `Metrics CI`, `Events CI`, `Alert CI`, `Runbook CI`, `npm CI`, `npm CI JSON`, `npm CSV`, `npm Report`, `npm Metrics`, `npm Events`, `npm Alert`, `npm Health`, `npm Runbook`, `CI 묶음`, `CI 가이드`, `JUnit XML`, `SARIF`, `Step 요약`, `Annotations`, `Outputs`, `PR 댓글`, `Artifacts`, `배지 MD`, `배지 SVG`, `로컬 CI`, `Actions CI`, `게이트 복사`, `완화 게이트`, `긴급 게이트`, `긴급 완화`, `다음 게이트 복사`, `다음 완화`로 기본/긴급/추천 품질 게이트와 후보 5개 이하 허용 게이트 결과 텍스트를 복사할 수 있고, 긴급 후보가 있으면 우선도 80 이상 플랜을 먼저, 없으면 가장 많이 악화된 플랜을, 그다음 확인 항목이 가장 많은 플랜을, 그래도 없으면 미점검 플랜을 최우선 대상으로 삼고, 긴급 후보 우선 여부와 후보 이유와 우선도를 함께 표시한 뒤 바로 열거나 `TODO 복사`, `TODO 3`/`TODO 5`/`TODO 10`, `TODO 전체`, `긴급 TODO`, `긴급 TODO 전체`로 `/api/plans/quality-todo` 기반 공유 가능한 품질 고도화 TODO를 만들 수 있습니다. `TODO 전체`는 `all=true`로 현재 고도화 후보 전체를 복사하고, `긴급 TODO`는 `urgent=true` 별칭으로 우선도 80 이상 후보만, `긴급 TODO 전체`는 `urgent=true&all=true`로 우선도 80 이상 후보 전체를 복사합니다. 각 버튼에는 현재 해당 플랜 수와 선택 상태가 함께 표시됩니다. 0개인 홈 품질 빠른 필터 버튼은 비활성화되고, 홈 검색/필터/빠른 필터/초기화 조작 때 이 카운트도 다시 조회합니다. 목록 힌트도 이 필터들의 의미와 TODO 복사 흐름을 설명하며, 보강할 플랜이 없으면 `품질 확인이 필요한 플랜이 없습니다.`로 안내합니다. Discord 플랜 선택 메뉴와 플랜 요약도 같은 품질 점검 결과를 `품질 OK` 또는 `품질 확인 N`으로 표시하고, `/qualitystatus`와 `/guide` 명령으로 내 플랜 품질 카운트, 품질 OK 비율, 긴급 후보 수, 고도화 후보 구성, 많이 남은 확인 항목, 후보 이유가 붙은 최우선 대상, 다음 액션을 본 뒤 카운트가 붙은 응답 버튼이나 `/qualitytodo`, `/qualityurgent`, `/qualitybrief`, `/quality`, `/qualityok`, `/qualityunaudited`, `/qualityworse`, `/qualitybetter`로 고도화 후보/긴급 후보/공유 TODO/보강/OK/미점검/악화/개선 목록을 이어볼 수 있습니다. 이때 0개인 Discord 품질 목록 버튼은 비활성화됩니다. 품질 경고가 남은 플랜은 Discord 플랜 버튼의 `품질 보강` 모달과 홈 목록의 `품질 보강` 링크로 보강 요청을 자동으로 채우고, 자동 품질 점검이 없는 웹/Discord 미점검 플랜은 `품질 점검 생성` 버튼으로 최신 품질 가드 요청을 고도화 모달에 바로 채울 수 있습니다. 상세 화면에서도 `고도화 문구 채우기` 버튼으로 같은 요청을 다시 채우거나 `보강 요청 복사` 버튼으로 클립보드에 복사할 수 있고, 자동 입력되면 고도화 폼 안내 메시지로 실행 전 확인을 유도합니다. 자동으로 채운 보강 요청에는 앞쪽 확인 항목 3개가 우선순위로 들어가 먼저 반영할 내용을 분명히 합니다. 고도화 저장 직후에는 웹 상세 완료 메시지와 Discord 완료 응답에 최신 버전의 품질 OK/확인 수와 직전 버전 대비 개선/추가 변화도 함께 표시됩니다.

## 현재 구현 요약

- 웹 서버: Node.js + Express (`webapp/server.js`)
- 저장소: SQLite(`webapp/data/plans.sqlite`) 지원. 기존 JSON은 명시적 migration 전까지 그대로 사용
- LLM 연동: Codex(OpenAI 호환) 또는 Claude 호출 (`webapp/src/llm.js`)
  - `LLM_API_KEY`/`OPENAI_API_KEY` 또는 `CLAUDE_API_KEY` 미설정 시 템플릿 폴백
- Discord `/plan`, `/quick`: 구조화된 grounded planner 사용 (`webapp/src/planner/`)
  - Open-Meteo 날씨, Google Places 영업시간, Google Distance Matrix 이동시간만 일정 근거로 사용
  - `GOOGLE_MAPS_API_KEY`와 Geocoding API, Places API (New), Distance Matrix API 활성화 필요
  - 당일치기부터 30박 31일까지 지원하며, 영업시간·이동시간·날씨·필수 장소 제약을 검증한 뒤 원본 `TripPlan`과 evidence를 함께 저장
  - 검증된 영업시간 장소만 배치하고, zone/category별 후보·유형별 체류시간·선호 시간대·식사/휴식 break를 deterministic planner가 적용
  - 항공 등 주요 교통과 현지 이동을 분리하며, 미확인 항공편·예보 범위 밖 날씨·stale evidence는 `/check`와 확인 작업에 명시
  - `/replace`, `/move`, `/replan`, `/refresh`는 저장된 사용자 제약을 재적용하며, 갱신 근거에서 제약을 충족할 수 없으면 revision 저장 전에 거부
  - planner search는 50개 후보·31일 범위에서 bounded approximate search로 동작하며 diagnostics에 beam 한계를 공개
  - grounded revision의 근거를 잃는 LLM 자유형 고도화는 차단하며, 변경 조건을 반영한 신규 `/plan` 또는 `/quick` 생성을 안내
- 오케스트레이션 기준: `.claude/skills/travel-orchestrator/SKILL.md`
  - 요구사항 수집, 날씨/교통/현지 정보 체크, 일정 최적화, 예약 준비, 품질 점검, 보고서 형식 반영

기존 JSON 저장소를 SQLite로 전환할 때는 서버와 Discord 봇을 중지한 뒤 실행합니다. 원본 JSON은 삭제하거나 덮어쓰지 않으며, 비어 있지 않은 SQLite 대상에는 migration을 거부합니다.

```bash
cd webapp
npm run storage:migrate:sqlite
```

성공 후 `TRAVEL_DB_PATH=data/plans.sqlite`를 설정합니다. 설정하지 않아도 `data/plans.sqlite`가 존재하면 서버와 Discord 봇이 SQLite를 우선 사용합니다.

grounded planner의 bounded benchmark와 오프라인 푸꾸옥 fixture dogfood는 다음처럼 실행합니다. dogfood 결과는 live Google/Open-Meteo 검증이 아닙니다.

```bash
cd webapp
npm run bench:planner
npm run dogfood:phu-quoc
```

- 핵심 API
  - `GET /api/plans`
  - `GET /api/plans?q=검색어`
  - `GET /api/plans?filter=upcoming`
  - `GET /api/backup`
  - `GET /api/plans/:id`
  - `GET /api/plans/:id/budget`
  - `GET /api/plans/:id/category-budget`
  - `GET /api/plans/:id/daily-budget?date=YYYY-MM-DD`
  - `GET /api/plans/:id/spending`
  - `GET /api/plans/:id/recap`
  - `GET /api/plans/:id/recap.md`
  - `GET /api/plans/:id/settlement?amount=금액`
  - `GET /api/plans/:id/settlement-matrix`
  - `GET /api/plans/:id/settlement-transfers`
  - `GET /api/plans/:id/settlement-message`
  - `GET /api/plans/:id/expenses?category=식비&date=YYYY-MM-DD&paid_by=민수`
  - `GET /api/plans/:id/expenses.csv?category=식비&date=YYYY-MM-DD&paid_by=민수`
  - `GET /api/plans/:id/calendar`
  - `GET /api/plans/:id/checklist`
  - `GET /api/plans/:id/emergency`
  - `GET /api/plans/:id/packing`
  - `GET /api/plans/:id/departure`
  - `GET /api/plans/:id/today-pack.md`
  - `GET /api/plans/:id/packs`
  - `GET /api/plans/:id/packs.txt`
  - `GET /api/plans/:id/packs.md`
  - `GET /api/plans/:id/packs.bundle.md`
  - `GET /api/plans/:id/packs.bundle.json`
  - `GET /api/plans/:id/packs.bundle.workflow-preflight.json`
  - `GET /api/plans/:id/packs.bundle.workflow-preflight.schema.json`
  - `GET /api/plans/:id/packs.bundle.lock.json`
  - `GET /api/plans/:id/packs.bundle.lock.md`
  - `GET /api/plans/:id/packs.bundle.summary.json`
  - `GET /api/plans/:id/packs.bundle.health.json`
  - `GET /api/plans/:id/packs.bundle.health.md`
  - `GET /api/plans/:id/packs.bundle.health.csv`
  - `GET /api/plans/:id/packs.bundle.health.schema.json`
  - `GET /api/plans/:id/packs.bundle.health.svg`
  - `GET /api/plans/:id/packs.bundle.health.metrics`
  - `GET /api/plans/:id/packs.bundle.health.alerts.yml`
  - `GET /api/plans/:id/packs.bundle.health.dashboard.json`
  - `GET /api/plans/:id/packs.bundle.health.events.json`
  - `GET /api/plans/:id/packs.bundle.health.events.schema.json`
  - `GET /api/plans/:id/packs.bundle.health.events.validation.json`
  - `GET /api/plans/:id/packs.bundle.health.report.md`
  - `GET /api/plans/:id/packs.bundle.artifacts.json`
  - `GET /api/plans/:id/packs.bundle.artifacts.csv`
  - `GET /api/plans/:id/packs.bundle.artifacts.schema.json`
  - `GET /api/plans/:id/packs.bundle.artifact-families.md`
  - `GET /api/plans/:id/packs.bundle.artifact-families.json`
  - `GET /api/plans/:id/packs.bundle.artifact-families-json.schema.json`
  - `GET /api/plans/:id/packs.bundle.artifact-families.csv`
  - `GET /api/plans/:id/packs.bundle.artifact-families.schema.json`
  - `GET /api/plans/:id/packs.bundle.schemas.md`
  - `GET /api/plans/:id/packs.bundle.schemas.json`
  - `GET /api/plans/:id/packs.bundle.schemas.csv`
  - `GET /api/plans/:id/packs.bundle.schemas.schema.json`
  - `GET /api/plans/:id/packs.bundle.command-presets.steps.csv`
  - `GET /api/plans/:id/packs.bundle.command-presets.steps.schema.json`
  - `GET /api/plans/:id/packs.bundle.handoff.txt`
  - `GET /api/plans/:id/packs.bundle.env`
  - `GET /api/plans/:id/packs.bundle.commands.sh`
  - `GET /api/plans/:id/packs.bundle.index.md`
  - `GET /api/plans/:id/packs.bundle.runbook.md`
  - `GET /api/plans/:id/packs.bundle.verify.md`
  - `GET /api/plans/:id/packs.bundle.verify.json`
  - `GET /api/plans/:id/packs.bundle.verify.csv`
  - `GET /api/plans/:id/packs.bundle.verify.schema.json`
  - `GET /api/plans/:id/packs.bundle.checksums.txt`
  - `GET /api/plans/:id/packs.bundle.checksums.json`
  - `GET /api/plans/:id/packs.bundle.checksums.csv`
  - `GET /api/plans/:id/packs.bundle.checksums.schema.json`
  - `GET /api/plans/:id/packs.csv`
  - `GET /api/plans/:id/packs.csv.schema.json`
  - `GET /api/plans/:id/share-pack.md`
  - `GET /api/plans/:id/money-pack.md`
  - `GET /api/plans/:id/full-pack.md`
  - `GET /api/plans/:id/memo-pack.md`
  - `GET /api/plans/:id/settlement-pack.md`
  - `GET /api/plans/:id/offline-pack.md`
  - `GET /api/plans/:id/file-guide.md`
  - `GET /api/plans/:id/readiness`
  - `GET /api/plans/:id/prep-plan`
  - `GET /api/plans/:id/readiness-share`
  - `GET /api/plans/:id/now`
  - `GET /api/plans/:id/next-action`
  - `GET /api/plans/:id/brief?date=YYYY-MM-DD`
  - `GET /api/plans/:id/today-check?date=YYYY-MM-DD`
  - `GET /api/plans/:id/tomorrow`
  - `GET /api/plans/:id/day-share?date=YYYY-MM-DD`
  - `GET /api/plans/:id/night-check?date=YYYY-MM-DD`
  - `GET /api/plans/:id/date/:date`
  - `GET /api/plans/:id/day/:day`
  - `GET /api/plans/:id/export`
  - `GET /api/plans/:id/maps`
  - `GET /api/plans/:id/share`
  - `GET /api/plans/:id/today`
  - `POST /api/plans`
  - `POST /api/plans/:id/duplicate`
  - `POST /api/plans/:id/expense`
  - `POST /api/plans/:id/note`
  - `POST /api/plans/:id/pin`
  - `POST /api/plans/:id/party-budget`
  - `POST /api/plans/:id/schedule`
  - `POST /api/plans/:id/refine`
  - `DELETE /api/plans/:id/expense/:expenseId`
  - `PATCH /api/plans/:id/expense/:expenseId`

## 실행

```bash
cd webapp
npm install
cp .env.example .env  # 키/경로 설정
npm run dev
```

브라우저에서 `http://localhost:3000`

## iPhone 홈 화면 설치

실제 설치 절차만 빠르게 따라가려면 [docs/IOS_INSTALL.md](docs/IOS_INSTALL.md)를 사용한다.

서버를 시작하면 터미널에 `iPhone install short URL`, 같은 Wi-Fi 후보 목록, public install URL, handoff note URL이 출력된다. 로컬에서 바로 설치를 확인할 때는 이 중 iPhone에서 열리는 `/i` 주소를 Safari에 입력하면 된다.

서버를 켜기 전 후보 주소만 먼저 보려면 `webapp/`에서 `npm run ios:install:urls`를 실행한다. 이 출력은 `deploymentMode`, `installReadiness`, `setupHint`, `nextStep`도 함께 보여줘 지금 상태가 실제 HTTPS iPhone handoff인지 로컬 리허설인지 먼저 구분한다. JSON으로 자동화에 넘기려면 `npm run ios:install:urls:json`을 사용한다.

실제 설치를 시작할 때는 `webapp/`에서 `npm run ios:install:start`를 먼저 실행한다. 이 명령은 검증을 새로 돌리지 않고 추천 iPhone Safari URL, 세션 QR, 다음 액션 보드, 설치 전 evidence 명령, 최종 HTTPS preflight 명령, final-pre-phone sequence, proof 저장 후 Mac 마무리 명령, 최종 HTTPS after-phone sequence, 앱 홈 첫 플랜 링크를 한 화면에 모아준다. 같은 계약을 자동화나 복사용 JSON으로 받으려면 `npm run ios:install:start:json`을 사용한다. JSON step list도 `before-phone-final`, `before-phone-final-next`, `after-phone-final` 단계를 별도로 포함한다. JSON과 schema를 evidence 파일로 남기려면 `npm run ios:install:start:evidence`를 사용한다. `npm run ios:install:evidence:before-phone`도 이 install-start evidence를 먼저 포함하므로, 실제 iPhone을 열기 전에 시작 안내 snapshot이 함께 보관된다. 최종 HTTPS Home Screen 설치 전에는 `npm run ios:install:evidence:before-phone:final`을 실행하면 before-phone evidence 뒤에 saved install-start freshness/HTTPS gate까지 이어서 확인한다.

최종 iPhone Home Screen 설치 증거로 진행하기 전에 HTTPS 공개 origin이 준비됐는지 실패 코드까지 강제하려면 `webapp/`에서 `npm run ios:install:start:gate`를 실행한다. 이 gate는 `TRAVEL_PLANNER_PUBLIC_ORIGIN`이 HTTPS가 아니면 같은 Wi-Fi 리허설 상태로 보고 실패한다.

앱 홈의 설치 카드는 `/api/install-info`를 읽어 현재 주소가 `localhost`이면 같은 Wi-Fi에서 iPhone이 열 수 있는 Mac LAN 주소 후보를 보여주고, `현재 주소 복사` 버튼도 그 설치 주소를 우선 복사한다. Web Share API를 지원하는 브라우저에서는 `iPhone으로 공유` 버튼으로 같은 설치 주소를 공유 시트에 바로 넘길 수 있다. 설치 화면의 상단 handoff strip은 일반 설치 전 명령, 최종 HTTPS preflight 명령, `npm run ios:install:evidence:before-phone:final:next` 기반 최종 설치 전 sequence를 별도 복사 버튼으로 보여준다. 체크리스트는 각 명령을 복사한 뒤 Mac 터미널에서 실행하고 통과 확인한 단계만 사용자가 직접 완료 표시하도록 안내한다.

`/api/install-info`는 `/install.html` 기준 `installUrl`, `recommendedInstallUrl`, `proofSaveUrl`, `lanInstallUrls`, HTTPS 여부, 배포 권장 문구를 반환한다. 설치 카드도 이 문구를 보여줘 로컬 LAN 주소와 실제 HTTPS 배포 주소의 차이를 명확히 안내한다. 텍스트 출력은 `evidenceCommandBeforePhoneFinal`, `evidenceCommandBeforePhoneFinalThenNext`, 그리고 각 terminal 명령도 포함해 최종 HTTPS preflight와 next-action refresh sequence를 서버 handoff 표면에서 확인할 수 있다.

배포 주소가 정해지면 서버 실행 환경에 `TRAVEL_PLANNER_PUBLIC_ORIGIN=https://example.com`을 설정한다. 값이 HTTPS이면 `/api/install-info`의 `recommendedInstallUrl`이 그 origin의 `/install.html`을 우선 사용하고, 설치 카드의 복사/공유/메일 링크도 같은 주소를 따른다. 문자 링크는 짧은 `/i` 설치 URL을 우선 사용해 iPhone 메시지에서 바로 열기 쉽게 한다.

HTTPS 배포 주소로 iPhone 설치용 `.env` 블록을 만들려면 `webapp/`에서 `npm run ios:install:env -- --origin=https://example.com`을 실행한다. 출력된 env block을 `webapp/.env`에 반영한 뒤 `npm run ios:install:urls`, `npm run ios:install:evidence:before-phone:final:next`, 설치 증거 저장 후 `npm run ios:install:evidence:after-phone:final` 순서로 설치 상태를 확인한다.

보호된 배포에서 iPhone에 접근 키를 함께 넘겨야 하면 `ios:install:env`, `ios:install:urls`, `/api/install-info.txt`, `/api/ios-install-handoff.txt`가 보여주는 `?travelAccessKey=YOUR_TRAVEL_ACCESS_KEY` 템플릿에 실제 키를 넣어 Safari로 연다. 설치 카드의 임시 입력으로 키 포함 URL을 복사할 수 있지만, 입력 키는 저장하거나 서버로 보내지 않고 복사 후 비운다. 앱은 URL로 전달된 값을 로컬 접근 키 저장소에 저장한 뒤 URL에서는 제거한다.

설치 루프가 어디까지 끝났는지 로컬 증거 파일 기준으로 요약하려면 `npm run ios:install:summary`를 실행한다. 이 명령은 새 검증을 실행하지 않고 기존 runbook/strict/launch-proof/proof report를 읽어 다음 단계만 알려준다. 같은 내용을 evidence 파일로 남기려면 `npm run ios:install:summary:file`을 사용한다. 완료 상태를 강제하는 마지막 확인에는 `npm run ios:install:summary:gate`를 사용한다. 저장된 summary contract를 별도로 확인하려면 `npm run ios:install:summary:check:file`을 사용한다. 이 확인 결과는 기본적으로 `reports/ios-install-summary-check.json`에 저장되며 `TRAVEL_IOS_INSTALL_SUMMARY_CHECK_PATH`로 경로를 바꿀 수 있다. 실제 iPhone 설치와 증거 저장까지 끝난 뒤 전체 evidence bundle을 한 번에 다시 남기고 gate하려면 `npm run ios:install:evidence:after-phone:final`을 사용한다.

배포 후 사람이 빠르게 확인하려면 `/api/install-info.txt`를 연다. 이 텍스트 요약은 추천 설치 URL, proof-save URL, 현재 요청 origin, `TRAVEL_PLANNER_PUBLIC_ORIGIN`, HTTPS 여부, LAN 설치 후보, 배포 권장 문구를 한 화면에 보여준다.

설치 절차를 한 번에 넘기려면 `/api/ios-install-handoff.txt`를 연다. 이 handoff 텍스트는 추천 설치 URL, 짧은 `/i` URL, iPhone Safari에서 할 단계, proof-save hash/target id/URL, 설치 증거 저장 후 확인할 `/api/ios-launch-proof.txt`와 `/api/ios-launch-proof/check` 링크, 마지막에 실행할 `ios:install:evidence:after-phone:final` archive/gate 명령을 함께 담는다. 브라우저에서 빠른 안내만 열려면 메인 앱 iPhone 설치 카드나 `/install.html`의 `quickstart 열기` 링크, `/api/ios-install-quickstart.txt`, 또는 `/api/ios-install-quickstart`를 사용한다. runbook과 `/api/ios-install-session.txt`도 proof-save hash/target id/URL, before-phone, final-preflight, final-pre-phone sequence, after-phone/final-after-phone 명령을 같은 sequence로 반복한다. 평소에는 `npm run ios:install:quickstart`로 전체 순서를 확인한 뒤, 필요하면 `npm run ios:install:quickstart:file`로 같은 안내를 `reports/ios-install-quickstart.txt`에 남긴다. 공유/회고용 quickstart 계약까지 확인하려면 `npm run ios:install:quickstart:evidence`를 실행한다. 짧은 operator 명령으로 `npm run ios:install:prepare`를 iPhone 설치 전에 실행하고, 홈 화면 Travel 앱에서 proof 저장 후 `npm run ios:install:finish`를 실행한다. 현재 할 일만 확인하려면 `npm run ios:install:status`를 쓴다. `ios:install:evidence:after-phone:final`은 proof 저장 후 postinstall evidence를 한 번 실행한 뒤 summary/gate/next evidence를 이어서 실행하며, completion summary/check도 canonical proof-save hash/target id/URL을 요구한다. 현재 다음 행동은 `/api/ios-install-next`와 `/api/ios-install-next.txt`에서 확인할 수 있고, proof 저장 뒤에는 `npm run ios:install:evidence:after-phone:final`을 추천한다. 저장된 install-start evidence가 있으면 next-action 출력에 `installStartReadiness`, freshness 상태, 시작 `/i` URL, 세션 QR, proof-save hash/target id/URL, before-phone/final-preflight/final-pre-phone sequence/after-phone/final-after-phone 명령도 함께 표시되어 오래된 같은 Wi-Fi 리허설과 최종 HTTPS handoff를 구분할 수 있다. 이 snapshot이 없거나 오래됐거나 최종 HTTPS 준비 전이면 `installStartRecommendedAction`과 `installStartRecommendedCommand`가 재생성/gate 명령을 안내하고, fresh + HTTPS-ready 상태이면 같은 recommended command가 `npm run ios:install:evidence:before-phone:final:next` 기반 sequence를 가리킨다. ops evidence summary와 readiness report도 quickstart check 상태, proof target, `prepare/status/finish` 명령, `beforePhoneFinalTerminalCommand`, `beforePhoneFinalThenNextTerminalCommand`, `afterPhoneThenAllFinalTerminalCommand`를 보여줘 사람용 handoff와 최종 preflight/sequence 명령을 report에서 확인할 수 있다. readiness JSON check는 install-start artifact가 8단계가 아니거나 최종 preflight/sequence/final after-phone 명령이 빠지면 iOS install evidence repair target으로 표시한다. iPhone에서 URL을 열기 전 자동화 단계에서 실패 코드까지 강제하려면 `webapp/`에서 `npm run ios:install:next:gate`를 실행한다. 설치 카드의 현재 다음 행동 영역은 next-action payload가 아직 없어도 install-info 기반 `proofSaveUrl`과 `installQuickstartUrl`을 handoff 표면으로 제공한다.

다음 행동 payload는 `ios-install-session-check.json`도 읽는다. strict pre-install evidence는 준비됐지만 session recovery evidence가 없거나 깨졌으면 `/api/ios-install-next`는 iPhone 설치로 넘어가기 전에 `npm run ios:install:session:evidence`를 먼저 안내한다. 텍스트 출력에는 `sessionCheckOk`, `sessionCheckRecoveryUrl`, `sessionCheckRecoveryTrigger`, `sessionCheckRecoverySequenceCount`, `sessionCheckFinalGateCommand`가 포함된다.
session recovery evidence가 준비되지 않은 경우 next-action payload/text의 `sessionCheckRecommendedCommand`와 `sessionCheckRecommendedNpmScript`도 같은 repair command를 노출한다.
설치 카드도 같은 `sessionCheck`를 보여준다. `세션 복구 evidence 준비됨`이면 iPhone 설치 전에 app-shell recovery sequence가 구조화되어 있다는 뜻이고, `세션 복구 evidence 필요`이면 표시된 Mac 명령으로 session evidence를 먼저 갱신한다.
`세션 evidence 명령 복사` 버튼은 `test -d webapp && cd webapp; npm run ios:install:session:evidence`를 복사해서, iPhone으로 넘어가기 전에 session recovery 계약을 바로 보강할 수 있게 한다.
설치 카드의 `세션 evidence 명령 복사` 버튼은 next-action payload의 `sessionCheck.recommendedCommand`가 있으면 그 값을 우선 복사한다.
같은 row의 `npm script 복사` 버튼은 `sessionCheck.recommendedNpmScript` 또는 `npm run ios:install:session:evidence`를 복사해, 이미 `webapp/` 디렉터리에 있는 터미널에서 바로 실행할 수 있게 한다.
`/api/ios-install-completion-status`와 text 출력도 session recovery evidence gate를 포함한다. `sessionRecoveryOk=false`이면 completion gate에 `test -d webapp && cd webapp; npm run ios:install:session:evidence` repair command가 같이 표시된다.
`complete=true`도 `sessionRecoveryOk=true`를 요구하므로, session recovery evidence가 없거나 실패한 상태는 최종 설치 완료로 보지 않는다.
`/ios-install-status` HTML 페이지는 `Session recovery evidence` 카드를 렌더링하고, 상태 복사 payload에도 `sessionRecoveryOk`, trigger, sequence count, issue count, repair command/script를 포함한다.
`sessionRecoveryOk=false`이면 이 카드는 `/ios-install-status`의 next-action 바로 아래에 승격되어 final gate 카드보다 먼저 보인다.
session recovery gate가 첫 미완료 gate이면 이 카드는 next-action 패널보다도 먼저 보여서 repair command가 가장 먼저 보인다.
`/ios-install-status` 상단에는 `첫 미완료 gate로 이동` 링크가 표시되고, 상태 복사 payload, 다음 액션 문자/메일/share payload, QR scan-board handoff에는 `firstIncompleteGateHref`가 포함된다.
`/install.html`의 설치 완료 판정 카드에는 최종 gate 명령 복사 버튼이 한 번만 표시되어 마무리 단계에서 같은 명령을 중복 선택하지 않게 한다.
`/install.html`의 기본 설치 주소 입력 바로 옆에는 `설치 주소 복사`, `전체 URL 공유`, `짧은 URL 문자`, `전체 URL 메일` handoff가 있어 iPhone Safari로 보낼 첫 URL을 상단에서 즉시 옮길 수 있다. 문자 handoff는 짧은 `/i` URL을 우선 사용하고, 복사/메일/share는 전체 설치 URL과 설명을 유지한다. 같은 상단 블록은 Safari 열기, 홈 화면에 추가, Travel 아이콘 실행, 설치 증거 저장 버튼 이동, Mac final gate 명령 복사 버튼 이동, 최종 완료 상태 확인까지 바로 보여주고, 1분 설치 루트도 iPhone의 Safari/Home Screen launch/proof 저장 단계와 Mac의 final gate/최종 완료 상태 확인 단계로 나뉘어 이어지고, Mac 그룹에서 proof 저장 후 진행 전제를 다시 안내한 뒤 final gate 명령을 바로 복사할 수 있으며 버튼 설명도 그 전제를 참조하고 Home Screen proof 저장 전에는 비활성 상태와 잠김 이유 및 proof 저장 이동 링크를 함께 보여주고, 서버 saved proof가 준비됨이면 빠른 루트 final gate 버튼도 열린다, 서버 saved proof 확인이 막히면 다시 잠긴다, note와 버튼 설명에 재저장/재확인 이유를 남긴다, Mac 그룹에서 최근 proof를 바로 다시 확인할 수 있다, 확인 뒤 live status인 message와 meta를 함께 담고 loading 상태 진행 cue와 loading/empty/ready/blocked 상태별 focus outline을 가진 atomic live status 최근 proof 결과 영역과 aria-busy가 붙는 빠른 루트 proof 재확인 버튼과 전용 busy style 및 busy title/aria-label 및 1400ms 이름 있는 delay를 쓰는 짧은 완료 라벨과 delayed reset token guard, ready/empty/blocked 결과별 완료 라벨과 blocked/empty reason title/aria-label과 empty 상태 proof 저장 복귀 힌트 및 proof 저장 포커스 이동과 전용 busy style 및 busy title/aria-label 또는 상태 카드로 이동한다. `#iosInstallProofSaveButton`으로 열린 홈 화면 앱은 proof 저장 버튼으로 스크롤하고 포커스한 뒤 짧게 강조하고, `#iosInstallCompletionFinalGateButton`은 final gate 명령 복사 버튼을 같은 방식으로 강조한다. proof-save hash와 final gate hash는 페이지 초기 로드 시에도 같은 scroll/focus/highlight를 적용한다. proof 저장 성공 후 마지막 Mac evidence 패널은 `cd webapp`까지 포함한 paste-ready final gate 명령과 `/ios-install-status` 링크를 함께 보여준다. final gate 명령 복사 피드백은 Mac 실행 후 `/ios-install-status`에서 남은 gate를 확인하라고 안내하고, 바로 열 수 있는 `최종 완료 상태 확인` 링크와 복사한 명령 라벨, terminal command, completion status URL, helper 설명과 aria-describedby로 연결되고 Mac final gate 이후 맥락을 visible label/title/aria-label에 담은 URL 복사/공유/문자/메일 action group 및 좁은 화면에서도 줄바꿈되는 visible live status line을 포함한 visible helper를 표시하며, 기본 다음 단계 안내도 복사/공유/문자/메일 handoff를 모두 이름 붙인다. 문자/메일 handoff 클릭도 main status와 action group status, 링크 title/aria-label에 결과 feedback과 aria-busy/aria-disabled 및 higher-contrast busy style을 남기고, URL 복사/공유 버튼도 disabled aria-busy 상태에서 같은 고대비 busy style을 쓰며 짧은 busy 구간의 반복 tap은 이미 여는 중 안내를 남긴 뒤 무시하며 외부 앱 handoff 전용 reset 창을 연장하고 token guard를 통과할 때만 action group live status와 링크 라벨/busy 상태를 기본 다음 단계 안내로 되돌린다. URL 복사/공유 실행 중에는 action group과 해당 버튼을 aria-busy로 표시하고 그룹에는 busy outline과 `작업 중` visible text를 보여주며 버튼은 disabled와 버튼별 busy token으로 잠가 중복 실행을 막고 버튼/상태줄/title/aria-label에 진행 중과 결과 feedback을 보여준다. 공유 취소와 복사/공유 성공, prompt fallback feedback 후 action group live status와 버튼 라벨 및 title/aria-label을 같은 기본 다음 단계 안내로 되돌리고 delayed reset token으로 오래된 reset이 새 feedback/라벨/busy 상태를 덮지 않게 하며 reset helper는 live status line 표시도 함께 복원하고 반복 fallback에서도 helper 안내를 중복 누적하지 않는다. 긴 terminal command는 좁은 화면에서도 줄바꿈하고 title/aria-label/aria-describedby도 같은 final gate 이후 확인 맥락을 담고 표시 직후 짧게 강조하며 reduced-motion 설정에서는 즉시 이동하고 일반 환경에서는 화면 중앙으로 스크롤한 뒤 포커스한다. 다른 install command, 설치 URL/짧은 URL/Safari 주소/QR evidence handoff를 실행하거나 기본/세션/보호 설치 문자·메일·공유·복사 handoff 및 보호 접근 키 입력/보기/비우기를 하면 이 완료 상태 링크와 helper는 숨기고 href/text/title/aria-label/aria-describedby와 pulse 상태도 비워 stale 후속 링크를 남기지 않는다.

`/install.html` head에는 description과 Open Graph title/description/type/site_name metadata가 있어 메시지나 메일로 설치 링크를 보낼 때 iPhone 설치, proof 저장, Mac final gate handoff 목적이 preview에 드러난다.
`/manifest.webmanifest`는 홈 화면 설치 앱 identity를 안정적으로 유지하도록 stable `id`, Korean description/lang, travel/productivity/utilities categories, `prefer_related_applications=false`를 포함한다.

같은 head metadata는 Korean Open Graph locale과 summary-card title/description도 포함해 메신저나 social preview가 Open Graph만 보지 않는 경우에도 설치 링크의 목적을 유지한다.
서버의 `/api/ios-install-next`도 `TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH` 또는 기본 `reports/ios-install-session-check.json`을 읽어 설치 카드와 CLI next-action이 같은 session recovery evidence 상태를 보게 한다.

설치 카드의 `설치 안내 복사` 버튼은 같은 handoff 텍스트를 클립보드에 담는다. Node 서버 API가 있으면 `/api/ios-install-handoff.txt` 내용을 복사하고, 정적 호스팅이면 현재 카드가 알고 있는 추천 설치 URL, 짧은 URL, proof-save URL로 만든 fallback 안내를 복사한다.

Node 서버가 있는 설치 카드에는 `/api/install-qr.svg` 기반 QR도 표시된다. 데스크톱에서 설치 화면을 열고 iPhone 카메라로 QR을 스캔하면 추천 설치 URL을 Safari로 바로 열 수 있다. `ios:install:check` 출력에는 `installQrSvgUrl`과 `installQrTargetUrl`도 포함되며, QR target은 `recommendedInstallUrl`과 일치해야 한다. QR SVG endpoint까지 readiness gate로 묶으려면 `--require-install-qr`를 붙인다. `--follow-recommended`와 함께 쓰면 추천된 public origin의 QR SVG를 fetch하고 `installQrFetchUrl`/`installQrFetchTargetUrl`에 기록한다. 같은 QR gate는 `recommendedShortInstallUrl`을 `target=`으로 넣은 QR도 fetch해 selected-LAN QR target 경로가 살아있는지 `installQrTargetParamFetchUrl`에 남긴다. 실제 iPhone에서 선택한 후보를 증거로 남기려면 `--install-qr-target=http://맥IP:3000/i` 또는 `TRAVEL_IOS_INSTALL_QR_TARGET_URL`을 사용한다.

배포 후 자동 점검은 `webapp/`에서 `npm run ios:install:check -- --origin=https://example.com`을 실행한다. 자동화 evidence가 필요하면 `--json`을 붙이고, 파일로 남기려면 `--output=reports/ios-install-check.json`을 함께 쓴다. iOS 설치 점검 스크립트는 기본으로 `webapp/.env`를 읽고, 배포용 env 파일을 따로 쓰려면 `--env=../prod.env`를 넘긴다. `TRAVEL_PLANNER_PUBLIC_ORIGIN`이 `.env` 또는 실행 환경에 이미 설정되어 있으면 `npm run ios:install:check:json` 또는 `npm run ios:install:check:file` 프리셋을 사용할 수 있고, schema evidence는 `npm run ios:install:check:schema:file`로 저장한다. result와 schema를 함께 남기려면 `npm run ios:install:evidence`를 실행한다. 실사용 설치 전에는 `npm run ios:install:check:strict` 또는 `npm run ios:install:evidence:strict`로 추천 public URL, HTTPS handoff, QR SVG를 함께 확인한다. 홈 화면 설치 후 `설치 증거 저장`까지 끝났다면 `npm run ios:install:evidence:proof`로 launch proof까지 포함한 최종 evidence를 남긴다. `TRAVEL_IOS_INSTALL_CHECK_PATH`와 `TRAVEL_IOS_INSTALL_CHECK_SCHEMA_PATH`로 file preset 저장 경로를 바꿀 수 있다. 상대 출력 경로는 `webapp/` 기준으로 해석된다. 느린 터널/배포 endpoint는 `TRAVEL_IOS_INSTALL_CHECK_TIMEOUT_MS` 또는 `--timeout-ms=15000`으로 점검 timeout을 늘릴 수 있다. JSON 출력은 `schemaVersion: 1`이며 schema는 `webapp/src/ios-install-check.schema.json`에 있다. 실제 iPhone handoff 기준은 `handoffReady=true`이며, 이는 `status=ready`와 `readinessMode=stable-https`를 뜻한다. `--require-handoff-ready`를 붙이면 `handoffReady=true`가 아닐 때 점검이 실패하므로 로컬 HTTP 리허설을 실사용 준비로 착각하지 않게 막을 수 있다. 실제 설치 완료까지 gate로 묶으려면 iPhone 홈 화면 앱에서 `설치 증거 저장`을 누른 뒤 `--require-launch-proof`를 붙인다. 이 옵션은 `/api/ios-launch-proof/check`가 `ok=true`일 때만 통과한다. `--follow-recommended`와 함께 쓰면 추천된 public origin에서 launch proof를 확인한다. `local-http-check`는 같은 Wi-Fi 리허설로만 본다. `blocked`, `not-ready`, 또는 `error`면 아직 iPhone 설치 준비 완료로 보지 않는다. 로컬 서버가 `TRAVEL_PLANNER_PUBLIC_ORIGIN`을 추천하는지까지 확인하려면 `--follow-recommended`를 붙인다. 로컬 HTTP 확인은 `--allow-http`를 붙인다.

iPhone 홈 화면 앱은 홈 목록을 성공적으로 불러올 때마다 브라우저 로컬 저장소에 마지막 목록 snapshot을 남긴다. 네트워크가 끊긴 상태에서 `/api/plans`를 불러오지 못하면 마지막 snapshot으로 미션 보드와 목록을 렌더링하고, 오프라인 snapshot 안내를 표시한다.

상세 플랜 화면도 `/api/plans/:id`를 성공적으로 불러올 때마다 마지막 상세 snapshot을 저장한다. 네트워크가 끊긴 상태에서 같은 상세 URL을 다시 열면 저장된 본문과 revision history를 읽기 전용으로 렌더링하고 서버 액션 버튼/입력을 비활성화한다.

홈 화면 앱으로 실행하면 설치 카드에 첫 실행 체크리스트가 표시된다. Travel 아이콘 실행 여부는 자동으로 완료 처리되고, 설치 증거 저장/첫 플랜 생성/오프라인 snapshot 읽기 확인 진행은 iPhone `localStorage`에 저장된다. 첫 플랜 생성과 오프라인 snapshot fallback은 실제 발생 시 자동 완료된다.
홈 화면 앱으로 실행 중이면 설치 카드 제목은 `Travel 앱 실행 중`, eyebrow는 `홈 화면 앱`으로 바뀌고, Safari에서는 기존 `iPhone 홈 화면에 설치` 안내로 돌아간다.
홈 화면 앱 실행 중 설치 카드에는 `Travel 앱에서 바로 하기` 패널이 표시되어 `새 플랜 시작`과 `완료 상태 확인`으로 바로 이동할 수 있고, Safari 설치 화면에서는 숨겨진다. 같은 패널의 설치 성공 체크는 주소창 없음, proof 저장, Mac final gate, 첫 플랜 생성, 완료 상태 review를 한 번에 보여준다.
Home Screen 전용 `새 플랜 시작` CTA는 탭 즉시 `#planForm`으로 이동하고 목적지 입력에 focus를 주며, value-free clicked/focus 상태를 설치 카드 dataset에 남긴다.
Home Screen standalone 모드에서는 모바일 폭에서 하단 floating submit dock이 표시되어 긴 새 일정 폼을 스크롤한 뒤에도 기존 제출 버튼을 빠르게 실행할 수 있고, dock 상태와 클릭 결과는 value-free 진단에 포함된다.
Floating submit dock은 원본 제출 버튼의 `aria-busy`/`disabled` 변화를 관찰해 하단 버튼의 disabled/busy 상태와 status text를 동기화하고, observed/syncedAt/busy/disabled 상태를 value-free 진단에 포함한다.
Floating submit dock은 `planForm` 입력/선택/textarea에 focus가 있으면 iPhone 키보드를 가리지 않도록 숨고, blur 후 다시 표시되며 keyboard hidden/restored/focus name 상태를 value-free 진단에 포함한다.
Floating submit dock은 하단 제출 전 native form validation을 호출하고, 필수 입력 누락 시 입력값 없이 invalid 필드 이름/source/timestamp/feedback만 value-free 진단에 남긴다.
Invalid dock feedback은 누락된 필드로 scroll/focus를 이동하고 짧게 강조하며, focus target/applied/reduced-motion 상태만 value-free로 복사한다.
키보드 때문에 하단 dock이 숨겨져도 Invalid dock feedback은 필드 옆 inline 안내로 남고, inline visible/field/feedback/shown/cleared 상태만 value-free로 복사한다.
Invalid dock feedback은 사용자가 필수 입력을 채워 폼이 유효해지면 cleared/remaining/source 상태만 value-free로 남기고 하단 상태 문구를 복구한다.
Invalid recovery 후에는 다음 행동을 `tap-submit-dock`으로 남겨 사용자가 하단 버튼을 다시 누르면 된다는 흐름을 iPhone 진단에서 확인할 수 있다.
하단 dock이 원본 제출 버튼을 실행하면 submit started/source/status feedback 상태를 value-free로 남겨 첫 플랜 생성 요청이 시작됐는지 확인할 수 있다.
하단 dock 제출이 시작된 뒤에는 submit pending/source/timestamp도 value-free로 남겨 느린 네트워크에서도 요청 대기 상태를 구분할 수 있다.
원본 제출 버튼이 결과를 기록하면 하단 dock도 submit finished/result/source 상태를 value-free로 남겨 pending이 끝났는지 확인할 수 있다.
Home Screen 전용 `새 플랜 시작` CTA도 iOS 동작 줄이기 설정을 존중해 reduced-motion이면 즉시 이동하고, 일반 설정에서는 smooth scroll을 유지한다.
Home Screen 전용 `완료 상태 확인` CTA는 이동 직전에 value-free clicked route/label/timestamp와 live status를 남겨, 앱 안에서 최종 상태 확인으로 넘어가는 맥락을 보존한다.
iPhone 진단 복사는 Home Screen 전용 CTA의 표시 여부, 새 플랜 클릭 route/label/timestamp/focus/reduced-motion, 완료 상태 클릭 route/label/timestamp/status feedback도 value-free로 포함한다.
Home Screen 전용 CTA 클릭 상태는 `sessionStorage` carryover에도 value-free로 저장되어, 완료 상태 이동/홈 복귀 뒤에도 진단 복사에서 마지막 CTA action/route/label/timestamp/focus/reduced-motion/status feedback을 확인할 수 있다.
CTA carryover 진단은 15분 기준 age/stale/max-age 값도 포함해 마지막 CTA 흔적이 최근 행동인지 오래된 흔적인지 구분한다.
Stale CTA carryover는 별도 carryover 진단에는 남지만 active clicked/focus 상태로 승격되지 않으며, fresh carryover만 현재 CTA 상태 fallback으로 사용된다.
Carryover ignored reason은 `none`, `stale`, `missing-clicked-at`, `unknown`으로 복사되어 fresh gate가 왜 active CTA 상태로 승격하지 않았는지 확인할 수 있다.
Carryover promoted/ignored feedback도 복사되어 fresh CTA carryover가 active 상태로 승격됐는지와 stale/malformed carryover가 왜 무시됐는지를 사람이 읽을 수 있다.
Stale CTA carryover는 진단 복사 시 이번 payload에 clear marker를 남긴 뒤 `sessionStorage`에서 제거되어, 다음 진단부터 오래된 CTA 흔적이 반복되지 않는다.
Stale CTA carryover cleanup은 성공 시 `cleared*`, 실패 시 `cleanupFailed*` 필드를 분리해 storage-error와 성공 시각이 섞이지 않게 한다.
기본 `.container` padding은 iPhone Home Screen safe-area inset을 반영해 노치와 홈 인디케이터 주변에서도 카드와 CTA가 화면 가장자리에 붙지 않게 한다.
전역 iOS touch polish는 `text-size-adjust: 100%`, `100dvh` 최소 높이, 세로 overscroll containment, 주요 컨트롤의 iOS tap highlight 색을 지정해 홈 화면 앱의 웹뷰 느낌을 줄인다.
`html`에도 앱 배경과 `color-scheme: light`를 명시해 iPhone Home Screen status/bounce 영역과 폼 컨트롤 색상이 light 앱 UI와 끊기지 않게 한다.

홈 화면 앱으로 실행한 홈 화면에는 `iPhone 빠른 실행` 패널도 표시된다. 이 패널은 새 플랜, 최근 여행, 설치 체크, 최근 증거 링크를 모아주고 첫 실행 체크 진행도와 로컬 오프라인 snapshot 개수를 보여준다. 저장된 홈 목록 snapshot이 있으면 최신 여행 상세 링크도 최대 3개까지 바로 보여준다.

`iPhone 빠른 실행` 패널의 `iPhone 진단 복사` 버튼은 현재 URL, standalone 여부, service worker 상태, 온라인 여부, 설치 체크리스트, 오프라인 snapshot 개수, 최근 snapshot 플랜 링크를 한 번에 클립보드로 복사한다.

같은 패널의 `오프라인 snapshot 정리` 버튼은 이 iPhone의 홈/상세 offline snapshot만 삭제한다. 서버의 저장된 여행 플랜은 삭제하지 않으며, 실행 전 확인창을 띄운다.

`상태 새로고침` 버튼은 서버 호출 없이 이 iPhone의 첫 실행 체크리스트, 설치 증거 진행, 홈/상세 snapshot 개수, 최신 snapshot 여행 링크를 다시 계산해 패널에 반영한다.

홈 화면 앱의 `새 플랜` shortcut으로 `/#planForm`이 열리면 새 플랜 폼은 입력 링크와 값 없는 초안 상태 handoff를 보여준다. 문자/메일 앱으로 보낸 뒤 돌아와도 해당 링크의 title/aria-label은 기본 설명으로 복구되어 반복 탭이나 보조기술 사용 시 이전 busy 상태가 남지 않는다.

이 shortcut 안내 그룹은 입력 링크, 초안 상태, 설치/닫기 action label을 함께 설명에 연결해 iPhone VoiceOver에서도 각 handoff 묶음의 의미가 남도록 한다.

동적으로 다시 표시될 때도 안내 그룹의 label/title이 설치 완료 상태 확인과 안내 닫기 맥락을 함께 말해 정적 마크업과 같은 의미를 유지한다.

복사/공유/문자/메일 handoff feedback이 끝난 뒤에는 안내 그룹의 label/title도 기본 shortcut 설명으로 돌아와 이전 완료/취소/진행 중 문구가 반복 사용 중 오래 남지 않는다.

`/#planForm` shortcut과 Home Screen dock의 새 플랜 도착 안내는 현재 실행 모드가 홈 화면 앱인지, iPhone Safari인지, 일반 브라우저 탭인지도 알려줘 설치 직후 첫 플랜 입력이 실제 앱 모드에서 시작됐는지 바로 확인하게 한다.

같은 도착 안내에는 값 없는 `1분 설치` 링크도 있어 Safari나 브라우저 탭에서 들어온 사용자가 바로 `/install.html#iosInstallFastPathTitle`로 돌아가 홈 화면 추가 절차를 다시 확인할 수 있다.

`1분 설치` 링크를 누를 때도 value-free navigation feedback을 남겨, 보조기술 사용자가 새 플랜 입력에서 설치 가이드 1분 설치 루트로 이동한다는 맥락을 듣고 이동할 수 있다.

새 플랜 shortcut helper의 설치 루트/설치 완료 상태 링크 참조는 표시, 숨김, 클릭 바인딩 전에 한 번씩 선언되어 반복 진입 시 런타임 참조 오류를 만들지 않는다.

`1분 설치` 링크의 title/aria-label과 클릭 feedback은 홈 화면 앱, iPhone Safari, 일반 브라우저 탭 실행 모드에 맞춰 왜 1분 설치 루트로 돌아가는지 설명한다.

`1분 설치` 링크의 href, visible label, title, aria-label, described-by metadata는 하나의 helper에서 세팅되어 정적/동적 표시가 다시 어긋나지 않게 한다.

이 링크의 화면 라벨은 iPhone Safari/브라우저 탭에서는 `1분 설치`, 홈 화면 앱 모드에서는 `설치 확인`으로 표시해 현재 맥락에 맞는 설치 복귀/확인 링크임을 바로 알 수 있다.
홈 화면 앱 모드의 `설치 확인`은 `/ios-install-status`로 이동하고, iPhone Safari/브라우저 탭의 `1분 설치`는 `/install.html#iosInstallFastPathTitle`로 이동한다.
홈 화면 앱 모드에서는 `설치 확인`이 이미 완료 상태로 이동하므로 별도 `설치 완료 상태` 링크는 숨기고, Safari/브라우저 탭에서는 `1분 설치`와 `설치 완료 상태`를 함께 보여준다.
새 플랜 shortcut 안내 그룹 title도 같은 규칙을 따라 홈 화면 앱 모드에서는 `설치 확인과 안내 닫기`, Safari/브라우저 탭에서는 `1분 설치`, `설치 완료 상태`, `안내 닫기` 맥락을 말한다.
같은 그룹의 aria-label도 동일한 mode-aware 설치 맥락을 사용해 보조기술이 title과 같은 설치 확인/1분 설치 구성을 듣게 한다.
설치/닫기 action chip도 홈 화면 앱 모드에서는 `설치 확인/닫기`, Safari/브라우저 탭에서는 `1분 설치/닫기`로 표시되어 visible label과 실제 링크 목적지가 같이 움직인다.
도착 안내를 닫거나 입력을 시작하면 이 chip metadata는 기본 `설치/닫기` 설명으로 돌아가 다음 shortcut 진입 전에 이전 실행 모드 문구가 DOM에 숨어 남지 않는다.
같은 숨김 경로에서 `1분 설치`와 `설치 완료 상태` 링크의 href, visible label, title, aria-label도 정적 기본값으로 복구되어 다음 진입 전 mode-aware 링크 잔상이 남지 않는다.
도착 안내 그룹 자체도 숨김 시 기본 aria-label/aria-describedby로 돌아가고 title을 비워 이전 실행 모드의 설치 확인/1분 설치 문구가 그룹 metadata에 남지 않는다.
설치 확인/1분 설치 또는 설치 완료 상태 링크 클릭 feedback도 네비게이션이 바로 떠나지 않는 경우 짧은 reset 뒤 기본 그룹 설명으로 돌아간다.
도착 안내가 표시되는 동안 그룹에는 `data-install-action-mode`, `data-install-action-href`, `data-install-action-label`, `data-install-action-destination`, `data-install-action-updated-at`이 남아 현재 `설치 확인`/`1분 설치` 결정이 어떤 실행 모드와 목적지에서 언제 계산됐는지 운영자가 확인할 수 있다. 숨김 시 이 값도 제거된다.
`iPhone 진단 복사` 텍스트에도 같은 install action visible/mode/href/label/destination/updatedAt 필드가 값 없이 들어가 iPhone에서 개발자 도구 없이도 현재 shortcut 설치 결정을 공유할 수 있다.
같은 진단 텍스트는 `newPlanShortcutInstallActionDraftValues=excluded`와 `newPlanShortcutInstallActionLlmSecrets=excluded`도 함께 포함해 shortcut 설치 action 진단이 입력값과 LLM 비밀값을 내보내지 않는다는 경계를 명시한다.
`iPhone 진단 복사` 버튼의 title/aria-label도 이 install action 필드와 제외 표시를 설명해, 누르기 전에 어떤 value-free 진단이 복사되는지 알 수 있다.

`npm run ops:workflows`의 `iOS Home Screen install` 그룹에서도 기본 점검, strict pre-install evidence, proof post-install evidence 명령을 확인할 수 있다. 같은 그룹의 Examples에는 `ios:install:check -- --require-install-qr --install-qr-target=<selected /i URL>` 템플릿도 있어 실제 선택한 iPhone LAN QR 후보를 보관하는 흐름을 바로 찾을 수 있다. Examples의 `<...>` placeholder는 그대로 실행하지 말고 실제 선택 URL로 바꾼다. `/api/install-info.txt`와 `/api/ios-install-handoff.txt`에도 같은 base/strict/proof evidence 명령이 포함되어 iPhone 설치 단계와 Mac evidence 캡처 순서를 함께 복사할 수 있다.

`npm run ops:evidence:paths`와 evidence manifest에는 `TRAVEL_IOS_INSTALL_QUICKSTART_PATH` 기반 quickstart text artifact, `TRAVEL_IOS_INSTALL_QUICKSTART_JSON_PATH` 기반 quickstart JSON artifact, `TRAVEL_IOS_INSTALL_QUICKSTART_CHECK_PATH` 기반 quickstart check artifact, `TRAVEL_IOS_INSTALL_QUICKSTART_CHECK_SCHEMA_PATH` 기반 quickstart check schema artifact, `TRAVEL_IOS_INSTALL_START_PATH` 기반 install-start guide artifact, `TRAVEL_IOS_INSTALL_START_SCHEMA_PATH` 기반 install-start schema artifact, `TRAVEL_IOS_INSTALL_CHECK_PATH` 기반 `iOS install readiness check` artifact, `TRAVEL_IOS_INSTALL_CHECK_STRICT_PATH` 기반 strict readiness artifact, `TRAVEL_IOS_INSTALL_CHECK_PROOF_PATH` 기반 proof readiness artifact, `TRAVEL_IOS_INSTALL_CHECK_SCHEMA_PATH` 기반 schema artifact, `TRAVEL_IOS_INSTALL_SESSION_SCHEMA_PATH` 기반 session schema artifact, `TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH` 기반 session recovery check artifact, `TRAVEL_IOS_INSTALL_HANDOFF_PATH` 기반 handoff Markdown artifact, `TRAVEL_IOS_INSTALL_SUMMARY_PATH` 기반 completion summary artifact, `TRAVEL_IOS_INSTALL_SUMMARY_SCHEMA_PATH` 기반 completion summary schema artifact, `TRAVEL_IOS_INSTALL_SUMMARY_CHECK_PATH` 기반 summary check artifact, `TRAVEL_IOS_INSTALL_SUMMARY_CHECK_SCHEMA_PATH` 기반 summary check schema artifact가 포함된다.
Manifest check는 quickstart text/JSON/check/check-schema artifact의 `artifactKind`, `target`, `validatesTarget`, summary role metadata도 확인해 manifest-first 소비자가 사람용 iPhone 설치 handoff 계약을 놓치지 않게 한다.
Ops evidence summary는 session recovery check가 있으면 `sessionRecoveryOk`, `sessionRecoveryUrl`, `sessionRecoveryTriggerField`, `sessionRecoveryTriggerValue`, `sessionRecoverySequenceCount`, `sessionRecoveryFinalGateCommand`, `sessionRecoveryIssueCount`를 함께 보존한다.
Readiness report Markdown/JSON도 같은 session recovery fields를 전달하며, Markdown의 `iOS install evidence status` 줄에는 `sessionRecoveryOk`, `sessionRecovery`, `sessionRecoveryUrl`, `sessionRecoveryTrigger`, `sessionRecoverySteps`, `sessionRecoveryFinalGate`, `sessionRecoveryIssues`가 표시된다.
Readiness JSON check는 `iosInstallSessionCheck` 항목이 missing이거나 present인데 `sessionRecoveryOk=true`가 아니면 `sessionRecovery-missing` 또는 `sessionRecovery-not-ready` 계열 오류로 repair target을 만들며, iPhone 설치 전에는 `npm run ios:install:session:evidence`를 먼저 다시 실행해야 한다.
해당 repair target에는 `recommendedCommand=test -d webapp && cd webapp; npm run ios:install:session:evidence`와 `recommendedNpmScript=npm run ios:install:session:evidence`가 포함된다.

앱 홈과 `/install.html`의 설치 카드에는 `설치 정보 확인` 링크가 있어 같은 텍스트 요약을 바로 열 수 있다.

설치 카드에는 HTTPS 배포 체크리스트가 있으며, 추천 설치 URL이 HTTPS인지에 따라 첫 항목이 `준비됨` 또는 `로컬/HTTP 확인용` 상태로 바뀐다. 체크리스트는 Safari에서 `/install.html`을 열고, 홈 화면에 추가하고, 새 버전 안내를 적용하는 순서를 짚는다.

공유 버튼이 보이지 않는 브라우저에서도 `문자로 보내기`와 `메일로 보내기` 링크가 같은 설치 주소를 담아 열리므로, Mac에서 iPhone으로 설치 링크를 넘길 수 있다.

화면에 보이는 설치 주소는 읽기 전용 URL 입력으로 표시된다. 탭하거나 포커스하면 전체 주소가 선택되어 iPhone이나 데스크톱에서 직접 복사하기 쉽다.

`/install.html`은 iPhone에서 바로 열기 위한 설치 전용 화면이다. 앱 홈의 공유/문자/메일 handoff는 이 전용 설치 URL을 우선 전달하고, 화면 안에서 다시 앱 홈으로 돌아갈 수 있다.

`/i`와 `/iphone`은 같은 설치 전용 화면을 여는 짧은 입력용 경로다. 설치 카드의 `iPhone 입력용 짧은 주소`는 이 경로를 사용해 `http://맥IP:3000/i`처럼 iPhone Safari 주소창에 직접 치기 쉬운 주소를 보여주고, `/api/install-info`와 `/api/install-info.txt`도 `recommendedShortInstallUrl`과 LAN short URL 목록을 함께 반환한다.

짧은 주소 카드에는 host와 `/i` path가 따로 크게 표시된다. iPhone에 직접 입력할 때는 host를 먼저 입력하고 마지막에 `/i`만 붙이면 된다.

Mac에 Wi-Fi, VPN, 테더링처럼 여러 네트워크 주소가 있으면 짧은 주소 카드가 후보 LAN `/i` 주소 버튼을 함께 보여준다. 추천 주소가 iPhone에서 열리지 않으면 다른 후보를 누른다. 누른 후보는 큰 host/path 표시, `짧은 주소 복사` 대상, proof-save 링크 origin, QR target이 되며 바로 클립보드에도 복사된다. 선택한 후보는 `선택 QR evidence 명령 복사` 버튼의 `--install-qr-target`에도 반영되고, HTTPS 후보면 같은 명령에 `--follow-recommended`가 붙는다. 선택한 후보는 브라우저에 저장되어 새로고침 후에도 유지되지만, 현재 `/api/install-info` 후보 목록에서 사라진 주소면 자동으로 기본 추천 주소로 돌아간다. `추천 주소로 되돌리기`를 누르면 저장된 후보 선택을 지우고 다시 서버 추천 짧은 주소를 사용한다.

`/install.html`에는 `1분 설치 루트`가 있어 Safari에서 열기, 공유 버튼, 홈 화면에 추가, Travel 아이콘 실행 순서만 짧게 강조한다.

manifest는 `start_url`과 `scope`를 `/`로 유지하고, 언어, portrait orientation, travel/productivity 카테고리, related app 비선호를 명시한다. `display_override`도 `standalone`으로 맞춰 홈 화면 앱이 브라우저 탭이 아니라 앱처럼 열려야 한다는 의도를 manifest에 반복한다. 홈 화면 앱이 standalone 상태에서 `/install.html`로 열리면 자동으로 앱 홈(`/`)으로 이동해 설치 안내 페이지에 머물지 않는다.

manifest의 `새 여행 플랜` shortcut은 `/#planForm`을 target으로 삼아 Home Screen quick action 또는 shortcut 지원 환경에서 새 플랜 입력 폼으로 바로 진입한다.

`/#planForm`으로 직접 열린 앱은 새 플랜 입력 폼으로 스크롤하고 첫 입력 위치에 포커스를 준 뒤 짧게 하이라이트한다. 저장된 draft가 있으면 필드 수만 안내하고, 없으면 새 초안 시작 안내만 보여주며 실제 입력값과 LLM credential은 표시하지 않는다.

새 플랜 폼 안에는 shortcut/dock resume 도착 안내가 live hint로 표시된다. 이 안내도 저장된 draft 필드 수 또는 새 초안 시작만 말하고 실제 입력값과 LLM credential은 표시하지 않는다.

사용자가 새 플랜 폼 입력을 시작하거나 선택 값을 바꾸면 shortcut/dock resume 도착 안내는 자동으로 숨겨져 작성 화면을 방해하지 않는다.

`도착 안내 닫기` 버튼은 shortcut/dock resume 도착 안내만 숨기며, 저장된 draft와 현재 입력값은 유지한다.

`도착 안내 닫기` 버튼은 안내문과 draft privacy hint를 함께 참조해, VoiceOver에서도 안내만 닫고 저장된 draft/current form values는 유지된다는 점을 들을 수 있다.

shortcut/dock resume 도착 안내와 `도착 안내 닫기` 버튼은 같은 tinted group 안에 표시되어 iPhone 화면에서 하나의 first-use helper로 보인다. 이 그룹도 실제 입력값과 LLM credential은 표시하지 않는다.

이 first-use helper group은 `role=group`과 안내/privacy description을 가져, 보조기술에서도 shortcut 도착 안내와 닫기 동작이 같은 묶음임을 알 수 있다.

first-use helper group의 `초안 상태 복사` 버튼은 shortcut 도착 직후 이 iPhone 브라우저의 draft 상태만 복사한다. payload는 draft 상태, 저장 시각, 비어 있지 않은 필드 수, `fieldValues=excluded`, `llmSecrets=excluded`만 담는다.

first-use helper group의 `초안 상태 공유` 버튼은 같은 value-free draft status payload를 iOS 공유 시트로 보내며, 공유가 막히면 복사 또는 prompt fallback으로 전환한다.

first-use helper group의 `초안 상태 문자`와 `초안 상태 메일` 링크는 shortcut 도착 직후 value-free draft status를 각각 짧은 SMS payload와 자세한 mail body로 넘긴다. 두 handoff 모두 실제 입력값과 LLM credential은 제외한다.

first-use helper group은 `초안 상태 복사`와 `초안 상태 공유` 실행 중 `aria-busy`와 진행 label을 노출하고, 완료/취소/fallback 결과도 group label/title에 남긴다. 이 상태 feedback도 실제 입력값과 LLM credential은 포함하지 않는다.

first-use helper group의 `초안 상태 복사`와 `초안 상태 공유`는 현재 action이 busy인 동안 반복 탭을 무시하고 이미 진행 중이라는 안내만 남긴다. 중복 handoff를 만들지 않으며 payload의 value-free 경계도 유지한다.

first-use helper group의 `초안 상태 문자`와 `초안 상태 메일`도 외부 앱 handoff가 열리는 동안 `aria-busy`/`aria-disabled` 상태를 두고 반복 탭을 무시한다. busy window가 끝나면 링크 상태를 복원하고 value-free handoff가 열렸다는 결과 label을 남긴다.

SMS/mail handoff는 visible hint를 갱신한 뒤 group busy label을 다시 세팅해, helper group의 안내 label이 기본 shortcut 안내로 덮이지 않게 한다.

SMS/mail 링크 자체도 `aria-busy`/`aria-disabled` 상태에서 흐림과 outline을 보여 반복 탭 제한 상태를 시각적으로 알린다.

SMS/mail handoff 중에는 링크 visible label도 잠깐 `문자 여는 중` / `메일 여는 중`으로 바뀌었다가 busy window가 끝나면 원래 label로 돌아온다.

first-use helper group의 `설치 완료 상태` 링크는 새 플랜 작성 중에도 `/ios-install-status`로 이동해 iPhone proof와 Mac final gate 상태를 다시 확인할 수 있게 한다. 이 링크는 draft 필드값이나 LLM credential을 포함하지 않는다.

`설치 완료 상태` 링크를 누르면 이동 직전에 value-free feedback을 남겨, 새 플랜 draft 값과 LLM credential 없이 설치 proof/final gate 상태 확인으로 넘어간다는 점을 알려준다.

first-use helper group의 `폼 링크 복사` 버튼은 `/#planForm` URL만 복사한다. 이 링크 handoff에는 draft 필드값이나 LLM credential이 포함되지 않는다.

first-use helper group의 `폼 링크 공유` 버튼은 같은 `/#planForm` URL을 iOS 공유 시트로 보내며, 공유가 막히면 복사 또는 prompt fallback으로 전환한다. 이 handoff도 draft 필드값이나 LLM credential을 포함하지 않는다.

first-use helper group의 `폼 링크 문자`와 `폼 링크 메일`은 `/#planForm` URL만 각각 SMS와 mail로 넘긴다. mail body에는 `draftValues=excluded`, `llmSecrets=excluded`를 명시한다.

`폼 링크 문자`와 `폼 링크 메일`도 외부 앱 handoff가 열리는 동안 `aria-busy`/`aria-disabled`와 `폼 문자 여는 중` / `폼 메일 여는 중` visible label을 사용하고, 반복 탭은 중복 handoff를 만들지 않는다.

first-use helper group은 `입력 링크`, `초안 상태`, `설치/닫기` visible labels로 액션 묶음을 나눠, iPhone 화면에서 링크 handoff와 draft 상태 handoff를 빠르게 구분하게 한다. 이 label들도 field values나 LLM credential을 표시하지 않는다.

각 first-use helper 액션은 해당 visible label id를 `aria-describedby`에 포함해, VoiceOver에서도 입력 링크/초안 상태/설치·닫기 묶음을 구분할 수 있다.

first-use helper group 자체의 label/title도 값 없는 입력 링크 handoff와 초안 상태 handoff를 제공한다고 요약해, 묶음 전체의 안전 경계를 먼저 알린다.

first-use helper group의 `폼 링크 복사/공유`와 `초안 상태 복사/공유` 버튼은 실행 중 `aria-busy`와 disabled 상태를 함께 표시하고, busy 시 흐림/outline 스타일을 공유한다.

busy reset 뒤에는 `폼 링크 복사/공유`와 `초안 상태 복사/공유` 버튼의 title, aria-label, aria-describedby도 기본 value-free 설명으로 복원한다.

좁은 iPhone 화면에서는 first-use helper group의 `입력 링크`, `초안 상태`, `설치/닫기` label이 한 줄 전체를 차지해, 각 액션 묶음의 시작점을 더 쉽게 구분한다.

service worker는 navigation 요청 실패 시 `/install.html`, `/plans/:id`, 홈 경로를 각각 설치 안내, 플랜 상세 shell, 앱 홈 shell로 되돌린다. 그래서 iPhone 홈 화면 앱이 네트워크가 약한 상태에서도 더 자연스럽게 열린다.

새 service worker가 설치 대기 상태가 되면 앱 하단에 `새 버전 적용` 안내가 나타난다. 버튼을 누르면 새 shell을 활성화하고 현재 화면을 다시 불러와 iPhone 홈 화면 앱이 오래된 캐시에 머무는 시간을 줄인다.

홈, 설치 안내, 플랜 상세 화면은 `viewport-fit=cover`를 사용하고, 홈 화면 standalone 모드에서는 safe area padding을 적용한다. iPhone에서 앱 아이콘으로 실행했을 때 상단/하단 시스템 영역에 UI가 붙어 보이지 않도록 하기 위한 보정이다.

플랜 상세 화면 상단에는 실행 모드 callout이 표시된다. Home Screen 앱에서는 `Travel 아이콘으로 열린 상세 화면`이라고 안내하고, iPhone Safari나 일반 브라우저에서는 홈 화면 설치 시 상세 화면도 앱처럼 열리며 최근 상세 snapshot을 오프라인 읽기에 활용한다고 설명한다. 라이브 상세 로드 후에는 callout에 최근 상세 snapshot 저장 시각도 함께 표시된다.

홈 화면 앱으로 이미 실행 중이면 설치 카드의 URL, 단계, 복사/공유/SMS/메일 액션은 숨겨지고 설치 완료 상태만 남는다. 설치 후에는 사용자가 바로 여행 계획 UI에 집중하도록 하기 위한 정리다.

홈 화면 앱으로 실행 중인 설치 카드에는 `홈 화면 실행 증거` 패널이 표시된다. 여기서 standalone 실행 여부, 현재 path/url, service worker 제어 상태, 캡처 시각을 담은 JSON을 복사하거나 공유해 iPhone 설치 완료 evidence로 남길 수 있다. 이 JSON에는 `/ios-launch-proof.schema.json` schema URL이 포함되고, 패널의 `증거 schema 보기` 링크로 같은 계약을 바로 확인할 수 있다.

복사한 홈 화면 실행 증거 JSON을 `webapp/reports/ios-launch-proof.json`에 저장하면 `npm run ios:launch-proof:check:file`로 `standalone=true`, `displayMode=standalone`, schema URL, service worker 상태, path/url, 캡처 시각을 점검하고 `reports/ios-launch-proof-check.json`을 남길 수 있다. schema evidence는 `npm run ios:launch-proof:schema:file`, 둘을 함께 남기려면 `npm run ios:launch-proof:evidence`를 사용한다. `TRAVEL_IOS_LAUNCH_PROOF_PATH`, `TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH`, `TRAVEL_IOS_LAUNCH_PROOF_SCHEMA_PATH`로 저장 경로를 바꿀 수 있다.

Node 서버로 실행 중이면 홈 화면 앱의 `설치 증거 저장` 버튼이 같은 검증을 거친 뒤 `/api/ios-launch-proof`로 증거를 보내 `TRAVEL_IOS_LAUNCH_PROOF_PATH`와 `TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH` 위치에 바로 저장한다. 정적 호스팅처럼 API가 없으면 저장 대신 복사/공유 버튼으로 수동 evidence를 남긴다.

저장 후 `/api/ios-launch-proof.txt`를 열면 최근 iPhone 홈 화면 실행 증거의 `status`, `standalone`, `displayMode`, service worker 상태, 캡처/저장 시각, 저장 경로, issue 목록을 텍스트로 바로 확인할 수 있다. 원본 JSON은 `/api/ios-launch-proof`, 검증 결과 JSON은 `/api/ios-launch-proof/check`에서 확인한다.

설치 카드의 `최근 설치 증거` 박스는 `/api/ios-launch-proof/check`를 읽어 최근 저장된 iPhone 홈 화면 실행 증거가 `ready`인지, 아직 없는지, 접근 키나 검증 issue로 막혔는지 표시한다. `최근 증거 새로고침`으로 다시 확인할 수 있고, `최근 증거 요약`은 접근 키 helper가 있으면 인증 헤더를 붙여 텍스트 요약을 보여준다.

홈 화면 앱의 `iPhone 빠른 실행` dock은 proof 저장 전에는 `설치 증거 저장으로 이동` CTA를 보여주고, proof 저장 후에는 최종 Mac evidence gate 안내로 전환한다. 이 post-proof 안내는 `npm run ios:install:evidence:after-phone:final` 명령 복사, 최근 저장 증거 요약, 설치 완료 판정 섹션 이동을 한곳에 묶어 Travel 아이콘 첫 실행부터 Mac-side 완료 확인까지 이어준다. dock action row에서도 proof 저장 후 `최종 gate 복사`/`최종 gate 공유`/`최종 gate 문자`/`최종 gate 메일`을 다시 노출하고, `완료 상태 복사`/`완료 상태 공유`/`완료 상태 문자`/`완료 상태 메일`/`완료 상태 페이지`로 proof, final gate, first-run checklist 상태를 바로 내보낼 수 있다.

같은 dock의 상태 줄에는 `Mac final gate 확인 전/대기/완료` pill이 표시된다. 이 pill은 `/api/ios-install-completion-status`의 `complete`/`finalEvidenceCommandReady` 판단을 우선 사용하고, 서버 상태를 아직 읽지 못하면 summary-check fallback으로 표시한다. pill을 누르면 `/ios-install-status`로 이동해 남은 gate와 paste-ready final command를 확인할 수 있다. dock의 최종 `complete` 톤은 first-run checklist, Home Screen standalone proof, named final gate가 모두 완료된 경우에만 표시된다.

같은 상태 줄에는 현재 앱 shell cache 버전도 `앱 shell v...` pill로 표시된다. `앱 업데이트 확인`은 설치된 service worker/app shell 업데이트를 수동 확인하고, `shell 버전 복사`는 현재 URL, display mode, service worker 상태, app shell/server shell/update-needed 상태를 짧게 복사한다. 저장된 proof가 `appShellUpdateNeeded=true`를 보고하면 `/ios-install-status`의 `Home Screen app shell is current` gate가 완료되지 않고 `/#iosHomeDockShellRecovery`로 안내한다. 이 recovery 경로는 Home Screen dock의 `앱 업데이트 확인` 버튼에 초점을 맞춘 뒤 shell drift가 사라지면 proof 저장 패널로 이동하고, proof 재저장 성공 후 `#iosInstallAfterPhone` final gate 패널에 남기며 `npm run ios:install:evidence:after-phone:final` 명령을 best-effort로 클립보드에 복사한다.

`/ios-install-status`의 상단 `최종 gate 복사`와 상태 복사 payload는 서버 상태 텍스트와 같은 paste-ready Mac terminal command를 포함한다. 그래서 완료 상태 페이지에서 바로 복사해도 `test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final` 흐름을 잃지 않는다.

클립보드 권한이나 iOS 브라우저 제약으로 자동 복사가 막히면 `/ios-install-status`의 복사 버튼들은 prompt fallback으로 같은 명령/상태 텍스트를 보여줘 수동 복사할 수 있게 한다.

`/ios-next`와 `/ios-install-next-action-scan` 스캔 보드의 다음 액션, 완료 상태, Mac final gate, Mac evidence, maintenance, 스캔 주소 복사 버튼도 같은 prompt fallback을 사용한다.

공유 시트를 사용할 수 있더라도 native share가 실패하면 `/ios-install-status`, `/ios-next`, `/ios-install-next-action-scan`의 공유 버튼은 같은 내용을 prompt로 보여줘 수동 복사로 이어간다. 사용자가 공유 시트를 취소한 경우에는 조용히 돌아온다.

설치 완료 상태가 `complete=true`가 되면 `/ios-install-status`는 성공 카드를 보여주고 `Travel 앱 열기`, `새 여행 플랜 만들기`, `완료 상태 텍스트` 링크를 한곳에 모아 설치 직후 첫 사용으로 이어준다.

`/ios-install-status` HTML head도 PWA/apple metadata와 Open Graph/Twitter summary metadata를 포함해 완료 상태 링크를 메시지나 메일로 넘겼을 때 proof, Mac final gate, 첫 플랜 시작 맥락이 preview에 남는다.

`/ios-next` 다음 액션 스캔 보드도 PWA/apple metadata와 Open Graph/Twitter summary metadata를 포함해 설치 중 남은 iPhone/Mac 액션 링크를 공유할 때 handoff 목적이 유지된다.

동적 `/ios-install-status`와 `/ios-next` 페이지도 `viewport-fit=cover`를 사용해 iPhone 홈 화면 앱과 Safari에서 safe-area 렌더링 의도를 정적 설치 화면과 맞춘다.

두 동적 iOS handoff 페이지의 body padding은 기존 responsive spacing에 `safe-area-inset-*` 값을 더해 홈바/노치가 있는 iPhone에서도 하단 액션과 좌우 가장자리가 덜 붙도록 한다.

`/install.html`, `/ios-install-status`, `/ios-next` head는 `color-scheme=light` metadata도 선언해 iPhone 외관 설정에 따라 설치 handoff 화면의 폼과 브라우저 UI 힌트가 예상 밖으로 어두워지지 않게 한다.

설치 후 실제로 열리는 앱 홈(`/`)과 플랜 상세 화면도 같은 `color-scheme=light` metadata를 선언해 Home Screen Travel 앱의 주요 사용 화면 톤을 설치 handoff 화면과 맞춘다.

플랜 상세 화면은 `format-detection=telephone=no`도 선언해 iPhone에서 일정 번호, 시간, 주소 조각이 의도치 않게 전화번호 링크처럼 보이는 일을 줄인다.

앱 홈(`/`)과 플랜 상세 화면은 description, Open Graph, Twitter summary metadata도 제공해 설치 후 새 플랜/상세 링크를 메시지나 메일로 공유할 때 Home Screen Travel 앱 사용 맥락이 preview에 남는다.

앱 홈의 새 플랜 폼과 검색 입력은 iPhone 키보드 힌트를 갖는다. 목적지/출발지/국가 입력은 위치성 자동완성 힌트와 다음 키를, 인원/박수/예산은 numeric keyboard 힌트를, 검색은 search keyboard와 search enter hint를 사용한다.

앱 홈의 새 플랜 폼은 목적지, 출발지, 날짜, 예산, 요청사항 같은 비밀이 아닌 여행 입력만 현재 기기 브라우저 `localStorage`에 draft로 저장하고 복원한다. LLM API key, provider, model은 draft에 포함하지 않으며, 플랜 생성이 성공하면 draft를 지운다.

새 플랜 폼은 로컬 draft 저장/복원 상태를 화면에 표시하고 `저장된 초안 삭제` 버튼을 제공한다. 이 버튼은 현재 입력값을 지우지 않고 현재 기기 브라우저에 저장된 draft만 삭제한다.

새 플랜 draft는 `updatedAt` 저장 시각도 함께 기록하고 자동 저장/복원 메시지에 표시해, iPhone 앱 전환 후 복원된 입력이 언제 저장된 것인지 판단할 수 있게 한다.

새 플랜 draft 상태줄은 polite live region으로 노출되고, `저장된 초안 삭제` 버튼은 이 상태줄을 설명으로 참조해 VoiceOver 사용 중에도 로컬 draft 범위를 확인할 수 있다.

`저장된 초안 삭제` 버튼의 title과 accessible label은 draft가 있을 때 해당 초안의 저장 시각을 함께 말해, 오래된 로컬 초안을 지우는 상황을 더 분명하게 한다.

새 플랜 draft 메시지와 삭제 버튼 설명은 저장 시각을 기준으로 최근 24시간 안에 저장된 초안인지, 24시간 이상 지난 오래된 초안인지도 함께 표시한다.

새 플랜 폼은 입력 전에 로컬 draft 안내를 보여주며, draft가 현재 기기 브라우저에만 저장되고 LLM API key, provider, model 값은 초안에 저장하지 않는다는 범위를 폼 설명으로 연결한다.

`초안 복사` 버튼은 현재 새 플랜 입력값을 비밀값 없이 텍스트로 복사한다. iOS에서 Safari와 Home Screen 앱 저장소가 다르게 보이는 경우 Notes나 메시지에 붙여넣어 초안을 옮길 수 있다.

`초안 공유` 버튼은 같은 비밀값 제외 초안을 iOS 공유 시트로 보내 Notes, 메시지, AirDrop 등으로 넘길 수 있게 한다. 공유 시트가 없거나 실패하면 클립보드 복사 또는 수동 prompt로 fallback한다.

초안 삭제/복사/공유/붙여넣기 버튼은 현재 기기 브라우저 draft handoff action group으로 묶이며, 그룹은 draft privacy hint와 live status를 함께 참조한다.

저장된 draft가 아직 없을 때 그룹 라벨은 복사/공유/붙여넣기만 말하고, draft가 생겨 `저장된 초안 삭제` 버튼이 보일 때 삭제까지 포함한다.

`초안 붙여넣기`로 필드를 채울 때는 각 적용 필드에 `input`과 `change` 이벤트를 발행해, 수동 입력과 같은 방식으로 자동 저장 및 UI 반응이 이어지게 한다.

새 플랜 폼은 iPhone 홈 화면 앱 전환, 잠금, Safari 전환 같은 lifecycle 상황을 대비해 `pagehide`와 hidden `visibilitychange` 시점에도 현재 비밀값 제외 draft를 조용히 저장한다.

홈 화면 빠른 실행 dock과 iPhone 진단 복사는 새 플랜 draft가 이 기기 브라우저에 남아 있는지, 저장 시각, 비어 있지 않은 필드 수만 보여준다. 입력 내용과 LLM API key/provider/model 값은 내보내지 않는다.

홈 화면 빠른 실행 dock의 `초안 상태 복사` 버튼은 같은 값을 별도 짧은 진단 텍스트로 복사한다. 이 텍스트도 `fieldValues=excluded`, `llmSecrets=excluded`를 명시해 실제 여행 메모나 API credential을 공유하지 않는다.

홈 화면 빠른 실행 dock의 `초안 상태 공유` 버튼은 같은 값 없는 진단을 iOS 공유 시트로 보내며, 공유가 막히면 클립보드 복사나 prompt fallback으로 이어진다.

홈 화면 빠른 실행 dock의 `초안 상태 문자`와 `초안 상태 메일` 링크는 값 없는 draft 상태를 각각 짧은 SMS payload와 자세한 mail body로 넘긴다. 두 handoff 모두 실제 입력값과 LLM credential은 제외한다.

홈 화면 빠른 실행 dock의 `초안 이어쓰기` 링크는 저장된 draft가 있으면 이어쓰기, 없으면 새 초안 시작으로 바뀌며 새 플랜 입력 폼으로 바로 이동한다. 링크 label과 설명에도 실제 입력값이나 LLM credential은 넣지 않는다.

`초안 이어쓰기`를 누르면 새 플랜 입력 폼의 첫 입력 위치로 포커스를 옮기고, 현재 상태 안내에는 저장된 필드 수 또는 새 초안 시작 메시지만 표시한다. 실제 입력값과 LLM credential은 상태 안내에 포함하지 않는다.

`초안 이어쓰기`로 폼에 도착하면 새 플랜 입력 폼에 짧은 outline 하이라이트를 표시해 iPhone 화면에서 이어서 입력할 위치를 놓치지 않게 한다. 하이라이트도 값 표시 없이 위치만 알려준다.

`초안 붙여넣기` 버튼은 `초안 복사` 텍스트의 `- 항목: 값` 줄을 읽어 현재 폼에 다시 적용한다. parser는 알려진 여행 입력 필드만 받아들이며 LLM API key, provider, model 값은 가져오지 않는다.

`초안 붙여넣기`는 먼저 클립보드 읽기를 시도하고, 브라우저 권한이나 iOS 정책으로 막히면 수동 붙여넣기 prompt로 fallback한다.

수동 붙여넣기 prompt를 취소하면 초안 import를 중단하고 취소 상태를 표시한다. 빈 텍스트를 직접 제출한 경우에만 적용할 항목 없음 안내를 보여준다.

클립보드 읽기는 성공했지만 초안 형식이 아닌 텍스트라면 바로 실패하지 않고 수동 붙여넣기 prompt를 한 번 더 열어 실제 초안 텍스트를 넣을 수 있게 한다.

초안 복사 텍스트는 textarea의 줄바꿈 값을 ` / `로 접어 `- 항목: 값` 한 줄 형식을 유지한다. 그래서 여러 줄 메모를 복사해도 `초안 붙여넣기` parser가 같은 항목을 다시 읽을 수 있다.

초안 복사 텍스트의 select 값은 `domestic`, `auto` 같은 내부 값 대신 `국내`, `자동 선택`처럼 사람이 읽는 표시값으로 출력된다. 붙여넣기 parser는 표시값과 내부 값을 모두 받아들인다.

새 플랜 draft handoff 그룹은 draft가 있을 때 저장 시각과 최근/오래됨 상태를 title과 accessible label에도 반영해, VoiceOver에서 삭제/복사/공유/붙여넣기 묶음의 현재 로컬 초안 상태를 바로 알 수 있게 한다.

초안 복사/공유/붙여넣기 버튼은 실행 중 `disabled`와 `aria-busy`를 적용하고 잠깐 진행 라벨로 바뀌어, iPhone에서 빠르게 반복 탭해도 handoff 흐름이 겹치지 않게 한다.

`초안 붙여넣기`가 항목을 적용하면 첫 적용 필드로 포커스를 이동해, iPhone에서 붙여넣기 직후 바로 입력을 이어갈 수 있다.

draft handoff 버튼은 `aria-busy=true` 동안 progress cursor와 낮은 opacity를 사용해, 복사/공유/붙여넣기 실행 중임을 시각적으로도 보여준다.

`초안 붙여넣기` 버튼 설명은 클립보드 우선 읽기와 수동 prompt fallback을 함께 말해, iPhone에서 붙여넣기 권한이 막혀도 다음 동작을 예상할 수 있게 한다.

새 플랜 draft handoff 버튼 묶음은 옅은 배경, 테두리, padding을 가진 별도 컨테이너로 표시되어 `계획 생성` submit action과 로컬 draft 삭제/복사/공유/붙여넣기 action이 작은 iPhone 화면에서도 덜 섞인다.

Mac에서 완료 상태 페이지를 보고 있는 경우를 위해 같은 성공 카드에는 Travel 홈 QR도 표시한다. iPhone 카메라로 스캔한 뒤 Safari로 열리면 홈 화면의 Travel 아이콘을 다시 눌러 설치된 앱으로 돌아가라고 안내한다.

카메라 스캔이 어려운 경우 같은 성공 카드의 `QR 대상 URL 복사` 버튼으로 Travel 홈 URL을 복사해 메시지나 메모로 iPhone에 옮길 수 있으며, 클립보드가 막히면 수동 복사 prompt로 이어진다.

설치 완료 뒤 곧바로 첫 여행을 만들고 싶다면 같은 성공 카드의 `새 플랜 URL 복사` 버튼으로 새 플랜 입력 위치 URL도 iPhone에 옮길 수 있다.

같은 성공 카드에는 새 플랜 입력 위치로 바로 가는 두 번째 QR도 표시해, Mac 완료 페이지에서 iPhone으로 첫 여행 작성 화면을 바로 넘길 수 있다.

완료 상태 JSON과 텍스트 출력도 `postInstallAppHomeUrl`, `postInstallNewPlanUrl`을 포함해 화면을 보지 않고 상태 payload만 복사해도 설치 후 앱 홈/새 플랜 링크를 회수할 수 있다.

완료 상태 페이지의 `상태 복사` 버튼도 같은 `postInstallAppHomeUrl`, `postInstallNewPlanUrl` 필드를 포함하므로 화면 복사와 API 텍스트 복사가 같은 첫 사용 링크 계약을 유지한다.

`/ios-next`와 `/ios-install-next-action-scan`의 완료 상태 복사/문자/Mac evidence payload도 같은 post-install 링크를 포함해, 스캔 보드만 보고 있어도 설치 후 앱 홈과 새 플랜 URL을 회수할 수 있다.

`/api/ios-install-next-action` JSON과 `/api/ios-install-next-action.txt`도 같은 `postInstallAppHomeUrl`, `postInstallNewPlanUrl`을 포함하므로 자동화/QR 텍스트 소비 경로에서도 설치 후 첫 사용 링크가 보존된다.

설치 시작 정보인 `/api/install-info`와 `/api/install-info.txt`도 같은 post-install 앱 홈/새 플랜 URL을 포함해, iPhone에 설치 URL을 넘기기 전 복사한 정보만으로도 설치 후 첫 사용 링크를 회수할 수 있다.

`/api/ios-install-session.txt`의 사람이 읽는 설치 세션 텍스트도 `After install completion` 아래에 앱 홈과 새 플랜 URL을 함께 싣는다.

구조화된 `/api/ios-install-session` JSON과 install runbook 텍스트도 같은 post-install 앱 홈/새 플랜 URL을 노출한다.

`ios-install-session-check`와 `ios-install-runbook-check`도 이 post-install 링크가 각각 `/#iosHomeDock`, `/#planForm`을 가리키는지 확인하므로, 첫 사용 hash를 바꾸면 payload와 checker를 함께 갱신해야 한다.

서버 생성 runbook/session도 같은 복구 계약을 노출한다. `/api/ios-install-runbook.txt`와 `/api/ios-install-session.txt`에는 `appShellRecoveryUrl`과 `appShellUpdateNeeded=true`일 때의 `앱 업데이트 확인 → proof 재저장 → final Mac gate` 순서가 포함된다. `/api/ios-install-runbook`과 `/api/ios-install-session` JSON은 모두 `appShellRecovery` 객체로 trigger field/value와 sequence를 노출한다. runbook JSON schema/checker와 `npm run ios:install:session:evidence`도 `appShellRecoveryUrl`이 `/#iosHomeDockShellRecovery`를 가리키고 session recovery sequence가 구조화되어 있는지 확인하므로, 이 recovery hash를 바꾸면 server payload, schema, checker, README를 함께 갱신해야 한다.

dock 상태 줄의 pill들은 모두 관련 표면으로 바로 이어진다. `설치 체크`는 첫 실행 체크 목록으로, `오프라인 snapshot`은 snapshot이 있으면 최근 snapshot 영역으로 없으면 여행 목록으로, `설치 증거`는 저장 전 proof-save 위치와 저장 후 proof 요약으로, `Mac final gate`는 완료 상태 페이지로 이동한다.

설치 후 첫 실행 체크는 `Travel 아이콘 실행 → 설치 증거 저장 → 첫 여행 플랜 만들기 → 오프라인 읽기 확인` 순서로 진행된다. Home Screen dock의 첫 플랜 시작 링크는 현재 visible/route/label/state/bound와 clicked/clickedAt/clickedRoute/clickedLabel/clickedState/clickedStatusFeedback diagnostics를 남긴다. 첫 플랜 생성이 성공하면 Home Screen dock/checklist가 즉시 갱신되고, 오프라인 snapshot이 생긴 뒤에는 `오프라인 확인 완료` 버튼으로 마지막 first-run 체크를 수동 완료할 수 있다. snapshot이 아직 없으면 같은 버튼이 최근 여행 목록이나 상세 플랜을 먼저 열어 snapshot을 만들라고 안내한다.

`설치 완료 판정` 섹션은 완료 전에는 pending 톤으로 `Travel 아이콘 실행 proof 저장 → Mac 터미널 최종 gate 실행 → 결과 새로고침` 순서를 안내하고, 모든 항목이 끝나면 done 톤으로 iPhone 설치와 Mac evidence gate가 모두 완료됐다고 표시한다.

설치 카드의 준비 상태 목록은 현재 기기, iPhone 접근 주소, HTTPS 안정성, service worker 지원 여부를 표시한다. `localhost`에서 개발 중이면 iPhone이 열 수 있는 LAN 주소 또는 HTTPS 배포 주소를 사용하라는 경고를 보여준다.

iPhone에서 Chrome, Firefox, Edge, 카카오톡/네이버/Instagram/FB/LINE 같은 인앱 브라우저로 열린 것으로 보이면 설치 카드는 Safari에서 다시 열어 `홈 화면에 추가`를 진행하라고 안내한다.

iPhone이지만 Safari가 아닌 브라우저로 보이면 설치 카드와 `/install.html`은 별도 Safari 재시도 패널을 보여준다. 사용자는 설치 주소를 복사해 Safari 주소창에 붙여넣으면 된다.

이 웹앱은 iOS Safari의 홈 화면 설치 흐름에 맞춰 `manifest.webmanifest`, service worker, `apple-mobile-web-app-*` meta, `apple-touch-icon.png`를 제공합니다. iPhone에서 설치하려면 Safari로 배포 URL을 열고 공유 버튼을 누른 뒤 `홈 화면에 추가`를 선택하세요. 홈 화면 아이콘으로 실행하면 독립 앱처럼 열리며, 앱 안의 `iPhone 홈 화면에 설치` 카드가 현재 설치 상태를 안내합니다.

앱 홈의 `현재 주소 복사` 버튼으로 iPhone에 보낼 주소를 복사할 수 있습니다. 단, 주소가 `localhost`이면 iPhone에서는 Mac이 아니라 iPhone 자신을 가리키므로 같은 Wi-Fi의 Mac IP 주소 또는 HTTPS 배포 주소로 열어야 합니다. 상세 플랜 화면도 같은 iOS 홈 화면 메타와 service worker 등록을 사용합니다.

로컬 네트워크에서 먼저 써보려면 Mac에서 `cd webapp && npm run start`로 서버를 켠 뒤, iPhone Safari에서 같은 Wi-Fi의 Mac 주소와 포트로 접속하세요. 실제로 계속 쓰려면 HTTPS 도메인에 배포하는 편이 service worker와 홈 화면 설치 경험이 가장 안정적입니다.

Source: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
Source: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

홈의 저장된 플랜 섹션에는 여행 미션 보드가 표시되고, 미션 보드 상단과 목록 안의 최우선 플랜에는 `최우선` 배지와 강조 배경, 키보드 포커스 행/라벨/버튼/상태 강조와 reduced-motion 대응 행/액션 전환, hover/active 버튼 강조와 hover/active 라벨/상태 강조와 reduced-motion 대응 행/액션 전환와 reduced-motion 대응 전환, 목적지 열기·최우선 목적지 URL 복사·최우선 선정 이유 복사·안내 복사·최우선 목적지 공유를 담은 `최우선 액션` 묶음, 상단 상태 피드백 pill, 시간이 붙어도 데스크톱/모바일 폭이 안정적인 상태 피드백 pill, atomic live status, 상단 visible group label, visible label 기반 group name, 상단 버튼 title/aria-label, group/button aria-describedby 상태 연결, 최신 상태 기준 일시 상태 자동 복귀와 상단 피드백 최신 상태 토큰, 업데이트 시각과 상태 맥락 title/aria-label/visible pill 및 미션 보드 상단과 목록 행의 이유·링크·복사·공유 진행 중 중복 실행 방지 및 disabled/busy 시각 톤과 reduced-motion 대응이 함께 표시되어 현재 목록 기준 전체/예정/여행 중/완료/품질 후보 수와 최우선 미션을 한눈에 보고, visible `상태 필터` 라벨이 붙은 각 카운트를 눌러 전체 또는 해당 상태 필터로 전환하고 목록 갱신을 설명하는 title/aria-label 및 `보기 갱신 중` feedback과 함께 실제 목록 갱신 동안 버튼을 잠그며 `전체` 카운트와 0개 상태 카운트는 title/aria-label에서도 전체 상태 전환 의미와 현재 범위에 플랜이 없어 aria-disabled 상태로 안내만 하는 이유, 누르면 안내를 볼 수 있다는 title/aria-label, `notice`/`refresh`/현재 보기 action data와 feedback visible text와 title/aria-label의 동작 설명, stale 방지를 위한 last-action metadata 수명과 notice/refresh/현재 보기 사용자용 동작/대상 라벨과 단일 last-action summary와 표시용·ISO 전용 동작 시각 metadata 및 동작 당시 범위/결과 metadata 및 one-shot ready visible text와 title/aria-label의 마지막 동작 요약 및 unrelated feedback stale 방지, helper 기반 refresh 후 새 feedback pill last-action 복원과 post-load active scope/result 우선 및 ready state metadata 복원 및 transient metadata 정리 및 status-count feedback/post-load restore origin metadata와 상수·helper 기반 즉시 feedback과 ready visible/title/aria-label 사용자용 origin label 및 최근 동작 보기/지우기/복사/만들기와 현재 보기 metadata 및 상태별 결과 개수 직접 기록과 만들기 버튼 title/aria-label 범위·개수 안내 및 기록 후 복사/JSON 사용 가능 feedback 및 복사 버튼 focus 및 복사 버튼 title/aria-label 범위·개수 안내 및 복사 후 JSON 도구 안내 및 JSON 도구 열기와 JSON 복사 버튼 focus 및 JSON 복사 후 파일/해시/공유 안내와 파일 버튼 focus 및 파일 저장 후 해시 버튼 focus 및 해시 복사 후 공유 버튼 focus 및 JSON 공유 후 열림 초기화 focus 및 초기화 후 미션 보드 복사 focus 및 미션 보드 복사 title/aria-label 범위·개수 안내와 공유 버튼 focus, 빈 상태 범위·개수 포함 만들기 버튼 focus 안내 및 접이식 JSON 도구 보기/파일/해시/복사/공유/열림 초기화 진단 텍스트와 보드 링크 포함, 도구 수 배지, 세부 aria-label, aria-expanded/title 동기화, 열림/접힘 feedback, 열린 상태와 키보드 포커스 시각 톤 및 같은 탭 열림 상태 보존, 복원 안내, 열림 초기화, Escape 닫기, 열린 상태 전용 Esc 닫기 힌트, summary 포커스 복귀, 파일/해시/공유 용도 및 비어 있을 때 만들기 선행 안내와 aria-describedby 연결이 붙은 접이식 JSON 도구 및 JSON 보기/파일/해시/복사/공유/열림 초기화 버튼 설명/feedback 보드 맥락 안내와 boardContext scopeTags/scopeTagCount/activeScopeKinds/scopeTagSummary/scope flags/labels/statusSummary 단위 포함/statusCounts/statusLabels/resultLabel/label/copiedFrom/schema/source/generatedAt metadata 및 전용 공유 제목, muted/focus 시각 톤을 구분하고 현재 선택된 상태 카운트는 aria-pressed, active 톤, `선택됨` 보조 텍스트와 중복 갱신 없이 현재 보기 상태만 알려준다는 title/aria-label로 구분되고 보드 feedback pill에서도 선택한 상태 범위와 플랜 개수를 확인할 수 있고, 현재 검색어/필터 범위는 feedback pill의 data 속성에도 남고 title/aria-label 설명에도 포함되며, 이미 선택된 카운트를 다시 누르면 중복 전환 대신 info 톤의 `이미 ... 보기 중`으로 알려주고, 0개 카운트를 누르면 reload 없이 현재 검색/필터 범위가 visible text와 title/aria-label metadata에 포함된 `0개 플랜 없음` info feedback을 표시합니다. 검색어 또는 필터가 적용된 상태에서는 미션 보드 헤더의 범위 문구와 `검색: ...`, `필터: 고도화 후보`처럼 사용자용 필터 라벨 태그가 표시되어 현재 보드 범위를 화면에서도 바로 확인할 수 있고, `범위 복사`/`범위 공유` 버튼 설명, 초기/작업 feedback의 visible text와 title/aria-label, handoff 텍스트에 현재 범위 문구, 결과 개수, 보드 링크를 담아 짧게 복사하거나 OS 공유로 보내거나 공통 helper로 만든 각 태그를 눌러 해당 검색어나 필터만 해제하고 실제 목록 갱신 동안 버튼을 잠그거나 현재 범위와 결과 개수를 설명하고 실제 목록 갱신을 기다리는 동안 disabled/aria-busy로 잠기는 공통 reset helper 기반 `전체 미션 보기`로 검색어와 필터를 한 번에 해제한 뒤 목록을 갱신할 수 있고, 필터 범위 해제와 범위 초기화 feedback은 초기 준비 상태부터 visible text와 title/aria-label의 현재 범위와 결과 개수도 맞추고, reload 전에는 공통 feedback helper로 visible text와 title/aria-label 모두 `해제 갱신 중`/`전체 보기 갱신 중` 메시지와 reset 전 범위·결과 개수, `상태: 목록 갱신 중` 문맥, working 톤으로 이전 개수를 피하며 보드 feedback pill과 연결됩니다. 현재 범위에 플랜이 없으면 빈 미션 보드에서도 visible `빈 보드 시작` 라벨과 최신 상태 토큰 기반 자동 복귀 및 시작 액션 busy 상태가 있고 현재 검색어/필터 범위를 title/aria-label에 담는 범위 해제·시작 액션 feedback pill을 확인하며 `새 플랜 입력으로 이동`, `예시로 채우기`, `예시 요청 미리보기`, `예시 요청 복사`, `예시 요청 공유`, 결과 0개를 버튼 설명에도 포함한 `범위 복사`/`범위 공유`, 공통 helper로 목록 갱신 의미가 담기고 실제 갱신 동안 잠기는 범위 태그 개별 해제와 현재 범위·결과 개수를 설명하고 실제 목록 갱신 동안 잠기는 reset helper 기반 `전체 미션 보기`를 바로 사용할 수 있습니다. `예시로 채우기`는 검색어가 있으면 목적지에 반영하고 브라우저 로컬 기준 오늘 출발일, 2박 3일 친구 여행, 호텔/자동 교통/1인 예산 120000원, 맛집/산책/짧은 이동 스타일, 우천 대안/예약 체크리스트/예산 힌트 요청을 새 플랜 폼에 채운 뒤 오늘 출발일과 목적지 확인 후 계획 생성을 누르라는 안내를 표시합니다. `예시 요청 복사`와 `예시 요청 공유`는 예시 요청 텍스트에 오늘 출발일과 미션 보드 URL을 함께 담고, 공유는 지원 브라우저에서 OS 공유 시트를 열며 미지원 환경에서는 같은 예시 요청 텍스트를 복사하고, 공유 취소와 fallback 복사 결과를 빈 보드 feedback pill에 구분해 표시하고 복사/공유 진행 중에는 버튼 busy 상태로 중복 실행을 막습니다. 홈 검색어와 필터는 `?q=검색어&filter=upcoming`처럼 URL에 반영되어 새로고침이나 공유 링크로 같은 목록 맥락을 다시 열 수 있습니다. 최우선 미션은 `최우선 이유`로 미션 보드 복사와 같은 검색어/필터 범위 표현, 목적지, 선정 이유, `상세 런웨이`/`품질 보강` 같은 연결 맥락과 링크를 짧게 복사하거나, `최우선 복사`로 같은 검색어/필터 범위와 해당 플랜 링크, 미션 보드 링크를 담은 단건 텍스트로 복사하거나, 지원 브라우저에서는 `최우선 공유`로 OS 공유 시트를 바로 열 수 있고, `최우선 링크`로 플랜 링크만 짧게 복사할 수 있습니다. 최우선 미션 링크는 이미 품질 보강 해시나 query가 있는 경우 그대로 보존하고, 일반 플랜 링크는 상세 액션 런웨이 `#tripActionRunway`로 바로 이어지며 화면 액션 라벨도 `추천 액션 열기`로 표시됩니다. 최우선 미션에는 `상세 런웨이` 또는 `품질 보강` 목적지 배지도 표시되고, 단건 복사/공유 텍스트에도 같은 목적지 라벨이 포함되어 링크가 어디로 이어지는지 바로 확인할 수 있습니다. `미션 보드 복사`로 공통 helper로 만든 현재 목록 범위와 검색어/필터 라벨을 한 줄로 묶은 범위 설명, 전체/상태별 카운트, 최우선 미션, 미션 보드 앵커 링크를 동행자에게 보낼 텍스트로 복사할 수 있고, 지원 브라우저에서는 `미션 보드 공유`로 OS 공유 시트를 바로 열 수 있고, 취소와 fallback 복사 결과도 보드 단위 live status pill에 구분해 표시합니다. 네이티브 공유 payload에는 텍스트와 별도 URL 필드를 함께 넘겨 지원 앱의 링크 미리보기와 URL 처리가 더 잘 되게 합니다. `미션 보드 링크`는 visible `보드 공유` 라벨과 버튼별 상태 연결을 제공하며 보드 단위 live status pill에도 링크 복사 진행/결과와 busy 상태를 표시하고 `#tripMissionBoard`가 붙은 홈 링크만 복사하며, 이 링크로 열면 홈 화면이 미션 보드로 바로 이동하고 해당 패널이 강조됩니다. 상세 화면 상단에는 출발 전/여행 중/완료 상태에 맞춘 액션 런웨이가 표시되어 실행 순서 체크리스트로 추천 3단계를 먼저 훑고 보조기술에도 전달되는 `상태` 그룹 라벨, `n/3 완료` 진행률, 단계별 색상으로 바뀌는 현재 단계 배지, 단계 힌트와 다음 순번까지 포함한 퍼센트·단계 라벨이 붙은 시각/보조기술 진행 막대, `완료 n개`·`남은 n개` 배지와 항목별 진행률·단계 힌트·다음 순번 및 `다음 액션`/`참고 액션` 관계를 title/aria-label에 포함하는 `열기`, `링크`, `링크 공유`, `완료`를 제공하는 남은 액션 미리보기, 진행률·단계 힌트·다음 순번 및 `완료 런웨이` 관계를 title/aria-label에 포함하는 `링크`, `링크 공유`, `완료 취소`가 가능한 완료한 액션 요약, 첫 번째 미완료 항목을 알려주는 `다음:` 힌트, `다음 실행 빠른 작업` role=group 박스 안에서 모바일에서도 균등하게 줄바꿈되고 진행 중에는 열기·handoff·링크 공유·완료 처리 가능 범위, 완료 후에는 박스 전체가 완료 톤으로 바뀌고 체크리스트 상태로 계산되는 활성/완료 상태 배지와 색상 띠·그림자로 구분하고 별도 숨은 이름 없이 보이는 그룹 라벨 텍스트와 보조기술에도 연결된 완료 안내·완료 링크 공유 가능 범위 안내와 다음 추천 액션 이름과 이유, `눌러 열기` 힌트를 고정 표시하고 hover/focus 강조로 바로 열 수 있는 `다음 실행` 요약 pill과 첫 미완료 추천 handoff 텍스트를 복사하거나 OS 공유로 보내고 모두 완료 후에도 완료 안내를 복사·공유하는 `다음 실행 복사`와 `다음 실행 handoff 공유`, 첫 미완료 추천 카드 URL을 복사하거나 OS 공유로 보내고 모두 완료 후에는 완료 런웨이 링크를 복사·공유하는 `다음 실행 링크`와 `다음 실행 공유`, 첫 미완료 추천을 바로 완료 처리하고 성공 톤으로 구분되는 `다음 실행 완료`, 완료 톤으로 전환되는 `다음 순번` 배지, `로컬 저장 전` 또는 `오늘 HH:mm`/`MM-DD HH:mm` 업데이트 시간, `저장 범위` 그룹 라벨, 클릭해 여행 기간, 플랜 상태, 런웨이 초점/안내, 체크 진행률, 추천 액션 수, 체크 기준, 상태 변경 주의, 완료 액션 수, 남은 액션 수, 다음 액션, 다음 순번, 다음 액션 상태, 모두 완료 안내, 동기화 안내, 공유 팁, 체크 업데이트 라벨, 다음 액션 링크 또는 완료 런웨이 링크, 런웨이 링크 라벨이 포함된 안내를 복사할 수 있는 로컬 체크 저장 톤으로 강조되는 `이 브라우저 체크 저장` 범위와 `체크 범위 공유`, `실행` 그룹 라벨, 다음 순번 안내와 함께 바로 여는 `다음 실행`, 다음 순번 안내와 함께 첫 미완료 카드 URL만 복사하는 `다음 링크`, OS 공유로 보내는 `다음 링크 공유`, 다음 순번 안내가 붙은 `다음 액션 복사`, `다음 액션 공유`(여행 기간, 런웨이 초점/안내, 완료 액션 수, 단계 힌트, 다음 순번, `다음 액션`/`완료 런웨이` 상태, 다음 액션 링크 또는 완료 런웨이 링크 포함), 방금 연 액션 피드백, 모두 끝났을 때의 `모두 완료` 표시, 모두 완료 시 완료 안내를 담고 완료 톤의 `남은 액션 없음` 상태로 바뀌며 남은 개수를 title/aria-label에 포함하는 `남은 액션 복사`, `남은 액션 공유`(미완료 추천별 `다음 액션`/`참고 액션` 관계와 카드 링크 포함), 완료 개수를 title/aria-label에 포함하는 `완료 액션 복사`, `완료 액션 공유`(완료 추천별 `참고 액션`/`완료 런웨이` 관계와 카드 링크 포함), 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 `진행 요약 복사`, `진행 요약 공유`(다음 추천 카드 링크 또는 모두 완료 안내 포함), `공유/복사` 그룹 라벨, 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 `체크리스트 복사`, `체크리스트 공유`(여행 기간, 런웨이 초점/안내, 완료 액션 수, 체크리스트 링크 또는 완료 런웨이 링크, 항목별 `다음 액션`/`참고 액션`/`완료 런웨이` 관계와 카드 링크 포함), `체크 제어` 그룹 라벨, 남은/완료 개수와 진행 맥락을 title/aria-label에 포함하는 `전체 완료`, `체크 초기화`로 같은 브라우저의 플랜별/상태별 체크 상태를 관리하고 진행률/다음/업데이트/실행 피드백 변화와 체크 항목별 추천 이유와 반복 액션 버튼의 추천 순서와 액션명 기반 라벨, 완료 카드의 `완료됨` 상태와 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 카드별 `완료 취소`를 보조기술에도 전달하며 준비도, 짐싸기, 출발팩, 오늘 브리핑, 다음 액션, 오늘 예산, 회고, 지출 보기, 메모팩 같은 기존 도구 중 `1순위`/`2순위`/`3순위` 배지와 체크된 항목의 완료 카드 상태로 지금 먼저 볼 3가지를 바로 실행할 수 있습니다. 각 추천 카드의 진행률·단계 힌트·다음 순번과 `다음 액션`/`참고 액션`/`완료 런웨이` 관계를 title/aria-label에 포함하는 `액션 복사`로 해당 단일 액션과 이유, 선택 액션 완료/미완료 상태와 `다음 액션`/`참고 액션`/`완료 런웨이` 관계, 현재 체크 진행률과 퍼센트·단계 라벨·단계 힌트(모두 끝나면 `모두 완료`), `로컬 저장 전` 또는 `오늘 HH:mm`/`MM-DD HH:mm` 업데이트 시간, `이 브라우저 저장` 범위, 런웨이 링크만 따로 복사하거나, 지원 브라우저에서는 같은 진행 맥락을 title/aria-label에 포함하는 `액션 공유`로 OS 공유 시트를 바로 열 수 있고, 진행률·단계 힌트·다음 순번과 `다음 액션`/`참고 액션`/`완료 런웨이` 관계를 title/aria-label에 포함하는 `액션 링크`로 해당 추천 카드 앵커 링크만 짧게 복사하거나 `액션 링크 공유`로 같은 링크를 OS 공유 시트로 보낼 수 있습니다. 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 `런웨이 복사`로 플랜 상태, 현재 체크 진행률과 퍼센트·단계 라벨(모두 끝나면 `모두 완료`), 완료 액션 수, 남은 액션 수, 업데이트 시간, 추천 액션 3개와 각 추천의 `다음 액션`/`참고 액션`/`완료 런웨이` 관계, 완료/미완료 상태, 카드 링크, 런웨이 앵커 링크를 동행자에게 보낼 텍스트로 복사할 수 있고, 지원 브라우저에서는 `런웨이 공유`로 OS 공유 시트를 바로 열 수 있습니다. 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 `링크 모음 복사`와 `링크 모음 공유`는 여행 기간, 플랜 상태, 전체 런웨이 URL, 현재 체크 진행률, 단계 힌트, 완료 액션 수, 남은 액션 수, 다음 액션, 다음 순번, 업데이트 시간, 저장 범위, 초점, 안내, 추천 카드별 URL을 `다음 액션`/`참고 액션`/`완료 런웨이` 관계와 완료/미완료 상태와 함께 따로 전달합니다. 진행률·단계 힌트·다음 순번을 title/aria-label에 포함하는 `런웨이 링크`는 `#tripActionRunway`가 붙은 상세 링크만 복사하고 `런웨이 링크 공유`는 같은 링크를 OS 공유 시트로 보내며, 이 링크로 열면 상세 화면이 액션 런웨이로 바로 이동하고 해당 패널이 강조되며 상태 영역에는 `런웨이 링크로 열림` 피드백이 강조 톤으로 표시되고, 추천 카드 링크로 들어온 경우 해당 카드 순위 배지에 `링크 열림`과 `다음 액션`/`참고 액션`/`완료 런웨이` 맥락과 강조 색상이 표시되고 상태 영역에는 `링크로 열림: 추천명` 피드백이 강조 톤으로 표시되고 체크 상태가 바뀌거나 같은 상세 화면에서 URL 해시가 바뀌어도 `링크 열림` 배지와 라벨이 최신 링크 도착 상태로 유지되고, 런웨이 밖 해시로 이동하면 링크 도착 피드백이 지워지며, 완료된 추천 카드 링크로 들어오면 상태 영역에 `완료됨` 맥락, 현재 카드가 다음 액션인지 여부, 현재 체크 진행 요약과 다음 추천 액션도 함께 표시되며, 긴 링크 도착 피드백도 줄바꿈과 숫자 정렬이 적용된 강조 pill로 읽기 쉽게 표시됩니다.

홈 화면에서는 서버 상태, 접근 키 보호 모드 여부, LLM 모드, 날짜 해석 설정, 같은 Wi-Fi에서 열 수 있는 로컬 접속 URL 후보를 확인하고, 저장된 플랜을 검색하거나 전체/고정/예정/여행 중/완료로 필터링하고 전체 백업 JSON을 다운로드할 수 있습니다. `TRAVEL_ACCESS_KEY` 또는 `TRAVEL_REQUIRE_USER_LLM_KEY`가 켜진 공유 서버에서는 서버 상태 카드 아래에 공유 서버 시작 순서 패널도 표시하며, 접근 키 저장/운영 세부/웹 LLM 과금/LLM 입력/API 제한 준비도 체크리스트와 현재 상태 기반 다음 액션, `접근 키 설정`, `LLM 입력으로 이동`, `운영 env 복사`, `사용자 URL 복사`, `사용자 안내 복사`, `액션만 복사`, `전체 준비도 복사` 같은 상황별 버튼을 제공합니다. 각 버튼과 Wi-Fi URL 개별 `복사` 버튼에는 복사 범위와 목적을 설명하는 title이 붙고, 복사 결과는 `복사됨`, 자동 복사 대신 prompt fallback을 연 `수동 복사`, 실패한 `복사 실패`로 피드백합니다. `운영 env 복사`는 비밀값 없이 공유 서버용 `.env` 골격을 복사하고, `사용자 URL 복사`와 `사용자 안내 복사`는 화면에 표시된 Wi-Fi URL이 있으면 그 주소를 우선 사용하고, 저장된 접근 키가 있으면 보호된 `/api/network`에서 URL 후보를 한 번 조회하며, 둘 다 없으면 현재 웹 주소를 넣고 fallback 주소가 localhost일 수 있음을 주의 문구로 알려줍니다. `사용자 안내 복사`는 현재 선택된 provider에 맞는 공식 API key 발급 링크, 현재 선택된 provider/model, 현재 다음 액션, 공유받은 사용자가 따라 할 접근 키/API key/생성 순서를 함께 복사합니다. `액션만 복사`는 현재 할 일 한 줄과 생성 시각을 복사하고, `전체 준비도 복사`는 생성 시각, 접근 모드, 웹 LLM 정책, 현재 웹 LLM 입력 상태, provider/model 요약, 다음 액션, 체크리스트를 함께 복사합니다. `LLM 입력` 체크는 provider/API key 입력 변경을 따라 다시 갱신되고, `LLM 입력으로 이동`은 사용자 key 필수 모드에서 실행 방식이 서버 기본이면 OpenAI로 전환하고 API key 칸이 비어 있으면 그 칸에 포커스를 둡니다. `TRAVEL_ACCESS_KEY` 보호 모드에서는 공개 `/api/status` 응답에 내부 Wi-Fi URL 후보를 싣지 않고 홈 화면에 `Wi-Fi URL 숨김`으로 표시합니다. 접근키를 통과한 사용자는 `Wi-Fi URL 표시` 버튼으로 보호된 `/api/network`를 호출해 URL 후보를 볼 수 있습니다. 상세 화면에서는 출발 D-day/여행 중/완료 상태를 확인하고, 준비도 점검과 보강 플랜, 준비 공유문, 현황판과 다음 액션 추천, 오늘 브리핑/오늘 점검/내일 브리핑/오늘 공유/밤 점검과 오늘 일정이나 특정 N일차 일정 또는 특정 날짜 일정만 빠르게 보거나, 출발일/박수와 인원/1인 예산을 변경하거나, 오늘 예산과 예산 소진율과 카테고리별 예산 가드와 여행 회고를 확인하거나, 총 지출액을 인원 수로 간단 정산하거나, 실제 지출 항목을 날짜/카테고리별로 누적 기록해 결제자별 받을/낼 금액과 송금 요청문을 만들고 복사하거나 CSV로 내보내거나, 개인 메모를 저장하거나, 플랜을 `고정`/`복제`하거나 여행 준비 `체크리스트`, `비상 카드`, `안전팩 Markdown`, `출발팩 Markdown`, `오늘팩 Markdown`, `공유팩 Markdown`, `돈팩 Markdown`, `전체팩 Markdown`, `메모팩 Markdown`, `정산팩 Markdown`, `오프라인팩 Markdown`, `파일 가이드 Markdown`, `짐싸기 목록`, `출발 전 브리핑`, `예산 브리핑`, 지도 링크를 바로 열 수 있고, iPhone 공유 시트 공유, 공유 요약 복사, Markdown 다운로드, 캘린더 다운로드, 브라우저 인쇄/PDF 저장도 가능합니다. 파일이 많아 헷갈릴 때는 `추천 팩 보기`로 현재 플랜 기준 추천 순서를 확인하고 목적/대상/추천 여부로 좁히고 현재 필터와 표시/전체/추천 개수를 확인하며 1순위 팩을 미리보기/접기로 훑고 바로 다운로드하거나 링크 또는 Markdown 내용을 복사하고, 개별 팩도 바로 미리 보거나 다운로드하거나 링크 또는 Markdown 내용을 복사할 수 있고, API가 내려준 절대 다운로드 URL과 필터/개수 메타가 포함된 추천 목록을 복사하거나 카탈로그 JSON과 추천/전체 목록을 TXT, CSV 또는 Markdown 리포트로 받을 수 있으며, 묶음 버튼 라벨로 표시 전체와 선택 범위를 구분하며 현재 표시된 팩 전체, 추천만 선택, 또는 체크한 선택 팩의 Markdown 내용 묶음을 미리 보거나 링크나 Markdown 내용 묶음을 복사하거나 서버가 내려준 표시 묶음 경로와 선택 묶음 템플릿 기반 Bundle Markdown endpoint로 Markdown 파일을 다운로드하고 현재 필터 기준 export 링크 묶음을 한 번에 복사할 수 있고, `파일 가이드 Markdown`을 받아 상황별 추천 순서를 저장할 수 있습니다. 개인 메모는 검색, Markdown 다운로드, 공유 요약, Discord 플랜 표시, PDF 인쇄 화면에도 포함됩니다.

웹 API를 Wi-Fi나 외부 URL에 노출한다면 `.env`에 `TRAVEL_ACCESS_KEY=원하는키`를 설정하세요. 설정된 경우 웹/PWA에서 첫 API 호출 시 접근 키를 묻고, 계속 저장을 선택하면 같은 브라우저의 localStorage에, 취소하면 현재 탭 세션의 sessionStorage에 저장해 요청 헤더로 보냅니다. 홈 상태 카드와 오른쪽 아래 접근키 버튼은 현재 저장 범위를 `세션` 또는 `계속 저장`으로 표시하고, `세션으로 전환` 버튼으로 계속 저장된 키를 현재 탭 세션 저장으로 낮출 수 있습니다. 세션 전환 버튼은 상태에 따라 `이미 세션 저장` 또는 `세션 저장 없음`으로 비활성 상태를 표시합니다. 다른 탭에서 계속 저장된 접근키가 바뀌면 열린 탭의 상태 표시도 갱신됩니다. Discord 봇은 로컬 저장소를 직접 쓰므로 이 키의 영향을 받지 않습니다.

서버는 `/api/*` 응답에 `Cache-Control: no-store`를 붙이고 Express의 `X-Powered-By` 헤더를 끕니다.

기본적으로 같은 클라이언트에서 `/api/*`를 1분에 120회 넘게 호출하면 `429 rate limit exceeded`를 반환합니다. 웹 화면은 `Retry-After` 헤더를 읽어 재시도 안내 배너를 보여주고, 현재 제한값은 홈 상태 카드에도 표시됩니다. 인메모리 카운터는 만료된 윈도우를 주기적으로 정리합니다. `.env`에서 `TRAVEL_API_RATE_LIMIT_MAX=0`으로 끄거나, `TRAVEL_API_RATE_LIMIT_MAX`와 `TRAVEL_API_RATE_LIMIT_WINDOW_MS`로 조정할 수 있습니다.

웹/PWA 오른쪽 아래의 `접근 키 설정/변경`과 `접근 키 삭제` 버튼으로 저장된 키를 바꿀 수 있습니다. 백업, Markdown, 캘린더 같은 파일 다운로드도 URL에 키를 붙이지 않고 인증 헤더로 파일을 받아 저장합니다.

### 화면에서 내 LLM API 키로 1회 생성

새 일정 생성 폼의 `LLM 인증/실행 옵션`에서 `OpenAI API key` 또는 `Anthropic API key`를 고르고 API key와 모델명을 입력하면 서버 `.env` 키 대신 그 요청에만 해당 키를 사용합니다. 사용자 key 필수 모드에서는 새 일정 생성 폼과 상세 화면 고도화 폼의 안내 문구가 실행 방식/API key 입력 여부를 따라 `provider 필요`, `API key 필요`, `입력 준비됨`에 해당하는 메시지로 바뀝니다. API key 입력칸은 자동완성과 패스워드 매니저 저장 제안을 줄이기 위한 best-effort 속성을 사용합니다. `표시/숨김` 버튼은 붙여넣기 오류를 확인하기 위해 입력 타입만 임시로 바꾸며 값을 저장하지 않습니다. 요청 처리나 입력 오류로 key 입력칸을 비울 때는 다시 숨김 상태로 돌아갑니다. 브라우저는 반복 입력을 줄이기 위해 provider 선택값과 모델명만 localStorage에 기억하고 홈 생성 폼과 상세 고도화 폼에서 복원합니다. 오른쪽 아래 `LLM 선택 초기화` 버튼으로 이 자동 입력값을 지울 수 있습니다. API key 값은 저장하지 않습니다.

ChatGPT 로그인이나 Claude 로그인은 이 웹앱에 API 호출 권한을 자동으로 넘겨주지 않습니다. 화면의 `OpenAI API key 발급`, `Anthropic API key 발급` 링크로 각 provider의 공식 콘솔에서 키를 발급한 뒤 요청 1회용으로 붙여넣는 방식입니다.

다른 사람에게 웹앱을 공유할 때 `서버 기본 설정`을 쓰게 하면 운영자 `.env` 키로 실행되어 운영자 계정에 과금됩니다. 사용자의 provider 계정으로 과금되게 하려면 현재 구조에서는 `OpenAI API key` 또는 `Anthropic API key`를 요청 1회용으로 넣게 해야 합니다. ChatGPT/Claude OAuth 로그인만으로 일반 API 호출 권한을 이 웹앱에 위임받는 공개 흐름은 현재 구현 대상으로 두지 않습니다.

공유 배포에서 실수로 운영자 키가 쓰이는 것을 막으려면 `.env`에 `TRAVEL_REQUIRE_USER_LLM_KEY=true`를 설정하세요. 이 값이 켜진 상태에서는 새 플랜 생성과 기존 플랜 고도화 시 `서버 기본 설정`을 사용할 수 없고, 사용자가 OpenAI API key 또는 Anthropic API key를 요청 1회용으로 입력해야 합니다. 상세 화면 고도화 폼도 같은 provider/key/model 값을 `/api/plans/:id/refine` 요청 본문에 함께 보냅니다.
웹 화면도 이 상태를 감지하면 `서버 기본 설정` 옵션을 비활성화하고 OpenAI API key 선택으로 자동 전환합니다. 서버에서도 같은 정책을 다시 검사하므로, 프론트 UI를 우회해도 운영자 키 fallback은 사용되지 않습니다.
또한 요청 본문에 `llmApiKey`가 있으면 서버는 `llmProvider`가 OpenAI/Anthropic 계열인지 다시 검사합니다. `server`나 빈 provider와 함께 사용자 key가 들어온 직접 API 호출은 거절됩니다. `llmApiKey` 없이 들어온 `llmProvider`/`llmModel` override는 서버 기본 키의 provider/model을 바꾸지 못하도록 무시합니다.
`/api/status`, 홈 화면, Discord `/status`, Discord `/doctor`는 서버 기본 provider(`llmProvider`), provider별 기본 모델(`llmDefaultModels`), 실제 웹 생성/고도화 과금 정책(`webLlmPolicy`), 웹 API rate limit 설정을 분리해서 보여줍니다. `TRAVEL_ACCESS_KEY` 보호 모드의 공개 `/api/status`는 provider/model 세부값과 `operatorDetailsState=hidden`을 내려주고, 접근키가 저장된 화면은 보호된 `/api/operator-status`로 세부값과 `operatorDetailsState=confirmed`를 조용히 추가 조회합니다. 보조 조회가 rate limit에 걸리면 화면은 `operatorDetailsState=rate-limited`와 `operatorRetryAfterSeconds`로 다루고 `운영 세부: 제한 대기 N초`, `N초 후 기본 모델 확인` 힌트를 보여주며, 대기 시간이 지나면 status를 자동으로 한 번 다시 조회합니다. 탭이 숨겨져 있으면 자동 재조회는 실행하지 않고 다시 보일 때 한 번 확인하며, 자동 재조회 예약은 최대 300초로 제한하고, 페이지를 떠날 때는 예약된 자동 재조회 타이머를 정리합니다. 이 자동 재조회 흐름은 홈/상세 화면이 공통 helper를 사용하고, 자동 재조회 자체가 실패해도 화면 흐름은 유지하되 `console.debug`에 짧게 남긴 뒤 다음 수동/자동 상태 갱신 기회로 넘깁니다. 홈/상세 화면은 이 상태에서 `상태 다시 확인` 버튼도 제공합니다. 홈 상태 카드의 `운영 세부` 배지는 공개 모드이면 `공개`, 보호 모드에서 보조 조회가 반영됐으면 `확인됨`, 접근키가 없으면 `숨김`, 저장된 접근키로 보조 조회가 실패하면 `키 확인 필요`로 보여줍니다. 이때 상태 카드의 `접근 키 재입력` 버튼으로 바로 저장된 키를 교체할 수 있고, 재확인 중에는 버튼이 `확인 중...`으로 바뀌며 입력을 취소하면 원래 상태로 돌아갑니다. 홈/상세의 재입력 버튼은 같은 busy/취소 원복 흐름을 공유하고, status 재조회는 접근키 저장 이벤트 한 경로로 처리합니다. 이 보조 조회는 접근키가 없거나 틀려도 새 프롬프트를 띄우지 않으며, LAN URL 후보는 자동 노출하지 않고 `Wi-Fi URL 표시` 버튼의 보호된 `/api/network` 조회로만 보여줍니다. 접근키가 아직 없는 홈 화면은 숨겨진 provider/model 값을 기본값으로 추정하지 않고 `접근키 필요`로 표시하며, 새 플랜 생성 폼과 상세 화면 고도화 폼도 기본 모델 힌트를 접근키 저장 후 확인하도록 안내합니다. 상세 화면은 접근키가 없거나 저장된 키 확인이 실패한 경우 안내 문구 영역에도 기본 모델 힌트 확인 방법을 보여주며, 저장된 접근키가 문제인 경우 작은 inline `접근 키 재입력` 버튼을 제공합니다. 저장된 접근키가 있는데 보조 조회가 실패한 경우 두 폼의 모델 힌트는 접근키 재입력 후 확인하도록 안내합니다. 접근키 저장 범위가 바뀌면 홈/상세 화면 status도 다시 갱신됩니다.

공유 배포 체크리스트:
- `TRAVEL_REQUIRE_USER_LLM_KEY=true`로 웹 새 플랜 생성/고도화에서 운영자 키 fallback 차단
- `TRAVEL_ACCESS_KEY`로 웹 API 접근 자체를 보호
- Discord 봇은 이 스위치와 별개이므로 `DISCORD_ALLOWED_USER_IDS`, `DISCORD_ADMIN_USER_IDS`로 접근 제한

공유 웹앱 최소 env 예시:

```env
TRAVEL_ACCESS_KEY=공유_접근키
TRAVEL_REQUIRE_USER_LLM_KEY=true
```

공유받은 사용자의 웹 생성 순서:
1. `OpenAI API key 발급` 또는 `Anthropic API key 발급` 링크에서 provider 콘솔 열기
2. API key를 발급한 뒤 웹앱의 `LLM 인증/실행 옵션`에 붙여넣기
3. `실행 방식`을 `OpenAI API key` 또는 `Anthropic API key`로 선택
4. 모델명은 비우면 화면에 표시된 provider별 기본 모델을 사용합니다. 이 기본 모델 힌트는 `/api/status`의 `llmDefaultModels` 값을 따릅니다.
5. 새 플랜 생성 또는 상세 화면 고도화를 실행하고, 요청 후 key 입력칸이 비워졌는지 확인

이 키는 브라우저 localStorage, 저장된 플랜 입력값, `webapp/data/plans.json` 어디에도 저장하지 않습니다. 생성 요청이나 상세 화면 고도화 요청에서 요청 본문을 만든 직후 화면의 API key 입력칸을 먼저 비우고, 페이지를 떠날 때나 뒤로가기 복원 시에도 남아 있는 API key 입력칸을 비우며 숨김 상태로 되돌립니다. 이 정리 이벤트가 발생하면 홈/상세의 BYOK 안내 문구도 현재 빈 입력 상태에 맞춰 다시 계산됩니다. 상세 화면 BYOK 안내는 현재 다음 액션과 접근 키, 운영 세부, LLM 입력, API 제한 준비도 배지를 함께 보여주고, 현재 provider 선택에 맞는 `API key 링크 복사` 버튼과 현재 준비 상태를 공유하는 `준비도 복사`, 다음 액션 한 줄만 공유하는 `액션만 복사` 버튼도 제공합니다. `준비도 복사`에는 현재 다음 액션도 포함됩니다. 접근 키나 LLM 입력이 아직 `확인` 상태이면 복사 버튼보다 앞에 표시되는 `접근 키 설정` 또는 `LLM 입력으로 이동` 버튼으로 바로 조치할 수 있습니다. 서버 기본 상태에서는 OpenAI/Anthropic 링크를 함께 복사합니다. 상세 화면의 BYOK/정산/공유 복사 버튼들은 같은 클립보드 피드백 흐름을 공유하며, 자동 복사 성공은 `복사됨`, prompt fallback은 `수동 복사`, 실패는 `복사 실패`로 알려줍니다. 서버는 요청에서 옵션을 추출한 뒤 `req.body.llmApiKey`를 즉시 비웁니다. 사용자 API key가 들어온 생성/고도화 응답에는 `Cache-Control: no-store`도 붙입니다. 다만 브라우저에서 로컬 Express 서버로 한 번 전송되므로, 공유 컴퓨터나 신뢰하지 않는 네트워크에서는 사용하지 않는 편이 안전합니다. 키를 입력하지 않으면 기존처럼 서버 `.env`의 `LLM_PROVIDER`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_API_KEY` 설정을 사용합니다.

LLM provider 호출이 실패해도 provider가 반환한 원문 오류 본문은 저장하지 않고 HTTP 상태 중심의 짧은 오류만 남깁니다.

사용자가 요청 1회용 API key를 명시한 경우 provider 호출 실패 시 템플릿 fallback 플랜을 저장하지 않고 오류로 중단합니다. 서버 `.env` 키를 쓰는 개인/로컬 모드에서는 기존처럼 키 미설정 또는 provider 실패 시 템플릿 fallback으로 먼저 흐름을 확인할 수 있습니다.

각 플랜 버전 히스토리에는 `llmAuthMode`, `llmProvider`, 실제 사용 모델명, 사용자가 모델명을 직접 입력했는지 여부를 저장합니다. 홈 목록, 상세 화면, Discord 플랜 선택/히스토리, Markdown export에서는 이를 `사용자 key/OpenAI · gpt-4o-mini · 직접 모델`, `서버 기본 key · 자동 · mock-template`처럼 표시합니다. 상세 화면 히스토리, Discord `/history`, Markdown export의 버전 히스토리에는 각 버전의 자동 품질 점검도 `품질 OK` 또는 `품질 확인 N`으로 함께 표시하고, 직전 버전에 자동 품질 점검이 있으면 `개선 N` 또는 `추가 N` 변화량도 붙입니다. 플랜 복제본은 원본 최신 버전의 이 감사 메타데이터를 이어받습니다. 실제 API key 값은 저장하지 않습니다.

### iPhone 홈 화면에 앱처럼 추가

같은 Wi-Fi 또는 배포된 URL에서 Safari로 웹앱을 연 뒤 공유 버튼을 눌러 `홈 화면에 추가`를 선택하면 됩니다.

`/install.html`의 `1분 설치 루트`는 iPhone에서 눌러야 할 핵심 동작을 `Safari 공유`, `홈 화면에 추가`, `Travel 실행` 3칸 가이드로 먼저 보여준 뒤 proof 저장과 Mac final gate로 이어갑니다.

맥에서 실행 중이라면 홈 화면의 `서버 상태` 카드에 표시되는 `Wi-Fi` URL을 iPhone Safari에서 열면 됩니다. 옆의 `복사` 버튼으로 URL을 복사해 메모나 메시지로 옮길 수 있습니다. 이 URL은 같은 네트워크에 있을 때만 동작합니다.

현재 웹앱은 PWA manifest와 service worker를 포함합니다. 홈 화면에서 실행하면 독립 앱처럼 열리고, 기본 화면 리소스는 캐시됩니다. 다만 새 플랜 생성/고도화/API 조회는 서버 연결이 필요합니다.

서버가 꺼졌거나 Wi-Fi가 바뀌어 API에 연결할 수 없으면 화면 하단에 연결 상태 배너가 표시됩니다. 오프라인 상태에서는 캐시된 화면은 열 수 있지만 새 플랜 생성, 조회, 다운로드는 서버 연결이 필요합니다.

상세 화면의 `공유하기` 버튼은 iPhone Safari/PWA에서 기본 공유 시트를 열어 메시지, 카카오톡, 메모 등으로 플랜 요약과 링크를 보낼 수 있습니다. 공유 시트를 지원하지 않는 브라우저에서는 공통 클립보드 피드백이 붙은 복사 방식으로 fallback 됩니다.

정적 파일(`public/*.js`, `public/*.css`, manifest/icon 등)을 바꾼 뒤 iPhone 홈 화면 앱까지 즉시 갱신해야 한다면 `webapp/public/service-worker.js`의 `CACHE_NAME` 버전을 올려주세요.
하단 dock observer는 원본 제출 버튼의 result/result-at dataset 변화도 관찰해 submit finished 진단을 놓치지 않도록 합니다.
설치 화면의 상단 Phone URL 카드에는 Safari에서 열기, 홈 화면에 추가, Travel 아이콘 실행 순서가 바로 보여 QR/URL handoff 뒤에도 스크롤 없이 다음 탭을 확인할 수 있습니다.
설치 화면의 앱 모드 callout은 주소창 없음, 홈 화면 Travel 아이콘 시작, 설치 증거 저장 기준을 함께 보여 사용자가 Safari 탭과 Home Screen 앱 모드를 눈으로 구분할 수 있게 합니다.
설치 journey rail의 각 단계는 상단 URL 카드, 1분 설치 루트, Home Screen proof 또는 앱 홈 dock으로 바로 이동하는 링크로 동작합니다.
설치 journey rail이나 다음 행동 링크로 같은 페이지의 설치 단계에 이동하면 해당 target이 짧게 강조되어 어디로 도착했는지 바로 확인할 수 있습니다.
설치 journey의 다음 행동 링크는 `다음 1/4`, `다음 3/4`처럼 단계 번호와 대상 이름을 함께 보여 현재 iPhone에서 무엇을 눌러야 하는지 바로 알 수 있습니다.
iPhone 진단 복사는 설치 journey 다음 행동 링크의 href, label, state, 다음 step 번호를 value-free marker로 포함합니다.
설치 journey 다음 행동 링크는 next target id, target scope, 같은 페이지 target 존재 여부도 value-free marker로 남깁니다.
설치 journey는 같은 페이지 다음 target을 찾지 못하면 설치 URL/QR로 돌아가라는 fallback 안내를 status와 진단 marker에 남깁니다.
설치 journey 다음 행동 링크는 같은 페이지 target이 없을 때 실제 href도 설치 URL/QR fallback으로 바꾸고 effective href/label을 진단에 남깁니다.
설치 journey fallback 링크를 누르면 clicked href, label, 원래 target id를 value-free marker로 남기고 status가 복구 이동을 알려줍니다.
설치 journey fallback 클릭은 `sessionStorage`로 15분 동안 보존되어 설치 URL/QR 복구 위치에 도착한 뒤에도 status와 진단 복사에서 이어 확인할 수 있습니다.
설치 화면과 앱 홈의 사람이 복사하는 주요 Mac 명령은 짧은 `npm run ios:install:prepare` / `npm run ios:install:finish` alias를 우선 보여주어 iPhone 설치 중 터미널 입력 부담을 줄입니다.
Home Screen dock의 최종 gate 복사/공유/문자/메일과 완료 상태 handoff도 `npm run ios:install:finish` alias를 우선 전달합니다.
브라우저가 생성하는 설치 handoff/session fallback 텍스트도 `prepare -> iPhone 설치/proof 저장 -> finish`, 필요 시 `status` 순서의 짧은 operator path를 먼저 보여줍니다.
짧은 설치 세션 SMS도 `prepare`, `status`, `finish` operator path를 포함해 문자 앱만 열어도 Mac에서 실행할 순서를 잃지 않습니다.
설치 세션 문자/메일/QR 링크를 누르면 설치 상태 영역이 각각 compact SMS, detailed mail, session QR의 payload 종류와 다음 행동을 바로 알려줍니다.
설치 세션 문자/메일/QR 클릭은 payload 종류, 라벨, 클릭 시각, 상태 안내만 `sessionStorage`와 DOM marker에 남겨 iPhone 앱 전환 뒤에도 어떤 handoff를 열었는지 이어 확인할 수 있습니다.
iPhone 진단 복사는 최신 설치 세션 handoff의 clicked/kind/label/clicked-at/carryover/status/storage-failed marker를 포함해 문자/메일/QR 앱 전환 뒤의 흔적도 값 없이 공유할 수 있습니다.
iPhone 진단 복사 버튼의 title/aria-label도 `iosInstallSessionHandoff*` marker 묶음을 언급해, 복사 전에 세션 handoff 흔적이 포함됨을 알 수 있습니다.
설치 세션 문자/메일/QR 링크 아래에는 마지막으로 연 handoff 요약이 표시되어, 앱 전환 뒤에도 어떤 경로를 열었는지 화면에서 바로 회수할 수 있습니다.
마지막 handoff 요약은 `role=status`, `aria-live=polite`, `aria-atomic=true`로 노출되고 iPhone 진단에도 해당 접근성 marker가 포함됩니다.
오래된 설치 세션 handoff 요약은 `세션 handoff 요약 지우기` 버튼으로 숨기고 sessionStorage carryover를 지울 수 있으며, iPhone 진단에는 cleared marker만 값 없이 남깁니다.
`세션 handoff 요약 지우기` 버튼은 title/aria-label과 label/clicked/clicked-at/status-feedback marker도 iPhone 진단에 남겨 무엇을 지웠는지 값 없이 확인할 수 있습니다.
요약을 지우면 세션 문자/메일/QR 중 하나를 다시 열라는 restart hint가 표시되고, 새 handoff를 열면 자동으로 사라집니다.
restart hint에는 `세션 문자 다시 열기` 버튼이 함께 표시되어 새 compact SMS handoff를 바로 시작할 수 있고, 클릭 marker는 값 없이 iPhone 진단에 남습니다.
restart hint에는 `세션 메일 다시 열기`와 `세션 QR 다시 열기`도 함께 표시되어 문자 앱이 막혀도 상세 메일이나 Safari QR 흐름으로 재시작할 수 있습니다.
세 restart 버튼은 `role=group` 묶음으로 노출되어 VoiceOver에서 하나의 재시작 선택지 세트로 이해할 수 있고, group marker도 iPhone 진단에 포함됩니다.
restart action group은 restart hint를 `aria-describedby`로 참조해 세 버튼이 어떤 안내문을 따르는지 보조기술과 진단 marker에서 함께 확인됩니다.
restart action group은 보이는 `재시작 방법 선택: 문자, 메일, QR` 라벨을 `aria-labelledby`로 사용해 화면 텍스트와 보조기술 이름이 같은 기준을 따릅니다.
restart action group은 문자=짧은 operator path, 메일=상세 evidence, QR=iPhone Safari 재진입이라는 용도 설명을 함께 보여주고 해당 description marker를 진단에 남깁니다.
restart action group은 재시작 후 Safari 공유 버튼, 홈 화면에 추가, 홈 아이콘 실행으로 이어지는 다음 행동을 함께 보여주고 해당 next-step marker를 진단에 남깁니다.
Travel 홈 화면 실행 영역은 주소창 없음, proof 저장, 첫 플랜 생성을 설치 성공 체크로 보여줘 iPhone에서 설치 후 실사용 루프까지 바로 이어가게 합니다.
Travel 홈 화면 실행 성공 체크는 address-bar-free/proof-save/mac-final-gate/first-plan/status-review key와 label을 value-free evidence 및 iPhone 진단 marker로 남깁니다.
Travel 홈 화면 실행 성공 체크는 각 항목의 바로 가기 target route와 action label도 value-free evidence로 남겨 iPhone에서 다음 행동까지 추적합니다.
설치 journey target cue는 live status에도 도착한 위치 이름을 알려줘 VoiceOver나 작은 화면에서도 이동 결과를 놓치지 않게 합니다.
설치 journey target cue는 문서 루트에도 최신 target id, label, timestamp marker를 남겨 값 없는 진단에서 이동 결과를 추적할 수 있습니다.
iPhone 진단 복사는 최신 설치 journey target cue의 value-free id, label, timestamp marker도 포함해 이동 결과를 복사 기록으로 확인할 수 있습니다.
설치 모드 evidence 복사/공유도 최신 journey target cue marker를 포함해 Safari/Home Screen 모드와 이동 결과를 함께 확인할 수 있습니다.
설치 모드 SMS evidence도 최신 journey target cue marker를 value-free로 포함해 문자 핸드오프에서도 이동 결과를 잃지 않습니다.
설치 모드 handoff 컨트롤도 journey target cue 포함 여부를 value-free marker로 남겨 어떤 채널이 이동 결과를 싣는지 확인할 수 있습니다.
iPhone 진단 복사는 설치 모드 handoff 컨트롤의 journey cue coverage marker도 포함해 어떤 채널이 이동 결과를 싣는지 확인할 수 있습니다.
설치 모드 handoff 안내와 상태 메시지는 마지막 이동 위치가 evidence에 포함되는지 사용자에게 직접 알려줍니다.

## Discord 봇 실행

아이폰에서 Discord 앱으로 바로 쓰려면 웹 서버 대신 봇을 실행합니다.

1. Discord Developer Portal에서 Application/Bot 생성
2. `.env`에 토큰과 앱 ID 입력
3. `npm run bot:setup`으로 초대 URL과 빠진 설정 확인
4. 초대 URL로 내 서버에 봇 초대
5. `npm run bot:mock`으로 Discord 연결 먼저 확인
6. Claude 키를 넣은 뒤 `npm run bot` 실행

```bash
cd webapp
cp .env.example .env
npm install
npm run bot:setup
npm run bot:doctor
npm run bot:mock
npm run bot
npm run bot:install
npm run bot:uninstall
npm run bot:restart
npm run bot:status
npm run bot:logs
npm run bot:denied
npm run quality:todo -- --limit=10
npm run quality:todo:next
npm run quality:todo:next:all
npm run quality:todo:urgent
npm run quality:todo:urgent:all
npm run quality:todo:all
npm run quality:todo:report
npm run quality:todo:next:report
npm run quality:todo:urgent:report
npm run quality:todo:json
npm run quality:todo:next:json
npm run quality:todo:urgent:json
npm run quality:todo:gate
npm run quality:todo:gate:5
npm run quality:todo:next:gate
npm run quality:todo:next:gate:5
npm run quality:todo:urgent:gate
npm run quality:todo:urgent:gate:5
```

`npm run quality:todo -- --limit=10`은 로컬 JSON 저장소에서 우선도순 품질 고도화 TODO를 텍스트로 출력합니다. 자동화에서 파싱하려면 `--json`을 함께 사용하세요. `npm run quality:todo:next`, `npm run quality:todo:next:all`, `npm run quality:todo:urgent`, `npm run quality:todo:urgent:all`, `npm run quality:todo:all` 프리셋으로 추천 필터/긴급/전체 후보를 바로 출력할 수 있습니다. `npm run quality:todo:report`, `npm run quality:todo:next:report`, `npm run quality:todo:urgent:report`는 각각 `quality-todo.txt`, `quality-todo-next.txt`, `quality-todo-urgent.txt` 파일로 전체/추천/긴급 TODO 리포트를 저장합니다. `npm run quality:todo:json`, `npm run quality:todo:next:json`, `npm run quality:todo:urgent:json`은 각각 `quality-todo.json`, `quality-todo-next.json`, `quality-todo-urgent.json` 파일로 같은 범위의 JSON 리포트를 저장합니다. `--offset=10`으로 다음 배치를 가져올 수 있고, `--all`로 현재 offset부터 남은 후보를 한 번에 가져올 수 있으며, `--urgent` 또는 `--min-priority=80`으로 지정 우선도 이상의 급한 후보만 배치 처리할 수 있고, `--next`로 현재 `qualityNextFilter` 기준 후보만 배치 처리할 수 있습니다. `--urgent`로 만든 후속 조회 힌트는 `urgent=true`/`--urgent` 표현을 유지합니다. `--output=quality-todo.txt`를 주면 텍스트나 JSON 결과를 파일로 저장하고, 완료 메시지에는 출력 형식/필터가 포함된 배치 요약/상태가 함께 표시되며, `--quiet`를 함께 주면 이 완료 메시지를 생략합니다. `--fail-on-empty`를 주면 `no-action`, `empty-filter`, 또는 `empty-batch` 상태에서 exit code 2로 종료하고, `--fail-on-action`을 주면 매칭되는 품질 후보가 남아 있을 때 exit code 3으로 종료합니다. `--max-actions=5`를 주면 후보가 5개를 초과할 때만 exit code 3으로 종료합니다. `npm run quality:todo:gate`, `npm run quality:todo:next:gate`, `npm run quality:todo:urgent:gate`는 전체/추천/긴급 후보가 남아 있는지 점검하는 게이트 프리셋이고, `npm run quality:todo:gate:5`, `npm run quality:todo:next:gate:5`, `npm run quality:todo:urgent:gate:5`는 전체/추천/긴급 후보가 5개를 초과할 때만 실패하는 완화 게이트입니다. JSON `meta`에는 출력 형식, 저장 경로, quiet 여부, fail-on-empty 여부, 실패 여부, empty/action 실패 여부, action 게이트 기준/대상 수/상태, 종료 코드, env 파일 경로/출처/로드 여부도 들어갑니다. TODO 텍스트에도 전체 긴급 후보 수, 다음 품질 필터/이유/호출 경로, 게이트 호출 경로, 다음 배치 limit/offset과 현재 필터/게이트 조건을 유지한 API/CLI 힌트, 게이트 실행 시 후보 수/허용 수/통과 여부가 붙습니다. JSON에는 payload 타입/스키마 버전, 생성 출처, `--all` 모드 여부, 다음 추천 필터 모드 여부, 긴급 모드 여부, 선택 출처, 우선도 필터 출처(`none`/`urgent`/`min-priority`), 상태(`ready`/`no-action`/`empty-filter`/`empty-batch`), 상태 메시지, 추천 후속 동작, 빈 배치 여부, 생성 시각, 요청 limit/offset, 최소 우선도, 필터 라벨, 후보 수 기준, 필터 공백 여부, 필터 전 후보 수, 전체 긴급 후보 수, 다음 품질 필터/이유/호출 경로와 URL, 게이트 호출 경로와 URL, 반환 개수, 현재 배치 범위, 배치 요약, 전체 후보 수, 남은 후보 수, 추가 배치 여부, base URL 출처, 현재 필터/게이트 조건을 유지한 현재/전체/다음 조회용 query/API path/API URL/text path/text URL/CLI args/CLI command/JSON·text curl command가 `meta`로 들어갑니다. CLI는 기본적으로 실행 위치와 무관하게 `webapp/.env`를 명시적으로 읽고, `--env=../prod.env`로 다른 env 파일을 지정할 수 있으며 이 출처는 `meta.envSource`에 `default` 또는 `arg`로 남습니다. `--base-url=http://localhost:3000`을 직접 주거나 env의 `TRAVEL_PUBLIC_BASE_URL`을 설정하면 TODO 링크와 JSON에 절대 URL도 함께 들어갑니다.
옵션 예시는 `npm run quality:todo -- --help`로 확인할 수 있습니다.
텍스트 출력과 `/api/plans/quality-todo.txt`는 후보가 없거나 offset 범위가 비었을 때도 `상태:` 줄을 포함합니다.

`.env` 주요 값:

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ALLOWED_GUILD_IDS=내_DISCORD_SERVER_ID
DISCORD_ALLOW_DM=false
DISCORD_ALLOWED_USER_IDS=내_DISCORD_USER_ID
DISCORD_ADMIN_USER_IDS=내_DISCORD_USER_ID
TRAVEL_PUBLIC_BASE_URL=http://맥IP:3000
TRAVEL_PLANNER_PUBLIC_ORIGIN=https://example.com
TRAVEL_IOS_INSTALL_CHECK_PATH=reports/ios-install-check.json
TRAVEL_IOS_INSTALL_CHECK_SCHEMA_PATH=reports/ios-install-check.schema.json
TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH=reports/ios-install-session-check.json
TRAVEL_IOS_INSTALL_SESSION_SCHEMA_PATH=reports/ios-install-session.schema.json
TRAVEL_IOS_INSTALL_CHECK_TIMEOUT_MS=10000
TRAVEL_HEALTH_URL=
TRAVEL_HEALTH_TIMEOUT_MS=5000
TRAVEL_HEALTH_EVIDENCE=0
TRAVEL_API_FETCH_TIMEOUT_MS=5000
TRAVEL_API_FETCH_EVIDENCE=0
TRAVEL_OPS_WORKFLOWS_PATH=reports/ops-workflows.json
TRAVEL_PREFLIGHT_SUMMARY_PATH=reports/preflight.json
TRAVEL_BACKUP_FILE_PATH=travel-planner-backup.json
TRAVEL_BACKUP_FILE_CHECK_PATH=reports/storage-backup-file-check.json
TRAVEL_BACKUP_MANIFEST_PATH=reports/storage-backup-manifest.json
TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=reports/storage-backup-manifest.json
TRAVEL_BACKUP_VERIFY_PATH=reports/storage-backup-verify.json
LLM_PROVIDER=claude
CLAUDE_API_KEY=
# 또는 ANTHROPIC_API_KEY=
```

`DISCORD_GUILD_ID`를 넣으면 슬래시 커맨드가 해당 서버에 빠르게 등록됩니다. 비우면 global command로 등록되어 반영이 늦을 수 있습니다. `npm run bot:setup`은 초대 URL뿐 아니라 서버 allowlist, 사용자 allowlist, 운영 관리자 제한 상태, health API target, preflight 명령, operations runbook 위치, `ops:evidence:workflow`, storage backup/restore workflow도 함께 요약합니다.

`DISCORD_ALLOWED_GUILD_IDS`를 쉼표로 구분해 설정하면 해당 Discord server/guild ID에서만 봇이 응답합니다. global command를 쓰거나 봇이 여러 서버에 초대될 가능성이 있을 때 유용합니다. 서버 ID는 Discord에서 `/whoami`로 확인할 수 있고, `/whoami`, `/policy`, `/recover`는 allowlist 밖에서도 ID/정책/복구 확인용으로만 응답합니다. 값을 비워두면 모든 서버에서 응답합니다.

`DISCORD_ALLOW_DM=true`를 설정하면 DM에서도 봇이 응답합니다. 개인용 DM으로 쓰려면 `/whoami`가 보여주는 `DISCORD_ALLOWED_USER_IDS=내_ID`도 함께 설정해 본인 user ID만 허용하는 편이 안전합니다. 값을 비워두거나 `false`로 두면 DM에서는 `/whoami`, `/policy`, `/recover` 같은 확인용 명령만 응답합니다.

`DISCORD_ALLOWED_USER_IDS`를 쉼표로 구분해 설정하면 해당 Discord user ID만 봇을 사용할 수 있습니다. 가족/친구 서버에 봇을 넣되 개인용으로만 쓰고 싶을 때 유용합니다. user ID는 Discord에서 `/whoami`로 확인할 수 있고, `/whoami`, `/policy`, `/recover`는 allowlist 밖에서도 ID/정책/복구 확인용으로만 응답합니다. 값을 비워두면 명령 접근 권한이 있는 모든 사용자가 사용할 수 있습니다.

접근 설정이 아직 맞지 않아도 `/start`, `/iphone`, `/whoami`, `/policy`, `/iphoneenv`, `/recover`와 거기서 이어지는 `외부 사용`, `내 ID`, `정책`, `설정` 버튼은 시작/ID/env 확인용 복구 예외로 응답합니다. 접근이 차단된 응답 아래에도 같은 복구 버튼이 붙습니다. 여행 플랜 생성, 운영, 홈/상태/오프라인 같은 실제 기능은 기존 allowlist를 통과해야 합니다.

`DISCORD_ADMIN_USER_IDS`를 쉼표로 구분해 설정하면 `/ops`, `/doctor` 같은 운영 명령을 해당 Discord user ID만 실행할 수 있습니다. 이 값이 설정된 경우 `/status`도 일반 사용자에게는 DB 경로, guild ID, 상세 URL 대신 요약만 보여줍니다. 내 ID는 Discord에서 `/whoami`로 확인할 수 있고, 값을 비워두면 기존처럼 제한 없이 사용할 수 있습니다.

토큰만 넣고 LLM 키 없이 먼저 테스트하려면 `LLM_PROVIDER=mock`으로 실행할 수 있습니다.

`TRAVEL_PUBLIC_BASE_URL`을 설정하면 Discord 플랜 응답에 `웹 상세` 버튼과 상세 URL이 함께 붙습니다. iPhone에서 열려야 하는 값이므로, 같은 Wi-Fi에서만 쓸 때는 `http://맥IP:3000`, 외부에서도 열어야 할 때는 배포 URL이나 터널/VPN URL을 넣으세요. 값을 비워두면 Discord 봇은 기존처럼 메시지와 첨부 파일만 보냅니다.

가장 빠른 첫 확인은 `npm run bot:mock`입니다. 이 명령은 Claude/OpenAI 키 없이 템플릿 플랜으로 응답하므로, Discord 초대와 슬래시 커맨드 등록부터 확인할 수 있습니다.

로컬 설정을 먼저 훑고 싶으면 `npm run bot:doctor`를 실행하세요. 네트워크 호출 없이 `.env`, Discord 필수 env, 서버/사용자/운영관리자 allowlist, LLM 키, JSON 저장소 경로와 기본 무결성, `TRAVEL_PUBLIC_BASE_URL`, `TRAVEL_ACCESS_KEY` 보호 상태, protected API fetch helper timeout/header mode, health API checker target/timeout/evidence mode, preflight summary path, storage backup manifest/verify path, launchd plist 존재 여부를 점검합니다. 출력 하단에는 backup/restore workflow 안내도 함께 표시됩니다. launchd 설치 전에는 `npm run ops:preflight:offline`으로 file/env readiness를 보고, 서버가 실행 중이면 `npm run ops:preflight`로 release/handoff gate까지 확인하세요. launchd 봇 재시작과 상태 확인은 `npm run bot:restart`, 상태만 볼 때는 `npm run bot:status`, 실행 중 로그는 `npm run bot:logs`, 접근 차단 로그만 모아볼 때는 `npm run bot:denied`를 사용하세요.

`DISCORD_GUILD_ID`를 모르면 처음에는 비워두고 `npm run bot`을 실행하세요. 봇이 초대된 서버 목록과 서버 ID를 콘솔에 출력합니다. 그 값을 `.env`에 다시 넣고 재실행하면 슬래시 커맨드가 빠르게 갱신됩니다.

### Mac에서 봇 상시 실행

아이폰 Discord 앱을 외부에서 계속 쓰려면 Mac이나 배포 서버에서 봇 프로세스가 살아 있어야 합니다. macOS에서는 현재 프로젝트 경로 기준으로 launchd plist를 생성한 뒤 로그인 시 자동 실행할 수 있습니다.

`npm run bot:install`은 `webapp/.env`의 Discord 토큰과 앱 ID가 준비된 뒤 실행하세요. 먼저 `npm run bot:doctor`로 필수 env 실패가 없는지 확인하고, allowlist 설정이 필요하면 Discord에서 `/iphoneenv`로 접근 설정 파일을 받은 뒤 `.env`에 반영합니다.

현재 체크아웃 경로 기준으로 plist 생성, 로드, 시작까지 한 번에 하려면 `npm run bot:install`을 실행합니다. 더 이상 상시 실행하지 않으려면 `npm run bot:uninstall`로 LaunchAgent를 중지하고 unload합니다. 설치/시작/중지/로그 명령을 한 번에 보고 싶으면 다음을 실행합니다.

```bash
cd webapp
npm run bot:launchd:commands
```

이 helper는 launchd 명령과 함께 operations runbook 위치와 `ops:evidence:workflow`도 보여주므로, 프로젝트 문서를 먼저 열지 않아도 handoff evidence workflow를 찾을 수 있습니다.

직접 실행 흐름은 다음과 같습니다.

```bash
mkdir -p ~/Library/LaunchAgents
cd webapp
npm run bot:launchd:plist > ~/Library/LaunchAgents/com.travel-planner.discord-bot.plist
launchctl load ~/Library/LaunchAgents/com.travel-planner.discord-bot.plist
launchctl start com.travel-planner.discord-bot
tail -f /tmp/travel-planner-discord-bot.log
```

멈출 때는 다음을 실행합니다.

```bash
launchctl stop com.travel-planner.discord-bot
launchctl unload ~/Library/LaunchAgents/com.travel-planner.discord-bot.plist
```

launchd가 실행하는 봇도 `webapp/.env`를 읽습니다. Mac이 잠자기 상태가 되면 응답이 멈출 수 있으니, 외부에서 계속 호출하려면 전원 연결과 절전 설정을 함께 확인하세요.

고정 경로 예시가 필요하면 `webapp/launchd/com.travel-planner.discord-bot.plist.example`을 참고하세요.

봇 명령:

- `/start` : 처음 사용할 때 필요한 시작 가이드. 새 여행/모바일/홈/상태/가이드/오프라인 저장/외부 사용/설정/내 ID/정책 버튼 포함
- `/quick` : 한 줄 요청으로 빠르게 여행 플랜 생성
- `/plan` : 새 여행 플랜 생성
- `/refine` : 기존 플랜 고도화
- `/again` : 내 최근 플랜을 바로 고도화
- `/reschedule` : 기존 플랜 출발일/박수 변경
- `/partybudget` : 기존 플랜 인원/1인 예산 변경
- `/note` : 기존 플랜 개인 메모 저장
- `/memo` : 외부에서 떠오른 메모를 내 최근 또는 선택한 플랜에 빠르게 추가
- `/memos` : 개인 메모가 있는 내 여행 플랜 모아보기
- `/memosearch` : 내 여행 플랜 개인 메모에서 키워드 검색
- `/memoshare` : 내 플랜의 개인 메모를 동행에게 보낼 공유문으로 만들기
- `/home` : 모바일 홈처럼 최근/여행 중/예정/고정 플랜 보기
- `/dashboard` : 모바일에서 최근/여행 중/예정/고정 플랜 한 번에 보기
- `/mobile` : 아이폰 Discord 사용 흐름과 웹 상세 링크 상태 확인. 홈/메모/지금/돈/다음/준비/오늘/점검/밤/오프라인/외부/상태/가이드/운영 버튼, 목적별 추가 액션 선택 메뉴, 파일/백업 선택 메뉴 포함
- `/iphone` : iPhone에서 같은 Wi-Fi 밖 LTE/5G로 Discord 봇을 쓸 때의 조건, 웹 상세 링크 조건, 오프라인 대비 체크리스트 보기. 설정/내 ID/정책/체크리스트/상태/진단/운영/오프라인/모바일 버튼 포함
- `/iphoneenv` : iPhone/Discord 접근 설정용 `.env` 스니펫과 `travel-planner-iphone.env` 파일 받기
- `/recover` : 접근이 막혔을 때 현재 ID, 최소 `.env` 스니펫, 설정/내 ID/정책/외부 사용/관리자용 차단 로그 복구 버튼 보기
- `/whoami` : 내 Discord user ID와 현재 서버 ID 확인. 설정/정책/외부/운영/홈 버튼 포함
- `/policy` : 현재 Discord 서버/사용자 허용 여부, 운영자 접근 정책, 추천 `.env` 스니펫 확인. 외부 사용/설정/내 ID/정책/관리자용 차단 로그 버튼 포함
- `/doctor` : 현재 봇 런타임의 env, 저장소, 웹 링크, launchd 상태 점검. 상태/외부/설정/운영/홈/차단 로그 버튼 포함
- `/ops` : Mac 상시 실행, 로그, 재시작 힌트 보기. 진단/상태/외부/설정/홈/정책/차단 로그 버튼 포함
- `/denied [limit] [reason] [source]` : 최근 Discord 접근 차단 로그, 사유별 개수/수정 힌트, 추천 `.env` 조각과 `travel-planner-denied.env` 파일 받기. `limit`은 기본 8개, 최대 20개이고 `reason`/`source` 또는 전체/서버/DM/사용자/운영/출처 전체/세션/launchd 버튼으로 필터링할 수 있음. 상태/정책/설정/차단 로그/운영/복구/20개 보기 버튼 포함. 관리자용
- `/status` : Discord 봇, 저장소, 웹 링크, LLM 설정 상태 확인. 외부/설정/정책/운영/홈 버튼 포함
- `/readiness` : 여행 플랜 준비도와 출발 전 보강 항목 보기
- `/prepplan` : 준비도 기준 우선순위 보강 플랜 보기
- `/readyshare` : 동행에게 보낼 여행 준비 공유문 만들기
- `/now` : 오늘 상태, 다음 액션, 예산, 지출/정산 현황판 보기
- `/nextaction` : 여행 상태와 시간대 기준으로 지금 할 일 추천
- `/help` : Discord 명령 가이드
- `/guide` : 여행 중 상황별 Discord 명령 가이드
- `/plans` : 저장된 플랜 목록
- `/mine` : 내가 만든 플랜 목록
- `/pinned` : 내가 고정한 플랜 목록
- `/upcoming` : 내 예정 여행 플랜 목록
- `/qualitytodo` : 지금 고도화할 품질 후보 플랜 목록. `min_priority`, `urgent:true`, `next:true`로 지정 우선도 또는 현재 추천 품질 필터 후보만 볼 수 있음
- `/qualityurgent` : 우선도 80 이상 긴급 품질 후보 플랜 목록
- `/qualitybrief` : 공유할 품질 고도화 TODO 문장, 묶음 실행 프롬프트, 상위 후보 목록. `limit`, `min_priority`, `urgent:true`, `next:true`, 또는 `TODO 3`/`TODO 5`/`TODO 10`/`긴급 TODO`/`다음 TODO` 버튼으로 후보 개수, 긴급 후보, 다음 품질 필터 후보를 조정 가능
- `/quality` : 자동 품질 점검에서 보강이 필요한 내 플랜 목록
- `/qualityok` : 자동 품질 점검이 모두 OK인 내 플랜 목록
- `/qualityunaudited` : 자동 품질 점검이 아직 없는 내 플랜 목록
- `/qualitystatus` : 내 플랜의 품질 확인/악화/개선 개수, 다음 액션, 다음 목록/TODO text 호출 경로, 게이트 매트릭스와 배지 JSON/SVG/Markdown/JUnit XML/SARIF/Step Summary/Annotations/Outputs/PR Comment/Artifacts/Markdown Report/CI 가이드 Markdown/명령 묶음 JSON/text, CI 게이트 매트릭스, CI 명령 게이트, CI 게이트 명령, CI 명령 묶음, 로컬 shell/GitHub Actions CI 예시 경로, strict/완화/긴급/긴급 완화 게이트 호출 경로 보기
- `/qualitygate` : 내 플랜 품질 게이트 통과 여부 보기. `max_actions`, `urgent:true`, `next:true`, `min_priority`로 기준 조정 가능
- `/qualitygates` : 내 플랜 품질 게이트 매트릭스와 추천 액션, CI 명령 보기
- `/qualitycommands` : quality-gates 매트릭스 기준 내 플랜 전체/긴급/추천 품질 게이트 상태와 배지 JSON/SVG/Markdown, JUnit XML, SARIF, Step Summary, Annotations, Outputs, PR Comment, Artifacts, Markdown Report, CI 가이드 Markdown, CI 명령 JSON/text 경로, 명령 목록, 명령 묶음, 로컬 shell/GitHub Actions CI 예시 보기
- `/qualityworse` : 직전 버전보다 자동 품질 점검 확인 항목이 늘어난 내 플랜 목록
- `/qualitybetter` : 직전 버전보다 자동 품질 점검 확인 항목이 줄어든 내 플랜 목록
- `/backup` : 내 Discord 플랜 JSON 백업
- `/search` : 내 여행 플랜 검색
- `/checklist` : 내 플랜의 여행 준비 체크리스트
- `/emergency` : 내 플랜의 여행 비상 카드
- `/packing` : 내 플랜의 짐싸기 목록
- `/departure` : 내 플랜의 출발 전 브리핑
- `/budget` : 내 플랜의 예산 브리핑
- `/categorybudget` : 내 플랜의 카테고리별 예산 소진/초과 보기
- `/dailybudget` : 내 플랜의 오늘 또는 선택 날짜 하루 예산 보기
- `/spending` : 내 플랜의 예산 소진 현황
- `/money` : `/spending`과 같은 동작의 돈 관리 현황 빠른 별칭. 지출 입력/지출 내역/오늘 예산/회고/정산 요청/정산표/송금 방향/CSV 버튼 포함
- `/recap` : 내 플랜의 여행 회고/정산 요약
- `/recap_export` : 내 플랜의 여행 회고를 Markdown 파일로 받기
- `/settle` : 총 지출액을 현재 플랜 인원 수로 간단 정산
- `/settlematrix` : 저장된 지출 기준 결제자별 받을/낼 금액 보기
- `/settletransfers` : 저장된 지출 기준 누가 누구에게 얼마 보낼지 보기
- `/settlemessage` : 저장된 지출 기준 동행에게 보낼 정산 요청문 만들기
- `/expense` : 내 플랜에 지출 항목 저장
- `/spend` : `/expense`와 같은 동작의 빠른 지출 기록 별칭
- `/spendquick` : 한 줄 텍스트로 빠르게 지출 저장
- `/expenses` : 내 플랜의 누적 지출 기록과 결제자별 정산 보기. `category`, `date`, `paid_by`로 필터 가능
- `/expenses_export` : 내 플랜의 지출 기록을 CSV 파일로 받기. `category`, `date`, `paid_by`로 필터 가능
- `/expense_delete` : 내 플랜의 지출 항목 삭제
- `/expenseundo` : 내 플랜의 마지막 지출 항목 삭제
- `/expense_edit` : 내 플랜의 지출 항목 수정
- `/maps` : 내 플랜 목적지 지도 링크
- `/web` : 내 플랜의 웹/PWA 상세 링크
- `/calendar` : 내 플랜을 iOS/Google Calendar용 `.ics` 파일로 받기
- `/offline` : 내 플랜을 iPhone 오프라인 저장용 Markdown 파일로 받기
- `/export` : 내 플랜을 Markdown 파일로 받기
- `/share` : 내 플랜의 공유용 요약 보기
- `/duplicate` : 내 최근 플랜 또는 특정 플랜 복제
- `/day` : 내 플랜의 특정 일차 일정
- `/date` : 내 플랜의 특정 날짜 일정
- `/today` : 내 플랜의 오늘 일정
- `/brief` : 내 플랜의 하루 일정/예산 브리핑
- `/todaycheck` : 내 플랜의 오늘 출발/일정/지출 점검표
- `/tomorrow` : 내 플랜의 내일 일정/예산 브리핑
- `/dayshare` : 내 플랜의 오늘 또는 선택 날짜 동행 공유 요약
- `/nightcheck` : 내 플랜의 밤 지출/내일 준비 점검표
- `/history` : 플랜 버전 히스토리
- `/ask` : 내 플랜에 대해 질문
- `/show` : 저장된 플랜 다시 보기

`/start`는 처음 초대하거나 새 휴대폰에서 봇을 열었을 때의 짧은 시작 가이드입니다. `/status`, `/iphone`, `/mobile`, `/quick`, `/home` 또는 `/dashboard`, `/now`/`/nextaction` 순서로 첫 사용 흐름을 안내합니다. 응답 아래의 `새 여행` 버튼은 `/quick`과 같은 한 줄 요청 모달을 열어 바로 플랜을 만들고, `모바일`, `홈`, `상태`, `가이드` 버튼으로 첫 점검 화면을 바로 열고, `오프라인 저장` 버튼으로 최근 플랜 오프라인팩 Markdown을 바로 받을 수 있습니다. `외부 사용` 버튼은 `/iphone`과 같은 iPhone LTE/5G 사용 조건 체크리스트를 열고, `설정`, `내 ID`, `정책` 버튼은 접근 설정 파일, Discord user/server ID, allowlist 상태를 바로 보여줍니다.

`/help`와 `/guide`의 상황별 가이드에는 `/qualitystatus`, `/qualitygate`, `/qualitygates`, `/qualitycommands`, `/qualitytodo`, `/qualityurgent`, `/qualitybrief`, `/quality`, `/qualityok`, `/qualityunaudited`, `/qualityworse`, `/qualitybetter` 품질 루프도 함께 표시되고, `/qualitygate max_actions:5`로 후보 5개 이하 허용 게이트를, `/qualitygates`로 게이트 매트릭스와 추천 액션, CI 명령을 확인하고, `/qualitycommands`로 전체/긴급/추천 CI 게이트 상태와 배지 JSON/SVG/Markdown, JUnit XML, SARIF, Step Summary, Annotations, Outputs, PR Comment, Artifacts, Markdown Report, CI 가이드 Markdown, 명령 및 로컬 shell/GitHub Actions 예시를 바로 확인할 수 있음을 안내합니다. 응답 아래에는 현재 내 품질 카운트가 붙은 고도화 후보/긴급 후보/품질 확인/OK/미점검/악화/개선 버튼과 대상 플랜을 명시한 최우선 품질 보강 버튼, 별도 행의 `TODO 3`/`TODO 5`/`TODO 10`/`긴급 TODO`/`다음 TODO` 버튼, `게이트`/`완화 5`/`긴급 게이트`/`긴급 완화`/`다음 완화` 버튼, `보강 요청 보기` 버튼이 붙어 처음 쓰는 사용자가 도움말에서 바로 보강 대상과 개선/악화 목록, 공유 가능한 품질 TODO, 긴급 품질 TODO, 다음 품질 필터 TODO, 품질 보강 모달, 복사 가능한 보강 요청문으로 이동할 수 있습니다.

`/home`과 `/dashboard`는 Discord 모바일 홈 화면처럼 쓸 수 있습니다. 최근 플랜, 여행 중인 플랜, 예정 여행, 고정 플랜을 한 번에 보여주고, 아래 선택 메뉴에서 플랜을 탭하면 바로 전체 플랜을 다시 엽니다.

`/mobile`은 iPhone Discord 앱을 메인 클라이언트로 쓸 때 필요한 조건을 요약합니다. Mac이나 배포 서버에서 `npm run bot`이 계속 실행 중이면 외부 LTE/5G에서도 Discord 명령은 사용할 수 있고, 웹 상세 화면은 `TRAVEL_PUBLIC_BASE_URL`에 같은 Wi-Fi용 Mac IP, 터널/VPN URL, 또는 배포 URL을 넣었을 때만 버튼으로 열 수 있습니다. 응답 아래의 `홈`, `메모`, `지금`, `돈`, `다음`, `준비`, `오늘`, `점검`, `밤`, `오프라인`, `외부`, `상태`, `가이드`, `운영` 버튼으로 다음 화면을 바로 열 수 있고, `메모` 버튼은 최근 플랜에 타임스탬프 메모를 남기는 모달을 엽니다. `지금`은 최근 플랜 현황판, `돈`은 예산 소진 현황과 지출/정산 후속 버튼, `다음`은 지금 할 일 추천, `준비`는 출발 전 준비도 점검을 엽니다. 파일이 많아 헷갈리면 관리/파일/백업 선택 메뉴의 `파일: 사용 가이드`를 먼저 열어 상황별 추천 파일을 볼 수 있습니다. `오늘`은 오늘 일정, `점검`은 오늘 출발/일정/지출 점검표, `밤`은 밤 점검표를 열고, `오프라인`은 최근 플랜 오프라인팩 Markdown을 바로 받습니다. `외부`는 같은 Wi-Fi 밖 LTE/5G에서 Discord 명령과 웹 상세 링크가 각각 어떻게 동작하는지 보여줍니다. 기본 추가 액션 선택 메뉴는 `시작: 새 여행`, `입력: 지출`, `지출: 내역`, `질문: 플랜`, `예산: 전체`, `예산: 오늘`, `예산: 카테고리`, `정산: 요약`, `정산: 상세표`, `정산: 요청문`, `정산: 송금 방향`, `준비: 보강 플랜`, `준비: 출발 브리핑`, `준비: 체크리스트`, `준비: 짐싸기`, `안전: 비상 카드`, `공유: 오늘`, `공유: 준비`, `공유: 메모`, `운영: 하루 브리핑`, `운영: 내일 브리핑`, `운영: 회고`, `지도: 목적지`, `공유: 전체 플랜`처럼 목적별 접두어로 표시됩니다. 관리/파일/백업 선택 메뉴는 `관리: 고도화`, `관리: 일정 변경`, `관리: 인원/예산`, `관리: 고정/해제`, `관리: 복제`, `관리: 히스토리`, `파일: 지출 CSV`, `파일: 정산 Markdown`, `파일: 출발팩 Markdown`, `파일: 오늘팩 Markdown`, `파일: 메모 Markdown`, `파일: 공유팩 Markdown`, `파일: 돈팩 Markdown`, `파일: 전체팩 Markdown`, `파일: 오프라인팩 Markdown`, `파일: 안전팩 Markdown`, `파일: 사용 가이드`, `파일: 회고 Markdown`, `파일: Markdown`, `파일: 캘린더`, `백업: JSON`을 따로 제공합니다. `새 여행`은 `/quick`과 같은 한 줄 요청 모달을, `지출`은 최근 플랜에 `/spendquick`과 같은 한 줄 지출 입력 모달을 열고, `지출 내역`은 최근 플랜의 누적 지출 원장을 보여주며, `질문`은 최근 플랜에 `/ask`와 같은 질문 모달을 엽니다. `관리`는 최근 플랜을 고도화하거나 출발일/박수/인원/1인 예산을 바꾸거나 고정/해제하거나 새 플랜으로 복제하거나 버전 히스토리를 보여주고, `예산`은 전체 예산 브리핑, 오늘 하루 예산, 카테고리별 소진 위험도를 보여줍니다. `정산`은 누적 지출 기준 요약, 결제자/참여자별 상세표, 동행에게 보낼 요청문, 실제 송금 방향을 보여주고, `지출 CSV`는 지출 기록을 CSV로, `정산 Markdown`은 기본 여행 정보와 지출 원장, 정산 요약/상세/송금 방향/요청문을 한 파일로, `출발팩 Markdown`은 준비도 리포트, 보강 액션 플랜, 전체 플랜, 출발 브리핑, 체크리스트, 짐싸기, 비상 카드, 지도 링크를 한 파일로, `오늘팩 Markdown`은 지금 현황, 다음 액션, 오늘 일정, 하루 브리핑, 오늘 점검표, 동행 공유 요약, 밤 점검표, 내일 브리핑을 한 파일로, `메모 Markdown`은 개인 메모와 동행 공유문을 한 파일로, `공유팩 Markdown`은 전체 플랜 공유, 오늘 공유, 준비 공유, 메모 공유, 정산 요청문, 지도 링크를 한 파일로, `돈팩 Markdown`은 예산 브리핑, 예산 소진 현황, 하루/카테고리 예산, 지출 원장, 정산 요약/상세/송금 방향을 한 파일로, `전체팩 Markdown`은 전체 플랜, 출발 준비, 체크리스트, 짐싸기, 비상 카드, 지도 링크, 오늘 실행, 돈 관리, 동행 공유, 개인 메모, 회고를 한 파일로, `오프라인팩 Markdown`은 웹 상세 화면 없이 저장해둘 기본 정보, 플랜 버전, 파일 생성 시각, 저장 후 사용 순서, 재저장 기준, 최신 확인 방법, 웹 상세 링크, 온라인 복귀 순서, 전체 일정, 다음 액션, 체크리스트, 비상 카드, 예산/정산 요약, 개인 메모를 한 파일로, `안전팩 Markdown`은 비상 카드, 지도 링크, 출발 브리핑, 체크리스트, 개인 메모와 메모 공유문을 한 파일로, `사용 가이드`는 최근 플랜이 없어도 상황별 추천 파일과 첫 사용 순서를 설명하며 같은 화면에서 다시 파일을 고를 수 있게 하고, `회고 Markdown`은 여행 회고를 파일로 내려받습니다. `보강 플랜`, `출발 브리핑`, `체크리스트`, `짐싸기`, `비상 카드`는 최근 플랜 기준으로 출발 준비와 안전 정보를 바로 보여줍니다. `오늘` 공유는 동행에게 보낼 당일 요약을 만들고, `준비` 공유는 출발 전 준비 상태 요약을 만들며, `메모` 공유는 최근 플랜의 개인 메모를 동행에게 보낼 문장으로 보여줍니다. `하루 브리핑`은 오늘 일정과 예산을 함께 보여줍니다. `내일 브리핑`은 다음 날 일정과 오늘 밤 준비를 보여줍니다. `회고`는 여행 회고와 정산 요약을 최근 플랜 기준으로 보여줍니다. `TRAVEL_PUBLIC_BASE_URL`이 설정되어 있으면 기본 액션 메뉴에 `웹: 상세`이 함께 표시되고, `웹 홈 열기` 링크 버튼도 함께 표시됩니다. `백업: JSON`은 최근 플랜이 없어도 내 Discord 플랜 전체 JSON을 내려받습니다.

`/iphone`은 같은 Wi-Fi 밖에서 iPhone으로 쓸 때의 체크리스트입니다. Discord 명령은 Mac/서버에서 봇이 켜져 있으면 LTE/5G에서도 사용할 수 있고, `localhost:3000` 웹 상세 화면은 iPhone에서 직접 열 수 없으므로 같은 Wi-Fi용 Mac IP, 터널/VPN, 또는 배포 URL을 `TRAVEL_PUBLIC_BASE_URL`에 넣어야 한다는 차이를 한 화면에서 확인합니다. 현재 웹 상세 접근 진단도 함께 보여주므로 설정값이 미설정인지, 같은 Wi-Fi용 로컬 주소인지, 외부 접근 가능한 URL인지 바로 구분할 수 있습니다. 웹 상세가 안 열릴 때는 Discord 버튼/명령, `/offline` 오프라인팩, `TRAVEL_PUBLIC_BASE_URL` 재설정 중 어떤 선택지를 쓰면 되는지도 안내합니다. 설정 힌트로 현재 사용자의 `DISCORD_ALLOWED_USER_IDS=내_ID`, `DISCORD_ADMIN_USER_IDS=내_ID` 예시, 서버에서 열었을 때의 현재 server ID, 새 명령 빠른 등록용 `DISCORD_GUILD_ID=내_SERVER_ID`, 같은 Wi-Fi용 `TRAVEL_PUBLIC_BASE_URL=http://맥IP:3000`, 외부용 터널/VPN/배포 URL 차이도 함께 보여줍니다. 함께 설정 전이거나 접근이 막혔을 때는 `/recover`, `/start`, 또는 `/iphoneenv`, ID 확인은 `/whoami`, 정책 확인은 `/policy`, 설정 반영 후에는 `/status`, 관리자용 `/doctor`, `/ops`, `/offline`, `/mobile`, `/home` 순서의 사전 점검 흐름도 안내하고, 응답 아래의 `설정`, `내 ID`, `정책`, `체크리스트`, `상태`, `진단`, `운영`, `오프라인`, `모바일` 버튼으로 바로 이어갈 수 있습니다. 버튼 첫 줄은 설정 전 복구용, 둘째 줄은 설정 반영 후 점검/운영용입니다. `진단` 버튼은 `/doctor`로 이어지므로 `DISCORD_ADMIN_USER_IDS` 제한이 있으면 관리자만 볼 수 있고, `내 ID` 버튼으로 `.env`에 넣을 Discord user ID를 확인할 수 있습니다. `정책` 버튼은 `/policy`로 이어져 서버/사용자/운영자 allowlist 상태를 확인합니다. `설정` 버튼은 현재 사용자 ID가 들어간 `.env` 스니펫을 보여주고, 코드펜스 없이 바로 붙여넣기 쉬운 `travel-planner-iphone.env` 파일도 첨부합니다. 설정 응답 아래의 `외부 사용`, `내 ID`, `정책`, `체크리스트` 버튼으로 외부 점검, ID 확인, allowlist 확인, iPhone 체크리스트까지 바로 이어갈 수 있습니다. 서버 안에서 누르면 첨부 파일의 guild 빠른 명령 등록과 서버 제한 주석 예시에 현재 server ID도 함께 들어갑니다. 첨부 파일에는 개인용 사용자 제한과 운영 관리자 제한이 활성 값으로 들어가고, DM 허용, guild 빠른 명령 등록, 서버 제한, 웹 상세 URL은 주석 예시로 들어가므로 필요한 항목만 골라 주석 해제하면 됩니다. 새 slash command가 늦게 보이면 `DISCORD_GUILD_ID` 예시를 설정한 뒤 봇을 다시 시작하고 `/status`에서 guild/global 등록 범위를 확인합니다. 설정 저장 후에는 Mac에서 `cd webapp && npm run bot:restart`로 봇을 다시 시작하고 `/status`, `/iphone`으로 반영 여부를 확인하면 됩니다. Discord 운영 안내는 관리자 설정 반영 후 `/ops`에서 확인하세요.

`/iphoneenv`는 `/iphone`의 `설정` 버튼을 바로 여는 단축 명령입니다. allowlist 설정이 꼬였을 때도 ID/env 확인용으로 응답하며, 현재 사용자 ID가 들어간 `.env` 스니펫과 첨부 파일을 한 번에 받을 수 있습니다.

`/recover`는 allowlist, DM, server 설정이 꼬였을 때 입력하는 복구 화면입니다. 현재 Discord user ID와 server ID, 최소 `.env` 스니펫, 설정 파일, 내 ID, 정책, 외부 사용 버튼을 보여주며, 관리자라면 차단 로그 버튼으로 `/denied` 화면도 바로 열 수 있습니다. 실제 여행 생성/운영/홈/상태/오프라인 기능은 allowlist 반영 후 사용할 수 있습니다.

`/whoami`는 iPhone 권한 설정을 시작할 때 쓰는 ID 확인 명령입니다. 응답의 user ID는 `DISCORD_ALLOWED_USER_IDS`와 `DISCORD_ADMIN_USER_IDS`에 넣고, server ID는 서버 제한이 필요할 때 `DISCORD_ALLOWED_GUILD_IDS`에 넣습니다. 응답 아래의 `외부 사용`, `설정`, `내 ID`, `정책` 버튼으로 외부 사용 점검, `.env` 파일 받기, ID 재확인, allowlist 확인까지 바로 이어갈 수 있습니다.

`/policy`는 현재 서버/DM 위치와 내 사용자 ID가 allowlist를 통과하는지 보여줍니다. 설정 파일이 필요하면 `/iphoneenv`, iPhone 외부 사용 조건은 `/iphone`, 처음 흐름은 `/start`로 이어가면 됩니다.

`/offline`은 최근 플랜 또는 지정한 `plan_id`를 iPhone 오프라인 저장용 Markdown 파일로 바로 받는 단축 명령입니다. 오프라인팩 파일명에는 플랜 버전과 UTC 생성 시각이 포함되어 여러 번 저장한 파일을 구분하기 쉽습니다. `/mobile`의 `파일: 오프라인팩 Markdown`과 같은 내용을 메뉴 탐색 없이 내려받고, 파일 응답 아래의 모바일 버튼으로 다음 행동을 바로 고를 수 있습니다.

`/memo`는 밖에서 생각난 예약번호, 맛집 후보, 준비물, 동행 요청을 빠르게 쌓는 모바일 캡처 명령입니다. `plan_id`를 비우면 내 최근 플랜에 추가하고, `plan_id`를 넣으면 특정 플랜에 `- [MM/DD HH:mm] 내용` 형식으로 누적합니다. `/memos`는 개인 메모가 있는 내 플랜과 최근 메모를 모아 보여주고, 선택 메뉴에서 바로 플랜을 열 수 있습니다. `/memosearch`는 내 최근 플랜의 개인 메모와 목적지에서 키워드를 찾아줍니다. `/memoshare`는 최근 또는 특정 플랜의 개인 메모를 동행에게 붙여넣기 좋은 공유문으로 만들어줍니다. 기존 `/note`는 특정 플랜의 개인 메모를 한 번에 저장하거나 `-`로 삭제할 때 쓰면 됩니다.

`/doctor`는 Discord 안에서 현재 봇 런타임의 필수 env, LLM 키 상태, JSON 저장소 읽기, 웹 상세 URL 성격, launchd plist 설치 여부를 OK/WARN/FAIL로 보여줍니다. 응답 아래의 `상태`, `외부`, `설정`, `운영`, `홈`, `차단 로그` 버튼으로 상태 재확인, iPhone 외부 설정, 운영 치트시트, 홈 화면, 접근 차단 로그로 바로 이어갈 수 있습니다.

`/ops`는 Mac에서 봇을 오래 켜둘 때 필요한 실행 위치, 저장소 경로, launchd plist 생성 명령, 시작/중지 명령, 표준 로그와 에러 로그 위치를 짧게 보여주고, 폰에서 `/doctor`, `/status`, `/iphone`, `/mobile`, `/offline`, `/home` 순서로 확인할 흐름도 함께 보여주는 운영 치트시트입니다. 응답 아래의 `진단`, `상태`, `외부`, `설정`, `홈`, `정책`, `차단 로그` 버튼으로 바로 이어갈 수 있습니다. allowlist에 막힌 호출은 `discord-access-denied` 로그로 시간, user ID, guild ID, interaction 이름, 차단 사유만 남으며, Discord 안에서는 관리자용 `/denied` 또는 `차단 로그` 버튼으로 현재 런타임 접근 설정, 실행 세션 메모리, launchd 에러 로그, 출처별 개수, 사유별 개수와 수정 힌트, 추천 `.env` 조각을 한 번에 확인할 수 있습니다. `/denied limit:20`처럼 최근 표시 개수를 최대 20개까지 조절하거나 `/denied reason:운영 차단`, `/denied source:현재 세션`, `/denied` 응답의 전체/서버/DM/사용자/운영/출처 전체/세션/launchd 버튼으로 로그를 필터링할 수 있습니다. 버튼 필터는 현재 선택한 사유와 출처를 함께 유지하고 선택된 필터 버튼을 강조합니다. `복구` 버튼은 `/recover` 화면으로 이어지고, `20개 보기` 버튼은 현재 필터를 유지한 채 최근 20개로 확장합니다. `/denied` 로그 줄에는 `[session]` 또는 `[launchd]` 출처가 붙고, 상단에는 출처별 개수도 표시됩니다. launchd 에러 로그에는 과거 차단 항목도 남을 수 있으므로, 수정 후에는 `[session]`의 새 `time=` 항목이 늘어나는지 기준으로 봅니다. 추천 조각은 현재 봇 프로세스의 기존 allowlist와 최근 차단 값을 병합한 결과이며, iPhone에서 복사하기 쉽도록 `travel-planner-denied.env` 첨부 파일도 함께 제공합니다. `/denied` 응답에는 `상태`, `정책`, `설정`, `차단 로그`, `운영` 버튼이 붙어 설정 반영 후 재확인 루프를 바로 이어갈 수 있습니다. 응답에는 `.env` 반영, `npm run bot:restart`, `/status`, `/policy`, `/denied` 재확인 순서도 함께 표시됩니다. Mac에서는 `grep discord-access-denied /tmp/travel-planner-discord-bot.err` 또는 `npm run bot:denied`로 모아볼 수 있습니다.

`/status`는 봇이 온라인인지, JSON 저장소를 읽을 수 있는지, iPhone Discord 명령을 외부 LTE/5G에서 쓸 수 있는지, `TRAVEL_PUBLIC_BASE_URL`이 iPhone에서 열릴 성격의 URL인지, LLM 키가 있는지, 명령이 guild/global 중 어디에 등록되는지를 보여줍니다. iPhone 외부 사용 조건과 설정 파일이 필요하면 다음 액션이나 `외부`, `설정`, `정책`, `운영`, `홈` 버튼으로 이어갑니다.

`/readiness`는 일정, 교통, 숙박, 예산, 지출/정산, 개인 메모, 고정 여부를 점수화하고 출발 전 먼저 보강할 항목을 추천합니다.

`/prepplan`은 `/readiness`에서 비어 있는 항목 중 영향도가 큰 것부터 5개까지 추려 실행 순서와 입력 예시를 보여줍니다.

`/readyshare`는 준비도 점수와 출발 전 우선 보강 항목 3개를 동행 채팅방에 붙여넣기 좋은 짧은 문장으로 바꿔줍니다.

`/now`는 현재 여행 상태, 시간대별 추천 명령, 예산 소진율, 오늘 지출, 결제자 미입력 개수, 자주 쓰는 바로가기를 한 화면에 보여주는 빠른 현황판입니다.

`/nextaction`은 출발 전에는 체크리스트/짐싸기/출발 브리핑, 여행 중에는 시간대별 오늘 브리핑/점검/밤 점검, 여행 후에는 회고/정산처럼 지금 가장 먼저 누르면 좋은 명령과 웹 버튼을 추천합니다.

`/help`와 `/guide`는 처음 만들기, 여행 전, 여행 중 아침, 돈 관리, 여행 중 밤, 여행 후 상황별로 자주 쓰는 명령을 한 화면에 보여줍니다.

플랜 응답 아래에는 `고도화` 또는 자동 품질 경고가 있을 때 `품질 보강`, `질문`, `히스토리`, `카테고리 예산`, `예산`, `지도`, `오늘`, `고정`, `체크리스트`, `짐싸기`, `출발`, `소진`, `회고`, `회고 파일`, `공유`, `복제`, `비상`, `Markdown`, `오프라인` 버튼과 `현황판`, `준비도`, `보강 플랜`, `준비 공유`, `오늘 브리핑`, `오늘 점검`, `내일 브리핑`, `오늘 공유`, `밤 점검`, `오늘 예산`, `메모 보기`, `다음 액션`을 고르는 루틴 선택 메뉴가 붙습니다. `품질 보강`은 자동 품질 점검의 확인 항목과 우선순위를 고도화 모달에 미리 채웁니다. `TRAVEL_PUBLIC_BASE_URL`이 설정되어 있으면 `웹 상세` 버튼도 함께 붙습니다. 모바일에서는 `/home`, `/dashboard`, `/again`, `/history`, `/ask`, `/budget`, `/categorybudget`, `/dailybudget`, `/readiness`, `/prepplan`, `/readyshare`, `/now`, `/nextaction`, `/brief`, `/todaycheck`, `/tomorrow`, `/dayshare`, `/nightcheck`, `/spending`, `/recap`, `/recap_export`, `/maps`, `/today`, `/checklist`, `/emergency`, `/packing`, `/departure`, `/share`, `/duplicate`, `/export`, `/offline`, `/calendar`, `/memo`, `/memos`를 다시 입력하지 않고 버튼과 선택 메뉴로 바로 이어갈 수 있고, 자주 보는 플랜은 `고정`해 `/pinned`에서 다시 열 수 있습니다.

`/mine`은 내 플랜 목록과 선택 메뉴를 함께 보여줍니다. 목록 줄과 선택 메뉴에는 `품질 OK` 또는 `품질 확인 N` 요약과 이전 버전 대비 `개선 N`/`추가 N` 변화량이 함께 표시되고, `/qualitystatus`는 내 품질 카운트와 품질 OK 비율, 다음 액션, 최우선 대상, 게이트 매트릭스/CI 명령 묶음 JSON/text/CI 게이트 매트릭스/CI 게이트 명령/CI 명령 묶음/strict/완화/긴급/긴급 완화/다음 strict/다음 완화 게이트 호출 경로, 카운트가 붙은 고도화 후보/긴급 후보/품질 확인/OK/미점검/악화/개선 목록 버튼, 최우선 품질 보강 모달 버튼, `TODO 3`/`TODO 5`/`TODO 10`/`긴급 TODO`/`다음 TODO` 버튼, 복사 가능한 `보강 요청 보기` 버튼을 보여줍니다. 0개인 목록 버튼은 비활성화됩니다. `/qualitygate`는 내 플랜의 품질 후보 수가 허용 기준을 넘는지 통과/실패로 보여주고, 실패 시 바로 `/qualitybrief`로 이어갈 다음 액션을 제안하며 `max_actions:5`로 후보 5개 이하 허용 게이트를 확인할 수 있습니다. `/qualitygates`는 strict/완화/긴급/추천 게이트 매트릭스와 실패 시 추천 액션, CI 명령을 한 번에 보여줍니다. `/qualitycommands`는 quality-gates 매트릭스 기준 전체/긴급/추천 CI 게이트 상태와 CI 명령 JSON/text 경로, 명령 목록, 명령 묶음, 로컬 shell/GitHub Actions CI 예시를 짧게 보여줍니다. `/qualitytodo`와 `/qualityurgent`는 품질 확인 또는 미점검 상태인 고도화 후보를 우선순위대로 보여주며 `min_priority`, `urgent:true`, `next:true`를 주면 지정 우선도 이상만 표시하고, 상단 TODO 요약에도 상위 후보 5개를 붙이고, 각 줄에는 우선도와 `후보: 악화 +N 먼저 보강`, `후보: 확인 N 보강`, `후보: 품질 점검 생성` 이유를 붙이고, 목록 데이터에도 `qualityActionReason`, `qualityNextAction`, `qualityActionPriority`, `qualityActionPriorityLabel`를 포함합니다. `/qualitybrief`는 최우선 대상, 후보 구성, 우선도, 이유, 다음 액션, 실행 힌트, 우선도 높은 순서의 묶음 실행 프롬프트와 지정한 상위 후보(기본 5개, 최대 10개)별 우선도/이유/다음 액션/실행 힌트를 줄 단위로 묶은 품질 고도화 TODO로 만들어 공유하기 쉽게 보여주고, `min_priority`, `urgent:true`, `next:true` 옵션이나 `긴급 TODO` 버튼은 지정 우선도 이상의 후보만 같은 형식으로 묶으며, `다음 TODO` 버튼은 `qualityNextFilter` 기준 후보를 같은 형식으로 묶습니다. `/qualitystatus`와 `/guide`의 `TODO 3`/`TODO 5`/`TODO 10` 버튼은 해당 후보 개수의 TODO를 바로 열고, `게이트`/`완화 5`/`긴급 게이트`/`긴급 완화`/`다음 완화` 버튼은 strict 게이트, 후보 5개 이하 허용 게이트, 우선도 80 이상 긴급 strict/완화 게이트를 즉시 실행합니다. 품질 확인/악화/미점검 목록도 상단에 해당 필터 기준 TODO 묶음을 함께 붙입니다. `/quality`는 이 중 보강이 필요한 플랜만, `/qualityok`는 품질 점검이 모두 OK인 플랜만, `/qualityunaudited`는 자동 품질 점검이 아직 없는 플랜만, `/qualityworse`는 확인 항목이 늘어난 플랜만, `/qualitybetter`는 확인 항목이 줄어든 플랜만 모아 보여줍니다. `/qualityunaudited` 목록과 미점검만 남은 `/qualitystatus`에서는 `품질 점검 생성` 버튼으로 최신 품질 가드 요청을 고도화 모달에 미리 채울 수 있습니다. 목록에서 플랜을 탭하면 전체 플랜이 바로 열립니다.

`/history`는 내 최근 플랜의 버전 목록과 선택 메뉴를 보여줍니다. 각 버전 줄에는 LLM 실행 메타데이터와 품질 점검 요약이 함께 표시됩니다. `plan_id`를 넣으면 특정 플랜의 이전 버전도 다시 열 수 있습니다.

`/ask`는 내 최근 플랜 또는 특정 `plan_id`의 플랜을 바꾸지 않고 질문에만 답합니다.

지출 카테고리는 직접 입력하지 않아도 `택시`, `점심`, `호텔`, `카페`, `입장권`, `선물` 같은 항목명을 기준으로 `교통`, `식비`, `숙소`, `카페`, `관광`, `쇼핑`, `기타` 중 하나로 자동 추론됩니다. `/spend`는 `/expense`와 같은 동작의 빠른 별칭이라 여행 중 iPhone Discord에서 짧게 지출을 남길 때 쓰기 좋습니다. `/spendquick text:커피 4500 나`처럼 한 줄로 쓰면 금액을 뽑고 남은 앞부분을 항목명, 마지막 단어를 결제자로 저장합니다. `2026-07-02`, `category:식비`, `paid_by:민수`도 함께 쓸 수 있습니다. 저장 후에는 `/expenses`, `/dailybudget`, `/settlemessage` 다음 확인 명령과 `소진`, `오늘 예산`, `회고`, `정산 요청`, `되돌리기` 버튼이 함께 표시됩니다. 방금 잘못 넣은 지출은 `되돌리기` 버튼이나 `/expenseundo`로 삭제할 수 있고, 특정 항목은 `/expense_delete`로 삭제합니다. 삭제나 수정 후에도 예산/회고/정산 후속 버튼이 유지됩니다. 잘못 분류되면 `/expense_edit category:...`로 바로 수정할 수 있습니다.

지출 내역이 길어지면 `/expenses category:식비`, `/expenses date:2026-07-02`, `/expenses paid_by:민수`처럼 카테고리/날짜/결제자 기준으로 좁혀볼 수 있습니다. `/money`는 `/spending`과 같은 돈 관리 현황 빠른 별칭이라 여행 중 지출/예산 감각을 짧게 확인할 때 쓰기 좋고, 결과 아래의 `지출 입력`, `지출 내역`, `오늘 예산`, `회고`, `정산 요청`, `정산표`, `송금 방향`, `CSV` 버튼으로 이어갈 수 있습니다. `지출 입력` 버튼은 `/spendquick`과 같은 한 줄 입력 형식을 사용합니다. 웹 상세 화면의 지출 기록 카드에서도 같은 필터로 내역 보기와 CSV 다운로드를 할 수 있습니다.

`/settlematrix`는 저장된 지출을 기준으로 1인 부담액을 계산하고, 결제자별 받을 금액/더 낼 금액을 보여줍니다. 결제자 이름이 빠진 지출이 있으면 먼저 `/expense_edit paid_by:이름`으로 보강하는 편이 좋습니다.

`/settletransfers`는 저장된 지출을 기준으로 실제 송금 방향을 `누구 -> 누구: 금액` 형태로 보여줍니다. 송금 요청 전에는 `/settlematrix`와 함께 확인하세요.

`/settlemessage`는 `/settletransfers` 결과를 동행 채팅방에 바로 붙여넣기 좋은 요청문으로 바꿔줍니다. 결제자 미입력 지출이 있으면 요청문 끝에 확인 문구가 붙습니다.

`/categorybudget`은 총예산을 기준으로 `숙소 35%`, `식비/카페 30%`, `교통 20%`, `관광/쇼핑/기타 15%` 권장 한도를 잡고 실제 지출이 `안정`, `주의`, `위험`, `초과` 중 어디에 있는지 보여줍니다.

`/dailybudget`은 총예산을 여행 일수로 나눈 하루 권장 예산과 선택 날짜의 실제 지출을 비교합니다. `date`를 비우면 오늘 기준으로 보고, `/dailybudget date:2026-07-02`처럼 특정 날짜도 볼 수 있습니다.

`/brief`는 선택 날짜의 일정과 하루 예산을 한 번에 묶어 보여줍니다. 아침에 오늘 동선과 지출 여유를 같이 확인할 때 쓰기 좋습니다.

`/todaycheck`는 나가기 전 준비물, 이동/예약 확인, 오늘 일정 운영, 지출 기록, 비상 카드, 하루 마감 체크를 체크박스 형식으로 보여줍니다.

`/tomorrow`는 내일 날짜의 일정/예산 브리핑과 오늘 밤 준비 체크를 함께 보여줍니다. 여행 중 밤에 다음 날 동선을 가볍게 정리할 때 쓰기 좋습니다.

`/dayshare`는 오늘 일정 확인 명령, 점검 명령, 당일 지출 합계, 지도 링크, 동행 액션만 짧게 묶어 동행에게 공유하기 좋게 보여줍니다.

`/nightcheck`는 오늘 지출 누락, 내일 일정 준비, 충전/짐 정리, 숙소/비상 확인을 체크박스로 보여줍니다.

`/recap`은 현재 플랜의 일정 상태, 총지출/예산 소진율, 카테고리별 지출, 날짜별 지출, 결제자별 지출, 개인 메모, 다음 액션을 한 번에 요약합니다. 여행 마지막 날이나 여행 직후에 동행 공유/최종 정산 전에 확인하기 좋습니다. `/recap_export` 또는 웹 상세 화면의 `회고 Markdown`으로 같은 내용을 파일로 보관할 수 있습니다.

빠른 예시:

```text
/start
/quick request:부산 2박3일 친구랑 맛집 위주 서울 출발 KTX
/quick request:7월 1일 부산 2박3일 친구 3명이서 맛집 위주 서울 출발 KTX 1인 20만원
/again feedback:2일차를 바다 위주로 바꿔줘
/reschedule plan_id:1 start_date:2026-07-01 nights:3
/partybudget plan_id:1 travelers:3 budget_per_person:250000
/note plan_id:1 text:숙소 예약번호 ABC123
/memo text:광안리 근처 브런치 후보 찾아보기
/memos
/memosearch query:브런치
/memoshare
/home
/dashboard
/mobile
/iphone
/iphoneenv
/recover
/whoami
/policy
/doctor
/ops
/denied
/status
/readiness
/prepplan
/readyshare
/now
/nextaction
/help
/guide
/ask question:비 오면 2일차를 어떻게 바꾸면 좋아?
/budget
/maps
/web
/calendar
/offline
/export
/share
/duplicate
/day day:2
/date date:2026-07-02
/today
/upcoming
/backup
/search query:부산 맛집
/mine
/pinned
/checklist
/emergency
/packing
/departure
/categorybudget
/brief
/todaycheck
/tomorrow
/dayshare
/nightcheck
/dailybudget date:2026-07-02
/spending
/money
/recap
/recap_export
/settle amount:135000 paid_by:민수
/settlematrix
/settletransfers
/settlemessage
/expense amount:18000 label:택시 category:교통 date:2026-07-02 paid_by:민수
/spend amount:4500 label:커피 paid_by:나
/spendquick text:커피 4500 나
/expenses category:교통
/expenses_export date:2026-07-02
/expenseundo
/expense_delete expense_id:1
/expense_edit expense_id:2 amount:22000 category:식비 date:2026-07-03 paid_by:지은
/history
```

## 폴더 구조

```
webapp/
  server.js
  package.json
  .env.example
  src/
    discord-bot.js
    llm.js
    storage.js
  public/
    index.html
    plan.html
    app.js
    plan.js
    style.css
  data/
    plans.json (런타임 생성)
```

## iOS 확장

현재 API가 정적 URL로 분리되어 있어 iOS 앱에서는 다음 방식으로 바로 연동 가능합니다.

- `GET /api/plans` : 저장된 플랜 목록
- `GET /api/plans?q=검색어` : 목적지/동행/메모 기반 플랜 검색
- `GET /api/plans?filter=upcoming` : 전체/고정/예정/여행 중/완료 필터
- `GET /api/backup` : 전체 플랜 JSON 백업 다운로드
- `GET /api/plans/{id}` : 플랜 상세
- `GET /api/plans/{id}/budget` : 총예산/하루 예산/권장 배분 브리핑
- `GET /api/plans/{id}/category-budget` : 카테고리별 예산 소진/초과 가드
- `GET /api/plans/{id}/daily-budget?date=YYYY-MM-DD` : 선택 날짜 하루 예산과 지출 현황
- `GET /api/plans/{id}/spending` : 예산 소진 현황
- `GET /api/plans/{id}/recap` : 여행 회고/정산 요약
- `GET /api/plans/{id}/recap.md` : 여행 회고 Markdown 다운로드
- `GET /api/plans/{id}/settlement?amount=금액` : 총 지출액 간단 정산
- `GET /api/plans/{id}/settlement-matrix` : 저장된 지출 기준 결제자별 받을/낼 금액
- `GET /api/plans/{id}/settlement-transfers` : 저장된 지출 기준 송금 방향과 금액
- `GET /api/plans/{id}/settlement-message` : 저장된 지출 기준 동행 공유용 정산 요청문
- `GET /api/plans/{id}/expenses?category=식비&date=YYYY-MM-DD&paid_by=민수` : 누적 지출 기록과 결제자별 정산
- `GET /api/plans/{id}/expenses.csv?category=식비&date=YYYY-MM-DD&paid_by=민수` : 지출 기록 CSV 다운로드
- `GET /api/plans/{id}/calendar` : iOS/Google Calendar용 `.ics` 파일 다운로드
- `GET /api/plans/{id}/checklist` : 여행 준비 체크리스트
- `GET /api/plans/{id}/emergency` : 여행 비상 카드
- `GET /api/plans/{id}/safety-pack.md` : 비상 카드, 지도 링크, 출발 전 브리핑, 준비 체크리스트, 짐싸기 목록, 개인 메모를 묶은 오프라인 저장용 안전팩 Markdown 다운로드
- `GET /api/plans/{id}/departure-pack.md` : 준비도 리포트, 보강 액션 플랜, 전체 플랜, 출발 브리핑, 체크리스트, 짐싸기, 비상 카드, 지도 링크를 묶은 출발팩 Markdown 다운로드
- `GET /api/plans/{id}/today-pack.md` : 지금 현황, 다음 액션, 오늘 일정, 하루 브리핑, 오늘 점검표, 동행 공유 요약, 밤 점검표, 내일 브리핑을 묶은 오늘팩 Markdown 다운로드
- `GET /api/plans/{id}/share-pack.md` : 전체 플랜 공유, 오늘 공유, 준비 공유, 메모 공유, 정산 요청문, 지도 링크를 묶은 공유팩 Markdown 다운로드
- `GET /api/plans/{id}/money-pack.md` : 예산 브리핑, 예산 소진 현황, 하루/카테고리 예산, 지출 원장, 정산 요약/상세표, 송금 방향, 동행 요청문을 묶은 돈팩 Markdown 다운로드
- `GET /api/plans/{id}/full-pack.md` : 전체 플랜, 출발 준비, 오늘 실행, 돈 관리, 지출 원장, 정산 요약, 동행 공유, 개인 메모, 회고를 묶은 전체팩 Markdown 다운로드
- `GET /api/plans/{id}/memo-pack.md` : 여행 기본 정보, 개인 메모, 동행 공유문을 묶은 메모팩 Markdown 다운로드
- `GET /api/plans/{id}/settlement-pack.md` : 지출 원장, 정산 요약, 정산 상세표, 송금 방향, 동행 요청문을 묶은 정산팩 Markdown 다운로드
- `GET /api/plans/{id}/offline-pack.md` : 웹 상세 화면 없이 저장해둘 기본 정보, 최신 확인 방법, 웹 상세 링크, 전체 일정, 다음 액션, 체크리스트, 비상 카드, 돈/정산 요약, 개인 메모, 지도 링크를 묶은 오프라인팩 Markdown 다운로드
- `GET /api/plans/{id}/file-guide.md` : 상황별 추천 파일, 현재 플랜 기준 추천, 파일별 역할, 저장 순서, 재저장 기준, 웹 상세 링크를 묶은 파일 사용 가이드 Markdown 다운로드
- `GET /api/plans/{id}/packs` : 사용 가능한 Markdown 팩의 id, 라벨, 다운로드 경로, 절대 다운로드 URL, 목적 category, 대상 audience, 용도, recommended 여부, recommendedOrder, recommendedReason, 현재 응답 기준 1순위 primaryPack, 현재 플랜 기준 추천 순서, 전체/필터/추천 개수, 현재 필터 기준 exports(JSON/TXT/Markdown/Bundle Markdown/Bundle Manifest JSON/Bundle Lock JSON/Bundle Lock Markdown/Bundle Summary JSON/Bundle Health JSON/Bundle Health Markdown/Bundle Health CSV/Bundle Health CSV Schema/Bundle Health Badge SVG/Health Metrics/Bundle Health Alerts YAML/Bundle Health Dashboard JSON/Bundle Health Events JSON/Bundle Health Events Schema/Validation JSON/Bundle Health Report Markdown/Bundle Artifacts JSON/CSV/schema/Bundle Artifact Families Markdown/JSON/JSON Schema/CSV/schema/Bundle Schema Index Markdown/JSON/CSV/CSV Schema/Schema Index contract coverage source aliases/Bundle Command Preset Steps CSV/schema/Workflow preflight source commands aliases와 `bundleWorkflowPreflightReadiness`/`bundleAllWorkflowPreflightReadiness`/`bundleDisplayWorkflowPreflightReadiness` readiness payload/Bundle Handoff text/Bundle env/Bundle commands shell/Bundle Index Markdown/Bundle Runbook Markdown/Bundle Verification Markdown/Bundle Verification JSON/Bundle Verification CSV/Bundle Verification CSV Schema/Bundle Checksums text/Bundle Checksums JSON/Bundle Checksums CSV/Bundle Checksums CSV Schema/CSV 추천·전체 경로와 URL, 선택 묶음용 `bundleSelectedPathTemplate`/`bundleSelectedUrlTemplate`와 `bundleSelectedManifestPathTemplate`/`bundleSelectedManifestUrlTemplate`와 `bundleSelectedLockPathTemplate`/`bundleSelectedLockUrlTemplate`와 `bundleSelectedLockMarkdownPathTemplate`/`bundleSelectedLockMarkdownUrlTemplate`와 `bundleSelectedSummaryJsonPathTemplate`/`bundleSelectedSummaryJsonUrlTemplate`와 `bundleSelectedHealthJsonPathTemplate`/`bundleSelectedHealthJsonUrlTemplate`와 `bundleSelectedHealthMarkdownPathTemplate`/`bundleSelectedHealthMarkdownUrlTemplate`와 `bundleSelectedHealthCsvPathTemplate`/`bundleSelectedHealthCsvUrlTemplate`와 `bundleSelectedHealthSchemaPathTemplate`/`bundleSelectedHealthSchemaUrlTemplate`와 `bundleSelectedHealthBadgePathTemplate`/`bundleSelectedHealthMetricsPathTemplate`/`bundleSelectedHealthAlertsPathTemplate`/`bundleSelectedHealthDashboardPathTemplate`/`bundleSelectedHealthEventsPathTemplate`/`bundleSelectedHealthEventsSchemaPathTemplate`/`bundleSelectedHealthEventsValidationPathTemplate`/`bundleSelectedHealthReportPathTemplate`/`bundleSelectedHealthBadgeUrlTemplate`/`bundleSelectedHealthMetricsUrlTemplate`/`bundleSelectedHealthAlertsUrlTemplate`/`bundleSelectedHealthDashboardUrlTemplate`/`bundleSelectedHealthEventsUrlTemplate`/`bundleSelectedHealthEventsSchemaUrlTemplate`/`bundleSelectedHealthEventsValidationUrlTemplate`/`bundleSelectedHealthReportUrlTemplate`와 `bundleSelectedArtifactsPathTemplate`/`bundleSelectedArtifactsUrlTemplate`와 `bundleSelectedArtifactsCsvPathTemplate`/`bundleSelectedArtifactsCsvUrlTemplate`와 `bundleSelectedCommandPresetStepsCsvPathTemplate`/`bundleSelectedCommandPresetStepsCsvUrlTemplate`와 `bundleSelectedHandoffPathTemplate`/`bundleSelectedHandoffUrlTemplate`와 `bundleSelectedEnvPathTemplate`/`bundleSelectedEnvUrlTemplate`와 `bundleSelectedCommandsPathTemplate`/`bundleSelectedCommandsUrlTemplate`와 `bundleSelectedIndexPathTemplate`/`bundleSelectedIndexUrlTemplate`와 `bundleSelectedRunbookPathTemplate`/`bundleSelectedRunbookUrlTemplate`와 `bundleSelectedVerifyPathTemplate`/`bundleSelectedVerifyUrlTemplate`와 `bundleSelectedVerifyJsonPathTemplate`/`bundleSelectedVerifyJsonUrlTemplate`와 `bundleSelectedVerifyCsvPathTemplate`/`bundleSelectedVerifyCsvUrlTemplate`와 `bundleSelectedVerifySchemaPathTemplate`/`bundleSelectedVerifySchemaUrlTemplate`와 `bundleSelectedChecksumsPathTemplate`/`bundleSelectedChecksumsUrlTemplate`와 `bundleSelectedChecksumsJsonPathTemplate`/`bundleSelectedChecksumsJsonUrlTemplate`와 `bundleSelectedChecksumsCsvPathTemplate`/`bundleSelectedChecksumsCsvUrlTemplate`와 `bundleSelectedChecksumsSchemaPathTemplate`/`bundleSelectedChecksumsSchemaUrlTemplate`, 현재 표시 팩 ids가 채워진 `bundleDisplayPackIds`/`bundleDisplayPath`/`bundleDisplayUrl`와 `bundleDisplayManifestPath`/`bundleDisplayManifestUrl`와 `bundleDisplayLockPath`/`bundleDisplayLockUrl`와 `bundleDisplayLockMarkdownPath`/`bundleDisplayLockMarkdownUrl`와 `bundleDisplaySummaryJsonPath`/`bundleDisplaySummaryJsonUrl`와 `bundleDisplayHealthJsonPath`/`bundleDisplayHealthJsonUrl`와 `bundleDisplayHealthMarkdownPath`/`bundleDisplayHealthMarkdownUrl`와 `bundleDisplayHealthCsvPath`/`bundleDisplayHealthCsvUrl`와 `bundleDisplayHealthSchemaPath`/`bundleDisplayHealthSchemaUrl`와 `bundleDisplayHealthBadgePath`/`bundleDisplayHealthMetricsPath`/`bundleDisplayHealthAlertsPath`/`bundleDisplayHealthDashboardPath`/`bundleDisplayHealthEventsPath`/`bundleDisplayHealthEventsSchemaPath`/`bundleDisplayHealthEventsValidationPath`/`bundleDisplayHealthReportPath`/`bundleDisplayHealthBadgeUrl`/`bundleDisplayHealthMetricsUrl`/`bundleDisplayHealthAlertsUrl`/`bundleDisplayHealthDashboardUrl`/`bundleDisplayHealthEventsUrl`/`bundleDisplayHealthEventsSchemaUrl`/`bundleDisplayHealthEventsValidationUrl`/`bundleDisplayHealthReportUrl`와 `bundleDisplayArtifactsPath`/`bundleDisplayArtifactsUrl`와 `bundleDisplayArtifactsCsvPath`/`bundleDisplayArtifactsCsvUrl`와 `bundleDisplayCommandPresetStepsCsvPath`/`bundleDisplayCommandPresetStepsCsvUrl`와 `bundleDisplayWorkflowPreflightCommandMode`/`bundleDisplayWorkflowPreflightSourceCommandsPath`/`bundleDisplayWorkflowPreflightSourceCommandsUrl`/`bundleDisplayWorkflowPreflightReadiness`와 `bundleDisplayHandoffPath`/`bundleDisplayHandoffUrl`와 `bundleDisplayEnvPath`/`bundleDisplayEnvUrl`와 `bundleDisplayCommandsPath`/`bundleDisplayCommandsUrl`와 `bundleDisplayIndexPath`/`bundleDisplayIndexUrl`와 `bundleDisplayRunbookPath`/`bundleDisplayRunbookUrl`와 `bundleDisplayVerifyPath`/`bundleDisplayVerifyUrl`와 `bundleDisplayVerifyJsonPath`/`bundleDisplayVerifyJsonUrl`와 `bundleDisplayVerifyCsvPath`/`bundleDisplayVerifyCsvUrl`와 `bundleDisplayVerifySchemaPath`/`bundleDisplayVerifySchemaUrl`와 `bundleDisplayChecksumsPath`/`bundleDisplayChecksumsUrl`와 `bundleDisplayChecksumsJsonPath`/`bundleDisplayChecksumsJsonUrl`와 `bundleDisplayChecksumsCsvPath`/`bundleDisplayChecksumsCsvUrl`와 `bundleDisplayChecksumsSchemaPath`/`bundleDisplayChecksumsSchemaUrl`), availableFilters(category/audience/recommended 값·개수·JSON/TXT/Markdown/Bundle Markdown/Bundle Manifest JSON/Bundle Lock JSON/Bundle Lock Markdown/Bundle Summary JSON/Bundle Health JSON/Bundle Health Markdown/Bundle Health CSV/Bundle Health CSV Schema/Bundle Health Badge SVG/Health Metrics/Bundle Health Alerts YAML/Bundle Health Dashboard JSON/Bundle Health Events JSON/Bundle Health Events Schema/Validation JSON/Bundle Health Report Markdown/Bundle Artifacts JSON/CSV/schema/Bundle Artifact Families Markdown/JSON/JSON Schema/CSV/schema/Bundle Schema Index Markdown/JSON/CSV/CSV Schema/Schema Index contract coverage source aliases/Bundle Command Preset Steps CSV/schema/Workflow preflight source commands aliases/Bundle Handoff text/Bundle env/Bundle commands shell/Bundle Index Markdown/Bundle Runbook Markdown/Bundle Verification Markdown/Bundle Verification JSON/Bundle Verification CSV/Bundle Verification CSV Schema/Bundle Checksums text/Bundle Checksums JSON/Bundle Checksums CSV/Bundle Checksums CSV Schema/CSV 경로와 URL)를 반환하는 팩 카탈로그 JSON. `category`, `audience`, `recommended=true|false` 필터를 지원
- `GET /api/plans/{id}/packs.bundle.workflow-preflight.json` : Workflow preflight readiness, Schema Index Markdown-first review target, generated workflow-preflight command, generated commands source path/URL을 하나의 machine-readable handoff JSON으로 반환. `all=true`, `scope`, `ids`, `category`, `audience`, `recommended=true|false` 필터를 지원
- `GET /api/plans/{id}/packs.bundle.workflow-preflight.schema.json` : compact Workflow preflight handoff JSON의 readiness, Schema Index review target, generated command/source metadata, Schema Index coverage payload 계약을 `application/schema+json`으로 반환
- `/packs` JSON exports와 `/packs.txt`/`/packs.md`는 Workflow preflight JSON handoff와 schema의 현재 필터/전체/선택/visible path·URL·template alias, Pack catalog CSV schema path·URL을 함께 노출해 downstream tool이 payload와 contract endpoint를 catalog에서 바로 발견할 수 있게 합니다.
- `packs.bundle.json` manifest artifacts에는 `workflow-preflight-json`과 `workflow-preflight-schema` 항목이 포함되어 manifest-first consumer도 compact Workflow preflight handoff JSON과 schema를 발견할 수 있습니다.
- Generated `packs.bundle.commands.sh`는 `workflow-preflight-json`과 `workflow-preflight-schema` download mode를 제공하고, `workflow-preflight` print mode는 compact payload/schema URL과 filename을 함께 출력합니다.
- Summary/Verification/Checksums 계열 JSON command maps도 `workflowPreflightJson`/`workflowPreflightSchema` command alias를 노출해 CI가 shell help를 파싱하지 않고 compact payload/schema 다운로드 명령을 찾을 수 있습니다.
- Compact Workflow preflight handoff JSON은 `downloads.payload`/`downloads.schema`에 payload/schema path, URL, filename, generated download command를 함께 담아 self-describing handoff로 사용할 수 있습니다.
- Schema Index는 `workflow-preflight-schema`를 `workflow-preflight-json` contract artifact와 연결하고, 해당 schema row에 `workflowPreflightSchema` command/source metadata를 포함해 Workflow preflight readiness coverage에 반영합니다.
- Bundle Handoff text와 env key-value artifact도 compact Workflow preflight payload/schema path, URL, filename, generated command metadata를 포함해 text/env-first handoff에서도 같은 정보를 유지합니다.
- Bundle Index와 Runbook Markdown도 compact Workflow preflight payload/schema 링크와 generated command를 노출해 문서-first 운영 흐름에서 바로 handoff contract를 열거나 내려받을 수 있습니다.
- Artifact Families의 `command-preset-workflow` family도 `workflow-preflight-json`/`workflow-preflight-schema`를 recommended open order와 artifact ids에 포함해 family-first discovery에서 compact handoff contract를 함께 노출합니다.
- `GET /api/plans/{id}/packs.txt` : 추천 Markdown 팩 순서, 적용 필터, 표시 팩 ids, 현재 필터 기준 묶음 Markdown 링크와 Health Report Markdown 링크, Schema Index coverage JSON/CSV source 링크, Command Preset workflow rich/compact/artifact/execution snippet 링크와 snippets CSV 링크, Pack catalog CSV schema 링크, Workflow preflight mode/source commands 링크와 readiness status/ok/counts/missing ids/action, 선택 묶음/Health Report/Schema Index coverage source/Command Preset workflow 템플릿, 추천 이유, 목적 category, 대상 audience, 절대 다운로드 URL을 메모/메신저에 붙이기 쉬운 text/plain으로 반환. `all=true`면 전체 Markdown 팩 목록을 반환하고, `category`, `audience`, `recommended=true|false` 필터도 지원하며 다운로드 파일명에 적용 필터와 전체 여부 suffix를 붙임
- `GET /api/plans/{id}/packs.md` : 추천 Markdown 팩 순서, 적용 필터, 표시 팩 ids, 현재 필터 기준 묶음 Markdown 링크와 Health Report Markdown 링크, Schema Index coverage JSON/CSV source 링크, Command Preset workflow rich/compact/artifact/execution snippet 링크와 snippets CSV 링크, Pack catalog CSV schema 링크, Workflow preflight mode/source commands 링크와 readiness status/ok/counts/missing ids/action, 선택 묶음/Health Report/Schema Index coverage source/Command Preset workflow 템플릿, 추천 이유, 목적 category, 대상 audience, 다운로드 링크를 문서에 붙이기 쉬운 Markdown 리포트로 반환. `all=true`면 전체 Markdown 팩 목록을 반환하고, `category`, `audience`, `recommended=true|false` 필터도 지원하며 다운로드 파일명에 적용 필터와 전체 여부 suffix를 붙임
- `GET /api/plans/{id}/packs.csv` : 추천/필터/전체 Markdown 팩 카탈로그를 CSV로 반환. Bundle/Manifest/Handoff/env/commands/Index/Runbook/Verification/Checksums/Schema Index/Command Preset workflow 경로와 URL, Pack catalog CSV schema path/URL, compact Workflow preflight JSON/schema handoff path/URL, Workflow preflight command source 및 readiness status/ok/counts/missing ids/action 열을 포함해 스프레드시트나 CI matrix에서 팩 선택과 preflight 상태 및 payload/contract endpoint를 함께 집계할 수 있으며 `all=true`, `category`, `audience`, `recommended=true|false` 필터를 지원
- `GET /api/plans/{id}/packs.csv.schema.json` : `/packs.csv`의 현재 필터/전체 scope 컬럼 계약을 `application/schema+json`으로 반환하고, plan id/version/generatedAt/filter/scope context, CSV path/URL/filename/curl command, schema filename/curl command, reusable columnGroups index와 group별 columnCount 및 derived grouped/ungrouped/overlapping/missing-reference coverage status/ok/action, provider/source artifact/evidence path/check inventory coverage를 포함한 aggregate contractReadiness와 기본 ciGate(required tools/exit codes/checks/counts/derived provider coverage/provider list/provider snippet coverage status/ok/action, source artifact coverage status/ok/action, evidence path coverage status/ok/action, check inventory coverage status/ok/action 및 structured provider/source artifact/evidence path/check inventory checks/GitHub Actions step/GitLab CI job 포함), provider/source artifact/evidence path coverage까지 포함한 JSONPath/jq automation hints 및 jq gate/fetch-and-gate command, required/implemented evidence path inventory에 source artifact count/id/missing/action paths, column별 groupIds, core catalog/bundle discovery/Schema Index coverage/Command Preset workflow/self-discovery column groups, compact Workflow preflight JSON/schema handoff path/URL, source commands path/URL, Workflow preflight column group, readiness payload를 함께 포함해 CSV-first CI가 컬럼과 preflight endpoint를 같은 계약 파일에서 확인할 수 있습니다.
- 상세 화면의 추천 팩 패널은 `/packs` JSON의 Workflow preflight readiness payload를 읽어 필터와 다운로드 버튼 위에 준비됨/확인 필요, schema/command/source count, missing count 요약을 표시합니다.
- 상세 화면의 `Export 링크 복사` 텍스트도 같은 Workflow preflight readiness 요약과 recommended action을 포함해 외부 공유 시 readiness 상태가 누락되지 않게 합니다.
- 상세 화면의 `Export 링크 복사` 텍스트는 추천/전체 Pack catalog CSV Schema 링크도 포함해 UI에서 CSV 컬럼 계약과 CI gate metadata를 바로 공유할 수 있습니다.
- 상세 화면의 `Workflow CSV 계약/색인` 메뉴는 추천/전체 Pack catalog CSV Schema 미리보기/복사/다운로드 버튼을 제공해 CSV 컬럼 계약과 CI gate metadata를 UI에서 바로 확인할 수 있습니다.
- 상세 화면의 `Workflow CSV 계약/색인` 메뉴는 추천/전체 Pack catalog CSV Schema CI gate 복사 버튼도 제공해 schema payload의 기본 fetch-and-gate 명령을 바로 복사할 수 있습니다.
- 상세 화면의 `Workflow CSV 계약/색인` 메뉴는 추천/전체 Pack catalog CSV Schema provider CI snippets 접이식 그룹 안에서 GitHub Actions step, GitLab CI job, Azure Pipelines step, Bitbucket Pipelines step, CircleCI job, Jenkins pipeline 복사 버튼을 제공해 provider별 CI gate snippet을 바로 공유할 수 있습니다.
- 상세 화면의 `Workflow CSV 계약/색인` 메뉴는 추천/전체 Pack catalog CSV Schema CI snippets 전체 복사 버튼과 compact 복사 버튼도 제공해 shell과 provider별 gate snippet을 하나의 handoff로 묶거나 핵심 CI handoff만 짧게 복사할 수 있으며 compact payload는 handoff format/version/line-format/empty-value/list-separator/key-value selector/env selector/parser input-output/parse commands/section index/check command/required key index/check command/self-check/full-self-check/validation-stage/ci-stage command/cache-upload/ci-platform-index/default/selection-order/selection-rule/recommended/recommendation-reason/target-file-rows/target-file-count/recommended-target-file/target-file-rule/target-file-probe-command/target-file-prepare-command/target-file-prepare-note/target-file-prepare-check-command/target-file-check-command/recommended-step-keys/lookup-rule/recommended-step-count/recommended-step-delimiter/recommended-step-values/recommended-apply-sequence/recommended-apply-note/recommended-snippet-block/recommended-snippet-apply-rule/recommended-snippet-print-command/recommended-snippet-preview-command/recommended-snippet-preview-note/recommended-snippet-duplicate-probe/recommended-snippet-duplicate-check/recommended-snippet-duplicate-note/recommended-snippet-duplicate-metadata-check-command/recommended-snippet-dry-run-command/recommended-snippet-dry-run-note/recommended-snippet-dry-run-check-command/recommended-snippet-preflight-command/recommended-snippet-preflight-note/recommended-snippet-preflight-check-command/recommended-snippet-apply-command/recommended-snippet-apply-note/recommended-snippet-apply-check-command/recommended-snippet-post-apply-verify-command/recommended-snippet-post-apply-verify-note/recommended-snippet-post-apply-verify-check-command/recommended-snippet-apply-verify-command/recommended-snippet-apply-verify-note/recommended-snippet-apply-verify-check-command/recommended-snippet-rollback-command/recommended-snippet-rollback-note/recommended-snippet-rollback-check-command/recommended-snippet-post-rollback-verify-command/recommended-snippet-post-rollback-verify-note/recommended-snippet-post-rollback-verify-check-command/recommended-snippet-rollback-verify-command/recommended-snippet-rollback-verify-note/recommended-snippet-rollback-verify-check-command/recommended-snippet-lifecycle/recommended-snippet-lifecycle-safety/recommended-snippet-lifecycle-approval/recommended-snippet-manual-approval-gate/recommended-snippet-guarded-lifecycle/recommended-snippet-automation-default/recommended-snippet-automation-policy/recommended-snippet-automation-policy-enforcement/recommended-snippet-automation-policy-denial-row/recommended-snippet-automation-policy-selector/recommended-snippet-automation-policy-request-list/recommended-snippet-automation-policy-unsupported-request/recommended-snippet-automation-policy-selector-preview/recommended-snippet-automation-policy-approval-preview/recommended-snippet-automation-policy-approval-status/recommended-snippet-automation-policy-approval-next-action/recommended-snippet-automation-policy-approval-unblock/recommended-snippet-automation-policy-approval-revoke/recommended-snippet-automation-policy-approval-session/recommended-snippet-automation-policy-approval-session-preview/recommended-snippet-automation-policy-approval-review-checklist/recommended-snippet-automation-policy-approval-review-checklist-preview/recommended-snippet-automation-policy-approval-review-checklist-command/recommended-snippet-automation-policy-approval-review-readiness/recommended-snippet-automation-policy-approval-review-decision/recommended-snippet-automation-policy-approval-review-decision-selector/recommended-snippet-automation-policy-approval-review-decision-audit/recommended-snippet-automation-policy-approval-review-decision-output/recommended-snippet-automation-policy-approval-review-decision-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-load/recommended-snippet-automation-policy-approval-review-decision-output-route/recommended-snippet-automation-policy-approval-review-decision-output-route-resolve/recommended-snippet-automation-policy-approval-review-decision-output-route-command-preview/recommended-snippet-automation-policy-approval-review-decision-output-route-execute-guard/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-review/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-review/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-execution-plan-checksum-output-summary-checksum-output-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify-checksum/recommended-snippet-automation-policy-approval-review-decision-output-route-final-gate-review-checksum-verify-summary-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-checksum-output-verify-review-artifact-verify-checksum-output/recommended-snippet-lifecycle-check-command/recommended-snippet-preview-check-command/recommended-snippet-check-command/recommended-apply-check-command/recommended-step-check-command/github-actions/circleci/jenkins/gitlab/azure-pipelines/bitbucket-pipelines/buildkite/teamcity/copied-at/source provenance, section markers, pack/column count, Workflow preflight/full snippets locator, provider/source artifact id/missing-id/action context, contract inventory missing-list context, readiness/CI gate check row context, sample row context, csv required/enum column context, column group id/detail context, schema/csv content type/curl/checksum/size/checksum-verify/size-verify/artifact-verify/download-verify/all-artifacts-download-verify/artifact-stage output/evidence/cache/upload/manifest/write-command/package-stage/ci-platform-index/count/key-rows/check-command/key-check-command/self-check-command/github-actions/circleci/jenkins/gitlab/azure-pipelines/bitbucket-pipelines/buildkite/teamcity cache-upload context, encoding/dialect context를 포함하고 버튼은 tooltip/ARIA label로 payload 용도를 설명합니다.
- Pack catalog CSV Schema payload의 `ciGate.sourceArtifacts`는 schema/csv path, URL, filename, content type, curl command를 한 블록으로 제공하고, `ciGate.sourceArtifactSchemaRef`는 `$defs.ciGateSourceArtifact` 계약을 가리킵니다. `ciGate.providerSchemaRef`와 `ciGate.providerSnippetCoverageSchemaRef`는 provider registry/coverage row 계약을 `$defs`로 가리킵니다. Schema ref fields도 source artifact/provider/provider coverage schema ref JSONPath와 jq filter를 제공합니다. `ciGate.sourceArtifactCoverage*`와 `source-artifacts` check는 source path/URL/filename/curl command 누락을 readiness에 반영하며, automation hints는 source artifact coverage status/ok/missing ids/count/action JSONPath와 jq filter를 제공합니다. Provider snippet fields도 provider count/ids/registry, coverage status/ok, snippet available/missing counts, missing ids, action JSONPath와 jq filter를 제공합니다. `ciGate.evidenceJsonPaths`는 contract/column/workflow/schema refs/provider registry/coverage rows/status/count/id/action/source coverage status/count/id/action/source rows/check inventory coverage evidence, total/passed/failed check ledger, required/implemented/missing check id counts/ids를 함께 열거하고, evidence path count/required count/required paths/implemented count/implemented paths/missing paths/status/ok/action metadata와 automation hint JSONPath/jq/gate commands를 함께 제공합니다. Check ledger fields도 total/passed/failed check count/id JSONPath와 jq filter를 제공하고, check inventory fields도 required/implemented/missing check id count/id JSONPath와 jq filter, coverage status/ok/action automation hint JSONPath/jq/gate commands를 제공합니다. CI snippets 전체 복사 텍스트는 plan/version/generatedAt/scope/filter/count context, Workflow preflight locator/readiness context, column group coverage summary/gates/detail lines, ungrouped/overlapping/missing ref column lists, CSV header plus column contract detail lines with index and enum values, section headers를 포함하고, 같은 source/path/filename/content type과 curl command, source/provider/row/value/check/evidence/contract inventory schema refs, reusable value/item schema refs, source artifact locator/fetch schema refs, and automation hint JSONPath/jq/fetch gate summary including Workflow preflight/provider/source/row/value/evidence/check inventory gates, row schema ref coverage status/ok/missing count/ids/action, row schema ref detail lines(id/label/ref), value schema ref count/ids/status/missing ids/action/detail lines(id/label/ref), compact contract inventory status/count/action summary, top-level contract readiness schema/check detail lines, source artifact count/ids/detail lines(id/role/content type/filename/target/curl command), source artifact coverage status/ok/missing count/ids/action, evidence path count/list/status/ok/required/implemented/missing/action, status/ok, passed/failed check count, check ids, required/implemented/missing check id counts/ids, check inventory status/ok/action, structured CI gate check detail lines(id/label/status/ok/evidence/jq/command/fetch/action), passed check ids, failed check ids, recommended action, provider count, provider ids, provider registry detail lines(id/label/snippet path), provider snippet coverage status/ok/available count/missing count/action, provider snippet detail lines(id/label/ok/path/action), missing provider snippet ids도 포함해 readiness와 provider coverage 상태를 함께 전달합니다.
- Pack catalog CSV Schema `ciGate.rowSchemaRefs`는 row schema ref/source artifact/provider/provider coverage row schema ref inventory와 coverage status/ok/missing ids/action을 제공하고, `ciGate.rowSchemaRefSchemaRef`는 `$defs.ciGateRowSchemaRef` 계약을 가리키며, `row-schema-refs` readiness check로 계약 ref 누락을 gate합니다.
- Pack catalog CSV Schema `ciGate.rowSchemaRefIdSchemaRef`는 `ciGate.rowSchemaRefIds`/`missingRowSchemaRefIds` 문자열 item 계약인 `$defs.ciGateRowSchemaRefId`를 가리켜 row schema-ref id inventory도 self-describing하게 만듭니다.
- Pack catalog CSV Schema CI gate row contracts는 source artifact/provider/provider coverage/row schema-ref/check row의 `id` 필드를 각각의 reusable id item `$defs`로 참조해 row id와 id inventory 계약을 일치시킵니다.
- Pack catalog CSV Schema `ciGate.schemaDefRefSchemaRef`는 `#/$defs/...` schema-ref 문자열 값 계약인 `$defs.ciGateSchemaDefRef`를 가리키고, `ciGate.rowSchemaRefs[*].ref`도 같은 계약을 참조합니다.
- Pack catalog CSV Schema `ciGate.valueSchemaRefs`는 reusable value/item contracts의 id/label/ref inventory를 제공하고, `valueSchemaRefSchemaRef` / `valueSchemaRefIdSchemaRef` / count / ids / JSONPath/jq hints로 grouped value contract discovery를 지원합니다.
- Pack catalog CSV Schema `ciGate.valueSchemaRefCoverage*`와 `value-schema-refs` readiness check는 reusable value/item contract refs 누락을 aggregate readiness에 반영합니다.
- Pack catalog CSV Schema `ciGate.contractInventory`는 row schema refs, value schema refs, evidence paths, check inventory의 count/missing/status/ok/action compact summary를 제공해 CI 소비자가 inventory 상태를 한 블록에서 읽을 수 있게 합니다. Nested component count fields도 JSONPath/jq/evidence discovery metadata로 노출하고, `ciGate.contractInventory.ok` 전용 jq/fetch-and-gate command와 structured `contract-inventory` check로 compact inventory readiness를 바로 gate할 수 있게 합니다. Top-level `contractReadiness.checks`에도 같은 `contract-inventory` row를 포함합니다. `contractReadiness.checkSchemaRef`는 `$defs.contractReadinessCheck`를 가리켜 top-level readiness check rows도 self-describing하게 만듭니다. `ciGate.rowSchemaRefs`에도 `contract-readiness-check` entry를 포함해 top-level readiness row contract를 함께 발견할 수 있습니다.
- Pack catalog CSV Schema `ciGate.contractInventorySchemaRef`는 compact inventory summary row shape인 `$defs.ciGateContractInventory`를 가리켜 summary block도 self-describing하게 만듭니다. `ciGate.rowSchemaRefs`에도 `contract-inventory` entry를 포함해 compact summary object contract를 schema-ref inventory에서 함께 발견할 수 있습니다.
- Pack catalog CSV Schema `ciGate.labelSchemaRef`는 source artifact/provider/provider coverage/row schema-ref/check row의 human-readable `label` 값 계약인 `$defs.ciGateLabel`을 가리켜 label 필드도 reusable contract를 공유합니다.
- Pack catalog CSV Schema `ciGate.recommendedActionSchemaRef`는 provider coverage/check row의 human-readable `recommendedAction` 값 계약인 `$defs.ciGateRecommendedAction`을 가리켜 action 안내 문구도 reusable contract를 공유합니다.
- Pack catalog CSV Schema `ciGate.readinessOkSchemaRef`는 provider coverage/check row의 boolean `ok` 값 계약인 `$defs.ciGateReadinessOk`를 가리켜 readiness boolean도 reusable contract를 공유합니다.
- Pack catalog CSV Schema `ciGate.checkSchemaRef`는 `ciGate.checks` row 자체의 `$defs.ciGateCheck` 계약을 가리키고, `ciGate.rowSchemaRefs`에도 `check` row contract를 포함해 readiness check row 계약을 함께 발견할 수 있게 합니다. Check row contract는 jq/fetch gate command와 evidence JSONPath 필드를 포함하며, structured `check-inventory` check도 제공합니다.
- Pack catalog CSV Schema `ciGate.sourceArtifactIdSchemaRef`는 `sourceArtifactIds`/`missingSourceArtifactIds` 문자열 item 계약인 `$defs.ciGateSourceArtifactId`를 가리켜 source artifact id inventory도 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.sourceArtifactRoleSchemaRef`와 `sourceArtifactContentTypeSchemaRef`는 source artifact row의 role/content type 값 계약을 각각 `$defs.ciGateSourceArtifactRole` / `$defs.ciGateSourceArtifactContentType`로 가리켜 schema/data source 구분도 기계적으로 발견하게 합니다.
- Pack catalog CSV Schema `ciGate.sourceArtifactPathSchemaRef`, `sourceArtifactUrlSchemaRef`, `sourceArtifactFilenameSchemaRef`, `sourceArtifactCurlCommandSchemaRef`는 source artifact locator/fetch 값 계약을 `$defs`로 가리켜 source artifact 다운로드 정보를 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.providerIdSchemaRef`는 `providerIds`/`missingProviderSnippetIds` 문자열 item 계약인 `$defs.ciGateProviderId`를 가리켜 provider id inventory도 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.providerSnippetJsonPathSchemaRef`는 provider registry/coverage row의 `snippetJsonPath` 값 계약인 `$defs.ciGateProviderSnippetJsonPath`를 가리켜 provider-specific CI snippet 위치도 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.checkIdSchemaRef`는 required/implemented/missing/passed/failed check id 문자열 item 계약인 `$defs.ciGateCheckId`를 가리켜 check id inventory도 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.readinessStatusSchemaRef`는 readiness status 값 계약인 `$defs.ciGateReadinessStatus`를 가리켜 contract/check/coverage status 값도 self-describing하게 만듭니다.
- Pack catalog CSV Schema `ciGate.evidenceJsonPathSchemaRef`는 required/implemented/missing evidence JSONPath 문자열 item 계약인 `$defs.ciGateEvidenceJsonPath`를 가리켜 evidence path inventory도 self-describing하게 만듭니다.
- Pack catalog CSV Schema 미리보기 버튼은 다른 미리보기로 전환하거나 닫을 때 라벨을 `미리보기` 상태로 되돌립니다.
- 상세 화면의 `Workflow preflight 명령 복사` 텍스트는 실행 명령 뒤에 readiness 상태, schema/command/source count, missing ids, recommended action을 함께 붙입니다.
- 상세 화면의 `Workflow CSV URL 복사` 텍스트도 Workflow preflight readiness 요약을 함께 붙여 URL만 공유되는 handoff에서도 preflight 상태가 보존되게 합니다.
- 상세 화면의 `Workflow CSV 명령 복사` 텍스트도 실행 명령 뒤에 Workflow preflight readiness 요약을 붙여 명령 중심 handoff에서도 상태와 조치가 함께 전달되게 합니다.
- 상세 화면의 Workflow preflight readiness 복사 문구는 공통 formatter를 사용해 Export 링크/Workflow CSV 명령/Workflow CSV URL/Workflow preflight 명령 payload의 상태, count, missing ids, action 표현을 맞춥니다.
- 상세 화면의 Workflow CSV rich/compact/artifact/execution 스니펫 복사 payload도 같은 readiness formatter를 붙여 스니펫 단독 공유 시 preflight 상태가 함께 전달되게 합니다.
- 상세 화면의 Workflow CSV rich/compact/artifact/execution 스니펫 미리보기에도 같은 readiness formatter를 붙여 복사 전에도 preflight 상태를 확인할 수 있게 합니다.
- 상세 화면의 Workflow preflight readiness 상태줄은 준비됨/확인 필요에 따라 색상을 바꿔 pack catalog에서 preflight 상태를 더 빨리 알아볼 수 있게 합니다.
- 상세 화면의 Workflow preflight readiness 상태줄은 `role=status`와 `aria-live=polite`를 사용해 pack catalog 갱신 시 보조 기술에도 상태 변화를 전달합니다.
- 상세 화면의 `Workflow preflight 상태 복사` 버튼은 상태, schema/command/source count, missing ids, recommended action만 짧게 복사해 별도 상태 보고에 사용할 수 있게 합니다.
- 상세 화면의 `Workflow preflight 상태 복사` 버튼은 recommended action을 tooltip으로 노출하고 readiness 상태를 반영한 `aria-label`을 설정합니다.
- 상세 화면의 `Workflow preflight 상태 복사` 버튼은 `/packs` readiness payload가 로드되어 복사 핸들러가 준비된 뒤에만 활성화됩니다.
- 상세 화면의 `Workflow preflight 상태 복사` 버튼은 `aria-describedby`로 live status line과 연결되어 현재 preflight 상태 설명을 함께 제공합니다.
- 상세 화면의 Workflow preflight readiness 상태줄 tooltip은 schema/command/source count, missing command/source ids, recommended action을 함께 보여줍니다.
- 상세 화면의 Workflow preflight readiness 상태줄은 ready/attention 상태에 따라 `다음 그대로 진행` 또는 `다음 Schema Index 검토` 힌트를 live text에 함께 표시합니다.
- 상세 화면의 추천 팩 필터를 다시 불러올 때 Workflow preflight 상태줄은 `불러오는 중`으로 초기화되고, 상태 복사 버튼은 새 readiness payload가 바인딩될 때까지 비활성화됩니다.
- 상세 화면의 추천 팩 카탈로그 로드가 실패하면 Workflow preflight 상태줄은 `불러오기 실패`와 재시도 힌트를 표시하고, 상태 복사 버튼은 비활성 상태를 유지합니다.
- 상세 화면의 `Workflow preflight 상태 복사` 버튼 라벨은 loading/failure/ready/attention 상태에 맞춰 바뀌어 현재 복사 가능 상태를 버튼 자체에서도 보여줍니다.
- 상세 화면의 `Schema Index 검토` 버튼은 Workflow preflight readiness 상태 옆에서 현재 표시 묶음의 Schema Index artifact를 바로 열어 command/source metadata를 확인할 수 있게 합니다.
- 상세 화면의 `Schema Index 검토` 버튼은 사람이 읽기 쉬운 Schema Index Markdown을 우선 열고, Markdown 경로가 없을 때만 JSON Schema Index로 fallback합니다.
- 상세 화면의 `Schema Index 검토` 버튼 fallback은 catalog helper 초기화 전에도 안전하게 동작하도록 기본 Schema Index Markdown endpoint를 직접 사용합니다.
- 상세 화면의 `Schema Index 링크 복사` 버튼은 Markdown-first Schema Index URL과 Workflow preflight readiness 요약을 함께 복사해 검토 링크를 외부 handoff에 바로 붙일 수 있게 합니다.
- 상세 화면의 `Schema Index 링크 복사` 버튼은 ready/attention 상태에 따라 라벨을 바꾸고, tooltip에 복사 대상 Schema Index URL과 recommended action을 함께 표시합니다.
- 상세 화면의 Schema Index 검토/링크 복사 버튼은 현재 target이 Markdown인지 JSON인지 라벨과 복사 payload에 함께 표시합니다.
- 상세 화면의 Schema Index 검토/링크 복사 버튼은 `aria-label`에도 Markdown/JSON target type을 포함합니다.
- 상세 화면의 Workflow preflight readiness 복사 formatter는 Schema Index Markdown/JSON review target URL도 함께 포함해 compact status handoff만으로 다음 검토 링크를 전달합니다.
- 상세 화면의 `Schema Index 링크 복사` payload는 shared Workflow preflight readiness formatter를 단일 source로 사용해 Schema Index review URL이 중복되지 않게 합니다.
- 상세 화면의 `Workflow preflight bundle 복사` 버튼은 readiness evidence, Schema Index review URL, recommended action, Workflow preflight 실행 명령을 한 번에 복사합니다.
- 상세 화면의 `Workflow preflight bundle 복사` 버튼 tooltip/ARIA label은 Schema Index target type/URL과 실행 명령 포함 여부를 알려줍니다.
- `GET /api/plans/{id}/packs.bundle.md` : 추천/필터/선택 Markdown 팩의 실제 내용을 하나의 Markdown 파일로 묶어 반환. 상단에 Workflow preflight readiness status/ok/counts/missing ids/action 요약을 포함하며, `ids=file-guide,offline-pack`으로 선택 팩을 지정할 수 있고, `/packs` JSON의 `bundleSelectedPathTemplate`에서 `{ids}`를 치환해 선택 묶음 URL을 만들 수 있으며, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원하고 다운로드 파일명에 선택/표시/전체와 적용 필터 suffix를 붙임
- `GET /api/plans/{id}/packs.bundle.json` : 추천/필터/선택 Markdown 묶음의 manifest JSON을 반환. 실제 Markdown 본문 없이 `scope`, `packIds`, 사람이 읽는 `summary`, 순회 가능한 `artifacts` 배열(id/label/kind/contentType/path/url/filename/curlCommand/useWhen), `schemaIndexContractCoverage`, Schema Index Markdown/JSON/CSV/CSV Schema 경로와 명령, Lock JSON/Markdown 경로, Summary/Health JSON/Health Markdown/Health CSV/Health CSV Schema/Health Badge SVG/Health Metrics/Health Alerts YAML/Health Dashboard JSON/Health Events JSON/Health Events Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema/Health Report Markdown 경로, artifacts JSON/CSV와 Command Preset Steps CSV 경로, 검증용 `verification` 힌트(requiredFiles/verifyCommand/allCommand), Verification Markdown/JSON/CSV/Schema와 SHA-256 checksums TXT/JSON/CSV 경로, 재호출/처리용 `automation` 힌트(`handoffText`, 저장 파일명, Markdown/manifest/lock/lockMarkdown/summaryJson/healthJson/healthMarkdown/healthCsv/healthSchema/healthBadge, healthMetrics, healthAlerts, healthDashboard, healthEvents, healthEventsSchema, healthEventsValidation, healthEventsFamily, healthEventsAdapters, healthEventsAdaptersMarkdown, healthEventsAdaptersSchema, healthEventsAdaptersCsv, healthEventsAdaptersCsvSchema, adapterReadinessFamily, healthReport/artifacts/artifactsCsv/verification/verificationJson/verificationCsv/verificationSchema/checksums/checksumsJson `curlCommands`, commands shell `commandExamples`와 목적별 `commandExampleGroups`(group/command order와 shell mode metadata 포함), shell mode별 lookup용 `commandModeIndex`, primary/verification/successCriteria/ordered steps/safety metadata를 포함한 목적별 실행 세트 `commandPresets`, id lookup용 `commandPresetIndex`, 추천 preset 요약 `recommendedCommandPresets`, 전체 workflow step matrix `commandPresetStepIndex`(network/file-write/confirmation/safety metadata 포함), phase/audience/role/mode/preset/safety별 집계 `commandPresetStepSummary`, allow/confirm/deny 실행 정책 `commandPresetSafetyPolicy`, Command Preset Steps CSV 경로), Verification JSON의 Health Events Schema/Validation commands/paths/urls 요약, 순서, 추천 사유, 개별 팩 경로/URL, 다시 받을 Bundle Markdown 경로/URL, 선택 묶음 path/url 템플릿을 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.lock.json` : 추천/필터/선택 Markdown 묶음의 재현용 lock JSON을 반환. manifest 산출물 목록, artifact id/filename/path/url/curlCommand, SHA-256 checksum payload, Schema Index contract coverage, Workflow preflight readiness, Schema Index Markdown/JSON/CSV/CSV Schema와 Health JSON/Markdown/CSV/Schema/Badge/Metrics/Alerts/Dashboard/Events/Events Schema/Events Validation/Report를 포함한 주요 command/path/url을 한 번에 고정해 외부 자동화나 인수인계가 동일 묶음 구성을 재구성할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원 Lock JSON은 `artifactFamilies`, `familyDownloadCommands`, artifact별 family metadata와 `familyDownloadCommand`도 포함해 Health Events/Adapter Readiness 산출물 묶음과 재다운로드 방법을 재현성 정보로 보존합니다.
- `GET /api/plans/{id}/packs.bundle.lock.md` : 추천/필터/선택 Markdown 묶음의 사람용 lock 요약 Markdown을 반환. Lock JSON/Manifest/Checksums 링크, Schema Index Markdown/JSON/CSV/CSV Schema와 Health JSON/Markdown/CSV/Schema/Badge/Metrics/Alerts/Dashboard/Events/Events Schema/Events Validation/Report 링크, Schema Index contract coverage, Workflow preflight readiness, 범위/필터/팩 ids, 산출물 목록, checksum 대상, commandPresetStepSummary 기반 워크플로우 단계/안전성 요약, commandPresetSafetyPolicy 기반 allow/confirm/deny 실행 정책, commandPresets 기반 권장 워크플로우(step count 포함), commandExampleGroups 기반 바로 쓰는 검증 명령을 짧게 제공해 외부 공유 전에 재현 범위를 빠르게 검토할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원 Lock Markdown은 Health Events/Adapter Readiness 산출물 family 표(download command 포함)와 Adapter Readiness Schema shortcut도 함께 보여줍니다.
- `GET /api/plans/{id}/packs.bundle.summary.json` : 추천/필터/선택 Markdown 묶음의 dashboard/외부 도구용 요약 JSON을 반환. 범위/필터/팩 ids, artifact 수와 종류별 카운트, `artifactFamilies`, `familyDownloadCommands`, `schemaIndexContractCoverage`, `workflowPreflightReadiness`, 주요 URL, manifest/markdown/handoff/env와 family/preflight를 포함한 주요 command examples 및 `commandExampleGroups`/`commandModeIndex`/`commandPresets`/`commandPresetIndex`/`recommendedCommandPresets`/`commandPresetStepIndex`/`commandPresetStepSummary`/`commandPresetSafetyPolicy`, Schema Index Markdown/JSON/CSV/CSV Schema와 Command Preset Steps CSV path/url/command shortcut, 검증 명령, 팩/산출물 요약 배열을 Manifest보다 작게 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.json` : 추천/필터/선택 Markdown 묶음의 CI/외부 모니터용 상태 JSON을 반환. artifact와 required file의 filename/path/url 누락을 `ok`, `status`, issue count, 누락 id 목록, `artifactFamilies`, `familyDownloadCommands`, `schemaIndexContractCoverage`, Schema Index Markdown/JSON/CSV/CSV Schema path/url/command shortcuts, manifest/markdown/handoff/env와 family/preflight command examples 및 `commandExampleGroups`/`commandModeIndex`/`commandPresets`/`commandPresetIndex`/`recommendedCommandPresets`/`commandPresetStepIndex`/`commandPresetStepSummary`/`commandPresetSafetyPolicy`와 Command Preset Steps CSV path/url/command shortcut으로 제공해 bundle 산출물이 배포/공유 가능한지 빠르게 판정하고 family 단위 재다운로드 명령까지 발견하게 하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.md` : 추천/필터/선택 Markdown 묶음의 사람용 상태 Markdown을 반환. Health JSON과 같은 판정 결과를 상태 요약, 주요 링크, 바로 쓰는 명령, artifact family 다운로드 명령, 이슈 표, Schema Index contract coverage, Workflow preflight readiness, 완료 기준으로 펼쳐 운영 티켓이나 릴리즈 노트에 붙이기 쉽게 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.csv` : 추천/필터/선택 Markdown 묶음의 상태 CSV를 반환. Health JSON의 상태, Schema Index contract coverage status/ok/issue count/action, Workflow preflight readiness status/ok/counts/missing ids/action, issue 목록을 행 단위로 펼쳐 스프레드시트, CI matrix, 외부 대시보드가 bundle readiness와 Schema Index/Workflow preflight readiness를 바로 집계할 수 있게 하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.schema.json` : Health CSV 컬럼 계약을 JSON Schema 형태로 반환. `schema_index_contract_coverage_*`와 `workflow_preflight_*` 컬럼의 status/ok/count/action 타입과 enum도 함께 고정하며, `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.svg` : 추천/필터/선택 Markdown 묶음의 상태 badge SVG를 반환. `ok`/`warning`/`failed` 상태와 이슈 수를 색상 배지로 표시해 README, 위키, 운영 대시보드에 바로 붙일 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.metrics` : 추천/필터/선택 Markdown 묶음의 Prometheus text exposition을 반환. bundle readiness, artifact/checksum/issue count, Schema Index contract coverage ok/status/issue count와 Workflow preflight schema/command/source/missing counts를 외부 모니터링과 Grafana 대시보드가 바로 수집할 수 있게 하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.alerts.yml` : 추천/필터/선택 Markdown 묶음의 Prometheus alert rules YAML을 반환. Health Metrics를 기준으로 failed/warning/blocking/required metadata 누락, Schema Index contract coverage issue, Workflow preflight command/source metadata 누락 알림 규칙을 제공해 Alertmanager나 운영 대시보드에 바로 붙일 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.dashboard.json` : 추천/필터/선택 Markdown 묶음의 운영 대시보드용 JSON을 반환. Health 상태 요약, severity, artifactFamilies, familyDownloadCommands, familyRecoveryActions, workflowArtifactHints(Command Preset Steps CSV target/command/JSONPath), commandExampleGroups, commandModeIndex, commandPresets, commandPresetIndex, recommendedCommandPresets, commandPresetStepIndex, commandPresetStepSummary, commandPresetSafetyPolicy, operationalStatus, statusCard, sortHints, filterHints, tableHints, bulkActionHints, viewPresetHints, drilldownHints, timelineHints, handoffHints, auditTrailHints, integrationContractHints, qualityGateHints, riskScoringHints, escalationHints, suppressionHints, maintenanceWindowHints, impactAnalysisHints, rollbackHints, decisionSupportHints, operatorOverrideHints, resolutionWorkflowHints, postResolutionReviewHints, continuousImprovementHints, knowledgeBaseHints, stakeholderCommunicationHints, communicationReceiptHints, communicationAnalyticsHints, complianceRetentionHints, accessControlHints, schemaEvolutionHints, dataLineageHints, reportingExportHints, trendAnalysisHints, observabilityOnboardingHints, automationEventHints, SLO 성격의 readiness/metadata/url/checksum/Schema Index contract coverage/Workflow preflight readiness, recommendedActions, remediationSummary, ownershipHints, responseTargets, remediationPlan, runbookSteps, dashboardPanels, generic webhook/Slack/issue-tracker/email/on-call 템플릿과 deliveryTargets/deliveryPlan/dedupePolicy/escalationPolicy/contractHints/integrationChecklist/adapterValidation/securityHints(sharingProfiles)/testFixtures/toolingFallbacks/extractionCommands automation hints를 포함한 notification payload, 주요 Health/Health Events/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema, Schema Index Markdown/JSON/CSV/CSV Schema와 Command Preset Steps CSV 산출물 URL, 명령 예시, family 재다운로드 명령/액션, 이슈와 health artifact 목록을 한 번에 제공해 Grafana/내부 대시보드/알림 시스템이 bundle 상태와 다음 조치를 바로 발견할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.events.json` : 추천/필터/선택 Markdown 묶음의 자동화 이벤트 JSON을 반환. Dashboard JSON의 `automationEventHints`를 이벤트 전용 payload, issue/report event, familyDownloadCommands/familyRecoveryActions, workflowArtifactHints, schemaIndexContractCoverage, recommended sinks, delivery checklist, consumerUsageHints, adapterMappingHints, consumerAdapterContractHints, routingPolicyHints, acknowledgementHints, deadLetterQueueHints, auditRetentionHints, observabilityCorrelationHints, incidentResponseHints, deliverySafety, contractValidation, schemaHints, dryRunHints, redactionHints로 작게 분리해 웹훅/이슈 동기화/릴리즈 자동화가 전체 Dashboard 없이 사용할 수 있으며, 상세 화면 미리보기는 validation JSON을 우선 사용해 delivery summary/contract validation summary/artifact family recovery/payload groups/schema/incident response/observability/raw JSON으로 그룹화해 보여줍니다. `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.health.events.schema.json` : Health Events JSON 소비자를 위한 JSON Schema 산출물을 반환. `sampleEvent`, `issueEvent`, `reportEvent`, `workflowArtifactHints`, `schemaIndexContractCoverage`, `consumerUsageHints`와 consumer adapter contract의 핵심 필수 필드와 status/severity/eventContractId 계약을 별도 검증 대상으로 제공하며, Manifest artifacts/checksum 대상, 상세 화면 링크 목록/링크 복사와 Health Events Schema 미리보기/복사/다운로드, Health Events preview의 schema 섹션 및 `consumerUsageHints.schemaHints.schemaUrl`에서도 같은 schema 위치를 발견할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.validation.json` : Health Events JSON의 machine-readable 계약 검증 결과를 반환. schema와 `consumerUsageHints.contractValidation`의 required 필드를 기준으로 top-level/sampleEvent/issueEvent/reportEvent별 missing fields, adapterReadiness, schemaIndexContractCoverage, familyDownloadCommands/familyRecoveryActions, workflowArtifactHints, pass/needs-attention status, dispatchGuidance(workflow artifact target/command 및 Schema Index coverage status/ok/issue count/action 포함)를 제공하며 Manifest artifacts/checksum 대상, Index/Handoff 링크, 상세 화면 링크 목록/링크 복사와 family recovery 및 adapter readiness를 포함한 Health Events Validation 미리보기/복사/다운로드에서도 발견할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.adapters.schema.json` : Health Events Adapter Readiness JSON 소비자를 위한 JSON Schema 산출물을 반환. adapterReadinessContractId, validationStatus/validationOk, Schema Index contract coverage, source, summary의 coverage status/ok/issue count/action, familyDownloadCommands/familyRecoveryActions, workflowArtifactHints, adapters 배열의 핵심 필수 필드와 readinessStatus 값을 검증 대상으로 제공하며 Manifest artifacts/checksum 대상, generated commands shell, Handoff/Index/Verification JSON/env와 상세 화면 미리보기/복사/다운로드에서도 발견할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.adapters.json` : Health Events adapter readiness만 전용 JSON으로 반환. Validation JSON의 adapterReadiness와 Schema Index contract coverage를 독립 projection으로 분리해 CI/외부 adapter 구현자가 validation 전체 payload를 파싱하지 않고 adapterCount, readyCount, needsAttentionCount, defaultSinkIds, coverage status/ok/issue count/action, familyDownloadCommands/familyRecoveryActions, workflowArtifactHints, adapter rows, dispatchGuidance, implementationChecklist, compatibilityRules와 schema/validation/adapters 링크를 읽을 수 있으며, 상세 화면에서 표시/선택 범위 기준으로 family recovery 표를 포함해 미리보기/복사/다운로드할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.adapters.md` : Health Events adapter readiness를 사람용 Markdown으로 반환. Adapter readiness JSON의 summary/source links/Schema Index contract coverage/workflow artifact hints/artifact family recovery table/adapter matrix/implementation checklist/compatibility rules를 문서로 펼쳐 운영자나 외부 adapter 구현자가 JSON payload를 열지 않고도 누락 입력과 workflow CSV target, family 재다운로드 명령, 권장 조치를 검토할 수 있으며, Manifest artifacts/checksum 대상, Summary/Health/Dashboard JSON, generated commands shell, Handoff/Index/Runbook/Verification shortcut과 상세 화면 미리보기/복사/다운로드에서도 발견할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.adapters.csv` : Health Events adapter readiness를 CSV 행으로 반환. plan_id, latest_version, generated_at, filters, scope, scope_label, adapter_count, ready_count, needs_attention_count, validation_ok, schema_index_contract_coverage_status, schema_index_contract_coverage_ok, schema_index_contract_coverage_issue_count, schema_index_contract_coverage_recommended_action, family_recovery_action_count, family_recovery_order, adapter_order, adapter_id, payload_field, readiness_status, selected_by_default, missing_input_path_count, missing_input_paths, required_receipt_path_count, required_receipt_paths, recommended_action, endpoint_env, secret_env, idempotency_path, validation_url, schema_url, workflow_family_id, workflow_artifact_target, workflow_artifact_command 열을 제공해 spreadsheet/CI matrix에서 adapter별 readiness와 family recovery/workflow CSV 순서를 바로 정렬할 수 있으며, 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.events.adapters.csv.schema.json` : Adapter Readiness CSV 컬럼 계약을 JSON Schema 형태로 반환. `schema_index_contract_coverage_*` 컬럼의 status/ok/issue_count/action 타입과 enum도 함께 고정하며, 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원합니다.
- Generated `packs.bundle.commands.sh`는 `health-events-adapters`, `health-events-adapters-md`, `health-events-adapters-schema`, `health-events-adapters-csv`, `health-events-adapters-csv-schema`, `artifacts-schema`, `artifact-families-md`, `artifact-families-json`, `artifact-families-json-schema`, `artifact-families-csv`, `artifact-families-schema`, `schemas-index-md`, `schemas-index`, `schemas-index-csv`, `schemas-index-schema`, `command-preset-steps-csv`, `command-preset-steps-schema`, `command-preset-workflow`, `command-preset-workflow-compact`, `command-preset-workflow-artifact`, `command-preset-workflow-execution`, `command-preset-workflow-snippets-csv`, `command-preset-workflow-snippets-schema`, `workflow-preflight` 모드 및 `all` 다운로드에 Health Events adapter readiness JSON/Markdown/Schema/CSV/CSV Schema, Artifacts CSV/schema, Artifact Families Markdown/JSON/JSON Schema/CSV/schema, Schema Index Markdown/JSON/CSV/CSV Schema, Command Preset Steps CSV/schema, Workflow CSV rich/compact/artifact/execution handoff snippets와 snippets CSV 색인/schema를 포함합니다. 또한 `artifacts` 출력은 Bundle Discovery/Health Events/Adapter Readiness/Command Preset Workflow family id/order/primary metadata를 함께 표시하고, `artifact-families` 출력은 family별 primary artifact와 추천 열람 순서를 compact하게 표시합니다.
- Pack catalog exports와 `packs.csv`는 Health Events JSON/Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV schema, Artifacts CSV/schema, Artifact Families Markdown/JSON/JSON Schema/CSV/schema, Schema Index Markdown/JSON/CSV/CSV Schema, Command Preset Steps CSV/schema, Workflow CSV rich/compact/artifact/execution handoff snippets, Workflow CSV snippets CSV 색인/schema, Workflow preflight mode와 source commands 경로/URL의 추천/전체/표시/선택 템플릿 경로와 URL을 함께 노출합니다.
- 상세 화면의 Health Events/Validation/Adapter Readiness 미리보기는 `workflowArtifactHints` 전용 섹션을 보여줘 Command Preset Steps CSV target, command, JSONPath를 raw JSON을 펼치지 않고 확인할 수 있고, 기본 `Workflow CSV 간단 스니펫 복사` 버튼은 한 번에 누를 수 있으며 보조 줄의 버튼형 접이식 `Workflow CSV 복사 메뉴` 안의 `Workflow CSV 명령 복사`/`Workflow CSV URL 복사`/`Workflow CSV 스니펫 복사`/`Workflow CSV 산출물 스니펫 복사`/`Workflow CSV 실행 스니펫 복사`와 하위 `Workflow CSV 계약/색인` 메뉴의 Steps CSV schema 및 snippets CSV/schema 미리보기/복사/다운로드 버튼으로 Command Preset Steps CSV 다운로드 명령, URL, family/primary artifact/open order, safety default decision/confirmation required, auto-run 가능 여부, permission scopes, allow/confirm/deny step counts, confirm/deny step refs와 label/rationale이 포함된 rich 스니펫, family/primary artifact/open order와 핵심 실행 판단만 담은 compact 스니펫, 산출물 전용 스니펫, 실행 판단 전용 스니펫, step matrix와 스니펫 4종 CSV 색인의 컬럼 계약 schema를 바로 다룰 수 있습니다.
- `GET /api/plans/{id}/packs.bundle.health.report.md` : 추천/필터/선택 Markdown 묶음의 운영 공유용 Health Report Markdown을 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, Health JSON과 Dashboard JSON을 조합해 executive summary, snapshot, SLO, recommended actions, runbook, trend/export/lineage/observability onboarding, Health Events summary(schema/event/sink/validation/adapter readiness/incident response), Schema Index contract coverage, Workflow preflight readiness, automation event hints, commandPresetStepSummary 기반 워크플로우 단계/안전성 요약, commandPresetSafetyPolicy 기반 allow/confirm/deny 실행 정책, commandPresets 기반 권장 워크플로우, commandExampleGroups 기반 실행 예시, Schema Index Markdown/JSON/CSV/CSV Schema 주요 링크, issue/artifact 표를 한 문서로 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.artifacts.json` : 추천/필터/선택 Markdown 묶음의 artifacts 전용 JSON을 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, Manifest 전체 없이 `artifactCount`, `artifactIds`, `artifactKinds`, `artifactContentTypes`, `schemaIndexContractCoverage`, `verification`, manifest/artifacts JSON/CSV/schema와 Command Preset Steps CSV 경로와 URL, 선택 artifacts JSON/CSV/schema와 Command Preset Steps CSV 템플릿, `downloadCommands`, `familyDownloadCommands`, `envKeys`, Health Events/Adapter Readiness/Command Preset Workflow를 묶은 `artifactFamilies`와 family-level `downloadCommand`, `downloadMatrix`, `artifacts` 배열을 가볍게 확인할 수 있으며, 이 endpoint와 CSV/schema endpoint 자체도 Manifest `artifacts` 배열의 `artifacts`/`artifacts-csv`/`artifacts-schema` 항목으로 포함됩니다. `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.artifacts.csv` / `.artifacts.schema.json` : 추천/필터/선택 Markdown 묶음의 artifacts 색인을 CSV와 JSON Schema 컬럼 계약으로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `downloadMatrix`를 schema_index_contract_coverage_status/ok/issue_count/recommended_action, `artifact_order`, id, label, family_id, family_label, family_order, family_primary, family_primary_artifact_id, family_recommended_open_order, family_download_command, kind, content_type, filename, use_when, path, url, curl_command, path_env_key, url_env_key 열로 펼쳐 Health Events/Adapter Readiness/Command Preset Workflow family와 Schema Index readiness를 스프레드시트/CI matrix에서 바로 정렬하고 다운로드할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.artifact-families.md` : 추천/필터/선택 Markdown 묶음의 artifact family grouping을 사람용 Markdown 문서로 반환. Schema Index contract coverage, family별 primary artifact, recommended open order, artifact ids, download command, companion Markdown/JSON/CSV/schema 링크를 표로 제공해 외부 공유나 운영 인수인계에서 JSON payload를 열지 않고도 family 구조와 Schema Index readiness를 검토할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.artifact-families.json` : 추천/필터/선택 Markdown 묶음의 artifact family grouping만 compact JSON으로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `schemaIndexContractCoverage`, `artifactFamilies`, `familyDownloadCommands`, JSON/CSV/schema path와 URL, 다운로드 명령을 Manifest 전체 없이 확인할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.artifact-families-json.schema.json` : Artifact Families JSON payload 계약을 JSON Schema로 반환. `schemaIndexContractCoverage` 계약도 함께 고정하며 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, Schema Index에서도 `artifact-families-json`의 계약으로 발견할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.schemas.md` / `.schemas.json` / `.schemas.csv` : 추천/필터/선택 Markdown 묶음에서 발견 가능한 JSON Schema와 CSV Schema 산출물을 한 번에 나열하는 Schema Index를 Markdown, JSON, CSV matrix로 반환. 각 schema의 파일명, path/url, curl 명령, shell mode, 연결된 CSV/payload artifact filename/content-type/path/url/command/curl command/mode/key, workflow preflight command/source commands metadata와 coverage counts/missing ids 및 전용 column description/enum, family id/label/order/primary/open-order/download-command metadata, status/ok/issueCount/recommendedAction을 포함한 Schema Index JSON/CSV Schema contractCoverageSummary와 CSV coverage columns, Schema Index JSON/CSV Schema rowFieldGroups/columnFieldGroups를 제공해 외부 UI와 CI가 개별 manifest 항목을 추측하지 않고 계약 목록을 순회하거나 섹션형 UI를 구성할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.command-presets.steps.csv` / `.steps.schema.json` : 추천/필터/선택 Markdown 묶음의 command preset workflow step matrix를 CSV와 JSON Schema 컬럼 계약으로 반환. preset_order, preset_id, phase, audience, step_order, key, mode, role, required, safety_level, execution_decision, network/file-write/confirmation flags, permission_scopes, expected_result, command 열을 제공해 스프레드시트/CI matrix에서 권장 workflow와 실행 정책을 바로 정렬할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.command-presets.workflow.txt` / `.workflow.compact.txt` / `.workflow.artifact.txt` / `.workflow.execution.txt` / `.workflow.snippets.csv` / `.workflow.snippets.schema.json` : Command Preset Steps CSV handoff 스니펫을 rich, compact, artifact-only, execution-only 텍스트로 반환하거나, 4종 스니펫의 variant/artifact/path/URL/file/shell mode/command와 workflow preflight command key/mode/command/source commands hint를 CSV 색인과 JSON Schema 컬럼 계약으로 반환. UI 미리보기/복사/다운로드 버튼과 같은 family/primary artifact/open order, safety decision, confirmation, permission scopes, allow/confirm/deny counts, confirm/deny step refs, URL, command 맥락을 외부 도구/CI/메신저 봇이 직접 가져갈 수 있으며 `ids`, `scope`, `all`, `category`, `audience`, `recommended` 필터를 지원
- `GET /api/plans/{id}/packs.bundle.handoff.txt` : 추천/필터/선택 Markdown 묶음의 handoff text를 반환. Bundle Markdown URL, Manifest URL, Lock JSON/Markdown URL, Summary JSON URL, Health JSON URL, Health Markdown URL, Health CSV URL, Health CSV Schema URL, Health Badge SVG URL, Health Metrics URL, Health Alerts YAML URL, Health Dashboard JSON URL, Health Events JSON URL, Health Events Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema URL, Health Report Markdown URL, Artifacts JSON/CSV/CSV Schema URL, Artifact Families Markdown/JSON/JSON Schema/CSV/CSV Schema URL, Schema Index Markdown/JSON/CSV/CSV Schema URL, Schema Index contract coverage status/ok/issue count/action, Workflow preflight readiness status/ok/counts/missing ids/action, Command Preset Steps CSV URL/파일명/명령, Handoff URL, 저장 파일명, Health Events Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema 파일명, Health Events validation/adapter readiness 요약, curl 명령, commandPresetStepSummary 기반 워크플로우 단계/안전성 요약, commandPresetSafetyPolicy 기반 allow/confirm/deny 실행 정책, commandPresets 기반 권장 워크플로우와 commandExampleGroups 기반 실행 예시, Health Events/Adapter Readiness 산출물 family 요약(download command 포함), artifact count/ids를 포함한 `key=value` 자동화 블록, 팩 순서, 다음 액션을 text/plain으로 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.env` : 추천/필터/선택 Markdown 묶음의 순수 자동화 env text를 반환. `PLAN_ID`, `LATEST_VERSION`, `SCOPE`, `PACK_COUNT`, `IDS`, `ARTIFACT_COUNT`, `ARTIFACT_IDS`, `COMMANDS_FILENAME`, Bundle Markdown/Manifest/Lock JSON/Lock Markdown/Summary JSON/Health JSON/Health Markdown/Health CSV/Health CSV Schema/Health Badge SVG/Health Metrics/Health Alerts YAML/Health Dashboard JSON/Health Events JSON/Health Events Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema/Health Events validation/adapter readiness 요약/Schema Index contract coverage status/ok/issue count/action/Health Events/Adapter Readiness family command mode/Health Report Markdown/Artifacts JSON/Artifacts CSV/schema/Schema Index Markdown/JSON/CSV/CSV Schema/Command Preset Steps CSV/schema와 Workflow CSV rich/compact/artifact/execution handoff snippets 및 snippets CSV/schema path/URL/file/command/mode/Handoff/env path와 URL을 `KEY=value` 형식으로 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.index.md` : 추천/필터/선택 Markdown 묶음의 사람용 목차 Markdown을 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, 범위/필터/팩 ids, 먼저 열 파일, Schema Index Markdown/JSON/CSV/CSV Schema 링크와 contract coverage 요약 및 Workflow preflight readiness, Health Events Schema/Validation/Adapter Readiness 링크를 포함한 산출물 목차, Health Events/Adapter Readiness 산출물 family 표(download command 포함), 팩 목차, commandPresetStepSummary 기반 워크플로우 단계/안전성 요약, commandPresetSafetyPolicy 기반 allow/confirm/deny 실행 정책, commandPresets 기반 권장 워크플로우와 commandExampleGroups 기반 바로 쓰는 명령을 Runbook보다 짧게 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.commands.sh` : 추천/필터/선택 Markdown 묶음의 다운로드 shell script를 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드하거나 `downloadAndRunAll`, `downloadScript`, `runAll`, `markdown`, `manifest`, `index`, `lock`, `lockMarkdown`, `summaryJson`, `healthJson`, `healthMarkdown`, `healthCsv`, `healthSchema`, `healthBadge`, `healthMetrics`, `healthAlerts`, `healthDashboard`, `healthEvents`, `healthEventsSchema`, `healthEventsValidation`, `healthEventsFamily`, `healthEventsAdapters`, `healthEventsAdaptersMarkdown`, `healthEventsAdaptersSchema`, `healthEventsAdaptersCsv`, `healthEventsAdaptersCsvSchema`, `adapterReadinessFamily`, `healthReport`, `handoff`, `env`, `runbook`, `verification`, `verificationJson`, `verificationCsv`, `verificationSchema`, `checksums`, `checksumsJson`, `checksumsCsv`, `checksumsSchema`, `verify`, `verifyChecksums`, `artifactsJson`, `artifactsCsv`, `artifactsSchema`, `artifactFamiliesMarkdown`, `artifactFamiliesJson`, `artifactFamiliesJsonSchema`, `schemasIndexMarkdown`, `schemasIndex`, `schemasIndexCsv`, `artifactFamiliesCsv`, `artifactFamiliesSchema`, `schemasIndexSchema`, `commandPresetStepsCsv`, `commandPresetWorkflowSnippet`, `commandPresetWorkflowCompactSnippet`, `commandPresetWorkflowArtifactSnippet`, `commandPresetWorkflowExecutionSnippet`, `workflowPreflight`, `artifacts`, `artifactFamilies`, `print`, `healthPreflight`, `help` 실행 예시만 복사할 수 있고, 상세 화면 복사 텍스트는 manifest `commandExampleGroups`가 있으면 목적별 heading으로 묶어 표시하고 각 group/command의 `order`와 shell `mode` metadata, `commandModeIndex`, `commandPresets`의 phase/audience/primary/verification/successCriteria/steps/safety metadata, `commandPresetIndex`, `recommendedCommandPresets`, `commandPresetStepIndex`, `commandPresetStepSummary`, `commandPresetSafetyPolicy`로 외부 UI가 파싱 없이 메뉴, mode lookup, 목적별 실행 세트, 추천 버튼, flat step matrix, workflow/safety 집계, allow/confirm/deny 실행 정책, 실행 순서와 사전 확인/사후 확인 버튼을 만들 수 있으며 없으면 기존 flat list와 unknown-key fallback을 사용합니다. manifest와 Handoff text/Env/Index/Runbook에도 같은 실행 예시가 포함되고, Handoff/Env에는 `workflow_preflight_command`, `workflow_preflight_command_mode`, `workflow_preflight_readiness_*`도 포함됩니다. script help도 Bootstrap/Core/Health/Health Events/Adapter Readiness/Verification/Discovery 섹션으로 명령을 묶어 보여줍니다. script는 `all|markdown|manifest|lock|lock-markdown|summary-json|health-json|health-md|health-csv|health-schema|health-badge|health-metrics|health-alerts|health-dashboard|health-events|health-events-schema|health-events-validation|health-events-family|health-events-adapters|health-events-adapters-md|health-events-adapters-schema|health-events-adapters-csv|health-events-adapters-csv-schema|adapter-readiness-family|health-report|artifacts-json|artifacts-csv|artifacts-schema|artifact-families-md|artifact-families-json|artifact-families-json-schema|artifact-families-csv|artifact-families-schema|schemas-index-md|schemas-index|schemas-index-csv|schemas-index-schema|command-preset-steps-csv|command-preset-steps-schema|command-preset-workflow|command-preset-workflow-compact|command-preset-workflow-artifact|command-preset-workflow-execution|command-preset-workflow-snippets-csv|command-preset-workflow-snippets-schema|handoff|env|index|runbook|verification|verification-json|verification-csv|verification-schema|checksums|checksums-json|checksums-csv|checksums-schema|verify|verify-checksums|artifacts|artifact-families|print|health-preflight|workflow-preflight|help` 인자로 Bundle Markdown, Manifest JSON, Lock JSON/Markdown, Summary JSON, Health JSON, Health Markdown, Health CSV, Health Badge SVG, Health Metrics, Health Alerts YAML, Health Dashboard JSON, Health Events JSON, Health Events Schema/Validation JSON, Health Events family, Health Events Adapter Readiness JSON/Markdown/Schema/CSV/CSV schema, Adapter Readiness family, Health Report Markdown, Artifacts JSON/CSV/schema and Artifact Families Markdown/JSON/JSON Schema/CSV/schema, Schema Index Markdown/JSON/CSV/CSV Schema, Command Preset Steps CSV/schema, Workflow CSV rich/compact/artifact/execution handoff snippets와 snippets CSV/schema, Handoff text, env 파일, Index/Runbook Markdown, Verification Markdown/JSON/CSV/Schema, SHA-256 checksums TXT/JSON/CSV/schema를 curl로 내려받거나 산출물 목록/산출물 family와 family download command/주요 URL/Schema Index contract coverage/Health Events preflight/Workflow preflight readiness/Workflow preflight 전용 요약/사용법을 출력할 수 있습니다. `print` 출력에는 Schema Index coverage와 Workflow preflight readiness가 포함되고, `health-preflight` 출력에는 Schema Index Markdown/JSON/CSV/CSV Schema URL과 coverage status/ok/issue count/recommended action이 포함되며, `workflow-preflight` 출력에는 Workflow preflight readiness와 Command Preset Steps CSV/schema 및 Workflow snippet 4종/CSV/schema URL과 파일명이 포함됩니다. `verify`는 다운로드된 파일이 존재하고 비어 있지 않은지 파일명별로 출력 확인하고 `verify-checksums`는 `shasum -a 256 -c` 또는 `sha256sum -c`로 checksum을 검증하며 `all` 뒤에도 자동 실행되며, `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.runbook.md` : 추천/필터/선택 Markdown 묶음의 실행 Runbook Markdown을 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, 범위/필터/팩 ids, artifact count/ids와 artifact 표, Health Events/Adapter Readiness 산출물 family 표(download command 포함), Health Events contract preflight(adapter readiness 포함), Schema Index contract coverage, Workflow preflight readiness, Bundle Markdown/Manifest/Lock JSON/Lock Markdown/Summary JSON/Health JSON/Health Markdown/Health CSV/Health CSV Schema/Health Badge SVG/Health Metrics/Health Alerts YAML/Health Dashboard JSON/Health Events JSON/Health Events Schema/Validation JSON/Health Events Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema/Health Report Markdown/Artifacts JSON/Artifacts CSV/Schema Index Markdown/JSON/CSV/CSV Schema/Command Preset Steps CSV/Handoff/env/commands/index/runbook/verification/verification JSON/verification CSV/checksums/checksums JSON/checksums CSV/checksums CSV Schema URL, commandPresetStepSummary 기반 워크플로우 단계/안전성 요약, commandPresetSafetyPolicy 기반 allow/confirm/deny 실행 정책, commandPresets 기반 권장 워크플로우와 commandExampleGroups 기반 바로 실행 예시, Schema Index 개별 curl 명령, 팩 순서, 다음 액션을 문서형 Markdown으로 제공하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.verify.md` : 추천/필터/선택 Markdown 묶음의 verification 체크리스트 Markdown을 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `verification.requiredFiles`를 체크박스와 표로 펼치며 Health Events contract preflight(adapter readiness 포함), Schema Index contract coverage와 Schema Index Markdown/JSON/CSV/CSV Schema 링크, Health Events/Adapter Readiness 산출물 family 표(download command 포함), `allCommand`, `verifyCommand`, 완료 기준을 함께 제공해 다운로드 후 사람/CI가 받은 파일을 확인할 수 있습니다. `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.verify.json` : 추천/필터/선택 Markdown 묶음의 verification payload만 JSON으로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `verification`, `artifactFamilies`, `familyDownloadCommands`, `schemaIndexContractCoverage`, `workflowPreflightReadiness`, `commandExampleGroups`, `commandModeIndex`, `commandPresets`, `commandPresetIndex`, `recommendedCommandPresets`, `commandPresetStepIndex`, `commandPresetStepSummary`, `commandPresetSafetyPolicy`, Command Preset Steps CSV path/url/command shortcut, Health Events validation status와 adapterReadiness 및 Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema 위치를 담은 `healthEventsContract`, Health JSON/Markdown/CSV/Schema/Badge/Metrics/Alerts/Dashboard/Report와 Health Events Adapter Readiness, manifest/markdown/handoff/env, family/preflight command examples를 포함한 `commands`, `paths`, `urls`, artifact ids/count를 포함해 CI나 외부 도구가 manifest 전체 없이 검증 계획만 읽을 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.verify.csv` : 추천/필터/선택 Markdown 묶음의 verification requiredFiles를 CSV로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, file_order, id, label, family_id, family_label, family_order, family_primary, family_primary_artifact_id, family_recommended_open_order, family_download_command, filename, path, url, verify_command, all_command, success_message와 Health Events validation/adapter readiness 요약, Schema Index contract coverage status/ok/issue count/recommended action, Workflow preflight readiness status/ok/counts/missing ids/action 및 schema URL 열로 펼쳐 스프레드시트나 CI matrix에 바로 붙일 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.verify.schema.json` : Verification CSV 컬럼 계약을 JSON Schema 형태로 반환. `workflow_preflight_*` readiness 컬럼의 status/ok/count/action 타입과 enum도 함께 고정하며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.checksums.txt` : 추천/필터/선택 Markdown 묶음의 주요 bundle 산출물 SHA-256 해시를 `sha256sum` 호환 text/plain으로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, `shasum -a 256 -c` 또는 `sha256sum -c`로 다운로드한 Bundle Markdown/manifest/artifacts JSON/CSV/schema index/handoff/env/commands/index/runbook/Lock Markdown/Summary JSON/Health JSON/Markdown/CSV/Schema/Badge/Metrics/Alerts/Dashboard/Health Events/Health Events Schema/Validation/Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema/Report/Verification Markdown/JSON/CSV 파일을 검증할 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.checksums.json` : 추천/필터/선택 Markdown 묶음의 SHA-256 checksum payload를 JSON으로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, algorithm, checksumFormat, `schemaIndexContractCoverage`, `workflowPreflightReadiness`, `commandExampleGroups`, `commandModeIndex`, `commandPresets`, `commandPresetIndex`, `recommendedCommandPresets`, `commandPresetStepIndex`, `commandPresetStepSummary`, `commandPresetSafetyPolicy`, Command Preset Steps CSV path/url/command shortcut, manifest/markdown/handoff/env와 family/preflight command examples를 포함한 commands, paths, urls, files(id/label/familyId/familyLabel/familyOrder/familyPrimary/familyPrimaryArtifactId/familyRecommendedOpenOrder/familyDownloadCommand/kind/contentType/filename/path/url/sha256/byteLength)를 포함해 외부 도구가 checksum 계획과 Schema Index/Workflow preflight readiness를 구조화 데이터로 읽을 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.checksums.csv` : 추천/필터/선택 Markdown 묶음의 SHA-256 checksum payload를 CSV로 반환. 상세 화면에서 표시/선택 범위 기준으로 미리보기/복사/다운로드할 수 있고, schema_index_contract_coverage_status/ok/issue_count/recommended_action, workflow_preflight_readiness_status/ok/counts/missing ids/recommended action, file_order, id, label, family_id, family_label, family_order, family_primary, family_primary_artifact_id, family_recommended_open_order, family_download_command, kind, content_type, filename, path, url, sha256, byte_length, verify_command 열로 펼쳐 스프레드시트나 CI matrix에 바로 붙일 수 있으며 `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.bundle.checksums.schema.json` : Checksums CSV 컬럼 계약을 JSON Schema 형태로 반환. `schema_index_contract_coverage_*`와 `workflow_preflight_*` 컬럼의 status/ok/count/action 타입과 enum도 함께 고정하며, `ids=file-guide,offline-pack`, `scope=selected|visible`, `all=true`, `category`, `audience`, `recommended=true|false`를 지원
- `GET /api/plans/{id}/packs.csv` : 추천 Markdown 팩 순서, 적용 필터, 추천 이유, 목적 category, 대상 audience, 다운로드 경로와 URL, 현재 필터 기준 묶음 Markdown/Manifest/Lock JSON/Lock Markdown/Summary JSON/Health JSON/Health Markdown/Health CSV/Health CSV Schema/Health Badge SVG/Health Metrics/Health Alerts YAML/Health Dashboard JSON/Health Events JSON/Health Events Schema/Validation JSON/Health Events Adapter Readiness JSON/Markdown/Schema/CSV/CSV Schema/Health Report Markdown/Artifacts JSON/CSV/schema/Artifact Families Markdown/JSON/JSON Schema/CSV/schema/Schema Index Markdown/JSON/CSV/CSV Schema/Schema Index contract coverage JSON/CSV source URL/Command Preset Steps CSV/schema/Workflow CSV rich/compact/artifact/execution handoff snippets/Workflow CSV snippets CSV/schema/Workflow preflight mode와 source commands path/url/Handoff/env/commands/index/runbook/verification/verification JSON/verification CSV/checksums/checksums JSON/checksums CSV/checksums CSV schema 경로와 URL, 표시 팩 ids, 선택 묶음 path/url 템플릿, 자동화 산출물별 선택 템플릿, 적용 필터를 스프레드시트에 붙이기 쉬운 CSV로 반환. `all=true`면 전체 Markdown 팩 목록을 반환하고, `category`, `audience`, `recommended=true|false` 필터도 지원하며 다운로드 파일명에 적용 필터와 전체 여부 suffix를 붙임
- `GET /api/plans/{id}/packing` : 짐싸기 목록
- `GET /api/plans?filter=quality` : 자동 품질 점검의 `확인` 항목이 남은 플랜 목록. 확인 항목이 많은 플랜부터 표시
- `GET /api/plans?filter=quality-action` : 품질 확인 또는 미점검 상태인 고도화 후보 플랜 목록. 악화, 확인 항목 수, 미점검 순서로 표시
- `GET /api/plans?filter=quality-urgent` : 우선도 80 이상 긴급 품질 후보 플랜 목록
- `GET /api/plans?filter=quality-ok` : 자동 품질 점검이 모두 OK인 플랜 목록
- `GET /api/plans?filter=quality-unaudited` : 자동 품질 점검이 아직 없는 플랜 목록
- `GET /api/plans?filter=quality-regression` : 직전 버전보다 자동 품질 점검 `확인` 항목이 늘어난 플랜 목록. 증가량이 큰 플랜부터 표시
- `GET /api/plans?filter=quality-improved` : 직전 버전보다 자동 품질 점검 `확인` 항목이 줄어든 플랜 목록. 개선량이 큰 플랜부터 표시
- `GET /api/plans/quality-summary` : 홈 품질 요약 패널, `CI 게이트`, `CI 명령`, `CI JSON 명령`, `CSV CI`, `Report CI`, `Metrics CI`, `Events CI`, `Alert CI`, `Runbook CI`, `npm CI`, `npm CI JSON`, `npm CSV`, `npm Report`, `npm Metrics`, `npm Events`, `npm Alert`, `npm Health`, `npm Runbook`, `CI 묶음`, `CI 가이드`, `JUnit XML`, `SARIF`, `Step 요약`, `Annotations`, `Outputs`, `PR 댓글`, `Artifacts`, `배지 MD`, `배지 SVG`, `로컬 CI`, `Actions CI` 버튼과 `고도화 후보`, `품질 확인`, `품질 OK`, `품질 미점검`, `품질 악화`, `품질 개선` 빠른 필터 버튼에 표시할 전체 카운트, 긴급 후보 수, 품질 OK 비율, 많이 남은 확인 항목, 다음 품질 필터(`qualityNextFilter`/`qualityNextLabel`/`qualityNextReason`), 다음 목록/TODO/TODO text 호출 경로(`qualityNextApiPath`/`qualityNextTodoPath`/`qualityNextTodoTextPath`, TODO 경로는 `next=true` 기준), 게이트 매트릭스 호출 경로(`qualityGatesPath`/`qualityGatesTextPath`)와 CSV 경로(`qualityGatesCsvPath`/`qualityGatesCsvGatePath`)와 Markdown 리포트 경로(`qualityGatesReportPath`/`qualityGatesReportGatePath`)와 metrics 경로(`qualityGatesMetricsPath`/`qualityGatesMetricsGatePath`)와 이벤트 NDJSON 경로(`qualityGatesEventsPath`/`qualityGatesEventsGatePath`)와 alert JSON 경로(`qualityGatesAlertPath`/`qualityGatesAlertGatePath`)와 health 경로(`qualityGatesHealthPath`)와 보강 Runbook 경로(`qualityGatesRemediationPath`/`qualityGatesRemediationGatePath`)와 CI 가이드 Markdown 경로(`qualityGatesCiGuidePath`)와 JUnit XML 경로(`qualityGatesJunitPath`/`qualityGatesJunitGatePath`)와 SARIF JSON 경로(`qualityGatesSarifPath`/`qualityGatesSarifGatePath`)와 Step Summary Markdown 경로(`qualityGatesStepSummaryPath`/`qualityGatesStepSummaryGatePath`)와 GitHub Actions annotation 경로(`qualityGatesAnnotationsPath`/`qualityGatesAnnotationsGatePath`)와 GitHub Actions output 경로(`qualityGatesOutputsPath`/`qualityGatesOutputsGatePath`)와 PR 댓글 Markdown 경로(`qualityGatesPrCommentPath`/`qualityGatesPrCommentGatePath`)와 산출물 매니페스트 경로(`qualityGatesArtifactsPath`/`qualityGatesArtifactsGatePath`)와 CI 명령 묶음 JSON/text 경로(`qualityGatesCommandsPath`/`qualityGatesCommandsTextPath`)와 CI용 실패 코드 게이트 매트릭스 호출 경로(`qualityGatesGatePath`/`qualityGatesGateTextPath`) 및 CI 명령 전용 실패 코드 경로(`qualityGatesCommandsGatePath`/`qualityGatesCommandsGateTextPath`)와 curl 명령(`qualityGatesGateCurlCommand`/`qualityGatesGateJsonCurlCommand`/`qualityGatesCsvGateCurlCommand`/`qualityGatesReportGateCurlCommand`/`qualityGatesMetricsGateCurlCommand`/`qualityGatesEventsGateCurlCommand`/`qualityGatesAlertGateCurlCommand`/`qualityGatesHealthCurlCommand`/`qualityGatesRemediationGateCurlCommand`/`qualityGatesCommandsGateCurlCommand`/`qualityGatesCommandsGateJsonCurlCommand`/`qualityGatesCiGuideGateCurlCommand`/`qualityGatesJunitGateCurlCommand`/`qualityGatesSarifGateCurlCommand`/`qualityGatesStepSummaryGateCurlCommand`/`qualityGatesAnnotationsGateCurlCommand`/`qualityGatesOutputsGateCurlCommand`/`qualityGatesPrCommentGateCurlCommand`/`qualityGatesArtifactsGateCurlCommand`)과 npm 명령(`qualityGatesGateNpmCommand`/`qualityGatesGateJsonNpmCommand`/`qualityGatesCsvGateNpmCommand`/`qualityGatesReportGateNpmCommand`/`qualityGatesMetricsGateNpmCommand`/`qualityGatesEventsGateNpmCommand`/`qualityGatesAlertGateNpmCommand`/`qualityGatesHealthNpmCommand`/`qualityGatesRemediationGateNpmCommand`/`qualityGatesCommandsGateNpmCommand`/`qualityGatesCommandsGateJsonNpmCommand`/`qualityGatesCiGuideGateNpmCommand`/`qualityGatesJunitGateNpmCommand`/`qualityGatesSarifGateNpmCommand`/`qualityGatesStepSummaryGateNpmCommand`/`qualityGatesAnnotationsGateNpmCommand`/`qualityGatesOutputsGateNpmCommand`/`qualityGatesPrCommentGateNpmCommand`/`qualityGatesArtifactsGateNpmCommand`)과 묶음 명령(`qualityGatesGateCommandBundle`/`qualityGatesCommandsGateCommandBundle`)과 구조화 명령 배열(`qualityGatesGateCommands`), CI 예시 경로(`qualityGatesGateLocalShellPath`/`qualityGatesGateGithubActionsPath`)와 CI 예시(`qualityGatesGateCiExamples`/`qualityGatesGateGithubActionsExample`/`qualityGatesGateLocalShellExample`), 기본/긴급/다음 strict 게이트와 후보 5개 이하 허용 게이트 호출 경로(`qualityGatePath`/`qualityGateTextPath`/`qualitySoftGatePath`/`qualitySoftGateTextPath`/`qualityUrgentGatePath`/`qualityUrgentGateTextPath`/`qualityUrgentSoftGatePath`/`qualityUrgentSoftGateTextPath`/`qualityNextGatePath`/`qualityNextGateTextPath`/`qualityNextSoftGatePath`/`qualityNextSoftGateTextPath`)
- `GET /api/plans/quality-todo?limit=10&offset=0` : 품질 요약, payload 타입/스키마 버전/생성 출처/상태/상태 메시지/추천 후속 동작/빈 배치 여부/게이트 기준/게이트 대상 수/게이트 상태/실패 여부/exit code/생성 시각/요청 limit/offset/최소 우선도/필터 라벨/후보 수 기준/필터 공백 여부/필터 전 후보 수/전체 긴급 후보 수/다음 품질 필터/이유/호출 경로와 URL/게이트 호출 경로와 URL/반환 개수/현재 배치 범위/배치 요약/전체 후보 수/남은 후보 수/추가 배치 여부/현재 필터/게이트 조건을 유지한 현재/전체/다음 조회용 query/API path/API URL/text path/text URL/CLI args/CLI command/JSON·text curl command `meta`, 우선도순 고도화 후보 목록, 바로 처리할 `nextPlan`, 웹 TODO 묶음 복사가 우선 사용하는 공유용 `todoText`, 각 후보의 `qualityRefinePath`/`qualityRefineUrl`을 한 번에 반환. `limit`은 기본 10, 범위 1~50, `offset`은 기본 0, 범위 0~5000, `minPriority`/`min_priority`는 기본 0, 범위 0~100, `urgent=true`는 `minPriority=80` 별칭, `next=true`는 현재 `qualityNextFilter` 기준 후보 별칭, `all=true`면 현재 offset부터 남은 후보를 최대 5000개까지 반환, `failOnEmpty=true`는 빈 배치를 실패 메타로 표시, `failOnAction=true`는 후보가 남으면 실패 메타로 표시, `maxActions=5`는 후보가 5개를 초과할 때만 실패 메타로 표시
- `GET /api/plans/quality-todo.txt?limit=10&offset=0` : 같은 품질 고도화 TODO를 JSON 파싱 없이 `text/plain`으로 반환. `minPriority`, `next=true`, `urgent=true`, `all=true`, `failOnEmpty`, `failOnAction`, `maxActions`도 지원
- `GET /api/plans/quality-gates` : 전체 strict, 전체 완화 5, 긴급 strict, 긴급 완화 5, 다음 strict, 다음 완화 5 게이트와 추천 액션, CI 실행 명령(`commands`, commands 전용 게이트 명령 포함), CSV text(`csvText`), Markdown 리포트(`reportText`), Prometheus 스타일 metrics(`metricsText`), 이벤트 NDJSON(`eventsText`), alert JSON(`alert`), health text(`healthText`), 보강 Runbook(`remediationText`), SARIF JSON(`sarifJson`), Step Summary Markdown(`stepSummaryText`), Annotations text(`annotationsText`), Outputs text(`outputsText`), PR Comment Markdown(`prCommentText`), Artifacts JSON(`artifacts`), 로컬 shell/GitHub Actions 예시(`ciExamples`), 묶음 명령(`commandBundle`; `quality-summary`에서는 `qualityGatesGateCommands`/`qualityGatesGateCommandBundle`)을 한 번에 계산해 JSON으로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.txt` : 같은 품질 게이트 매트릭스와 추천 액션, CI 명령 섹션, CI 명령 묶음을 `text/plain`으로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.csv` : 같은 품질 게이트 매트릭스와 추천 액션, CI 명령을 스프레드시트에 붙이기 쉬운 `text/csv`로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.report.md` : 같은 품질 게이트 매트릭스와 추천 액션, 주요 산출물, CI 명령을 사람에게 공유하기 좋은 Markdown 리포트로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.metrics` : 품질 게이트 실패 여부, 실패 개수, 평가 게이트 수, 게이트별 후보 수/허용 수/실패 여부를 Prometheus 스타일 `text/plain` metrics로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.events.ndjson` : 품질 게이트 요약, 게이트 결과, 추천 액션, CI 명령을 줄 단위 JSON 이벤트로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.alert.json` : 품질 게이트 상태, 심각도, 메시지, 실패 게이트, 추천 액션, 주요 링크를 외부 알림이 바로 읽기 쉬운 JSON payload로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.health` : 품질 게이트가 통과하면 HTTP `200`과 `ok`, 실패하면 HTTP `503`과 `failed`를 반환하는 헬스체크. 업타임 모니터와 간단한 cron 점검에 사용
- `GET /api/plans/quality-gates.remediation.md` : 실패 게이트, 추천 액션, 복사해서 실행할 명령, 참고 산출물을 묶은 보강 Runbook Markdown 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.ci.md` : 품질 게이트 상태, 추천 액션, 명령, 로컬 shell/GitHub Actions 예시, 출처를 묶은 CI 가이드 Markdown 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.commands` : CI 게이트 실패 여부와 gates 배열, CI 명령 배열과 묶음, 로컬 shell/GitHub Actions 예시(`ciExamples`), JSON/text 호출 경로 메타를 JSON으로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.commands.txt` : CI 명령 묶음만 `text/plain`으로 반환. `failOnFailed=true`면 실패 매트릭스에서 HTTP `409` 반환
- `GET /api/plans/quality-gates.local.sh` : 로컬 shell 품질 게이트 실행 예시를 `text/x-shellscript`로 반환
- `GET /api/plans/quality-gates.github-actions.yml` : GitHub Actions 품질 게이트 workflow 예시를 `text/yaml`로 반환. 예시는 SARIF 파일을 먼저 생성해 `github/codeql-action/upload-sarif@v4`로 업로드한 뒤 게이트를 실패 처리한다.
- 운영 스크립트: `webapp`에서 `npm run quality:gates`로 품질 게이트 매트릭스 text를, `npm run quality:gates:json`으로 JSON을, `npm run quality:gates:csv`로 CSV를, `npm run quality:gates:report`로 Markdown 리포트를, `npm run quality:gates:metrics`로 Prometheus 스타일 metrics를, `npm run quality:gates:events`로 이벤트 NDJSON을, `npm run quality:gates:alert`로 알림 JSON을, `npm run quality:gates:health`로 HTTP 200/503 헬스체크를, `npm run quality:gates:remediation`으로 보강 Runbook을, `npm run quality:gates:badge`로 배지 JSON을, `npm run quality:gates:ci-guide`로 CI 가이드 Markdown을, `npm run quality:gates:junit`로 JUnit XML을, `npm run quality:gates:sarif`로 SARIF JSON을, `npm run quality:gates:step-summary`로 GitHub Step Summary Markdown을, `npm run quality:gates:pr-comment`로 GitHub PR 댓글 Markdown을, `npm run quality:gates:artifacts`로 산출물 매니페스트 JSON을, `npm run quality:gates:annotations`로 GitHub Actions annotation command를, `npm run quality:gates:outputs`로 GitHub Actions output key-value를, `npm run quality:gates:commands:json`으로 CI 명령 JSON을, `npm run quality:gates:commands`로 CI 명령 묶음을 바로 확인. `npm run quality:gates:local-shell`은 로컬 shell 예시를, `npm run quality:gates:github-actions`는 GitHub Actions workflow 예시를 출력합니다. `npm run quality:gates:gate`, `npm run quality:gates:gate:json`, `npm run quality:gates:csv:gate`, `npm run quality:gates:report:gate`, `npm run quality:gates:metrics:gate`, `npm run quality:gates:events:gate`, `npm run quality:gates:alert:gate`, `npm run quality:gates:health`, `npm run quality:gates:remediation:gate`, `npm run quality:gates:commands:gate`, `npm run quality:gates:commands:gate:json`, `npm run quality:gates:ci-guide:gate`, `npm run quality:gates:junit:gate`, `npm run quality:gates:sarif:gate`, `npm run quality:gates:step-summary:gate`, `npm run quality:gates:pr-comment:gate`, `npm run quality:gates:artifacts:gate`, `npm run quality:gates:annotations:gate`, `npm run quality:gates:outputs:gate`는 실패 매트릭스에서 non-zero로 종료하며, 홈 품질 패널의 `CSV`/`Report`/`Metrics`/`Events`/`Alert`/`Health`/`Runbook`/`CSV CI`/`Report CI`/`Metrics CI`/`Events CI`/`Alert CI`/`Runbook CI`/`npm CSV`/`npm Report`/`npm Metrics`/`npm Events`/`npm Alert`/`npm Health`/`npm Runbook`/`npm CI`/`npm CI JSON` 버튼과 `CI 묶음`/`CI 가이드`/`JUnit XML`/`SARIF`/`Step 요약`/`Annotations`/`Outputs`/`PR 댓글`/`Artifacts`/`배지 MD`/`배지 SVG`/`로컬 CI`/`Actions CI` 버튼으로 같은 명령을 복사. GitHub Actions 예시는 https://github.com/actions/checkout, https://github.com/actions/setup-node, https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file 공식 문서 기준, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary 및 https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-error-message 기준 및 https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-output-parameter 기준, SARIF 스키마 및 https://cli.github.com/manual/gh_pr_comment 기준, SARIF 스키마는 https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json 기준
- `GET /api/plans/quality-gate` : `/api/plans/quality-todo?all=true&failOnAction=true`와 같은 계산을 JSON으로 반환하되, 게이트 실패 시 HTTP `409`, 통과 시 HTTP `200` 반환. `next=true`, `urgent=true`, `maxActions=5`, `minPriority`도 함께 지원하며 홈 요약은 strict 게이트, 긴급 게이트, 후보 5개 이하 허용 게이트, 긴급 후보 5개 이하 허용 게이트 경로를 함께 제공
- `GET /api/plans/quality-gate.txt` : 같은 게이트 계산을 `text/plain`으로 반환. 게이트 실패 시 HTTP `409`, 통과 시 HTTP `200` 반환
- `GET /api/plans/{id}/departure` : 출발 전 브리핑
- `GET /api/plans/{id}/readiness` : 여행 플랜 준비도와 보강 항목
- `GET /api/plans/{id}/prep-plan` : 준비도 기준 우선순위 보강 플랜
- `GET /api/plans/{id}/readiness-share` : 동행 공유용 준비 요약문
- `GET /api/plans/{id}/now` : 오늘 상태, 다음 액션, 예산, 지출/정산 현황판
- `GET /api/plans/{id}/next-action` : 여행 상태와 시간대 기준 다음 액션 추천
- `GET /api/plans/{id}/brief?date=YYYY-MM-DD` : 선택 날짜 일정/예산 브리핑
- `GET /api/plans/{id}/today-check?date=YYYY-MM-DD` : 선택 날짜 출발/일정/지출 점검표
- `GET /api/plans/{id}/tomorrow` : 내일 일정/예산 브리핑
- `GET /api/plans/{id}/day-share?date=YYYY-MM-DD` : 선택 날짜 동행 공유 요약
- `GET /api/plans/{id}/night-check?date=YYYY-MM-DD` : 선택 날짜 밤 지출/내일 준비 점검표
- `GET /api/plans/{id}/date/{date}` : 특정 날짜 일정 보기
- `GET /api/plans/{id}/day/{day}` : 특정 일차 일정만 보기
- `GET /api/plans/{id}/export` : Markdown 파일 다운로드
- `GET /api/plans/{id}/maps` : 네이버지도/카카오맵/구글맵 검색 링크
- `GET /api/plans/{id}/share` : 공유용 요약 텍스트
- `GET /api/plans/{id}/today` : 오늘 기준 일차 일정 보기
- `POST /api/plans` : 새 플랜 생성
- `POST /api/plans/{id}/duplicate` : 기존 플랜 복제
- `POST /api/plans/{id}/expense` : 지출 항목 저장
- `POST /api/plans/{id}/note` : 개인 메모 저장/삭제
- `POST /api/plans/{id}/pin` : 플랜 고정/해제
- `POST /api/plans/{id}/party-budget` : 인원/1인 예산 변경
- `POST /api/plans/{id}/schedule` : 출발일/박수 변경
- `POST /api/plans/{id}/refine` : 피드백 반영해 재생성
- `DELETE /api/plans/{id}/expense/{expenseId}` : 지출 항목 삭제
- `PATCH /api/plans/{id}/expense/{expenseId}` : 지출 항목 수정

## 운영 runbook

| Situation | Check first | Stop when |
|---|---|---|
| Static app changed | `webapp/public` 변경 여부와 service worker cache version 동기화 | public asset 변경 후 cache bump가 없을 때 |
| LLM generation issue | 브라우저에 입력한 API key, provider 선택, request payload 크기 | API key가 없거나 provider 응답이 불완전할 때 |
| Travel plan quality issue | 입력 요구사항, 날짜/지역/교통 제약, itinerary 결과의 이동 동선 | 날짜나 위치 가정이 불명확할 때 |
| Discord bot issue | `DISCORD_BOT_TOKEN`, LLM API key env, bot process 상태 | 토큰/env가 없거나 권한 범위가 불명확할 때 |
| Compact CI handoff issue | 아래 Compact CI evidence chain 섹션의 release gate와 health criteria | evidence가 degraded/blocked인데 downstream reuse가 필요할 때 |
| Documentation drift | README, PLAN, EXPERIMENTS가 같은 운영 결정을 말하는지 | public behavior 또는 운영 기준과 기록이 어긋날 때 |

### 운영 configuration matrix

| Surface | Required configuration | Check before use | Stop when |
|---|---|---|---|
| Static web app | `webapp/public` assets and matching service worker cache version | public asset change and cache bump are in the same change | cache version is stale after public asset edits |
| Browser LLM generation | User-entered provider/API key and request inputs | provider, API key, dates, destination, transport, and budget assumptions are visible | key/provider is missing or travel assumptions are implicit |
| Discord bot runtime | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, allowlist env, LLM provider key | `npm run bot:doctor` or `/doctor` shows env and access policy are coherent | token, allowlist, admin, or LLM env is unclear |
| Discord mobile links | `TRAVEL_PUBLIC_BASE_URL` when web detail links must open on iPhone | URL is reachable from the intended network or deployment context | link target only works from the wrong network |
| Compact CI handoff | compact payload, release gate result, health state, handoff packet | release gate is healthy and packet fields are filled | evidence is degraded/blocked or packet context is missing |
| Documentation state | README, PLAN, EXPERIMENTS companion updates | documentation drift checklist has no required follow-up left | docs and operating behavior describe different decisions |

### 운영 service worker cache bump policy

| Change | Cache bump needed | Why |
|---|---|---|
| Any file under `webapp/public` changes | Yes | Existing clients may keep the old shell asset cache |
| README, PLAN, EXPERIMENTS, or docs-only changes | No | Public runtime assets are unchanged |
| Discord bot/server-only code changes | No, unless public assets also change | Browser shell cache does not serve bot runtime code |
| Static HTML/CSS/JS behavior changes | Yes | Users need the new app shell and interaction code |
| Public copy text or embedded payload changes | Yes | Cached UI may otherwise show stale text or payload metadata |
| Cache version bump without public asset change | Avoid | It causes unnecessary client refresh churn |

When public assets and docs change together, include the cache bump in the same change and record it in the release or validation evidence.

### 운영 smoke-check checklist

| Check | What to confirm | Stop when |
|---|---|---|
| Home/static shell | The app shell loads with the expected cached version after public asset changes | stale UI appears after a cache-sensitive change |
| Plan generation form | Provider/API key, destination, dates, transport, budget, and constraints are explicit before generation | any required travel assumption is implicit |
| Generated itinerary | Result exposes dates, movement flow, weather/transport/local assumptions, and quality warnings when relevant | route or date assumptions are unclear |
| Discord readiness | `/doctor` or local doctor output matches the `.env` assumptions in this README | token, allowlist, admin, or LLM env is inconsistent |
| Mobile link path | `TRAVEL_PUBLIC_BASE_URL` opens from the intended iPhone network context | the link works only from a different network |
| Compact CI handoff | release gate is healthy and handoff packet has owner, boundary, artifacts, marker/checksum result, and retry condition | packet is incomplete or health state is degraded/blocked |
| Documentation sync | README, PLAN, and EXPERIMENTS describe the same operating decision | any companion update is missing |

### 운영 validation evidence template

Use this after running a smoke check, release check, or incident follow-up so the validation result is repeatable.

```md
#### Travel planner validation evidence - YYYY-MM-DD
- Scope: <static shell/LLM generation/itinerary quality/Discord readiness/mobile link/Compact CI handoff/docs sync>
- Trigger: <release/smoke check/incident retry/manual audit>
- Evidence source: <screen, command output, artifact path, Discord command, or README section>
- Expected result: <what should be true>
- Actual result: <what was observed>
- Decision: <pass/fail/degraded/blocked>
- Follow-up: <none/repair/rollback/docs update/retry condition>
```

### 운영 incident template

Use this when static app behavior, LLM generation, travel plan quality, Discord bot operation, Compact CI handoff, or documentation drift needs follow-up.

```md
#### Travel planner operation incident - YYYY-MM-DD
- Situation: <static app/LLM generation/travel plan quality/Discord bot/Compact CI handoff/documentation drift>
- Source: <screen, command, user report, CI artifact, or bot log>
- Impact: <user-visible issue, release risk, evidence reuse risk, or documentation drift>
- Stop condition: <runbook stop condition that was hit>
- Immediate decision: <continue/regenerate/repair/rollback/escalate>
- Owner: <operator or role>
- Retry condition: <what must change before retry>
- Follow-up docs: <README/PLAN/EXPERIMENTS sections to update>
```

### 운영 release checklist

| Area | Release check | Hold release when |
|---|---|---|
| Static app | public asset 변경과 service worker cache version이 같은 변경에 포함되어 있다 | `webapp/public` 변경 후 cache bump가 없다 |
| LLM generation | provider/API key 입력 흐름과 request payload 전제가 README 실행 설명과 일치한다 | key/provider 전제가 문서와 화면에서 다르다 |
| Travel plan quality | 날짜, 지역, 교통 제약, 이동 동선 가정이 결과와 함께 드러난다 | 사용자가 준 날짜/위치보다 모델 추정이 앞선다 |
| Discord bot | `DISCORD_BOT_TOKEN`과 LLM API key env 전제가 실행 문서와 일치한다 | 권한, 토큰, env 전제가 불명확하다 |
| Compact CI handoff | release gate가 healthy이고 handoff packet이 채워져 있다 | evidence가 degraded/blocked인데 reuse가 필요하다 |
| Documentation | README, PLAN, EXPERIMENTS가 같은 운영 결정을 말한다 | 코드/운영 기준과 진행 기록이 어긋난다 |

### 운영 backup/restore checklist

| Scope | Backup before | Restore only when |
|---|---|---|
| JSON 저장소 | `/doctor`, `npm run bot:doctor`, 또는 운영 로그에서 저장소 경로와 읽기 상태를 확인한다 | 저장소 경로와 소유자가 현재 런타임과 일치한다 |
| Travel plans | `/backup`, `/offline`, Markdown export, 또는 웹 상세 export로 사용자 확인 가능한 사본을 남긴다 | plan ID, version, generated time이 복구 대상과 일치한다 |
| Personal notes and expenses | `/memos`, `/recap`, expenses export, settlement output을 함께 보존한다 | 메모/지출/정산 데이터가 같은 plan ID에 속한다 |
| Discord access config | `.env`의 guild/user/admin allowlist와 `travel-planner-*.env` 복구 파일을 보관한다 | `/policy` 또는 `/whoami` 결과가 복구할 사용자/서버와 일치한다 |
| Mobile/offline copies | iPhone에서 열 수 있는 오프라인 Markdown 또는 웹 상세 URL 상태를 기록한다 | 네트워크 없이도 필요한 일정/비상/정산 정보가 열리는지 확인했다 |
| Compact CI evidence | handoff packet, retained artifact paths, marker/checksum 결과를 함께 보관한다 | release gate가 healthy이고 retry condition이 비어 있거나 충족됐다 |

Stop restore when the storage path, plan ID, Discord identity, or artifact health state does not match the target runtime. Do not copy or overwrite any DB until the backup file check passes, the target DB path is confirmed, and an operator explicitly approves the restore mutation.

### 운영 data retention/privacy checklist

| Data | Retain | Do not record |
|---|---|---|
| LLM/API credentials | Provider name and whether a key was present | Raw API key, Discord bot token, or copied `.env` secret values |
| Discord identity | User ID, guild ID, allowlist/admin policy needed for access diagnosis | Unneeded message content from other users or unrelated guild metadata |
| Travel plans | Plan ID, version, destination, dates, generated time, and user-approved export | Sensitive free-form notes not needed for the incident or restore decision |
| Personal notes | Note timestamps and plan ID when needed for recovery | Private note content in shared incident logs unless the user asks |
| Expenses and settlement | Amount, category, payer, date, and settlement totals needed for restore | Payment account numbers, card details, or unrelated personal finance data |
| Mobile/offline exports | File name, generated time, and whether it opens offline | Full offline export content in operational logs unless required |
| Compact CI evidence | Artifact path, health state, marker/checksum result, retry condition | Secrets, unrelated CI logs, or route execution output without approval |

Prefer recording pointers, IDs, timestamps, health states, and retry conditions over copying full personal content into operational logs.

### 운영 secret/access rotation checklist

| Surface | Review or rotate when | Stop when |
|---|---|---|
| Browser LLM API key | Provider changes, shared device use ends, or generation failures suggest an invalid key | Raw key would need to be pasted into logs or docs |
| Discord bot token | Bot invite scope changes, token exposure is suspected, or bot starts responding from an unexpected runtime | Old and new token state cannot be distinguished without exposing token values |
| Discord allowlists | Server, user, admin, DM policy, or family/friend access changes | `/policy` or `/whoami` does not match the intended user/guild/admin scope |
| `TRAVEL_PUBLIC_BASE_URL` | Network, tunnel, deployment URL, or iPhone access path changes | The URL opens only from the wrong network or leaks an unintended local endpoint |
| JSON storage access | Runtime user, launchd plist, storage path, or backup/restore target changes | Storage owner/path does not match the active runtime |
| Compact CI artifacts | Handoff packet owner, downstream receiver, or retained artifact path changes | Artifact health state is degraded/blocked or ownership is unclear |

Record rotation evidence as provider/token-present status, Discord IDs, path names, health states, and retry conditions. Do not record raw secret values.

### 운영 monitoring signals

| Signal | Watch | Action |
|---|---|---|
| Static cache drift | Stale UI after `webapp/public` changes or cache-sensitive release | Check service worker cache bump policy and hold release until cache/version evidence is recorded |
| LLM generation degradation | Missing provider/key, incomplete response, or implicit travel assumptions | Stop generation reuse and capture validation evidence before retry |
| Travel quality regression | Dates, destination, transport, weather/local assumptions, or movement flow are unclear | Mark itinerary quality degraded and revise input assumptions before sharing |
| Discord access denial | `/policy`, `/whoami`, `/doctor`, or denied logs show user/guild/admin mismatch | Review allowlist/admin env and record secret/access rotation evidence without logging raw secrets |
| Mobile link failure | `TRAVEL_PUBLIC_BASE_URL` opens only from the wrong network or not on iPhone | Hold mobile handoff and update configuration matrix or incident record |
| Backup/restore mismatch | Storage path, plan ID, Discord identity, or artifact health state differs from target runtime | Stop restore and record backup/restore incident with retry condition |
| Compact CI evidence degradation | Release gate, health criteria, retained artifact marker verify, or checksum comparison is degraded/blocked | Stop downstream reuse and use failure triage, repair playbook, or rollback policy |
| Documentation drift | README, PLAN, and EXPERIMENTS disagree on an operating decision | Update the lower-priority source according to source-of-truth hierarchy |

### 운영 command map

Run these commands from `webapp/` unless a later runbook says otherwise. Capture command, timestamp, environment, and relevant output path in validation or incident evidence.

| Need | Command | Evidence to keep |
|---|---|---|
| Local app preview | `npm run dev` | URL, device/browser, travel scenario, and cache state |
| Discord dry run | `npm run bot:mock` | Input prompt, mock response, and any generated plan artifact |
| Discord environment diagnosis | `npm run bot:doctor` | Redacted provider/access status and missing configuration notes |
| Discord service operations | `npm run bot:status`, `npm run bot:logs`, `npm run bot:denied` | Service status, denied access reason, and follow-up owner |
| Quality gate health | `npm run quality:gates:health`, `npm run quality:gates:gate:json` | Health state, failing gate, retained artifact marker, and checksum result |
| Quality evidence artifacts | `npm run quality:gates:artifacts`, `npm run quality:gates:step-summary` | Artifact paths, step summary, and CI handoff link |
| TODO debt triage | `npm run quality:todo:urgent`, `npm run quality:todo:gate` | Urgent count, gate threshold, and planned remediation item |
| CI integration help | `npm run quality:gates:ci-guide` | Guide version, consuming workflow, and any local deviation |

### 운영 health metadata

The static health metadata lives at `webapp/public/health.json` and should be reachable as `/health.json` in the hosted app. Use it as a lightweight operator check before handoff or release.

| Field | Meaning | Operational use |
|---|---|---|
| `schemaVersion` | Version of the health metadata shape | Detect incompatible automation assumptions |
| `status` | Metadata intent, not live uptime | Avoid treating static hosting as a full runtime probe |
| `lastUpdated` | Date this metadata was last intentionally reviewed | Catch stale release/operator notes |
| `serviceWorkerCacheName` | Expected cache name for the shell assets | Compare against `service-worker.js` after `webapp/public` changes |
| `surfaces` | User/operator-facing static routes | Check that the app shell, plan view, and health metadata are reachable |
| `operatorChecks` | Manual pre-handoff checks | Keep release evidence consistent across local, mobile, Discord, and CI handoffs |

### 운영 health metadata consistency check

Run from `webapp/`:

```bash
npm run health:metadata
```

Use this before release or handoff when `webapp/public/health.json` or `webapp/public/service-worker.js` changes. The check confirms that the health metadata schema is supported, the expected service worker cache name matches the actual cache name, `/health.json` is part of the shell assets, listed surfaces point to static files, and operator checks are present.

Record the JSON output with the validation evidence when the command is used as a release gate. A failure means the static operator metadata is stale or incomplete, so hold the handoff until the mismatch is repaired.

### 운영 health API metadata summary

The public API health endpoint keeps the existing liveness shape and adds static metadata context:

```bash
curl -sS http://localhost:3000/api/health
```

Use `healthMetadata.metadataState`, `consistencyState`, `serviceWorkerCacheName`, `serviceWorkerActualCacheName`, `surfaceCount`, `operatorCheckCount`, and `issues` as a quick remote sanity check after the server starts. `/api/status` includes the same summary for operator dashboards, while `/health.json` remains the static source for full operator checks.

If `metadataState` is `unavailable` or `consistencyState` is `degraded`, treat the app as live but operationally incomplete: run `npm run health:metadata`, repair the static metadata, missing surface, missing shell asset registration, or service worker mismatch, and record the result before release or handoff.

For terminal-friendly checks, use the plain-text health endpoint:

```bash
npm run health:api
```

The text response keeps the same liveness signal and prints `metadataState`, `consistencyState`, cache names, counts, and compact issue codes. Prefer this for simple shell monitors, launchd checks, or quick handoff notes where JSON parsing would add noise.

By default the command checks `http://localhost:3000/api/health.txt`. For a deployed or mobile handoff target, set `TRAVEL_HEALTH_URL` to an explicit health endpoint or `TRAVEL_PUBLIC_BASE_URL` to the hosted app base URL. `TRAVEL_HEALTH_URL` is treated as the endpoint to fetch; `TRAVEL_PUBLIC_BASE_URL` is treated as a base and the checker appends `api/health.txt`.

```bash
TRAVEL_PUBLIC_BASE_URL=https://travel.example.com npm run health:api
```

Use `TRAVEL_HEALTH_URL` when a proxy exposes health at a non-standard path:

```bash
TRAVEL_HEALTH_URL=https://travel.example.com/internal/health.txt npm run health:api:gate
```

For release evidence, set `TRAVEL_HEALTH_EVIDENCE=1`. The checker keeps the health response on stdout and writes target URL, gate mode, HTTP status, and elapsed milliseconds to stderr:

```bash
TRAVEL_HEALTH_EVIDENCE=1 TRAVEL_PUBLIC_BASE_URL=https://travel.example.com npm run health:api:gate
```

If the target URL is invalid, the checker exits non-zero with a concise `invalid health URL` error. With `TRAVEL_HEALTH_EVIDENCE=1`, it still writes the attempted target, gate mode, `healthCheckStatus=error`, and elapsed milliseconds to stderr.

For automation that must fail on degraded metadata, use the explicit gate:

```bash
npm run health:api:gate
```

This calls the resolved health endpoint with `failOnDegraded=true`. The default health endpoints still report liveness with HTTP 200, while the gate returns HTTP 503 and `ok=false` only when the static metadata is unavailable or inconsistent. The gate also exits non-zero if a remote response says `metadataState=unavailable` or `consistencyState=degraded`, even when an older deployment accidentally returns HTTP 200.

For release or handoff preflight, run the grouped operator check from `webapp/`:

```bash
npm run ops:workflows
npm run ops:preflight
```

`npm run ops:workflows` prints the main setup, release/handoff, health, protected API, storage backup, storage restore, and always-on bot operation command groups. The Release/Handoff group starts with `ops:evidence:workflow`; use that helper as the canonical ordered command list and treat the rest of the group as discoverability for the same evidence path. `npm run ops:preflight` runs static health metadata, storage integrity, environment doctor, and health API gate checks in order. If the server is not running yet and you only want file/env readiness, use:

```bash
npm run ops:evidence:workflow
npm run ops:workflows:json
npm run ops:workflows:json:file
```

Use the JSON workflow index when automation or docs tooling needs the same command groups without parsing the human-readable text output. `ops:workflows:json:file` writes to `TRAVEL_OPS_WORKFLOWS_PATH` when set, otherwise `webapp/reports/ops-workflows.json` through `TRAVEL_EVIDENCE_DIR`, using a temporary-file rename; generated workflow index files are ignored by git by default.

`npm run ops:evidence:workflow` prints the release/handoff evidence command sequence for evidence default checks, path preview, checklist, workflow index, preflight summary, health/API gate evidence, storage manifest, backup file check, restore verification, evidence summary/schema/check, action-code catalog checks, readiness Markdown/JSON checks, handoff report checks, and final evidence manifest. It prints commands only and does not run checks, download backups, restore, or mutate the DB.
`npm run ops:evidence:defaults:check` statically checks that evidence `:file` scripts keep `--output-default-evidence` and that preflight summary aliases keep `--summary-default-evidence`, so new artifact commands continue to default under `TRAVEL_EVIDENCE_DIR`.
The evidence path preview and final manifest expose this guard in `operatorChecks` metadata because it is a command-only check, not a hashed evidence file.
Archived manifest checks fail if `operatorChecks` metadata is missing or the recorded guard command/target drifts.
The guard definitions live in `webapp/src/ops-operator-checks.js` so path preview,
final manifest generation, canonical workflow/checklist output, and archived
manifest validation share one operator-check source of truth.
When adding another command-only operator guard, update that module first, then
regenerate the path preview, final manifest, and handoff checklist artifacts
before reviewing archived manifest/readiness output.

```bash
npm run ops:preflight:offline
```

For release evidence, write a JSON summary alongside the human-readable output:

```bash
npm run ops:preflight:summary
npm run ops:preflight:offline:summary
```

The summary file records mode, start/end timestamps, pass/fail counts, skipped checks, command labels, exit codes, and elapsed milliseconds. `ops:preflight:summary` writes to `TRAVEL_EVIDENCE_DIR/preflight.json` by default, and `ops:preflight:offline:summary` writes to `TRAVEL_EVIDENCE_DIR/preflight-offline.json` by default. Use `TRAVEL_PREFLIGHT_SUMMARY_PATH=path/to/file.json npm run ops:preflight` when the evidence file needs a custom path. Parent directories are created automatically; if the summary cannot be written, preflight exits non-zero and prints `Preflight summary JSON failed`. Default summary files and `webapp/reports/preflight*.json` evidence are ignored by git; move long-lived evidence into an intentional docs/artifact location before sharing.

To check only the JSON storage file, run:

```bash
npm run storage:integrity
```

The command prints a JSON result with DB path, availability, plan count, and structural errors only. A missing DB file is acceptable when the parent directory is writable because the app can create the initial `{ "plans": [] }` template.

Before backup or handoff, capture a storage manifest without dumping travel content:

```bash
npm run storage:backup:manifest
npm run storage:backup:manifest:file
```

The manifest records DB path, byte size, SHA-256, plan count, and latest `updatedAt`. Use `TRAVEL_BACKUP_MANIFEST_PATH=reports/storage-backup-manifest.json npm run storage:backup:manifest` for a custom evidence path. Parent directories are created automatically; if the manifest cannot be written, the command exits non-zero and prints `storage backup manifest failed`. Default storage manifest files and `webapp/reports/storage-backup-manifest*.json` are ignored by git; move long-lived backup evidence into an intentional docs/artifact location before sharing.

To verify the current DB against a saved manifest, run:

```bash
npm run storage:backup:verify
```

By default this reads `webapp/storage-backup-manifest.json`, which is the output of `npm run storage:backup:manifest:file`. Use `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=reports/storage-backup-manifest.json npm run storage:backup:verify` or `node src/storage-backup-verify.js --manifest=reports/storage-backup-manifest.json` for a custom manifest. If a restored DB lives at a different path, set `TRAVEL_DB_PATH` before verifying. The verify command compares bytes, SHA-256, plan count, and latest `updatedAt` without printing travel content.

To keep the verify result as evidence, write it to a JSON file:

```bash
npm run storage:backup:verify:file
TRAVEL_BACKUP_VERIFY_PATH=reports/storage-backup-verify.json npm run storage:backup:verify
```

Generated verify evidence files are ignored by git by default, like backup manifests and full backup files.

To print the full backup/handoff command sequence without executing it, run:

```bash
npm run storage:backup:workflow
```

This shows the integrity check, manifest generation, `/api/backup` download command, backup file dry-run check, and restore verification command using the current `TRAVEL_PUBLIC_BASE_URL`, `TRAVEL_BACKUP_FILE_PATH`, `TRAVEL_BACKUP_FILE_CHECK_PATH`, `TRAVEL_BACKUP_MANIFEST_PATH`, `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH`, and `TRAVEL_BACKUP_VERIFY_PATH` settings. The printed backup download uses `api-fetch`, so `TRAVEL_ACCESS_KEY` is sent as `X-Travel-Access-Key` when configured without printing the secret value. Full backup files such as `webapp/travel-planner-backup*.json` and `webapp/reports/travel-planner-backup*.json` are ignored by git because they may contain travel content; move them only to an intentional private backup location.

To print the restore-side command sequence without mutating the active DB, run:

```bash
npm run storage:restore:workflow
```

This prints the backup file dry-run check, an explicit manual restore approval boundary, post-restore manifest verification, storage integrity, and offline preflight commands. It does not copy, overwrite, delete, or restore any DB file. Any real restore remains an external mutation that needs explicit operator approval after the backup file check passes and the target DB path is confirmed.
Unless artifact-specific `TRAVEL_BACKUP_*_PATH` overrides are set, the restore workflow resolves the backup JSON, file-check, manifest, and verify evidence under `TRAVEL_EVIDENCE_DIR` (`webapp/reports` by default).

Before exposing a LAN, tunnel, or public URL, set `TRAVEL_ACCESS_KEY` so `/api/backup` and plan APIs require `X-Travel-Access-Key`. Health and status endpoints remain accessible for liveness checks.

For protected API checks, use the access-key-aware fetch helper from `webapp/`:

```bash
npm run api:get -- /api/status
npm run api:quality-gates:health
npm run api:quality-gates:gate
npm run api:backup:file
```

The helper uses `TRAVEL_PUBLIC_BASE_URL` or `http://localhost:3000` as the base URL and automatically sends `X-Travel-Access-Key` when `TRAVEL_ACCESS_KEY` is set. It does not print the secret value. Use `TRAVEL_API_FETCH_TIMEOUT_MS` to adjust the default 5000ms timeout for slow tunnel/VPN deployments. Set `TRAVEL_API_FETCH_EVIDENCE=1` to keep the API response on stdout while writing target URL, access-key header mode, HTTP status, and elapsed milliseconds to stderr. Use `--output=path/to/file` or `npm run api:backup:file` when an API response should be saved without shell redirection. `api:backup:file` writes to `TRAVEL_BACKUP_FILE_PATH` when set, otherwise `TRAVEL_EVIDENCE_DIR/travel-planner-backup.json` (`webapp/reports/travel-planner-backup.json` by default). Output files are written only after a successful HTTP response, so a 401/500 response does not overwrite a backup file. Successful output writes use a temporary file plus rename to reduce partial-file risk; interrupted `.json.tmp-*` files are ignored by git.

Before restoring a downloaded full backup, dry-run check the file without mutating the current DB:

```bash
npm run storage:backup:file-check
TRAVEL_BACKUP_FILE_PATH=reports/travel-planner-backup.json npm run storage:backup:file-check
```

The check validates the backup envelope, version, exported timestamp, plan IDs, required plan fields, revision versions, and `latestVersion` links. It prints only backup path, bytes, SHA-256, scope, plan count, and structural errors.

To keep the backup file check result as evidence, write it to a JSON file:

```bash
npm run storage:backup:file-check:file
TRAVEL_BACKUP_FILE_CHECK_PATH=reports/storage-backup-file-check.json npm run storage:backup:file-check
```

Generated backup file check evidence is ignored by git by default.

## Compact CI evidence chain 운영 메모

- compact handoff evidence chain은 retained checksum output review artifact checksum output 단계까지 확장되어 있으며, 이후 작업은 새 suffix 추가보다 audit, deduplication, operator readability 개선을 우선한다.
- downstream reuse 전에는 각 retained artifact의 verify/check command를 먼저 사용해 begin/verified/manual/end marker와 cksum/bytes/path metadata가 남아 있는지 확인한다.
- route execution 계열 command는 계속 수동 실행 경계에 둔다. compact payload는 evidence 생성과 검증 계약을 제공하지만, 운영자는 approval/status/guard row를 먼저 확인한 뒤 실행 여부를 별도로 결정한다.
- 새 evidence suffix는 구체적인 누락 증거가 있을 때만 추가한다. 단순히 다음 layer를 반복하는 작업은 chain audit 또는 operator-facing 요약으로 대체한다.

### Compact CI evidence chain quick navigation

| Need | Use |
|---|---|
| First-pass payload check | Compact CI evidence chain audit checklist |
| Failure symptom triage | Compact CI evidence chain failure triage |
| Incident or drift record | Compact CI evidence chain audit log template |
| Term meaning or operator action | Compact CI evidence chain operator glossary |
| Reuse/release decision | Compact CI evidence chain health criteria and release gate |
| Routine operating schedule | Compact CI evidence chain audit cadence |
| Recovery after failed gate | Compact CI evidence chain repair playbook and rollback policy |
| Downstream transfer | Compact CI evidence handoff packet and template |
| Cleanup planning | Compact CI evidence chain deduplication backlog and path inventory template |

### Compact CI evidence chain change control

| Change type | Required evidence | Approval output |
|---|---|---|
| Add a new evidence suffix | Concrete missing evidence that cannot be represented by existing marker, checksum, output, review, or artifact metadata | Release approver records why README/operator guidance is insufficient |
| Modify retained artifact path metadata | Path inventory entry showing default path, env override, producing command, and verifying command | CI operator records reuse/regenerate/repair decision |
| Change verify/check command behavior | Audit log showing the current command fails a valid artifact or passes an invalid artifact | Evidence reviewer records expected marker and checksum behavior |
| Change manual route boundary | Approval/status/guard context proving route execution must move | Route execution approver records separate manual decision |
| Simplify or deduplicate suffix families | Deduplication backlog item, last healthy boundary, and rollback target | Payload author records the smallest safe change |
| Update operator docs | Conflicting guidance, missing stop condition, or unreadable handoff path | Incident owner records the doc source of truth after the edit |

### Compact CI evidence chain change request template

Use this before changing compact payload shape, retained artifact paths, verify/check behavior, or manual route boundaries.

```md
#### Compact CI evidence change request - YYYY-MM-DD
- Proposed change: <suffix/path/check/doc/manual-boundary change>
- Current boundary: <current evidence-chain boundary>
- Missing evidence or failure: <required key/marker/checksum/path/manual boundary/readability issue>
- Existing guidance checked: <quick navigation section names>
- Required evidence: <audit log/path inventory/release gate/rollback target>
- Owner: <payload author/CI operator/evidence reviewer/release approver/route execution approver/incident owner>
- Approval output: <decision and reason>
- Rollback target: <smallest payload/doc change to revert if unsafe>
- Retry condition: <what must be true before retry>
```

### Compact CI evidence chain source-of-truth hierarchy

| Priority | Source | Use when |
|---|---|---|
| 1 | Release gate and health criteria | Deciding whether downstream reuse is allowed |
| 2 | Failure triage, repair playbook, and rollback policy | A check fails or evidence must be repaired or reverted |
| 3 | Change control and change request template | Payload shape, artifact path, verify/check behavior, docs, or manual boundary may change |
| 4 | Roles and responsibilities | Ownership or approval output is unclear |
| 5 | Audit cadence, audit log, and handoff packet templates | Recording routine checks, incidents, or downstream transfer |
| 6 | Glossary, quick navigation, deduplication backlog, and path inventory template | Clarifying terms, finding guidance, or planning cleanup |

When two README sections disagree, follow the higher-priority source and update the lower-priority section before reuse or release.

### Compact CI evidence chain documentation drift checklist

- If release gate or health criteria changes, update failure triage, repair playbook, rollback policy, and handoff packet expectations in the same change.
- If change control or change request fields change, update roles and responsibilities so every approval output still has an owner.
- If retained artifact paths or env overrides change, update the path inventory template and any release gate wording that depends on path metadata.
- If manual route boundary language changes, update release gate, roles, rollback policy, and handoff packet template together.
- If a glossary term changes, update quick navigation and any template field that uses the same term.
- If README guidance changes, add a short PLAN entry and EXPERIMENTS result so future operators know which source-of-truth moved.

### Compact CI evidence chain audit checklist

- compact payload를 CI에 붙이기 전에 required-key index, self-check, full-self-check, retained artifact path metadata가 함께 있는지 확인한다.
- payload 복사 후에는 parser/self-check 계열 command를 먼저 실행하고, missing required key나 marker 누락이 나오면 downstream reuse를 중단한다.
- retained artifact 재사용 전에는 begin/verified/manual/end marker 검증을 checksum 비교보다 먼저 수행한다.
- checksum 비교는 verify command가 통과한 artifact의 cksum/bytes/path metadata끼리만 수행한다.
- check 실패 시 새 suffix를 추가해 우회하지 말고, 가장 가까운 누락 metadata를 수정하거나 handoff를 다시 생성한다.
- route execution command는 approval/status/guard row 확인 후 별도 수동 결정으로만 실행한다.

### Compact CI evidence chain failure triage

| Symptom | Stop reuse when | Next action |
|---|---|---|
| Missing required key | required-key index나 self-check가 특정 key를 누락으로 보고한다 | payload를 다시 복사하거나 가장 가까운 metadata line을 복구한다 |
| Missing marker | retained artifact verify가 begin, verified, manual, end marker 중 하나를 찾지 못한다 | artifact를 재생성하고 downstream reuse를 중단한다 |
| Checksum mismatch | 같은 artifact path인데 cksum 또는 bytes 값이 이전 handoff와 다르다 | stale cache나 새 산출물 여부를 확인하고 drift 사유를 기록한다 |
| Missing artifact path | output command는 성공했지만 path metadata가 비어 있거나 기본 파일명과 다르다 | env override 값을 확인하고 path/note/check metadata를 정리한다 |
| Manual boundary unclear | route execution command가 approval/status/guard 확인 없이 실행 경로에 섞인다 | route command를 실행하지 말고 approval row와 guarded lifecycle metadata를 먼저 확인한다 |
| Repeated suffix pressure | 실패 원인이 metadata 누락인데 새 evidence suffix 추가로 우회하려 한다 | suffix 추가를 멈추고 chain audit, deduplication, README 요약을 우선한다 |

### Compact CI evidence chain audit log template

Use this template when a compact CI evidence check fails or checksum drift is detected. Keep the log close to the CI run or incident note.

```md
#### Compact CI evidence audit - YYYY-MM-DD
- Payload source: <screen/action/source artifact>
- Boundary checked: retained checksum output review artifact checksum output
- Commands run: <parser/self-check/verify/checksum command names>
- Artifact path: <default path or env override>
- Marker result: <begin/verified/manual/end present or missing>
- Checksum result: <cksum/bytes/path comparison>
- Stop condition hit: <required key/marker/checksum/path/manual boundary/suffix pressure/none>
- Decision: <reuse/regenerate/repair/escalate>
- Retry condition: <what must change before retry>
```

### Compact CI evidence chain operator glossary

| Term | Meaning | Operator action |
|---|---|---|
| compact payload | 화면에서 복사하는 축약 handoff block | CI에 붙이기 전 required-key index와 self-check가 포함됐는지 확인한다 |
| required-key index | compact payload가 가져야 할 metadata key 목록 | missing key가 있으면 downstream reuse를 멈춘다 |
| self-check | payload 자체가 필요한 command/note/check metadata를 갖는지 확인하는 command | full-self-check보다 먼저 실행해 구조 누락을 잡는다 |
| retained artifact | review/checksum 결과를 로그 밖 파일로 남긴 evidence | 재사용 전 verify/check command로 marker와 path를 확인한다 |
| marker | begin, verified, manual, end 같은 artifact 무결성 표식 | 하나라도 없으면 artifact를 재생성한다 |
| checksum metadata | cksum, bytes, path 값으로 남기는 drift 비교 정보 | marker verify 통과 후에만 비교한다 |
| output artifact | command 출력을 별도 파일로 저장한 retained evidence | env override와 기본 파일명이 의도한 경로인지 확인한다 |
| review block | 사람이 읽기 좋게 bounded begin/end로 감싼 evidence 요약 | incident note나 audit log에 붙일 때 사용한다 |
| manual boundary | route execution을 자동화하지 않고 approval/status/guard 확인 뒤 수동 결정으로 남기는 경계 | command가 실행 경로에 섞이면 즉시 멈춘다 |
| suffix pressure | 실패를 새 evidence suffix 추가로 우회하려는 신호 | suffix 추가 대신 audit, deduplication, README 요약을 우선한다 |

### Compact CI evidence chain health criteria

| State | Criteria | Operator decision |
|---|---|---|
| Healthy | required-key index, self-check, retained artifact marker verify, and checksum metadata comparison all pass | downstream reuse is allowed after manual boundary review |
| Degraded | payload structure passes, but retained artifact path or checksum metadata is missing, stale, or mismatched | regenerate or repair evidence before reuse |
| Blocked | required key, begin/verified/manual/end marker, or manual boundary check fails | stop reuse and record an audit log entry before retry |
| Needs simplification | checks pass but operators cannot identify the current boundary or next action without reading long suffix chains | pause suffix growth and improve README summary or deduplicate metadata |
| Needs escalation | route execution appears automated or approval/status/guard rows are absent | do not execute route commands until approval context is restored |

### Compact CI evidence chain audit cadence

| When | Scope | Output |
|---|---|---|
| Every compact payload change | required-key index, self-check, full-self-check, retained artifact path metadata | record whether the payload is healthy, degraded, or blocked |
| Before downstream reuse | retained artifact marker verify, checksum metadata comparison, env override path review | record reuse/regenerate/repair decision |
| Before route execution | approval/status/guard row, guarded lifecycle metadata, manual boundary | record manual approval decision separately from evidence checks |
| After any evidence failure | failure triage row, audit log template, retry condition | stop reuse until the retry condition is met |
| Before adding a new suffix | missing evidence proof, operator readability impact, deduplication opportunity | prefer audit or README summary unless a concrete gap remains |

### Compact CI evidence chain release gate

| Gate | Pass condition | If it fails |
|---|---|---|
| Payload completeness | required-key index, self-check, and full-self-check are present and pass | regenerate the compact payload before reuse |
| Retained artifact integrity | retained artifact verify/check command confirms begin, verified, manual, and end markers | discard the artifact and rerun the nearest output command |
| Drift visibility | checksum metadata includes cksum, bytes, and path for every retained artifact being reused | record degraded state and repair checksum metadata before handoff |
| Manual execution boundary | route execution command is still separated from evidence checks and guarded by approval/status/guard rows | block route execution until manual approval context is restored |
| Operator readability | current boundary, stop condition, and retry condition are understandable from README without reading the full suffix chain | update operator docs before adding another evidence suffix |

### Compact CI evidence chain repair playbook

| Failure class | Repair first | Avoid |
|---|---|---|
| Payload metadata gap | Re-copy the compact payload, then compare required-key index against the copied block | Adding a new suffix before the existing key gap is understood |
| Retained artifact corruption | Rerun the nearest output command and then rerun the paired verify/check command | Reusing a stale artifact because checksum metadata still exists |
| Checksum drift | Confirm whether the artifact path changed, then record the old and new cksum/bytes/path in the audit log | Treating drift as healthy without a source or path explanation |
| Env override confusion | Normalize the override path, note the default path, and regenerate the affected artifact | Mixing default and override paths in one audit decision |
| Manual boundary regression | Stop route execution, restore approval/status/guard context, and record a blocked health state | Running route commands from a convenience shell history |
| Operator readability failure | Add or update README summary, glossary, or release gate notes before changing payload shape | Growing the evidence chain to explain the previous evidence chain |

### Compact CI evidence chain rollback policy

| Roll back when | Roll back target | Keep |
|---|---|---|
| A payload change removes required-key, self-check, or retained artifact metadata | The smallest payload/doc change that removed the contract | Audit log entry and failure triage note |
| A retained artifact command writes to the wrong path by default | The path/env metadata for that artifact layer | Existing healthy artifacts and checksum history |
| A verify/check command allows missing begin/verified/manual/end markers | The specific verify/check metadata line | Manual boundary and approval/status/guard guidance |
| A checksum command compares unverified artifacts | The checksum command/note/check trio for that layer | Marker verification sequence |
| A README operating note conflicts with release gate or repair playbook guidance | The newer conflicting note | The stricter stop condition |
| A suffix addition makes the current boundary unreadable without adding new evidence | The suffix addition and related docs | The last healthy boundary and audit template |

### Compact CI evidence chain roles and responsibilities

| Role | Owns | Must stop when | Output |
|---|---|---|---|
| Payload author | compact payload shape, required-key index, self-check metadata | required keys or self-check commands are missing | updated payload or documented rollback target |
| CI operator | copied payload execution, retained artifact generation, env override paths | parser/self-check or retained artifact verify fails | audit log entry and regenerate/repair decision |
| Evidence reviewer | marker order, checksum metadata, drift comparison | marker verification has not passed before checksum comparison | healthy/degraded/blocked health state |
| Release approver | downstream reuse and release gate decision | release gate is degraded, blocked, or needs escalation | explicit reuse/regenerate/repair/escalate decision |
| Route execution approver | approval/status/guard row and manual boundary | route execution is mixed into evidence checks or approval context is absent | separate manual approval decision |
| Incident owner | failure triage, repair playbook, rollback policy | retry condition is unclear or repeated suffix pressure appears | incident note with stop condition and retry condition |

### Compact CI evidence handoff packet

| Include | Why | Owner |
|---|---|---|
| Compact payload source | Lets the receiver trace which screen/action/source artifact produced the handoff | Payload author |
| Boundary checked | Prevents receivers from assuming a deeper suffix or newer evidence layer exists | Evidence reviewer |
| Health state | Summarizes healthy/degraded/blocked/needs simplification/needs escalation status | Evidence reviewer |
| Release gate result | Shows whether downstream reuse is allowed before route execution is considered | Release approver |
| Retained artifact paths | Gives CI operators exact files to regenerate, verify, or compare | CI operator |
| Marker verification result | Proves begin/verified/manual/end markers were checked before checksum comparison | Evidence reviewer |
| Checksum comparison result | Records cksum/bytes/path drift context for reused artifacts | Evidence reviewer |
| Manual route decision | Keeps route execution approval separate from evidence checks | Route execution approver |
| Retry condition | Defines what must change before a blocked/degraded handoff can be retried | Incident owner |

### Compact CI evidence handoff packet template

Copy this block when handing compact CI evidence to another operator or downstream job.

```md
#### Compact CI evidence handoff - YYYY-MM-DD
- Payload source: <screen/action/source artifact>
- Boundary checked: <current evidence-chain boundary>
- Health state: <healthy/degraded/blocked/needs simplification/needs escalation>
- Release gate result: <pass/fail and reason>
- Retained artifact paths: <paths or env overrides>
- Marker verification result: <begin/verified/manual/end status>
- Checksum comparison result: <cksum/bytes/path drift status>
- Manual route decision: <not requested/approved/rejected/blocked>
- Stop condition: <none or triage symptom>
- Retry condition: <what must change before retry>
- Owner: <payload author/CI operator/evidence reviewer/release approver/incident owner>
```

### Compact CI evidence chain deduplication backlog

| Candidate | Why it matters | Safer first action |
|---|---|---|
| Repeated suffix families | Long repeated `checksum/output/verify/review/artifact` names make boundaries hard to audit | Map current suffixes to glossary terms before renaming anything |
| Repeated retained artifact env names | Similar env override names increase wrong-path risk | Build a path inventory and mark default path versus override path |
| Repeated awk metadata checks | Copy-pasted check command structure can drift by one marker or note word | Compare check command intent before changing generated payload |
| README operator section growth | Operators may miss the release gate if guidance keeps expanding linearly | Keep release gate, repair, rollback, and handoff packet sections as the canonical path |
| PLAN/EXPERIMENTS noise | Very long layer names make progress history harder to scan | Summarize future work by operating concept rather than full suffix text |
| New suffix pressure | Adding another layer can hide a missing required key or artifact bug | Require a concrete missing-evidence proof before payload expansion |

### Compact CI evidence path inventory template

Use this before deduplicating retained artifact env names or changing default artifact paths.

```md
#### Compact CI evidence path inventory - YYYY-MM-DD
- Boundary: <current evidence-chain boundary>
- Default artifact path: <path from compact payload>
- Env override: <env var name and value>
- Producing command: <output/artifact command name>
- Verifying command: <verify/check command name>
- Expected markers: <begin/verified/manual/end or checksum markers>
- Current cksum/bytes/path: <values if available>
- Reuse decision: <reuse/regenerate/repair/rollback>
- Notes: <path collision, stale cache, or override risk>
```

## 추후 고도화 포인트

- 사용자 인증/권한 분리
- 이미지 업로드(영수증/지도 캡처), 내보내기(PDF)
- iOS용 SwiftUI/Capacitor 뷰 래핑
- Android/iOS 앱에서 현재 `/api/*` 직접 호출 인터페이스 제공

## Operations evidence quick start

Use the operations runbook for full release, handoff, and incident procedures:

```bash
cat docs/OPERATIONS-RUNBOOK.md
```

For a handoff evidence bundle, start from `webapp/` and print the canonical workflow before generating files. The printed workflow starts with effective artifact path preview commands:

```bash
cd webapp
npm run ops:evidence:workflow
```

Set `TRAVEL_EVIDENCE_DIR` to keep each handoff or incident bundle isolated:

```bash
TRAVEL_EVIDENCE_DIR=handoff/2026-06-15 npm run ops:evidence:workflow
```

The workflow prints commands only. It does not restore data, mutate Discord, unload launchd jobs, or overwrite the active DB. Artifact-specific `TRAVEL_*_PATH` variables are optional overrides; leave them blank to use `TRAVEL_EVIDENCE_DIR` as the shared root.

After you run the commands printed by the evidence workflow and complete any handoff report fields, create the final hash manifest and use the check gate later when reviewing an archived bundle:

```bash
npm run ops:evidence:manifest:file
npm run ops:evidence:manifest:check:file
npm run ops:evidence:manifest:check:schema:file
npm run ops:evidence:manifest:check:gate
```

The manifest records artifact paths, presence, byte sizes, and SHA-256 hashes without embedding evidence file contents.
Structured readiness artifacts also carry target and artifact-kind metadata in
the path preview and final manifest. The path preview table shows artifact kind,
target, validated target, and summary roles when present for the readiness
contract chain. Archived manifest checks also fail when that structured
readiness metadata is missing or changed, including `summaryRoles` drift for the
readiness JSON check-result artifact, report those artifact ids in
`metadataFailures`, and summarize failure categories in `failureKinds` and
`failureKindArtifacts`.
The path preview table includes a `Summary roles` column so reviewers can spot
the readiness JSON check-result blocking and repair summary roles before opening
the JSON payload.
It also prints a `Summary role index` section that mirrors the final manifest's
role-to-artifact-id routing view for human review.
The JSON path preview includes the same `summaryRoleArtifacts` index so
automation can inspect the role routing before final manifest generation, using
the same role-to-artifact-id shape as final evidence manifests.
Both preview and final manifest role indexes sort role keys and artifact ids so
operator diffs remain stable as new summary roles are added.
The evidence manifest check-result schema also describes
`artifacts[].expected.metadata.summaryRoles` so downstream review tools can read
the structured role drift evidence directly.
Its metadata also exposes `operatorCheckFailureFields` so dashboards can
discover command-only guard failure and detail field names without walking the
nested schema.
When changing operator-check failure fields, update the manifest check output,
manifest check-result schema, readiness propagation, checklist acceptance, and
these docs together.
Final evidence manifests include `summaryRoleArtifacts`, a role-to-artifact-id
index that lets automation route directly from `blocking-summary` or
`repair-summary` to `readinessReportJsonCheck`, `handoffReportCheck`, or
`incidentReportCheck`.
Archived manifest checks recompute that index from artifact-level
`summaryRoles`; mismatches are reported in `summaryRoleIndexFailures`, `failures`,
and the `summaryRoleIndex` failure kind.
The check-result payload includes both `summaryRoleArtifactsExpected` and
`summaryRoleArtifacts` so reviewers can compare expected and recorded role
routing without recomputing the index manually.
Each `summaryRoleIndexFailureDetails[]` entry also includes `expectedRoles` and
`recordedRoles` so missing or malformed top-level role indexes remain
diagnosable without scanning the full artifact list.
It also includes `summaryRoleIndexFailureDetails`, which pairs each role-index
failure with the expected and recorded artifact ids for that role.
Each detail also carries `expectedRoles` and `recordedRoles` so missing or
top-level role-index failures still show which role keys were expected and
recorded.
Malformed role-index values are also reported in `summaryRoleIndexFailures`
instead of being silently normalized away.
Unexpected or missing role keys are treated as mismatches even when the
corresponding artifact-id array is empty.
The readiness report includes the manifest metadata failure ids, expected and
recorded summary-role indexes, summary-role index failure ids/details,
operator-check failure ids/details, and non-zero failure kind counts for quick
human review.
Expected and recorded role indexes are rendered as stable JSON object strings so
operators can copy them directly into handoff or incident human-record fields.
The Markdown readiness report prints a `Summary role index format` line before
the expected and recorded values so the copy format is visible in the artifact.
It also prints `Summary role index failure details` so role-specific
expected/recorded artifact ids are visible without opening the manifest check
JSON.
The readiness JSON includes the same manifest metadata, expected/recorded
summary-role index, and failure-kind summaries in `manifestCheck`, and the
readiness JSON check-result diagnostics repeat those summaries in
`manifestSummaryRoleArtifactsExpected`, `manifestSummaryRoleArtifacts`,
`manifestSummaryRoleIndexFailures`, `manifestSummaryRoleIndexFailureDetails`,
`manifestOperatorCheckFailures`, `manifestOperatorCheckFailureDetails`,
`manifestFailureKinds`, and `manifestFailureKindArtifacts` plus
`recommendedActionCode` and
`recommendedAction` hints for lightweight automation triage.
The check-result schema metadata exposes `manifestDiagnosticFields` so
dashboards can discover manifest metadata, summary-role expected/recorded,
summary-role failure/detail, operator-check failure/detail, and failure-kind
field names without walking the nested diagnostics schema.
Read or parse failure diagnostics use empty `manifestSummaryRoleArtifactsExpected`,
`manifestSummaryRoleArtifacts`, `manifestSummaryRoleIndexFailures`, and
`manifestSummaryRoleIndexFailureDetails`, `manifestOperatorCheckFailures`, and
`manifestOperatorCheckFailureDetails` defaults so the check-result schema remains
stable even when the source readiness JSON cannot be loaded.
The readiness JSON checker rejects manifest check payloads that omit
`summaryRoleArtifactsExpected`, `summaryRoleArtifacts`, or
`summaryRoleIndexFailures`, keeping the source readiness JSON contract aligned
with the report schema; it also rejects missing `summaryRoleIndexFailureDetails`.
It validates each failure detail object with `failure`, `role`, `expected`,
`recorded`, `expectedRoles`, and `recordedRoles` fields so malformed per-role
or top-level role-key drift evidence is caught before
handoff.
It also validates `operatorCheckFailures` and each
`operatorCheckFailureDetails` object so command-only guard drift, duplicate
operator-check ids, or malformed `operatorChecks` entries are visible from
Markdown readiness, source readiness JSON, and readiness JSON check-result
diagnostics.
Handoff and incident human records include a `Manifest summary role index
failures` field copied from `diagnostics.manifestSummaryRoleIndexFailures`, using
`none` when the array is empty.
They also include `Manifest summary role index expected` and `Manifest summary
role index recorded` fields copied from
`diagnostics.manifestSummaryRoleArtifactsExpected` and
`diagnostics.manifestSummaryRoleArtifacts`.
They include `Manifest summary role index failure details` copied from
`diagnostics.manifestSummaryRoleIndexFailureDetails` so per-role expected and
recorded artifact ids survive into human records.
Templates and report checks list these fields in expected, recorded, failures,
then details order so reviewers compare role routing before recording failure
ids and per-role detail.
The handoff and incident templates print that copy source inline so human
records do not need separate context to preserve role-index drift evidence.
The handoff template also calls this out before final sign-off so role-index
drift evidence stays attached to the handoff record.
Template prose names expected, recorded, failure, and detail role-index evidence
so the four human-record fields are filled together.
The handoff template prose names all four diagnostics copy sources, including
`manifestSummaryRoleIndexFailureDetails`.
If expected and recorded role indexes differ or failures are not `none`, the
templates route operators through `review_manifest_failures` before final
sign-off or mutation/restore approval.
The archived evidence review workflow also tells reviewers to inspect
`diagnostics.manifestSummaryRoleIndexFailures` alongside blocking and repair
targets from `ops-readiness-report-check.json`.
It tells reviewers to copy expected/recorded role indexes and role-index
failures into the matching `Manifest summary role index ...` human-record
fields, or record `none` when the arrays or objects are empty.
The final handoff checklist expects the handoff report check to confirm that
readiness blocking, repair, and expected/recorded/failure/detail manifest
summary-role index evidence fields are present before sign-off.
It also expects the readiness JSON check-result contract step to expose
`manifestSummaryRoleArtifactsExpected`, `manifestSummaryRoleArtifacts`, and
`manifestSummaryRoleIndexFailures` plus `manifestSummaryRoleIndexFailureDetails`
for manifest role-index drift triage.
For mutation or restore decisions, the final handoff checklist mutation guard
also expects incident records to carry expected/recorded/failure/detail manifest
summary-role index evidence.
The incident template calls this out in current evidence so role-index drift is
recorded before mutation or restore approval.
The source readiness JSON also includes `recommendedActionCode` and
`recommendedAction` for consumers that read the readiness artifact before
producing a check-result artifact.
The action code is schema-constrained to a finite enum for stable automation
branching. `regenerate_readiness_json` is reserved for check-result diagnostics,
not valid source readiness JSON.
Source readiness JSON action codes are `review_metadata_drift`,
`review_manifest_failures`, `resolve_blocking_checks`,
`capture_missing_evidence`, `complete_operator_review`,
`ready_for_automation`, and `review_readiness_payload`; check-result
diagnostics may additionally use `regenerate_readiness_json`.
Use `review_metadata_drift` for non-empty `metadataFailures`. Use
`review_manifest_failures` for manifest hash, presence, failure-kind, and
summary-role index or operator-check drift, including `summaryRoleIndexFailures`
and `operatorCheckFailures`.
Readiness recommended-action selection checks `summaryRoleIndexFailures`
and `operatorCheckFailures` directly before falling back to aggregate
failure-kind counts.
The checker rejects source readiness JSON where `recommendedActionCode` and
`recommendedAction` disagree.
The schema metadata includes action-code labels for dashboard or alert rendering.
The readiness JSON check-result schema metadata includes `metadataVersion: 1`
so dashboard consumers can detect future header-shape changes separately from
the check-result payload `schemaVersion`.
Keep `metadataVersion` stable for additive discovery fields that preserve
existing metadata keys and meanings; bump it when metadata keys are renamed,
removed, nested differently, or change meaning for dashboard consumers.
The current discovery bundles, including source paths, readiness summaries,
manifest diagnostics, compact targets, repair diagnostics, duplicate
diagnostics, and rejected-field projections, are additive under
`metadataVersion: 1` because they do not rename or reinterpret existing metadata
keys.
After changing check-result schema metadata, regenerate the check-result schema
artifact with `npm run ops:readiness:report:json:check:schema:file`, then inspect
the generated metadata header before dashboard consumers depend on the new
discovery fields.
It also exposes `recommendedActionFields` so dashboards can discover the
recommended action code/text payload fields beside the shared action-code label
map.
`npm run ops:readiness:action-codes:file` writes the same source and
diagnostic-only action-code catalog as a standalone artifact.
`npm run ops:readiness:action-codes:schema:file` writes the matching catalog
schema artifact for consumers that validate the catalog separately.
`npm run ops:readiness:action-codes:check:gate` fails when that catalog drifts
from the readiness action-code contract.
The catalog generator, schemas, readiness report, JSON contract checker, and
catalog checker read from the same action-code contract module so code/label
updates do not rely on duplicated constants.
`npm run ops:readiness:action-codes:check:schema:file` writes the matching
check-result schema for archived catalog check payloads, including failure
diagnostics for malformed catalogs.
The readiness report and strict readiness gate consume the action-code catalog
check result, so catalog drift blocks final automation readiness.
The readiness JSON contract checker also treats `actionCodesCheck` as a blocking
check, keeping report semantics and JSON gate semantics aligned.
The action-code catalog check is required for final automation readiness; a
missing or malformed check result is treated as `not_ready`.
Malformed readiness JSON that omits `actionCodesCheck` is also diagnosed as a
blocking readiness condition.
The `resolve_blocking_checks` action label covers failed or missing blocking
checks.
Generate the action-code catalog check before readiness reports so each report
captures the latest catalog drift result.
Final handoff and drift-acceptance incident checks require the action-code
catalog and catalog-check evidence fields so human records preserve the same
automation contract chain.
Handoff and incident report check-result schema artifacts describe the JSON
payloads that readiness automation consumes.
The evidence summary schema describes the required evidence and manual evidence
summary payload consumed by readiness reports.
Command-only guardrails such as `ops:evidence:defaults:check` stay in path
preview/final manifest `operatorChecks` metadata and are not required file
artifacts in the evidence summary.
The evidence summary check verifies that summary status, strict failures, and
missing/manual evidence lists match the captured artifact rows.
The evidence summary check-result schema documents that semantic check payload.
Readiness reports and JSON contract checks treat a missing, malformed, or failed
evidence summary check as a blocking readiness condition.
Structured readiness check payloads preserve source paths such as `summaryPath`
and `catalogPath` so failed required checks can be traced to the exact artifact.
Readiness JSON check diagnostics repeat those source paths in `checkSourcePaths`
and the check-result schema metadata exposes `sourcePathFields` so dashboards can
discover the diagnostics object plus evidence summary and action-code source path
keys from the schema header.
The check-result schema metadata also exposes `readinessSummaryFields` so
dashboards can discover the top-level readiness, evidence summary status/ok,
blocking check list, check status map, and check blocking-state map from the
schema header.
It also exposes `readinessValues`, the runtime-accepted top-level readiness
status values, from the same shared readiness action-code contract module used
by the JSON checker.
The check-result schema metadata also exposes `checkResultStatusValues`, the
checker-emitted `status` vocabulary, from that shared contract so dashboards do
not hard-code `ok`/`failed` separately from the runtime output.
The same shared contract owns the readiness report target, check-result target,
check-result artifact name, check-result `schemaVersion`, and metadata version
so runtime validation, checker output, and schema metadata do not drift.
The check-result schema `$id` and title also live in that contract so generated
schema identity stays aligned with the artifact identity constants.
The top-level check-result field names and required field list are exposed as
`checkResultFields` and `checkResultRequiredFields` in schema metadata from the
same shared contract.
The nested `diagnostics` field names and required diagnostics list are exposed as
`checkResultDiagnosticFields` and `checkResultRequiredDiagnosticFields` from that
contract too, so runtime diagnostics and schema validation use the same key set.
`checkRepairDiagnosticKeys` exposes the handoff/incident check keys that receive
repair diagnostics, and runtime repair diagnostics plus repair target schema
enums derive from that same key list.
`checkRepairDiagnosticFields` and `checkRepairDiagnosticRequiredFields` expose
the internal repair diagnostic object shape, and runtime repair diagnostics plus
schema validation derive from that same field contract.
`repairTargetFields` and `repairTargetRequiredFields` expose the repair target
object shape, while runtime repair target output, compact target metadata, and
schema validation derive from that same field contract.
`blockingTargetFields` and `blockingTargetRequiredFields` expose the blocking
target object shape, while runtime blocking target output, compact target
metadata, and schema validation derive from that same field contract.
`checkBlockingStateFields` and `checkBlockingStateRequiredFields` expose the
per-check blocking state object shape that feeds blocking target generation.
Schema consistency helpers for blocking and repair reason labels/counts also use
those shared field contracts instead of local field-name literals.
Blocking target reason consistency has its own schema helper pair, so compact
blocking targets use `blockingTargetFields` instead of borrowing the per-check
blocking state field contract.
`duplicateDiagnosticFields` is also backed by the shared readiness contract, so
the duplicate diagnostics object, derived count, and paired repair reason stay
aligned with repair diagnostic field contracts.
`rejectedFieldProjectionFields` is backed by the shared readiness contract too,
with the source `fields` boundary preserved and derived rejected-field names
aligned to repair diagnostic and repair target field contracts.
The human-evidence helper owns rejected-field item and reason-entry field
contracts, and the readiness check-result schema uses those contracts for
`rejectedFields[]` plus `rejectedFieldReasonEntries[]`.
The readiness JSON checker also uses those helper-owned source/rejected
field-name contracts when validating source `fields[]`, detecting duplicates,
and comparing derived rejected-field projections.
The helper also owns `sourceCheckPayloadFields`, including the source check-result
`fields` array name that `rejectedFieldProjectionFields.fields` points to.
The readiness JSON checker uses that same `sourceCheckPayloadFields.fields`
contract when validating source field metadata and building repair diagnostics.
The same source payload contract also names `fieldMetadataAvailable` and the
source rejected-field projection fields consumed by readiness validation.
It also owns the source repair input fields `statusGuidance`, `errorsBySection`,
and `missingFieldsBySection`, which the checker uses for validation and repair
diagnostic generation.
Source check state fields such as `configured`, `present`, `path`, `status`, and
`blocksReadiness` also live in `sourceCheckPayloadFields` and feed validation,
blocking state derivation, and repair target routing.
Duplicate diagnostics also read source rejected-field projections through
`sourceCheckPayloadFields`, keeping duplicate repair checks aligned with the
same source payload boundary.
The schema metadata exposes `sourceCheckFieldFields` and
`sourceCheckFieldRequiredFields` so dashboards can discover the source `fields[]`
contract beside the derived rejected-field item contracts.
It also exposes `sourceCheckFieldReasonValues` for the broader source
field-state reason contract and `sourceCheckPayloadRequiredFields` for the
payload-level required field list.
The readiness JSON checker uses that same payload required-field list for
missing-field diagnostics before type-specific validation.
`fields[].reason` vocabulary before the rejected-field projection narrows that
set to rejected reasons.
It also exposes `rejectedFieldReasonProjectionFields` so dashboards can discover
the reason-count map, reason-entry array, and reason-entry item fields as one
projection bundle.
The schema metadata also exposes `rejectedFieldItemFields`,
`rejectedFieldRequiredFields`, `rejectedFieldReasonEntryFields`, and
`rejectedFieldReasonEntryRequiredFields` from those helper-owned contracts.
It also exposes `readinessCheckKeys` and `requiredPresentCheckKeys` so dashboards
can discover the standard readiness check set and the checks that must be present
without extracting required keys from nested schema objects.
Runtime check generation and check-result schema metadata now read those check
key lists from the same shared readiness action-code contract module.
Runtime `checkSourcePaths` generation and check-result schema metadata also read
the source-path check key list from that shared contract module.
The source path selector fields also live in that shared contract, with
`sourcePathSourceFields` exposing source payload fields such as `summaryPath` and
`catalogPath` in schema metadata.
When adding a readiness check key, update the shared check key contract,
required-present set, source path metadata, schema consumers, and workflow
guidance together.
Appending a new check key is additive only when existing check keys and
required-present meanings stay stable; renaming, removing, reclassifying
required-present behavior, or changing an existing check key's meaning requires
a `metadataVersion` bump.
for automation that consumes only the check-result payload.
Evidence path previews and manifest checks also track the handoff and incident
check-result target metadata so registry drift is visible before automation
consumes stale check payloads.
The evidence manifest check-result schema describes the archived hash review
payload consumed by readiness reports.
The Markdown readiness report shows the same recommended action for human
reviewers.
Handoff and incident report templates include placeholders for the readiness
recommended action code and text so final human records can cite the same next
step.
The handoff report check requires those readiness action fields, and
incident-report checks require them when run with
`-- --require-drift-acceptance`. The checks also reject unknown action codes or
code/text pairs that do not match the readiness action contract.
Those checks reuse the shared readiness action-code contract module, and the
handoff report check reads `Status` only from the report header while reading
readiness/sign-off fields from their named sections.
The handoff report check-result schema exposes each required field's `scope`
as `header` or `section` so automation can distinguish repeated labels in human
reports.
The handoff report check-result also includes `statusField.guidance`, which
tells operators to replace `draft` with `ready` or `signed-off` before final
manifest generation.
Handoff check failures are also grouped in `errorsBySection` so dashboards can
show whether a failure belongs to the header, readiness decision, sign-off, or
drift-acceptance section.
Incident check failures use the same `errorsBySection` pattern for the header,
follow-up, drift-acceptance, and current-evidence sections.
Incident check results also include `statusField.guidance`, which tells
operators to replace `investigating` with `monitoring`, `mitigated`, `resolved`,
or `closed` before final incident review.
Handoff and incident check results also expose `missingFieldsBySection` so
dashboards can show the exact human-report fields that need values without
parsing error-code strings.
Their field lists also expose `accepted` and `reason` so dashboards can
distinguish accepted values from missing placeholders or malformed summary-role
index evidence.
The source handoff and incident check results also expose `rejectedFields` and
`rejectedFieldCount` so repair dashboards can summarize malformed human records
before opening readiness aggregation. These keys are present even on report
read failures, using empty rejected-field defaults.
The check-result schema metadata exposes the rejected-field reason vocabulary
and `rejectedFieldProjectionFields` so dashboards can discover the canonical
field-to-rejected-field projection bundle from the schema header.
In that metadata, `fields` names the source handoff or incident check-result
field array, while the rejected-field entries name the derived readiness
aggregation projections exposed through check repair diagnostics and repair
targets.
Readiness reports preserve those field lists in the handoff and incident check
payloads and print rejected field, reason-count, and reason-entry summaries in
Markdown for quick repair triage.
Markdown summaries are recalculated from canonical `fields` metadata instead of
trusting recorded derived summaries.
Canonical `fields` arrays reject exact duplicate field records in schemas and
readiness JSON checks before rejected-field projections are compared.
Schema descriptions for `fields` state the same exact duplicate field-record
guard beside the empty-array metadata semantics.
Markdown reason summaries use the same sorted reason-entry projection so human
diffs remain stable.
Duplicate readiness JSON diagnostics such as `duplicate-*-fields`,
`duplicate-*-rejectedFields`, or `duplicate-*-rejectedFieldReasonEntries` mean
operators should regenerate or repair the canonical human-evidence field
metadata and its derived projections instead of hand-editing only one summary.
Readiness JSON check diagnostics and repair targets expose
`duplicateFieldDiagnostics` booleans for canonical fields, rejected fields, and
reason-entry projections so dashboards can badge duplicate repair causes without
parsing raw error strings.
The check-result schema metadata exposes `duplicateDiagnosticKeys` and
`duplicateDiagnosticFields` so dashboards can discover the duplicate diagnostic
boolean object, count field, and paired repair reason from the schema header.
The `duplicateFieldDiagnostics` schema also documents the all-false object as
its empty default.
Its object-level description links that default to
`duplicateFieldDiagnosticCount: 0` and positive flags to the
`duplicate-human-evidence` repair reason.
The paired `duplicateFieldDiagnosticCount` empty default is `0`, representing
the same no-duplicate state.
Schema descriptions for the count field also state that `0` pairs with the
all-false duplicate diagnostics default.
They also expose `duplicateFieldDiagnosticCount` as the derived count of true
duplicate flags so dashboards can sort or filter duplicate repair targets
without counting nested booleans.
Repair targets also add the `duplicate-human-evidence` reason when any
duplicate diagnostic is true, so routing filters can prioritize duplicate field
metadata repairs without parsing nested booleans.
For repair targets, a positive `duplicateFieldDiagnosticCount` corresponds to
the same `duplicate-human-evidence` routing reason.
Reviewers should treat that count and reason as a paired duplicate repair
signal.
Schema descriptions distinguish the diagnostic count summary from the repair
target count that pairs with the `duplicate-human-evidence` reason.
Operators should read a zero duplicate count as no duplicate metadata repair
cause, and a positive count as the same repair cause represented by
`duplicate-human-evidence`.
The readiness JSON check-result schema also constrains
`duplicateFieldDiagnosticCount` to match the true-value count in
`duplicateFieldDiagnostics`.
When adding a duplicate diagnostic flag, update the shared readiness contract
key list, then confirm the generated count maximum, flag/count consistency
cases, and workflow guidance still describe the expanded key set.
Runtime duplicate diagnostic presence and count helpers share one local key list
so new duplicate flags have a single generator-side expansion point.
Runtime duplicate diagnostic payload construction also uses that key list, so
the emitted boolean object shape has the same generator-side source.
Schema duplicate diagnostic required keys, defaults, boolean properties, and
count consistency cases also share one local key list.
Runtime and schema duplicate diagnostic key lists now share the readiness
action-code contract module, so duplicate-flag changes start from that shared
source.
The duplicate count schema maximum is derived from that same key list.
Duplicate flag/count consistency cases are generated from the same key list
rather than hand-enumerated.
Repair target schema validation also constrains that count/reason pair:
`duplicateFieldDiagnosticCount: 0` rejects `duplicate-human-evidence`, while a
positive count requires that reason.
The repair target `reasons` schema description states the same paired contract.
Repair target `reasons` also reject exact duplicate reason strings so routing
lists remain canonical.
Repair target `reasons` are also bounded to the known routing reason vocabulary
size so hand-edited oversize reason lists fail schema validation.
The repair target reason enum and bound derive from the shared readiness
action-code contract export so future reason additions do not silently
desynchronize the enum and `maxItems`.
Runtime repair target reason generation also imports the shared contract values
instead of scattering string literals, preserving the emitted reason values
while reducing local drift in the generator.
Repair target reason labels also live in that shared contract module, and schema
validation constrains `reasonLabels` to those labels while requiring label keys
to match `reasons`.
When adding a repair target reason, update the shared contract export, label
map, enum/bound consumers, and workflow guidance together.
Runtime and schema repair reason constants now share the readiness action-code
contract module, so reason-vocabulary changes start from that shared source.
The readiness action-code contract module intentionally also carries this
check-result routing vocabulary because action routing, repair target reasons,
and duplicate repair diagnostics are maintained together for the handoff gate.
Reason-entry ordering follows the helper-owned rejected-field reason enum order,
with lexical fallback only for unknown reasons that validation should reject.
Rejected field counts are constrained to non-negative integers so zero rejected
fields remains valid. Present rejected-field reason-count map values and
reason-entry counts are constrained to positive integers in schemas and
readiness JSON checks, matching the shared reason projection helpers.
Reason-entry arrays are bounded to the known rejected-field reason vocabulary
size in schemas, while the readiness JSON check verifies the exact canonical
projection so duplicate or stale entries cannot pass the gate.
Schemas also reject exact duplicate reason-entry objects before the readiness
JSON check rejects duplicate reason entries and performs the deeper projection
comparison.
Reason-count maps are likewise bounded to the known rejected-field reason
vocabulary size, keeping those maps aligned with the same canonical projection
contract.
Rejected-field arrays reject exact duplicate objects in schemas and readiness
JSON checks before derived reason summaries are compared.
Schema descriptions for `rejectedFields` state that exact duplicate
rejected-field objects are rejected.
Schema descriptions for `rejectedFieldReasonEntries` state the canonical
reason ordering, vocabulary bound, exact-duplicate guard, and positive-integer
entry filtering.
Reason-count accumulation uses a prototype-safe dictionary before returning a
plain JSON object, so invalid reason strings remain validation failures without
mutating object prototypes.
Malformed rejected-field entries are ignored by the helper-level reason-count
projection instead of throwing; schema and readiness checks remain responsible
for rejecting malformed payloads.
Entries with non-string reasons are also skipped by helper-level projection so
invalid reason metadata does not become an accidental count key.
The rejected-field projection helper emits only false-accepted field entries
with string labels/reasons and nullable string section/scope metadata; malformed
payloads are still rejected by schemas and readiness checks.
Schemas mark `fields` as the canonical repair metadata source so projection
guards cannot be mistaken for payload acceptance.
Reason-entry projection emits only helper-known rejected-field reasons; unknown
reasons remain schema/readiness-check failures instead of rendered entries.
Repair target section and missing-field counts use the same non-negative
integer contract.
The readiness report JSON check payloads also expose `rejectedFields` and
`rejectedFieldCount` plus `rejectedFieldReasons` beside each handoff or
incident check so dashboards can render repair counts without scanning the raw
`fields` array.
The readiness JSON check verifies that `rejectedFields` matches the non-accepted
entries from `fields`, catching stale or manually edited repair summaries.
It also verifies that `rejectedFieldReasons` is the exact reason-count
projection of `rejectedFields`.
Source checks, readiness aggregation, and readiness JSON diagnostics use the
same human-evidence helper for `fields` to `rejectedFields` to
`rejectedFieldReasons` to `rejectedFieldReasonEntries` projection so those
repair summaries do not drift.
The same helper also owns the accepted field-reason and rejected-field-reason
vocabularies used by readiness JSON checks.
Schema generators reuse that helper-owned vocabulary as well; the helper-owned
reason value arrays are the canonical enum source, the handoff schema uses
narrower arrays that exclude the incident-only `disallowed-placeholder` reason,
and validators use helper-owned sets derived from those arrays for membership
checks.
Schemas describe `rejectedFields` and `rejectedFieldReasons` as derived
summaries, with `fields` remaining the canonical source for repair metadata.
Schemas also annotate empty defaults for these derived summaries:
`fields: []`, `rejectedFields: []`, `rejectedFieldCount: 0`,
`rejectedFieldReasons: {}`, and `rejectedFieldReasonEntries: []`.
Source check read failures emit the same empty `fields` default so consumers can
read the canonical repair source without branching on file-read errors.
When `fields` is empty, consumers should treat field-level repair metadata as
unavailable rather than infer accepted human evidence.
The `fieldMetadataAvailable` boolean makes that distinction explicit; it is
`false` for read-failed, not-configured, and not-found style payloads and is
repeated in readiness JSON check diagnostics plus repair targets.
Diagnostics fallback also derives availability from canonical `fields.length`
rather than from rejected-field presence.
Schemas describe `fieldMetadataAvailable` as matching whether canonical
`fields` is non-empty, and the readiness JSON check enforces that consistency.
Source handoff, incident, and readiness aggregate check-result schemas also
encode that consistency with conditional `fields` length constraints.
Schemas describe `rejectedFieldCount` as `rejectedFields.length` so count
consumers can treat it as a derived summary, not an independent source.
The `fields` array remains the canonical source for rejected-field projection;
missing `present`, `accepted`, or `reason` metadata is preserved as invalid
shape for the readiness JSON check instead of being silently coerced.
Readiness schemas and checks constrain field reasons to `accepted`, `missing`,
`disallowed-placeholder`, or `invalid-summary-role-evidence-shape`, while
rejected-field projections exclude `accepted`.
The readiness JSON check also repeats rejected fields in
`checkRepairDiagnostics` and `repairTargets`, including reason counts, so
automation can route malformed human evidence without parsing raw field arrays.
Those malformed or duplicate human-evidence repairs stay under the existing
`resolve_blocking_checks` action code rather than adding a new action code.
Evidence path previews and final manifests label the handoff and incident
report check-result artifacts as repair summaries because those payloads include
status guidance, section errors, and missing-field summaries.

For archived bundle review, print the review workflow before running checks:

```bash
npm run ops:evidence:review:workflow
```

The review workflow includes manifest integrity checks, handoff report
completeness checks, incident report checks for incident-driven reviews, a
normal handoff readiness refresh, and a separate incident-driven readiness
refresh that includes incident check results. It also writes a companion
readiness JSON artifact for automation.
The workflow index lists the handoff and incident report check-result schema
commands in the Evidence review section so archived review operators can find
the machine-readable check contracts without switching to the release workflow.
In the release/handoff workflow index, the handoff report check-result schema
command is listed next to the handoff report check command so the final manifest
captures the completed human report and the matching check contract together.
The evidence workflow reminds operators to repair handoff
`statusField.guidance` and `errorsBySection` findings before generating the
final content-free manifest.
Structured readiness check payloads also pass through human-report
`statusField.guidance`, `errorsBySection`, and `missingFieldsBySection`
diagnostics so readiness consumers can show handoff or incident repair fields
without opening the original check artifact.
Missing structured check payloads now carry explicit `check-not-found` errors,
and required-but-not-configured check payloads carry `check-not-configured`, so
readiness consumers can distinguish absent inputs from optional disabled checks.
Configured-but-missing check artifacts always set `blocksReadiness: true`; an
optional check is considered disabled only when no check path is configured.
The readiness JSON schema requires `blocksReadiness` on each structured check
payload because readiness routing should not infer blocking behavior from status
strings alone.
The readiness JSON contract checker also validates `blocksReadiness` as a
boolean on every structured check payload.
It also rejects inconsistent blocking flags, including non-`ok` required checks
or configured-but-missing checks marked non-blocking, and optional disabled
checks marked blocking.
Readiness JSON check-result diagnostics repeat each check's configured,
present, status, and `blocksReadiness` state in `checkBlockingStates` so
dashboards can explain blocking behavior without reopening the source readiness
JSON.
Each blocking state also includes `blockingReasons` so dashboards can explain
whether a check is blocking because it is required and non-`ok`, configured but
missing, disabled yet marked blocking, or explicitly blocking.
Blocking states and blocking targets also include `blockingReasonLabels`, human-readable
labels keyed by the same blocking reason codes, so dashboards can render
blocking routing without carrying a separate label table.
When `blockingReasons` is empty, `blockingReasonLabels` is the empty object, and
the schema documents `blockingReasons: []` plus that empty object as the default
no-blocking-reason label state.
`blockingReasonCount` is derived from `blockingReasons.length` so dashboards can
sort or badge blocking targets without recounting the reason array.
The blocking reason count maximum and consistency cases derive from the shared
blocking reason vocabulary length, not from a hand-maintained numeric limit.
Blocking reason values and labels come from the shared readiness action-code
contract module, and schema validation constrains label keys to match
`blockingReasons`.
The check-result schema metadata also exposes the blocking reason code list and
label map together so dashboards can render blocking routing without walking
nested enum definitions.
It also exposes `reasonRoutingFields.blocking` so dashboards can discover the
blocking reason code, count, and label field names as one bundle.
The metadata keeps these reason code and label maps flat beside action-code
metadata because dashboard consumers read the schema header first; if the
readiness reason surface grows beyond blocking and repair routing, move these
fields into a nested reason-contract metadata object.
When adding a blocking reason, update the shared contract export, label map,
enum/bound consumers, and workflow guidance together.
The diagnostics also expose `blockingTargets`, a compact list of checks that
currently block readiness with status, path, and reason codes.
The check-result schema metadata exposes `compactTargetFields.blocking` so
dashboards can discover the blocking target identity, source path, state, reason
count, and label fields without walking the nested target schema.
The readiness JSON contract checker validates those repair fields and repeats
handoff/incident repair summaries in `checkRepairDiagnostics` for automation
that consumes only the check-result payload.
The check-result schema metadata also exposes `checkRepairDiagnosticFields` so
dashboards can discover the repair diagnostic status, section, missing-field,
rejected-field, and duplicate-diagnostic bundle from the schema header.
It also adds `repairTargets`, a compact list of configured handoff or incident
checks that are not `ok` or currently expose section-level errors or missing
field summaries.
The check-result schema metadata exposes `compactTargetFields.repair` so
dashboards can discover the repair target identity, source path, reason,
count, label, guidance, and repair-count fields without walking the nested
target schema.
Each repair target includes the check status and readiness check payload path so
dashboards can route operators to the source check-result artifact.
Repair targets also include `errorSectionCount` and `missingFieldCount` so
dashboards can sort or badge human-report repairs without recalculating nested
diagnostics.
Each repair target includes `reasons` such as `status-not-ok`, `section-errors`,
or `missing-fields` so dashboards can explain why the target is present without
recomputing inclusion rules.
Each repair target also includes `reasonLabels`, human-readable labels keyed by
the same reason codes, so dashboards can render repair routing without carrying
a separate label table.
When `reasons` is empty, `reasonLabels` is the empty object, and the schema
documents `reasons: []` plus that empty object as the default
no-repair-reason label state.
`reasonCount` is derived from `reasons.length` so dashboards can sort or badge
repair targets without recounting the reason array.
The repair reason count maximum and consistency cases derive from the shared
repair reason vocabulary length, not from a hand-maintained numeric limit.
The check-result schema metadata also exposes the repair target reason code list
and label map together so dashboards can render repair routing without walking
nested enum definitions.
It also exposes `reasonRoutingFields.repairTarget` so dashboards can discover
the repair reason code, count, and label field names as one bundle.
Keep repair reason metadata flat beside blocking reason metadata until the
schema header becomes too wide for dashboard consumers; then migrate both reason
surfaces together into a nested reason-contract metadata object.
Evidence path previews and final manifests label
`ops-readiness-report-check.json` as the readiness JSON check, blocking summary,
and repair summary so the bundle index surfaces the routing role of
`blockingTargets` and `repairTargets`.
The handoff checklist acceptance for `ops-readiness-report-check.json` also
requires repair target status/path routing, reasons, repair counts, and
`missingFieldsBySection` when human-report repair is needed.
It also requires the artifact to be indexed as the readiness JSON check,
blocking summary, and repair summary in evidence path previews and final
manifests with matching `summaryRoles` metadata.
It also requires `blockingTargets` status/path/reason/label routing when
readiness is blocked.
The handoff checklist also expects `handoff-report-check.json` repairs to be
visible through `statusField.guidance`, `errorsBySection`, or
`missingFieldsBySection`, with `fields[].accepted` and `fields[].reason`
explaining malformed copied evidence and required sign-off plus readiness
blocking and repair evidence fields present.
The evidence review workflow notes tell archived review operators to inspect
`blockingTargets`, `repairTargets`, and `checkRepairDiagnostics`
`fieldMetadataAvailable` plus rejected fields, reason counts, and reason-count
entries in `ops-readiness-report-check.json`, then repair the listed source
check paths or malformed human-record fields before accepting readiness.
The same note points operators at repair reasons and count fields so final human
records preserve both routing and prioritization evidence.
If either compact target array is empty, operators should record `none` in the
handoff or incident report target fields instead of leaving them blank.
Incident-driven drift-acceptance reports include current-evidence fields for
readiness repair targets and their source check paths, and the incident report
check requires those fields when `-- --require-drift-acceptance` is used.
Normal handoff reports include the same readiness repair targets and source
check paths in the `Readiness decision` section, and the handoff report check
requires those fields before final handoff.
The handoff and incident templates tell operators to copy `repairTargets` and
their `reasons` and `path` values from `ops-readiness-report-check.json`, using
`none` when the compact target array is empty.
They also tell operators to copy `blockingTargets` and their
`blockingReasons`/`blockingReasonLabels`, using `none` when no readiness checks
currently block readiness.

If manifest drift is accepted after review, generate a handoff report for normal
handoffs or an incident report for incident-driven reviews, then fill the
`Evidence drift acceptance` section before proceeding.
The normal handoff and incident-driven drift acceptance branches are
alternatives; run only the branch that matches the current review.
The normal handoff readiness refresh intentionally omits
`TRAVEL_INCIDENT_REPORT_CHECK_PATH`; only the incident-driven refresh passes an
incident report check path, so stale incident check artifacts do not block an
ordinary archived handoff review.
Run the selected report check with `-- --require-drift-acceptance` when drift is
accepted so artifact ids, approver, reason, time, and follow-up owner are
checked before the readiness refresh.
The readiness report shows `Drift acceptance required: yes/no` for handoff and
incident report checks so accepted-drift record gaps are distinguishable from
ordinary incomplete report fields.

For incident-driven reviews, run the incident report check before finalizing the
review bundle. A failed incident report check is also reflected in the review
readiness report when you use the incident-driven readiness refresh:

```bash
npm run ops:incident:report:check:file
npm run ops:incident:report:check:gate
npm run ops:incident:report:check:gate -- --require-drift-acceptance
npm run ops:readiness:action-codes:file
npm run ops:readiness:action-codes:schema:file
npm run ops:readiness:action-codes:check:file
npm run ops:readiness:action-codes:check:schema:file
npm run ops:readiness:action-codes:check:gate
npm run ops:readiness:report:json:file
npm run ops:readiness:report:json:schema:file
npm run ops:readiness:report:json:check:schema:file
npm run ops:readiness:report:json:check:gate
```

The JSON check validates both shape and readiness consistency, so automation can
fail fast if a payload says `ready` while summary evidence is incomplete or a
check result blocks readiness. The check output includes diagnostics for the
readiness decision, summary status, blocking check ids, and
`target: readiness-report-json`. Use the check schema artifact when downstream
automation consumes that check output directly.
The readiness JSON payload also includes `target: readiness-report-json` for the
same routing purpose.
The readiness JSON schema and check-result schema include metadata that maps
each schema to its target artifact, so downstream automation can route contracts
without relying only on file names.
### iOS install first-run launch gate

The `/install.html` first-run card now gives iPhone users a direct launch gate after opening the Home Screen Travel icon: save install proof, move to the Mac final gate, then start the first plan from `/#planForm`.

Install-start JSON/text evidence also preserves `postInstallAppHomeUrl` and `postInstallNewPlanUrl`; next-action and ops readiness surfaces keep those fields so the first-use links survive before-phone handoff snapshots.

The generated iOS install handoff note repeats the same post-install app home and new-plan URLs so a standalone Markdown handoff is enough to resume first use after Home Screen launch proof is saved.

`npm run ios:install:handoff:check` verifies the generated handoff note still includes the proof-save URL, `/#iosHomeDock`, and `/#planForm`; `npm run ios:install:handoff:evidence` regenerates the note and writes the check result together.

The pre-phone evidence chain includes `ios:install:handoff:evidence`, and ops evidence path discovery lists both the generated handoff Markdown and its check-result artifact.

Ops evidence summary and readiness report output preserve the handoff-check status, issue count, proof-save URL, post-install app-home URL, and post-install new-plan URL so first-use handoff drift is visible from the main install readiness surfaces.

The handoff check-result contract is archived by `npm run ios:install:handoff:check:schema:file`, and `npm run ios:install:handoff:evidence` now writes the Markdown handoff, check result, and check-result schema together.

The iOS install runbook prepare phase includes `npm run ios:install:handoff:evidence`, and the runbook checker requires that command so human runbooks and preinstall automation both generate and check the first-use handoff note.

The iOS install next-action JSON/text command output exposes `handoffEvidenceCommand` and `handoffEvidenceTerminalCommand`, so Mac-side handoff evidence generation is visible from the same next-action surface as before-phone and final-gate commands.

The `/install.html` handoff strip also exposes a `handoff evidence 복사` button that copies the paste-ready `npm run ios:install:handoff:evidence` command beside the before-phone and final preflight buttons.

Like the other early handoff controls, the handoff evidence copy action hides once the iPhone is in standalone/proof flow so the page foregrounds proof save, final gate, and first-plan actions.

The structured `/api/ios-install-session` and text session handoff include `handoffEvidence` and `handoffEvidenceTerminal`, and the install-session schema/checker require the npm handoff evidence command.

Ops evidence summary and readiness report output also preserve the session check's `handoffEvidenceCommand` as `sessionRecoveryHandoffEvidenceCommand`, keeping the session-level handoff evidence command visible in readiness surfaces.

The session check result now also preserves `handoffEvidenceTerminalCommand`, and ops summary/readiness report expose it as `sessionRecoveryHandoffEvidenceTerminalCommand` for paste-ready Mac execution.

The install-session schema and checker require `handoffEvidenceTerminal`, so structured session handoffs cannot silently drop the paste-ready Mac handoff evidence command.

The install-session check-result schema is archived by `npm run ios:install:session:check:schema:file`, and `npm run ios:install:session:evidence` now writes the session schema, session check result, and check-result schema together.

The iOS install next-action JSON/text command output exposes `sessionCheckSchemaCommand` and `sessionCheckSchemaTerminalCommand`, so the session check-result schema artifact command is discoverable beside the other Mac-side install commands.

The `/install.html` handoff strip exposes a `session schema 복사` button for the paste-ready `npm run ios:install:session:check:schema:file` command and hides it with the other pre-phone controls once standalone/proof flow starts.

The same handoff strip exposes a `session evidence 복사` button for the paste-ready `npm run ios:install:session:evidence` command, covering session schema, session check result, and session check-result schema generation in one copy action.

The iOS install next-action text output also prints `sessionEvidenceCommand` and `sessionEvidenceTerminalCommand`, matching the visible install-page session evidence CTA.

The structured `/api/ios-install-session`, text session handoff, install-session schema/checker, session check-result schema, ops evidence summary, and readiness report now preserve `sessionEvidence`/`sessionEvidenceTerminal` alongside the handoff evidence commands.

`/api/install-info.txt` also prints handoff evidence and session evidence npm/paste-ready commands, so the earliest install-info text handoff can recover those pre-phone evidence steps.

The install-start JSON/text/schema command set also includes paste-ready handoff evidence and session evidence commands, keeping the Mac start guide aligned with preinstall evidence generation.

`npm run ios:install:handoff-session:evidence` runs both handoff and session evidence generation, and `/install.html` exposes a `handoff+session 복사` button for the paste-ready bundle command before the iPhone handoff.

The iOS install next-action JSON/text output also exposes `handoffSessionEvidenceCommand` and `handoffSessionEvidenceTerminalCommand`, so the combined evidence bundle is discoverable outside the install page UI.

The install-start JSON/text/schema command set also exposes the paste-ready combined handoff-session evidence command beside the individual handoff and session evidence commands.

The install-info text, structured install session, session checker/check-result schema, ops evidence summary, and readiness report also preserve the combined handoff-session evidence npm and paste-ready terminal commands.

The preinstall evidence chain uses `npm run ios:install:handoff-session:evidence`, and the runbook prepare phase/checker require the same bundle alias while keeping the individual handoff/session commands available for compatibility.

The generated iOS install handoff Markdown and handoff checker/check-result schema preserve the same combined handoff-session evidence npm and paste-ready terminal commands.

`/install.html` labels the final pre-phone sequence copy action as the recommended prep command, so a first-time Mac operator sees one primary command before opening the iPhone handoff.

The hands-on install checklist uses the same recommended prep command wording for the first two manual checks: evidence saved, then HTTPS preflight and next-action evidence passed.

Copying the recommended prep command does not auto-complete those manual checklist steps; the operator checks them only after confirming the Mac terminal output.

After a Mac evidence command is copied, the install page status message tells the operator to paste it into the terminal and manually check the relevant hands-on checklist item only after the command output passes.

If clipboard access falls back to a prompt, the prompt/status copy uses the same manual-check-after-terminal-pass guidance.

The hands-on checklist itself also displays the rule that Mac command checklist items should be checked only after terminal output passes.

The same checklist note explains that progress is saved in the current device browser and is not synced across Mac and iPhone browsers.

The checklist reset action is labeled as a current-device reset so clearing progress on one browser is not confused with cross-device session cleanup.

After reset, the install page status message also confirms that only the current device browser checklist was cleared.

When a checklist item changes, the status message says progress was saved in the current device browser and is not synced to other device browsers.

The hands-on checklist also displays the current device browser saved timestamp once local progress has been written.

The saved timestamp title and `aria-label` describe it as local browser checklist storage, not a synced or verified gate state.

New hands-on checklist writes include an `updatedReason`, so the saved timestamp distinguishes regular checklist saves from local checklist resets while older records continue to read as checklist saves.

The hands-on checklist can copy a current-browser progress summary containing storage scope, saved timestamp reason, next step, completion-status URL, and checked items for Notes or message handoff.

The same current-browser progress summary can be sent through native share when available, with clipboard and prompt fallback when sharing is unavailable or blocked.

Native checklist progress share also includes the completion status URL as an explicit share URL, so iOS share targets can treat it as a link instead of only text.

The checklist copy/share buttons update their `title` and `aria-label` with the current-browser checked count and the reminder that verified gate completion belongs on the completion status page.

The visible copy/share labels also include the current checked count, for example `현황 복사 3/8`, so the local snapshot is clear before handoff.

The checklist also exposes SMS and mail handoff links for the same current-browser progress summary, with visible checked counts in their labels.

SMS checklist handoff uses a compact progress/next/status URL summary, while mail keeps the detailed checked-item summary.

Compact SMS keeps the next-step URL and completion-status URL, while detailed copy/share/mail text also keeps the install-checklist return URL.

The SMS/mail link titles and `aria-label`s name that split: SMS sends a compact summary, while mail sends detailed checklist status.

Their visible labels mirror the same split with short SMS and detailed mail wording plus the current checked count.

Tapping either SMS or mail handoff leaves install-status feedback that repeats whether a compact SMS summary or detailed mail checklist was opened.

The handoff controls display and reference a current-browser snapshot hint, including the compact SMS versus detailed mail distinction.

That hint now names the compact SMS payload as next-step plus completion-status URLs, while detailed mail includes the full checked-item summary.

It also states that copy/share/detailed mail keep the full checked-item summary, while compact SMS stays link-focused.

Copy, share, SMS, and mail controls are grouped as current-browser checklist handoff actions, while the local reset action stays separate.

The handoff action group has its own wrapped, lightly tinted visual container so it stays distinct from the local reset control on small iPhone screens.

The hands-on checklist handoff action group now updates its title and accessible label with the current checked count, while still describing compact SMS as next-step/completion-link focused and copy/share/detailed mail as full checked-item handoff.

The same handoff action group also announces whether the current browser snapshot has not been saved yet, was last saved from checklist changes, or was last saved from a local reset.

The visible handoff hint mirrors that local snapshot context with the current checked count and saved-state wording, so iPhone operators do not need a screen reader tooltip to know whether the handoff text is still unsaved.

The hands-on checklist summary title and accessible label now include the current checked count, local saved-state context, and current next step, so a collapsed checklist still carries the resume point.

Checklist handoff text includes both an install-checklist return URL and the completion-status URL, so a received summary can resume the install guide or jump to final gate review.

Checklist handoff text also includes the current next-step URL; native share uses that next-step URL as its explicit share URL while keeping completion status in the text.

The native checklist share next-step URL selection avoids unused local checklist state reads; it derives the next target from the current unchecked checkbox in the focused checklist.

Opening `/install.html#iosInstallHandsOnChecklist` focuses and highlights the hands-on checklist, leaving status feedback that the operator can continue from the current-browser checklist snapshot.

After the checklist return highlight, focus moves to the hands-on next-step link so the operator can continue from the saved local checklist snapshot.

The checklist displays the next unchecked install step from the current browser state, and shows a completion-status reminder when every checklist item is checked.

The next-step line is exposed as a polite live status so checklist changes can announce the updated next action during the physical iPhone install.

The next-step helper also exposes a direct link to the matching install section, or to the completion status page when the checklist is complete.

When the next-step helper targets an in-page install section, the browser script scrolls and focuses that section after hash navigation to make the jump clearer on iPhone Safari.

In-page next-step targets also receive a short destination highlight, with animation disabled for reduced-motion users.

When an in-page next-step link is tapped, the install status message confirms the move and tells the operator to continue from the highlighted section.

The next-step link also updates its `title` and `aria-label` with the current unchecked checklist step, or with the completion-status check when all steps are done.

The in-page next-step move feedback reuses that accessible step description so the install status message names the exact unchecked step, not only the short jump-link label.

When the next-step link points to `/ios-install-status`, tapping it records the `status-board` review-start checklist step in the current browser before leaving the install page.

The hands-on checklist progress counter uses check-count wording rather than completion wording so local checklist progress is not confused with verified gate completion.

When every hands-on item is checked, the next-step copy still points operators to the completion status page for the actual remaining-gate review.

The checklist progress title and `aria-label` describe the count as current-browser checked progress and point operators back to the completion status page for verified gate completion.

iPhone diagnostics copy success feedback and prompt fallback now state that the copied diagnostics include the value-free new-plan shortcut install action fields and draft/LLM exclusion markers.

When clipboard copy falls back to a prompt, the install status message also states that the prompt includes the same value-free new-plan shortcut install action diagnostics and exclusion markers.

The diagnostics button records whether the latest copy path used clipboard or prompt fallback, and the fallback path briefly changes the visible button label to `prompt 열림`.

The copied diagnostics text also includes the latest diagnostics copy method and method-updated timestamp, so clipboard versus prompt fallback can be traced from the text alone.

The diagnostics button title and accessible label also name those copy-method fields, keeping the visible action contract aligned with the copied payload.

After each diagnostics copy attempt, the same title and accessible label update with the latest copy method, distinguishing clipboard from prompt fallback.

The success and prompt-fallback status messages also name the `diagnosticsCopyMethod` value that is included in the copied diagnostics.

Those status messages now include `diagnosticsCopyMethodUpdatedAt` too, matching the timestamp field copied in the diagnostics text.

The diagnostics button title and accessible label now include that method-updated timestamp after each copy attempt as well.

The successful diagnostics copy label now briefly says `clipboard 복사됨`, matching the prompt fallback label `prompt 열림`.

After a copy attempt, the diagnostics button title and accessible label use the exact `diagnosticsCopyMethod` and `diagnosticsCopyMethodUpdatedAt` field names from the copied diagnostics text.

The iOS install completion panels now state that real completion requires Home Screen Travel launch proof, Mac final gate success, first-plan creation, and a final check on `/ios-install-status`.
The completion checklist now counts first-plan creation and completion-status review as explicit gates, so the visible progress starts from `0/6` instead of treating them as copy-only criteria.
The completion-status review gate stays pending when the page is merely open; it only turns complete after first-plan creation and the Mac final gate are both confirmed.
The checklist order now keeps Mac final gate before completion-status review, matching the final review dependency.
The completion section also shows a value-free next incomplete gate cue with a `다음 gate 열기` action link and records label/state/target/click/focus diagnostics.
That next-gate cue now explains whether the gate is next because it is incomplete or still in a warning state, and copies the reason as value-free diagnostics.
The iPhone diagnostics and shell-version copy now include the same next-gate cue/action-link fields for remote troubleshooting.

Those completion criteria are also connected to the install completion sections with `aria-describedby`, so VoiceOver can announce the real completion gate context.

The Home Screen Dock completion-status handoff actions now mention Home Screen proof, Mac final gate, first-plan creation, and completion-status review in their titles and accessible labels.

The install guide completion-status copy/share/SMS/mail/page actions now use the same completion criteria in their titles and accessible labels.

Completion-status handoff text and copy/share runtime feedback now include the same Home Screen proof, Mac final gate, first-plan creation, and completion-status review criteria.

The install guide completion-status detailed text and compact SMS handoff payload now include the same `criteria=Home Screen proof + Mac final gate + first-plan creation + completion-status review` line.

The completion-status URL next-action copy/share flow now also names Home Screen proof, Mac final gate, first-plan creation, and completion-status review in its runtime hints and feedback.

The completion-status URL next-action SMS and mail handoff labels and feedback now carry the same real completion criteria.

The completion-status URL copy/share prompt fallback text now carries the same criteria when clipboard or native share is unavailable.

The completion-status URL SMS/mail payload text now also names Home Screen proof, Mac final gate, first-plan creation, and completion-status review.

The new-plan shortcut completion-status link now names Home Screen proof, Mac final gate, first-plan creation, and completion-status review in its static and runtime link descriptions.

The new-plan shortcut completion-status runtime context and click feedback now use the same completion criteria while keeping draft values and LLM secrets excluded.

The install guide link-preview metadata and Home Screen Dock final-gate status descriptions now also mention Home Screen proof, Mac final gate, first-plan creation, and completion-status review.

The public app link-preview metadata now also mentions install proof, Mac final gate, first-plan creation, and completion-status review, matching the install guide metadata.

The web app manifest app description and iOS-relevant shortcuts now mention Home Screen proof, Mac final gate, first-plan creation, and completion-status review.

The public app description metadata now explicitly includes first-plan creation alongside proof, Mac final gate, and completion-status review.

The manifest `새 여행 플랜` shortcut now describes the action as leading to the first-plan creation gate.

The manifest `iPhone 설치 가이드` shortcut now opens `/install.html#iosInstallFastPathTitle`, taking users directly to the 1-minute install route.

The manifest install shortcut is now named `iPhone 1분 설치` with short name `1분 설치`, matching the fast-path URL target.

The manifest completion-status shortcut is now named `iPhone 완료 상태` with short name `완료 상태`, matching the install completion review target.

The public app and install guide now include OG/Twitter image metadata pointing to the Travel icon with iPhone Home Screen app alt text.

Their OG image metadata now also declares PNG type and 512x512 dimensions for more stable iPhone link previews.

The public app and install guide now include unsized `apple-touch-icon` fallback links in addition to the 180x180 icon link.

The plan detail page now also includes Travel icon OG/Twitter image metadata and an unsized `apple-touch-icon` fallback.

Manifest shortcuts now provide both 192x192 and 512x512 PNG icon candidates.

The service worker offline navigation fallback now sends `/ios-install-status` and `/ios-next` to the cached install guide instead of the generic home page.

The plan detail install guide link now opens `/install.html#iosInstallFastPathTitle` and is labeled as `1분 설치`.

The public app install dedicated-screen link now also opens `/install.html#iosInstallFastPathTitle` and is labeled as `1분 설치`.

When `/ios-install-status` or `/ios-next` opens the cached install guide through offline fallback, the install status now explains the fallback and scrolls to the 1-minute install route.

That offline fallback also moves focus to the 1-minute install route heading once, giving VoiceOver and keyboard users the same recovery context.

The cached install guide fallback now marks the document title and `<html>` data state as either completion-status or next-action recovery.

The iPhone diagnostics text now includes `iosOfflineFallback` and `iosOfflineFallbackPath` so cached install guide fallback recovery can be traced from copied diagnostics.

It also includes `iosOfflineFallbackDocumentTitle`, matching the recovery-specific page title shown during cached install guide fallback.

The iPhone diagnostics copy button title and accessible label now mention the offline fallback state, path, and title fields included in the copied diagnostics.

The diagnostics copy success and prompt-fallback feedback now also mention that `iosOfflineFallback` state, path, and title fields are included.

The cached install guide fallback now also writes `data-ios-offline-fallback-path` and `data-ios-offline-fallback-title` on `<html>`.

It also records `data-ios-offline-fallback-updated-at` and includes `iosOfflineFallbackUpdatedAt` in copied iPhone diagnostics.

The iPhone diagnostics copy button and copy/prompt feedback now mention the offline fallback updated-at field alongside state, path, and title.

The diagnostics copy button title and accessible label now use the exact offline fallback diagnostics field names from the copied payload.

The diagnostics copy success and prompt-fallback feedback now use those exact offline fallback diagnostics field names as well.

The diagnostics payload now reads offline fallback path, title, and updated-at from the fallback DOM data markers, leaving them blank when no fallback recovery is active.

It also includes `iosOfflineFallbackBlankWhenInactive=true` so blank fallback path/title/timestamp values are interpreted as normal when no recovery is active.

The diagnostics copy button title, accessible label, and copy/prompt feedback now also mention `iosOfflineFallbackBlankWhenInactive`.

Cached install guide fallback now records `data-ios-offline-fallback-source-url` and copied diagnostics include `iosOfflineFallbackSourceUrl`.

The diagnostics payload now includes `iosOfflineFallbackBlankFields`, listing path, source URL, document title, and updated-at as blank when fallback recovery is inactive.

The diagnostics copy button title, accessible label, and copy/prompt feedback now also mention `iosOfflineFallbackBlankFields`.

Cached install guide fallback now records `data-ios-offline-fallback-recovery-target` and copied diagnostics include `iosOfflineFallbackRecoveryTarget`.

It now also records `data-ios-offline-fallback-recovery-target-label` and copied diagnostics include `iosOfflineFallbackRecoveryTargetLabel`.

The offline fallback recovery target label is localized as `1분 설치 루트` in DOM state and copied diagnostics.

The offline fallback recovery target anchor id is also copied as `iosOfflineFallbackRecoveryTargetId=iosInstallFastPathTitle`.

The copied diagnostics also include `iosOfflineFallbackRecoveryAction=open-ios-install-fast-path`, so recovery tooling can distinguish the intended next step from the target URL.

The human-readable recovery action label is copied as `iosOfflineFallbackRecoveryActionLabel=1분 설치 루트 열기`.

The copied offline fallback diagnostics also include `iosOfflineFallbackCompletionChecklist=home-screen-proof,mac-final-gate,first-plan,completion-status-review` so the recovery path keeps the real iPhone install completion criteria visible.

The checklist is mirrored for humans as `iosOfflineFallbackCompletionChecklistLabel=홈 화면 proof > Mac final gate > 첫 플랜 생성 > 완료 상태 리뷰`.

The fallback diagnostics also copy `iosOfflineFallbackCompletionHint=복구 후 홈 화면 proof, Mac final gate, 첫 플랜 생성, 완료 상태 리뷰까지 확인` as the short human next-step reminder.

When cached install fallback recovery is active, the visible install status message includes that same completion hint.

The copied diagnostics mark this visible status contract with `iosOfflineFallbackVisibleStatusIncludesCompletionHint=true`.

The visible status element also stores the hint as `iosOfflineFallbackStatusCompletionHint` with `iosOfflineFallbackStatusCompletionHintVisible=true`, and both fields are copied in diagnostics.

The same fallback status meaning is exposed through the status element `title` and `aria-label`, then copied as `iosOfflineFallbackStatusAccessibleLabel` with `iosOfflineFallbackStatusAccessibleLabelVisible=true`.

The fallback status element also becomes a polite live region with `role=status` and `aria-live=polite`, copied as `iosOfflineFallbackStatusRole` and `iosOfflineFallbackStatusAriaLive`.

That live region is atomic too: `aria-atomic=true` is copied as `iosOfflineFallbackStatusAriaAtomic=true`.

The fallback status element is also connected back to the 1-minute install heading with `aria-describedby=iosInstallFastPathTitle`, copied as `iosOfflineFallbackStatusDescribedBy`.

Cached install fallback diagnostics now copy `iosOfflineFallbackSourceLabel` as `완료 상태 URL` or `다음 액션 URL`, matching the source recovery route.

The visible install status message now uses that same source label and stores it on the status element as `iosOfflineFallbackStatusSourceLabel`.

The visible status element also stores the human recovery action as `iosOfflineFallbackStatusRecoveryActionLabel=1분 설치 루트 열기`.

The fallback status `title` and `aria-label` now include the source label, recovery action label, and completion hint in one accessible sentence.

Cached install fallback now adds an `iosOfflineFallbackRecoveryLink` beside the status message, pointing to `iosInstallFastPathTitle` with the label `1분 설치 루트 열기`; diagnostics copy the link visible/target/label fields.

That recovery link now handles clicks by scrolling and focusing `iosInstallFastPathTitle`, announces the move in the live status message, and copies `iosOfflineFallbackRecoveryLinkAction=scroll-focus-iosInstallFastPathTitle` plus `iosOfflineFallbackRecoveryLinkBound=true`.

The recovery link uses the `ios-offline-fallback-recovery-link` class for a 44px touch target and full-width iPhone layout, copied as `iosOfflineFallbackRecoveryLinkClass`.

After the recovery link is tapped, diagnostics copy `iosOfflineFallbackRecoveryLinkClicked=true`, `iosOfflineFallbackRecoveryLinkClickedAt`, and `iosOfflineFallbackRecoveryLinkStatusFeedback`.

After activation, the recovery link label changes to `1분 설치 루트로 이동됨`, adds `is-active`, and diagnostics copy `iosOfflineFallbackRecoveryLinkClickedLabel` plus `iosOfflineFallbackRecoveryLinkClickedClass`.

The clicked recovery link also updates and copies `iosOfflineFallbackRecoveryLinkClickedTitle` and `iosOfflineFallbackRecoveryLinkClickedAccessibleLabel`.

After activation, the recovery link also copies `iosOfflineFallbackRecoveryLinkCompletionChecklist`, `iosOfflineFallbackRecoveryLinkCompletionChecklistLabel`, and `iosOfflineFallbackRecoveryLinkCompletionHint`.

Cached install fallback now shows an `iosOfflineFallbackRecoveryChecklist` panel under the recovery link with Home Screen proof, Mac final gate, first-plan creation, and completion-status review, copied as `iosOfflineFallbackRecoveryChecklistVisible`, `iosOfflineFallbackRecoveryChecklistItems`, and `iosOfflineFallbackRecoveryChecklistLabel`.

The checklist panel also copies `iosOfflineFallbackRecoveryChecklistKeys=home-screen-proof,mac-final-gate,first-plan,completion-status-review` and matching route hints in `iosOfflineFallbackRecoveryChecklistRoutes`.

Each fallback recovery checklist item is now a link, and diagnostics copy `iosOfflineFallbackRecoveryChecklistLinksVisible`, `iosOfflineFallbackRecoveryChecklistLinkLabels`, and `iosOfflineFallbackRecoveryChecklistLinkRoutes`.

Those checklist links use `ios-offline-fallback-recovery-checklist-link` for larger tap rows, copied as `iosOfflineFallbackRecoveryChecklistLinkClass`.

When a recovery checklist link is tapped, diagnostics copy `iosOfflineFallbackRecoveryChecklistLinkClicked`, clicked key/route/label/timestamp/class, and `iosOfflineFallbackRecoveryChecklistLinkStatusFeedback`; same-page hash targets scroll and focus in place.

That clicked checklist item is also saved in `sessionStorage` under `travel-planner:ios-offline-fallback-recovery-checklist-click:v1`, with diagnostics copying `iosOfflineFallbackRecoveryChecklistSessionSaved`, `iosOfflineFallbackRecoveryChecklistSessionKey`, and `iosOfflineFallbackRecoveryChecklistSessionValue`.

On the next page in the same iPhone session, that stored checklist click is surfaced as `iosOfflineFallbackRecoveryChecklistCarryover`, including key/route/label/source/clicked-at/status feedback diagnostics.

If the next page has no `iosInstallStatus`, the carryover appears in an `iosOfflineFallbackCarryoverBanner`, with visible/key/route/label/feedback/class diagnostics copied. The banner also includes an `iosOfflineFallbackCarryoverBannerLink` to the stored route, with link visible/route/label/class diagnostics. Pages with `iosInstallStatus` now render an `iosOfflineFallbackCarryoverStatusLink` so the same carried-over route is tappable from the status area, copying status-link visible/route/label/class plus clicked/clickedAt/clickedClass/clickedStatusFeedback diagnostics.
Diagnostics now parse that session value into `iosOfflineFallbackRecoveryChecklistSessionClickedKey`, `iosOfflineFallbackRecoveryChecklistSessionClickedRoute`, `iosOfflineFallbackRecoveryChecklistSessionClickedLabel`, `iosOfflineFallbackRecoveryChecklistSessionClickedAt`, and `iosOfflineFallbackRecoveryChecklistSessionSourceLabel`.

### iOS install first-use URL schema contract

Install session/runbook JSON schemas and the runbook-check result schema require `postInstallAppHomeUrl` and `postInstallNewPlanUrl`, matching the checker contract that preserves the post-install Travel app home and first-plan links.

`예시로 빠르게 채우기` 버튼도 visible/label/state와 clicked/clickedAt/clickedMode/clickedStatusFeedback diagnostics를 남기되 실제 입력값은 복사하지 않는다.

`예시로 빠르게 채우기` 버튼을 누른 뒤에도 새 플랜 폼으로 스크롤하고 첫 입력 위치를 포커스하며 폼을 짧게 하이라이트한다.

`예시로 빠르게 채우기` 버튼 diagnostics에는 focusTarget/focusScheduled/focusApplied/focusedAt/highlightApplied도 포함되어 예시 입력 뒤 폼 cue가 실제로 예약/적용됐는지 값 없이 확인할 수 있다.

`예시로 빠르게 채우기` 후에는 새 플랜 폼 안의 live hint가 다음 행동을 안내하며, hint diagnostics는 visible/text/updatedAt만 남기고 입력값은 복사하지 않는다.

새 플랜 form submit 버튼은 iOS first-use 안내와 같은 `플랜 만들기` 라벨을 사용해 설치 직후 첫 플랜 생성 동선을 맞춘다.

iPhone 진단은 `planFormSubmitButton`의 visible/label/title/aria-label/describedBy/bound와 clicked/clickedAt/clickedStatusFeedback, disabled/ariaBusy/busy, redirectPlanned/redirectRoute/redirectPlannedAt/fallbackLinkVisible/fallbackRoute, redirectSessionSaved/redirectSessionRoute/redirectSessionPlannedAt/redirectSessionSource, redirectArrivalVisible/redirectArrivalRoute/redirectArrivalSource/redirectArrivalPlannedAt/redirectArrivalArrivedAt/redirectArrivalDismissed/redirectArrivalDismissedAt/redirectArrivalDismissButtonVisible/redirectArrivalDismissButtonLabel/redirectArrivalDismissButtonAccessibleLabel/redirectArrivalDismissButtonClicked/redirectArrivalDismissButtonClickedAt/redirectArrivalDismissButtonClickedStatusFeedback, redirectArrivalStatusLinkVisible/redirectArrivalStatusLinkRoute/redirectArrivalStatusLinkLabel/redirectArrivalStatusLinkAccessibleLabel/redirectArrivalStatusLinkClicked/redirectArrivalStatusLinkClickedAt/redirectArrivalStatusLinkClickedRoute/redirectArrivalStatusLinkClickedStatusFeedback도 값 없이 복사해 첫 플랜 생성 버튼 노출, 상태 메시지 연결, tap handler 연결, 탭 여부, 생성 중 상태, 성공 후 상세 이동 계획과 fallback 링크/세션 carryover/상세 도착/닫힘 상태, 닫기 액션 준비/클릭 상태, 완료 상태 링크 준비/클릭/도착/닫힘 상태와 앱 홈 복귀 링크 준비/클릭/도착/닫힘 상태와 first-use loop 완료 상태와 홈 완료 배지 노출/숨김/숨김 이유/확인 상태와 첫 사용 상태 초기화 액션, 초기화 확인 배너, 재시작 링크, 재시작 도착 배너/확인 상태, 재시작 폼 포커스 상태와 입력 시작/focus cue 해제 상태, 입력 시작 status feedback, 입력 시작 배너와 닫기 상태를 확인할 수 있다.
생성 중에는 `title`/`aria-label`도 진행 중 문구로 바뀌고 완료 후 기본 `플랜 만들기` 설명으로 복구된다.
첫 플랜 생성 진행/성공 메시지는 `role=status`/`aria-live=polite`, 실패 메시지는 `role=alert`/`aria-live=assertive`로 노출해 iOS VoiceOver가 상태 변화를 읽을 수 있게 한다.
진단 복사에는 메시지 본문 대신 `iosHomeDockPlanSubmitMessageVisible`/`Id`/`Role`/`AriaLive`/`AriaAtomic`만 포함해 live-region 연결 여부를 값 없이 확인한다.
생성 중에는 같은 버튼이 disabled와 `aria-busy=true`를 노출하고, 진단은 disabled/ariaBusy/busy 상태도 값 없이 복사한다.
`aria-busy=true` 동안 `플랜 만들기` 버튼은 진행 중 커서, teal 배경, outline/shadow busy style로 표시된다.

iPhone 진단은 첫 플랜 submit attempted/result/resultAt/failureKind/statusFeedback도 값 없이 복사해 생성 요청이 pending/success/error 중 어디서 멈췄는지 확인할 수 있다.

Home Screen Dock은 현재 앱 shell과 서버 shell metadata가 다르면 새 앱 shell 안내를 표시하고, shell 버전 복사에 updateNudgeVisible/state/detail/action/clickedAt을 함께 남긴다.

새 service worker 버전 적용 안내는 적용 버튼을 누른 시각과 reload 대기 상태를 value-free marker로 남기며, shell 버전 복사와 iPhone 진단에 `updatePromptApplied`/`updatePromptReloadPending` 상태가 포함된다.

새 shell로 재로드된 뒤에는 value-free 완료 배너가 뜨고, `설치 증거 다시 저장` 링크와 닫기 상태가 shell 버전 복사 및 iPhone 진단에 남는다.

그 `설치 증거 다시 저장` 링크는 `#iosInstallProofSaveButton`으로 직접 이동하며 focus target/scheduled/applied/focusedAt 진단을 남긴다.

새 shell 적용 후 proof 저장이 성공하면 `updateReloadArrivalProofResaved`와 `updateReloadArrivalNextAction=mac-final-gate`가 shell 버전 복사와 iPhone 진단에 남는다.

proof 재저장 성공 후에는 final gate 복사 버튼 focus target/scheduled/applied/focusedAt과 버튼 라벨도 value-free 진단에 남는다.

final gate 명령 복사 버튼을 누르면 clipboard 또는 prompt copy method와 copiedAt marker도 새 shell 업데이트 진단에 남는다.

복사 직후에는 `완료 상태 다시 확인` 링크가 표시되고, 링크 노출/route/label/click 상태가 shell 버전 복사와 iPhone 진단에 남는다.

그 링크를 누르면 clickedRoute=`/ios-install-status`와 value-free status feedback도 함께 남아 완료 상태 리뷰 이동 맥락을 확인할 수 있다.
또한 statusReviewPending/route/pendingAt marker로 다음 화면에서 완료 상태 리뷰 carryover를 확인할 수 있다.
완료 상태 페이지에 도착하면 새 앱 shell 적용 후 리뷰 화면에 도착했다는 배너가 보이고, visible/arrivedAt/dismiss/dismissFeedback diagnostics도 값 없이 남는다.
이 배너의 `완료 상태 영역 보기` 링크는 `#iosInstallCompletion`으로 이동하며 link route/click/focus diagnostics를 함께 남긴다.
완료 판정 영역 안에도 새 shell 업데이트 이후 리뷰라는 cue가 남아, 4개 gate 확인과 `최종 gate 결과 새로고침` 다음 행동을 바로 안내한다.

Plan detail offline fallback now shows an in-page recovery card with home and 1-minute install links when no local detail snapshot exists, instead of stopping at an alert.

iOS install URL copy feedback now identifies whether the copied URL is a recommended, selected short, same-Wi-Fi, or localhost target while keeping the copied clipboard value as the raw URL for Safari address-bar paste.

Home Screen Dock now exposes a value-free last route resume link, storing only href, label, reason, and timestamp so iPhone users can return to the last form/detail/status location without saving draft values or LLM secrets.

iPhone diagnostics now include value-free Home Screen last-route resume state and click evidence: visible, href, label, updatedAt, reason, bound, clicked, clickedAt, clickedHref, clickedLabel, and clickedStatusFeedback.

Home Screen Dock also includes a value-free last-route clear button so stale resume links can be removed on the iPhone while preserving draft values and LLM secrets.

After clearing a stale last-route link, the Dock points users to the next safe action, such as install checks, new-plan input, or recent plans, while diagnostics only copy the route and label.

The same clear control then turns into a tappable next-action button, recording only whether it was opened and when.

That next-action button stays visible across Home Dock refreshes until the user opens it or a new last-route resume target is saved.

After the next-action button is opened, the Dock hides that consumed action and leaves only value-free opened/consumed diagnostics.

Those opened diagnostics now include the route, label, and status feedback so the iPhone handoff can be audited without copying draft values or LLM secrets.

Home Screen Dock shows a visible display-mode pill so iPhone users can confirm they are running the Travel icon as a standalone Home Screen app, not an ordinary browser tab.

The install card badge and app-mode callout now distinguish `Safari 준비`, `Safari 필요`, and `홈 화면 앱` states so the pre-install and post-launch phases are visible before opening the Dock.

The install card also has a `모드 상태 복사` action that copies only display mode, app-mode title/detail, badge label, and exclusion markers for draft values and LLM secrets.

The install card also offers `모드 상태 공유` on browsers with native share, falling back to clipboard or prompt while keeping the same value-free mode evidence.

The same value-free install mode evidence is available as `모드 상태 문자` and `모드 상태 메일` handoff links for sending Safari/Home Screen state to a Mac or another device.

Mode evidence SMS uses a compact value-free summary, while mode evidence mail keeps the detailed app-mode payload.

The mode handoff links label that split directly as `모드 문자(짧게)` and `모드 메일(상세)`, with matching title and accessible-label text.

The install card now shows a hint explaining that mode SMS is compact while mode mail keeps detailed value-free evidence.

Mode evidence copy/share/SMS/mail controls reference that hint with `aria-describedby` so VoiceOver announces the compact SMS versus detailed mail split.

Mode evidence payloads also include compact-SMS and detailed-mail role markers so the distinction survives after the handoff reaches Mac, Notes, Messages, or Mail.

iPhone diagnostics now include value-free install mode copy/share/SMS/mail/hint state, including method, payload kind, click, and hint-describedby markers.

- Invalid dock feedback은 키보드 때문에 하단 dock이 숨겨져도 필드 옆 inline 안내를 표시하고, inline visible/field/feedback/shown/cleared 상태를 value-free로 복사한다.
- iOS install URL card는 설치 페이지 상단에서 iPhone Safari로 열 정확한 `/install` URL을 표시하고, 복사/공유/문자/메일 전송을 제공하며 localhost 또는 비HTTPS 경고를 보여준다.
- 상단 install URL 카드는 기존 QR endpoint를 바로 표시하고, 설치 정보 로드 후 추천 LAN/HTTPS URL로 QR과 링크를 다시 동기화한다.
- iOS install URL card 바인딩은 `iosInstallInfo` 등 모듈 상태 초기화 이후 실행해 Home Screen 설치 페이지 초기 로드 오류를 피한다.
- iPhone 폭에서는 install URL QR 카드가 세로로 접히고 QR을 156px로 키워 카메라 스캔과 복사/공유 버튼 터치를 쉽게 한다.
- Home Screen standalone 카드에 첫 실행 1분 루틴을 추가해 설치 체크, proof 저장, 첫 플랜, 완료 확인으로 바로 이동하게 한다.
- Home Screen standalone 카드에 설치 완료 기준 요약을 표시해 proof, Mac final gate, 첫 플랜, 완료 상태 gate 확인을 한 화면에서 이해하게 한다.
- 첫 실행 루틴에서 proof 저장으로 이동하면 `iosInstallProofSaveButton`에 스크롤 여백과 focus/target 링을 적용해 iPhone 화면에서 버튼을 놓치지 않게 한다.
- 첫 실행 루틴에서 첫 플랜으로 이동하면 `planForm`에 스크롤 여백과 target 링을 적용해 iPhone 화면에서 입력 시작점을 놓치지 않게 한다.
- 첫 실행 루틴의 완료 확인 링크는 완료 기준 설명과 연결되고, iPhone 폭에서 더 큰 터치 영역으로 접힌다.
- install URL 카드의 localhost/http 경고는 같은 Wi-Fi LAN 주소, HTTPS 터널, 배포 URL 중 무엇을 써야 하는지 다음 행동을 직접 안내한다.
- install URL 카드에 상태 배지를 표시해 `iPhone 준비됨`, `HTTPS 권장`, `주소 교체 필요`를 한눈에 구분한다.
- install URL 카드에 Safari 안내를 추가해 카카오톡/인스타그램/메일 앱 안에서 열렸을 때 Safari로 다시 열도록 유도한다.
- install URL 카드에서 기존 `1분 설치 루트`로 바로 내려가는 링크를 제공해 URL/QR 확인 후 실제 iPhone 탭 순서로 이어진다.
- `1분 설치 루트` 바로가기로 이동하면 해당 섹션에 scroll margin과 target/focus outline을 적용해 도착 위치를 분명하게 보여준다.
- Safari 안내는 공유 시트에서 `홈 화면에 추가`가 바로 보이지 않을 때 아래로 스크롤하라는 복구 행동까지 포함한다.
- install URL 카드에 `Travel` 홈 화면 아이콘 미리보기를 표시해 설치 후 어떤 아이콘으로 다시 열어야 하는지 바로 알 수 있게 한다.
- iPhone 폭에서는 `Travel` 아이콘 미리보기를 세로로 접고 아이콘을 64px로 키워 설치 후 찾을 앱 아이콘을 더 분명하게 보여준다.
- 설치/홈 화면의 앱 모드 callout은 주소창이 보이면 Safari 탭이고, 주소창 없는 Travel 화면으로 다시 열어야 한다는 판별 힌트를 보여준다.
- 설치/홈 화면에 `URL -> Safari -> 홈 화면 -> Travel` 4단계 rail을 표시하고 현재 install mode에 맞는 다음 단계를 `aria-current`로 강조한다.
- iOS 설치 4단계 rail은 현재 단계뿐 아니라 지나온 단계를 `완료` 톤과 접근성 라벨로 표시해 어디까지 진행했는지 알려준다.
- iOS 설치 4단계 rail 아래에 현재 상태별 한 줄 안내를 표시해 Safari 공유, 홈 화면 Travel 실행, proof/첫 플랜/완료 확인 중 다음 행동을 바로 알려준다.
- iOS 설치 4단계 rail status link는 현재 상태에 따라 설치 URL/QR, 1분 설치 루트, 첫 실행 체크로 바로 이동한다.
- manifest에 stable `id`와 iPhone 설치 UI 설명용 `description`을 추가해 Home Screen 앱 정체성을 더 명확하게 한다.
- `/install`도 서버와 service worker에서 `/install.html`로 열리게 하고, 설치 URL 카드 기본값은 `/install.html`을 사용해 iPhone handoff 경로가 빗나가지 않게 한다.
- `/install` alias도 Home Screen standalone redirect와 install QR target allowlist에 포함해 alias 경로가 설치/QR/앱 모드 전환에서 같은 의미로 동작하게 한다.
- 서버가 생성하는 `proofSaveUrl`과 홈의 증거 저장 링크를 `#iosInstallProofSaveButton`으로 통일해 proof 저장 deep link가 패널이 아니라 실제 저장 버튼으로 간다.
- 홈 화면 dock의 proof 상태/시작 링크도 `#iosInstallProofSaveButton`으로 맞춰 proof 저장 이동이 모두 실제 버튼으로 이어진다.
- 예전 `#iosInstallProof` 링크로 들어와도 URL을 `#iosInstallProofSaveButton`으로 정규화해 기존 handoff/bookmark가 proof 저장 버튼 focus 흐름을 그대로 탄다.
- `ios-install-urls.js`는 install path, short install path, proof-save hash를 상수화해 URL helper 안의 `/install.html#iosInstallProofSaveButton` contract drift를 줄인다.
- `/api/install-info`와 텍스트 출력은 `proofSaveHash=#iosInstallProofSaveButton` 및 `proofSaveTargetId=iosInstallProofSaveButton`을 함께 노출해 proof 저장 deep link contract를 확인할 수 있게 한다.
- `ios-install-check`는 `proofSaveHash`와 `proofSaveTargetId`를 검사하고 JSON/text 결과와 schema에 보존해 install-info proof contract drift를 드러낸다.
- iOS install start/runbook 산출물과 schema도 `proofSaveHash`/`proofSaveTargetId`를 노출·요구해 proof-save contract를 앞단 evidence부터 보존한다.
- 플랜 상세 화면의 iOS install-mode callout도 `/api/ios-install-quickstart.txt`와 `/api/ios-install-quickstart` 링크를 제공해 공유된 여행 플랜에서 바로 iPhone 설치 quickstart로 복귀할 수 있다.
- 설치 페이지와 앱 홈의 앱 모드 callout은 `주소창이 보이면 설치 루트로`, `주소창이 없으면 proof 저장`, `완료 상태 확인` 3개 자가진단 링크를 제공해 iPhone에서 다음 행동을 바로 고르게 한다.
- 설치 페이지의 앱 모드 callout 아래에는 `홈 화면에 추가` 미노출, `localhost` 주소, Safari 탭 재실행 문제를 다루는 접이식 복구 카드와 설치 URL/1분 루트/quickstart 링크가 있다.
- iOS quickstart 텍스트/JSON은 Safari 열기, 공유 시트 스크롤, `localhost` 교체, 홈 화면 `Travel` 아이콘 실행 복구 힌트를 포함하고, quickstart checker는 `recoveryHintCount`와 필수 힌트 누락을 검사한다.
- ops evidence summary와 readiness report는 quickstart check의 `quickstartRecoveryHintCount`를 전달해 iPhone 복구 힌트 포함 여부를 운영 리포트에서도 확인할 수 있다.
- iOS quickstart는 설치 후 이어갈 `postInstallAppHomeUrl`, `postInstallNewPlanUrl`, `completionStatusUrl`도 포함해 proof 저장 뒤 앱 홈, 첫 플랜 입력, 완료 상태 리뷰로 바로 이어진다.
- ops evidence summary와 readiness report는 quickstart check의 `quickstartPostInstallAppHomeUrl`, `quickstartPostInstallNewPlanUrl`, `quickstartCompletionStatusUrl`도 전달해 post-install URL drift를 리포트에서 확인할 수 있다.
- iOS quickstart checker는 `urlOrigin`과 `urlSameOrigin`을 기록하고 install/proof/post-install URL들이 quickstart origin에서 벗어나면 실패한다.
- ops evidence summary와 readiness report는 quickstart check의 `quickstartUrlOrigin`과 `quickstartUrlSameOrigin`도 전달해 origin drift 여부를 운영 리포트에서 바로 확인할 수 있다.
- readiness JSON check는 present quickstart check에서 `quickstartUrlSameOrigin`이 true가 아니면 `quickstart-url-origin-drift` 오류를 내 iPhone 설치 URL drift를 gate에서 막는다.
- readiness repair target은 `quickstart-url-origin-drift` 발생 시 `npm run ios:install:quickstart:evidence` 재실행 명령을 제안한다.
- 사람이 보는 readiness report도 `quickstartUrlSameOrigin=false`일 때 `quickstartRepair=npm run ios:install:quickstart:evidence`를 표시한다.
- `ops:workflows`의 iOS install notes도 `quickstart-url-origin-drift` / `quickstartRepair` 상황에서 `ios:install:quickstart:evidence`를 다시 실행하라고 안내한다.
