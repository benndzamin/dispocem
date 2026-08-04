-- Prethodna verzija claim_push_subscription je radila DELETE pa INSERT
-- kao dva odvojena upita - ako se funkcija pozove dvaput skoro
-- istovremeno (npr. React StrictMode u dev modu namjerno pokrece
-- efekte dvaput, ili spor internet/dva taba), drugi poziv bi pokusao
-- insertovati red koji prvi poziv vec insertuje, sto puca na unique
-- constraint (endpoint) i izgleda kao da se pretplata "sama iskljuci".
-- Zamjenjeno jednim atomicnim upsert-om (ON CONFLICT DO UPDATE) koji
-- je siguran za konkurentne pozive. Ista funkcija, isti parametri,
-- isti poziv iz frontenda - mijenja se samo unutrasnja SQL logika.

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
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;
