-- Migracija 20260717150000 je slučajno isključila RLS na public.users i
-- public.announcements radi dev testiranja. Kasnije je RLS vraćen samo za
-- public.cement_types (20260717220000/20260717230000), ali ne i za ove dvije
-- tabele. U kombinaciji sa širokim grantovima iz 20260717170000, ovo je
-- ostavilo obje tabele potpuno otvorene svakom authenticated korisniku.
--
-- Postojeće politike (kreirane u 20260717140000, dopunjene u 20260717180000)
-- nikad nisu obrisane, samo je RLS flag na nivou tabele bio isključen.

alter table public.users enable row level security;
alter table public.announcements enable row level security;
