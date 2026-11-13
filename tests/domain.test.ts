import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlaceToTrip, balances, googleMapsUrl, makeDemo, parseGoogleMapsLink, settlements, splitAmount, tripDays, validDates } from '../src/domain.ts';

test('免金鑰分享連結接受官方網址與分享文字，拒絕偽裝網域與危險協定', () => {
  assert.equal(parseGoogleMapsLink(''), undefined);
  assert.equal(parseGoogleMapsLink('清水寺 https://maps.app.goo.gl/Example123'), 'https://maps.app.goo.gl/Example123');
  for (const url of ['https://www.google.com/maps/search/?api=1&query=京都', 'https://maps.google.com/?q=京都', 'https://goo.gl/maps/Example']) assert.ok(parseGoogleMapsLink(url));
  for (const url of ['javascript:alert(1)', 'http://maps.app.goo.gl/Example', 'https://maps.app.goo.gl.evil.example/a', 'https://evil.example/maps', 'https://www.google.com/url?url=https://evil.example', 'https://user:pass@maps.app.goo.gl/a', 'https://maps.app.goo.gl:1234/a']) assert.throws(() => parseGoogleMapsLink(url));
});
test('手動美食加入行程保留地址與分享連結，重複加入不新增', () => {
  const trip = makeDemo();
  const place = { ...trip.places[0], id: 'manual-test', source: 'manual' as const, name: '旅途中找到的店', area: '京都三條', mapUrl: 'https://maps.app.goo.gl/Example123' };
  trip.places.push(place);
  const next = addPlaceToTrip(trip, place, 1, '12:30');
  assert.equal(next.events.at(-1)?.mapUrl, place.mapUrl);
  assert.equal(next.events.at(-1)?.mapQuery, '旅途中找到的店 京都三條');
  assert.equal(addPlaceToTrip(next, place, 1, '13:00').events.length, next.events.length);
});

test('Google Maps 中文與特殊符號保持單一查詢參數，路線使用 destination', () => {
  const query = '京都 清水寺 & 茶屋 #1';
  const search = new URL(googleMapsUrl(`  ${query}  `));
  assert.equal(search.origin, 'https://www.google.com');
  assert.equal(search.pathname, '/maps/search/');
  assert.equal(search.searchParams.get('api'), '1');
  assert.equal(search.searchParams.get('query'), query);
  assert.equal(search.hash, '');
  assert.equal([...search.searchParams.keys()].length, 2);
  const route = new URL(googleMapsUrl(query, 'directions'));
  assert.equal(route.pathname, '/maps/dir/');
  assert.equal(route.searchParams.get('destination'), query);
  assert.throws(() => googleMapsUrl('   '));
  assert.throws(() => googleMapsUrl('京'.repeat(300)));
});

test('尾數按穩定識別碼分配，勾選順序不改變結果', () => {
  assert.deepEqual(splitAmount(4801, ['me', 'yu', 'lin', 'chen']), { chen: 1201, lin: 1200, me: 1200, yu: 1200 });
  assert.deepEqual(splitAmount(4801, ['chen', 'me', 'lin', 'yu']), splitAmount(4801, ['yu', 'lin', 'chen', 'me']));
});
test('各種金額分攤都保留總額，最大差額一元', () => {
  for (const amount of [1, 2, 3, 4, 5, 99, 100, 4801, 99999999]) {
    const values = Object.values(splitAmount(amount, ['a', 'b', 'c', 'd']));
    assert.equal(values.reduce((a, b) => a + b, 0), amount);
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
  }
});
test('非法分攤會拒絕', () => {
  for (const amount of [0, -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => splitAmount(amount, ['a']));
  assert.throws(() => splitAmount(1, []));
  assert.throws(() => splitAmount(1, ['a', 'a']));
});
test('付款人未參與消費也能正確結算，全部餘額歸零', () => {
  const trip = makeDemo();
  trip.expenses.push({ id: 'test', title: '代付', amount: 1001, payer: 'me', participants: ['yu', 'lin', 'chen'], day: 0 });
  const b = balances(trip);
  assert.equal(Object.values(b).reduce((a, n) => a + n, 0), 0);
  for (const transfer of settlements(trip)) { b[transfer.from] += transfer.amount; b[transfer.to] -= transfer.amount; }
  assert.ok(Object.values(b).every(n => n === 0));
});
test('收藏餐廳 → 加入指定日行程，重複加入不產生重複行程', () => {
  const trip = makeDemo(); const place = trip.places[0];
  const next = addPlaceToTrip(trip, place, 2, '12:30');
  assert.equal(next.places[0].saved, true);
  assert.equal(next.events.at(-1)?.day, 2);
  assert.equal(next.events.at(-1)?.time, '12:30');
  assert.equal(next.events.at(-1)?.placeId, place.id);
  assert.equal(addPlaceToTrip(next, place, 0, '09:00').events.length, next.events.length);
  assert.equal(trip.places[0].saved, false);
});
test('日期支援跨年並拒絕不存在日期、倒置及超過 31 天', () => {
  assert.equal(tripDays(makeDemo()).length, 5);
  assert.deepEqual(tripDays({ start: '2026-12-31', end: '2027-01-01' }), ['2026-12-31', '2027-01-01']);
  assert.equal(validDates('2026-11-13', '2026-11-13'), true);
  assert.equal(validDates('2026-02-30', '2026-03-02'), false);
  assert.equal(validDates('2026-11-14', '2026-11-13'), false);
  assert.equal(validDates('2026-01-01', '2026-02-01'), false);
  assert.equal(validDates('oops', '2026-11-13'), false);
});
