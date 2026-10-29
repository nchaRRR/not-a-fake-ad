-- =====================================================================================
-- Not a Fake Ad — hesap silme güncellemesi (Not a Fake Ad: Tower geldiği için)
--
-- Supabase Dashboard → SQL Editor'da BİR KEZ çalıştırın (001'den sonra). Tekrar çalıştırmak güvenlidir.
-- nfa_delete_my_account() artık oyuncunun Tower'daki kaydına da bakar: Tower'da verisi varsa
-- hesap (auth.users) silinmez, sadece Not a Fake Ad kaydı silinir.
-- =====================================================================================

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

  -- Tower'da kaydı var mı?
  if to_regclass('public.tower_saves') is not null then
    execute 'select exists (select 1 from public.tower_saves where user_id = $1)' into elsewhere using me;
  end if;
  -- Kelime Köyü tabloları bu projede var mı, varsa oyuncunun orada verisi var mı?
  if not elsewhere and to_regclass('public.player_saves') is not null then
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

