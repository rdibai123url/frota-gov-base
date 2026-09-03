
CREATE POLICY "read brasoes authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'brasoes');
CREATE POLICY "insert brasoes authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brasoes');
CREATE POLICY "update brasoes authenticated" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'brasoes') WITH CHECK (bucket_id = 'brasoes');
CREATE POLICY "delete brasoes authenticated" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brasoes');
