import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { googleMapsUrl, parseGoogleMapsLink } from './domain';

export type MapPlaceDraft = { name: string; address: string; mapUrl?: string };
export default function MapPlaceSearch({ destination, onSelect, onInvalidLink, kind = 'places' }: { destination: string; onSelect: (place: MapPlaceDraft | null) => void; onInvalidLink?: (invalid: boolean) => void; kind?: 'places' | 'food' }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [sharedLink, setSharedLink] = useState('');
  const [useDestination, setUseDestination] = useState(true);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [opened, setOpened] = useState(false);
  const food = kind === 'food';
  function update(nextName: string, nextAddress: string, nextLink: string) {
    setName(nextName); setAddress(nextAddress); setSharedLink(nextLink);
    try {
      const mapUrl = parseGoogleMapsLink(nextLink);
      setLinkError(''); onInvalidLink?.(false);
      onSelect(nextName.trim() || nextAddress.trim() || mapUrl ? { name: nextName.trim(), address: nextAddress.trim(), mapUrl } : null);
    } catch (cause) { setLinkError((cause as Error).message); onInvalidLink?.(true); onSelect(null); }
  }
  async function search(nearby = false) {
    setError('');
    try {
      const term = nearby ? `${query.trim() || '美食'} 附近` : query.trim();
      if (!term) { setError('請先輸入想查詢的景點或美食，例如「京都拉麵」。'); return; }
      const text = !nearby && useDestination ? `${destination} ${term}`.trim() : term;
      await Linking.openURL(googleMapsUrl(text)); setOpened(true);
    } catch { setError('無法開啟 Google Maps，請確認裝置或網路後重試。'); }
  }
  return <View style={s.panel}>
    <View style={s.row}><Ionicons name={food ? 'restaurant-outline' : 'search-outline'} size={22} color="#32644D" /><Text style={s.heading}>{food ? '用 Google Maps 找美食' : '用 Google Maps 找景點'}</Text></View>
    <Text style={s.badge}>免金鑰・查詢結果顯示在 Google Maps</Text>
    <Text style={s.label}>① 輸入中文，到地圖查詢</Text>
    <TextInput accessibilityLabel="Google Maps 搜尋關鍵字" value={query} onChangeText={setQuery} maxLength={150} placeholder={food ? '例如：拉麵、咖啡、牛肉湯' : '例如：清水寺、親子景點'} placeholderTextColor="#87917D" style={s.input} returnKeyType="search" onSubmitEditing={() => search()} />
    <View style={[s.row, { flexWrap: 'wrap' }]}>{[{ active: useDestination, value: true, text: `搭配${destination || '旅行目的地'}` }, { active: !useDestination, value: false, text: '自行輸入城市' }].map(item => <Pressable key={item.text} accessibilityRole="button" accessibilityState={{ selected: item.active }} onPress={() => setUseDestination(item.value)} style={[s.chip, item.active && { backgroundColor: '#32644D' }]}><Text style={{ color: item.active ? 'white' : '#32644D', fontSize: 12 }}>{item.text}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={() => search()} style={s.primary}><Ionicons name="open-outline" size={18} color="white" /><Text style={s.primaryText}>到 Google Maps 搜尋{food ? '美食' : '景點'}</Text></Pressable>
    {food && <><Pressable accessibilityRole="button" onPress={() => search(true)} style={s.action}><Ionicons name="locate-outline" size={18} color="#32644D" /><Text style={s.actionText}>到 Google Maps 找目前附近美食</Text></Pressable><Text style={s.caption}>附近位置由 Google Maps 判斷；若需要定位，會由 Google Maps 詢問。本 App 不會讀取或儲存你的目前位置。</Text></>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text style={s.caption}>會開啟 Google Maps App 或網頁，查看真實地點、評價與營業資訊。搜尋結果不會自動帶回旅伴手帳。</Text>
    <View style={s.divider} />
    <Text style={s.label}>② 回到手帳，填入想保存的地點</Text>
    {opened && <Text accessibilityLiveRegion="polite" style={s.caption}>已開啟地圖。查好後回到這裡填寫，表單會保留；請在關閉 App 前完成儲存。</Text>}
    <Text style={s.label}>{food ? '店家名稱（必填）' : '景點名稱（可作為行程名稱）'}</Text>
    <TextInput accessibilityLabel={food ? '店家名稱' : '景點名稱'} value={name} onChangeText={v => update(v, address, sharedLink)} maxLength={120} placeholder={food ? '填入在 Google Maps 找到的店名' : '填入在 Google Maps 找到的景點'} placeholderTextColor="#87917D" style={s.input} />
    <Text style={s.label}>地址或地區（選填）</Text>
    <TextInput accessibilityLabel="保存的地點地址" value={address} onChangeText={v => update(name, v, sharedLink)} maxLength={200} placeholder="貼上地址，或填寫所在城市／區域" placeholderTextColor="#87917D" style={s.input} />
    <Text style={s.label}>Google Maps 分享連結（選填）</Text>
    <TextInput accessibilityLabel="Google Maps 分享連結" value={sharedLink} onChangeText={v => update(name, address, v)} maxLength={2200} autoCapitalize="none" autoCorrect={false} placeholder="https://maps.app.goo.gl/…" placeholderTextColor="#87917D" style={s.input} />
    {!!linkError && <Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}
    <Text style={s.caption}>在 Google Maps 點店家／景點 → 分享 → 複製連結，再貼到這裡。保存連結後可直接開啟原地點，不會自動讀取店家資料。</Text>
  </View>;
}
const s = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: '#DDE5D3', backgroundColor: '#EDF1E6', borderRadius: 12, padding: 16, gap: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, heading: { fontSize: 17, color: '#263D35', fontWeight: '600', flexShrink: 1 }, badge: { fontSize: 12, color: '#32644D', lineHeight: 20 }, caption: { fontSize: 12, color: '#71806E', lineHeight: 20 }, label: { fontSize: 13, color: '#263D35', fontWeight: '600', lineHeight: 20 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#CBD7C0', backgroundColor: '#FFFFFC', borderRadius: 9, padding: 13, fontSize: 15, color: '#263D35' }, chip: { minHeight: 44, borderRadius: 8, padding: 12, backgroundColor: '#FAFCF5', justifyContent: 'center', maxWidth: '100%' }, primary: { minHeight: 48, backgroundColor: '#32644D', borderRadius: 8, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: 'white', fontSize: 13, fontWeight: '600' }, action: { minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CDDCC2', backgroundColor: '#FFFFFA', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, actionText: { color: '#32644D', fontSize: 13, fontWeight: '600', flexShrink: 1 }, error: { color: '#A14F36', lineHeight: 21, fontSize: 13 }, divider: { height: 1, backgroundColor: '#D3DDCA', marginVertical: 5 },
});
