/*
 * Chulo — restaurant settings and menu.
 *
 * This file is the single source of truth for the menu and opening hours.
 * It is loaded by the browser (window.ChuloMenu) and by server.js (require).
 * Prices are in minor units (pence): 1095 = £10.95.
 * Images are Unsplash photo ids; swap for your own photography later.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChuloMenu = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const lunch = (close) => ({ name: 'Lunch', open: '12:00', close, lastSeating: close === '15:00' ? '14:00' : '13:45' });
  const dinner = (close) => ({ name: 'Dinner', open: '17:30', close, lastSeating: close === '23:00' ? '21:45' : '21:00' });

  const settings = {
    name: 'Chulo',
    tagline: 'Nepali & North Indian kitchen',
    currency: 'GBP',
    locale: 'en-GB',
    phone: '020 7946 0321',
    email: 'hello@chulo.example',
    address: { line1: '3 Tamarind Yard', line2: 'Hackney', city: 'London', postcode: 'E8 4QT' },

    // Keyed by weekday, 0 = Sunday. An empty array means closed.
    hours: {
      0: [{ name: 'All day', open: '12:00', close: '21:00', lastSeating: '20:00' }],
      1: [],
      2: [lunch('14:30'), dinner('22:00')],
      3: [lunch('14:30'), dinner('22:00')],
      4: [lunch('14:30'), dinner('22:00')],
      5: [lunch('15:00'), dinner('23:00')],
      6: [lunch('15:00'), dinner('23:00')]
    },
    closedDates: ['2026-12-25', '2026-12-26', '2027-01-01'],

    booking: {
      interval: 15,          // minutes between bookable times
      leadMinutes: 60,       // how soon before a slot it can be booked online
      maxDaysAhead: 60,
      maxParty: 8,           // larger groups are routed to an enquiry
      holdMinutes: 15,
      durations: [
        { upTo: 2, minutes: 90 },
        { upTo: 4, minutes: 105 },
        { upTo: 99, minutes: 120 }
      ],
      tables: [
        { id: 'W1', seats: 2, area: 'Window' }, { id: 'W2', seats: 2, area: 'Window' },
        { id: 'C1', seats: 2, area: 'Counter' }, { id: 'C2', seats: 2, area: 'Counter' },
        { id: '4', seats: 2, area: 'Inside' }, { id: '5', seats: 2, area: 'Inside' },
        { id: '6', seats: 4, area: 'Inside' }, { id: '7', seats: 4, area: 'Inside' },
        { id: '8', seats: 4, area: 'Inside' }, { id: '9', seats: 4, area: 'Window' },
        { id: '10', seats: 4, area: 'Inside' },
        { id: '11', seats: 6, area: 'Back room' }, { id: '12', seats: 6, area: 'Back room' },
        { id: '14', seats: 8, area: 'Back room' }
      ],
      occasions: ['Birthday', 'Anniversary', 'Date night', 'Business', 'Celebration'],
      seating: ['No preference', 'Inside', 'Window', 'Counter']
    },

    ordering: {
      collectionMinutes: 20,
      deliveryMinutes: 45,
      slotInterval: 15,
      daysAhead: 4,
      deliveryFee: 299,
      freeDeliveryOver: 3500,
      minimumDelivery: 1500,
      deliveryRadius: '3 miles',
      payment: [
        { id: 'card_on_arrival', label: 'Card on collection / delivery', note: 'Contactless and chip & PIN' },
        { id: 'cash', label: 'Cash', note: 'Exact change appreciated' }
      ]
    }
  };

  const momoFilling = {
    id: 'filling', name: 'Filling', choices: [
      { id: 'chicken', label: 'Chicken, coriander & ginger', price: 0 },
      { id: 'lamb', label: 'Lamb & spring onion', price: 100 },
      { id: 'veg', label: 'Mushroom, cabbage & paneer', price: 0, tags: ['v'] }
    ]
  };
  const spice = {
    id: 'spice', name: 'Heat', choices: [
      { id: 'mild', label: 'Mild', price: 0 },
      { id: 'medium', label: 'Medium, as the kitchen makes it', price: 0 },
      { id: 'hot', label: 'Hot', price: 0 },
      { id: 'nepali', label: 'Nepali hot (you have been warned)', price: 0 }
    ], defaultChoice: 'medium'
  };

  const categories = [
    { id: 'momo', name: 'Momo', local: 'म:म', blurb: 'Folded by hand every morning. Ten to a plate, with tomato and timur achar.' },
    { id: 'khaja', name: 'Small plates', local: 'खाजा', blurb: 'Khaja is what you eat between meals in Nepal. Here it is what you order too much of.' },
    { id: 'fire', name: 'Tandoor & sekuwa', local: 'आगो', blurb: 'Cooked over oak in the tandoor or on the open sekuwa grill.' },
    { id: 'curry', name: 'Curries', local: 'तरकारी', blurb: 'Slow braises from both sides of the border. Choose your heat where it says so.' },
    { id: 'thali', name: 'Dal bhat & sets', local: 'दाल भात', blurb: 'The meal Nepal runs on. Served as a full set, refills on us when you dine in.' },
    { id: 'rice', name: 'Rice & breads', local: 'भात / रोटी', blurb: 'Breads are slapped onto the tandoor wall to order.' },
    { id: 'sweet', name: 'Sweets', local: 'मिठाई', blurb: 'Small, not too sweet, mostly made by Sunita\'s mother.' },
    { id: 'drinks', name: 'Drinks', local: 'पेय', blurb: 'Chiya is brewed all day. Beer is 18+, ID checked on delivery.' }
  ];

  const items = [
    // Momo
    { id: 'jhol-momo', cat: 'momo', name: 'Jhol Momo', local: 'झोल म:म', price: 1095, heat: 2, popular: true,
      desc: 'Momo sat in a warm, tangy broth of roasted tomato, toasted sesame and timur. How Kathmandu eats them in winter.',
      img: '1650977399594-504c2aa27b3b', options: [momoFilling] },
    { id: 'steamed-momo', cat: 'momo', name: 'Steamed Momo', local: 'म:म', price: 950, heat: 1,
      desc: 'The classic. Thin, hand-pleated wrappers with a juicy filling and our golden tomato achar.',
      img: '1638502338747-f7f368214cce', options: [momoFilling] },
    { id: 'kothey-momo', cat: 'momo', name: 'Kothey Momo', local: 'कोठे म:म', price: 1050, heat: 1,
      desc: 'Steamed, then pan-fried on one side until the bottoms crackle. Sesame and chilli oil dip.',
      img: '1708782341487-6544f0d9efe8', options: [momoFilling] },
    { id: 'c-momo', cat: 'momo', name: 'C-Momo', local: 'चिली म:म', price: 1150, heat: 3,
      desc: 'Fried momo tossed with peppers, red onion and a glossy, properly hot chilli sauce.',
      img: '1738608084602-f9543952188e', options: [momoFilling] },

    // Small plates
    { id: 'samosa-chaat', cat: 'khaja', name: 'Samosa Chaat', price: 750, heat: 1, tags: ['v'], popular: true,
      desc: 'Crushed potato samosa, spiced chickpeas, cold yoghurt, tamarind, mint and pomegranate.',
      img: '1601050690597-df0568f70950' },
    { id: 'aloo-sadeko', cat: 'khaja', name: 'Aloo Sadeko', local: 'आलु सादेको', price: 650, heat: 2, tags: ['vg', 'gf'],
      desc: 'Newari potato salad dressed in fenugreek-tempered mustard oil, timur, lime and coriander.' },
    { id: 'chicken-choila', cat: 'khaja', name: 'Chicken Choila', local: 'छोयला', price: 895, heat: 2, tags: ['gf'],
      desc: 'Smoked chicken thigh, mustard oil, raw ginger and garlic, with crisp beaten rice (chiura).' },
    { id: 'bara', cat: 'khaja', name: 'Bara', local: 'बारा', price: 695, heat: 0, tags: ['v', 'gf'],
      desc: 'Black lentil pancakes from the Kathmandu valley, griddled crisp. Add a fried egg on top.',
      options: [{ id: 'egg', name: 'Topping', choices: [{ id: 'plain', label: 'Plain', price: 0 }, { id: 'egg', label: 'With fried egg', price: 100 }] }] },
    { id: 'pani-puri', cat: 'khaja', name: 'Pani Puri', price: 650, heat: 1, tags: ['vg'],
      desc: 'Six crisp shells, spiced potato, and two jugs: sour tamarind and green mint water. Pour, then eat in one go.' },

    // Tandoor & sekuwa
    { id: 'lamb-sekuwa', cat: 'fire', name: 'Lamb Sekuwa', local: 'सेकुवा', price: 1450, heat: 2, tags: ['gf'], popular: true,
      desc: 'Lamb leg marinated overnight in timur, cumin and mustard oil, charred on the open grill. Cucumber achar.',
      img: '1670819916552-67698b1c86ae' },
    { id: 'chicken-tikka', cat: 'fire', name: 'Chicken Tikka', price: 1295, heat: 1, tags: ['gf'],
      desc: 'Thigh meat in hung yoghurt, Kashmiri chilli and mustard oil, from the tandoor. Mint chutney and pickled onion.',
      img: '1565557623262-b51c2513a641' },
    { id: 'paneer-tikka', cat: 'fire', name: 'Paneer Tikka', price: 1195, heat: 1, tags: ['v', 'gf'],
      desc: 'House-pressed paneer, peppers and red onion with ajwain and smoked chilli.',
      img: '1788843304145-bec146aa83c5' },
    { id: 'mixed-grill', cat: 'fire', name: 'Mixed Grill for Two', price: 2850, heat: 2, tags: ['gf'],
      desc: 'Lamb sekuwa, chicken tikka, malai chicken and a lamb seekh kebab. Comes with naan and two chutneys.',
      img: '1542367592-8849eb950fd8' },

    // Curries
    { id: 'khasi-masu', cat: 'curry', name: 'Khasi ko Masu', local: 'खसीको मासु', price: 1695, heat: 2, tags: ['gf'], popular: true,
      desc: 'Nepali goat curry on the bone, cooked the Sunday way: slowly, with lots of onion, cumin and a little patience.',
      img: '1596797038530-2c107229654b', options: [spice] },
    { id: 'butter-chicken', cat: 'curry', name: 'Butter Chicken', local: 'मुर्ग मखनी', price: 1495, heat: 0, tags: ['gf'],
      desc: 'Tandoor-charred chicken in a tomato, butter and fenugreek sauce. Rich, mild, unapologetic.',
      img: '1603894584373-5ac82b2ae398', options: [spice] },
    { id: 'rogan-josh', cat: 'curry', name: 'Lamb Rogan Josh', price: 1650, heat: 2, tags: ['gf'],
      desc: 'Kashmiri braise of lamb shoulder with fennel, dry ginger and ratan jot for colour.',
      img: '1606471191009-63994c53433b', options: [spice] },
    { id: 'dal-makhani', cat: 'curry', name: 'Dal Makhani', price: 1150, heat: 0, tags: ['v', 'gf'], popular: true,
      desc: 'Black lentils simmered for fourteen hours, finished with butter and cream. The pot never really goes cold.',
      img: '1788601988466-9f361c34c6cb' },
    { id: 'shahi-paneer', cat: 'curry', name: 'Shahi Paneer', price: 1295, heat: 1, tags: ['v', 'gf', 'n'],
      desc: 'Paneer in a gently spiced cashew and tomato gravy with green cardamom.',
      img: '1588166524941-3bf61a9c41db', options: [spice] },
    { id: 'aloo-tama', cat: 'curry', name: 'Aloo Tama Bodi', local: 'आलु तामा बोडी', price: 1095, heat: 2, tags: ['vg', 'gf'],
      desc: 'Fermented bamboo shoot, potato and black-eyed beans. Sour, earthy, very Nepali.',
      img: '1631292784640-2b24be784d5d' },
    { id: 'malabar-prawn', cat: 'curry', name: 'Malabar Prawn Curry', price: 1795, heat: 2, tags: ['gf'],
      desc: 'King prawns in coconut milk with kokum, curry leaf and black pepper.',
      img: '1631452180519-c014fe946bc7', options: [spice] },

    // Dal bhat & sets
    { id: 'dal-bhat', cat: 'thali', name: 'Dal Bhat Tarkari', local: 'दाल भात तरकारी', price: 1450, heat: 1, tags: ['v', 'gf'], popular: true,
      desc: 'Black lentil dal, rice, seasonal tarkari, gundruk, saag, two achars and papad.',
      img: '1593252719532-53f183016149' },
    { id: 'thakali-set', cat: 'thali', name: 'Thakali Set', local: 'थकाली खाना', price: 1795, heat: 2, tags: ['gf'],
      desc: 'The full Thakali spread from the Mustang trail, with your choice of curry, buckwheat dhido or rice.',
      img: '1589778655375-3e622a9fc91c',
      options: [{ id: 'main', name: 'Curry', choices: [{ id: 'chicken', label: 'Chicken', price: 0 }, { id: 'goat', label: 'Goat on the bone', price: 200 }, { id: 'paneer', label: 'Paneer & mushroom', price: 0, tags: ['v'] }] },
        { id: 'base', name: 'Base', choices: [{ id: 'rice', label: 'Rice', price: 0 }, { id: 'dhido', label: 'Buckwheat dhido', price: 0 }] }] },

    // Rice & breads
    { id: 'biryani', cat: 'rice', name: 'Lucknowi Dum Biryani', price: 1595, heat: 1, tags: ['gf'], popular: true,
      desc: 'Aged basmati layered with saffron and fried onion, sealed under dough and cooked on dum. Burani raita.',
      img: '1631515243349-e0cb75fb8d3a',
      options: [{ id: 'protein', name: 'Biryani', choices: [{ id: 'chicken', label: 'Chicken', price: 0 }, { id: 'lamb', label: 'Lamb', price: 200 }, { id: 'veg', label: 'Jackfruit & vegetable', price: -100, tags: ['v'] }] }] },
    { id: 'basmati', cat: 'rice', name: 'Steamed Basmati', price: 350, tags: ['vg', 'gf'], desc: 'Plain and fluffy.' },
    { id: 'jeera-rice', cat: 'rice', name: 'Jeera Rice', price: 395, tags: ['v', 'gf'], desc: 'Basmati with cumin and ghee.' },
    { id: 'butter-naan', cat: 'rice', name: 'Butter Naan', price: 375, tags: ['v'], desc: 'From the tandoor wall, brushed with butter.', img: '1697155406014-04dc649b0953' },
    { id: 'garlic-naan', cat: 'rice', name: 'Garlic & Coriander Naan', price: 395, tags: ['v'], desc: 'Our most-ordered bread.' },
    { id: 'peshwari-naan', cat: 'rice', name: 'Peshwari Naan', price: 450, tags: ['v', 'n'], desc: 'Coconut, almond and sultana.' },
    { id: 'tandoori-roti', cat: 'rice', name: 'Tandoori Roti', price: 295, tags: ['vg'], desc: 'Wholewheat, no butter.' },

    // Sweets
    { id: 'yomari', cat: 'sweet', name: 'Yomari', local: 'योमरी', price: 695, tags: ['v', 'gf'],
      desc: 'Newari steamed rice-flour dumplings filled with chaku (molasses) and toasted sesame. Served warm.' },
    { id: 'juju-dhau', cat: 'sweet', name: 'Juju Dhau', local: 'जुजु धौ', price: 595, tags: ['v', 'gf'],
      desc: '"King of curd" from Bhaktapur. Thick, sweet buffalo-milk yoghurt set in a clay pot.' },
    { id: 'gulab-jamun', cat: 'sweet', name: 'Gulab Jamun', price: 595, tags: ['v', 'n'],
      desc: 'Two, warm, in cardamom and rose syrup with crushed pistachio.' },
    { id: 'kheer', cat: 'sweet', name: 'Saffron Kheer', price: 595, tags: ['v', 'gf', 'n'],
      desc: 'Slow-cooked rice pudding with saffron, cardamom and almond.', img: '1690369642707-3d30e6f7fdcb' },

    // Drinks
    { id: 'masala-chiya', cat: 'drinks', name: 'Masala Chiya', local: 'चिया', price: 295, tags: ['v', 'gf'],
      desc: 'Milky Nepali tea boiled with ginger, cardamom and clove.', img: '1761483281417-778013dc0177' },
    { id: 'mango-lassi', cat: 'drinks', name: 'Mango Lassi', price: 450, tags: ['v', 'gf'],
      desc: 'Alphonso mango and yoghurt.', img: '1623065422902-30a2d299bbe4' },
    { id: 'salt-lassi', cat: 'drinks', name: 'Salted Lassi', price: 395, tags: ['v', 'gf'], desc: 'With roasted cumin and black salt.' },
    { id: 'nimbu-pani', cat: 'drinks', name: 'Nimbu Pani', price: 350, tags: ['vg', 'gf'], desc: 'Fresh lime, mint, a pinch of chaat masala.' },
    { id: 'lager', cat: 'drinks', name: 'Himalayan Lager 330ml', price: 550, tags: ['vg', '18'], desc: 'Crisp Nepali-style lager. ID required.' }
  ];

  // Every option group is single-choice; the first choice is the default unless defaultChoice is set.
  return { settings, categories, items };
});
