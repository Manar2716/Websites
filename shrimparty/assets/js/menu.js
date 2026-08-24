/* ═══════════════════════════════════════════════════════════
   menu.js — Shrimparty's actual menu.

   Every name, every description and every price in this file
   came off Shrimparty's own listings. Nothing here is written
   for the layout.

   `price` is AED and `null` means the number is not published
   anywhere I could reach, so no number is shown — the card says
   so and points at the phone. Same rule for `desc`: one dish
   (Grilled Salmon) is on the menu without a description I could
   verify, so it goes out without one rather than with a
   plausible sentence I made up.

   `scene`, `opts`, `act` and `cue` are the other half of the
   record: which objects the renderer builds for the dish, and
   which choreography runs when you open it. They live next to
   the copy because a dish is one thing — the words and the
   behaviour are describing the same plate.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});

  /* ── the restaurant ──────────────────────────────────────── */

  SP.INFO = {
    name: 'Shrimparty',
    arabic: 'شرمبارتي',
    line: 'We serve the good taste of food',
    since: 2020,
    address: ['58 21st St', 'Al Satwa', 'Dubai', 'United Arab Emirates'],
    phone: '+971 4 255 0033',
    phoneHref: '+97142550033',
    email: 'info@shrimparty.com',
    hours: [
      { days: 'Sunday – Thursday', open: '12:00', close: '01:00' },
      { days: 'Friday – Saturday', open: '12:00', close: '01:30' }
    ],
    social: [
      { label: 'Instagram', href: 'https://www.instagram.com/shrimparty/' },
      { label: 'Facebook', href: 'https://www.facebook.com/ShrimPartyUAE/' }
    ],
    /* Shrimparty's own account of itself, condensed from the
       about page. */
    story: [
      'Shrimparty was put together by chefs with more than twenty-five years ' +
      'in kitchens, who took the American Cajun way with seafood and ran it ' +
      'through everything else they knew. The first room opened in Dubai in 2020.',

      'The rule of the house is that there is no cutlery. Seafood arrives in a ' +
      'bucket, sauce and all, and it goes onto the table rather than onto plates. ' +
      'You wear the bib, you use your hands, and the table gets messy — that is ' +
      'the format, not an accident of it.'
    ]
  };

  /* Sauces that Shrimparty names on its own menu. The bucket
     sauces are offered as "your choice of Shrimparty's hot
     sauces" without being listed one by one, so only the ones
     printed against a dish appear here. */
  SP.SAUCES = {
    tagine: ['Spicy marinara', 'Cajun creamy', 'Creamy cheesy'],
    named: [
      { on: 'Shrimparty Sizzling', sauce: 'Lemon dill' },
      { on: 'Baked Baby Potato', sauce: 'Rosemary garlic butter' },
      { on: 'Fried Shrimp Basket', sauce: 'Peri mayonnaise' },
      { on: 'Fried Calamari Basket', sauce: 'Honey mustard' },
      { on: 'Fried Fish Fingers Basket', sauce: 'Tartar' }
    ]
  };

  /* ── the menu ────────────────────────────────────────────────
     Categories in the order Shrimparty prints them: you are meant
     to arrive at the buckets, so nothing else is allowed to take
     that position. */

  SP.MENU = [

    /* ══ SOUPS ══ */
    {
      id: 'soups', name: 'Soups', kicker: 'Hot, and served first',
      dishes: [
        {
          id: 'sea-carnival-soup', name: 'Sea Carnival Soup', price: 33,
          desc: 'Fresh shrimp, calamari and fish cooked in fresh cream and our mix spice.',
          scene: 'bowl',
          opts: { broth: 'cream', pieces: ['shrimp', 'calamari', 'fish'], steam: 1.0 },
          act: 'brothSettle',
          cue: 'Point at anything in the broth to bring it up'
        },
        {
          id: 'shrimparty-soup', name: 'Shrimparty Soup', price: 33,
          desc: 'Fresh shrimp, calamari, mix spice and fish cooked in fresh red sauce.',
          scene: 'bowl',
          opts: { broth: 'red', pieces: ['shrimp', 'calamari', 'fish'], steam: 1.15, spoon: true },
          act: 'spoonStir',
          cue: 'Drag the spoon through it'
        }
      ]
    },

    /* ══ SALAD ══ */
    {
      id: 'salad', name: 'Salad', kicker: 'One, done properly',
      dishes: [
        {
          id: 'shrimp-caesar-salad', name: 'Shrimp Caesar Salad', price: 33,
          desc: 'Sauteed shrimp on fresh crispy romaine, parmesan cheese and iceberg ' +
                'lettuce tossed in caesar dressing.',
          scene: 'salad',
          opts: { shrimp: 6, leaves: 26, parmesan: 22 },
          act: 'liftFromGreens',
          cue: 'Lift a shrimp off the leaves'
        }
      ]
    },

    /* ══ APPETIZERS ══ */
    {
      id: 'appetizers', name: 'Appetizers', kicker: 'Fried, salted, shared',
      dishes: [
        {
          id: 'fisherman-catch', name: 'Fisherman Catch', price: 52,
          desc: 'Fried mix crispy seafood spiced with our secret seasoning mix, served ' +
                'with lemon wedges and cold sauce.',
          scene: 'platter',
          opts: { mix: ['shrimp', 'calamari', 'fish'], count: 13, lemon: 2 },
          act: 'orbitSeparate',
          cue: 'The plate turns — pick anything off it'
        },
        {
          id: 'fried-shrimp-basket', name: 'Fried Shrimp Basket', price: 49,
          desc: 'Fried shrimp topped with our secret spices, served with lemon wedges ' +
                'and peri mayonnaise sauce.',
          scene: 'basket',
          opts: { item: 'shrimp', count: 11, crumbs: 90, dip: 'peri' },
          act: 'crumbShake',
          cue: 'Take one out'
        },
        {
          id: 'fried-calamari-basket', name: 'Fried Calamari Basket', price: null,
          desc: 'Deep fried calamari topped with secret spices, served with honey mustard ' +
                'sauce and lemon wedge.',
          scene: 'basket',
          opts: { item: 'calamari', count: 14, crumbs: 70, dip: 'mustard' },
          act: 'ringRoll',
          cue: 'Roll a ring, or push the sauce'
        },
        {
          id: 'fried-fish-fingers-basket', name: 'Fried Fish Fingers Basket', price: null,
          desc: 'Deep fried fish fingers topped with secret spices, served with tartar ' +
                'sauce and lemon wedge.',
          scene: 'basket',
          opts: { item: 'finger', count: 8, crumbs: 60, dip: 'tartar' },
          act: 'pullOne',
          cue: 'Pull one towards you to see the break'
        },
        {
          id: 'baked-mussels-cheese', name: 'Baked Mussels & Cheese', price: null,
          desc: 'Baked mussels cooked in creamy cheesy sauce and melted cheese.',
          scene: 'gratin',
          opts: { mussels: 9, cheese: true, steam: .8 },
          act: 'cheesePull',
          cue: 'Lift a shell and the cheese comes with it'
        }
      ]
    },

    /* ══ BUCKETS ══ */
    {
      id: 'buckets', name: 'Seafood Buckets', kicker: 'No cutlery. That is the point.',
      note: 'Every bucket is boiled with lemon, celery and fresh vegetables, cooked ' +
            'through with baby potato and sweet corn, finished in the Shrimparty hot ' +
            'sauce you choose, and served with white rice.',
      dishes: [
        {
          id: 'shrimp-bucket', name: 'Shrimp Bucket', price: null, hero: true,
          desc: 'Shrimp cooked with lemon flavor, celery, fresh vegetables cooked with ' +
                'baby potato, sweet corn and your choice of hot shrimparty sauces, served ' +
                'with white rice.',
          scene: 'bucket',
          opts: { mix: [['shrimp', 16]], potato: 5, corn: 3, seasoning: 260 },
          act: 'riseAndHold',
          cue: 'Open a shrimp — shell, meat, seasoning, all of it'
        },
        {
          id: 'mix-seafood-bucket', name: 'Mix Seafood Bucket', price: null,
          desc: 'Mix shrimp, mussels, crab, calamari cooked with lemon flavor, celery, ' +
                'fresh vegetables cooked with baby potato, sweet corn and your choice of ' +
                'hot shrimparty sauces, served with white rice.',
          scene: 'bucket',
          opts: {
            mix: [['shrimp', 7], ['mussel', 6], ['crab', 3], ['calamari', 6]],
            potato: 4, corn: 2, seasoning: 220
          },
          act: 'layerSplit',
          cue: 'It comes apart in layers — take one'
        },
        {
          id: 'crabs-bucket', name: 'Crabs Bucket', price: null,
          desc: 'Crab cooked with lemon flavor, celery, fresh vegetables cooked with baby ' +
                'potato, sweet corn and your choice of hot shrimparty sauces, served with ' +
                'white rice.',
          scene: 'bucket',
          opts: { mix: [['crab', 6]], potato: 4, corn: 3, seasoning: 300 },
          act: 'shellCrack',
          cue: 'Turn a claw over'
        },
        {
          id: 'mussels-bucket', name: 'Mussels Bucket', price: null,
          desc: 'Mussels cooked with lemon wedges, celery, fresh vegetables cooked with ' +
                'baby potato, sweet corn and your choice of hot shrimparty sauces, served ' +
                'with white rice.',
          scene: 'bucket',
          opts: { mix: [['mussel', 18]], potato: 3, corn: 2, seasoning: 150, steam: .7 },
          act: 'shellsOpen',
          cue: 'They open when you get close'
        },
        {
          id: 'mix-shrimparty-bucket', name: 'Mix Shrimparty Bucket', price: null, hero: true,
          desc: 'A boiled mix of shrimp, crab, lobster, calamari and mussels cooked ' +
                'together with baby potato and sweet corn with your choice of one of ' +
                "Shrimparty's hot sauces, served with white rice.",
          scene: 'bucket',
          opts: {
            mix: [['shrimp', 8], ['crab', 3], ['lobster', 1], ['calamari', 5], ['mussel', 6]],
            potato: 5, corn: 3, seasoning: 340, wide: true
          },
          act: 'cascade',
          cue: 'Everything in the house, in the order it went in'
        },
        {
          id: 'lobster-bucket', name: 'Lobster Bucket', price: null,
          desc: 'Lobster cooked with lemon flavor, celery, fresh vegetables cooked with ' +
                'baby potato, sweet corn and your choice of hot shrimparty sauces, served ' +
                'with white rice.',
          scene: 'bucket',
          opts: { mix: [['lobster', 2]], potato: 4, corn: 2, seasoning: 200 },
          act: 'lobsterRise',
          cue: 'It turns for you — click to go in'
        }
      ]
    },

    /* ══ TAGINE ══ */
    {
      id: 'tagine', name: 'Tagine', kicker: 'Baked, and opened at the table',
      note: 'Every tagine is served with Shrimparty bread — RASHOUSH.',
      dishes: [
        {
          id: 'mix-seafood-tagin', name: 'Mix Seafood Tagin', price: null,
          desc: 'Shrimp, fish fillet and fresh calamari cooked with garlic, white onion, ' +
                'celery and spices in a Yemeni tagine with your choice of tagine sauce, ' +
                'served with Shrimparty bread (RASHOUSH).',
          scene: 'tagine',
          opts: { fill: [['shrimp', 5], ['fish', 3], ['calamari', 5]], onion: true, steam: 1.3 },
          act: 'lidLiftSpread',
          cue: 'The lid comes off first'
        },
        {
          id: 'fish-filet-tagin', name: 'Fish Filet Tagin', price: null,
          desc: 'Baked fish fillet cooked together with your choice of any of the tagin ' +
                'sauces, served with Shrimparty bread (RASHOUSH).',
          scene: 'tagine',
          opts: { fill: [['fish', 4]], herbs: 9, steam: 1.1 },
          act: 'lidLiftTurn',
          cue: 'Take a herb off the top'
        },
        {
          id: 'shrimp-tagin', name: 'Shrimp Tagin', price: null,
          desc: 'Baked fresh shrimp cooked together with your choice of any of the tagin ' +
                'sauces, served with Shrimparty bread (RASHOUSH).',
          scene: 'tagine',
          opts: { fill: [['shrimp', 11]], steam: 1.2 },
          act: 'lidLiftFloat',
          cue: 'They come up out of the sauce'
        },
        {
          id: 'calamari-tagin', name: 'Calamari Tagin', price: null,
          desc: 'Baked calamari cooked with your choice of spicy marinara sauce, cajun ' +
                'creamy sauce or creamy cheesy sauce, served with Shrimparty bread ' +
                '(RASHOUSH).',
          scene: 'tagine',
          opts: { fill: [['calamari', 12]], steam: 1.0 },
          act: 'lidLiftSauce',
          cue: 'Push the sauce and watch it come back'
        }
      ]
    },

    /* ══ MAIN DISHES ══ */
    {
      id: 'mains', name: 'Main Dishes', kicker: 'Off the grill, out of the oven',
      dishes: [
        {
          id: 'shrimparty-sizzling', name: 'Shrimparty Sizzling', price: null, hero: true,
          desc: 'Collection of salmon, shrimp and calamari marinated in our seasoned olive ' +
                'oil and spice mix, served with lemon dill sauce on a sizzling plate.',
          scene: 'sizzler',
          opts: { salmon: 2, shrimp: 6, calamari: 5, steam: 1.6 },
          act: 'sizzle',
          cue: 'It is still going — touch the plate'
        },
        {
          id: 'grilled-salmon', name: 'Grilled Salmon', price: null,
          desc: null,
          scene: 'grill',
          opts: { fillet: 'salmon', lemon: 2, herbs: 7 },
          act: 'grillMarks',
          cue: 'Pick up the lemon'
        },
        {
          id: 'lobster-thermidor', name: 'Lobster Thermidor', price: null, hero: true,
          desc: 'Lobster meat and fresh shrimp cooked in lobster creamy sauce served in ' +
                'lobster shell topped with melted mozzarella cheese in the oven, served ' +
                'with one side item of your choice.',
          scene: 'thermidor',
          opts: { shrimp: 4, cheese: true, steam: .9 },
          act: 'openShell',
          cue: 'Look inside the shell'
        },
        {
          id: 'fried-seabass', name: 'Fried Seabass', price: null,
          desc: 'Seabass fillet seasoned with secret spice mix and self raising breading ' +
                'fried to golden brown color, served with Spanish rice, tahina and sweet ' +
                'and sour sauce.',
          scene: 'grill',
          opts: { fillet: 'seabass', breaded: true, crumbs: 80, rice: true },
          act: 'crustTurn',
          cue: 'Turn it into the light'
        }
      ]
    },

    /* ══ SIDES ══ */
    {
      id: 'sides', name: 'Sides', kicker: 'What goes under it',
      dishes: [
        {
          id: 'steamed-white-rice', name: 'Steamed White Rice', price: null,
          desc: 'Steamed white rice.',
          scene: 'bowl',
          opts: { broth: 'rice', pieces: [], steam: .7 },
          act: 'riceSteam',
          cue: 'Steam, and nothing else'
        },
        {
          id: 'baked-baby-potato', name: 'Baked Baby Potato', price: null,
          desc: 'Baked baby potato seasoned with rosemary garlic butter sauce.',
          scene: 'platter',
          opts: { mix: ['potato'], count: 9, herbs: 6 },
          act: 'butterGloss',
          cue: 'Roll one through the butter'
        }
      ]
    },

    /* ══ DRINKS ══ */
    {
      id: 'drinks', name: 'Drinks', kicker: 'Cold, mostly',
      dishes: [
        {
          id: 'fresh-juice', name: 'Fresh Juices', price: 23,
          desc: 'Fresh juices prepared upon order.',
          scene: 'glass',
          opts: { liquid: 'juice', ice: 0, pulp: true },
          act: 'pourSettle',
          cue: 'Tilt the glass'
        },
        {
          id: 'mojito', name: 'Mojitos', price: 24,
          desc: 'Enjoy the fresh lemon, lime together with 7up, fresh mint, mojito syrup ' +
                'and choose your favorite flavor.',
          scene: 'glass',
          opts: { liquid: 'mojito', ice: 7, mint: 5, bubbles: 90 },
          act: 'muddle',
          cue: 'Push the ice down'
        },
        {
          id: 'shrimparty-soda', name: 'Shrimparty Soda', price: 21,
          desc: 'Flavoured soda with the most authentic flavours.',
          scene: 'glass',
          opts: { liquid: 'soda', ice: 5, bubbles: 160 },
          act: 'fizz',
          cue: 'Knock it and watch the bubbles go'
        },
        {
          id: 'soft-drink', name: 'Soft Drinks', price: 10,
          desc: 'Carbonated soft drink.',
          scene: 'can',
          opts: { chilled: true, condensation: 120 },
          act: 'condensationRun',
          cue: 'Wipe the side of the can'
        },
        {
          id: 'bottled-ice-tea', name: 'Bottled Ice Tea', price: 8,
          desc: 'Iced tea with different flavours.',
          scene: 'bottle',
          opts: { liquid: 'tea', condensation: 80 },
          act: 'bottleTilt',
          cue: 'Rock the bottle'
        },
        {
          id: 'water', name: 'Water', price: null,
          desc: 'Stay hydrated and refreshed with our water.',
          scene: 'bottle',
          opts: { liquid: 'water', condensation: 140 },
          act: 'clearRefract',
          cue: 'It bends what is behind it'
        }
      ]
    }
  ];

  /* Flat index, built once. Everything downstream — the rail, the
     card list, the deep links — wants dishes in menu order with
     their category attached, and wants them by id. */
  SP.DISHES = [];
  SP.BY_ID = Object.create(null);
  (function () {
    for (var c = 0; c < SP.MENU.length; c++) {
      var cat = SP.MENU[c];
      for (var d = 0; d < cat.dishes.length; d++) {
        var dish = cat.dishes[d];
        dish.cat = cat.id;
        dish.catName = cat.name;
        dish.index = SP.DISHES.length;
        SP.DISHES.push(dish);
        SP.BY_ID[dish.id] = dish;
      }
    }
  })();

})(window);
