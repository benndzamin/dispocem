-- Browser push pretplata je vezana za uredjaj (endpoint), ne za
-- ulogovanog korisnika. Ako se isti uredjaj koristi za vise razlicitih
-- app korisnika (npr. testiranje kao supervizor, pa kao kupac), obican
-- upsert() puca na RLS jer trenutni korisnik ne moze mijenjati red koji
-- pripada nekom drugom (USING expression na update politici).
-- Ova funkcija kontrolisano "preuzima" pretplatu za trenutno ulogovanog
-- korisnika - obrise stari red (ko god da ga posjeduje) i upise novi.

create or replace function public.claim_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;

revoke all on function public.claim_push_subscription(text, text, text) from public;
grant execute on function public.claim_push_subscription(text, text, text) to authenticated;
