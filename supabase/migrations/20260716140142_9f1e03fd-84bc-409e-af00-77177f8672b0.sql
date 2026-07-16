
CREATE TABLE public.registration_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.registration_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_requests TO authenticated;
GRANT ALL ON public.registration_requests TO service_role;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can submit" ON public.registration_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins can view" ON public.registration_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins can update" ON public.registration_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins can delete" ON public.registration_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
