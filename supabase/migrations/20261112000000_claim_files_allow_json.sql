-- Schița accidentului se salvează ca JSON în bucket-ul `claim-files` (claims/<id>/sketch.json).
-- Bucket-ul permitea doar imagini și PDF, deci încărcarea schiței era respinsă și PDF-ul ieșea cu caseta 13 goală.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/json']
 where id = 'claim-files';
