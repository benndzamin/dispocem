drop policy if exists "Users can update own profile" on public.users;

create policy "Users can update own profile" on public.users
for update to authenticated
using (
  id = auth.uid()
  or public.is_admin_or_supervisor()
)
with check (
  id = auth.uid()
  or public.is_admin_or_supervisor()
);
