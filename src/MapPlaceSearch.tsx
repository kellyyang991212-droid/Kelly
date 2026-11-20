import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { googleMapsUrl, parseGoogleMapsLink } from './domain';
import { findItineraryPlaces, searchItineraryPlaces } from './itineraryPlaces';
import type { ItineraryPlace } from './itineraryPlaces';
import type { SearchKind } from './places';

export type MapPlaceDraft = { name: string; address: string; mapUrl?: string };
export default function MapPlaceSearch({ destination, onSelect, onInvalidLink, kind = 'places' }: { destination: string; onSelect: (place: MapPlaceDraft | null) => void; onInvalidLink?: (invalid: boolean) => void; kind?: SearchKind }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [sharedLink, setSharedLink] = useState('');
  const [useDestination, setUseDestination] = useState(true);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [opened, setOpened] = useState(false);
  const [picked, setPicked] = useState<ItineraryPlace | null>(null);
  const [onlineResults, setOnlineResults] = useState<ItineraryPlace[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const activeLookup = useRef<AbortController | null>(null);
  const food = kind === 'food';
  const resultType = food ? '店家' : '地點';
  const fieldLabel = food ? '美食關鍵字' : '景點或美食關鍵字';
  const searchArea = useDestination ? destination : '';
  const suggestions = picked ? [] : findItineraryPlaces(query, searchArea, kind);
  useEffect(() => () => {
    activeLookup.current?.abort();
    activeLookup.current = null;
  }, []);

  function clearLookup() {
    activeLookup.current?.abort();
    activeLookup.current = null;
    setLookingUp(false);
    setOnlineResults(null);
    setLookupError('');
    setPicked(null);
  }

  async function lookup() {
    if (!query.trim() || picked || activeLookup.current) return;
    clearLookup();
    const controller = new AbortController();
    activeLookup.current = controller;
    setLookingUp(true);
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const results = await searchItineraryPlaces(query, searchArea, controller.signal, kind);
      if (activeLookup.current === controller) setOnlineResults(results);
    } catch {
      if (activeLookup.current === controller) setLookupError('線上搜尋暫時無法使用。請重試，或在下方手動填寫。');
    } finally {
      clearTimeout(timeout);
      if (activeLookup.current === controller) {
        activeLookup.current = null;
        setLookingUp(false);
      }
    }
  }

  function choose(place: ItineraryPlace) {
    clearLookup();
    setPicked(place);
    setQuery(place.name);
    setError('');
    update(place.name, place.address, '');
  }

  function resultList(places: ItineraryPlace[]) {
    return places.map(place => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={[`選取${resultType}：${place.name}`, place.address].filter(Boolean).join('，')} onPress={() => choose(place)} style={s.result}>
      <Ionicons name="location-outline" size={21} color="#32644D" />
      <View style={s.resultBody}><Text style={s.label}>{place.name}</Text>{!!place.address && <Text style={s.caption}>{place.address}</Text>}</View>
      <Ionicons name="chevron-forward" size={16} color="#71806E" />
    </Pressable>);
  }

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
    <View style={s.row}><Ionicons name={food ? 'restaurant-outline' : 'search-outline'} size={22} color="#32644D" /><Text style={s.heading}>搜尋並選取{resultType}</Text></View>
    <Text style={s.label}>{fieldLabel}</Text>
    <TextInput accessibilityLabel={fieldLabel} value={query} onChangeText={value => { clearLookup(); setError(''); setQuery(value); }} maxLength={150} placeholder={food ? '例如：拉麵、咖啡、牛肉湯' : '例如：清水、台北 101、拉麵'} placeholderTextColor="#87917D" style={s.input} returnKeyType="search" onSubmitEditing={lookup} />
    <View style={[s.row, { flexWrap: 'wrap' }]}>{[{ active: useDestination, value: true, text: `搭配${destination || '旅行目的地'}` }, { active: !useDestination, value: false, text: '自行輸入城市' }].map(item => <Pressable key={item.text} accessibilityRole="button" accessibilityState={{ selected: item.active }} onPress={() => { if (useDestination !== item.value) { clearLookup(); setUseDestination(item.value); } }} style={[s.chip, item.active && { backgroundColor: '#32644D' }]}><Text style={{ color: item.active ? 'white' : '#32644D', fontSize: 12 }}>{item.text}</Text></Pressable>)}</View>
    {!!query.trim() && <>
      {picked ? <Text accessibilityLiveRegion="polite" style={s.badge}>已帶入 {picked.name}</Text> : <>
        {!!suggestions.length && <><Text style={s.label}>常見{resultType}</Text>{resultList(suggestions)}</>}
        {!suggestions.length && !lookingUp && onlineResults === null && !lookupError && <Text style={s.caption}>內建清單沒有符合的{resultType}，可試試線上搜尋。</Text>}
        <Pressable accessibilityRole="button" disabled={lookingUp} onPress={lookup} style={s.primary}><Ionicons name="search-outline" size={18} color="white" /><Text style={s.primaryText}>{lookingUp ? `正在搜尋${resultType}…` : `線上搜尋${resultType}`}</Text></Pressable>
        {!!lookupError && <Text accessibilityRole="alert" style={s.error}>{lookupError}</Text>}
        {onlineResults && <>
          <Text accessibilityLiveRegion="polite" style={s.label}>{onlineResults.length ? '線上搜尋結果' : `找不到${resultType}，請試試更完整的名稱或自行輸入城市。`}</Text>
          {resultList(onlineResults)}
          <Text accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => setError('無法開啟資料來源連結。'))} style={s.badge}>© OpenStreetMap 貢獻者</Text>
        </>}
      </>}
    </>}
    <Pressable accessibilityRole="button" onPress={() => search()} style={s.action}><Ionicons name="open-outline" size={18} color="#32644D" /><Text style={s.actionText}>到 Google Maps 搜尋{food ? '美食' : '地點'}</Text></Pressable>
    {food && <><Pressable accessibilityRole="button" onPress={() => search(true)} style={s.action}><Ionicons name="locate-outline" size={18} color="#32644D" /><Text style={s.actionText}>到 Google Maps 找目前附近美食</Text></Pressable><Text style={s.caption}>附近位置由 Google Maps 判斷；若需要定位，會由 Google Maps 詢問。本 App 不會讀取或儲存你的目前位置。</Text></>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={s.divider} />
    <Text style={s.label}>{resultType}資料（可手動修改）</Text>
    {opened && <Text accessibilityLiveRegion="polite" style={s.caption}>已開啟地圖。查好後回到這裡填寫，表單會保留；請在關閉 App 前完成儲存。</Text>}
    <Text style={s.label}>{food ? '店家名稱（必填）' : '地點名稱（可作為行程名稱）'}</Text>
    <TextInput accessibilityLabel={food ? '店家名稱' : '地點名稱'} value={name} onChangeText={v => update(v, address, sharedLink)} maxLength={120} placeholder={food ? '例如：本家第一旭 本店' : '例如：清水寺'} placeholderTextColor="#87917D" style={s.input} />
    <Text style={s.label}>地址或地區（選填）</Text>
    <TextInput accessibilityLabel="保存的地點地址" value={address} onChangeText={v => update(name, v, sharedLink)} maxLength={200} placeholder="貼上地址，或填寫所在城市／區域" placeholderTextColor="#87917D" style={s.input} />
    <Text style={s.label}>Google Maps 分享連結（選填）</Text>
    <TextInput accessibilityLabel="Google Maps 分享連結" value={sharedLink} onChangeText={v => update(name, address, v)} maxLength={2200} autoCapitalize="none" autoCorrect={false} placeholder="https://maps.app.goo.gl/…" placeholderTextColor="#87917D" style={s.input} />
    {!!linkError && <Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}
    <Text style={s.caption}>在 Google Maps 點店家／景點 → 分享 → 複製連結，再貼到這裡。保存連結後可直接開啟原地點，不會自動讀取店家資料。</Text>
  </View>;
}
const s = StyleSheet.create({
  result: { minHeight: 58, borderWidth: 1, borderColor: '#CDDCC2', backgroundColor: '#FFFFFA', borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultBody: { flex: 1, gap: 3 },
  panel: { borderWidth: 1, borderColor: '#DDE5D3', backgroundColor: '#EDF1E6', borderRadius: 12, padding: 16, gap: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, heading: { fontSize: 17, color: '#263D35', fontWeight: '600', flexShrink: 1 }, badge: { fontSize: 12, color: '#32644D', lineHeight: 20 }, caption: { fontSize: 12, color: '#71806E', lineHeight: 20 }, label: { fontSize: 13, color: '#263D35', fontWeight: '600', lineHeight: 20 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#CBD7C0', backgroundColor: '#FFFFFC', borderRadius: 9, padding: 13, fontSize: 15, color: '#263D35' }, chip: { minHeight: 44, borderRadius: 8, padding: 12, backgroundColor: '#FAFCF5', justifyContent: 'center', maxWidth: '100%' }, primary: { minHeight: 48, backgroundColor: '#32644D', borderRadius: 8, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: 'white', fontSize: 13, fontWeight: '600' }, action: { minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CDDCC2', backgroundColor: '#FFFFFA', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, actionText: { color: '#32644D', fontSize: 13, fontWeight: '600', flexShrink: 1 }, error: { color: '#A14F36', lineHeight: 21, fontSize: 13 }, divider: { height: 1, backgroundColor: '#D3DDCA', marginVertical: 5 },
});
