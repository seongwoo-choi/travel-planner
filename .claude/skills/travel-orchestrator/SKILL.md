---
name: travel-orchestrator
description: "여행 플래너 오케스트레이터. 여행 요구사항 수집부터 교통 예약, 일정 최적화, 여행 플랜 보고서까지 전체 파이프라인을 조율한다. 여행 계획, 여행지 추천, 교통 예약, 일정 만들어줘, 여행 플랜, 국내 여행, 코스 짜줘 요청 시 반드시 이 스킬을 사용."
---

# Travel Orchestrator

여행 플래너 에이전트 팀을 조율하여 요구사항 수집 → 정보 수집 → 일정 최적화 → 예약 → 보고서까지 전체 파이프라인을 수행한다.

## 실행 모드: 하이브리드

| Phase | 모드 | 이유 |
|-------|------|------|
| Phase 1 (정보 수집) | 서브 에이전트 (병렬) | 날씨·교통·현지 정보는 완전히 독립적 |
| Phase 2 (일정 최적화) | 에이전트 팀 | transport-coordinator ↔ itinerary-planner 협업으로 교통 연결 고려한 일정 수립 |
| Phase 3 (예약 실행) | 서브 에이전트 (순차) | 사용자 확인 게이트 필요, 단독 실행 |
| Phase 4 (보고서) | 서브 에이전트 | 앞 결과 종합 후 단독 리포트 생성 |

## 에이전트 구성

| 에이전트 | 타입 | 스킬 | Phase |
|---------|------|------|-------|
| weather-advisor | 커스텀 | weather-analysis | 1 |
| transport-coordinator | 커스텀 | transport-planning | 1 / 2 / 3 |
| local-guide | 커스텀 | local-discovery | 1 |
| itinerary-planner | 커스텀 | itinerary-optimization | 2 |
| trip-reporter | 커스텀 | (결과 종합) | 4 |

## 워크플로우

### Phase 0: 요구사항 수집

사용자에게 다음을 확인한다 (이미 제공된 정보는 묻지 않는다):

```
필수
- 목적지 (도시 또는 지역)
- 출발지 (기본값: 서울)
- 여행 날짜 (출발일, 귀환일)
- 인원 수

선택 (없으면 기본값 사용)
- 예산 범위 (1인 기준, 기본값: 미지정)
- 여행 스타일 (맛집/자연/역사/쇼핑/휴식, 기본값: 균형)
- 숙박 선호 (호텔/게스트하우스/펜션, 기본값: 미지정)
- 교통 선호 (KTX/SRT/버스/자차, 기본값: 자동 선택)
```

수집된 요구사항을 `_workspace/00_input/requirements.json`에 저장:

```json
{
  "destination": "부산",
  "departure": "서울",
  "start_date": "20260501",
  "end_date": "20260503",
  "passengers": 2,
  "budget_per_person": null,
  "travel_style": ["맛집", "바다"],
  "accommodation": null,
  "transport_pref": "auto",
  "created_at": "2026-04-22T10:00:00"
}
```

실행 모드 결정:
- `_workspace/` 미존재 → **초기 실행**, Phase 1 진행
- `_workspace/` 존재 + "교통만 다시" → **부분 재실행**: Phase 1 (transport-coordinator)만 재실행
- `_workspace/` 존재 + "날씨만 다시" → **부분 재실행**: Phase 1 (weather-advisor)만 재실행
- `_workspace/` 존재 + 새 목적지 제공 → **새 실행**: 기존 `_workspace/`를 `_workspace_{timestamp}/`로 이동 후 Phase 1 진행

### Phase 1: 정보 수집 (서브 에이전트, 병렬)

디렉토리 생성:
```
_workspace/01_weather/
_workspace/01_transport/
_workspace/01_local/
```

세 에이전트를 동시 호출 (`run_in_background: true`):

| 에이전트 | 입력 | 출력 | model |
|---------|------|------|-------|
| weather-advisor | `requirements.json` | `_workspace/01_weather/forecast.json` | sonnet |
| transport-coordinator | `requirements.json` | `_workspace/01_transport/options.json` | sonnet |
| local-guide | `requirements.json` | `_workspace/01_local/spots.json` | sonnet |

세 에이전트 완료 대기 후 진행.

### Phase 2: 일정 최적화 (에이전트 팀)

**실행 모드:** 에이전트 팀

디렉토리 생성: `_workspace/02_itinerary/`

1. 팀 생성:
   ```
   TeamCreate(
     team_name: "travel-planning-team",
     members: [
       {
         name: "itinerary-planner",
         agent_type: "itinerary-planner",
         model: "opus",
         prompt: "최적 여행 일정을 수립하라.
                  입력 1: _workspace/00_input/requirements.json
                  입력 2: _workspace/01_weather/forecast.json
                  입력 3: _workspace/01_local/spots.json
                  itinerary-optimization 스킬을 읽고 지시에 따른다.
                  날씨 악화 구간이 있으면 실내 장소로 대체 제안.
                  교통 연결 시간이 2시간 이상이면 transport-coordinator에게 SendMessage로 대안 요청.
                  완료 후 _workspace/02_itinerary/plan.json 저장."
       },
       {
         name: "transport-coordinator",
         agent_type: "transport-coordinator",
         model: "opus",
         prompt: "교통편 최적화를 담당하라.
                  입력 1: _workspace/00_input/requirements.json
                  입력 2: _workspace/01_transport/options.json
                  transport-planning 스킬을 읽고 지시에 따른다.
                  itinerary-planner에게 교통 연결 시간 대안 요청을 받으면 대안 교통편을 조회하여 응답.
                  일정 확정 후 _workspace/01_transport/selected.json 저장."
       }
     ]
   )
   ```

2. 작업 등록:
   ```
   TaskCreate(tasks: [
     {title: "일정 초안 수립", assignee: "itinerary-planner",
      description: "날씨·현지 정보 반영한 N박N일 일정 초안"},
     {title: "교통편 최적화", assignee: "transport-coordinator",
      depends_on: ["일정 초안 수립"],
      description: "일정에 맞는 KTX/SRT 최적 시간대 선정"},
     {title: "일정 확정", assignee: "itinerary-planner",
      depends_on: ["교통편 최적화"],
      description: "교통 시간 반영한 최종 일정 확정 및 저장"}
   ])
   ```

3. 팀 자체 조율 완료 대기 (TaskGet으로 상태 확인)
4. 팀 정리: `TeamDelete("travel-planning-team")`
5. 확정 일정을 읽어 사용자에게 미리 보고:
   ```
   === 여행 일정 초안 ===
   목적지: [목적지] / [N박N일]
   [DAY 1] 교통 출발 → 장소1 → 장소2 → 숙박
   [DAY 2] 장소3 → 장소4 → 장소5
   [DAY N] 장소N → 귀환 교통
   교통: [선택된 교통편 요약]
   ```

### Phase 3: 예약 실행 (서브 에이전트 + 사용자 게이트)

**실행 모드:** 서브 에이전트

1. 사용자에게 예약 여부 확인:
   ```
   === 예약을 진행할까요? ===
   [KTX/SRT 예약 대상 목록]
   예약을 진행하시겠습니까? (Y / N / 일부만)
   ```

2. 사용자가 Y이면 transport-coordinator 호출:
   - 입력: `_workspace/01_transport/selected.json`
   - 입력: `_workspace/00_input/requirements.json`
   - 스킬: `transport-planning` 스킬 읽고 수행 (내부적으로 ktx-booking 또는 srt-booking 활용)
   - **결제 자동화 없음 — 예약 번호 및 구입 기한만 확보**
   - 출력: `_workspace/03_bookings/results.json`

3. 사용자가 N이면 Phase 4로 바로 진행.

디렉토리 생성: `_workspace/03_bookings/`

### Phase 4: 여행 플랜 보고서 (서브 에이전트)

**실행 모드:** 서브 에이전트

trip-reporter 호출:
- 입력: `_workspace/00_input/requirements.json`
- 입력: `_workspace/01_weather/forecast.json`
- 입력: `_workspace/01_transport/selected.json`
- 입력: `_workspace/01_local/spots.json`
- 입력: `_workspace/02_itinerary/plan.json`
- 입력: `_workspace/03_bookings/results.json` (있는 경우)
- 출력: `trips/{국가}/{도시}/travel_plan.md`
  - 예: 부산 → `trips/한국/부산/travel_plan.md`
  - 목적지 정보는 `requirements.json`의 `destination`(도시)과 `country`(국가, 기본값: 한국) 참조
  - 디렉토리가 없으면 자동 생성

보고서 형식:
```markdown
# [목적지] N박N일 여행 플랜

## 여행 개요
- 일정: YYYY-MM-DD ~ YYYY-MM-DD
- 인원: N명
- 교통: [왕복 교통편]

## 날씨 예보
[날짜별 날씨 요약]

## 상세 일정
### DAY 1 (YYYY-MM-DD)
- 교통: 출발 HH:MM → 도착 HH:MM ([교통편])
- [시간] 장소명: 설명, 예상 소요 1-2시간
- 점심: 추천 맛집
- [시간] 장소명: 설명
- 저녁: 추천 맛집
- 숙박: 추천 숙박 형태 / 지역

### DAY N ...

## 예약 현황
[예약 완료 항목 or '예약 미진행']

## 여행 팁
[날씨, 현지 교통, 주의사항]
```

보고서 완성 후 사용자에게 핵심 하이라이트 요약.

## 데이터 흐름

```
requirements.json (Phase 0)
    ↓ (Phase 1, 병렬)
forecast.json    options.json    spots.json
    ↓ (Phase 2, 팀 — 교통↔일정 협업)
plan.json  ←→  selected.json
    ↓ (Phase 3, 사용자 확인 후)
results.json (예약 결과, 선택적)
    ↓ (Phase 4)
trips/{국가}/{도시}/travel_plan.md
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 날씨 API 실패 | 날씨 정보 없이 진행, 보고서에 "날씨 정보 수집 실패" 명시 |
| KTX/SRT 조회 실패 | "교통편 직접 조회 필요" 안내 후 일정 수립 계속 |
| 현지 정보 수집 실패 | 일반 관광지 정보로 대체, 보고서에 명시 |
| 일정 최적화 팀원 실패 | 가용 정보만으로 기본 일정 수립 |
| 예약 실패 (매진 등) | 대안 시간대 제시, 미예약 명시 |
| 사용자 N박N일 범위 초과 | "일정이 너무 깁니다. N일 이내로 나눠주세요" 안내 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "부산 2박3일 여행 계획 짜줘. 5월 1일 출발, 2명, 맛집 위주"
2. Phase 0: requirements.json 생성
3. Phase 1: 5월 1-3일 부산 날씨 + KTX/SRT 조회 + 부산 맛집/명소 병렬 수집
4. Phase 2: 날씨 양호 → 1일차 해운대, 2일차 광안리·국제시장, 3일차 송도 → 귀환 KTX 7시 선정
5. Phase 3: "KTX 서울→부산 1편 예약할까요?" → 사용자 Y → 예약 번호 획득
6. Phase 4: travel_plan.md 생성, 핵심 일정 요약 보고

### 에러 흐름
1. Phase 1에서 ktx-booking이 "매진" 반환
2. transport-coordinator가 SRT 대안 조회
3. SRT도 매진이면 "교통편 직접 조회 필요" 플래그 포함 일정 수립
4. 보고서에 "왕복 교통편 수동 예약 필요" 명시
