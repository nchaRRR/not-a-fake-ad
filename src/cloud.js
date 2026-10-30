// Small Supabase client (Auth + REST), the same approach as Kelime Köyü: no SDK, only the
// public HTTP API. Both games share one Supabase project; this game's data lives in nfa_* tables.
//
//   POST /auth/v1/otp                     email a one-time sign-in code
//   POST /auth/v1/verify                  code → session
//   GET  /auth/v1/authorize (PKCE)        Google / Apple, then POST /auth/v1/token?grant_type=pkce
//   POST /auth/v1/token?grant_type=refresh_token
//   POST /auth/v1/logout
//   GET|POST /rest/v1/nfa_saves           this player's save (row level security)
//   POST /rest/v1/rpc/nfa_delete_my_account
//
// Only the project URL and the publishable key ship with the game; they are public by design.
// The session lives in this device's storage, never in the game save.

export const CLOUD_CONFIG = Object.freeze({
  url: 'https://dnccjrjpflhgcsfqzigq.supabase.co',
  key: 'sb_publishable_wHj0jr8tH0UVVQsdrgRbBg_uiGFTdY5',
});

export const NATIVE_REDIRECT = 'com.nimoriq.notafakead://auth-callback';
const SESSION_KEY = 'not-a-fake-ad.auth';
const PENDING_KEY = 'not-a-fake-ad.oauth';
const TIMEOUT_MS = 10000;

export class CloudError extends Error {
  constructor(kind, message, status = 0, code = '') {
    super(message);
    this.kind = kind; // offline | auth | rate | invalid | server | cancel
    this.status = status;
    this.code = code;
  }
}

function toError(status, data) {
  const code = String(data?.error_code ?? data?.code ?? data?.error ?? '');
  const msg = String(data?.msg ?? data?.message ?? data?.error_description ?? data?.error ?? `HTTP ${status}`);
  if (status === 429 || /rate/i.test(code)) return new CloudError('rate', msg, status, code);
  if (status === 401) return new CloudError('auth', msg, status, code);
  if (status >= 400 && status < 500) return new CloudError('invalid', msg, status, code);
  return new CloudError(status >= 500 ? 'server' : 'offline', msg, status, code);
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
};

// ---------------------------------------------------------------- Capacitor bridge (no imports needed)
function bridge() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  try { return cap && typeof cap.nativePromise === 'function' && cap.isNativePlatform() ? cap : null; } catch (e) { return null; }
}
export const isNative = () => bridge() !== null;
export const nativePlatform = () => bridge()?.getPlatform?.() ?? 'web';
export function nativeCall(plugin, method, options) {
  const b = bridge();
  return b ? b.nativePromise(plugin, method, options ?? {}) : Promise.reject(new Error('not-native'));
}
export function nativeListen(plugin, event, cb) {
  const b = bridge();
  if (!b || typeof b.addListener !== 'function') return () => {};
  let handle = null;
  let removed = false;
  try {
    const h = b.addListener(plugin, event, cb);
    if (h && typeof h.then === 'function') h.then((x) => { handle = x; if (removed) x?.remove?.(); });
    else handle = h;
  } catch (e) { /* event not supported */ }
  return () => { removed = true; try { handle?.remove?.(); } catch (e) { /* ignore */ } };
}

// ---------------------------------------------------------------- client
export function createCloud(cfg = CLOUD_CONFIG) {
  let session = store.get(SESSION_KEY);
  let refreshing = null;

  function saveSession(s) {
    session = s ? {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
      user: { id: s.user?.id, email: s.user?.email || '', provider: s.user?.app_metadata?.provider || '' },
    } : null;
    store.set(SESSION_KEY, session);
    return session;
  }

  async function refresh() {
    if (!session) return null;
    if (!refreshing) {
      refreshing = (async () => {
        try {
          return saveSession(await req('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }, { auth: false }));
        } catch (err) {
          if (err.kind === 'auth' || err.kind === 'invalid') saveSession(null);
          throw err;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  async function token() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    await refresh();
    return session?.access_token ?? null;
  }

  async function req(method, path, body, { auth = true, headers = {}, retry = true } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('offline', 'offline');
    const h = { apikey: cfg.key, 'Content-Type': 'application/json', Accept: 'application/json', ...headers };
    if (auth) {
      const t = await token();
      if (!t) throw new CloudError('auth', 'no session');
      h.Authorization = `Bearer ${t}`;
    }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(cfg.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl?.signal, cache: 'no-store' });
    } catch (err) {
      throw new CloudError('offline', String(err?.message ?? err));
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (res.ok) return data;
    if (res.status === 401 && auth && retry && session) {
      await refresh();
      return req(method, path, body, { auth, headers, retry: false });
    }
    throw toError(res.status, data);
  }

  // ---- OAuth (Google / Apple) with PKCE, in the in-app browser on phones
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function pkce() {
    const raw = crypto.getRandomValues(new Uint8Array(48));
    const verifier = b64url(raw);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    return { verifier, challenge: b64url(digest) };
  }
  function parseCallback(url) {
    try {
      const u = new URL(url);
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
      const get = (k) => u.searchParams.get(k) ?? hash.get(k);
      return { code: get('code'), error: [get('error'), get('error_code'), get('error_description')].filter(Boolean).join(' ') };
    } catch (e) {
      return { code: null, error: 'bad_url' };
    }
  }
  function openInAppBrowser(url) {
    return new Promise((resolve, reject) => {
      let done = false;
      const offs = [];
      const finish = (fn, v) => { if (done) return; done = true; offs.forEach((off) => off()); fn(v); };
      offs.push(nativeListen('App', 'appUrlOpen', (e) => {
        if (!String(e?.url ?? '').startsWith(NATIVE_REDIRECT)) return;
        nativeCall('Browser', 'close').catch(() => {});
        finish(resolve, e.url);
      }));
      offs.push(nativeListen('Browser', 'browserFinished', () => setTimeout(() => finish(reject, new CloudError('cancel', 'closed')), 600)));
      nativeCall('Browser', 'open', { url, presentationStyle: 'popover' }).catch((err) => finish(reject, new CloudError('server', String(err?.message ?? err))));
    });
  }
  async function exchange(callbackUrl, verifier) {
    const cb = parseCallback(callbackUrl);
    if (!cb.code) throw new CloudError(/access_denied|cancel/i.test(cb.error) ? 'cancel' : 'server', cb.error || 'oauth');
    const s = await req('POST', '/auth/v1/token?grant_type=pkce', { auth_code: cb.code, code_verifier: verifier }, { auth: false });
    if (!s?.access_token) throw new CloudError('server', 'no session');
    return saveSession(s);
  }

  return {
    get session() { return session; },
    get user() { return session?.user ?? null; },

    async sendCode(email) {
      await req('POST', '/auth/v1/otp', { email, create_user: true }, { auth: false });
    },
    async verifyCode(email, code) {
      const s = await req('POST', '/auth/v1/verify', { type: 'email', email, token: code }, { auth: false });
      if (!s?.access_token) throw new CloudError('server', 'no session');
      return saveSession(s);
    },

    // Phones: resolves with the session. Web: the page goes to the provider and comes back (see resume()).
    async oauth(provider) {
      const { verifier, challenge } = await pkce();
      const redirect = isNative() ? NATIVE_REDIRECT : `${location.origin}${location.pathname}`;
      const url = `${cfg.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=s256`;
      if (!isNative()) {
        store.set(PENDING_KEY, { verifier, provider, at: Date.now() });
        location.assign(url);
        return new Promise(() => {}); // the page is leaving
      }
      return exchange(await openInAppBrowser(url), verifier);
    },
    // Web only: finish a Google / Apple sign-in when the provider sends us back with ?code=.
    async resume() {
      if (isNative() || typeof location === 'undefined') return null;
      const cb = parseCallback(location.href);
      if (!cb.code && !cb.error) return null;
      const pending = store.get(PENDING_KEY);
      store.set(PENDING_KEY, null);
      if (!pending) return null;
      try { history.replaceState(null, '', `${location.origin}${location.pathname}`); } catch (e) { /* ignore */ }
      const s = await exchange(location.href, pending.verifier);
      return { session: s, provider: pending.provider };
    },

    async signOut() {
      try { await req('POST', '/auth/v1/logout', {}); } catch (e) { /* the local session goes either way */ }
      saveSession(null);
    },
    async deleteAccount() {
      const r = await req('POST', '/rest/v1/rpc/nfa_delete_my_account', {});
      saveSession(null);
      return r;
    },
    // Level reached in the other Nimoriq games (the player's own rows; null where there is no save).
    async otherLevels() {
      const uid = session?.user?.id;
      if (!uid) throw new CloudError('auth', 'no session');
      const out = {};
      for (const [table, game] of [['tower_saves', 'tower'], ['choices_saves', 'choices']]) {
        try {
          const rows = await req('GET', `/rest/v1/${table}?select=level&user_id=eq.${uid}`);
          out[game] = Array.isArray(rows) && rows[0] ? rows[0].level || 0 : 0;
        } catch (e) { out[game] = 0; }
      }
      return out;
    },
    async loadSave() {
      const uid = session?.user?.id;
      if (!uid) throw new CloudError('auth', 'no session');
      const rows = await req('GET', `/rest/v1/nfa_saves?select=save_data,updated_at&user_id=eq.${uid}`);
      return Array.isArray(rows) && rows[0] ? rows[0].save_data : null;
    },
    async writeSave(data) {
      const uid = session?.user?.id;
      if (!uid) throw new CloudError('auth', 'no session');
      await req('POST', '/rest/v1/nfa_saves?on_conflict=user_id', { user_id: uid, save_data: data }, {
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      return true;
    },
  };
}
