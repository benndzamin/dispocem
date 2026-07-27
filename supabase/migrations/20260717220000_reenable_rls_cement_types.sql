-- Re-enable RLS on cement_types (was accidentally disabled)
-- RLS policy "Admins can manage cement types" restricts insert/update/delete to admin role only
alter table public.cement_types enable row level security;