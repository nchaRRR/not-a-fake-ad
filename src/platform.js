// The single bridge to the phone's own services: Game Center / Google Play Games,
// local notifications and cloud saves. In the browser every call is a safe no-op.
// When packaging with Capacitor, fill in each function with the plugin call
// (for example @capacitor/local-notifications and a Game Center / Play Games plugin).
// The rest of the game only ever talks to this file.

const native = () => typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();

export const platform = {
  isNative: native,

  // Game Center / Play Games achievements. `id` is our id; map it to store ids here.
  async unlockAchievement(id) {
    if (!native()) return false;
    // TODO(packaging): GameServices.unlockAchievement({ achievementID: STORE_IDS[id] })
    return false;
  },

  // Leaderboards: best level reached and biggest army.
  async submitScore(board, value) {
    if (!native()) return false;
    // TODO(packaging): GameServices.submitScore({ leaderboardID: STORE_IDS[board], totalScoreAmount: value })
    return false;
  },

  async showLeaderboards() {
    if (!native()) return false;
    // TODO(packaging): GameServices.showLeaderboard(...)
    return false;
  },

  // Local notifications: replaces everything scheduled before.
  async scheduleNotifications(list) {
    if (!native()) return false;
    // TODO(packaging): LocalNotifications.cancel(all); LocalNotifications.schedule({ notifications: list })
    return false;
  },

  async requestNotificationPermission() {
    if (!native()) return 'unavailable';
    // TODO(packaging): LocalNotifications.requestPermissions()
    return 'unavailable';
  },

  // Accounts (Supabase Auth, like our other games; Apple/Google through the native sign-in sheets).
  // Each resolves to { ok, user: { uid, provider, email, name } } or { ok: false, code }.
  async authSignIn(provider) {
    // TODO(packaging): native Apple / Google sign-in, then supabase.auth.signInWithIdToken({ provider, token })
    return null;
  },

  async authEmailCode(action, email, code) {
    // TODO(packaging): 'send' -> supabase.auth.signInWithOtp({ email }) (mail sent by Resend from noreply@nimoriq.com)
    //                  'verify' -> supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    return null;
  },

  async authSignOut() {
    // TODO(packaging): supabase.auth.signOut()
    return null;
  },

  async authDelete() {
    // TODO(packaging): supabase.rpc('delete_my_account') — removes the save row and the user, as in Köstebek Avcısı
    return null;
  },

  // Cloud save: one row per account in Supabase (table saves, keyed by user id).
  async cloudSave(uid, data) {
    if (!native()) return false;
    // TODO(packaging): supabase.from('saves').upsert({ user_id: uid, data })
    return false;
  },

  async cloudLoad(uid) {
    if (!native()) return null;
    // TODO(packaging): (await supabase.from('saves').select('data').eq('user_id', uid).maybeSingle()).data?.data
    return null;
  },
};
