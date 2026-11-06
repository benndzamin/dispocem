-- Pakovanje vrste cementa (25/1, 20/1, rinfuzni) kao pouzdana kolona, umjesto
-- prepoznavanja po riječi u nazivu; prebacivanje dozvola kupaca sa starih
-- (preimenovanih) naziva na nove; ubuduće se preimenovanje samo prenosi kupcima.

-- 1. Pakovanje ------------------------------------------------------------------
-- Postojeća kolona je djelimično pogrešna (rinfuzne vrste s "25 kg"), pa se
-- vrijednost ponovo izračunava iz naziva.
update public.cement_types
set packaging = case
  when name ~* 'rinfuz' then 'rinfuzni'
  when name ~* '20/1|20 ?kg' then '20/1'
  else '25/1'
end;

alter table public.cement_types alter column packaging set default '25/1';
alter table public.cement_types alter column packaging set not null;
alter table public.cement_types drop constraint if exists cement_types_packaging_check;
alter table public.cement_types
  add constraint cement_types_packaging_check
  check (packaging in ('25/1', '20/1', 'rinfuzni'));

-- 2. Stare dozvole kupaca -> novi nazivi ----------------------------------------
-- Zamjena samo ako novi naziv postoji u katalogu; duplikati se uklanjaju,
-- redoslijed ostaje. Najave (historija) zadržavaju stare nazive.
with mapping(old_name, new_name) as (
  values
    ('PREMILUK (CEM I 52,5 N) - 25 kg', 'CEM I 52,5 N - PREMILUK - uvrećani 25/1'),
    ('PREMILUK (CEM I 52,5 N) - RINFUZA', 'CEM I 52,5 N - PREMILUK - rinfuzni'),
    ('SUPRALUK (CEM II/B-M 42,5 N) - 25 kg', 'CEM II/B-M (V-L) 42,5 N - SUPRALUK - uvrećani 25/1'),
    ('SUPRALUK (CEM II/B-M 42,5 N) - RINFUZA', 'CEM II/B-M (V-L) 42,5 N - SUPRALUK - rinfuzni'),
    ('FINELUK (CEM II/B-M 32,5 N) - 25 kg', 'CEM II/B-M (V-L) 32,5 N - FINELUK - uvrećani 25/1'),
    ('FINELUK (CEM II/B-M 32,5 N) - RINFUZA', 'CEM II/B-M (V-L) 32,5 N - FINELUK - rinfuzni'),
    ('SULFALUK (CEM III/B 32,5 N SR-LH) - 25 kg', 'CEM III/B 32,5 N SR-LH - SULFALUK - uvrećani 25/1'),
    ('SULFALUK (CEM III/B 32,5 N SR-LH) - RINFUZA', 'CEM III/B 32,5 N SR-LH - SULFALUK - rinfuzni'),
    ('Supraluk PLUS (CEM V/A 42,5 N) - 25 kg', 'CEM V/A (S-V) 42,5 N - SUPRALUK plus - uvrećani 25/1'),
    ('Fineluk PLUS (CEM V/A 32,5 N) - 25 kg', 'CEM V/A (S-V) 32,5 N FINELUK plus - uvrećani 25/1'),
    ('LUMAL - 25 kg', 'Zidarski cement LUMAL - uvrećani 20/1')
),
valid_mapping as (
  select m.old_name, m.new_name
  from mapping m
  where exists (select 1 from public.cement_types c where c.name = m.new_name)
),
remapped as (
  select u.id,
    array(
      select x.artikal
      from (
        select coalesce(vm.new_name, a.artikal) as artikal, min(a.ord) as ord
        from unnest(u.dozvoljeni_artikli) with ordinality as a(artikal, ord)
        left join valid_mapping vm on vm.old_name = a.artikal
        group by 1
      ) x
      order by x.ord
    ) as artikli
  from public.users u
  where u.dozvoljeni_artikli && (select array_agg(old_name) from valid_mapping)
)
update public.users u
set dozvoljeni_artikli = r.artikli
from remapped r
where u.id = r.id;

-- 3. Preimenovanje vrste se ubuduće prenosi na dozvole kupaca --------------------
create or replace function public.sync_cement_type_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.users
    set dozvoljeni_artikli = array_replace(dozvoljeni_artikli, old.name, new.name)
    where old.name = any (dozvoljeni_artikli);
  end if;
  return new;
end;
$$;

drop trigger if exists cement_types_sync_rename on public.cement_types;
create trigger cement_types_sync_rename
after update of name on public.cement_types
for each row execute function public.sync_cement_type_rename();

notify pgrst, 'reload schema';
