CREATE TABLE public.scene_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.scene_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scene_folders TO authenticated;
GRANT ALL ON public.scene_folders TO service_role;
ALTER TABLE public.scene_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own folders" ON public.scene_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own folders" ON public.scene_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own folders" ON public.scene_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own folders" ON public.scene_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_scene_folders_user_parent ON public.scene_folders(user_id, parent_id);
CREATE TRIGGER trg_scene_folders_updated BEFORE UPDATE ON public.scene_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scenes ADD COLUMN folder_id UUID REFERENCES public.scene_folders(id) ON DELETE SET NULL;
CREATE INDEX idx_scenes_user_folder ON public.scenes(user_id, folder_id);