-- Fix RLS policies for cement_types to ensure admin has full access
-- and that all authenticated users can see active types.

-- First, drop existing policies to start fresh for this table
drop policy if exists "Authenticated users can view active cement types" on public.cement_types;
drop policy if exists "Admins can manage cement types" on public.cement_types;
drop policy if exists "Allow admins to insert cement types" on public.cement_types;
drop policy if exists "Allow admins to delete cement types" on public.cement_types;

-- Policy for viewing: Authenticated users see active ones, but admins see ALL
create policy "Users can view cement types" on public.cement_types
for select to authenticated
using (
  is_active = true 
  or 
  public.is_role('admin')
);

-- Policy for full management: Only admins
create policy "Admins have full access to cement types" on public.cement_types
for all to authenticated
using (public.is_role('admin'))
with check (public.is_role('admin'));

-- Ensure RLS is enabled
alter table public.cement_types enable row level security;

-- Grant necessary permissions just in case
grant all on public.cement_types to authenticated;
grant all on public.cement_types to service_role;
