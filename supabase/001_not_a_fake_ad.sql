-- =====================================================================================
-- Not a Fake Ad — Supabase kurulumu (Kelime Köyü ile AYNI projede)
--
-- Supabase Dashboard → SQL Editor'da BİR KEZ çalıştırın. Tekrar çalıştırmak güvenlidir
-- (idempotent): tablo/politika varsa yeniden oluşturulmaz, veri silinmez.
--
-- Bu dosya Kelime Köyü'nün hiçbir tablosuna ya da fonksiyonuna dokunmaz. Her şey "nfa_"
-- önekiyle ayrı durur:
--   nfa_saves               oyun kaydı (tek satır / oyuncu, JSON)
--   nfa_delete_my_account() oyuncunun bu oyundaki verisini siler (App Store 5.1.1(v), Play)
--
-- Hesaplar iki oyunda ortaktır (auth.users). Bu yüzden:
--   - Not a Fake Ad'den "Hesabı sil" → bu oyunun kaydı silinir. Oyuncunun Kelime Köyü'nde
--     verisi YOKSA kullanıcı da tamamen silinir; VARSA kullanıcı kalır, Kelime Köyü ilerlemesi korunur.
--   - Kelime Köyü'nden "Hesabı sil" (delete_my_account) kullanıcıyı siler; on delete cascade
--     sayesinde bu oyunun kaydı da onunla birlikte silinir. Ek bir şey yapmaya gerek yok.
--
-- Güvenlik:
--   - RLS açık. Oyuncu yalnızca kendi satırını okur / ekler / günceller (auth.uid() = user_id).
--   - Silme politikası yok; silme yalnızca nfa_delete_my_account() ile, yalnızca kendi verisi.
--   - "anon" rolüne hiçbir yetki verilmez.
-- =====================================================================================

-- ------------------------------------------------------------------ yardımcı: updated_at
create or replace function public.nfa_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ nfa_saves
create table if not exists public.nfa_saves (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  save_data   jsonb not null,
  level       integer generated always as (
                case when jsonb_typeof(save_data -> 'level') = 'number'
                     then (save_data ->> 'level')::numeric::integer end
              ) stored,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint nfa_saves_data_chk check (jsonb_typeof(save_data) = 'object'),
  -- Kötüye kullanım sınırı: tek kayıt en fazla ~256 KB (oyunun kaydı 10 KB civarı)
  constraint nfa_saves_size_chk check (pg_column_size(save_data) < 262144)
);

-- updated_at her yazımda SUNUCU saatiyle yazılır
drop trigger if exists nfa_saves_touch on public.nfa_saves;
create trigger nfa_saves_touch before insert or update on public.nfa_saves
  for each row execute function public.nfa_touch_updated_at();

alter table public.nfa_saves enable row level security;

drop policy if exists nfa_saves_select_own on public.nfa_saves;
create policy nfa_saves_select_own on public.nfa_saves
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists nfa_saves_insert_own on public.nfa_saves;
create policy nfa_saves_insert_own on public.nfa_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists nfa_saves_update_own on public.nfa_saves;
create policy nfa_saves_update_own on public.nfa_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.nfa_saves from anon, public;
grant select, insert, update on public.nfa_saves to authenticated;

-- ------------------------------------------------------------------ hesap silme
-- Bu oyunun verisini siler. Kullanıcının Kelime Köyü'nde (ya da ileride başka bir oyunda)
-- verisi yoksa auth.users satırını da siler. Dönüş: {"user_deleted": true|false}
create or replace function public.nfa_delete_my_account()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  elsewhere boolean := false;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.nfa_saves where user_id = me;

  -- Kelime Köyü tabloları bu projede var mı, varsa oyuncunun orada verisi var mı?
  if to_regclass('public.player_saves') is not null then
    execute 'select exists (select 1 from public.player_saves where user_id = $1)' into elsewhere using me;
  end if;
  if not elsewhere and to_regclass('public.profiles') is not null then
    execute 'select exists (select 1 from public.profiles where id = $1)' into elsewhere using me;
  end if;
  if not elsewhere and to_regclass('public.player_stats') is not null then
    execute 'select exists (select 1 from public.player_stats where user_id = $1)' into elsewhere using me;
  end if;
  -- Yönetici hesabı yanlışlıkla silinmesin
  if not elsewhere and to_regclass('public.admins') is not null then
    execute 'select exists (select 1 from public.admins where user_id = $1)' into elsewhere using me;
  end if;

  if not elsewhere then
    delete from auth.users where id = me;
  end if;
  return jsonb_build_object('user_deleted', not elsewhere);
end;
$$;
revoke execute on function public.nfa_delete_my_account() from public, anon;
grant execute on function public.nfa_delete_my_account() to authenticated;

-- ------------------------------------------------------------------ kontrol
-- Çalıştırdıktan sonra şu sorgu "nfa_saves | true" döndürmeli (RLS açık):
--   select relname, relrowsecurity from pg_class where relname = 'nfa_saves';
