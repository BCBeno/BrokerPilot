-- Căutarea poliței din apelul vocal (WF02, unealta lookup_policy), mutată din n8n în SQL ca să fie simplă de citit:
-- plăcuța se compară fără spații și cratime („B 123 ABC” = „B123ABC”), iar telefonul după ultimele 9 cifre.
-- Dacă vine plăcuța, căutăm după ea; altfel după telefon. Doar n8n (service_role) o poate apela.
create function public.voice_lookup_policy(p_plate text, p_phone text)
returns table (type text, insurer text, valid_from date, valid_to date, make text, model text)
language sql stable set search_path = ''
as $$
  select p.type, p.insurer, p.valid_from, p.valid_to, v.make, v.model
    from public.policies p
    join public.clients c on c.id = p.client_id
    left join public.vehicles v on v.id = p.vehicle_id
   where case
           when coalesce(p_plate, '') <> '' then regexp_replace(upper(v.plate), '[^A-Z0-9]', '', 'g') = p_plate
           else length(coalesce(p_phone, '')) = 9 and right(regexp_replace(c.phone, '\D', '', 'g'), 9) = p_phone
         end
   order by p.valid_to desc
   limit 8;
$$;

revoke all on function public.voice_lookup_policy(text, text) from public, anon, authenticated;
grant execute on function public.voice_lookup_policy(text, text) to service_role;
