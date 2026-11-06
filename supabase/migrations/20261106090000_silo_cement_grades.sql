-- Vrsta cementa po silosu + historija promjena vrste.
--
-- Pravila (provode se ovdje, ne samo u UI-ju):
-- * Silos je PRAZAN kad je zadnja mjera >= visina silosa (tolerancija 0,01 m),
--   ili kad nema nijednog mjerenja.
-- * Vrsta se može postaviti/promijeniti samo kad je silos prazan, ili kad
--   silosu vrsta nikad nije postavljena (jednokratno pri uvođenju).
-- * Mjera s materijalom nakon praznog stanja traži da je vrsta postavljena
--   POSLIJE tog praznog mjerenja. Dopuna (prethodno nije bio prazan) ne traži
--   ništa - vrijedi vrsta koja je već u silosu.
-- * Trenutna vrsta silosa = zadnji red u silo_cement_changes za taj silos.

-- 1. Katalog vrsta -------------------------------------------------------------
create table if not exists public.silo_cement_grades (
  id uuid primary key default gen_random_uuid(),
  designation text not null,
  brand text,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  unique (designation, brand)
);

-- "where not exists" umjesto "on conflict": brand je null za CEM III/A, a
-- null se u unique ograničenju ne poredi, pa bi ponovljeni seed dupliciralo red.
insert into public.silo_cement_grades (designation, brand, sort_order)
select v.designation, v.brand, v.sort_order
from (values
  ('CEM I 52,5N', 'PREMILUK', 1),
  ('CEM II/B-M (V-L) 42,5 N', 'SUPRALUK', 2),
  ('CEM V/A (S-V) 42,5 N', 'SUPRALUK plus', 3),
  ('CEM II/B-M (V-L) 32,5 N', 'FINELUK', 4),
  ('CEM V/A (S-V) 32,5 N', 'FINELUK plus', 5),
  ('CEM III/A 42,5 N', null, 6),
  ('CEM III/B 32,5N SR-LH', 'SULFALUK', 7),
  ('Zidarski cement', 'LUMAL', 8)
) as v(designation, brand, sort_order)
where not exists (
  select 1 from public.silo_cement_grades g
  where g.designation = v.designation and g.brand is not distinct from v.brand
);

-- 2. Historija promjena vrste ---------------------------------------------------
create table if not exists public.silo_cement_changes (
  id uuid primary key default gen_random_uuid(),
  silo_id uuid not null references public.silos(id) on delete cascade,
  old_grade_id uuid references public.silo_cement_grades(id),
  new_grade_id uuid not null references public.silo_cement_grades(id),
  changed_by uuid references public.users(id) on delete set null,
  changed_by_email text,
  changed_at timestamptz not null default now()
);

create index if not exists silo_cement_changes_silo_id_changed_at_idx
  on public.silo_cement_changes (silo_id, changed_at desc);
create index if not exists silo_cement_changes_changed_at_idx
  on public.silo_cement_changes (changed_at desc);

-- 3. Snimak vrste uz svako mjerenje -------------------------------------------
alter table public.silo_readings
  add column if not exists cement_grade_id uuid references public.silo_cement_grades(id);

-- 4. Grant-ovi (bez update/delete - historija se ne mijenja) -----------------
grant select on public.silo_cement_grades to authenticated;
grant select, insert on public.silo_cement_changes to authenticated;
grant select on public.silo_cement_grades to service_role;
grant select on public.silo_cement_changes to service_role;

-- 5. RLS ----------------------------------------------------------------------
alter table public.silo_cement_grades enable row level security;
alter table public.silo_cement_changes enable row level security;

drop policy if exists "Silo stock viewers can read cement grades" on public.silo_cement_grades;
create policy "Silo stock viewers can read cement grades" on public.silo_cement_grades
for select to authenticated
using (public.is_admin_or_supervisor() or public.is_role('mill_operator'));

drop policy if exists "Silo stock viewers can read cement changes" on public.silo_cement_changes;
create policy "Silo stock viewers can read cement changes" on public.silo_cement_changes
for select to authenticated
using (public.is_admin_or_supervisor() or public.is_role('mill_operator'));

drop policy if exists "Mill operator can insert cement changes" on public.silo_cement_changes;
create policy "Mill operator can insert cement changes" on public.silo_cement_changes
for insert to authenticated
with check (public.is_role('mill_operator') and changed_by = auth.uid());

-- 6. Trigger: promjena vrste ------------------------------------------------------
create or replace function public.silo_cement_change_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_height numeric;
  v_last_grade uuid;
  v_last_avg numeric;
begin
  -- Zaključavanje reda silosa serijalizuje istovremene unose za isti silos.
  select total_height_m into v_height
  from public.silos where id = new.silo_id
  for update;
  if not found then
    raise exception 'Silos ne postoji.' using errcode = 'foreign_key_violation';
  end if;

  select new_grade_id into v_last_grade
  from public.silo_cement_changes
  where silo_id = new.silo_id
  order by changed_at desc, id desc
  limit 1;

  select avg_empty_m into v_last_avg
  from public.silo_readings
  where silo_id = new.silo_id
  order by recorded_at desc
  limit 1;

  if v_last_grade is not null
     and v_last_avg is not null
     and v_height - v_last_avg > 0.01 then
    raise exception 'Vrsta cementa se može promijeniti samo kad je silos prazan.'
      using errcode = 'check_violation';
  end if;

  new.old_grade_id := v_last_grade;
  new.changed_by_email := (select email from public.users where id = new.changed_by);
  new.changed_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists silo_cement_changes_before_insert on public.silo_cement_changes;
create trigger silo_cement_changes_before_insert
before insert on public.silo_cement_changes
for each row execute function public.silo_cement_change_before_insert();

-- 7. Trigger: mjerenje -----------------------------------------------------------
create or replace function public.silo_reading_check_cement_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_height numeric;
  v_prev_avg numeric;
  v_prev_at timestamptz;
  v_grade uuid;
  v_grade_at timestamptz;
  v_prev_empty boolean;
begin
  select total_height_m into v_height
  from public.silos where id = new.silo_id
  for update;
  if not found then
    raise exception 'Silos ne postoji.' using errcode = 'foreign_key_violation';
  end if;

  select avg_empty_m, recorded_at into v_prev_avg, v_prev_at
  from public.silo_readings
  where silo_id = new.silo_id
  order by recorded_at desc
  limit 1;

  select new_grade_id, changed_at into v_grade, v_grade_at
  from public.silo_cement_changes
  where silo_id = new.silo_id
  order by changed_at desc, id desc
  limit 1;

  -- Nova mjera ima materijala?
  if v_height - new.avg_empty_m > 0.01 then
    v_prev_empty := v_prev_avg is null or v_height - v_prev_avg <= 0.01;
    if v_grade is null
       or (v_prev_empty and v_prev_at is not null and v_grade_at <= v_prev_at) then
      raise exception 'Silos je bio prazan - prvo odaberite vrstu cementa.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Vrsta uz mjerenje je uvijek trenutna vrsta silosa (ne ono što pošalje klijent).
  new.cement_grade_id := v_grade;
  new.recorded_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists silo_readings_check_cement_grade on public.silo_readings;
create trigger silo_readings_check_cement_grade
before insert on public.silo_readings
for each row execute function public.silo_reading_check_cement_grade();

notify pgrst, 'reload schema';
