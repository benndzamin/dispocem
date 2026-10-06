-- Tab "Raspoloživi cement" koristi samo zadnje mjerenje po silosu, a do sada
-- je povlačio cijelu historiju silo_readings (raste svakim unosom). View vraća
-- najviše jedan red po silosu; security_invoker zadržava RLS sa silo_readings.
create or replace view public.silo_latest_readings
with (security_invoker = true) as
select distinct on (silo_id) *
from public.silo_readings
order by silo_id, recorded_at desc;

grant select on public.silo_latest_readings to authenticated;
