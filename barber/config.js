/* ==========================================================================
   Deployment configuration.

   Fill these in with your project's URL and *anon* (public) key, both from
   Supabase → Project Settings → API. The anon key is designed to ship to
   browsers; every table is protected by row level security, so it grants
   nothing beyond what schema.sql explicitly allows. Never put the service
   role key here.

   Leave them empty and the site runs on a self-contained demo backend in
   the browser's localStorage — the whole product works, nothing is shared
   between devices, and a banner says so. That is the mode you get straight
   after cloning.

   This file is deliberately a plain script, not a module, so it can be
   edited on a server without a build step.
   ========================================================================== */

window.FADECO_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Where the Supabase client library is loaded from, only when the two
  // values above are set. Pin the version; do not float on @latest.
  supabaseModule: 'https://esm.sh/@supabase/supabase-js@2.45.4',

  // Storage bucket used for gallery and barber photo uploads. Create it in
  // Supabase → Storage and mark it public.
  storageBucket: 'media',
};
