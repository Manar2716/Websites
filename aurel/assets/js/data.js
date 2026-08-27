/* ═══════════════════════════════════════════════════════════
   data.js — the whole clinic, in one table.

   Treatments appear in three places (the index, the booking
   step, the footer), clinicians in two, and neither is allowed
   to disagree with itself, so both live here once and every
   section renders from this file.

   A word on the copy. This is a design concept for an invented
   studio, and the writing is deliberately kept to what a
   dentist could actually stand behind: durations, visit counts
   and starting prices, not outcomes. Nothing here promises a
   result, and the case note in the results section says plainly
   that results vary. That is not caution for its own sake —
   unfalsifiable claims are the single thing that makes a
   medical site read as cheap.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var AUREL = (global.AUREL = global.AUREL || {});

  AUREL.TREATMENTS = [
    {
      id: 'general', n: '01', name: 'General Dentistry',
      kicker: 'Examinations, cleanings, fillings — and what does not need doing',
      body: 'A full examination is forty-five minutes, because that is how long it takes to look properly. You leave with photographs of your own teeth, a written note of anything we are watching, and no treatment plan for anything that does not need one.',
      facts: [['Appointment', '45 minutes'], ['Visits', 'One'], ['From', 'AED 450']]
    },
    {
      id: 'cosmetic', n: '02', name: 'Cosmetic Dentistry',
      kicker: 'Shape, proportion and shade, planned before anything is touched',
      body: 'Every cosmetic case begins as a digital design and then a trial smile you wear out of the building for a week. Nothing irreversible happens until you have lived with the shape and told us what to change about it.',
      facts: [['Planning', 'Two weeks'], ['Visits', 'Three to five'], ['From', 'AED 3,200']]
    },
    {
      id: 'whitening', n: '03', name: 'Teeth Whitening',
      kicker: 'One shade family lighter, not one colour whiter',
      body: 'We whiten to the brightest shade your enamel supports and stop there. Sensitivity is managed with a desensitising course beforehand rather than endured afterwards, and we will tell you in advance if existing crowns or composites will not follow.',
      facts: [['Chairside', '90 minutes'], ['Visits', 'One, plus trays'], ['From', 'AED 1,900']]
    },
    {
      id: 'veneers', n: '04', name: 'Porcelain Veneers',
      kicker: 'Cut thin, bonded once, matched to the teeth beside them',
      body: 'Preparation is minimal and, in suitable cases, none at all. The ceramics bench is on the same floor, which is why a case that is normally three weeks of temporaries is eight days here, and why the technician can see your face rather than a photograph of it.',
      facts: [['Fabrication', 'Eight days'], ['Visits', 'Three'], ['From', 'AED 4,400 per unit']]
    },
    {
      id: 'implants', n: '05', name: 'Dental Implants',
      kicker: 'Placed to a plan made from a scan, not freehand',
      body: 'A cone-beam scan and an intraoral scan are merged into one model, the position is decided on screen, and a printed guide puts the implant where the plan put it. Healing is three to four months before the final crown goes on.',
      facts: [['Surgery', '60–90 minutes'], ['To final crown', '3–4 months'], ['From', 'AED 9,500']]
    },
    {
      id: 'ortho', n: '06', name: 'Orthodontics',
      kicker: 'Fixed appliances, for the cases aligners genuinely cannot do',
      body: 'Some movements — significant rotations, closing an extraction space, real bite correction — are still faster and more predictable on a wire. We will say so when that is the case rather than sell you the more comfortable option.',
      facts: [['Review', 'Every 6 weeks'], ['Typical course', '14–24 months'], ['From', 'AED 18,000']]
    },
    {
      id: 'invisalign', n: '07', name: 'Invisalign',
      kicker: 'Scanned, staged, and reviewed against the plan every six weeks',
      body: 'You see the projected end position before you commit, and we check the teeth against the projection at every review. If they stop tracking the plan we re-scan and re-stage at no charge, which is more common and less dramatic than it sounds.',
      facts: [['Scan', 'No impression trays'], ['Typical course', '9–18 months'], ['From', 'AED 15,500']]
    },
    {
      id: 'preventive', n: '08', name: 'Preventive Care',
      kicker: 'Hygiene, sealants, night guards, and catching things early',
      body: 'The cheapest dentistry is the appointment where nothing happens. Six-monthly hygiene, a guard if you grind, sealants for children, and photographs kept side by side year on year so a change is obvious while it is still small.',
      facts: [['Appointment', '50 minutes'], ['Interval', 'Six months'], ['From', 'AED 550']]
    }
  ];

  /* ── the anatomy study ───────────────────────────────────
     Coordinates are percentages of the specimen image, not
     pixels, so they hold at any size — and they are here, in
     one readable table, precisely so they can be nudged after
     the photograph lands. See assets/img/README.md for how to
     re-calibrate in about a minute.

     x, y  centre of the region, as a % of the image box
     z     how far to zoom when it is opened */
  AUREL.REGIONS = [
    {
      id: 'occlusal', label: 'Occlusal table', x: 50, y: 15, z: 2.3,
      title: 'The biting surface',
      body: 'Cusps and fissures. The fissures are narrower than a toothbrush bristle, which is why decay starts here more often than anywhere else and why sealing them in children is worth doing.',
      tx: 'preventive', cta: 'Preventive care'
    },
    {
      id: 'enamel', label: 'Enamel', x: 27, y: 34, z: 2.1,
      title: 'The hardest thing you own',
      body: 'Enamel is the hardest tissue in the body and the only one that cannot repair itself. Everything cosmetic — whitening, veneers, bonding — is a decision about how much of this layer you are willing to spend.',
      tx: 'veneers', cta: 'Porcelain veneers'
    },
    {
      id: 'cervical', label: 'Cervical margin', x: 65, y: 47, z: 2.4,
      title: 'Where crown meets root',
      body: 'The join between enamel and root, and where the gum sits. Recession exposes it, brushing too hard notches it, and a crown margin placed badly here is the reason crowns fail. It is the millimetre the whole restoration depends on.',
      tx: 'general', cta: 'General dentistry'
    },
    {
      id: 'roots', label: 'Roots and canals', x: 48, y: 76, z: 1.9,
      title: 'Three roots, four canals',
      body: 'A lower first molar usually has three roots and, more often than the textbook says, four canals. Missing the fourth is the usual reason a root treatment has to be redone — which is why these are scanned rather than estimated.',
      tx: 'general', cta: 'Book an examination'
    }
  ];

  AUREL.DENTISTS = [
    {
      id: 'haddad', media: 'dr-haddad',
      name: 'Dr Yara Haddad', role: 'Prosthodontics & Smile Design',
      cred: 'BDS · MSc Prosthodontics, King’s College London',
      years: 16, langs: 'English, Arabic, French',
      bio: 'Yara plans every cosmetic case in the studio and does not hand it on. She spent six years in a London referral practice rebuilding worn dentitions before moving to Dubai, which is where the studio’s habit of trial smiles came from — she has seen enough finished work that nobody wanted to argue about it.',
      does: ['Veneers and full smile design', 'Crowns, onlays and bridges', 'Worn and eroded dentitions', 'Implant-supported restorations']
    },
    {
      id: 'rahman', media: 'dr-rahman',
      name: 'Dr Elias Rahman', role: 'Implantology & Oral Surgery',
      cred: 'BDS · MSc Implant Dentistry, Frankfurt',
      years: 18, langs: 'English, Arabic',
      bio: 'Elias places every implant in the studio and teaches guided surgery two weekends a year. He is unusually willing to tell a patient that an implant is not the right answer for them — grafting a site that will not hold is, in his phrasing, an expensive way to be disappointed twice.',
      does: ['Guided implant placement', 'Bone and sinus grafting', 'Surgical extractions', 'Full-arch rehabilitation']
    },
    {
      id: 'albakri', media: 'dr-albakri',
      name: 'Dr Noor Al-Bakri', role: 'Orthodontics',
      cred: 'BDS · MSc Orthodontics, University of Melbourne',
      years: 12, langs: 'English, Arabic, Hindi',
      bio: 'Noor runs both the aligner and fixed-appliance cases, and decides between them on the movement required rather than on what the patient walked in asking for. Roughly a third of the adults she sees are second courses — teeth that moved back after a first treatment finished without retention.',
      does: ['Invisalign and clear aligners', 'Fixed appliances', 'Adult re-treatment', 'Retention planning']
    },
    {
      id: 'okonkwo', media: 'dr-okonkwo',
      name: 'Dr Sami Okonkwo', role: 'Endodontics & Preventive Care',
      cred: 'BDS · MClinDent Endodontics, Eastman Dental Institute',
      years: 14, langs: 'English, French',
      bio: 'Sami takes the root treatments other practices have already attempted, which means most of his week is spent finding canals somebody else could not. He also runs the studio’s recall programme, on the argument that the most skilled thing he does is make his own speciality unnecessary.',
      does: ['Root canal treatment and re-treatment', 'Microscope endodontics', 'Cracked tooth diagnosis', 'Hygiene and recall']
    }
  ];

  AUREL.REVIEWS = [
    { name: 'Layla M.',   tx: 'Porcelain veneers',  when: 'Fourteen months on', stars: 5,
      body: 'I asked for the whitest option and Dr Haddad talked me out of it, which annoyed me at the time. A year later nobody has asked me whether I have had anything done, and that turns out to be exactly what I wanted.' },
    { name: 'Rajiv S.',   tx: 'Dental implant',     when: 'Two years on', stars: 5,
      body: 'Two lower molars, one appointment, and a printed guide that made the surgery almost boring. I ate normally the same evening. The crowns went on four months later and I have stopped being able to tell which side they are on.' },
    { name: 'Hana K.',    tx: 'Invisalign',         when: 'Eleven months on', stars: 5,
      body: 'My teeth stopped tracking the plan around month four. They re-scanned, re-staged, and did not charge me for it — I had braced myself for an argument that never came.' },
    { name: 'Tom B.',     tx: 'General dentistry',  when: 'Six months on', stars: 4,
      body: 'Went in expecting a sales pitch for a full set of veneers, came out with one filling replaced and a note about a tooth to watch. The parking is genuinely the worst part of the experience.' },
    { name: 'Aisha R.',   tx: 'Whitening',          when: 'Nine months on', stars: 5,
      body: 'They told me in advance that my two front crowns would not lighten with the rest and showed me what that would look like. Being warned about the awkward part beforehand is not something I have had from a dentist before.' },
    { name: 'Marco L.',   tx: 'Root canal',         when: 'Three years on', stars: 5,
      body: 'A re-treatment of something that had failed elsewhere. Dr Okonkwo found a fourth canal the first practice had missed, showed me the scan, and the tooth has been silent ever since.' },
    { name: 'Priya N.',   tx: 'Preventive care',    when: 'Four years on', stars: 5,
      body: 'Four years of six-monthly appointments and photographs kept side by side. I have watched one small thing get slightly bigger and be dealt with before it became anything. That is the entire pitch, and it works.' },
    { name: 'Khalid A.',  tx: 'Orthodontics',       when: 'Two years on', stars: 4,
      body: 'Twenty months in fixed braces at forty-three, which was as undignified as it sounds. Dr Al-Bakri was straight with me that aligners would not close my extraction spaces, and she was right.' }
  ];

  /* Times the studio offers, per weekday band. The booking step
     filters these against the chosen day so a Saturday does not
     offer an evening slot the studio is closed for. */
  AUREL.HOURS = {
    week: ['09:00', '09:45', '10:30', '11:15', '12:00', '14:00', '14:45', '15:30', '16:15', '17:00', '17:45', '18:30', '19:15'],
    fri:  ['09:00', '09:45', '10:30', '11:15', '12:00', '14:00', '14:45', '15:30', '16:15'],
    sat:  ['10:00', '10:45', '11:30', '12:15', '13:00', '13:45', '14:30', '15:15']
  };
})(window);
