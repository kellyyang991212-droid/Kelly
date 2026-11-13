export type PlaceSuggestion = { id: string; name: string; subtitle: string; source: 'demo' | 'google' };
export type PlaceSelection = PlaceSuggestion & { address: string; latitude: number; longitude: number; googleMapsUri?: string; attributions?: { provider: string; providerUri?: string }[] };
export type SearchScope = 'trip' | 'world' | 'nearby';
export type Coordinates = { latitude: number; longitude: number };
export type SearchKind = 'places' | 'food';
export const placesApiUrl = (process.env.EXPO_PUBLIC_PLACES_API_URL ?? '').trim().replace(/\/$/, '');
export const placesMode = placesApiUrl ? 'google' : 'demo';
// Hand-authored prototype fixtures. These IDs are NOT Google Place IDs.
const fixtures: PlaceSelection[] = [
  { id: 'demo-kiyomizu', name: '清水寺', address: '日本京都府京都市東山區清水一丁目（示範地址）', subtitle: '京都・東山｜寺院與景點', latitude: 34.9949, longitude: 135.785, source: 'demo' },
  { id: 'demo-kiyomizuzaka', name: '清水坂', address: '日本京都府京都市東山區清水（示範地址）', subtitle: '京都・東山｜散步與商店', latitude: 34.997, longitude: 135.7808, source: 'demo' },
  { id: 'demo-fushimi', name: '伏見稻荷大社', address: '日本京都府京都市伏見區深草（示範地址）', subtitle: '京都・伏見｜神社與景點', latitude: 34.9671, longitude: 135.7727, source: 'demo' },
  { id: 'demo-gion', name: '祇園・花見小路', address: '日本京都府京都市東山區祇園町（示範地址）', subtitle: '京都・祇園｜街區散步', latitude: 35.003, longitude: 135.775, source: 'demo' },
  { id: 'demo-nishiki', name: '錦市場', address: '日本京都府京都市中京區（示範地址）', subtitle: '京都・市中心｜市場與美食', latitude: 35.005, longitude: 135.7649, source: 'demo' },
  { id: 'demo-arashiyama', name: '嵐山竹林小徑', address: '日本京都府京都市右京區嵯峨（示範地址）', subtitle: '京都・嵐山｜自然景點', latitude: 35.017, longitude: 135.671, source: 'demo' },
  { id: 'demo-coffee', name: '京都河畔咖啡（虛構）', address: '日本京都・鴨川附近（虛構示範地址）', subtitle: '京都｜咖啡、甜點、餐廳', latitude: 35.01, longitude: 135.771, source: 'demo' },
  { id: 'demo-ramen', name: '京都暖湯拉麵（虛構）', address: '日本京都・三條附近（虛構示範地址）', subtitle: '京都｜拉麵、日式餐廳', latitude: 35.009, longitude: 135.772, source: 'demo' },
  { id: 'demo-matcha', name: '東山抹茶甜點（虛構）', address: '日本京都・東山附近（虛構示範地址）', subtitle: '京都｜抹茶、咖啡、甜點', latitude: 34.999, longitude: 135.78, source: 'demo' },
  { id: 'demo-beefsoup', name: '台南巷口牛肉湯（虛構）', address: '台灣台南・中西區附近（虛構示範地址）', subtitle: '台南｜牛肉湯、小吃、餐廳', latitude: 22.998, longitude: 120.2, source: 'demo' },
  { id: 'demo-gyoen', name: '京都御苑', address: '日本京都府京都市上京區（示範地址）', subtitle: '京都・上京｜公園與散步', latitude: 35.025, longitude: 135.763, source: 'demo' },
  { id: 'demo-tainan', name: '赤崁樓', address: '台灣台南市中西區民族路二段（示範地址）', subtitle: '台南｜古蹟與景點', latitude: 22.997, longitude: 120.202, source: 'demo' },
  { id: 'demo-shennong', name: '神農街', address: '台灣台南市中西區神農街（示範地址）', subtitle: '台南｜老街與散步', latitude: 22.998, longitude: 120.196, source: 'demo' },
  { id: 'demo-taipei', name: '台北 101', address: '台灣台北市信義區信義路五段（示範地址）', subtitle: '台北｜地標與購物', latitude: 25.0339, longitude: 121.5645, source: 'demo' },
];
const normalize = (value: string) => value.normalize('NFKC').replace(/臺/g, '台').replace(/\s+/g, '').toLowerCase();
export function demoSuggestions(query: string, destination: string, scope: SearchScope, kind: SearchKind = 'places', center?: Coordinates): PlaceSuggestion[] {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!terms.length && kind !== 'food') return [];
  const region = ['京都', '台南', '台北'].find(r => normalize(destination).includes(r));
  if (scope === 'trip' && kind === 'food' && !region) return [];
  const distance = (p: Coordinates) => center ? Math.hypot((p.latitude - center.latitude) * 111, (p.longitude - center.longitude) * 111 * Math.cos(center.latitude * Math.PI / 180)) : 0;
  return fixtures.filter(p => (kind !== 'food' || /餐廳|咖啡|小吃|拉麵|甜點/.test(p.subtitle)) && (scope === 'nearby' ? !!center && distance(p) <= 50 : scope === 'world' || !region || p.address.includes(region)) && terms.every(term => normalize(p.name + p.address + p.subtitle).includes(term))).sort((a, b) => distance(a) - distance(b)).slice(0, 5).map(({ id, name, subtitle, source }) => ({ id, name, subtitle, source }));
}
export function newPlacesSession(): string {
  return Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
}
async function api<T>(route: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!placesApiUrl) throw new Error('尚未設定地點搜尋服務。');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 10000);
  try {
    const response = await fetch(`${placesApiUrl}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '搜尋暫時無法使用，請稍後重試。');
    return result as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (controller.signal.aborted) throw new Error('地點查詢逾時，請重試。');
    if (cause instanceof TypeError) throw new Error('無法連線到地點搜尋服務，請檢查網路與設定。');
    throw cause;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export async function searchPlaces(query: string, destination: string, scope: SearchScope, sessionToken: string, signal?: AbortSignal, options: { kind?: SearchKind; center?: Coordinates } = {}): Promise<PlaceSuggestion[]> {
  if (!placesApiUrl) return demoSuggestions(query, destination, scope, options.kind, options.center);
  return (await api<{ suggestions: PlaceSuggestion[] }>('autocomplete', { query, destination, scope, sessionToken, ...options }, signal)).suggestions;
}
export async function selectPlace(id: string, sessionToken: string, signal?: AbortSignal): Promise<PlaceSelection> {
  if (!placesApiUrl) {
    const fixture = fixtures.find(p => p.id === id);
    if (!fixture) throw new Error('找不到這個示範地點，請重新搜尋。');
    return { ...fixture };
  }
  return api<PlaceSelection>('details', { placeId: id, sessionToken }, signal);
}
export function staticMapUrl(placeId: string): string {
  return `${placesApiUrl}/map?placeId=${encodeURIComponent(placeId)}`;
}
