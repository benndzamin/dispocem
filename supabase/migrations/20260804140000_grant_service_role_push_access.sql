-- send-push-notification edge funkcija koristi service_role da procita
-- korisnike (za rolu) i pretplate, i da obrise istekle pretplate.
-- Postojeci grantovi su do sad davani samo 'authenticated' korisnicima
-- (npr. 20260717170000_add_authenticated_grants.sql), service_role
-- ih nikad nije trebao jer nijedna dosadasnja edge funkcija nije
-- direktno citala bazu preko service-role klijenta.

grant select on public.users to service_role;
grant select, delete on public.push_subscriptions to service_role;
