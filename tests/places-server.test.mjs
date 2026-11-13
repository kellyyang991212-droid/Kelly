import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocompleteBody, createPlacesService, nearbyFoodBody, placeId } from '../server/places-core.mjs';

test('Google autocomplete 使用繁中、同一 session 與旅行附近偏好，切換全區解除偏好', () => {
  const body = autocompleteBody({ query: '清水', destination: '日本・京都', scope: 'trip', sessionToken: 'Session123' });
  assert.equal(body.languageCode, 'zh-TW');
  assert.equal(body.input, '清水');
  assert.equal(body.sessionToken, 'Session123');
  assert.equal(body.locationBias.circle.radius, 50000);
  assert.equal(body.locationBias.circle.center.latitude, 35.0116);
  assert.equal(autocompleteBody({ query: '清水', destination: '京都', scope: 'world', sessionToken: 'Session123' }).locationBias, undefined);
  assert.equal(autocompleteBody({ query: '餐廳', destination: '沖繩', scope: 'trip', sessionToken: 'Session123' }).input, '沖繩 餐廳');
});
test('拒絕無效輸入、路徑注入與示範 ID，缺少金鑰不發出 Google 請求', async () => {
  for (const value of ['../abc', 'https://example.com', 'demo-kiyomizu', '', null]) assert.throws(() => placeId(value));
  assert.throws(() => autocompleteBody({ query: '', scope: 'trip', sessionToken: 'token' }));
  assert.throws(() => autocompleteBody({ query: 'a', scope: 'trip', sessionToken: 'bad&token' }));
  let calls = 0;
  const service = createPlacesService({ key: '', fetcher: async () => { calls++; throw new Error(); } });
  await assert.rejects(service.autocomplete({ query: '清水', scope: 'world', sessionToken: 'token' }), e => e.status === 503);
  assert.equal(calls, 0);
});
test('代理轉換建議與地點詳情，金鑰僅放 upstream header、不出現在回傳資料', async () => {
  const calls = [];
  const service = createPlacesService({ key: 'TEST_ONLY_SECRET', fetcher: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.includes(':autocomplete') ? { suggestions: [
      { placePrediction: { placeId: 'ChIJ_example', structuredFormat: { mainText: { text: '清水寺' }, secondaryText: { text: '京都' } } } },
      { queryPrediction: { text: 'not-a-place' } },
    ] } : { id: 'ChIJ_example', displayName: { text: '清水寺' }, formattedAddress: 'Google 測試地址', location: { latitude: 35, longitude: 135 }, attributions: [{ provider: 'Example provider' }] }), { status: 200 });
  } });
  const suggestions = await service.autocomplete({ query: '清水', destination: '京都', scope: 'trip', sessionToken: 'token' });
  assert.equal(suggestions.suggestions.length, 1);
  assert.equal(suggestions.suggestions[0].source, 'google');
  const detail = await service.details({ placeId: 'ChIJ_example', sessionToken: 'token' });
  assert.equal(detail.address, 'Google 測試地址');
  assert.equal(detail.latitude, 35);
  assert.equal(detail.attributions[0].provider, 'Example provider');
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'TEST_ONLY_SECRET');
  assert.ok(calls[1].url.includes('sessionToken=token'));
  assert.ok(!JSON.stringify([suggestions, detail]).includes('TEST_ONLY_SECRET'));
  assert.ok(!calls.some(c => c.url.includes('TEST_ONLY_SECRET')));
});
test('額度與金鑰錯誤有可處理狀態，沒有回傳假景點或洩漏 upstream 內容', async () => {
  for (const status of [403, 429, 500]) {
    const service = createPlacesService({ key: 'TEST_SECRET', fetcher: async () => new Response('secret details', { status }) });
    await assert.rejects(service.autocomplete({ query: '清水', scope: 'world', sessionToken: 'token' }), e => {
      assert.ok(!e.message.includes('secret')); return e.status === (status === 403 ? 503 : status === 429 ? 429 : 502);
    });
  }
});
test('靜態地圖只代理影像，內容無法取得時允許 UI 顯示地圖 fallback', async () => {
  const calls = [];
  const service = createPlacesService({ key: 'TEST_SECRET', fetcher: async (url) => {
    calls.push(url);
    return url.includes('staticmap') ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }) : new Response(JSON.stringify({ location: { latitude: 35, longitude: 135 } }));
  } });
  const map = await service.map('ChIJ_example');
  assert.equal(map.type, 'image/png'); assert.deepEqual([...map.bytes], [1, 2, 3]);
  const staticUrl = new URL(calls[1]); assert.equal(staticUrl.searchParams.get('center'), '35,135');
  assert.equal(staticUrl.searchParams.get('language'), 'zh-TW');
});
test('附近美食使用明確半徑與座標，拒絕無效定位，關鍵字限餐飲類型', async () => {
  const body = nearbyFoodBody({ scope: 'nearby', center: { latitude: 25, longitude: 121 } });
  assert.equal(body.locationRestriction.circle.radius, 3000);
  assert.equal(body.locationRestriction.circle.center.latitude, 25);
  assert.equal(body.rankPreference, 'DISTANCE');
  assert.throws(() => nearbyFoodBody({ scope: 'nearby', center: { latitude: 999, longitude: 121 } }));
  assert.throws(() => nearbyFoodBody({ scope: 'trip', destination: '未知城市' }));
  const autocomplete = autocompleteBody({ query: '咖啡', scope: 'nearby', center: { latitude: 25, longitude: 121 }, kind: 'food', sessionToken: 'test' });
  assert.ok(autocomplete.includedPrimaryTypes.includes('restaurant'));
  assert.equal(autocomplete.locationBias.circle.center.longitude, 121);
  let endpoint = '';
  const service = createPlacesService({ key: 'TEST_KEY', fetcher: async url => { endpoint = url; return new Response(JSON.stringify({ places: [{ id: 'ChIJ_food', displayName: { text: '店家' }, formattedAddress: '測試地址' }] })); } });
  const result = await service.autocomplete({ query: '', scope: 'trip', destination: '京都', kind: 'food' });
  assert.ok(endpoint.endsWith(':searchNearby')); assert.equal(result.suggestions[0].id, 'ChIJ_food');
});
