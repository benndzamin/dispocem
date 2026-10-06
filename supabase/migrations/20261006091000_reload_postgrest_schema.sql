-- PostgREST nije sam osvježio schema cache nakon kreiranja view-a
-- silo_latest_readings (20261006090000), pa ga API nije vidio (PGRST205).
notify pgrst, 'reload schema';
