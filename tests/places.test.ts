import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSuggestions, newPlacesSession, selectPlace } from '../src/places.ts';
import { googleMapsUrl } from '../src/domain.ts';

test('中文部分字詞可列出景點，示範 ID 不偽裝成 Google Place ID', async () => {
  const suggestions = demoSuggestions('清水', '日本・京都', 'trip');
  assert.deepEqual(suggestions.map(p => p.name), ['清水寺', '清水坂']);
  const selected = await selectPlace(suggestions[0].id, newPlacesSession());
  assert.equal(selected.source, 'demo');
  assert.ok(selected.address.includes('示範'));
  assert.ok(Number.isFinite(selected.latitude));
  assert.ok(Number.isFinite(selected.longitude));
  assert.ok(selected.id.startsWith('demo-'));
});
test('切換地區可找跨區地點，空白與未知文字不顯示假結果', () => {
  assert.equal(demoSuggestions('赤崁樓', '京都', 'trip').length, 0);
  assert.equal(demoSuggestions('赤崁樓', '京都', 'world')[0].name, '赤崁樓');
  assert.equal(demoSuggestions('臺北', '台北', 'trip')[0].name, '台北 101');
  assert.equal(demoSuggestions('京都 咖啡', '京都', 'trip')[0].id, 'demo-coffee');
  assert.deepEqual(demoSuggestions('   ', '京都', 'trip'), []);
  assert.deepEqual(demoSuggestions('不存在的地方xyz', '京都', 'world'), []);
});
test('地圖與路線保留確切 Google 地點 ID，避免同名景點選錯', () => {
  const search = new URL(googleMapsUrl('清水寺', 'search', 'ChIJ_example'));
  const route = new URL(googleMapsUrl('清水寺', 'directions', 'ChIJ_example'));
  assert.equal(search.searchParams.get('query_place_id'), 'ChIJ_example');
  assert.equal(route.searchParams.get('destination_place_id'), 'ChIJ_example');
});
test('搜尋 session 不重用，格式符合後端驗證', () => {
  const sessions = Array.from({ length: 100 }, newPlacesSession);
  assert.equal(new Set(sessions).size, 100);
  assert.ok(sessions.every(s => /^[a-zA-Z0-9]{32}$/.test(s)));
});
test('美食附近清單只列餐飲；可依中文、地區與目前位置篩選', () => {
  const kyoto = demoSuggestions('', '京都', 'trip', 'food');
  assert.ok(kyoto.length >= 3);
  assert.ok(kyoto.every(p => !['清水寺', '清水坂', '赤崁樓'].includes(p.name)));
  assert.equal(demoSuggestions('拉麵', '京都', 'trip', 'food')[0].id, 'demo-ramen');
  assert.equal(demoSuggestions('牛肉湯', '京都', 'trip', 'food').length, 0);
  assert.equal(demoSuggestions('牛肉湯', '京都', 'world', 'food')[0].id, 'demo-beefsoup');
  assert.equal(demoSuggestions('', '京都', 'nearby', 'food', { latitude: 22.998, longitude: 120.2 })[0].id, 'demo-beefsoup');
  assert.equal(demoSuggestions('', '京都', 'nearby', 'food', { latitude: 0, longitude: 0 }).length, 0);
  assert.equal(demoSuggestions('', '未設定城市', 'trip', 'food').length, 0);
});
