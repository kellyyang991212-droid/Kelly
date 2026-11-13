export type Member = { id: string; name: string; color: string };
export type Place = { id: string; name: string; area: string; category: string; price: string; image: string; description: string; saved: boolean; source?: 'demo' | 'google' | 'manual'; googlePlaceId?: string; mapUrl?: string };
export type Event = { id: string; title: string; time: string; day: number; category: string; note: string; mapQuery?: string; mapUrl?: string; googlePlaceId?: string; demoLocation?: { address: string; latitude: number; longitude: number }; image?: string; placeId?: string; done: boolean };
export type Expense = { id: string; title: string; amount: number; payer: string; participants: string[]; day: number };
export type Message = { id: string; sender: string; text: string; time: string };
export type Trip = { id: string; title: string; destination: string; start: string; end: string; image: string; members: Member[]; events: Event[]; expenses: Expense[]; places: Place[]; messages: Message[]; demo: boolean };
export const PHOTO = {
  kyoto: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=85',
  shrine: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=1000&q=85',
  street: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1000&q=85',
  food: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85',
  cafe: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=900&q=85',
  taiwan: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?auto=format&fit=crop&w=1000&q=85',
};
export const MEMBERS: Member[] = [
  { id: 'me', name: '小安（我）', color: '#DCE5CD' },
  { id: 'yu', name: '小宇', color: '#EFD8C6' },
  { id: 'lin', name: '阿琳', color: '#D5DFE9' },
  { id: 'chen', name: '阿辰', color: '#E7DCEC' },
];
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export function parseGoogleMapsLink(input: string): string | undefined {
  if (!input.trim()) return undefined;
  const candidate = input.trim().match(/https:\/\/[^\s<>]+/i)?.[0];
  if (!candidate || candidate.length > 2048) throw new Error('請貼上有效的 Google Maps HTTPS 分享連結。');
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error('請貼上有效的 Google Maps HTTPS 分享連結。'); }
  const host = url.hostname.toLowerCase();
  const valid = (['google.com', 'www.google.com'].includes(host) && /^\/maps(?:\/|$)/.test(url.pathname)) || host === 'maps.google.com' || (host === 'maps.app.goo.gl' && url.pathname.length > 1) || (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
  if (!valid || url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('只接受 Google Maps 官方分享連結，請重新複製。');
  return url.href;
}
export function googleMapsUrl(query: string, action: 'search' | 'directions' = 'search', googlePlaceId?: string): string {
  const value = query.trim();
  if (!value) throw new Error('請先輸入地點或行程名稱。');
  let url = action === 'directions'
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
  if (googlePlaceId) url += `&${action === 'search' ? 'query_place_id' : 'destination_place_id'}=${encodeURIComponent(googlePlaceId)}`;
  if (url.length > 2048) throw new Error('地點文字太長，請縮短後再查詢。');
  return url;
}
export function tripDays(trip: Pick<Trip, 'start' | 'end'>): string[] {
  const start = Date.parse(trip.start + 'T00:00:00Z');
  const end = Date.parse(trip.end + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return Array.from({ length: Math.min(31, Math.round((end - start) / 86400000) + 1) }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
}
export function validDates(start: string, end: string): boolean {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  return valid(start) && valid(end) && end >= start && (Date.parse(end) - Date.parse(start)) / 86400000 < 31;
}
// Currency is integer JPY in the prototype. A stable member order receives remainders.
export function splitAmount(amount: number, participants: string[]): Record<string, number> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !participants.length || new Set(participants).size !== participants.length) throw new Error('請輸入正整數金額並選擇分攤成員');
  const ordered = [...participants].sort();
  const base = Math.floor(amount / ordered.length);
  const remainder = amount % ordered.length;
  return Object.fromEntries(ordered.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}
export function balances(trip: Trip): Record<string, number> {
  const result = Object.fromEntries(trip.members.map(m => [m.id, 0]));
  for (const e of trip.expenses) {
    result[e.payer] += e.amount;
    for (const [id, amount] of Object.entries(splitAmount(e.amount, e.participants))) result[id] -= amount;
  }
  return result;
}
export function settlements(trip: Trip) {
  const b = balances(trip);
  const creditors = Object.entries(b).filter(([, n]) => n > 0).map(([id, amount]) => ({ id, amount }));
  const debtors = Object.entries(b).filter(([, n]) => n < 0).map(([id, amount]) => ({ id, amount: -amount }));
  const transfers: { from: string; to: string; amount: number }[] = [];
  for (const debtor of debtors) for (const creditor of creditors) {
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount) transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount -= amount; creditor.amount -= amount;
  }
  return transfers;
}
export function addPlaceToTrip(trip: Trip, place: Place, day: number, time: string): Trip {
  if (trip.events.some(e => e.placeId === place.id)) return trip;
  return { ...trip, places: trip.places.map(p => p.id === place.id ? { ...p, saved: true } : p), events: [...trip.events, { id: uid(), placeId: place.id, title: place.name, time, day, category: '美食', note: `${place.area} · 從美食口袋加入`, mapQuery: place.source === 'manual' ? `${place.name} ${place.area}` : place.googlePlaceId ? place.name : undefined, mapUrl: place.mapUrl, googlePlaceId: place.googlePlaceId, image: place.image, done: false }] };
}
export function makeDemo(): Trip {
  return {
    id: 'kyoto-demo', title: '京都慢慢走', destination: '日本・京都', start: '2026-11-20', end: '2026-11-24', image: PHOTO.kyoto, members: MEMBERS, demo: true,
    places: [
      { id: 'ramen', name: '鴨川旁的小麵屋', area: '京都・三條', category: '拉麵', price: '¥ 1,000–1,500', image: PHOTO.food, description: '散步之後，來一碗暖暖的湯麵。大家一起收藏的午餐提案。', saved: false },
      { id: 'coffee', name: '東山喫茶室', area: '京都・東山', category: '咖啡甜點', price: '¥ 800–1,200', image: PHOTO.cafe, description: '找個窗邊的位置，把下午留給咖啡與聊天。', saved: true },
    ],
    events: [
      { id: 'e1', title: '在京都車站集合', time: '09:00', day: 0, category: '交通', note: '中央口集合，先寄放行李', done: true },
      { id: 'e2', title: '清水寺・走進秋天裡', time: '10:30', day: 0, category: '景點', note: '慢慢散步，沿途拍照，不趕時間', image: PHOTO.kyoto, done: false },
      { id: 'e3', title: '二年坂、三年坂散策', time: '14:00', day: 0, category: '散步', note: '逛小店、吃點心，收集京都的日常', image: PHOTO.street, done: false },
      { id: 'e4', title: '伏見稻荷大社', time: '09:30', day: 1, category: '景點', note: '一起走一段千本鳥居', image: PHOTO.shrine, done: false },
      { id: 'e5', title: '嵐山的散步時光', time: '10:00', day: 2, category: '散步', note: '留一點空白給旅途的驚喜', image: PHOTO.street, done: false },
    ],
    expenses: [
      { id: 'x1', title: '機場到京都・交通', amount: 12000, payer: 'yu', participants: MEMBERS.map(m => m.id), day: 0 },
      { id: 'x2', title: '一起吃的第一頓早餐', amount: 3600, payer: 'me', participants: MEMBERS.map(m => m.id), day: 0 },
    ],
    messages: [
      { id: 'm1', sender: 'yu', text: '車票已經準備好了！我們在京都車站中央口碰面 🚃', time: '08:42' },
      { id: 'm2', sender: 'lin', text: '好期待秋天的京都，這次要拍好多照片 🍁', time: '08:45' },
      { id: 'm3', sender: 'me', text: '我先把想吃的店放進美食口袋了，大家一起挑！', time: '08:48' },
    ],
  };
}
