-- =====================================================================================
-- Oyun istatistikleri (Not a Fake Ad, Tower, Choices — üçü AYNI tabloyu kullanır)
--
-- Supabase Dashboard → SQL Editor'da BİR KEZ çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Oyunlar telefonda şu olayları gönderir: oturum başı/sonu, bölüm başı/kazanma/kaybetme, reklam,
-- satın alma, sandık, çark… ve JavaScript hataları ("js_error"). Kişisel veri YOK: telefonda üretilen
-- rastgele bir kimlik (install_id), olay adı ve birkaç sayı.
--
-- Güvenlik: herkes (anon) yalnızca EKLEYEBİLİR, kimse okuyamaz/silemez/değiştiremez. Okuma sadece
-- Dashboard'dan (SQL Editor / Table editor) yapılır. Boyut ve alan sınırları kötüye kullanımı keser.
-- =====================================================================================

create table if not exists public.game_events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  game         text not null check (game in ('nfa', 'tower', 'choices')),
  install_id   text not null check (char_length(install_id) between 8 and 64),
  session_id   text check (char_length(session_id) <= 64),
  name         text not null check (char_length(name) between 1 and 48),
  params       jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object' and pg_column_size(params) < 4096),
  platform     text check (char_length(platform) <= 16),
  lang         text check (char_length(lang) <= 8),
  app_version  text check (char_length(app_version) <= 16),
  client_at    timestamptz
);

create index if not exists game_events_game_time on public.game_events (game, created_at desc);
create index if not exists game_events_game_name on public.game_events (game, name, created_at desc);
create index if not exists game_events_install on public.game_events (game, install_id);

alter table public.game_events enable row level security;

drop policy if exists game_events_insert_any on public.game_events;
create policy game_events_insert_any on public.game_events
  for insert to anon, authenticated with check (true);

revoke all on public.game_events from anon, authenticated, public;
grant insert on public.game_events to anon, authenticated;

-- ------------------------------------------------------------------ hazır raporlar (sadece Dashboard'dan)
-- Günlük oyuncu (DAU) ve oturum:
create or replace view public.game_daily with (security_invoker = true) as
  select game, (created_at at time zone 'Europe/Istanbul')::date as day,
         count(distinct install_id) as players,
         count(*) filter (where name = 'session_start') as sessions,
         count(*) filter (where name = 'level_win' or name = 'level_complete') as level_wins,
         count(*) filter (where name = 'level_fail') as level_fails,
         count(*) filter (where name like 'ad%' or name = 'ad_reward') as ad_events,
         count(*) filter (where name = 'js_error') as errors
  from public.game_events group by 1, 2;

-- Bölüm hunisi: kaç oyuncu hangi bölüme kadar geldi (oyunu bırakılan yerler)
create or replace view public.game_level_funnel with (security_invoker = true) as
  select game, (params ->> 'level')::int as level,
         count(distinct install_id) filter (where name = 'level_start') as players_started,
         count(*) filter (where name = 'level_start') as starts,
         count(*) filter (where name in ('level_win', 'level_complete')) as wins,
         count(*) filter (where name = 'level_fail') as fails
  from public.game_events
  where params ? 'level' and (params ->> 'level') ~ '^-?[0-9]+$'
  group by 1, 2;

-- 1. gün geri dönüş: ilk gün oynayanların ertesi gün de oynama oranı
create or replace view public.game_retention_d1 with (security_invoker = true) as
  with first_day as (
    select game, install_id, min((created_at at time zone 'Europe/Istanbul')::date) as d0
    from public.game_events group by 1, 2
  ), back as (
    select distinct f.game, f.install_id, f.d0
    from first_day f join public.game_events e
      on e.game = f.game and e.install_id = f.install_id and (e.created_at at time zone 'Europe/Istanbul')::date = f.d0 + 1
  )
  select f.game, f.d0 as cohort_day, count(*) as new_players, count(b.install_id) as came_back_d1,
         round(100.0 * count(b.install_id) / nullif(count(*), 0), 1) as d1_percent
  from first_day f left join back b on b.game = f.game and b.install_id = f.install_id
  group by 1, 2;

revoke all on public.game_daily, public.game_level_funnel, public.game_retention_d1 from anon, authenticated, public;

-- Kullanım (SQL Editor):
--   select * from game_daily where game = 'choices' order by day desc;
--   select * from game_level_funnel where game = 'tower' order by level;
--   select * from game_retention_d1 where game = 'nfa' order by cohort_day desc;
--   select created_at, params from game_events where name = 'js_error' order by id desc limit 50;
-- Eski kayıtları temizlemek (isteğe bağlı, 180 günden eski):
--   delete from game_events where created_at < now() - interval '180 days';
