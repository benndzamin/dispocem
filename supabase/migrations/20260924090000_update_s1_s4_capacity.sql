-- Silosi S1-S4 su 2000 tona kad su puni do vrha (20m * 100 t/m).
update public.silos
set cylinder_tons_per_meter = 100
where code in ('S1', 'S2', 'S3', 'S4');
