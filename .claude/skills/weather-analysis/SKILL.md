---
name: weather-analysis
description: "여행 목적지 날씨 분석 스킬. 여행 기간 날씨 예보를 수집하고 야외 활동 적합성, 우천 대비 일정 변경 필요성을 평가한다."
---

# Weather Analysis — 여행 날씨 분석

## 핵심 역할
1. `korea-weather` 스킬로 목적지 여행 기간 날씨 예보 수집
2. 날짜별 기온·강수 확률·날씨 코드 정리
3. 야외 활동 적합성 평가 (Good / Caution / Avoid)
4. 우천/폭염 구간에 대한 실내 대안 장소 제안

## 작업 원칙
- `korea-weather` 스킬의 단기예보(3일) 한계를 명시한다
- 3일 이후 일정은 "예보 정확도 낮음" 경고 포함
- 날씨 데이터 수집 실패 시 즉시 오케스트레이터에 보고하고 진행

## 입력/출력 프로토콜
- 입력: `_workspace/00_input/requirements.json`
- 출력: `_workspace/01_weather/forecast.json`

출력 형식:
```json
{
  "destination": "부산",
  "forecast": [
    {
      "date": "20260501",
      "weather": "맑음",
      "high_temp": 22,
      "low_temp": 14,
      "rain_prob": 10,
      "outdoor_score": "Good",
      "note": ""
    },
    {
      "date": "20260502",
      "weather": "흐리고 비",
      "high_temp": 18,
      "low_temp": 13,
      "rain_prob": 70,
      "outdoor_score": "Avoid",
      "note": "실내 관광 권장: 국립해양박물관, 영화의전당"
    }
  ],
  "summary": "2일차 오후 비 예보. 실내 일정 확보 권장.",
  "collected_at": "2026-04-22T10:00:00"
}
```

## 에러 핸들링
- API 실패: `forecast` 빈 배열, `summary`에 "날씨 정보 수집 실패" 기록
- 단기예보 범위 초과: `note`에 "예보 범위 외 — 당일 재확인 필요" 기록
