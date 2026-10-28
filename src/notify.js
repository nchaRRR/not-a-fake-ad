// What the game would like to tell the player while it is closed.
// Planned here, delivered as local notifications by platform.js once packaged.
// No server involved: the phone schedules them itself.
import { t } from './i18n.js';
import { platform } from './platform.js';
import { seasonNow } from './meta.js';

function at(daysFromNow, hour, minute = 0, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function planNotifications(save, now = new Date()) {
  const list = [];
  const nextStreak = ((save.daily && save.daily.streak) || 0) % 7 + 1;
  list.push({ id: 1, at: at(1, 10, 0, now), title: t('note.wheel.title'), body: t('note.wheel.body') });
  list.push({ id: 2, at: at(1, 18, 30, now), title: t('note.daily.title'), body: t('note.daily.body', { n: nextStreak }) });
  list.push({ id: 3, at: at(3, 19, 0, now), title: t('note.back.title'), body: t('note.back.body', { n: save.level || 1 }) });
  const season = seasonNow(now.getTime());
  if (season.daysLeft > 2 && save.pass && save.pass.xp > 0) {
    list.push({ id: 4, at: at(season.daysLeft - 2, 12, 0, now), title: t('note.pass.title'), body: t('note.pass.body') });
  }
  return list.filter((n) => n.at > now);
}

// Called when the game goes to the background.
export function scheduleIfAllowed(save) {
  if (save.notify === false) return platform.scheduleNotifications([]);
  return platform.scheduleNotifications(planNotifications(save));
}
