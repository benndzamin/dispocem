create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  rola text not null default 'buyer' check (rola in ('admin','wb_supervisor','wb_operator','buyer')),
  naziv_firme text,
  adresa text,
  dozvoljeni_artikli text[] default '{}',
  announcement_required boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists announcement_required boolean not null default true;
alter table public.users add column if not exists rola text default 'buyer';
alter table public.users add column if not exists naziv_firme text;
alter table public.users add column if not exists adresa text;
alter table public.users add column if not exists dozvoljeni_artikli text[] default '{}';
alter table public.users add column if not exists created_at timestamptz not null default now();

create table if not exists public.cement_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  packaging text not null default '25 kg',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users(id) on delete cascade,
  firma text not null,
  vrsta_cementa text not null,
  datum_kreiranja date not null default current_date,
  datum_planiranja_odpreme date not null,
  ime_vozaca text,
  prezime_vozaca text,
  registarske_oznake text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.cement_types enable row level security;
alter table public.announcements enable row level security;

create policy "Users can view own profile" on public.users
for select to authenticated
using (id = auth.uid());

create policy "Admins and supervisors can view all profiles" on public.users
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin','wb_supervisor')
  )
);

create policy "Users can insert own profile" on public.users
for insert to authenticated
with check (id = auth.uid());

create policy "Admins and supervisors can insert buyer profiles" on public.users
for insert to authenticated
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin','wb_supervisor')
  )
  or id = auth.uid()
);

create policy "Users can update own profile" on public.users
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Authenticated users can view active cement types" on public.cement_types
for select to authenticated
using (is_active = true);

create policy "Admins can manage cement types" on public.cement_types
for all to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola = 'admin'
  )
);

create policy "Buyers can view their own announcements" on public.announcements
for select to authenticated
using (created_by = auth.uid());

create policy "Admins and supervisors can view all announcements" on public.announcements
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin','wb_supervisor')
  )
);

create policy "Operators can view all announcements" on public.announcements
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola = 'wb_operator'
  )
);

create policy "Buyers can insert their own announcements" on public.announcements
for insert to authenticated
with check (created_by = auth.uid());

create policy "Admins supervisors and operators can update announcements" on public.announcements
for update to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin','wb_supervisor','wb_operator')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin','wb_supervisor','wb_operator')
  )
);

create policy "Buyers can delete their own announcements" on public.announcements
for delete to authenticated
using (created_by = auth.uid());
