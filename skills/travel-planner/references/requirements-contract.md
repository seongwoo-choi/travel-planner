# Requirements Contract

`requirements.json`에는 사용자가 제공한 여행 요구사항만 기록한다. 없는 사실을 추정해 채우지 않는다.

## Required

- `destination`: 비어 있지 않은 문자열
- `startDate`: 유효한 `YYYY-MM-DD` 날짜
- `nights` 또는 `endDate`
- `travelers`: 양의 정수

`nights`는 0~30의 정수다. `endDate`를 쓰면 `startDate`보다 이르지 않아야 하며, 두 날짜의 차이를 숙박 수로 사용한다. 31일 이상이거나 날짜를 해석할 수 없으면 자동 일정 생성 대신 `needs_review`로 남긴다.

## Optional

- `country`, `origin`, `companions`, `tripType`, `accommodation`
- `budgetPerPerson`, `transportPref`, `highlights`
- `arrivalTime`, `departureTime`

도착 시각은 첫날 가용 시간을, 출발 시각은 마지막 날 가용 시간을 좁힌다. `HH:MM` 형식이 아니거나 가용 시간 밖의 활동이 있으면 확정 일정으로 표시하지 않는다.

`transportPref`는 사용자가 제공한 선호일 뿐, 실제 주요 교통 또는 현지 이동의 사실 근거가 아니다.
