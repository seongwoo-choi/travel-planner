---
name: itinerary-optimization
description: "여행 일정 최적화 스킬. 날씨·교통·현지 정보를 종합하여 N박N일 최적 일정을 수립한다. 이동 동선 최소화, 날씨 적합성, 여행 스타일 반영이 핵심이다."
---

# Itinerary Optimization — 여행 일정 최적화

## 핵심 역할
1. 날씨·교통·현지 정보를 종합한 N박N일 일정 수립
2. 이동 동선 최소화 (같은 지역 장소 묶기)
3. 날씨 부적합 구간에 실내 장소 자동 대체
4. 식사·이동·관람 시간 균형 배분

## 일정 수립 원칙
- 하루 이동 거리: 도보+대중교통 기준 4시간 이내 권장
- 식사 간격: 점심 12~13시, 저녁 18~19시 고정 블록
- 하루 명소: 3~5곳 (피로도 고려, 5곳 초과 금지)
- 오전 야외, 오후 실내 배치 (더위/비 대비)
- 마지막 날: 귀환 교통 출발 2시간 전 체크아웃·이동 시작

## 입력/출력 프로토콜
- 입력: `_workspace/00_input/requirements.json`
- 입력: `_workspace/01_weather/forecast.json`
- 입력: `_workspace/01_local/spots.json`
- 입력: `_workspace/01_transport/selected.json` (Phase 2 중 transport-coordinator로부터 수신)
- 출력: `_workspace/02_itinerary/plan.json`

출력 형식:
```json
{
  "destination": "부산",
  "total_days": 3,
  "total_nights": 2,
  "days": [
    {
      "day": 1,
      "date": "20260501",
      "theme": "이동 + 해운대",
      "weather_note": "맑음, 야외 활동 적합",
      "schedule": [
        {
          "time": "08:00",
          "type": "transport",
          "item": "KTX 서울 출발",
          "duration_min": 153,
          "note": ""
        },
        {
          "time": "10:33",
          "type": "arrival",
          "item": "부산역 도착 → 해운대 이동 (지하철 40분)",
          "duration_min": 40,
          "note": ""
        },
        {
          "time": "12:00",
          "type": "meal",
          "item": "점심: 해운대 시장 밀면",
          "duration_min": 60,
          "note": ""
        },
        {
          "time": "13:30",
          "type": "attraction",
          "item": "해운대 해수욕장",
          "duration_min": 120,
          "note": ""
        },
        {
          "time": "16:00",
          "type": "attraction",
          "item": "동백섬 산책",
          "duration_min": 90,
          "note": ""
        },
        {
          "time": "18:30",
          "type": "meal",
          "item": "저녁: 해운대 꼼장어 골목",
          "duration_min": 90,
          "note": ""
        },
        {
          "time": "20:30",
          "type": "accommodation",
          "item": "해운대 숙소 체크인",
          "duration_min": 0,
          "note": "해운대 해수욕장 도보권 숙소 권장"
        }
      ]
    }
  ],
  "optimization_notes": [
    "2일차 오후 우천 예보 — 실내 장소(국립해양박물관) 배치 완료",
    "해운대↔광안리 이동 최소화를 위해 지역별 일정 묶음"
  ]
}
```

## 최적화 워크플로우

### 1. 날씨 적합성 매핑
각 날짜의 `outdoor_score`를 확인:
- Good: 야외 명소 우선 배치
- Caution: 오전 야외, 오후 실내 분리
- Avoid: 실내 장소로 전면 대체

### 2. 동선 클러스터링
`spots.json`의 장소를 `area`별로 그룹핑.
같은 지역 장소를 같은 날 배치하여 이동 시간 최소화.

### 3. 교통 연결 검증
- 도착 첫 날: 교통 도착 시간 + 이동 시간 후 여유 30분
- 마지막 날: 귀환 교통 출발 시간 - 이동 시간 - 체크아웃 1시간 = 마지막 활동 종료 시간
- 연결 시간이 타이트하면 transport-coordinator에게 SendMessage: "귀환 교통 [열차명] 출발 [시간]으로 마지막 날 오후 일정 제약. 대안 열차 있나요?"

### 4. 식사 블록 배치
`restaurants` 목록에서 당일 동선과 가까운 식당 선택.
점심/저녁 각 1곳 배치, 기타는 여행 팁으로 추가.

### 5. 확정 및 저장
전체 일정 검토 후 `plan.json` 저장.

## 에러 핸들링
- 장소 데이터 부족: 유명 관광지 기본값으로 채우고 "추가 탐색 권장" 명시
- 교통 연결 불가능: "마지막 날 일정 단축 필요" 경고 포함
- 3일 초과 단기예보 범위: 해당 날짜 일정에 "날씨 미확인" 주석
