-- Pagina „Echipă”: administratorii firmei adaugă brokeri și le dau acces.
--   - `is_admin`: vede pagina Echipă, creează brokeri, generează linkuri de acces, dezactivează.
--   - `email`: copia adresei de login (din Auth), ca lista să nu ceară Admin API la fiecare afișare.
-- Scrierile pe `brokers` rămân doar pe service_role (server action după ce verifică `is_admin`); politica de citire nu se schimbă.

alter table public.brokers
  add column is_admin boolean not null default false,
  add column email text;

-- Adresa pentru brokerii care au deja cont.
update public.brokers b set email = u.email
from auth.users u
where u.id = b.auth_user_id and b.email is null;

-- Primul administrator: brokerii activi care au deja login (azi, unul). Ceilalți se fac din pagină sau din SQL.
update public.brokers set is_admin = true where auth_user_id is not null and active;

create unique index brokers_email_key on public.brokers (lower(email)) where email is not null;
