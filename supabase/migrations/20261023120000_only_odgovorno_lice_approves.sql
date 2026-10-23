-- Najavu koja čeka odobrenje smije odobriti (izvesti iz 'awaiting_approval')
-- samo odgovorno lice tog kupca - ni drugi supervizor/voditelj, ni admin.
-- Admin/voditelj mogu prvo promijeniti odgovorno lice kupcu.
-- Pozivi bez korisnika (auth.uid() null - service role, SQL) nisu ograničeni.

create or replace function public.enforce_odgovorno_lice_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'awaiting_approval'
     and new.status is distinct from 'awaiting_approval'
     and auth.uid() is not null
     and auth.uid() is distinct from old.odgovorno_lice_id then
    raise exception 'Ovu najavu može odobriti samo odgovorno lice kupca.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_odgovorno_lice_approval() from public;

create trigger announcements_enforce_odgovorno_lice_approval
before update on public.announcements
for each row execute function public.enforce_odgovorno_lice_approval();
