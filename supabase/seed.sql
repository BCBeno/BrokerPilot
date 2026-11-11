-- Seed minim, DOAR date fictive (nume inventate, telefoane 0700 000 xxx, emailuri @example.test,
-- numere de înmatriculare cu „TST”). Volumul complet (30 clienți, 60 polițe, 8 dosare) vine din
-- `data/fixtures/` în S4b. Idempotent: poate rula de mai multe ori.
-- Brokerii NU au `auth_user_id`: după ce creezi utilizatorii în Supabase Auth, leagă-i cu
--   update public.brokers set auth_user_id = '<uuid din Auth>' where id = '10000000-0000-4000-8000-000000000001';

insert into public.brokers (id, name, phone, telegram_chat_id, active) values
  ('10000000-0000-4000-8000-000000000001', 'Andrei Popescu (fictiv)', '0700000001', null, true),
  ('10000000-0000-4000-8000-000000000002', 'Elena Ionescu (fictiv)',  '0700000002', null, true)
on conflict (id) do nothing;

insert into public.clients (id, full_name, phone, email, consent_gdpr_at) values
  ('20000000-0000-4000-8000-000000000001', 'Mihai Georgescu (fictiv)',   '0700000101', 'mihai.georgescu@example.test',   now()),
  ('20000000-0000-4000-8000-000000000002', 'Ioana Dumitrescu (fictiv)',  '0700000102', 'ioana.dumitrescu@example.test',  now()),
  ('20000000-0000-4000-8000-000000000003', 'Radu Stancu (fictiv)',       '0700000103', 'radu.stancu@example.test',       now()),
  ('20000000-0000-4000-8000-000000000004', 'Carmen Vasilescu (fictiv)',  '0700000104', 'carmen.vasilescu@example.test',  now()),
  ('20000000-0000-4000-8000-000000000005', 'Vlad Marinescu (fictiv)',    '0700000105', 'vlad.marinescu@example.test',    null)
on conflict (id) do nothing;

insert into public.vehicles (id, client_id, plate, vin, make, model, year) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'B 101 TST', 'TSTVIN00000000001', 'Dacia',      'Logan',  2019),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B 102 TST', 'TSTVIN00000000002', 'Volkswagen', 'Golf',   2017),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'CJ 103 TST', 'TSTVIN00000000003', 'Skoda',     'Octavia', 2020),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'TM 104 TST', 'TSTVIN00000000004', 'Renault',   'Clio',   2016),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'IS 105 TST', 'TSTVIN00000000005', 'Ford',      'Focus',  2018)
on conflict (id) do nothing;

-- Asigurători generici de test; una dintre polițe expiră în 12 zile (demo reînnoiri).
insert into public.policies (id, client_id, vehicle_id, type, insurer, policy_no, valid_from, valid_to, premium, broker_id) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'RCA',   'Asigurător Test A', 'TST-RCA-0001',   current_date - 200, current_date + 165, 1450.00, '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'RCA',   'Asigurător Test B', 'TST-RCA-0002',   current_date - 353, current_date + 12,  1820.00, '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'RCA',   'Asigurător Test A', 'TST-RCA-0003',   current_date - 90,  current_date + 275, 1290.00, '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'CASCO', 'Asigurător Test C', 'TST-CASCO-0003', current_date - 90,  current_date + 275, 3900.00, '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'RCA',   'Asigurător Test B', 'TST-RCA-0004',   current_date - 30,  current_date + 335, 1100.00, '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', 'RCA',   'Asigurător Test C', 'TST-RCA-0005',   current_date - 150, current_date + 215, 1380.00, '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', null,                                   'PAD',   'Asigurător Test A', 'TST-PAD-0001',   current_date - 20,  current_date + 345, 100.00,  '10000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Două dosare: unul așteaptă șoferul B, altul e în lucru la broker.
insert into public.claims (id, public_ref, status, channel, accident_at, location_text, lat, lng,
                           eligibility, circumstances_a, ai_summary, missing_items, broker_id) values
  ('50000000-0000-4000-8000-000000000001', 'BP-DEMO-00001', 'awaiting_b', 'web',
   now() - interval '2 hours', 'Intersecția Bd. Exemplu cu Str. Test, București (fictiv)', 44.4268, 26.1025,
   '{"injuries": false, "vehicles": 2, "eligible": true}'::jsonb,
   '{"checked": [1, 12]}'::jsonb,
   null,
   '["semnătura șoferului B", "fotografii cu daunele vehiculului B"]'::jsonb,
   '10000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', 'BP-DEMO-00002', 'in_progress', 'telegram',
   now() - interval '3 days', 'Parcare, Str. Fictivă 5, Cluj-Napoca (fictiv)', 46.7712, 23.6236,
   '{"injuries": false, "vehicles": 2, "eligible": true}'::jsonb,
   '{"checked": [3]}'::jsonb,
   'Tamponare ușoară în parcare; ambele părți au semnat. Lipsește confirmarea unui număr de poliță.',
   '["număr poliță vehicul B"]'::jsonb,
   '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.claim_parties (id, claim_id, role, client_id, driver, vehicle, insurance, extraction_confidence, join_token, token_expires_at) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'A', '20000000-0000-4000-8000-000000000001',
   '{"name": "Mihai Georgescu (fictiv)"}'::jsonb, '{"plate": "B 101 TST", "make": "Dacia", "model": "Logan"}'::jsonb,
   '{"insurer": "Asigurător Test A", "policy_no": "TST-RCA-0001"}'::jsonb, '{"plate": 0.98, "policy_no": 0.95}'::jsonb,
   null, null),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'B', null,
   null, null, null, null,
   'demo-token-only-for-seed-0000000000000001', now() + interval '1 day'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', 'A', '20000000-0000-4000-8000-000000000003',
   '{"name": "Radu Stancu (fictiv)"}'::jsonb, '{"plate": "CJ 103 TST", "make": "Skoda", "model": "Octavia"}'::jsonb,
   '{"insurer": "Asigurător Test A", "policy_no": "TST-RCA-0003"}'::jsonb, '{"plate": 0.99, "policy_no": 0.97}'::jsonb,
   null, null),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002', 'B', '20000000-0000-4000-8000-000000000004',
   '{"name": "Carmen Vasilescu (fictiv)"}'::jsonb, '{"plate": "TM 104 TST", "make": "Renault", "model": "Clio"}'::jsonb,
   '{"insurer": "Asigurător Test B", "policy_no": null}'::jsonb, '{"plate": 0.96, "policy_no": null}'::jsonb,
   null, null)
on conflict (id) do nothing;
