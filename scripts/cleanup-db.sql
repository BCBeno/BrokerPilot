-- Curățare bază: păstrează 3 dosare complete (BP-2611-00009/13/17) + 6 demo, clienții aferenți (max 8 demo).
-- Rulează în Supabase Dashboard -> SQL Editor. IREVERSIBIL.
do $$
declare
  keep_claims uuid[];
  keep_clients uuid[];
  del_claims uuid[];
  del_policies uuid[];
begin
  select array_agg(id) into keep_claims from claims
   where public_ref in ('BP-2611-00009','BP-2611-00013','BP-2611-00017',
     'BP-DEMO-00011','BP-DEMO-00012','BP-DEMO-00013','BP-DEMO-00014','BP-DEMO-00016','BP-DEMO-00018');

  select array_agg(id) into del_claims from claims where id <> all(keep_claims);

  select array_agg(distinct client_id) into keep_clients from claim_parties
   where claim_id = any(keep_claims) and client_id is not null;
  keep_clients := keep_clients || coalesce((
    select array_agg(id) from (
      select c.id from clients c
      where c.full_name like '%(fictiv)%' and c.id <> all(keep_clients)
        and exists (select 1 from policies p where p.client_id=c.id)
      order by c.phone
      limit greatest(0, 8 - (select count(*) from clients where id = any(keep_clients) and full_name like '%(fictiv)%'))
    ) s), '{}');

  select array_agg(p.id) into del_policies from policies p where p.client_id <> all(keep_clients);

  delete from events where entity_id = any(del_claims) or entity_id = any(coalesce(del_policies,'{}'));
  delete from claims where id = any(del_claims);        -- cascade: părți, fișiere, fapte
  delete from clients where id <> all(keep_clients);    -- cascade: vehicule, polițe, identități
  delete from conversations where summary is null;      -- apeluri goale
end $$;

select (select count(*) from claims) claims, (select count(*) from claim_parties) parties,
       (select count(*) from claim_files) files, (select count(*) from clients) clients,
       (select count(*) from vehicles) vehicles, (select count(*) from policies) policies,
       (select count(*) from conversations) convs, (select count(*) from events) events;
