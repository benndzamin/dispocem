-- Dodaje kolonu na_stanju (zaliha) i seeduje 11 osnovnih vrsta cementa
-- koje su ranije živjele samo u src/constants/cementCatalog.js (hardkodirano na frontendu).

alter table public.cement_types
  add column if not exists na_stanju boolean not null default true;

insert into public.cement_types (name, packaging, na_stanju, is_active)
values
  ('PREMILUK (CEM I 52,5 N) - 25 kg', '25 kg', true, true),
  ('PREMILUK (CEM I 52,5 N) - RINFUZA', 'RINFUZA', true, true),
  ('SUPRALUK (CEM II/B-M 42,5 N) - 25 kg', '25 kg', true, true),
  ('SUPRALUK (CEM II/B-M 42,5 N) - RINFUZA', 'RINFUZA', true, true),
  ('FINELUK (CEM II/B-M 32,5 N) - 25 kg', '25 kg', true, true),
  ('FINELUK (CEM II/B-M 32,5 N) - RINFUZA', 'RINFUZA', true, true),
  ('SULFALUK (CEM III/B 32,5 N SR-LH) - 25 kg', '25 kg', true, true),
  ('SULFALUK (CEM III/B 32,5 N SR-LH) - RINFUZA', 'RINFUZA', true, true),
  ('Supraluk PLUS (CEM V/A 42,5 N) - 25 kg', '25 kg', true, true),
  ('Fineluk PLUS (CEM V/A 32,5 N) - 25 kg', '25 kg', true, true),
  ('LUMAL - 25 kg', '25 kg', true, true)
on conflict (name) do nothing;
