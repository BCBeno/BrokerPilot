-- Clienții adăugați automat din dosar (acord de contact + poliță scanată) au datele scrise de o persoană neverificată.
-- `needs_review` îi marchează „De verificat” până când brokerul confirmă (update-ul pe `clients` e deja permis brokerului, prin RLS).
alter table public.clients add column needs_review boolean not null default false;
