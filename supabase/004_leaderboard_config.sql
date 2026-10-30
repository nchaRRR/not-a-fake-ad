-- =====================================================================================
-- Sıralama tabloları + uzaktan ayarlar (Not a Fake Ad, Tower, Choices — üçü ortak)
--
-- Supabase Dashboard → SQL Editor'da BİR KEZ çalıştırın (002_game_events.sql'den sonra).
-- Tekrar çalıştırmak güvenlidir.
--
-- 1) lb_scores: haftalık ve tüm zamanlar sıralaması. Oyuncular tabloya DOĞRUDAN yazamaz/okuyamaz;
--    sadece lb_submit / lb_top / lb_rename fonksiyonlarıyla (puan aralıkları ve isim sınırları burada).
-- 2) game_config: oyunların açılışta okuduğu ayarlar (zorluk, ara reklam sıklığı, duyuru…).
--    Herkes OKUYABİLİR, sadece sen Dashboard'dan DEĞİŞTİREBİLİRSİN. Oyunu güncellemeden ayar değişir.
-- =====================================================================================

-- ------------------------------------------------------------------ 1) sıralama
create table if not exists public.lb_scores (
  game        text not null,
  board       text not null,
  period      text not null,               -- 'all' ya da '2026-W44'
  install_id  text not null,
  name        text not null,
  score       integer not null,
  updated_at  timestamptz not null default now(),
  primary key (game, board, period, install_id)
);
create index if not exists lb_scores_top on public.lb_scores (game, board, period, score desc, updated_at);
alter table public.lb_scores enable row level security;
revoke all on public.lb_scores from anon, authenticated, public;

-- izinli tablolar ve puan üst sınırları (hile ile uçuk puanlar girilmesin)
create or replace function public.lb_max(p_game text, p_board text)
returns integer language sql immutable as $$
  select case
    when p_game = 'choices' and p_board = 'endless' then 2000
    when p_game = 'choices' and p_board = 'level'   then 100000
    when p_game = 'tower'   and p_board = 'level'   then 100000
    when p_game = 'tower'   and p_board = 'daily'   then 5000
    when p_game = 'nfa'     and p_board = 'level'   then 100000
    else null end
$$;

create or replace function public.lb_clean_name(p_name text)
returns text language sql immutable as $$
  select left(regexp_replace(btrim(coalesce(p_name, '')), '[<>"\\\n\r\t]', '', 'g'), 18)
$$;

create or replace function public.lb_submit(p_game text, p_board text, p_install text, p_name text, p_score integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  mx integer := public.lb_max(p_game, p_board);
  nm text := public.lb_clean_name(p_name);
  wk text := to_char(now() at time zone 'Europe/Istanbul', 'IYYY-"W"IW');
begin
  if mx is null or p_score is null or p_score < 0 or p_score > mx then return; end if;
  if p_install is null or char_length(p_install) not between 8 and 64 then return; end if;
  if nm = '' then nm := 'Player'; end if;
  insert into public.lb_scores as s (game, board, period, install_id, name, score)
    values (p_game, p_board, 'all', p_install, nm, p_score), (p_game, p_board, wk, p_install, nm, p_score)
  on conflict (game, board, period, install_id) do update
    set score = greatest(s.score, excluded.score), name = excluded.name,
        updated_at = case when excluded.score > s.score then now() else s.updated_at end;
end;
$$;

create or replace function public.lb_rename(p_game text, p_install text, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare nm text := public.lb_clean_name(p_name);
begin
  if nm = '' or p_install is null then return; end if;
  update public.lb_scores set name = nm where game = p_game and install_id = p_install;
end;
$$;

-- en iyi 50 + (listede değilse) oyuncunun kendi sırası
create or replace function public.lb_top(p_game text, p_board text, p_period text, p_install text)
returns table (rank bigint, name text, score integer, me boolean)
language sql stable security definer set search_path = '' as $$
  with per as (
    select case when p_period = 'week' then to_char(now() at time zone 'Europe/Istanbul', 'IYYY-"W"IW') else 'all' end as p
  ), ranked as (
    select row_number() over (order by s.score desc, s.updated_at asc) as rank, s.name, s.score, s.install_id = p_install as me
    from public.lb_scores s, per
    where s.game = p_game and s.board = p_board and s.period = per.p
  )
  select rank, name, score, me from ranked where rank <= 50 or me order by rank
$$;

revoke all on function public.lb_submit(text, text, text, text, integer), public.lb_rename(text, text, text), public.lb_top(text, text, text, text) from public;
grant execute on function public.lb_submit(text, text, text, text, integer), public.lb_rename(text, text, text), public.lb_top(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------------ 2) uzaktan ayarlar
create table if not exists public.game_config (
  game        text primary key check (game in ('nfa', 'tower', 'choices')),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at  timestamptz not null default now()
);
alter table public.game_config enable row level security;
drop policy if exists game_config_read on public.game_config;
create policy game_config_read on public.game_config for select to anon, authenticated using (true);
revoke all on public.game_config from anon, authenticated, public;
grant select on public.game_config to anon, authenticated;

-- Varsayılanlar (oyundaki varsayılanlarla aynı; değiştirmek için data'yı düzenle):
--   coin_mult              altın ödülü çarpanı (1 = normal)
--   time_mult              (Choices) seçim süresi çarpanı: 1.2 = %20 daha uzun
--   enemy_mult             (Not a Fake Ad) düşman canı çarpanı: 0.9 = %10 daha kolay
--   interstitial_every     kaç bölümde bir ara reklam (0 = kapalı)
--   interstitial_from      ara reklamın başladığı bölüm
--   interstitial_gap_s     iki ara reklam arası en az saniye
--   review_enabled         "Oyunu sevdin mi?" sorusu açık/kapalı
--   review_after_wins      kaç kazanmadan sonra sorulsun
--   notice                 ana ekranda bir kez gösterilecek duyuru, dil başına: {"tr": "...", "en": "..."}
--   notice_id              duyuruyu değiştirince bunu da değiştir (oyuncu yeni duyuruyu bir kez görür)
insert into public.game_config (game, data) values
  ('choices', '{"coin_mult": 1, "time_mult": 1, "interstitial_every": 3, "interstitial_from": 6, "interstitial_gap_s": 120, "review_enabled": true, "review_after_wins": 8}'),
  ('tower',   '{"coin_mult": 1, "interstitial_every": 3, "interstitial_from": 6, "interstitial_gap_s": 120, "review_enabled": true, "review_after_wins": 8}'),
  ('nfa',     '{"coin_mult": 1, "enemy_mult": 1, "interstitial_every": 3, "interstitial_from": 6, "interstitial_gap_s": 120, "review_enabled": true, "review_after_wins": 8}')
on conflict (game) do nothing;

-- Örnek: Choices'ta süreyi %15 uzat ve duyuru göster
--   update game_config set data = data || '{"time_mult": 1.15, "notice_id": "n1", "notice": {"tr": "Süreler uzadı!", "en": "More time to pick!"}}', updated_at = now() where game = 'choices';
