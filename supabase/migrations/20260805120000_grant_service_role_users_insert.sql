-- admin-create-staff edge funkcija koristi service_role da upise novi
-- public.users red za novokreirani supervisor/operater nalog. service_role
-- je do sad imao samo "select" na ovoj tabeli (20260804140000, za
-- send-push-notification) - "insert" nikad nije bio potreban jer nijedna
-- dosadasnja edge funkcija nije upisivala u users preko service-role
-- klijenta (BuyerManagement to radi kao "authenticated", ne service_role).

grant insert on public.users to service_role;
