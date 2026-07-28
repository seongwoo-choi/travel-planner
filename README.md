# Travel Planner

실제 장소, 영업시간, 날씨, 이동시간을 근거로 충돌 없는 여행 일정을 만드는 Node.js 여행 플래너입니다.

주 인터페이스는 Discord이며, 같은 저장소를 사용하는 웹 UI와 REST API를 함께 제공합니다. LLM은 설명과 입력 보조에만 사용하고 장소·영업시간·날씨·이동시간의 사실 source로 사용하지 않습니다.

## 주요 기능

- 0박 1일~30박 31일 일정
- 실제 도착·출발 시각과 이동 buffer
- 검증된 영업시간만 확정 일정에 배치
- 장소 category별 체류시간과 선호 시간대
- 점심·저녁 break를 침범하지 않는 일정
- Google Places 후보와 Distance Matrix 이동시간
- Open-Meteo 날씨와 목적지 timezone
- 국제/주요 교통과 현지 이동 분리
- deterministic bounded search와 hard-constraint 검증
- 사용자 `replace`/`move` 제약의 revision별 보존
- forecast horizon, stale evidence, 미확인 근거 진단
- JSON 또는 SQLite 저장소
- owner scope와 optimistic concurrency

## 요구 사항

- Node.js 22 이상
- Google Maps Platform API key
  - Geocoding API
  - Places API (New)
  - Distance Matrix API
- Discord Bot token과 application ID

## 설치

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner/webapp
npm ci
cp .env.example .env
```

`.env`에 필요한 값을 설정합니다. 실제 credential은 Git에 커밋하지 않습니다.

```dotenv
PORT=3000
TRAVEL_DB_PATH=data/plans.sqlite
TRAVEL_ACCESS_KEY=
GOOGLE_MAPS_API_KEY=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_USER_IDS=
DISCORD_ALLOW_DM=false
TRAVEL_DEFAULT_YEAR=
```

웹 API는 `TRAVEL_ACCESS_KEY`가 없으면 health/status 외 요청을 fail-closed 처리합니다. Discord 명령은 guild/user allowlist가 없으면 fail-closed 처리합니다.

## 실행

웹 서버:

```bash
cd webapp
npm start
```

Discord 봇:

```bash
npm run bot:setup
npm run bot:doctor
npm run bot
```

기본 주소:

```text
http://localhost:3000
```

## Discord 명령

- `/plan`: 구조화된 여행 요구사항으로 grounded 일정 생성
- `/quick`: 자연어 요약 입력으로 일정 생성
- `/check`: hard constraint와 evidence lifecycle 진단
- `/replace`: 장소 교체
- `/move`: 장소를 지정 날짜로 이동
- `/replan`: 저장된 evidence로 deterministic 재계획
- `/refresh`: provider evidence를 갱신하고 사용자 제약 재적용

변경 명령은 owner scope와 `expectedVersion`을 확인합니다. fresh evidence에 기존 `require`/`move` 제약을 적용할 수 없으면 저장 전에 거부합니다.

## REST API

공개 상태 확인:

```text
GET /api/health
GET /api/health.txt
GET /api/status
```

인증이 필요한 주요 API:

```text
GET  /api/plans
POST /api/plans
GET  /api/plans/:id
POST /api/plans/:id/refine
GET  /api/backup
```

보호된 요청에는 다음 header를 사용합니다.

```text
X-Travel-Access-Key: <your-access-key>
```

## 저장소

기본 SQLite 경로:

```text
webapp/data/plans.sqlite
```

SQLite 파일이 없으면 기존 JSON backend를 사용할 수 있습니다. JSON 데이터를 SQLite로 옮길 때는 서버와 봇을 중지한 뒤 실행합니다.

```bash
npm run storage:migrate:sqlite
```

migration은 원본 JSON을 보존하며 비어 있지 않은 target을 거부합니다.

운영 전 확인:

```bash
npm run storage:integrity
npm run storage:backup:workflow
npm run storage:backup:verify
```

## 테스트

전체 테스트:

```bash
npm test
```

50개 후보·31일 bounded-search benchmark:

```bash
npm run bench:planner
```

푸꾸옥 deterministic offline fixture:

```bash
npm run dogfood:phu-quoc
```

fixture 실행은 live Google Places, Distance Matrix, Open-Meteo 성공을 증명하지 않습니다. production 검증은 실제 provider 설정으로 별도 수행해야 합니다.

## Planner 안전 규칙

- 이동시간 evidence 누락을 0분으로 간주하지 않습니다.
- 미확인 영업시간에 가짜 종일 영업시간을 만들지 않습니다.
- `openingHoursStatus === "verified"`인 장소만 실행 가능한 후보로 사용합니다.
- 필수 장소가 hard constraint를 위반하면 강제로 배치하지 않습니다.
- forecast horizon 밖과 provider 장애를 구분합니다.
- timezone 검증 실패 시 local-time 기반 evidence를 verified로 유지하지 않습니다.
- bounded search 결과를 전역 최적해라고 주장하지 않습니다.
- 사용자 확인 없이 예약·결제 또는 외부 mutation을 수행하지 않습니다.

## 프로젝트 구조

```text
webapp/
  server.js                    REST API와 웹 UI
  src/discord-bot.js           Discord 명령
  src/storage.js               JSON/SQLite 저장소 선택
  src/sqlite-plan-store.js     SQLite transaction store
  src/planner/                 grounded collector와 deterministic planner
  public/                      일반 웹 UI
  test/                        회귀·통합·benchmark·dogfood
```

## 제한 사항

- Google provider 설정이 없으면 production grounded Discord 경로는 시작 단계에서 실패합니다.
- 항공편 예약 가능 여부와 실제 운항 스케줄은 별도 확인 대상입니다.
- Open-Meteo 장기 예보 범위 밖 일정은 `refreshAfter`까지 `needs_review`입니다.
- Discord 또는 API를 통한 예약·결제는 구현하지 않습니다.

## 보안

- `.env`, API key, token을 저장소에 커밋하지 않습니다.
- 외부 입력은 API/Discord 경계에서 검증합니다.
- 저장 mutation은 owner와 version을 확인합니다.
- 내부 오류 상세와 provider credential-bearing URL을 사용자 응답에 노출하지 않습니다.

## 라이선스

개인 프로젝트입니다. 별도 라이선스가 추가되기 전까지 재배포 조건은 명시되지 않았습니다.
