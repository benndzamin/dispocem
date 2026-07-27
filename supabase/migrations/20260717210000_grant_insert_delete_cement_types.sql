-- Grant insert and delete on cement_types to authenticated users
-- (RLS policy "Admins can manage cement types" restricts to admin role only)
grant insert, delete on public.cement_types to authenticated;