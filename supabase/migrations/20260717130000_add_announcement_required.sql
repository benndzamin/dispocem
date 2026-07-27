alter table public.users add column if not exists announcement_required boolean not null default true;
alter table public.users add column if not exists rola text default 'buyer';
alter table public.users add column if not exists naziv_firme text;
alter table public.users add column if not exists adresa text;
alter table public.users add column if not exists dozvoljeni_artikli text[] default '{}';
alter table public.users add column if not exists created_at timestamptz not null default now();
