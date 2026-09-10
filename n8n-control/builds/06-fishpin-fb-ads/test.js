// FishPin FB Ad Engine — offline unit tests. No dependencies.
// Run:  node test.js                  (all offline tests)
//       node test.js --only=brand     (one section)
//       node test.js --live           (adds the Gemini copy-generation test)
const path = require('path');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';
const LIVE = process.argv.includes('--live');

let pass = 0, fail = 0; const fails = [];
const check = (name, cond) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name); }
};
const section = (tag, title, fn) => {
  if (ONLY && ONLY !== tag) return;
  console.log('\n■ ' + title);
  fn();
};
const L = (f) => require(path.join(__dirname, 'lib', f));

// ---------------------------------------------------------------- brand
section('brand', 'Brand bible', () => {
  const B = L('brand.js');

  // Independent literal lists, typed here rather than read from B, so these
  // checks cannot be satisfied by the same array/join logic they verify.
  const REQUIRED_BANNED_WORDS = [
    'revolutionary', 'game-changer', 'seamless', 'cutting-edge', 'unlock',
    'elevate', 'empower', "in today's fast-paced world", 'we are excited to announce',
  ];
  const REQUIRED_PILLARS = [
    'feature spotlight', 'safety', 'fish fact', 'tip or how-to',
    'cost comparison', 'social proof', 'behind the scenes',
  ];

  check('price is exactly 499 PHP', B.PRODUCT.price === 499 && B.PRODUCT.currency === 'PHP');
  check('ten live features listed', B.PRODUCT.features.length === 10);
  check('banned list has all 9 entries', B.BANNED_WORDS.length >= 9);
  check('banned list contains the 9 required words',
    REQUIRED_BANNED_WORDS.every(w => B.BANNED_WORDS.includes(w)));
  check('competitors listed for the validator', B.COMPETITORS.includes('garmin'));
  check('all 7 pillars present', Object.keys(B.PILLARS).length === 7);
  check('pillar keys match the required set',
    Object.keys(B.PILLARS).length === REQUIRED_PILLARS.length
    && REQUIRED_PILLARS.every(k => Object.prototype.hasOwnProperty.call(B.PILLARS, k)));

  const sys = B.buildSystemPrompt();
  check('system prompt states the exact price', /499/.test(sys));
  check('system prompt forbids em dash', /em dash/i.test(sys));
  const emDashLine = sys.split('\n').find(l => /em dash/i.test(l)) || '';
  check('em dash rule covers every generated field, not just caption/headline',
    /subhead/i.test(emDashLine) && /cta/i.test(emDashLine));
  check('system prompt forbids iPhone claims', /iphone/i.test(sys));
  check('system prompt forbids fabricated testimonials', /fabricat/i.test(sys));
  check('system prompt requires generally considered safe to eat',
    /generally considered safe to eat/i.test(sys));
  check('system prompt names the Taglish rule', /taglish/i.test(sys));
  check('system prompt lists every required banned word',
    REQUIRED_BANNED_WORDS.every(w => sys.toLowerCase().includes(w.toLowerCase())));

  const row = { id: 'FP-001', pillar: 'feature spotlight', topic: 'Offline maps',
    key_message: 'Works with zero signal', cta: 'I-download sa Play Store', notes: '' };
  const u1 = B.buildUserPrompt(row, '', '');
  check('user prompt carries the topic', u1.includes('Offline maps'));
  check('user prompt carries the pillar rule text',
    u1.includes('One feature, one benefit, one image'));
  check('clean user prompt has no revision block', !/rejected/i.test(u1));

  const rowUnknownPillar = { id: 'FP-002', pillar: 'nonsense', topic: 'x',
    key_message: 'y', cta: 'z', notes: '' };
  const uUnknown = B.buildUserPrompt(rowUnknownPillar, '', '');
  check('unknown pillar yields an empty rule, not the literal string undefined',
    !/undefined/i.test(uUnknown) && uUnknown.includes('Pillar rule: \nTopic:'));

  const u2 = B.buildUserPrompt(row, 'headline was garbled', 'Walang Signal Gumagana');
  check('revision note is injected', u2.includes('headline was garbled'));
  check('rejected headline is quoted back', u2.includes('Walang Signal Gumagana'));
  check('revision demands a different angle', /different angle/i.test(u2));

  check('schema requires all 7 fields', B.COPY_SCHEMA.required.length === 7);
  check('schema types hashtags as an array', B.COPY_SCHEMA.properties.hashtags.type === 'ARRAY');
});

// ---------------------------------------------------------------- results
console.log('\n' + '─'.repeat(40));
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fails.length) console.log('Failed: ' + fails.join('; '));
process.exit(fail ? 1 : 0);
