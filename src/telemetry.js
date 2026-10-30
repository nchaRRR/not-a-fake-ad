// Anonymous play statistics sent to our Supabase project (table game_events), so we can see where
// players stop, which ads they watch and whether they come back. No account or personal data:
// a random id made on this phone, the event name and a few numbers. JavaScript errors are sent the
// same way (event "js_error"). Phone app only; the web preview sends nothing.
import { CLOUD_CONFIG, nativePlatform } from './cloud.js';
import { addProvider } from './analytics.js';

const MAX_QUEUE = 300;
const BATCH = 50;

function uid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* old webview */ }
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
};

export function startTelemetry({ game, version, enabled, lang = () => '' }) {
  if (!enabled) return;
  const idKey = `${game}-iid`;
  const qKey = `${game}-evq`;
  let installId = store.get(idKey);
  if (!installId) { installId = uid(); store.set(idKey, installId); }
  const sessionId = uid();
  const started = Date.now();
  let queue = Array.isArray(store.get(qKey)) ? store.get(qKey) : [];
  let sending = false;
  let errors = 0;

  const clean = (params) => {
    try {
      const s = JSON.stringify(params || {});
      return s.length > 1500 ? { truncated: true } : JSON.parse(s);
    } catch (e) { return {}; }
  };
  function push(name, params) {
    queue.push({
      game, install_id: installId, session_id: sessionId, name: String(name).slice(0, 48), params: clean(params),
      platform: nativePlatform(), lang: String(lang() || '').slice(0, 8), app_version: version, client_at: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    store.set(qKey, queue);
  }
  async function flush() {
    if (sending || !queue.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    sending = true;
    const batch = queue.slice(0, BATCH);
    try {
      const r = await fetch(`${CLOUD_CONFIG.url}/rest/v1/game_events`, {
        method: 'POST',
        headers: { apikey: CLOUD_CONFIG.key, Authorization: `Bearer ${CLOUD_CONFIG.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) {
        // sent (or rejected for good): drop them either way so a bad event can't block the queue
        queue = queue.slice(batch.length);
        store.set(qKey, queue);
      }
    } catch (e) { /* offline: try later */ }
    sending = false;
  }

  addProvider((name, params) => push(name, params));
  window.addEventListener('error', (e) => {
    if (errors++ >= 5) return;
    push('js_error', { m: String(e.message || '').slice(0, 300), s: String(e.filename || '').split('/').pop(), l: e.lineno, c: e.colno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (errors++ >= 5) return;
    const r = e.reason;
    push('js_error', { m: String((r && (r.message || r)) || '').slice(0, 300), kind: 'promise' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { push('session_pause', { secs: Math.round((Date.now() - started) / 1000) }); flush(); }
  });
  setInterval(flush, 20000);
  setTimeout(flush, 5000);
}
