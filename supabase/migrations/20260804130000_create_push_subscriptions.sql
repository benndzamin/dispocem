create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

grant select, insert, delete on public.push_subscriptions to authenticated;

create policy "Users can view their own push subscriptions" on public.push_subscriptions
for select to authenticated
using (user_id = auth.uid());

create policy "Users can insert their own push subscriptions" on public.push_subscriptions
for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can delete their own push subscriptions" on public.push_subscriptions
for delete to authenticated
using (user_id = auth.uid());
