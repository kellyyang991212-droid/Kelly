import type { SearchKind } from './places';

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

const restaurants = [
  ['京都', '本家第一旭 本店', '下京區', '拉麵 ラーメン Ramen 京都車站'],
  ['京都', '新福菜館 本店', '下京區', '拉麵 ラーメン Ramen 炒飯 京都車站'],
  ['京都', '麵屋豬一', '下京區', '麺屋猪一 拉麵 ラーメン Ramen'],
  ['京都', '% Arabica 京都東山店', '東山區', '咖啡 カフェ Coffee Cafe 清水寺'],
  ['京都', '祇園辻利 祇園本店', '東山區', '抹茶 甜點 Matcha'],
  ['台南', '文章牛肉湯 安平總店', '安平區', '牛肉湯 早餐'],
  ['台南', '六千牛肉湯', '中西區', '牛肉湯 早餐'],
  ['台南', '阿裕牛肉涮涮鍋 崑崙店', '仁德區', '牛肉湯 火鍋'],
  ['台南', '蜷尾家 甘味處', '中西區', '霜淇淋 甜點 冰淇淋'],
  ['台北', '阜杭豆漿', '中正區', '早餐 燒餅 油條'],
  ['台北', '金峰魯肉飯', '中正區', '滷肉飯 小吃'],
  ['台北', '鼎泰豐 101店', '信義區', '小籠包 101'],
  ['台北', '興波咖啡 華山旗艦店', '中正區', '咖啡 Coffee Cafe Simple Kaffa'],
  ['東京', '一蘭 澀谷店', '澀谷區', '拉麵 ラーメン Ramen Ichiran 渋谷'],
  ['大阪', '道頓堀 今井本店', '中央區', '烏龍麵 うどん'],
  ['大阪', '金龍拉麵 道頓堀店', '中央區', '拉麵 ラーメン Ramen'],
];

const normalize = (value: string) => value.normalize('NFKC').replace(/臺/g, '台').replace(/\s+/g, '').toLowerCase();

export function findItineraryPlaces(query: string, destination: string, kind: SearchKind = 'places'): ItineraryPlace[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  if (!terms.length) return [];

  const region = normalize(destination);
  return (kind === 'food' ? restaurants : sights)
    .filter(([city, name, area, aliases]) => terms.every(term => normalize(`${name} ${city} ${area} ${aliases}`).includes(term)))
    .sort(([a], [b]) => Number(region.includes(b)) - Number(region.includes(a)))
    .slice(0, 5)
    .map(([city, name, area]) => ({ id: `${city}-${name}`, name, address: `${city}・${area}` }));
}

type PhotonProperties = Partial<Record<'name' | 'street' | 'housenumber' | 'district' | 'city' | 'county' | 'state' | 'country' | 'osm_key' | 'osm_value', string>>;
const foodTags = ['amenity:restaurant', 'amenity:cafe', 'amenity:fast_food', 'amenity:food_court', 'amenity:ice_cream', 'shop:bakery', 'shop:pastry', 'shop:confectionery'];

export async function searchItineraryPlaces(query: string, destination: string, signal: AbortSignal, kind: SearchKind = 'places'): Promise<ItineraryPlace[]> {
  const terms = [destination.replace(/・/g, ' ').trim(), query.trim()].filter(Boolean).join(' ');
  const filters = kind === 'food' ? foodTags.map(tag => `&osm_tag=${encodeURIComponent(tag)}`).join('') : '';
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(terms)}&limit=5${filters}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('地點搜尋服務暫時無法使用。');
  const data = await response.json() as { features?: { properties?: PhotonProperties }[] };
  if (!Array.isArray(data?.features)) throw new Error('地點搜尋服務回傳格式有誤。');

  const results = new Map<string, ItineraryPlace>();
  for (const { properties: p } of data.features) {
    if (typeof p?.name !== 'string' || !p.name.trim()) continue;
    if (kind === 'food' && !foodTags.includes(`${p.osm_key}:${p.osm_value}`)) continue;
    const name = p.name.trim();
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const address = [...new Set([p.country, p.state, p.city ?? p.county, p.district, street].filter(part => part && part !== name))].join('・');
    const id = `${name}-${address}`;
    results.set(id, { id, name, address });
  }
  return [...results.values()];
}
