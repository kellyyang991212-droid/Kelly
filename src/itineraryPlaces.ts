export type ItineraryPlace = { id: string; name: string; address: string };

// Use area names for the built-in list rather than approximate street addresses or coordinates.
const sights = [
  ['京都', '清水寺', '東山區', 'きよみずでら Kiyomizu-dera 寺廟'],
  ['京都', '清水坂', '東山區', '老街 散步'],
  ['京都', '伏見稻荷大社', '伏見區', '千本鳥居 神社'],
  ['京都', '祇園花見小路', '東山區', '老街 散步'],
  ['京都', '錦市場', '中京區', '市場 美食'],
  ['京都', '嵐山竹林小徑', '右京區', '竹林 散步'],
  ['京都', '京都御苑', '上京區', '公園 散步'],
  ['京都', '金閣寺', '北區', '鹿苑寺 寺廟'],
  ['京都', '二條城', '中京區', '二条城 古蹟'],
  ['台南', '赤崁樓', '中西區', '赤嵌樓 古蹟'],
  ['台南', '神農街', '中西區', '老街 散步'],
  ['台南', '安平古堡', '安平區', '古蹟 熱蘭遮城'],
  ['台南', '奇美博物館', '仁德區', '展覽 美術館'],
  ['台南', '台南孔廟', '中西區', '古蹟'],
  ['台北', '台北 101', '信義區', '地標 觀景台'],
  ['台北', '國立故宮博物院', '士林區', '故宮 博物館'],
  ['台北', '中正紀念堂', '中正區', '自由廣場'],
  ['台北', '艋舺龍山寺', '萬華區', '寺廟 古蹟'],
  ['東京', '淺草寺', '台東區', '雷門 浅草 寺廟'],
  ['東京', '東京晴空塔', '墨田區', 'Skytree 地標'],
  ['東京', '東京鐵塔', '港區', '地標 觀景台'],
  ['大阪', '大阪城', '中央區', '天守閣 古蹟'],
  ['大阪', '道頓堀', '中央區', '心齋橋 美食'],
  ['大阪', '通天閣', '浪速區', '新世界 地標'],
];

const normalize = (value: string) => value.normalize('NFKC').replace(/臺/g, '台').replace(/\s+/g, '').toLowerCase();

export function findItineraryPlaces(query: string, destination: string): ItineraryPlace[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  if (!terms.length) return [];

  const region = normalize(destination);
  return sights
    .filter(([city, name, area, aliases]) => terms.every(term => normalize(`${name} ${city} ${area} ${aliases}`).includes(term)))
    .sort(([a], [b]) => Number(region.includes(b)) - Number(region.includes(a)))
    .slice(0, 5)
    .map(([city, name, area]) => ({ id: `${city}-${name}`, name, address: `${city}・${area}` }));
}

type PhotonProperties = Partial<Record<'name' | 'street' | 'housenumber' | 'district' | 'city' | 'county' | 'state' | 'country', string>>;

export async function searchItineraryPlaces(query: string, destination: string, signal: AbortSignal): Promise<ItineraryPlace[]> {
  const terms = [destination.replace(/・/g, ' ').trim(), query.trim()].filter(Boolean).join(' ');
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(terms)}&limit=5`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('景點搜尋服務暫時無法使用。');
  const data = await response.json() as { features?: { properties?: PhotonProperties }[] };
  if (!Array.isArray(data?.features)) throw new Error('景點搜尋服務回傳格式有誤。');

  const results = new Map<string, ItineraryPlace>();
  for (const { properties: p } of data.features) {
    if (typeof p?.name !== 'string' || !p.name.trim()) continue;
    const name = p.name.trim();
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const address = [...new Set([p.country, p.state, p.city ?? p.county, p.district, street].filter(part => part && part !== name))].join('・');
    const id = `${name}-${address}`;
    results.set(id, { id, name, address });
  }
  return [...results.values()];
}
