# Evidence Contract

`_workspace/01_evidence/evidence.json`은 다음 형태다.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-29T00:00:00Z",
  "evidence": {
    "places": {},
    "weather": {},
    "timezone": {},
    "travel": {}
  }
}
```

top-level `generatedAt`은 필수 ISO-8601 timestamp다. freshness clock으로는 사용하지 않으며 artifact provenance만 나타낸다.

모든 snapshot은 `source`, ISO-8601 `fetchedAt`, ISO-8601 `expiresAt`, `status`를 가진다. `expiresAt`은 `fetchedAt`보다 뒤여야 하며 해당 시각부터 만료다. 5분 clock skew를 넘는 미래 `fetchedAt`, 누락·malformed timestamp, 만료된 snapshot은 planner가 거부한다. 확인할 수 없는 값은 생략하거나 `unavailable`로 표시한다.

## places

필수 필드:

- `destinationLocation`: `{ latitude, longitude }`
- `items`: 장소 배열
- `searchCoverage`: 한 개 이상의 조사 범위별 `verified|degraded|unavailable`

장소 필드:

- `id`, `name`, `category`, `durationMinutes`, `score`
- `latitude`, `longitude`, `sourceUrl`
- `openingHoursStatus`: `verified|estimated|unknown`
- `openingHours`: `{ "YYYY-MM-DD": { "open": "HH:MM", "close": "HH:MM" } }`
- `required`: 사용자 지정 필수 장소일 때만 `true`
- `outdoor`: 야외라는 양성 근거가 있을 때만 `true`
- `indoor`: 실내라는 양성 근거가 있을 때만 `true`

`estimated`와 `unknown` 영업시간은 evidence에는 남기되 실행 일정 후보가 아니다. places snapshot 자체가 `unavailable`이면 items가 들어 있어도 일정에 사용하지 않는다.

## weather

- `timezone`: IANA timezone
- `days`: `{ date, temperatureMin, temperatureMax, precipitationProbability }[]`
- 아직 예보가 게시되지 않았으면 `status: forecast_horizon`과 `refreshAfter`
- provider 실패면 `status: unavailable`, `days: []`, `error`

## timezone

- `timezone`: 실제 IANA timezone
- 검증 실패 시 `status: unavailable`; 임의 timezone을 verified로 만들지 않는다.

## travel

- `matrix`: `"fromId|toId": durationMinutes`
- 기준지는 `base`
- `localTransport`: `{ mode, status }`
- `majorTransport.outbound|inbound`: `{ direction, origin, destination, mode, status, durationMinutes? }`

matrix 누락 경로는 0분이 아니다. travel snapshot 자체가 `unavailable`이면 matrix가 들어 있어도 일정에 사용하지 않는다. 주요 교통의 duration을 확인하지 못했다면 `status: unavailable`과 `reason`을 기록한다.

## Provenance

- URL은 공개 source URL만 기록한다.
- API key, token, credential, signature 등 인증 query parameter나 URL userinfo가 포함된 `sourceUrl`은 CLI가 거부한다.
- blog/LLM 요약만으로 영업시간·가격·교통시간을 verified로 만들지 않는다.
- 서로 충돌하는 source는 최신성만으로 자동 선택하지 말고 확인 작업으로 남긴다.
