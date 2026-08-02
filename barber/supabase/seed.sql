-- ============================================================================
--  FADE & CO — starter content
--
--  Run after schema.sql. Safe to re-run: every insert is guarded, so it fills
--  gaps without overwriting anything the admin has since edited.
--
--  Images here are inline SVG data URIs rather than files, so a fresh install
--  looks finished without a storage bucket or a single network request. The
--  admin replaces them from Website → Gallery.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Booking rules
-- ---------------------------------------------------------------------------
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
--  Opening hours — shop-wide, one row per weekday (0 = Sunday)
-- ---------------------------------------------------------------------------
insert into public.schedules (barber_id, weekday, is_closed, opens_at, closes_at, break_start, break_end)
values
  (null, 0, true,  '10:00', '16:00', null, null),
  (null, 1, false, '09:00', '18:00', '13:00', '13:30'),
  (null, 2, false, '09:00', '18:00', '13:00', '13:30'),
  (null, 3, false, '09:00', '20:00', '13:00', '13:30'),
  (null, 4, false, '09:00', '20:00', '13:00', '13:30'),
  (null, 5, false, '09:00', '20:00', '13:00', '13:30'),
  (null, 6, false, '09:00', '17:00', null, null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
--  Services
-- ---------------------------------------------------------------------------
insert into public.services (slug, name, description, price_cents, duration_minutes, icon, is_featured, sort_order)
values
  ('signature-cut', 'Signature Cut',
   'A consultation, a precision cut worked to your hair''s natural fall, hot towel and finish.',
   3800, 45, 'scissors', true, 1),
  ('skin-fade', 'Skin Fade',
   'Clipper work taken down to the skin and blended by hand, with a razored outline.',
   4200, 45, 'fade', true, 2),
  ('beard-sculpt', 'Beard Sculpt',
   'Shape, line-up and condition. Finished with warm oil and a cold towel.',
   2500, 30, 'beard', false, 3),
  ('cut-and-beard', 'Cut & Beard',
   'The Signature Cut and a full beard sculpt in one sitting. Our most-booked appointment.',
   5800, 75, 'star', true, 4),
  ('hot-towel-shave', 'Hot Towel Shave',
   'Three towels, pre-shave oil, a straight razor pass with the grain and one against.',
   3500, 45, 'razor', false, 5),
  ('the-quick-one', 'The Quick One',
   'Neck, edges and a tidy between appointments. In and out on your lunch break.',
   1800, 20, 'clock', false, 6),
  ('junior-cut', 'Junior Cut',
   'For under-12s. Same care, smaller chair, and a lot more patience.',
   2200, 30, 'child', false, 7)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
--  Barbers
-- ---------------------------------------------------------------------------
insert into public.barbers (name, title, bio, specialties, instagram, sort_order)
select * from (values
  ('Marco Ricci', 'Master Barber & Owner',
   'Twenty-two years behind the chair, eleven of them running this one. Marco trained in Milan on scissor-over-comb and still cuts most of the shop''s classic work himself.',
   array['Scissor work', 'Classic cuts', 'Hot towel shaves'], '@marco.fadeco', 1),
  ('Amir Haddad', 'Senior Barber',
   'The person to see about a fade. Amir competes in barbering championships and brings that precision to a Tuesday afternoon appointment.',
   array['Skin fades', 'Beard sculpting', 'Line-ups'], '@amircuts', 2),
  ('Jonah Bell', 'Barber',
   'Textured, lived-in cuts for hair that refuses to sit still. Jonah works mostly with curls and coils and is unusually good at explaining what to do at home.',
   array['Curly hair', 'Texture', 'Modern cuts'], '@jonah.bell', 3),
  ('Sofia Marin', 'Barber & Colourist',
   'Sofia came to barbering from salon colour work, which is why the greys and the grow-outs in this shop look deliberate.',
   array['Colour', 'Scissor work', 'Junior cuts'], '@sofiamarin', 4)
) as v(name, title, bio, specialties, instagram, sort_order)
where not exists (select 1 from public.barbers);

-- ---------------------------------------------------------------------------
--  Gallery — generated SVG plates, no external files
-- ---------------------------------------------------------------------------
do $$
declare
  plates constant text[][] := array[
    array['18,20,28',  '122,88,58',  'Chair one, Thursday evening', 'Warm light over the front chair'],
    array['26,22,20',  '168,124,74', 'Skin fade, blended by hand',  'Close crop of a finished fade'],
    array['16,24,32',  '78,104,132', 'The straight razor pass',     'A razor and towel on the counter'],
    array['24,18,26',  '140,90,120', 'Beard oil and a cold towel',  'Finishing a beard sculpt'],
    array['20,26,22',  '92,132,96',  'Sunday light on the mirrors', 'The mirror wall in daylight'],
    array['28,24,18',  '176,138,70', 'Brass, leather, forty years', 'Detail of the barber chair'],
    array['18,18,24',  '104,96,150', 'Late appointment, last chair','The shop after dark'],
    array['22,20,20',  '150,110,88', 'Textured crop, air-dried',    'A finished textured cut']
  ];
  i int;
begin
  if exists (select 1 from public.gallery) then return; end if;
  for i in 1 .. array_length(plates, 1) loop
    insert into public.gallery (image_url, caption, alt_text, sort_order)
    values (
      format(
        'data:image/svg+xml;utf8,<svg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 600 750''>'
        '<defs><linearGradient id=''g'' x1=''0'' y1=''0'' x2=''0.7'' y2=''1''>'
        '<stop offset=''0'' stop-color=''rgb(%1$s)''/><stop offset=''1'' stop-color=''rgb(%2$s)''/>'
        '</linearGradient><radialGradient id=''h'' cx=''0.32'' cy=''0.26'' r=''0.75''>'
        '<stop offset=''0'' stop-color=''rgba(255,244,222,0.42)''/>'
        '<stop offset=''1'' stop-color=''rgba(255,244,222,0)''/></radialGradient></defs>'
        '<rect width=''600'' height=''750'' fill=''url(%%23g)''/>'
        '<rect width=''600'' height=''750'' fill=''url(%%23h)''/>'
        '<g fill=''none'' stroke=''rgba(255,255,255,0.16)'' stroke-width=''1.5''>'
        '<circle cx=''300'' cy=''330'' r=''%3$s''/><circle cx=''300'' cy=''330'' r=''%4$s''/></g>'
        '<rect x=''0'' y=''%5$s'' width=''600'' height=''2'' fill=''rgba(255,255,255,0.10)''/>'
        '</svg>',
        plates[i][1], plates[i][2], 90 + i * 9, 150 + i * 13, 520 + i * 8),
      plates[i][3], plates[i][4], i);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  Testimonials
-- ---------------------------------------------------------------------------
insert into public.reviews (author_name, author_role, rating, body, is_published, sort_order)
select * from (values
  ('Daniel W.', 'Customer since 2019', 5,
   'I have had the same cut for six years and it has never once been wrong. Booking used to mean phoning at the wrong moment; now it takes about forty seconds.',
   true, 1),
  ('Priya S.', 'Books the Cut & Beard', 5,
   'Amir asked what I actually do with my hair in the morning before he picked up the clippers. Nobody had done that before.',
   true, 2),
  ('Tomas L.', 'Walk-in turned regular', 5,
   'Came in on a Saturday with no appointment expecting to be turned away. Sat down, coffee, twenty minutes, best fade I have had.',
   true, 3),
  ('Ruth A.', 'Brings both her sons', 5,
   'Sofia cuts my boys'' hair and somehow makes an eight year old sit still. Worth the price on its own.',
   true, 4),
  ('Kwame O.', 'Customer since 2021', 5,
   'Jonah is the first barber who did not try to cut my curls like they were straight hair. It grows out well, which is the real test.',
   true, 5)
) as v(author_name, author_role, rating, body, is_published, sort_order)
where not exists (select 1 from public.reviews);

-- ---------------------------------------------------------------------------
--  Website copy
-- ---------------------------------------------------------------------------
insert into public.website_content (key, value) values
('business', jsonb_build_object(
  'name', 'Fade & Co',
  'tagline', 'Barbering, Amsterdam',
  'logo_mark', 'F'
)),
('hero', jsonb_build_object(
  'eyebrow', 'Est. 2011 · Jordaan',
  'title', 'A cut worth the walk across town.',
  'subtitle', 'Four barbers, one chair each, and appointments that start when they say they will. Book in under a minute.',
  'primary_cta', 'Book an appointment',
  'secondary_cta', 'See our services',
  'stat_one_value', '12k+',
  'stat_one_label', 'Cuts a year',
  'stat_two_value', '4.9',
  'stat_two_label', 'Average rating',
  'stat_three_value', '22',
  'stat_three_label', 'Years on this street'
)),
('about', jsonb_build_object(
  'title', 'We only do one thing.',
  'body', 'Fade & Co opened in 2011 in a former ironmonger''s on the Jordaan, and we have resisted every suggestion to add a spa menu since. There are four chairs, four barbers, good coffee and a record player that is usually on. Everything else is haircuts.

Nobody is rushed out. An appointment is booked for the time your cut actually takes, which is why the schedule holds and why the person before you is not still in the chair when you arrive.',
  'quote', 'If it is not right, it goes back on the comb. There is no version of this where you leave unhappy.',
  'quote_author', 'Marco Ricci, owner'
)),
('contact', jsonb_build_object(
  'title', 'Find us',
  'subtitle', 'Two minutes from Westermarkt, on the canal side.',
  'address_line1', 'Prinsengracht 214',
  'address_line2', '1016 HD Amsterdam',
  'phone', '+31 20 555 0142',
  'email', 'hello@fadeandco.nl',
  'map_query', 'Prinsengracht 214, 1016 HD Amsterdam',
  'map_lat', 52.3752,
  'map_lng', 4.8836,
  'directions_note', 'Tram 13 or 17 to Westermarkt. Bike racks directly outside; there is no parking on the gracht.'
)),
('social', jsonb_build_object(
  'instagram', 'https://instagram.com/',
  'facebook', 'https://facebook.com/',
  'tiktok', '',
  'whatsapp', ''
)),
('faq', jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('q', 'Do you take walk-ins?',
    'a', 'When a chair is free, yes. Saturdays are almost always fully booked by Thursday, so an appointment is the safer plan.'),
  jsonb_build_object('q', 'What if I need to cancel?',
    'a', 'Cancel from the link in your confirmation, or call us. We ask for four hours'' notice so the slot can go to someone else.'),
  jsonb_build_object('q', 'How do I pick between the barbers?',
    'a', 'Any of them will cut you well. If you want something specific — a skin fade, curls, colour — the specialities on each profile are honest, not marketing.'),
  jsonb_build_object('q', 'Can I book for someone else?',
    'a', 'Yes. Put their name and your phone number, and add a note so we know who to expect.'),
  jsonb_build_object('q', 'How should I pay?',
    'a', 'Card, cash or contactless in the shop. Nothing is taken online, and there is no deposit.'),
  jsonb_build_object('q', 'I am running late.',
    'a', 'Call. We can usually hold a chair ten minutes; past that it depends on who is booked after you.')
))),
('footer', jsonb_build_object(
  'blurb', 'Fade & Co has cut hair on the Prinsengracht since 2011.',
  'note', 'Appointments open 60 days ahead.',
  'legal', '© Fade & Co. All rights reserved.'
))
on conflict (key) do nothing;
