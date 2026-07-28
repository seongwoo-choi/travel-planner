export function buildMapLinks(plan) {
  const destination = String(plan.destination || "").trim();
  const country = String(plan.country || "").trim();
  const query = [country, destination].filter(Boolean).join(" ") || "여행지";
  const encoded = encodeURIComponent(query);

  return [
    {
      label: "네이버지도",
      url: `https://map.naver.com/p/search/${encoded}`,
    },
    {
      label: "카카오맵",
      url: `https://map.kakao.com/link/search/${encoded}`,
    },
    {
      label: "구글맵",
      url: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    },
  ];
}
