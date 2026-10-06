-- Praćenje količine cementa po silosima (S1-S6) i statusa rinfuza (R1-R4).
-- Nova uloga mill_operator (radnik na mlinu cementa) unosi mjerenja; admin i
-- wb_supervisor samo čitaju kroz tab "Raspoloživi cement".

-- 1. Nova uloga u users.rola check constraintu -----------------------------
alter table public.users drop constraint if exists users_rola_check;
alter table public.users add constraint users_rola_check
  check (rola in ('admin','wb_supervisor','wb_operator','buyer','mill_operator'));

-- delete_staff_by_id (20260805110000) je do sada dozvoljavao brisanje samo
-- wb_supervisor/wb_operator naloga - proširujemo i na mill_operator da bi
-- admin mogao upravljati tim nalozima kroz isti StaffManagement ekran.
create or replace function public.delete_staff_by_id(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za brisanje osoblja.';
  end if;

  if p_staff_id = auth.uid() then
    raise exception 'Ne možete obrisati sopstveni nalog.';
  end if;

  select rola into target_role
  from public.users
  where id = p_staff_id;

  if target_role is null then
    raise exception 'Odabrani nalog više ne postoji.';
  end if;

  if target_role not in ('wb_supervisor', 'wb_operator', 'mill_operator') then
    raise exception 'Moguće je obrisati samo supervizora, operatera ili radnika na mlinu.';
  end if;

  delete from auth.users where id = p_staff_id;
end;
$$;

-- 2. Matična tabela silosa ---------------------------------------------------
create table if not exists public.silos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  total_height_m numeric not null,
  measurement_points smallint not null check (measurement_points in (1, 2)),
  cylinder_tons_per_meter numeric,
  conical_height_m numeric,
  conical_tons_per_meter numeric,
  created_at timestamptz not null default now()
);

-- 3. Historija mjerenja -------------------------------------------------------
create table if not exists public.silo_readings (
  id uuid primary key default gen_random_uuid(),
  silo_id uuid not null references public.silos(id) on delete cascade,
  point1_empty_m numeric not null,
  point2_empty_m numeric,
  avg_empty_m numeric not null,
  computed_tons numeric not null,
  recorded_by uuid references public.users(id),
  recorded_at timestamptz not null default now()
);

create index if not exists silo_readings_silo_id_recorded_at_idx
  on public.silo_readings (silo_id, recorded_at desc);

-- 4. Rinfuze (tačke utovara) i njihovi izvorni silosi ------------------------
create table if not exists public.rinfuze (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  threshold_empty_m numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.rinfuza_silos (
  rinfuza_id uuid not null references public.rinfuze(id) on delete cascade,
  silo_id uuid not null references public.silos(id) on delete cascade,
  primary key (rinfuza_id, silo_id)
);

-- 4b. Grants - ovaj projekat ne oslanja se na auto-expose default, nego
-- eksplicitno grant-uje tabele (vidi 20260717170000) - RLS politike ispod
-- i dalje ograničavaju koje redove/operacije svaka rola stvarno smije.
-- select/insert/update/delete grant-ovano jer "Admin can manage X" RLS
-- politike ispod koriste "for all" - sama RLS ograničava na admina.
grant select, insert, update, delete on public.silos to authenticated;
grant select, insert on public.silo_readings to authenticated;
grant select, insert, update, delete on public.rinfuze to authenticated;
grant select, insert, update, delete on public.rinfuza_silos to authenticated;

grant select on public.silos to service_role;
grant select on public.silo_readings to service_role;
grant select on public.rinfuze to service_role;
grant select on public.rinfuza_silos to service_role;

-- 5. RLS ----------------------------------------------------------------------
alter table public.silos enable row level security;
alter table public.silo_readings enable row level security;
alter table public.rinfuze enable row level security;
alter table public.rinfuza_silos enable row level security;

-- Ko god ima pristup ovom dijelu aplikacije (admin, supervizor, radnik na
-- mlinu) smije čitati sve 4 tabele.
create policy "Silo stock viewers can read silos" on public.silos
for select to authenticated
using (
  public.is_admin_or_supervisor() or public.is_role('mill_operator')
);

create policy "Silo stock viewers can read readings" on public.silo_readings
for select to authenticated
using (
  public.is_admin_or_supervisor() or public.is_role('mill_operator')
);

create policy "Silo stock viewers can read rinfuze" on public.rinfuze
for select to authenticated
using (
  public.is_admin_or_supervisor() or public.is_role('mill_operator')
);

create policy "Silo stock viewers can read rinfuza_silos" on public.rinfuza_silos
for select to authenticated
using (
  public.is_admin_or_supervisor() or public.is_role('mill_operator')
);

-- Samo mill_operator unosi nova mjerenja, i samo na svoje ime.
create policy "Mill operator can insert readings" on public.silo_readings
for insert to authenticated
with check (
  public.is_role('mill_operator') and recorded_by = auth.uid()
);

-- Admin uređuje matične podatke (npr. konstante tona/metar) po potrebi.
create policy "Admin can manage silos" on public.silos
for all to authenticated
using (public.is_role('admin'))
with check (public.is_role('admin'));

create policy "Admin can manage rinfuze" on public.rinfuze
for all to authenticated
using (public.is_role('admin'))
with check (public.is_role('admin'));

create policy "Admin can manage rinfuza_silos" on public.rinfuza_silos
for all to authenticated
using (public.is_role('admin'))
with check (public.is_role('admin'));

-- 6. Seed matičnih podataka (geometrija je poznata; tona/metar konstante su
-- privremene placeholder vrijednosti dok ih admin ne unese stvarne) ---------
insert into public.silos (code, label, total_height_m, measurement_points, cylinder_tons_per_meter, conical_height_m, conical_tons_per_meter)
values
  ('S1', 'Silo 1', 20, 2, 2.4, null, null),
  ('S2', 'Silo 2', 20, 2, 2.4, null, null),
  ('S3', 'Silo 3', 20, 2, 2.5, null, null),
  ('S4', 'Silo 4', 20, 2, 2.5, null, null),
  ('S5', 'Silo 5', 18, 1, 3.0, 5, 1.6),
  ('S6', 'Silo 6', 18, 1, 3.0, 5, 1.6)
on conflict (code) do nothing;

insert into public.rinfuze (code, label, threshold_empty_m)
values
  ('R1', 'Rinfuza 1', 12),
  ('R2', 'Rinfuza 2', 12),
  ('R3', 'Rinfuza 3', null),
  ('R4', 'Rinfuza 4', null)
on conflict (code) do nothing;

insert into public.rinfuza_silos (rinfuza_id, silo_id)
select r.id, s.id
from public.rinfuze r
join public.silos s on (
  (r.code = 'R1' and s.code in ('S1', 'S2')) or
  (r.code = 'R2' and s.code in ('S3', 'S4')) or
  (r.code = 'R3' and s.code in ('S3', 'S4')) or
  (r.code = 'R4' and s.code in ('S5', 'S6'))
)
on conflict do nothing;
