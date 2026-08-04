-- Bez ovoga, Realtime UPDATE eventi na announcements nose samo primarni
-- kljuc u payload.old (Postgres default replica identity), ne i ostale
-- kolone poput status-a - sto je potrebno da bi se poredio stari/novi
-- status i pokrenula in-app notifikacija kupcu tek kad se status stvarno
-- promijeni.

alter table public.announcements replica identity full;
