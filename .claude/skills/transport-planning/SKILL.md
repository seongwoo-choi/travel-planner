---
name: transport-planning
description: "여행 교통편 계획 및 예약 스킬. KTX, SRT, 고속버스 등 교통 옵션을 비교하고 최적 편을 선정한다. 예약 실행 시 ktx-booking 또는 srt-booking 스킬을 활용한다."
---

# Transport Planning — 여행 교통편 계획

## 핵심 역할
1. 출발지 → 목적지 구간의 교통 옵션 조회 (KTX / SRT / 고속버스)
2. 날짜·시간·인원 조건에 맞는 후보 열차/버스 목록 정리
3. 일정과의 연결 시간 검증 (도착지 첫 목적지까지 이동 시간 고려)
4. 최적 편 선정 후 예약 실행 (사용자 확인 후)

## 교통 수단 선택 기준
- **KTX**: 서울 출발, 경부선/호남선/전라선/경강선 주요 도시
- **SRT**: 수서 출발, 경부선/호남선 주요 도시
- **고속버스**: KTX/SRT 미운행 지역, 또는 더 저렴한 대안
- **자차**: 사용자 명시 요청 시만 고려 (경로 안내만)

## 작업 원칙
- KTX와 SRT 모두 해당되는 구간은 둘 다 조회하여 비교 제시
- 편도 조회 먼저, 왕복은 귀환 날짜 확정 후 순차 진행
- 예약은 반드시 사용자 확인 후에만 실행
- 결제 자동화 없음 — 예약 번호 및 구입 기한 확보까지만 진행

## 입력/출력 프로토콜
- 입력: `_workspace/00_input/requirements.json`
- 조회 출력: `_workspace/01_transport/options.json`
- 선정 출력: `_workspace/01_transport/selected.json`
- 예약 결과: `_workspace/03_bookings/results.json`

### options.json 형식
```json
{
  "outbound": [
    {
      "type": "KTX",
      "departure_station": "서울",
      "arrival_station": "부산",
      "departure_time": "08:00",
      "arrival_time": "10:33",
      "duration_min": 153,
      "price_adult": 59800,
      "available": true,
      "train_id": "KTX-001-20260501"
    }
  ],
  "return": [...]
}
```

### selected.json 형식
```json
{
  "outbound": {
    "type": "KTX",
    "train_id": "KTX-001-20260501",
    "departure": "서울 08:00",
    "arrival": "부산 10:33",
    "price_total": 119600,
    "reason": "오전 최초 편 — 하루 최대 활용 가능"
  },
  "return": {...}
}
```

## 조회 워크플로우

### 1. 교통 수단 결정
`requirements.json`의 `transport_pref`가 "auto"이면:
- 서울↔부산, 서울↔대전, 서울↔대구, 서울↔광주: KTX + SRT 모두 조회
- 그 외 구간: KTX 우선, 없으면 고속버스 안내

### 2. KTX 조회 (해당하는 경우)
`ktx-booking` 스킬을 읽고 search 단계를 수행:
```bash
python3 scripts/ktx_booking.py search [출발역] [도착역] [날짜] [시간] --limit 5
```

### 3. SRT 조회 (해당하는 경우)
`srt-booking` 스킬을 읽고 search 단계를 수행.

### 4. 옵션 비교 정리
두 스킬의 조회 결과를 `options.json`에 통합하여 저장.

### 5. 최적 편 선정 (Phase 2 팀 내 or 단독)
- 일정 시작 시간에 맞는 최조 도착 열차 우선
- 귀환편은 마지막 일정 종료 + 이동 시간 + 여유 1시간 이후 출발
- `selected.json`에 선정 이유 포함

## 예약 워크플로우 (Phase 3, 사용자 확인 후)

1. `selected.json`에서 교통편 목록 확인
2. KTX이면 `ktx-booking` 스킬의 reserve 단계 수행
3. SRT이면 `srt-booking` 스킬의 reserve 단계 수행
4. 예약 번호, 운임, 구입 기한을 `results.json`에 저장
5. 예약 실패(매진)이면 대안 교통편 제시

## 에러 핸들링
- 로그인 실패: 즉시 중단, credential 확인 안내
- 매진: 다음 시간대 3편 대안 제시
- API 오류: 1회 재시도 후 실패 기록
