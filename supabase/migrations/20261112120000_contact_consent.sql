-- Acordul GDPR al șoferului, bifat în rezumatul amiabilei: brokerul îl poate păstra ca client și îl poate contacta.
-- Ora primei bifări e dovada; la „Adaugă în portofoliu” trece în clients.consent_gdpr_at.
alter table public.claim_parties add column contact_consent_at timestamptz;
