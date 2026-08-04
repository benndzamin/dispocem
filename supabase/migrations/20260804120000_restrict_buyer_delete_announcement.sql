drop policy if exists "Buyers can delete their own announcements" on public.announcements;

create policy "Buyers can delete their own recent pending announcements" on public.announcements
for delete to authenticated
using (
  created_by = auth.uid()
  and status = 'pending'
  and created_at > now() - interval '1 hour'
);

create policy "Admins supervisors and operators can delete announcements" on public.announcements
for delete to authenticated
using (public.is_admin_or_supervisor() or public.is_role('wb_operator'));
