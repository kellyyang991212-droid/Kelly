import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { newPlacesSession, placesMode, searchPlaces, selectPlace, staticMapUrl } from './places';
import type { Coordinates, PlaceSelection, PlaceSuggestion, SearchKind, SearchScope } from './places';

export default function PlaceSearch({ destination, onSelect, onOpenMap, onBusy, kind = 'places' }: { destination: string; onSelect: (place: PlaceSelection | null) => void; onOpenMap: (place: PlaceSelection) => void; onBusy: (busy: boolean) => void; kind?: SearchKind }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('trip');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [selection, setSelection] = useState<PlaceSelection | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [picking, setPicking] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [center, setCenter] = useState<Coordinates>();
  const [locating, setLocating] = useState(false);
  const session = useRef(newPlacesSession());
  const generation = useRef(0);
  const locationGeneration = useRef(0);
  const detailsController = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; locationGeneration.current++; detailsController.current?.abort(); onBusy(false); }, []);
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    if ((!query.trim() && (kind !== 'food' || scope === 'world')) || selection) { setResults([]); setStatus('idle'); return; }
    setResults([]); setStatus('loading'); setError('');
    const timer = setTimeout(() => {
      searchPlaces(query, destination, scope, session.current, controller.signal, { kind, center }).then(items => {
        if (version === generation.current) { setResults(items); setStatus('ready'); }
      }).catch(cause => {
        if (version === generation.current && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : '搜尋失敗，請重試。'); setStatus('error'); }
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, destination, scope, selection, retry, kind, center]);
  function invalidate() {
    locationGeneration.current++; setLocating(false);
    generation.current++; detailsController.current?.abort(); setPicking(false); onBusy(false); setSelection(null); onSelect(null); setMapError(false); setError('');
  }
  async function locate() {
    invalidate();
    const version = locationGeneration.current;
    setLocating(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (version !== locationGeneration.current) return;
      if (permission.status !== 'granted') { setError('未取得定位權限，仍可輸入城市與美食名稱，或查詢旅行目的地附近。'); return; }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('定位逾時，請到訊號較好的地方重試，或手動輸入城市。')), 15000); }),
      ]);
      if (version !== locationGeneration.current) return;
      setCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setScope('nearby'); setRetry(n => n + 1);
    } catch (cause) {
      if (version === locationGeneration.current) setError(cause instanceof Error && cause.message.startsWith('定位逾時') ? cause.message : '無法取得目前位置，請手動輸入城市與美食名稱。');
    } finally { if (timer) clearTimeout(timer); if (version === locationGeneration.current) setLocating(false); }
  }
  async function choose(item: PlaceSuggestion) {
    const version = ++generation.current;
    detailsController.current?.abort();
    const controller = new AbortController(); detailsController.current = controller;
    setPicking(true); onBusy(true); setError('');
    try {
      const result = await selectPlace(item.id, session.current, controller.signal);
      if (version !== generation.current) return;
      setSelection(result); setQuery(result.name); setResults([]); setStatus('idle'); setMapError(false); onSelect(result);
      session.current = newPlacesSession();
    } catch (cause) {
      if (version === generation.current && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : '無法取得地點，請重試。'); }
    } finally { if (version === generation.current) { setPicking(false); onBusy(false); } }
  }
  return <View style={styles.panel}>
    <View style={styles.row}><Ionicons name={kind === 'food' ? 'restaurant-outline' : 'search-outline'} size={21} color="#32644D" /><Text style={styles.heading}>{kind === 'food' ? '附近有什麼好吃的？' : '先找一個想去的地方'}</Text></View>
    <Text style={styles.caption}>{placesMode === 'demo' ? `示範${kind === 'food' ? '美食' : '景點'}搜尋・尚未連接 Google Places` : 'Google Places 即時搜尋'}</Text>
    <Text style={styles.label}>輸入中文找景點、餐廳或地址</Text>
    <TextInput accessibilityLabel="搜尋景點、餐廳或地址" value={query} onChangeText={value => { invalidate(); setQuery(value); }} maxLength={150} autoCorrect={false} placeholder="試試：清水、京都、咖啡、赤崁樓" placeholderTextColor="#87917D" style={styles.input} />
    <View style={[styles.row, { flexWrap: 'wrap' }]}>{([{ id: 'trip', label: kind === 'food' ? `${destination || '旅行目的地'}附近` : `優先${destination || '旅行目的地'}` }, { id: 'world', label: '搜尋其他地區' }] as const).map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: scope === option.id }} onPress={() => { invalidate(); setScope(option.id); }} style={[styles.scope, scope === option.id && styles.scopeActive]}><Text style={[styles.scopeText, scope === option.id && { color: 'white' }]}>{option.label}</Text></Pressable>)}</View>
    {kind === 'food' && <><Pressable accessibilityRole="button" disabled={locating} onPress={locate} style={[styles.action, scope === 'nearby' && { borderColor: '#32644D' }]}><Ionicons name="locate-outline" size={18} color="#32644D" /><Text style={styles.actionText}>{locating ? '正在取得位置…' : scope === 'nearby' ? '已使用目前位置・重新定位' : '查詢目前位置附近美食'}</Text></Pressable><Text style={styles.caption}>{scope === 'nearby' ? (placesMode === 'demo' ? '僅篩選附近的示範店家，並非真實附近餐廳清單。' : '附近清單搜尋約 3 公里；輸入關鍵字時優先目前位置周邊。') : '附近以旅行目的地為中心；按定位按鈕才會請求手機定位權限。'}</Text></>}
    {(status === 'loading' || picking) && <View accessibilityLiveRegion="polite" style={styles.row}><ActivityIndicator size="small" color="#32644D" /><Text style={styles.caption}>{picking ? '正在帶入地點資料…' : '正在尋找符合的地點…'}</Text></View>}
    {status === 'ready' && !results.length && <Text accessibilityLiveRegion="polite" style={styles.caption}>{placesMode === 'demo' ? (kind === 'food' ? '這個範圍沒有符合的示範店家，不代表實際沒有餐廳。可切回京都附近、搜尋「拉麵」或「咖啡」。' : '示範清單沒有符合的地點，試試「清水」或切換其他地區搜尋「赤崁樓」。也可在下方手動填寫。') : '找不到符合地點，試試更完整名稱、切換其他地區，或手動填寫。'}</Text>}
    {!!error && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setRetry(n => n + 1); setError(''); }} style={styles.action}><Text style={styles.actionText}>重新搜尋</Text></Pressable></View>}
    {!selection && results.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`選擇景點：${item.name}`} disabled={picking} key={item.id} onPress={() => choose(item)} style={({ pressed }) => [styles.result, pressed && { opacity: .65 }, picking && { opacity: .5 }]}><View style={styles.pin}><Ionicons name="location-outline" color="#32644D" size={21} /></View><View style={{ flex: 1, gap: 5 }}><Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.caption}>{item.subtitle}</Text><Text style={styles.source}>{item.source === 'demo' ? '示範資料' : 'Google Places'}</Text></View><Ionicons name="chevron-forward" color="#7C867B" size={18} /></Pressable>)}
    {selection && <View style={styles.selected}>
      <View style={styles.row}><Ionicons name="checkmark-circle" color="#32644D" size={22} /><Text style={styles.resultTitle}>已選擇・{selection.name}</Text></View>
      <Text style={styles.address}>{selection.address}</Text>
      {selection.source === 'google' && !mapError ? <Image accessibilityLabel={`${selection.name}的 Google Maps 位置預覽`} source={{ uri: staticMapUrl(selection.id) }} style={styles.map} resizeMode="contain" onError={() => setMapError(true)} /> : <View style={styles.mapFallback}><Ionicons name="location" color="#32644D" size={32} /><Text style={styles.label}>{selection.source === 'demo' ? '示範位置・不是實際地圖' : '地圖預覽暫時無法載入'}</Text><Text style={styles.caption}>{selection.latitude.toFixed(4)}, {selection.longitude.toFixed(4)}</Text><Text style={styles.caption}>可用下方按鈕在 Google Maps 確認位置</Text></View>}
      <Pressable accessibilityRole="button" onPress={() => onOpenMap(selection)} style={styles.action}><Ionicons name="map-outline" color="#32644D" size={18} /><Text style={styles.actionText}>在 Google Maps 查看位置</Text><Ionicons name="open-outline" color="#32644D" size={16} /></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { invalidate(); setQuery(''); }} style={styles.action}><Text style={styles.actionText}>重新選擇地點</Text></Pressable>
      {selection.attributions?.map((a, i) => <Text key={i} style={styles.caption} onPress={a.providerUri && /^https:\/\//.test(a.providerUri) ? () => { Linking.openURL(a.providerUri!).catch(() => setError('無法開啟資料來源連結。')); } : undefined}>{a.provider}</Text>)}
    </View>}
    {placesMode === 'google' && <Text style={{ fontSize: 13, fontWeight: '400', color: '#5E5E5E', alignSelf: 'flex-end' }}>Google Maps</Text>}
    <Text style={styles.caption}>{placesMode === 'demo' ? '選取後會自動帶入名稱、示範地址與位置。完整即時結果需先依設定文件啟用 Google Places。' : '搜尋內容會傳送至 Google；選取地點後帶入名稱、地址與位置。'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: '#DDE5D3', backgroundColor: '#EDF1E6', borderRadius: 12, padding: 16, gap: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, heading: { fontSize: 17, color: '#263D35', fontWeight: '600', flexShrink: 1 }, caption: { fontSize: 12, color: '#71806E', lineHeight: 20 }, label: { fontSize: 13, color: '#263D35', fontWeight: '600' }, input: { minHeight: 50, borderWidth: 1, borderColor: '#CBD7C0', backgroundColor: '#FFFFFC', borderRadius: 9, padding: 13, fontSize: 16, color: '#263D35' }, scope: { minHeight: 44, borderRadius: 8, padding: 12, backgroundColor: '#FAFCF5', justifyContent: 'center', maxWidth: '100%' }, scopeActive: { backgroundColor: '#32644D' }, scopeText: { fontSize: 12, color: '#32644D' }, result: { flexDirection: 'row', gap: 11, alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#DDE5D3', backgroundColor: '#FFFFFC', minHeight: 80 }, pin: { backgroundColor: '#EDF1E6', borderRadius: 20, padding: 8 }, resultTitle: { fontSize: 15, fontWeight: '600', color: '#263D35', flexShrink: 1 }, source: { color: '#94764D', fontSize: 10 }, selected: { borderWidth: 1, borderColor: '#B3C8A9', backgroundColor: '#FBFDF6', borderRadius: 10, padding: 13, gap: 12 }, address: { fontSize: 13, color: '#66755F', lineHeight: 21 }, map: { width: '100%', aspectRatio: 2, borderRadius: 9, backgroundColor: '#DDE5D3' }, mapFallback: { minHeight: 155, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BECFB4', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 10 }, action: { minHeight: 46, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#CDDCC2', backgroundColor: '#FFFFFA', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, actionText: { color: '#32644D', fontSize: 13, fontWeight: '600' }, error: { color: '#A14F36', lineHeight: 21, fontSize: 13 },
});
