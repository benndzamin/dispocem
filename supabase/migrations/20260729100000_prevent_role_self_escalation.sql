-- "Users can update own profile" (20260717140000, dopunjena 20260717180000)
-- dozvoljava korisniku da update-uje SVOJ red, ali RLS politike ograničavaju
-- samo REDOVE, ne i KOLONE. Bez ove zaštite, buyer bi i dalje mogao direktnim
-- API pozivom promijeniti sopstvenu 'rola' u 'admin' čak i nakon što je RLS
-- ponovo uključen (20260729090000) - jer "id = auth.uid()" ostaje tačno.
--
-- Trigger ograničava promjenu rola/dozvoljeni_artikli/announcement_required
-- (kolone koje predstavljaju privilegije/dozvole) samo na admin/supervisor
-- aktere. Provjera koristi is_admin_or_supervisor() koja čita STANJE PRIJE
-- update-a (BEFORE trigger), pa korisnik ne može zaobići provjeru mijenjajući
-- sopstvenu ulogu u istom update-u.

create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.rola is distinct from old.rola
    or new.dozvoljeni_artikli is distinct from old.dozvoljeni_artikli
    or new.announcement_required is distinct from old.announcement_required
  ) and not public.is_admin_or_supervisor() then
    raise exception 'Nemate dozvolu za promjenu uloge ili dozvola korisnika.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.users;

create trigger trg_prevent_role_self_escalation
before update on public.users
for each row
execute function public.prevent_role_self_escalation();
