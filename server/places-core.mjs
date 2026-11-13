export class PlacesError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const centers = [
  { names: ['京都', 'kyoto'], latitude: 35.0116, longitude: 135.7681 },
  { names: ['大阪', 'osaka'], latitude: 34.6937, longitude: 135.5023 },
  { names: ['東京', 'tokyo'], latitude: 35.6762, longitude: 139.6503 },
  { names: ['台南', '臺南', 'tainan'], latitude: 22.9999, longitude: 120.2269 },
  { names: ['台北', '臺北', 'taipei'], latitude: 25.033, longitude: 121.5654 },
];
function string(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new PlacesError(`${label}格式不正確。`);
  return value.trim();
}
export function placeId(value) {
  const id = string(value, '地點識別碼', 256);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || id.startsWith('demo-')) throw new PlacesError('地點識別碼格式不正確。');
  return id;
}
export function sessionToken(value) {
  const token = string(value, '搜尋工作階段', 36);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new PlacesError('搜尋工作階段格式不正確。');
  return token;
}
export function autocompleteBody(data) {
  const input = string(data.query, '搜尋文字', 150);
  if (!['trip', 'world', 'nearby'].includes(data.scope)) throw new PlacesError('搜尋範圍格式不正確。');
  if (data.kind && !['places', 'food'].includes(data.kind)) throw new PlacesError('搜尋類別格式不正確。');
  const destination = typeof data.destination === 'string' ? data.destination.trim().slice(0, 100) : '';
  const center = searchCenter(data);
  const body = { input, languageCode: 'zh-TW', sessionToken: sessionToken(data.sessionToken), includeQueryPredictions: false };
  if (data.kind === 'food') body.includedPrimaryTypes = ['restaurant', 'cafe', 'bakery', 'bar'];
  if (center) body.locationBias = { circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: 50000 } };
  // A destination without a configured center still provides textual location context.
  else if (data.scope === 'trip' && destination) body.input = `${destination} ${input}`;
  return body;
}
function searchCenter(data) {
  if (data.scope === 'nearby') {
    const c = data.center;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) throw new PlacesError('定位座標無效，請重新取得位置。');
    return { latitude: c.latitude, longitude: c.longitude };
  }
  const destination = typeof data.destination === 'string' ? data.destination.toLowerCase() : '';
  return data.scope === 'trip' ? centers.find(c => c.names.some(n => destination.includes(n))) : null;
}
export function nearbyFoodBody(data) {
  if (!['trip', 'nearby'].includes(data.scope)) throw new PlacesError('請輸入關鍵字，或選擇旅行／目前位置附近。');
  const center = searchCenter(data);
  if (!center) throw new PlacesError('這個目的地尚未設定搜尋中心，請輸入「城市＋美食」或使用目前位置。');
  return { includedTypes: ['restaurant', 'cafe', 'bakery'], maxResultCount: 10, languageCode: 'zh-TW', rankPreference: 'DISTANCE', locationRestriction: { circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: 3000 } } };
}
async function googleJson(url, options, fetcher) {
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) }); }
  catch { throw new PlacesError('Google 地點服務連線逾時或失敗，請稍後重試。', 502); }
  if (!response.ok) {
    if (response.status === 429) throw new PlacesError('Google 查詢額度已達限制，請稍後重試。', 429);
    if ([401, 403].includes(response.status)) throw new PlacesError('Google 服務尚未授權，請檢查後端金鑰、API 啟用與帳單設定。', 503);
    throw new PlacesError('Google 地點查詢失敗，請重新搜尋。', 502);
  }
  try { return await response.json(); } catch { throw new PlacesError('地點服務回傳格式不正確。', 502); }
}
export function createPlacesService({ key, staticKey = key, fetcher = fetch }) {
  const requireKey = () => { if (!key) throw new PlacesError('尚未設定 Google Places 金鑰，請依設定文件啟用服務。', 503); };
  async function details(data, forMap = false) {
    const id = placeId(data.placeId);
    const token = forMap ? '' : sessionToken(data.sessionToken);
    requireKey();
    const params = new URLSearchParams({ languageCode: 'zh-TW' });
    if (token) params.set('sessionToken', token);
    const result = await googleJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?${params}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': forMap ? 'id,location' : 'id,displayName,formattedAddress,location,googleMapsUri,attributions' },
    }, fetcher);
    if (!Number.isFinite(result.location?.latitude) || !Number.isFinite(result.location?.longitude)) throw new PlacesError('這個地點沒有可用的座標，請選擇其他結果。', 422);
    return { id, name: result.displayName?.text ?? '', subtitle: result.formattedAddress ?? '', address: result.formattedAddress ?? '', latitude: result.location.latitude, longitude: result.location.longitude, googleMapsUri: result.googleMapsUri, attributions: result.attributions ?? [], source: 'google' };
  }
  return {
    async autocomplete(data) {
      if (data.kind === 'food' && typeof data.query === 'string' && !data.query.trim()) {
        const body = nearbyFoodBody(data); requireKey();
        const result = await googleJson('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress' }, body: JSON.stringify(body) }, fetcher);
        return { suggestions: (result.places ?? []).filter(p => p.id).map(p => ({ id: p.id, name: p.displayName?.text ?? '未命名店家', subtitle: p.formattedAddress ?? '', source: 'google' })) };
      }
      const body = autocompleteBody(data); requireKey();
      const result = await googleJson('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat' }, body: JSON.stringify(body),
      }, fetcher);
      return { suggestions: (result.suggestions ?? []).filter(s => s.placePrediction?.placeId).slice(0, 5).map(({ placePrediction: p }) => ({ id: p.placeId, name: p.structuredFormat?.mainText?.text || p.text?.text || '未命名地點', subtitle: p.structuredFormat?.secondaryText?.text || '', source: 'google' })) };
    },
    details,
    async map(id) {
      if (!staticKey) throw new PlacesError('尚未設定地圖預覽服務。', 503);
      const place = await details({ placeId: id }, true);
      const params = new URLSearchParams({ center: `${place.latitude},${place.longitude}`, zoom: '15', size: '600x300', scale: '2', maptype: 'roadmap', language: 'zh-TW', markers: `color:0x32644D|${place.latitude},${place.longitude}`, key: staticKey });
      let response;
      try { response = await fetcher(`https://maps.googleapis.com/maps/api/staticmap?${params}`, { signal: AbortSignal.timeout(8000) }); }
      catch { throw new PlacesError('地圖預覽連線失敗。', 502); }
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new PlacesError('地圖預覽尚未啟用或暫時無法載入。', 502);
      return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type') };
    },
  };
}
