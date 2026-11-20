async function verifySharedBackend() {
  const endpoint = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const publishable = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const legacyKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const key = publishable || legacyKey;
  if (!endpoint || !key) throw new Error('Set the Supabase project URL and a public browser key before deploying.');

  const headers = { apikey: key };
  if (!publishable) headers.authorization = `Bearer ${legacyKey}`;
  const settings = await fetch(`${endpoint}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) });
  if (!settings.ok) throw new Error(`Supabase sign-in settings returned HTTP ${settings.status}.`);
  const configuration = await settings.json();
  if (!configuration.external?.anonymous_users || configuration.disable_signup) {
    throw new Error('Enable anonymous sign-ins and allow new users to sign up in Supabase Authentication.');
  }

  // The anonymous API role must see the deployed endpoint but lack permission to call it.
  // This checks the migration without creating any live users, invitations, or trips.
  const rpc = await fetch(`${endpoint}/rest/v1/rpc/journal_list_trips`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
  });
  const result = await rpc.json();
  if (rpc.ok || result.code !== '42501') {
    const code = typeof result.code === 'string' && /^[A-Z0-9]+$/.test(result.code) ? `, ${result.code}` : '';
    throw new Error(`Expected permission denied for the shared-trip RPC as an unauthenticated caller (HTTP ${rpc.status}${code}). Check the shared-trip migration.`);
  }
  console.log('Supabase anonymous sign-ins are enabled and the shared-trip RPC requires authentication.');
}

verifySharedBackend().catch(error => {
  console.error(`::error title=Supabase verification failed::${error.message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`);
  process.exitCode = 1;
});
