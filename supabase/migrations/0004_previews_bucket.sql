-- Bucket privé pour stocker les aperçus PDF des templates docx.
-- Le worker écrit (service-role), l'utilisateur lit (RLS owner-only).

insert into storage.buckets (id, name, public)
  values ('previews', 'previews', false)
  on conflict (id) do nothing;

drop policy if exists "previews owner read" on storage.objects;
create policy "previews owner read" on storage.objects for select using (
  bucket_id = 'previews' and (storage.foldername(name))[1] = auth.uid()::text
);
