import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Trip } from './domain';

export type SharedTrip = { trip: Trip; version: number; memberId: string; owner: boolean };
export type InvitePreview = { title: string; destination: string };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const legacyKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

function hasAnonRole(key: string, host: string) {
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims.iss === 'supabase' && claims.role === 'anon' && host === `${claims.ref}.supabase.co`;
  } catch { return false; }
}

function configuredClient() {
  if (Platform.OS !== 'web' || !url) return null;
  try {
    const endpoint = new URL(url);
    const key = publishableKey?.startsWith('sb_publishable_') ? publishableKey
      : legacyKey && hasAnonRole(legacyKey, endpoint.hostname) ? legacyKey : null;
    return key ? createClient(endpoint.origin, key) : null;
  } catch { return null; }
}

const client = configuredClient();
export const sharingAvailable = !!client;

let startingSession: Promise<void> | undefined;
async function getSession(create: boolean) {
  if (!client) throw new Error('共用旅行尚未設定。');
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session || !create) return !!data.session;
  startingSession ??= client.auth.signInAnonymously().then(result => {
    if (result.error) throw result.error;
  }).finally(() => { startingSession = undefined; });
  await startingSession;
  return true;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!client) throw new Error('共用旅行尚未設定。');
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listSharedTrips(): Promise<SharedTrip[]> {
  return client && await getSession(false) ? rpc('journal_list_trips') : [];
}

export function getSharedTrip(id: string): Promise<SharedTrip | null> {
  return rpc('journal_get_trip', { p_id: id });
}

export async function publishTrip(trip: Trip, name: string): Promise<SharedTrip> {
  await getSession(true);
  const { messages, ...shared } = trip;
  return rpc('journal_create_trip', { p_trip: shared, p_name: name });
}

export function createInvite(tripId: string): Promise<string> {
  return rpc('journal_create_invite', { p_id: tripId });
}

export async function revokeInvite(tripId: string): Promise<void> {
  await rpc('journal_revoke_invite', { p_id: tripId });
}

export async function previewInvite(token: string): Promise<InvitePreview | null> {
  await getSession(true);
  return rpc('journal_preview_invite', { p_token: token });
}

export async function acceptInvite(token: string, name: string): Promise<SharedTrip> {
  return rpc('journal_accept_invite', { p_token: token, p_name: name });
}

export function saveSharedTrip(record: SharedTrip, next: Trip): Promise<SharedTrip | null> {
  const { events, places, expenses } = next;
  return rpc('journal_save_trip', { p_id: record.trip.id, p_version: record.version, p_contents: { events, places, expenses } });
}

export function sendSharedMessage(tripId: string, messageId: string, text: string): Promise<SharedTrip> {
  return rpc('journal_send_message', { p_id: tripId, p_message_id: messageId, p_text: text });
}

const invitePattern = /^#invite=([0-9a-f]{64})$/;
export function readInviteToken() {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? invitePattern.exec(window.location.hash)?.[1] ?? null : null;
}

export function tokenFromInviteLink(link: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const url = new URL(link.trim());
    const appPath = (path: string) => path.replace(/(?:\/index\.html|\/)$/, '');
    if (url.origin !== window.location.origin || appPath(url.pathname) !== appPath(window.location.pathname)) return null;
    return invitePattern.exec(url.hash)?.[1] ?? null;
  } catch { return null; }
}

export function inviteLink(token: string) {
  const url = new URL(window.location.href);
  url.hash = `invite=${token}`;
  url.search = '';
  return url.toString();
}

export function clearInviteLink() {
  if (readInviteToken()) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
