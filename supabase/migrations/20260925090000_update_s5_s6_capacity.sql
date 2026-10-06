-- Silosi S5-S6 su 500 tona kad su puni do vrha (18m ukupno):
--   konusno dno 5m  = 50 t pun konus (conical_tons_per_meter * 5m); unutar
--                     konusa aplikacija računa po formuli konusa: 50 * (h/5)^3
--   cilindar   13m  = 450 t -> 450/13 t/m (~34.615), linearno po metru
update public.silos
set conical_tons_per_meter = 10,
    cylinder_tons_per_meter = 450.0 / 13
where code in ('S5', 'S6');
