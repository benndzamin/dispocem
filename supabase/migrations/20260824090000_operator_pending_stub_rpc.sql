-- Operater dobija push notifikaciju cim se kreira obavezna najava koja ceka
-- odobrenje supervizora ("awaiting_approval"), ali samu najavu ne moze
-- vidjeti nigdje u aplikaciji (RLS je namjerno skriva - vidi
-- 20260805100000_najava_approval_workflow.sql). Da bi mogao vidjeti barem
-- read-only red u dispocem web tabeli (bez ikakvih akcija), dodajemo izolovan
-- RPC koji SAMO operateru vraca te redove - bazna RLS politika na
-- announcements tabeli se ne dira, pa eksterna aplikacija "expedicija" (i bilo
-- koji drugi klijent koji direktno cita announcements) i dalje ne vidi ove
-- redove sve dok status ne predje u 'pending'.

create or replace function public.get_pending_najave_for_operator()
returns setof public.announcements
language sql
security definer
set search_path = public
as $$
  select *
  from public.announcements
  where status = 'awaiting_approval'
    and public.is_role('wb_operator')
  order by created_at desc
$$;

grant execute on function public.get_pending_najave_for_operator() to authenticated;
