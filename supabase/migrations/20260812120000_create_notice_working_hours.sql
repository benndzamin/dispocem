-- Sedmicni raspored prijema najava kupaca. Tacno 7 redova (po jedan za
-- svaki dan sedmice), sjeme se ovdje jednom - aplikacija ih SAMO update-uje
-- (nikad insert/delete), zato authenticated ne dobija insert/delete grant.
-- day_of_week koristi ISO konvenciju (1 = ponedjeljak ... 7 = nedjelja),
-- isto kao Postgres-ova extract(isodow from ...) funkcija - bira se ova
-- konvencija upravo da server-side provjera (v. 20260812122000) ne mora
-- prevoditi izmedju konvencija. Klijent (JS Date.getDay() je 0=nedjelja)
-- mora eksplicitno mapirati - vidi src/lib/noticeSchedule.js.

create table public.notice_working_hours (
  day_of_week smallint primary key check (day_of_week between 1 and 7),
  is_open boolean not null default true,
  opens_at time not null default '07:00',
  closes_at time not null default '15:00'
);

alter table public.notice_working_hours enable row level security;

grant select, update on public.notice_working_hours to authenticated;

create policy "Authenticated users can view notice working hours" on public.notice_working_hours
for select to authenticated
using (true);

create policy "Admins and supervisors can update notice working hours" on public.notice_working_hours
for update to authenticated
using (public.is_admin_or_supervisor())
with check (public.is_admin_or_supervisor());

insert into public.notice_working_hours (day_of_week, is_open, opens_at, closes_at)
values
  (1, true,  '07:00', '15:00'),
  (2, true,  '07:00', '15:00'),
  (3, true,  '07:00', '15:00'),
  (4, true,  '07:00', '15:00'),
  (5, true,  '07:00', '15:00'),
  (6, true,  '07:00', '12:00'),
  (7, false, '07:00', '12:00')
on conflict (day_of_week) do nothing;
