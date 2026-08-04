-- upsert() na push_subscriptions (onConflict: "endpoint") generise
-- INSERT ... ON CONFLICT DO UPDATE, sto zahtijeva i UPDATE dozvolu,
-- ne samo INSERT. Prethodna migracija (20260804130000) je to
-- propustila, pa je svaki ponovni upsert iste pretplate pucao sa
-- "permission denied for table push_subscriptions".

grant update on public.push_subscriptions to authenticated;

create policy "Users can update their own push subscriptions" on public.push_subscriptions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
