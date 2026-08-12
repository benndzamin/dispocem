-- Rucne obavijesti supervizora svim kupcima ("Obavijesti kupce"). Redovi se
-- ne brisu automatski (za razliku od announcement_deletions) - kupac koji se
-- ne prijavi danima i dalje mora vidjeti zadnju obavijest kad se sljedeci put
-- prijavi, zato ova tabela nije samo-cisteci log.
-- "Vec vidio" status se cuva SAMO u localStorage na klijentu (po kupcu) -
-- nema server-side ack tabele, po specifikaciji.

create table public.notice_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notice_broadcasts enable row level security;

grant select, insert on public.notice_broadcasts to authenticated;

create policy "Authenticated users can view notice broadcasts" on public.notice_broadcasts
for select to authenticated
using (true);

create policy "Admins and supervisors can send notice broadcasts" on public.notice_broadcasts
for insert to authenticated
with check (public.is_admin_or_supervisor() and created_by = auth.uid());

-- Realtime mora znati za ovu tabelu da bi useNoticeBroadcast hook primio
-- INSERT event dok je kupac prijavljen - isti obrazac kao za announcements.
alter publication supabase_realtime add table public.notice_broadcasts;
