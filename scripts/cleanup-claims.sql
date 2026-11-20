-- Curățenie dosare: păstrează BP-2611-00017 și dosarele demo (BP-DEMO-*), șterge restul.
-- Rulează în Supabase SQL Editor. Pasul 1 = previzualizare, pasul 2 = ștergere (în tranzacție).

-- 1) Previzualizare: ce se șterge / ce rămâne
select public_ref, status, channel, created_at,
       case when public_ref = 'BP-2611-00017' or public_ref like 'BP-DEMO-%'
            then 'PĂSTRAT' else 'ȘTERS' end as actiune
from public.claims
order by created_at;

-- 2) Ștergere. Cascade: claim_parties, claim_files și tabelul de la schema linia ~314.
--    set null: legăturile din conversații/inbox/ai_calls (rândurile rămân, fără claim_id).
begin;

delete from public.claims
where public_ref <> 'BP-2611-00017'
  and public_ref not like 'BP-DEMO-%';

-- verificare: trebuie să rămână BP-2611-00017 + cele BP-DEMO-*
select public_ref, status from public.claims;

commit;  -- dacă rezultatul de mai sus nu e corect, înlocuiește cu: rollback;

-- 3) Fișierele din Storage (poze acte, PDF-uri, semnături) NU se șterg prin SQL
--    (ștergerea din storage.objects lasă fișierele orfane). Le cureți din
--    Dashboard → Storage, sau cu Storage API, dacă vrei.
