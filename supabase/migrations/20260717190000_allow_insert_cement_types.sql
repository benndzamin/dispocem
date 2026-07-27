-- Allow authenticated users to insert into cement_types
-- (admin and supervisor roles need to add new cement types)
create policy "Authenticated users can insert cement types" on public.cement_types
for insert to authenticated
with check (true);

-- Allow authenticated users to delete from cement_types
create policy "Authenticated users can delete cement types" on public.cement_types
for delete to authenticated
using (true);