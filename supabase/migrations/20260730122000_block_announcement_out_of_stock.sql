-- Odbija kreiranje najave (announcements insert) za vrstu cementa koja
-- trenutno nije na stanju (na_stanju = false) ili ne postoji/obrisana je.

create or replace function public.check_cement_type_in_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.cement_types
    where name = new.vrsta_cementa
      and is_active = true
      and na_stanju = true
  ) then
    raise exception 'Vrsta cementa "%" trenutno nije na stanju.', new.vrsta_cementa
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_check_stock on public.announcements;
create trigger announcements_check_stock
before insert on public.announcements
for each row execute function public.check_cement_type_in_stock();
