drop policy if exists "Buyers can delete their own recent pending announcements" on public.announcements;

create policy "Buyers can delete their own recent pending announcements" on public.announcements
for delete to authenticated
using (
  created_by = auth.uid()
  and status in ('pending', 'awaiting_approval')
  and created_at > now() - interval '1 hour'
);
