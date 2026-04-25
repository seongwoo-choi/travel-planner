---
name: local-discovery
description: "여행지 현지 정보 탐색 스킬. 목적지의 맛집, 관광 명소, 숙박 정보를 수집하고 여행 스타일에 맞게 필터링한다. blue-ribbon-nearby, naver-blog-research 스킬을 활용한다."
---

# Local Discovery — 현지 정보 탐색

## 핵심 역할
1. 목적지 맛집 탐색 (블루리본서베이 활용)
2. 여행지 명소·코스 정보 수집 (네이버 블로그 활용)
3. 여행 스타일에 맞는 장소 필터링 및 우선순위 정렬
4. 방문 소요 시간, 입장료, 운영 시간 정리

## 작업 원칙
- 여행 스타일(맛집/자연/역사/쇼핑/휴식)에 따라 장소 가중치 조정
- 최소 숙박 1박당 맛집 2~3곳, 명소 3~5곳 확보
- 중복·폐업 가능성이 높은 장소는 "확인 필요" 표시
- 대중 교통으로 이동 가능한 동선 고려

## 입력/출력 프로토콜
- 입력: `_workspace/00_input/requirements.json`
- 출력: `_workspace/01_local/spots.json`

출력 형식:
```json
{
  "destination": "부산",
  "travel_style": ["맛집", "바다"],
  "restaurants": [
    {
      "name": "어묵 고래",
      "category": "해산물/어묵",
      "area": "남포동",
      "rating": "블루리본 1리본",
      "estimated_cost": 15000,
      "note": "줄서기 필요, 오픈 30분 전 도착 권장",
      "open_hours": "11:00-20:00"
    }
  ],
  "attractions": [
    {
      "name": "해운대 해수욕장",
      "category": "해변",
      "area": "해운대",
      "duration_hours": 2,
      "admission": 0,
      "note": "5월 오전 한적",
      "indoor": false
    },
    {
      "name": "국립해양박물관",
      "category": "박물관",
      "area": "영도",
      "duration_hours": 2,
      "admission": 0,
      "note": "우천 시 대안 장소",
      "indoor": true
    }
  ],
  "accommodation_areas": ["해운대", "광안리", "서면"],
  "local_tips": [
    "해운대 → 광안리 도보 약 40분 또는 버스 15분",
    "국제시장 주차 매우 어려움 — 지하철 이용 권장"
  ],
  "collected_at": "2026-04-22T10:00:00"
}
```

## 탐색 워크플로우

### 1. 맛집 탐색
`blue-ribbon-nearby` 스킬로 목적지 주요 지역 식당 조회.
여행 스타일에 맞게 카테고리 필터:
- 맛집: 전체
- 자연/역사: 지역 향토음식 위주
- 쇼핑: 접근성 좋은 식당
- 휴식: 분위기 좋은 카페·레스토랑

### 2. 명소 탐색
`naver-blog-research` 스킬로 `[목적지] [여행 스타일] 추천 코스` 검색.
최근 6개월 이내 포스트 우선, 오래된 정보는 "확인 필요" 태그.

### 3. 실내/실외 분류
날씨 분석 결과와 연계를 위해 각 장소의 `indoor` 필드 반드시 기입.

## 에러 핸들링
- blue-ribbon-nearby 실패: 네이버 블로그 맛집 검색으로 대체
- naver-blog-research 실패: 일반 관광지 데이터로 대체, "최신 정보 직접 확인 권장" 명시
- 장소 없음: 인근 도시로 범위 확장 후 재탐색
