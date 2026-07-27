create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select rola from public.users where id = auth.uid()
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin', 'wb_supervisor')
  )
$$;

create or replace function public.is_role(expected_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola = expected_role
  )
$$;

drop policy if exists "Users can view own profile" on public.users;
drop policy if exists "Admins and supervisors can view all profiles" on public.users;
drop policy if exists "Users can insert own profile" on public.users;
drop policy if exists "Admins and supervisors can insert buyer profiles" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Authenticated users can view active cement types" on public.cement_types;
drop policy if exists "Admins can manage cement types" on public.cement_types;
drop policy if exists "Buyers can view their own announcements" on public.announcements;
drop policy if exists "Admins and supervisors can view all announcements" on public.announcements;
drop policy if exists "Operators can view all announcements" on public.announcements;
drop policy if exists "Buyers can insert their own announcements" on public.announcements;
drop policy if exists "Admins supervisors and operators can update announcements" on public.announcements;
drop policy if exists "Buyers can delete their own announcements" on public.announcements;

create policy "Users can view own profile" on public.users
for select to authenticated
using (id = auth.uid());

create policy "Admins and supervisors can view all profiles" on public.users
for select to authenticated
using (public.is_admin_or_supervisor());

create policy "Users can insert own profile" on public.users
for insert to authenticated
with check (id = auth.uid());

create policy "Admins and supervisors can insert buyer profiles" on public.users
for insert to authenticated
with check (id = auth.uid() or public.is_admin_or_supervisor());

create policy "Users can update own profile" on public.users
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Authenticated users can view active cement types" on public.cement_types
for select to authenticated
using (is_active = true);

create policy "Admins can manage cement types" on public.cement_types
for all to authenticated
using (public.is_role('admin'))
with check (public.is_role('admin'));

create policy "Buyers can view their own announcements" on public.announcements
for select to authenticated
using (created_by = auth.uid());

create policy "Admins and supervisors can view all announcements" on public.announcements
for select to authenticated
using (public.is_admin_or_supervisor());

create policy "Operators can view all announcements" on public.announcements
for select to authenticated
using (public.is_role('wb_operator'));

create policy "Buyers can insert their own announcements" on public.announcements
for insert to authenticated
with check (created_by = auth.uid());

create policy "Admins supervisors and operators can update announcements" on public.announcements
for update to authenticated
using (public.is_admin_or_supervisor() or public.is_role('wb_operator'))
with check (public.is_admin_or_supervisor() or public.is_role('wb_operator'));

create policy "Buyers can delete their own announcements" on public.announcements
for delete to authenticated
using (created_by = auth.uid());
