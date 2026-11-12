-- Principiul privilegiului minim pentru rolul `authenticated` (brokerii logați).
-- Până acum avea toate drepturile pe toate tabelele, iar singura barieră era RLS. TRUNCATE nu e filtrat de RLS,
-- iar `identity_verifications` (coduri OTP) nu are nicio politică și nu trebuie atinsă de brokeri.
-- Aplicația citește și scrie cu sesiunea brokerului doar ce permit politicile RLS (select/insert/update); nu șterge nimic.

revoke truncate, references, trigger, delete on all tables in schema public from authenticated;
revoke all on public.identity_verifications from authenticated;

-- Tabelele create ulterior nu mai primesc automat drepturi largi pentru `authenticated`.
alter default privileges in schema public revoke truncate, references, trigger, delete on tables from authenticated;
