# FishPin Facebook Ad Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two n8n workflows that generate FishPin Facebook Page creatives from a Google Sheet queue, gate them behind a Slack approval loop, publish approved posts, and backfill engagement metrics 24 hours later.

**Architecture:** All business logic lives in pure, dependency-free JavaScript modules under `lib/` that `test.js` can `require()` directly. Thin n8n glue files under `nodes/` read n8n globals (`$('Config')`, `$json`) and call those pure functions. `build.js` concatenates lib + glue into each Code node's body and emits a deployable workflow JSON. This is the repo's existing "workflow-as-code" pattern, extended so the logic is unit-testable offline — today's Code-node files use n8n globals throughout and cannot run standalone.

**Tech Stack:** Node.js (no dependencies, no test framework — plain assertions with a pass/fail counter, matching existing `builds/*/test.js`), n8n 1.x self-hosted, Google Gemini (`gemini-2.5-flash` for copy, `gemini-2.5-flash-image` for images), Facebook Graph API v21.0, Google Sheets, Slack.

**Source spec:** `docs/superpowers/specs/2026-09-10-fishpin-fb-ads-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Price is exactly PHP 499, one-time, no subscription.** Any other peso figure in generated copy is a validation failure.
- **No em dash (`—`, U+2014) anywhere in generated copy.** Use commas, colons, or parentheses.
- **Banned words:** revolutionary, game-changer, seamless, cutting-edge, unlock, elevate, empower, "in today's fast-paced world", "we are excited to announce".
- **Forbidden product claims:** iPhone/iOS support, live tracking of other boats, typhoon warnings, government or BFAR endorsement, guaranteed rescue.
- **Never fabricate** a testimonial, name, face, review count, rating, user count, or download count.
- **Fish safety is never absolute:** "generally considered safe to eat", never "safe to eat".
- **No competitor brand named** in a caption. Compare against "a GPS device" generically.
- **Taglish, Tagalog-leaning.** Keep English only for words fishermen actually say: GPS, signal, download, app, Play Store, offline, battery, load, screenshot.
- **Max 3 emoji per caption.** No all-caps beyond a single word for emphasis.
- **Headline ≤ 7 words. Subhead ≤ 12 words. Caption 80–150 words. Hashtags 3–5.**
- **Every external-call node** gets `retryOnFail: true`, an explicit `maxTries`, and `onError: 'continueRegularOutput'`, followed by an explicit failure branch. A post is never published on unvalidated input.
- **Both workflows** set `settings.errorWorkflow = '660Xkpo164VSNTDZ'`.
- **Credentials by ID:** Gemini `S0qfsjLzQfKC04iG`, Sheets `AYzUUEYWUCPKxHFI`, Slack `DnfgaCSu303JPlI3`. The Facebook credential does not exist yet; reference it by the placeholder name `FB Page - FishPin` and leave its `id` as `FB_CRED_ID` for the owner to fill after creating it.
- **Every lib file ends with** `if (typeof module !== 'undefined') module.exports = { ... };` so it inlines into an n8n Code node verbatim and is still requireable by `test.js`.
- **Libs never `require()` each other.** Shared values are passed as function parameters. This is what allows verbatim inlining.

---

## File Structure

```
n8n-control/builds/06-fishpin-fb-ads/
  lib/brand.js          Product facts, audience, voice, pillars, banned words; prompt builders.
  lib/copy-rules.js     validateCopy() — every deterministic copy rule.
  lib/image-rules.js    buildImagePrompt(), readImageSize(), validateImage().
  lib/flow-rules.js     normalizeDecision(), loopGuard() — approval routing and counters.
  lib/sheet-rules.js    Row selection, row shaping, metric mapping.

  nodes/load-queue.js         glue: pick the row (next ready, or a specific id on re-entry)
  nodes/build-copy-prompt.js  glue: build the Gemini copy request
  nodes/validate-copy.js      glue: parse the Gemini response, run validateCopy
  nodes/build-image-prompt.js glue: build the Gemini image request
  nodes/validate-image.js     glue: extract image bytes, run validateImage
  nodes/log-attempt.js        glue: shape the Attempts row
  nodes/route-decision.js     glue: normalizeDecision on the Slack form response
  nodes/loop-guard.js         glue: counters + re-invoke payload
  nodes/map-writeback.js      glue: shape the Queue row update after publish
  nodes/select-due.js         glue (insights): which posted rows need metrics
  nodes/map-metrics.js        glue (insights): Graph responses to row columns

  build.js              assembles fishpin-fb-ads.workflow.json
  build-insights.js     assembles fishpin-insights.workflow.json
  test.js               offline unit tests + optional live copy test
  queue-seed.csv        10 starter rows, all 7 pillars
  README.md
```

This refines spec §14's flat layout by splitting `lib/` from `nodes/`. The split is what makes offline testing possible and is the only deviation from the spec's file list.

---

## Task 1: Test harness and the brand bible

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/test.js`
- Create: `n8n-control/builds/06-fishpin-fb-ads/lib/brand.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PRODUCT` — `{ name, price: 499, currency: 'PHP', priceModel, platform, promise, features: string[], forbiddenClaims: string[] }`
  - `BANNED_WORDS: string[]`
  - `COMPETITORS: string[]`
  - `PILLARS: { [key: string]: string }` — pillar key to its one-line rule
  - `buildSystemPrompt(): string`
  - `buildUserPrompt(row: {id,pillar,topic,key_message,cta,notes}, revisionNote: string, rejectedHeadline: string): string`
  - `COPY_SCHEMA: object` — the Gemini `responseSchema`
- Test tags: `--only=brand`

- [ ] **Step 1: Write the failing test**

Create `test.js` with the harness plus the brand tests:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd n8n-control/builds/06-fishpin-fb-ads && node test.js --only=brand
```

Expected: crash with `Cannot find module '.../lib/brand.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/brand.js`. Product facts, audience, and voice are transcribed from sections 1–4 of the source prompt; do not paraphrase them.

```js
// ============================================================================
// Brand bible — the single source of truth for FishPin ad copy.
// Pure data + prompt builders. No n8n globals, no requires: build.js inlines
// this file verbatim into the Code node body, and test.js requires it.
// ============================================================================

const PRODUCT = {
  name: 'FishPin',
  price: 499,
  currency: 'PHP',
  priceModel: 'one-time in-app purchase, no subscription',
  platform: 'Android only, Play Store only, no iOS yet',
  promise: 'It works with zero signal in the middle of the sea, and it replaces a handheld GPS device that costs many times more.',
  features: [
    'Save fishing spots with a custom color and icon, then navigate back to them exactly.',
    'Record your path while you fish. Works with the screen locked and the app closed. Shows duration, distance in nautical miles, and average speed.',
    'Compass navigation with waypoints and route planning, ETA and distance to target.',
    'Offline maps. Download the map area once on Wi-Fi, use it forever at sea.',
    'Four map layers: standard, satellite, night mode, and nautical with Philippine depth contours and sea marks.',
    'Weather and sea conditions: wind, waves, ocean current, rain, plus a 7-day forecast and a daily fishing score.',
    'SOS: hold a button to send your exact coordinates by SMS to 3 to 5 saved emergency contacts. Includes a 911 option and Globe, Smart, and DITO load-borrow shortcodes.',
    'Fish guide with 200 or more Philippine species, saltwater and freshwater, including size, season, habitat, how to catch it, and whether it is generally considered safe to eat.',
    'AI fish scan: take a photo of your catch and get the species name, local name, edibility, and estimated market price.',
    'Catch logbook with photos, weight, length, method, and gear used, plus cloud backup so your spots survive a lost or broken phone.',
  ],
  forbiddenClaims: [
    'iPhone or iOS support',
    'live tracking of other boats',
    'typhoon warnings',
    'government or BFAR endorsement',
    'guaranteed rescue',
  ],
};

const AUDIENCE = 'Small-scale Filipino fishermen (mangingisda), bangka owners and crew, ages 25 to 55, in coastal provinces. '
  + 'Budget Android phones, prepaid data, weak signal. Many have never used a GPS device. '
  + 'Secondary: weekend anglers, spearfishing and freediving groups, fishing supply store owners, and the wives and children of fishermen who worry when the boat is late. '
  + 'What they actually feel: fear of not finding the good spot again, fear of getting lost when fog or night comes, '
  + 'fear of a dead engine with no way to call for help, and frustration that data signal disappears offshore.';

const BANNED_WORDS = [
  'revolutionary', 'game-changer', 'game changer', 'seamless', 'cutting-edge', 'cutting edge',
  'unlock', 'elevate', 'empower', "in today's fast-paced world", 'we are excited to announce',
];

const COMPETITORS = ['garmin', 'lowrance', 'humminbird', 'raymarine', 'navionics', 'furuno'];

const PILLARS = {
  'feature spotlight': 'One feature, one benefit, one image. Example hook: "Nawala ang signal? Gumagana pa rin ang mapa."',
  'safety': 'SOS, emergency contacts, telling family when you will be back. Serious tone, no sales pressure.',
  'fish fact': 'One species from the fish guide. Local name, season, where it lives, is it generally considered safe to eat. This pillar exists to get shared and commented on.',
  'tip or how-to': 'Reading wind and waves, when to go out, how to mark a spot properly.',
  'cost comparison': 'A handheld GPS device versus a phone app. One-time payment versus monthly load. Compare generically, never name a brand.',
  'social proof': 'Only real screenshots, reviews, or user quotes supplied by the owner. Never fabricate anything.',
  'behind the scenes': 'The app is built in the Philippines by a Filipino developer, for Filipino fishermen.',
};

const COPY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    subhead: { type: 'STRING' },
    caption: { type: 'STRING' },
    cta: { type: 'STRING' },
    hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
    image_prompt: { type: 'STRING' },
    alt_text: { type: 'STRING' },
  },
  required: ['headline', 'subhead', 'caption', 'cta', 'hashtags', 'image_prompt', 'alt_text'],
};

function buildSystemPrompt() {
  return [
    'You are a direct-response social media marketer writing organic Facebook Page posts for ' + PRODUCT.name + '.',
    '',
    'PRODUCT FACTS. Use only these. Never invent a feature.',
    PRODUCT.name + ' is a paid, offline-first marine navigation Android app for Filipino fishermen. '
      + 'Price is ' + PRODUCT.currency + ' ' + PRODUCT.price + ', a ' + PRODUCT.priceModel + '. ' + PRODUCT.platform + '.',
    'Core promise: ' + PRODUCT.promise,
    'Live features:',
    PRODUCT.features.map(f => '- ' + f).join('\n'),
    '',
    'NEVER CLAIM: ' + PRODUCT.forbiddenClaims.join('; ') + '. '
      + 'Never state a price other than ' + PRODUCT.currency + ' ' + PRODUCT.price + '.',
    '',
    'AUDIENCE. ' + AUDIENCE,
    '',
    'BRAND VOICE.',
    '- Speak like a fellow fisherman, not like a tech company. Practical, calm, respectful. Never talk down to them.',
    '- Safety first. Never make a joke out of danger at sea.',
    '- Short sentences. Simple words. No jargon such as "offline-first", "sync", "geolocation".',
    '- Taglish, Tagalog-leaning. Tagalog carries the sentence. English appears only where the English word is what '
      + 'fishermen actually say out loud: GPS, signal, download, app, Play Store, offline, battery, load, screenshot. '
      + 'Do not translate those into formal Tagalog, it will read as stiff and foreign.',
    '- Conversational Tagalog, not textbook Tagalog. "Nawala ang signal?" not "Nawala ba ang inyong senyas?". '
      + 'Use po and kayo when addressing the reader directly, since the audience skews older and respect matters.',
    '- No hype, no fake countdowns, no wall of emojis. Maximum 3 emojis per post.',
    '- Never write in all caps except a single word for emphasis.',
    '',
    'BANNED WORDS AND PHRASES, never use any of these: ' + BANNED_WORDS.join(', ') + '.',
    '',
    'NEVER USE AN EM DASH (the — character) in ANY field you generate, including the headline, '
      + 'subhead, caption, cta, hashtags and alt_text. Use commas, colons, or parentheses instead.',
    '',
    'COMPLIANCE, these are hard rules:',
    '- No fabricated reviews, testimonials, ratings, user counts, or download counts. Never invent a name or a face.',
    '- No promise that the app will save a life or guarantee rescue. Phrase safety features as "mas mabilis kang mahanap", never "hindi ka mamamatay".',
    '- No health, medical, or fish-safety absolutes. Write "generally considered safe to eat", never "safe to eat".',
    '- No comparative claim naming a competitor brand. Compare to "a GPS device" generically.',
    '- No misleading before-and-after and no fake urgency.',
    '',
    'IMAGE PROMPT RULES. The image_prompt field is an English prompt for an image model.',
    '- Describe a real, grounded scene: a Filipino bangka with outriggers, not a western yacht. Coastal Philippine light. Slightly documentary, not glossy stock photography.',
    '- People are Filipino fishermen in real working clothes. Respectful and dignified, never comedic or pitiful. No exaggerated poverty imagery.',
    '- Single clear subject, with generous empty sky or water on one side reserved for the headline text.',
    '- Never describe a scene that could read as a real distress event or a real accident.',
    '',
    'Return only the JSON object. Every field is required.',
  ].join('\n');
}

function buildUserPrompt(row, revisionNote, rejectedHeadline) {
  const pillarRule = PILLARS[String(row.pillar || '').toLowerCase()] || '';
  const parts = [
    'Write one Facebook Page post.',
    '',
    'Pillar: ' + row.pillar,
    'Pillar rule: ' + pillarRule,
    'Topic: ' + row.topic,
    'The single point this post must land: ' + row.key_message,
    'Call to action to use: ' + row.cta,
  ];
  if (row.notes) parts.push('Constraints from the owner: ' + row.notes);
  parts.push(
    '',
    'Length rules: headline at most 7 words. subhead at most 12 words. caption 80 to 150 words, '
      + 'and its first line is the hook. 3 to 5 hashtags mixing Tagalog and English, no spam tags.'
  );
  if (revisionNote) {
    parts.push(
      '',
      'Your previous attempt was rejected for this reason: ' + revisionNote,
      'Write a different angle.'
    );
    if (rejectedHeadline) parts.push('Do not repeat the rejected headline: "' + rejectedHeadline + '".');
  }
  return parts.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { PRODUCT, AUDIENCE, BANNED_WORDS, COMPETITORS, PILLARS, COPY_SCHEMA, buildSystemPrompt, buildUserPrompt };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test.js --only=brand
```

Expected: `RESULTS: 24 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): brand bible and offline test harness"
```

---

## Task 2: Copy validation rules

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/lib/copy-rules.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append a `copy` section before the results block)

**Interfaces:**
- Consumes: `BANNED_WORDS`, `COMPETITORS`, `PRODUCT.price` from Task 1, passed in as `opts` (libs never require each other).
- Produces: `validateCopy(copy, opts) -> { valid: boolean, reasons: string[] }`
  where `copy` is the parsed model JSON and `opts` is `{ bannedWords: string[], competitors: string[], price: number }`.
- Test tags: `--only=copy`

- [ ] **Step 1: Write the failing test**

Append to `test.js`, immediately before the `// ---- results` block:

```js
// ---------------------------------------------------------------- copy rules
section('copy', 'Copy validation', () => {
  const B = L('brand.js');
  const { validateCopy } = L('copy-rules.js');
  const OPTS = { bannedWords: B.BANNED_WORDS, competitors: B.COMPETITORS, price: B.PRODUCT.price };

  const good = {
    headline: 'Nawala ang signal? Gumagana pa rin',
    subhead: 'Offline maps para sa bawat biyahe sa laot',
    caption: 'Nawala ang signal pagkalayo mo sa dalampasigan? Normal po yan, at hindi ibig sabihin '
      + 'na wala ka nang mapa. Sa FishPin, i-download mo lang ang mapa habang naka Wi-Fi ka pa sa bahay, '
      + 'tapos gamitin mo na sa laot kahit walang kahit anong signal. Nakikita mo pa rin kung nasaan ka, '
      + 'kung saan ang mga naka-save mong tagpuan, at kung gaano ka pa kalayo sa uuwian mo. Isang bayad '
      + 'lang po, PHP 499, walang buwanang bayad at walang subscription. Hindi po kailangan ng load sa laot. '
      + 'Kung madalas kayong lumalayo at natatakot mawala ang direksyon, ito po ang tulong na kailangan ninyo. '
      + 'Subukan ninyo bago ang susunod ninyong biyahe.',
    cta: 'I-download sa Play Store',
    hashtags: ['#FishPin', '#Mangingisda', '#OfflineMaps', '#Bangka'],
    image_prompt: 'A Filipino bangka with outriggers at dawn, wide empty sky on the upper third.',
    alt_text: 'A fisherman on a bangka at dawn.',
  };
  const w = (o) => Object.assign({}, good, o);
  const rejects = (name, obj, rx) => {
    const r = validateCopy(obj, OPTS);
    check(name, r.valid === false && (!rx || r.reasons.some(x => rx.test(x))));
  };

  // Fixture guard: if the sample caption drifts out of the 80-150 band, every
  // other check below fails for the wrong reason. Fail loudly here instead.
  const sampleWords = good.caption.trim().split(/\s+/).length;
  check('sample caption is in the 80 to 150 word band (is ' + sampleWords + ')',
    sampleWords >= 80 && sampleWords <= 150);

  check('accepts a clean sample', validateCopy(good, OPTS).valid === true);
  check('clean sample reports no reasons', validateCopy(good, OPTS).reasons.length === 0);

  rejects('rejects a missing field', w({ cta: '' }), /cta/i);
  rejects('rejects an em dash in the caption',
    w({ caption: good.caption.replace('Normal po yan,', 'Normal po yan —') }), /em dash/i);
  rejects('rejects an em dash in the headline', w({ headline: 'Walang signal — walang problema' }), /em dash/i);
  B.BANNED_WORDS.forEach(word => {
    rejects('rejects banned word: ' + word, w({ caption: good.caption + ' ' + word + '.' }), /banned/i);
  });
  rejects('rejects an 8-word headline',
    w({ headline: 'Isa dalawa tatlo apat lima anim pito walo' }), /headline/i);
  rejects('rejects a 13-word subhead',
    w({ subhead: 'isa dalawa tatlo apat lima anim pito walo siyam sampu labing isa labing dalawa' }), /subhead/i);
  rejects('rejects a caption under 80 words', w({ caption: 'Maikli lang po ito.' }), /caption/i);
  rejects('rejects a caption over 150 words',
    w({ caption: (good.caption + ' ').repeat(3) }), /caption/i);
  rejects('rejects 4 emoji', w({ caption: good.caption + ' 🎣🐟⚓🌊' }), /emoji/i);
  rejects('rejects a multi-word all-caps run',
    w({ caption: good.caption.replace('Normal po yan', 'NORMAL LANG YAN') }), /caps/i);
  check('allows consecutive known acronyms',
    validateCopy(w({ caption: good.caption.replace('walang kahit anong signal', 'walang GPS SMS signal') }), OPTS).valid === true);
  check('allows one all-caps word for emphasis',
    validateCopy(w({ caption: good.caption.replace('Normal po yan', 'NORMAL po yan') }), OPTS).valid === true);

  rejects('rejects a rescue guarantee (Tagalog)',
    w({ caption: good.caption + ' Hindi ka mamamatay sa laot.' }), /rescue|guarantee/i);
  rejects('rejects a rescue guarantee (English)',
    w({ caption: good.caption + ' This app will save your life.' }), /rescue|guarantee/i);
  rejects('rejects a fish-safety absolute',
    w({ caption: good.caption + ' Ang isdang ito ay safe to eat.' }), /safe to eat/i);
  check('allows the hedged fish-safety phrasing',
    validateCopy(w({ caption: good.caption + ' It is generally considered safe to eat.' }), OPTS).valid === true);
  rejects('rejects a named competitor', w({ caption: good.caption + ' Mas mura kaysa Garmin.' }), /competitor/i);
  rejects('rejects a fabricated user count',
    w({ caption: good.caption + ' Mahigit 10,000 users na ang gumagamit.' }), /fabricat|count/i);
  rejects('rejects a fabricated star rating',
    w({ caption: good.caption + ' 4.8 stars sa Play Store.' }), /fabricat|rating/i);
  rejects('rejects a wrong peso price',
    w({ caption: good.caption.replace('PHP 499', 'PHP 999') }), /price/i);
  check('accepts the peso sign form',
    validateCopy(w({ caption: good.caption.replace('PHP 499', '₱499') }), OPTS).valid === true);
  rejects('rejects an iPhone claim',
    w({ caption: good.caption + ' Available din po sa iPhone.' }), /forbidden claim/i);
  rejects('rejects a typhoon-warning claim',
    w({ caption: good.caption + ' May typhoon warning din po.' }), /forbidden claim/i);
  rejects('rejects a BFAR endorsement claim',
    w({ caption: good.caption + ' Endorsed po ito ng BFAR.' }), /forbidden claim/i);
  rejects('rejects 2 hashtags', w({ hashtags: ['#FishPin', '#Bangka'] }), /hashtag/i);
  rejects('rejects 6 hashtags',
    w({ hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] }), /hashtag/i);

  // ---- fix 1: bare "P" peso shorthand (e.g. "P999") must still be price-checked
  rejects('rejects a wrong price in bare P shorthand',
    w({ caption: good.caption.replace('PHP 499', 'P999') }), /price/i);
  check('accepts a correct price in bare P shorthand',
    validateCopy(w({ caption: good.caption.replace('PHP 499', 'P499') }), OPTS).valid === true);
  check('still accepts the peso sign form (regression)',
    validateCopy(w({ caption: good.caption.replace('PHP 499', '₱499') }), OPTS).valid === true);
  check('still accepts the PHP form (regression)',
    validateCopy(good, OPTS).valid === true);

  // ---- fix 2: acronym scrub must be word-boundary aware, not a substring replace
  rejects('rejects shouting where PH is a substring of a real word (PHILIPPINES)',
    w({ caption: good.caption + ' PHILIPPINES TALAGA.' }), /caps/i);
  rejects('rejects shouting where AI is a substring of a real word (SAILING)',
    w({ caption: good.caption + ' SAILING NOW.' }), /caps/i);
  check('still allows consecutive known acronyms (regression)',
    validateCopy(w({ caption: good.caption.replace('walang kahit anong signal', 'walang GPS SMS signal') }), OPTS).valid === true);
  check('still allows a real acronym plus one emphasis word',
    validateCopy(w({ caption: good.caption + ' GPS TALAGA.' }), OPTS).valid === true);

  // ---- fix 3: all-caps shouting rule must be scoped per field, not the joined string
  check('allows one all-caps emphasis word in each of two different fields',
    validateCopy(w({ headline: 'Ito TALAGA', subhead: 'GRABE ganda ng app' }), OPTS).valid === true);
  rejects('still rejects a multi-word all-caps run within a single field (regression)',
    w({ caption: good.caption.replace('Normal po yan', 'NORMAL LANG YAN') }), /caps/i);

  // ---- fix 4: fabricated counts/ratings written in phrasings the regexes missed
  rejects('rejects a Tagalog thousands quantifier user count (libo-libong)',
    w({ caption: good.caption + ' May libo-libong users na gumagamit.' }), /fabricat|count/i);
  rejects('rejects a k-suffixed digit download count',
    w({ caption: good.caption + ' 10k downloads na.' }), /fabricat|count/i);
  rejects('rejects a hyphenated star rating',
    w({ caption: good.caption + ' 5-star daw sa Play Store.' }), /fabricat|rating/i);
  rejects('rejects a spelled-out star rating',
    w({ caption: good.caption + ' Four stars daw sa Play Store.' }), /fabricat|rating/i);
  rejects('rejects a slash-out-of-5 rating',
    w({ caption: good.caption + ' 4.8/5 daw sa Play Store.' }), /fabricat|rating/i);
  check('a plain number with no count noun still accepts (control)',
    validateCopy(w({ caption: good.caption + ' Tumagal ng 3 taon bago ito nagawa.' }), OPTS).valid === true);

  // ---- fix 5: competitor name check must catch pluralized/suffixed forms
  rejects('rejects a pluralized competitor name (Garmins)',
    w({ caption: good.caption + ' Mas mura kaysa sa mga Garmins.' }), /competitor/i);
  rejects('still rejects the possessive competitor form (regression)',
    w({ caption: good.caption + " Mas mura kaysa Garmin's." }), /competitor/i);
  rejects('still rejects the bare competitor name (regression)',
    w({ caption: good.caption + ' Mas mura kaysa Garmin.' }), /competitor/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=copy
```

Expected: crash with `Cannot find module '.../lib/copy-rules.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/copy-rules.js`:

```js
// ============================================================================
// Copy validation — deterministic, no model in the loop. Returns every reason
// a draft fails so the reviewer and the regeneration prompt both get specifics.
// Pure: no n8n globals, no requires. Shared constants arrive via opts.
// ============================================================================

// Acronyms fishermen actually read as words. Stripped before the all-caps check
// so "walang GPS SMS signal" is not mistaken for shouting.
const OK_ACRONYMS = ['GPS', 'SOS', 'SMS', 'ETA', 'AI', 'PH', 'PHP', 'WIFI', 'DITO', 'FISHPIN'];

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function validateCopy(copy, opts) {
  const o = opts || {};
  const banned = o.bannedWords || [];
  const competitors = o.competitors || [];
  const price = o.price;
  const reasons = [];
  const c = copy || {};

  // 1. required fields
  ['headline', 'subhead', 'caption', 'cta', 'image_prompt', 'alt_text'].forEach((f) => {
    if (!String(c[f] || '').trim()) reasons.push('Missing or empty field: ' + f);
  });
  if (!Array.isArray(c.hashtags) || c.hashtags.length < 3 || c.hashtags.length > 5) {
    reasons.push('hashtags must be an array of 3 to 5 tags');
  }

  const textFields = { headline: c.headline, subhead: c.subhead, caption: c.caption, cta: c.cta };
  const all = Object.values(textFields).map((v) => String(v || '')).join('\n');
  const lower = all.toLowerCase();

  // 2. em dash
  Object.keys(textFields).forEach((f) => {
    if (/—/.test(String(textFields[f] || ''))) reasons.push('Em dash found in ' + f + '. Use a comma, colon, or parentheses.');
  });

  // 3. banned words
  banned.forEach((wRaw) => {
    const w = String(wRaw).toLowerCase();
    if (lower.includes(w)) reasons.push('Banned word or phrase: "' + wRaw + '"');
  });

  // 4. lengths
  if (wordCount(c.headline) > 7) reasons.push('headline is ' + wordCount(c.headline) + ' words, max is 7');
  if (wordCount(c.subhead) > 12) reasons.push('subhead is ' + wordCount(c.subhead) + ' words, max is 12');
  const capWords = wordCount(c.caption);
  if (capWords < 80 || capWords > 150) reasons.push('caption is ' + capWords + ' words, must be 80 to 150');

  // 5. emoji budget
  const emoji = String(c.caption || '').match(/\p{Extended_Pictographic}/gu) || [];
  if (emoji.length > 3) reasons.push('caption has ' + emoji.length + ' emoji, max is 3');

  // 6. all-caps shouting (two or more consecutive caps words, acronyms excluded).
  // Scoped per field: a field-ending emphasis word followed by the next
  // field's own emphasis word must not read as one cross-field shouting run.
  Object.keys(textFields).forEach((f) => {
    let fieldScrubbed = String(textFields[f] || '');
    OK_ACRONYMS.forEach((a) => {
      fieldScrubbed = fieldScrubbed.replace(new RegExp('\\b' + a + '\\b', 'g'), '_');
    });
    if (/\b[A-Z]{2,}\b[^A-Za-z0-9]+\b[A-Z]{2,}\b/.test(fieldScrubbed)) {
      reasons.push('All caps run longer than one word in ' + f + '. Only a single word may be capitalised for emphasis.');
    }
  });

  // 7. compliance
  if (/hindi ka mamamatay|hindi ka malulunod|siguradong masasagip|will save your life|guaranteed rescue|guarantees rescue/i.test(all)) {
    reasons.push('Rescue guarantee. Phrase safety as "mas mabilis kang mahanap", never a promise of survival.');
  }
  if (/(safe to eat|ligtas kainin|pwedeng kainin)/i.test(all)
      && !/(generally considered safe to eat|karaniwang itinuturing na ligtas)/i.test(all)) {
    reasons.push('Fish-safety absolute. Write "generally considered safe to eat".');
  }
  competitors.forEach((brand) => {
    // \w* (not \b at the end) so a plural/possessive/suffixed form of the
    // brand name ("Garmins") still counts as naming the competitor.
    if (new RegExp('\\b' + brand + '\\w*', 'i').test(all)) reasons.push('Names a competitor brand: ' + brand);
  });
  // Count quantifier: a digit run (with an optional k/M suffix, e.g. "10k") or
  // a spelled-out/Tagalog quantifier (thousands of, libo-libo, daan-daang, ...).
  const countQuantifier = '(?:\\d[\\d,\\.]*\\s*[kKmM]?\\+?|libo-?libong?|libu-?libong?|daan-?daang?|thousands?\\s+of|millions?\\s+of)';
  const countNoun = '(?:users|user|downloads|installs|reviews|ratings|mangingisda ang gumagamit|ang gumagamit)';
  if (new RegExp('\\b' + countQuantifier + '\\s*' + countNoun, 'i').test(all)) {
    reasons.push('Fabricated user or download count.');
  }
  // Rating: digit (optionally hyphenated, e.g. "5-star") or spelled-out/Tagalog
  // number before star/bituin, or a slash-out-of-5 form ("4.8/5").
  const ratingDigit = '\\d(?:\\.\\d)?\\s*(?:-\\s*)?';
  const ratingWord = '(?:four|five|apat|lima)\\s+';
  const ratingNoun = '(star|stars|bituin)\\b';
  if (new RegExp('\\b' + ratingDigit + ratingNoun, 'i').test(all)
      || new RegExp('\\b' + ratingWord + ratingNoun, 'i').test(all)
      || /\b\d(\.\d)?\s*\/\s*5\b/.test(all)) {
    reasons.push('Fabricated star rating.');
  }

  // 8. forbidden product claims
  if (/\biphone\b|\bios\b|\bapple\b/i.test(all)) reasons.push('Forbidden claim: iPhone or iOS support.');
  if (/typhoon warning|babala sa bagyo|bagyo alert/i.test(all)) reasons.push('Forbidden claim: typhoon warnings.');
  if (/\bbfar\b|government[- ]approved|endorsed by the government|aprubado ng gobyerno/i.test(all)) {
    reasons.push('Forbidden claim: government or BFAR endorsement.');
  }
  if (/track(ing)? (the )?(other|ibang) (boats?|bangka)/i.test(all)) {
    reasons.push('Forbidden claim: live tracking of other boats.');
  }

  // 9. price
  const priceHits = [];
  let m;
  const rx1 = /(?:₱|PHP|Php|php)\s*([\d,]+)/g;
  while ((m = rx1.exec(all)) !== null) priceHits.push(m[1]);
  const rx2 = /([\d,]+)\s*(?:pesos?|piso)\b/gi;
  while ((m = rx2.exec(all)) !== null) priceHits.push(m[1]);
  // Bare "P" shorthand (e.g. "P999") — the informal peso notation this
  // audience actually writes. \bP requires the P itself to start a word, so
  // this does not also fire on the "P" inside "PHP" (no boundary before it).
  const rx3 = /\bP\s?(\d[\d,]*)\b/g;
  while ((m = rx3.exec(all)) !== null) priceHits.push(m[1]);
  priceHits.forEach((raw) => {
    const n = parseInt(String(raw).replace(/,/g, ''), 10);
    if (!isNaN(n) && n !== price) reasons.push('Wrong price: ' + raw + '. The only allowed figure is ' + price + '.');
  });

  return { valid: reasons.length === 0, reasons };
}

if (typeof module !== 'undefined') module.exports = { validateCopy, OK_ACRONYMS };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test.js --only=copy
```

Expected: all copy checks pass. If the "allows one all-caps word" or acronym checks fail, the acronym scrub in rule 6 is the place to adjust — do not weaken the shouting rule itself.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): deterministic copy validation rules"
```

---

## Task 3: Image prompt builder and image validation

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/lib/image-rules.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append an `image` section)

**Interfaces:**
- Consumes: nothing from earlier tasks; the caller passes the copy object and pillar.
- Produces:
  - `buildImagePrompt(copy, pillar) -> string`
  - `aspectFor(pillar) -> '1:1' | '4:5'`
  - `readImageSize(buf) -> { width, height, type } | null` (PNG, JPEG, and WebP: VP8/VP8L/VP8X)
  - `validateImage({ b64, mime }, opts) -> { valid, reasons, bytes, width, height, aspect }`
    with `opts` `{ minBytes: number }`, default 20480.
- Test tags: `--only=image`

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block:

```js
// ---------------------------------------------------------------- image rules
section('image', 'Image prompt and validation', () => {
  const I = L('image-rules.js');

  const copy = {
    headline: 'Nawala ang signal? Gumagana pa rin',
    image_prompt: 'A Filipino bangka with outriggers at dawn, wide empty sky on the upper third.',
  };
  const p = I.buildImagePrompt(copy, 'feature spotlight');

  check('prompt carries the scene', p.includes('bangka with outriggers'));
  check('prompt carries the exact headline verbatim', p.includes(copy.headline));
  check('prompt demands exact spelling', /character for character|exactly as written/i.test(p));
  check('prompt sets the documentary style suffix', /documentary/i.test(p));
  check('prompt sets the palette', /navy/i.test(p) && /gold/i.test(p));
  check('prompt reserves negative space', /negative space/i.test(p));
  ['watermark', 'user interface', 'extra fingers', 'yacht', 'poverty', 'distress']
    .forEach(n => check('prompt negates: ' + n, new RegExp(n, 'i').test(p)));

  check('fish fact posts are square', I.aspectFor('fish fact') === '1:1');
  check('other pillars are 4:5', I.aspectFor('feature spotlight') === '4:5');

  // 1x1 PNG and a minimal JPEG, dimensions read straight from the byte headers
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const pngSize = I.readImageSize(png);
  check('reads PNG dimensions', pngSize && pngSize.width === 1 && pngSize.height === 1 && pngSize.type === 'png');

  const jpg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03, 0x01, 0x22, 0x00,
    0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  const jpgSize = I.readImageSize(jpg);
  check('reads JPEG dimensions', jpgSize && jpgSize.width === 1080 && jpgSize.height === 1350 && jpgSize.type === 'jpeg');
  check('returns null for non-image bytes', I.readImageSize(Buffer.from('not an image')) === null);

  // ---- WebP: three FourCC variants, each with a different dimension encoding
  const buildVP8 = (width, height) => {
    const b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii');
    b.writeUInt32LE(18, 4);
    b.write('WEBP', 8, 'ascii');
    b.write('VP8 ', 12, 'ascii');
    b.writeUInt32LE(10, 16);
    b[20] = 0x00; b[21] = 0x00; b[22] = 0x00;
    b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a;
    b.writeUInt16LE(width & 0x3FFF, 26);
    b.writeUInt16LE(height & 0x3FFF, 28);
    return b;
  };
  const buildVP8L = (width, height) => {
    const b = Buffer.alloc(26);
    b.write('RIFF', 0, 'ascii');
    b.writeUInt32LE(14, 4);
    b.write('WEBP', 8, 'ascii');
    b.write('VP8L', 12, 'ascii');
    b.writeUInt32LE(9, 16);
    b[20] = 0x2f;
    const packed = (((height - 1) << 14) | (width - 1)) >>> 0;
    b.writeUInt32LE(packed, 21);
    return b;
  };
  const buildVP8X = (width, height) => {
    const b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii');
    b.writeUInt32LE(22, 4);
    b.write('WEBP', 8, 'ascii');
    b.write('VP8X', 12, 'ascii');
    b.writeUInt32LE(10, 16);
    b[20] = 0x00; b[21] = 0x00; b[22] = 0x00; b[23] = 0x00;
    const w = width - 1, h = height - 1;
    b[24] = w & 0xFF; b[25] = (w >> 8) & 0xFF; b[26] = (w >> 16) & 0xFF;
    b[27] = h & 0xFF; b[28] = (h >> 8) & 0xFF; b[29] = (h >> 16) & 0xFF;
    return b;
  };

  const vp8Size = I.readImageSize(buildVP8(640, 480));
  check('reads WebP VP8 (lossy) dimensions', vp8Size && vp8Size.width === 640 && vp8Size.height === 480 && vp8Size.type === 'webp');
  const vp8lSize = I.readImageSize(buildVP8L(400, 300));
  check('reads WebP VP8L (lossless) dimensions', vp8lSize && vp8lSize.width === 400 && vp8lSize.height === 300 && vp8lSize.type === 'webp');
  const vp8xSize = I.readImageSize(buildVP8X(1024, 768));
  check('reads WebP VP8X (extended) dimensions', vp8xSize && vp8xSize.width === 1024 && vp8xSize.height === 768 && vp8xSize.type === 'webp');

  const truncatedWebp = buildVP8(640, 480).subarray(0, 26);
  check('returns null for a truncated WebP', I.readImageSize(truncatedWebp) === null);
  const riffNotWebp = Buffer.alloc(30);
  riffNotWebp.write('RIFF', 0, 'ascii');
  riffNotWebp.write('AVI ', 8, 'ascii');
  check('returns null for RIFF bytes that are not WEBP', I.readImageSize(riffNotWebp) === null);

  const big = Buffer.concat([png, Buffer.alloc(30000)]).toString('base64');
  const okRes = I.validateImage({ b64: big, mime: 'image/png' }, { minBytes: 20480 });
  check('accepts a large enough PNG', okRes.valid === true);
  check('reports the decoded byte count', okRes.bytes > 20480);
  check('validateImage returns the exact PNG width through the real call path', okRes.width === 1);
  check('validateImage returns the exact PNG height through the real call path', okRes.height === 1);
  check('validateImage returns the exact PNG aspect through the real call path', okRes.aspect === '1:1');

  const bigJpg = Buffer.concat([jpg, Buffer.alloc(30000)]).toString('base64');
  const jpgRes = I.validateImage({ b64: bigJpg, mime: 'image/jpeg' }, { minBytes: 20480 });
  check('validateImage returns the exact JPEG width through the real call path', jpgRes.width === 1080);
  check('validateImage returns the exact JPEG height through the real call path', jpgRes.height === 1350);
  check('validateImage returns the exact JPEG aspect through the real call path', jpgRes.aspect === '4:5');

  const noRes = I.validateImage({ b64: '', mime: 'image/png' }, {});
  check('rejects an empty payload', noRes.valid === false && /no image/i.test(noRes.reasons[0]));
  const smallRes = I.validateImage({ b64: png.toString('base64'), mime: 'image/png' }, { minBytes: 20480 });
  check('rejects an undersized payload', smallRes.valid === false && /too small/i.test(smallRes.reasons.join(' ')));
  const mimeRes = I.validateImage({ b64: big, mime: 'text/plain' }, {});
  check('rejects a non-image mime type', mimeRes.valid === false && /mime/i.test(mimeRes.reasons.join(' ')));
  check('records the observed aspect for the attempts log', /^\d+:\d+$|^unknown$/.test(String(okRes.aspect)));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=image
```

Expected: `Cannot find module '.../lib/image-rules.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/image-rules.js`. Note the deliberate design choice: dimensions are read from the returned bytes rather than assumed from the request, so a model that ignores the requested aspect ratio degrades to a logged observation instead of a broken build.

```js
// ============================================================================
// Image prompt construction and response validation.
// The headline is rendered BY the image model (owner decision, 2026-09-10),
// so the prompt carries the exact string and strict spelling instructions.
// Garbled text is caught by the human approval gate, not by code.
// Pure: no n8n globals, no requires.
// ============================================================================

const STYLE_SUFFIX = 'photographic, natural Philippine coastal light, documentary style, '
  + 'deep navy and warm gold palette, weathered wood and white foam accents, single clear subject, '
  + 'generous negative space in the upper third';

const NEGATIVES = [
  'no watermark', 'no logo', 'no app screenshot', 'no user interface', 'no extra fingers',
  'no deformed hands', 'no western yacht', 'no western fishing rods on a commercial bangka',
  'no impossible boat shapes', 'no exaggerated poverty imagery', 'no comedic or pitiful framing',
  'no imagery that reads as a real distress event or a real accident', 'no floating objects',
];

function aspectFor(pillar) {
  return String(pillar || '').toLowerCase() === 'fish fact' ? '1:1' : '4:5';
}

function buildImagePrompt(copy, pillar) {
  const c = copy || {};
  const headline = String(c.headline || '').trim();
  return [
    String(c.image_prompt || '').trim(),
    '',
    'Render this exact headline text into the reserved negative space, character for character, '
      + 'spelled exactly as written, on one or two lines, in a bold clean sans-serif with high contrast '
      + 'against the background: "' + headline + '"',
    'Do not add, translate, correct, or invent any other text anywhere in the image.',
    '',
    'Style: ' + STYLE_SUFFIX + '.',
    'Composition: ' + (aspectFor(pillar) === '1:1' ? 'square framing' : 'vertical 4:5 framing') + '.',
    'Avoid: ' + NEGATIVES.join(', ') + '.',
  ].join('\n');
}

function readImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }
  // JPEG: walk the marker segments to the first SOF (0xC0-0xCF, excluding C4/C8/CC)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpeg' };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // WebP: 'RIFF' .... 'WEBP', then a FourCC-specific chunk carries the dimensions.
  // Guard every read with a length check and return null on anything short or
  // malformed, same as the PNG and JPEG paths above -- never throw.
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
      if (buf.length < 30 || buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF, type: 'webp' };
    }
    if (fourcc === 'VP8L') {
      if (buf.length < 25 || buf[20] !== 0x2f) return null;
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1, type: 'webp' };
    }
    if (fourcc === 'VP8X') {
      if (buf.length < 30) return null;
      const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width, height, type: 'webp' };
    }
    return null;
  }
  return null;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function validateImage(input, opts) {
  const o = opts || {};
  const minBytes = o.minBytes || 20480;
  const reasons = [];
  const b64 = String((input && input.b64) || '');
  const mime = String((input && input.mime) || '').toLowerCase();

  if (!b64) {
    return { valid: false, reasons: ['No image returned by the model.'], bytes: 0, width: 0, height: 0, aspect: 'unknown' };
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(mime)) reasons.push('Unexpected mime type: ' + (mime || 'none'));

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < minBytes) reasons.push('Image too small (' + buf.length + ' bytes, minimum ' + minBytes + '). Likely a truncated or blank generation.');

  const size = readImageSize(buf);
  let aspect = 'unknown';
  if (size && size.width && size.height) {
    const g = gcd(size.width, size.height) || 1;
    aspect = (size.width / g) + ':' + (size.height / g);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    bytes: buf.length,
    width: size ? size.width : 0,
    height: size ? size.height : 0,
    aspect,
  };
}

if (typeof module !== 'undefined') module.exports = { buildImagePrompt, aspectFor, readImageSize, validateImage, STYLE_SUFFIX, NEGATIVES };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test.js --only=image
```

Expected: all image checks pass.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): image prompt builder and byte-level image validation"
```

---

## Task 4: Approval routing and loop counters

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/lib/flow-rules.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append a `flow` section)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `normalizeDecision(payload) -> 'approve'|'copy'|'image'|'both'|'timeout'|'unknown'`
    Walks every string value at any depth, so it does not depend on the Slack `customForm` field naming. This is deliberate: it removes spec §16 open item 2.
  - `extractReason(payload) -> string`
  - `loopGuard(state, cfg) -> { action, attempt, copy_retry, status, message, revision_note }`
    where `action` is `'publish'|'reinvoke'|'needs_manual'|'expired'`,
    `state` is `{ decision, attempt, copy_retry, reason, row_id }`,
    `cfg` is `{ maxAttempts: number, maxCopyRetries: number }`.
- Test tags: `--only=flow`

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block:

```js
// ---------------------------------------------------------------- flow rules
section('flow', 'Decision routing and loop counters', () => {
  const F = L('flow-rules.js');
  const CFG = { maxAttempts: 3, maxCopyRetries: 1 };

  // shape-agnostic: any field name, any nesting depth
  check('approve, flat', F.normalizeDecision({ Decision: 'Approve' }) === 'approve');
  check('approve, nested under data', F.normalizeDecision({ data: { Decision: 'Approve' } }) === 'approve');
  check('approve, lowercase field', F.normalizeDecision({ decision: 'approve' }) === 'approve');
  check('approve, unknown field name', F.normalizeDecision({ field_0: 'Approve' }) === 'approve');
  check('regen copy', F.normalizeDecision({ data: { Decision: 'Regenerate copy' } }) === 'copy');
  check('regen image', F.normalizeDecision({ data: { Decision: 'Regenerate image' } }) === 'image');
  check('regen both', F.normalizeDecision({ data: { Decision: 'Regenerate both' } }) === 'both');
  check('both wins over copy when both words appear',
    F.normalizeDecision({ d: 'Regenerate both' }) === 'both');
  check('timeout from the n8n approval shape', F.normalizeDecision({ data: { approved: false }, timeout: true }) === 'timeout');
  check('legacy approved:true still means approve', F.normalizeDecision({ data: { approved: true } }) === 'approve');
  check('empty payload is unknown', F.normalizeDecision({}) === 'unknown');
  check('null payload is unknown', F.normalizeDecision(null) === 'unknown');

  // a reviewer's free-text reason must never hijack routing away from an explicit decision
  check('approve survives a reason mentioning rewrite',
    F.normalizeDecision({ Decision: 'Approve', Reason: 'please rewrite the CTA next time' }) === 'approve');
  check('approve survives a reason mentioning copy and approve',
    F.normalizeDecision({ Decision: 'Approve', Reason: 'love the new copy on this one, approve' }) === 'approve');
  check('approve survives a reason mentioning both and approved',
    F.normalizeDecision({ Decision: 'Approve', Reason: 'both photos look great, approved' }) === 'approve');
  check('approve survives a reason mentioning image',
    F.normalizeDecision({ Decision: 'Approve', Reason: 'the new image is perfect' }) === 'approve');
  check('regenerate copy survives a reason mentioning both',
    F.normalizeDecision({ Decision: 'Regenerate copy', Reason: 'both the tone and the length are off' }) === 'copy');

  check('extracts a typed reason', F.extractReason({ data: { Decision: 'Regenerate image', Reason: 'headline garbled' } }) === 'headline garbled');
  check('missing reason is an empty string', F.extractReason({ data: { Decision: 'Approve' } }) === '');
  check('extracts a reason nested two levels deep',
    F.extractReason({ data: { inner: { Reason: 'too salesy' } } }) === 'too salesy');
  check('extracts a reason nested three levels deep',
    F.extractReason({ data: { inner: { deeper: { Reason: 'too salesy' } } } }) === 'too salesy');

  const g = (s) => F.loopGuard(Object.assign({ decision: 'copy', attempt: 1, copy_retry: 0, reason: 'r', row_id: 'FP-001' }, s), CFG);

  check('approve publishes', g({ decision: 'approve' }).action === 'publish');
  check('timeout expires', g({ decision: 'timeout' }).action === 'expired');
  check('timeout sets the expired status', g({ decision: 'timeout' }).status === 'expired');
  check('regen re-invokes', g({}).action === 'reinvoke');
  check('regen increments attempt', g({ attempt: 1 }).attempt === 2);
  check('regen does not touch copy_retry', g({ attempt: 1, copy_retry: 0 }).copy_retry === 0);
  check('attempt 3 still re-invokes', g({ attempt: 3 }).action === 'reinvoke');
  check('attempt 4 stops', g({ attempt: 4 }).action === 'needs_manual');
  check('attempt 4 sets needs_manual', g({ attempt: 4 }).status === 'needs_manual');
  check('stop message names the row', /FP-001/.test(g({ attempt: 4 }).message));
  check('stop message names 3 attempts', /3 attempts/.test(g({ attempt: 4 }).message));
  check('reason becomes the revision note', g({ reason: 'too salesy' }).revision_note === 'too salesy');

  // machine copy-validation retry is a SEPARATE budget from the human loop
  const v = (s) => F.loopGuard(Object.assign({ decision: 'copy_invalid', attempt: 1, copy_retry: 0, reason: 'em dash', row_id: 'FP-001' }, s), CFG);
  check('first invalid copy re-invokes', v({}).action === 'reinvoke');
  check('invalid copy increments copy_retry', v({ copy_retry: 0 }).copy_retry === 1);
  check('invalid copy does NOT increment attempt', v({ attempt: 2, copy_retry: 0 }).attempt === 2);
  check('second invalid copy stops', v({ copy_retry: 1 }).action === 'needs_manual');
  check('copy_retry exhaustion is not a human rejection',
    /validation/i.test(v({ copy_retry: 1 }).message));
  check('human regen resets copy_retry', g({ attempt: 1, copy_retry: 1 }).copy_retry === 0);

  // the failure count in the stop message must track maxCopyRetries, not be hardcoded
  const CFG2 = { maxAttempts: 3, maxCopyRetries: 2 };
  const v2 = F.loopGuard(
    { decision: 'copy_invalid', attempt: 1, copy_retry: 2, reason: 'em dash', row_id: 'FP-001' },
    CFG2
  );
  check('stop message derives the failure count from maxCopyRetries', /3 times/.test(v2.message));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=flow
```

Expected: `Cannot find module '.../lib/flow-rules.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/flow-rules.js`:

```js
// ============================================================================
// Approval routing + the two independent retry budgets.
//
// normalizeDecision is deliberately shape-agnostic: it scans every string in
// the payload at any depth. n8n's Slack sendAndWait customForm keys its output
// by the form field LABEL, which differs across n8n versions and would silently
// break a key-path lookup. Scanning removes that dependency entirely.
//
// Two separate budgets, by design:
//   attempt     the human review loop, max 3, then needs_manual
//   copy_retry  the machine copy-validation retry, max 1, then needs_manual
// A banned word must never consume one of the reviewer's three attempts.
// Pure: no n8n globals, no requires.
// ============================================================================

function collectStrings(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectStrings(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => { out.push(k); collectStrings(obj[k], out, depth + 1); });
  }
  return out;
}

// Values only (no keys) — feeds the decisive exact-match pass. A reviewer's
// free-text reason is prose, not a dropdown selection, so it will almost
// never equality-match a canonical decision string even though it may
// contain the words "copy"/"image"/"both"/"approve" in an ordinary sentence.
function collectValues(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectValues(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => collectValues(obj[k], out, depth + 1));
  }
  return out;
}

// Same as collectStrings, but does not descend into (or push the values of)
// any key that looks like a free-text reason/note/comment field. Keys
// themselves are still pushed — the n8n {data:{approved:true}} shape depends
// on the literal key "approved" being visible to the fuzzy scan.
function collectFuzzyHaystack(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectFuzzyHaystack(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => {
      out.push(k);
      if (/reason|note|comment|why|feedback/i.test(k)) return; // exclude prose from the fuzzy scan
      collectFuzzyHaystack(obj[k], out, depth + 1);
    });
  }
  return out;
}

function normalizeValue(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Canonical dropdown strings -> decision. Exact-match only: this is what
// makes pass 1 decisive rather than fuzzy.
const EXACT_DECISIONS = {
  approve: 'approve',
  'regenerate copy': 'copy',
  'regenerate image': 'image',
  'regenerate both': 'both',
};

function normalizeDecision(payload) {
  if (!payload) return 'unknown';
  if (payload.timeout === true) return 'timeout';

  // Pass 1 (decisive): an exact-match VALUE beats any amount of surrounding
  // prose. This still works when the field is named field_0 or anything
  // else, because it matches on the VALUE, not the key — so it stays
  // shape-agnostic. Only fires when exactly one distinct decision is found;
  // ambiguous or absent exact matches fall through to the fuzzy scan.
  const exactMatches = new Set();
  collectValues(payload).forEach((v) => {
    const norm = normalizeValue(v);
    if (Object.prototype.hasOwnProperty.call(EXACT_DECISIONS, norm)) {
      exactMatches.add(EXACT_DECISIONS[norm]);
    }
  });
  if (exactMatches.size === 1) {
    const only = exactMatches.values().next().value;
    if (only === 'approve' && payload.data && payload.data.approved === false) return 'timeout';
    return only;
  }

  // Pass 2 (fallback fuzzy scan): only reached when pass 1 found nothing
  // decisive. Excludes reason/note/comment-keyed prose from the haystack so
  // a rejection's free-text explanation can't be mistaken for the decision.
  const hay = collectFuzzyHaystack(payload).join(' | ').toLowerCase();

  // order matters: "both" before "copy"/"image", since the label contains neither alone
  if (/regenerate both|regen both|\bboth\b/.test(hay)) return 'both';
  if (/regenerate copy|regen copy|new copy|rewrite/.test(hay)) return 'copy';
  if (/regenerate image|regen image|new image/.test(hay)) return 'image';
  if (/\bapprove\b|\bapproved\b|\bpublish\b/.test(hay)) {
    // guard against the literal false value of n8n's approval shape
    if (payload.data && payload.data.approved === false) return 'timeout';
    return 'approve';
  }
  if (payload.data && payload.data.approved === true) return 'approve';
  if (payload.data && payload.data.approved === false) return 'timeout';
  return 'unknown';
}

// Walks the payload at any depth (same bounded-depth traversal as
// collectStrings) and returns the first non-empty string value whose key
// looks like a free-text reason/note/comment field. Checks every key at the
// current level before descending, so a reason at a shallower level wins
// over one further down.
function findReason(obj, depth) {
  depth = depth || 0;
  if (obj == null || depth > 6 || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = findReason(obj[i], depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (/reason|note|comment|why|feedback/i.test(k) && typeof v === 'string' && v.trim() !== '') {
      return v.trim();
    }
  }
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v && typeof v === 'object') {
      const found = findReason(v, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function extractReason(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return findReason(payload, 0) || '';
}

function loopGuard(state, cfg) {
  const s = state || {};
  const c = cfg || {};
  const maxAttempts = Number(c.maxAttempts || 3);
  const maxCopyRetries = Number(c.maxCopyRetries || 1);
  const decision = String(s.decision || 'unknown');
  const attempt = Number(s.attempt || 1);
  const copyRetry = Number(s.copy_retry || 0);
  const reason = String(s.reason || '').trim();
  const rowId = String(s.row_id || '');

  if (decision === 'approve') {
    return { action: 'publish', attempt, copy_retry: copyRetry, status: 'posted', message: '', revision_note: '' };
  }
  if (decision === 'timeout') {
    return {
      action: 'expired', attempt, copy_retry: copyRetry, status: 'expired',
      message: 'Review timed out with no response. Nothing was posted. Row id ' + rowId + '.',
      revision_note: '',
    };
  }

  // machine retry after failed copy validation — its own budget
  if (decision === 'copy_invalid') {
    if (copyRetry >= maxCopyRetries) {
      return {
        action: 'needs_manual', attempt, copy_retry: copyRetry, status: 'needs_manual',
        message: 'Copy validation failed ' + (maxCopyRetries + 1) + ' times, needs a human. Row id ' + rowId + '. Last reason: ' + reason,
        revision_note: reason,
      };
    }
    return { action: 'reinvoke', attempt, copy_retry: copyRetry + 1, status: 'in_review', message: '', revision_note: reason };
  }

  // human rejection — copy, image, both, or an unrecognised response
  if (attempt > maxAttempts) {
    return {
      action: 'needs_manual', attempt, copy_retry: 0, status: 'needs_manual',
      message: maxAttempts + ' attempts rejected, needs a human. Row id ' + rowId + '.',
      revision_note: reason,
    };
  }
  return { action: 'reinvoke', attempt: attempt + 1, copy_retry: 0, status: 'in_review', message: '', revision_note: reason };
}

if (typeof module !== 'undefined') module.exports = { normalizeDecision, extractReason, loopGuard, collectStrings };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test.js --only=flow
```

Expected: all flow checks pass.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): shape-agnostic decision routing and dual retry budgets"
```

---

## Task 5: Sheet row selection, shaping, and metric mapping

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/lib/sheet-rules.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append a `sheet` section)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `QUEUE_HEADERS: string[]` (16 columns, spec §4 order)
  - `ATTEMPT_HEADERS: string[]` (9 columns)
  - `selectRow(rows, rowId) -> row | null` — a specific id on loop re-entry, else the first `ready`
  - `selectDueRows(rows, nowMs, delayHours) -> row[]`
  - `buildAttemptRow(ctx) -> object`
  - `buildQueueUpdate(ctx) -> object`
  - `mapMetrics(insights, engagement) -> { reach, likes, comments, shares }`
- Test tags: `--only=sheet`

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block:

```js
// ---------------------------------------------------------------- sheet rules
section('sheet', 'Queue selection, row shaping, metric mapping', () => {
  const S = L('sheet-rules.js');

  check('queue has 16 columns', S.QUEUE_HEADERS.length === 16);
  check('queue starts with id', S.QUEUE_HEADERS[0] === 'id');
  check('queue includes every workflow-written column',
    ['status', 'caption', 'image_url', 'fb_post_id', 'posted_at', 'likes', 'comments', 'shares', 'reach']
      .every(c => S.QUEUE_HEADERS.includes(c)));
  check('attempts has 9 columns', S.ATTEMPT_HEADERS.length === 9);

  const rows = [
    { id: 'FP-001', status: 'posted' },
    { id: 'FP-002', status: 'in_review' },
    { id: 'FP-003', status: 'ready' },
    { id: 'FP-004', status: 'ready' },
    { id: 'FP-005', status: 'blocked_needs_asset' },
  ];
  check('picks the first ready row', S.selectRow(rows, '').id === 'FP-003');
  check('never picks in_review', S.selectRow(rows, '').status === 'ready');
  check('re-entry picks the named row regardless of status', S.selectRow(rows, 'FP-002').id === 'FP-002');
  check('re-entry with an unknown id returns null', S.selectRow(rows, 'FP-999') === null);
  check('no ready rows returns null', S.selectRow([{ id: 'x', status: 'posted' }], '') === null);
  check('blocked rows are never selected', S.selectRow([rows[4]], '') === null);

  const now = Date.parse('2026-09-10T12:00:00Z');
  const due = [
    { id: 'A', status: 'posted', posted_at: '2026-09-09T00:00:00Z', reach: '' },
    { id: 'B', status: 'posted', posted_at: '2026-09-10T11:00:00Z', reach: '' },
    { id: 'C', status: 'posted', posted_at: '2026-09-08T00:00:00Z', reach: '412' },
    { id: 'D', status: 'measured', posted_at: '2026-09-01T00:00:00Z', reach: '' },
    { id: 'E', status: 'posted', posted_at: '', reach: '' },
  ];
  const sel = S.selectDueRows(due, now, 24).map(r => r.id);
  check('selects a post older than 24h with no reach', sel.includes('A'));
  check('skips a post younger than 24h', !sel.includes('B'));
  check('skips a post that already has reach', !sel.includes('C'));
  check('skips a row already measured', !sel.includes('D'));
  check('skips a row with no posted_at', !sel.includes('E'));
  check('selects exactly one row here', sel.length === 1);

  const att = S.buildAttemptRow({
    row_id: 'FP-003', attempt: 2, pillar: 'safety', headline: 'H', caption: 'C',
    image_url: 'https://cdn/x.jpg', decision: 'image', revision_note: 'too dark',
  });
  check('attempt row has a timestamp', /^\d{4}-\d{2}-\d{2}T/.test(att.ts));
  check('attempt row keeps the decision', att.decision === 'image');
  check('attempt row keeps the note', att.revision_note === 'too dark');
  check('attempt row keys match the headers', S.ATTEMPT_HEADERS.every(h => h in att));

  const upd = S.buildQueueUpdate({
    id: 'FP-003', status: 'posted', caption: 'C', image_url: 'https://cdn/x.jpg', fb_post_id: '123_456',
  });
  check('queue update carries the row id', upd.id === 'FP-003');
  check('queue update stamps posted_at', /^\d{4}-\d{2}-\d{2}T/.test(upd.posted_at));
  check('queue update carries the post id', upd.fb_post_id === '123_456');
  check('non-posted updates do not stamp posted_at',
    S.buildQueueUpdate({ id: 'FP-003', status: 'expired' }).posted_at === '');

  const insights = { data: [
    { name: 'post_impressions', values: [{ value: 1820 }] },
    { name: 'post_engaged_users', values: [{ value: 96 }] },
    { name: 'post_reactions_by_type_total', values: [{ value: { like: 40, love: 7, wow: 3 } }] },
  ] };
  const engagement = { comments: { summary: { total_count: 12 } }, shares: { count: 5 },
    reactions: { summary: { total_count: 50 } } };
  const m = S.mapMetrics(insights, engagement);
  check('reach comes from impressions', m.reach === 1820);
  check('likes prefer the reactions summary', m.likes === 50);
  check('comments come from the summary', m.comments === 12);
  check('shares come from the share count', m.shares === 5);

  const partial = S.mapMetrics({ data: [] }, {});
  check('missing metrics degrade to zero, not NaN', partial.reach === 0 && partial.likes === 0);
  check('missing shares degrade to zero', partial.shares === 0 && partial.comments === 0);
  const noSummary = S.mapMetrics(insights, { shares: { count: 2 } });
  check('falls back to summing reaction types', noSummary.likes === 50);

  // CRITICAL 1 regression: reactions.summary.total_count must be guarded like every
  // sibling path (comments/shares/byType all use `Number(x) || 0`). typeof NaN === 'number'
  // so the old code let NaN/Infinity through with no fallback.
  const nanLikes = S.mapMetrics({ data: [] }, { reactions: { summary: { total_count: NaN } } });
  check('NaN total_count degrades to zero likes', nanLikes.likes === 0);
  const infLikes = S.mapMetrics({ data: [] }, { reactions: { summary: { total_count: Infinity } } });
  check('Infinity total_count degrades to zero likes', infLikes.likes === 0);
  const normalLikes = S.mapMetrics({ data: [] }, { reactions: { summary: { total_count: 50 } } });
  check('a normal numeric total_count still yields the value', normalLikes.likes === 50);
  const strLikes = S.mapMetrics(insights, { reactions: { summary: { total_count: 'lots' } } });
  check('a non-numeric total_count falls through to the byType sum', strLikes.likes === 50);

  // IMPORTANT 2 regression: a genuinely-zero-reach post (numeric 0) must count as
  // measured, not as "not yet measured". `0 || ''` is `''`, which was the bug.
  const reachRows = [
    { id: 'num-zero', status: 'posted', posted_at: '2026-09-01T00:00:00Z', reach: 0 },
    { id: 'str-zero', status: 'posted', posted_at: '2026-09-01T00:00:00Z', reach: '0' },
    { id: 'null-reach', status: 'posted', posted_at: '2026-09-01T00:00:00Z', reach: null },
    { id: 'undef-reach', status: 'posted', posted_at: '2026-09-01T00:00:00Z' },
    { id: 'empty-reach', status: 'posted', posted_at: '2026-09-01T00:00:00Z', reach: '' },
    { id: 'num-reach', status: 'posted', posted_at: '2026-09-01T00:00:00Z', reach: 412 },
  ];
  const reachSel = S.selectDueRows(reachRows, now, 24).map(r => r.id);
  check('numeric zero reach is not re-selected', !reachSel.includes('num-zero'));
  check('string zero reach is not re-selected', !reachSel.includes('str-zero'));
  check('null reach is selected', reachSel.includes('null-reach'));
  check('missing reach key is selected', reachSel.includes('undef-reach'));
  check('empty-string reach is selected', reachSel.includes('empty-reach'));
  check('a real numeric reach value is not re-selected', !reachSel.includes('num-reach'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=sheet
```

Expected: `Cannot find module '.../lib/sheet-rules.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/sheet-rules.js`:

```js
// ============================================================================
// Google Sheet row selection and shaping, plus Graph metric mapping.
// Pure: no n8n globals, no requires.
// ============================================================================

const QUEUE_HEADERS = [
  'id', 'pillar', 'topic', 'key_message', 'cta', 'notes', 'status', 'scheduled_for',
  'caption', 'image_url', 'fb_post_id', 'posted_at', 'likes', 'comments', 'shares', 'reach',
];

const ATTEMPT_HEADERS = [
  'ts', 'row_id', 'attempt', 'pillar', 'headline', 'caption', 'image_url', 'decision', 'revision_note',
];

// Only 'ready' enters rotation. Everything else is either mid-flight (in_review)
// or terminal, and only a human returning a row to 'ready' puts it back.
function selectRow(rows, rowId) {
  const list = Array.isArray(rows) ? rows : [];
  if (rowId) return list.find((r) => String(r.id) === String(rowId)) || null;
  return list.find((r) => String(r.status || '').trim().toLowerCase() === 'ready') || null;
}

function selectDueRows(rows, nowMs, delayHours) {
  const list = Array.isArray(rows) ? rows : [];
  const cutoff = Number(nowMs) - Number(delayHours || 24) * 3600 * 1000;
  return list.filter((r) => {
    if (String(r.status || '').toLowerCase() !== 'posted') return false;
    // Numeric 0 is a real measured value (a post nobody saw), not "unmeasured".
    // `String(r.reach || '')` would coerce 0 to '' via the `||` and re-select it forever.
    const reach = r.reach;
    if (reach !== null && reach !== undefined && String(reach).trim() !== '') return false;
    const t = Date.parse(String(r.posted_at || ''));
    if (isNaN(t)) return false;
    return t <= cutoff;
  });
}

function buildAttemptRow(ctx) {
  const c = ctx || {};
  return {
    ts: new Date().toISOString(),
    row_id: String(c.row_id || ''),
    attempt: Number(c.attempt || 1),
    pillar: String(c.pillar || ''),
    headline: String(c.headline || ''),
    caption: String(c.caption || ''),
    image_url: String(c.image_url || ''),
    decision: String(c.decision || ''),
    revision_note: String(c.revision_note || ''),
  };
}

function buildQueueUpdate(ctx) {
  const c = ctx || {};
  const status = String(c.status || '');
  return {
    id: String(c.id || ''),
    status,
    caption: String(c.caption || ''),
    image_url: String(c.image_url || ''),
    fb_post_id: String(c.fb_post_id || ''),
    posted_at: status === 'posted' ? new Date().toISOString() : '',
  };
}

function mapMetrics(insights, engagement) {
  const data = (insights && Array.isArray(insights.data)) ? insights.data : [];
  const pick = (name) => {
    const row = data.find((d) => d.name === name);
    if (!row || !Array.isArray(row.values) || !row.values.length) return null;
    return row.values[0].value;
  };

  const reach = Number(pick('post_impressions')) || 0;

  let likes = 0;
  const e = engagement || {};
  if (e.reactions && e.reactions.summary && typeof e.reactions.summary.total_count === 'number') {
    // Guard like every sibling path below: typeof NaN === 'number' and typeof
    // Infinity === 'number', so a bare assignment here would let a non-finite
    // value through with no fallback to 0. `Number(x) || 0` still fails on
    // Infinity (Infinity is truthy), so this needs an explicit finite check.
    const tc = e.reactions.summary.total_count;
    likes = Number.isFinite(tc) ? tc : 0;
  } else {
    const byType = pick('post_reactions_by_type_total');
    if (byType && typeof byType === 'object') {
      likes = Object.keys(byType).reduce((a, k) => a + (Number(byType[k]) || 0), 0);
    }
  }

  const comments = (e.comments && e.comments.summary && Number(e.comments.summary.total_count)) || 0;
  const shares = (e.shares && Number(e.shares.count)) || 0;

  return { reach, likes, comments, shares };
}

if (typeof module !== 'undefined') {
  module.exports = { QUEUE_HEADERS, ATTEMPT_HEADERS, selectRow, selectDueRows, buildAttemptRow, buildQueueUpdate, mapMetrics };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test.js --only=sheet
```

Expected: all sheet checks pass. Note the "falls back to summing reaction types" check expects `50` because the sample `by_type` totals 40 + 7 + 3.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): sheet row selection, shaping, and Graph metric mapping"
```

---

## Task 6: n8n glue files and the main workflow build

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/nodes/*.js` (9 files, listed in File Structure)
- Create: `n8n-control/builds/06-fishpin-fb-ads/build.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append a `workflow` section)

**Interfaces:**
- Consumes: every lib from Tasks 1–5, inlined verbatim by `build.js`.
- Produces: `fishpin-fb-ads.workflow.json` — a deployable n8n workflow.
- Test tags: `--only=workflow`

**Key mechanic:** `build.js` concatenates `lib/*.js` files (verbatim, exports are inert in n8n because `module` is undefined there) followed by the glue file. Glue files therefore call lib functions directly and never `require`.

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block. These are structural assertions on the generated JSON, the same style as `builds/reel-knitted-doll/test.js`.

```js
// ---------------------------------------------------------------- workflow
section('workflow', 'Main workflow structure', () => {
  const fs = require('fs');
  const wfPath = path.join(__dirname, 'fishpin-fb-ads.workflow.json');
  if (!fs.existsSync(wfPath)) { check('fishpin-fb-ads.workflow.json exists (run: node build.js)', false); return; }
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const byName = {}; wf.nodes.forEach(n => { byName[n.name] = n; });
  const has = (n) => Object.prototype.hasOwnProperty.call(byName, n);

  check('workflow is named', /FishPin/.test(wf.name));
  check('links the ops error workflow', wf.settings.errorWorkflow === '660Xkpo164VSNTDZ');
  check('uses execution order v1', wf.settings.executionOrder === 'v1');

  ['Schedule Trigger', 'Manual Trigger', 'Loop Webhook', 'Config', 'Load Queue Row', 'Pick Row',
   'Claim Row', 'Queue Empty?', 'Build Copy Prompt', 'Generate Copy', 'Validate Copy', 'Copy Valid?',
   'Build Image Prompt', 'Generate Image', 'Validate Image', 'Image Valid?',
   'Upload Photo (unpublished)', 'Get Photo URL', 'Log Attempt', 'Write Attempt', 'Post Preview',
   'Slack Review', 'Route Decision', 'Approved?', 'Publish Post', 'Write Back', 'Write Back Row',
   'Notify Success', 'Loop Guard', 'Re-invoke?', 'Re-invoke', 'Mark Terminal', 'Notify Stopped',
   'Notify Queue Empty', 'Notify Image Failed'].forEach(n => check('has node: ' + n, has(n)));

  // every external call retries and continues into an explicit gate.
  // Note these are the HTTP nodes only — 'Log Attempt', 'Write Back', 'Pick Row',
  // 'Route Decision' and 'Loop Guard' are Code nodes and carry no retry settings.
  ['Generate Copy', 'Generate Image', 'Upload Photo (unpublished)', 'Get Photo URL',
   'Publish Post', 'Load Queue Row', 'Claim Row', 'Write Attempt', 'Write Back Row',
   'Mark Terminal', 'Re-invoke']
    .forEach(n => {
      check(n + ' retries on fail', byName[n] && byName[n].retryOnFail === true);
      check(n + ' continues on error', byName[n] && byName[n].onError === 'continueRegularOutput');
    });

  // config completeness
  const cfg = byName['Config'].parameters.assignments.assignments.map(a => a.name);
  ['pageId', 'graphVersion', 'sheetId', 'queueTab', 'attemptsTab', 'copyModel', 'imageModel',
   'copyTemperature', 'maxAttempts', 'maxCopyRetries', 'reviewTimeoutHours', 'reviewChannel',
   'opsChannel', 'appPrice', 'playStoreUrl', 'selfWebhookUrl']
    .forEach(k => check('Config defines ' + k, cfg.includes(k)));
  const price = byName['Config'].parameters.assignments.assignments.find(a => a.name === 'appPrice');
  check('Config price is 499', Number(price.value) === 499);

  // the review gate really is a custom form with four decisions
  const rev = byName['Slack Review'].parameters;
  check('review uses sendAndWait', rev.operation === 'sendAndWait');
  check('review uses a custom form', rev.responseType === 'customForm');
  const fields = JSON.stringify(rev.formFields);
  ['Approve', 'Regenerate copy', 'Regenerate image', 'Regenerate both']
    .forEach(o => check('review offers: ' + o, fields.includes(o)));
  check('review has a reason field', /reason/i.test(fields));
  check('review limits the wait time', rev.options && rev.options.limitWaitTime === true);

  // Queue writes must target THIS row, never append. An append would leave the
  // original row still 'ready' and the next scheduled run would repost the idea.
  ['Claim Row', 'Write Back Row', 'Mark Terminal'].forEach(n => {
    const p = JSON.stringify(byName[n].parameters);
    check(n + ' does not append to the Queue tab', !/:append/.test(p));
    check(n + ' targets a row by _rowNumber', /_rowNumber/.test(p));
    check(n + ' uses a batched range update', /values:batchUpdate/.test(p));
  });
  check('Write Back Row does not blank scheduled_for',
    !/!G' \+ \$json\._rowNumber \+ ':L/.test(JSON.stringify(byName['Write Back Row'].parameters)));
  check('Pick Row attaches _rowNumber', /_rowNumber/.test(byName['Pick Row'].parameters.jsCode));
  check('Attempts tab still appends (it is a log)',
    /:append/.test(JSON.stringify(byName['Write Attempt'].parameters)));

  // publish is gated: nothing reaches it except the approved branch
  const inbound = (target) => wf.nodes.filter(n =>
    JSON.stringify((wf.connections[n.name] || {}).main || []).includes('"' + target + '"')).map(n => n.name);
  check('only Approved? feeds Publish Post', JSON.stringify(inbound('Publish Post')) === '["Approved?"]');
  check('Image Valid? gates the upload', inbound('Upload Photo (unpublished)').includes('Image Valid?'));
  check('Copy Valid? gates the image prompt', inbound('Build Image Prompt').includes('Copy Valid?'));

  // every node is reachable and every connection target exists
  const names = new Set(wf.nodes.map(n => n.name));
  let dangling = [];
  Object.keys(wf.connections).forEach(src => {
    (wf.connections[src].main || []).forEach(branch => (branch || []).forEach(c => {
      if (!names.has(c.node)) dangling.push(src + ' -> ' + c.node);
    }));
  });
  check('no connection points at a missing node', dangling.length === 0);

  const reached = new Set(['Schedule Trigger', 'Manual Trigger', 'Loop Webhook']);
  let grew = true;
  while (grew) {
    grew = false;
    Object.keys(wf.connections).forEach(src => {
      if (!reached.has(src)) return;
      (wf.connections[src].main || []).forEach(branch => (branch || []).forEach(c => {
        if (!reached.has(c.node)) { reached.add(c.node); grew = true; }
      }));
    });
  }
  const orphans = wf.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote' && !reached.has(n.name)).map(n => n.name);
  check('no orphan nodes: ' + orphans.join(','), orphans.length === 0);

  // the libs actually made it into the code nodes
  const codeBodies = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code')
    .map(n => n.parameters.jsCode).join('\n');
  check('validateCopy is inlined', /function validateCopy/.test(codeBodies));
  check('normalizeDecision is inlined', /function normalizeDecision/.test(codeBodies));
  check('buildSystemPrompt is inlined', /function buildSystemPrompt/.test(codeBodies));
  check('inlined exports are guarded for the n8n sandbox',
    !/^\s*module\.exports\s*=/m.test(codeBodies));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=workflow
```

Expected: one failing check, `fishpin-fb-ads.workflow.json exists (run: node build.js)`.

- [ ] **Step 3a: Write the glue files**

Each file is the *tail* of a Code node; `build.js` prepends the libs it needs.

`nodes/load-queue.js`:
```js
// Glue: pick the row to work on. On loop re-entry the webhook names a row id.
// The Sheets values endpoint returns ONE item holding a `values` matrix, not one
// item per row, so parse it here. _rowNumber is what every later write targets.
const cfg = $('Config').first().json;
const vals = ($json.values || []);
const headers = vals[0] || [];
const rows = vals.slice(1).map((r, i) => {
  const o = { _rowNumber: i + 2 }; // +1 for the header, +1 because sheets are 1-based
  headers.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
  return o;
});

const wh = $('Loop Webhook').isExecuted ? ($('Loop Webhook').first().json.body || {}) : {};
const rowId = String(wh.row_id || '');

const row = selectRow(rows, rowId);
if (!row) return [{ json: { found: false, reason: 'No rows with status=ready.' } }];

return [{ json: {
  found: true,
  row,
  attempt: Number(wh.attempt || 1),
  copy_retry: Number(wh.copy_retry || 0),
  revision_note: String(wh.revision_note || ''),
  rejected_headline: String(wh.headline || ''),
  keep_copy: String(wh.decision || '') === 'image',
  prior_caption: String(wh.caption || ''),
  sheetId: cfg.sheetId,
} }];
```

`nodes/build-copy-prompt.js`:
```js
// Glue: build the Gemini copy request from the brand bible.
const cfg = $('Config').first().json;
const q = $('Load Queue Row').first().json;

const body = {
  system_instruction: { parts: [{ text: buildSystemPrompt() }] },
  contents: [{ role: 'user', parts: [{ text: buildUserPrompt(q.row, q.revision_note, q.rejected_headline) }] }],
  generationConfig: {
    temperature: Number(cfg.copyTemperature),
    responseMimeType: 'application/json',
    responseSchema: COPY_SCHEMA,
  },
};
return [{ json: { geminiBody: body } }];
```

`nodes/validate-copy.js`:
```js
// Glue: parse the Gemini response and run every deterministic copy rule.
const cfg = $('Config').first().json;
const q = $('Load Queue Row').first().json;
const res = $json;

let copy = null; let parseError = '';
try {
  const txt = res.candidates[0].content.parts[0].text;
  copy = JSON.parse(txt);
} catch (e) {
  parseError = 'Could not parse the model response: ' + (e.message || e);
}

if (!copy) {
  return [{ json: { valid: false, reasons: [parseError], copy: null, attempt: q.attempt, copy_retry: q.copy_retry } }];
}

const r = validateCopy(copy, {
  bannedWords: BANNED_WORDS,
  competitors: COMPETITORS,
  price: Number(cfg.appPrice),
});

return [{ json: {
  valid: r.valid, reasons: r.reasons, copy,
  attempt: q.attempt, copy_retry: q.copy_retry, row: q.row,
} }];
```

`nodes/build-image-prompt.js`:
```js
// Glue: build the Gemini image request. On a "regenerate image" pass the
// approved caption is reused and the reviewer's note steers the visual only.
const cfg = $('Config').first().json;
const q = $('Load Queue Row').first().json;
const v = $('Validate Copy').first().json;

let prompt = buildImagePrompt(v.copy, q.row.pillar);
if (q.keep_copy && q.revision_note) prompt += '\nReviewer note on the previous image: ' + q.revision_note;

const body = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: aspectFor(q.row.pillar) },
  },
};
return [{ json: { geminiBody: body, imagePrompt: prompt, aspectRequested: aspectFor(q.row.pillar) } }];
```

`nodes/validate-image.js`:
```js
// Glue: pull the image bytes out of the Gemini response and verify them.
const res = $json;
let b64 = ''; let mime = '';
try {
  const parts = res.candidates[0].content.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  const d = img ? (img.inlineData || img.inline_data) : null;
  if (d) { b64 = d.data || ''; mime = (d.mimeType || d.mime_type || '').toLowerCase(); }
} catch (e) { /* falls through to the empty-payload rejection */ }

const r = validateImage({ b64, mime }, { minBytes: 20480 });
const out = { valid: r.valid, reasons: r.reasons, bytes: r.bytes,
  width: r.width, height: r.height, aspect: r.aspect,
  aspectRequested: $('Build Image Prompt').first().json.aspectRequested };

if (!r.valid) return [{ json: out }];
return [{ json: out, binary: { data: await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), 'creative.png', mime || 'image/png') } }];
```

`nodes/log-attempt.js`:
```js
// Glue: shape the Attempts row. Runs before the review so a timed-out or
// abandoned attempt is still on the record.
const q = $('Load Queue Row').first().json;
const v = $('Validate Copy').first().json;
const img = $('Get Photo URL').first().json;
const url = (img && img.images && img.images.length) ? img.images[0].source : '';

return [{ json: buildAttemptRow({
  row_id: q.row.id, attempt: q.attempt, pillar: q.row.pillar,
  headline: v.copy.headline, caption: v.copy.caption,
  image_url: url, decision: 'pending', revision_note: q.revision_note,
}) }];
```

`nodes/route-decision.js`:
```js
// Glue: normalise whatever the Slack custom form returned.
const q = $('Load Queue Row').first().json;
const v = $('Validate Copy').first().json;
const img = $('Get Photo URL').first().json;
const url = (img && img.images && img.images.length) ? img.images[0].source : '';

const decision = normalizeDecision($json);
const reason = extractReason($json);

return [{ json: {
  decision, reason,
  approved: decision === 'approve',
  row_id: q.row.id, pillar: q.row.pillar,
  attempt: q.attempt, copy_retry: q.copy_retry,
  copy: v.copy, image_url: url,
  media_fbid: $('Upload Photo (unpublished)').first().json.id,
} }];
```

`nodes/loop-guard.js`:
```js
// Glue: apply the two retry budgets and build the re-invoke payload.
const cfg = $('Config').first().json;
const d = $json;

const g = loopGuard({
  decision: d.decision, attempt: d.attempt, copy_retry: d.copy_retry,
  reason: d.reason, row_id: d.row_id,
}, { maxAttempts: Number(cfg.maxAttempts), maxCopyRetries: Number(cfg.maxCopyRetries) });

return [{ json: Object.assign({}, g, {
  row_id: d.row_id,
  reinvoke: g.action === 'reinvoke',
  payload: {
    row_id: d.row_id, attempt: g.attempt, copy_retry: g.copy_retry,
    decision: d.decision, revision_note: g.revision_note,
    caption: (d.copy && d.copy.caption) || '', headline: (d.copy && d.copy.headline) || '',
  },
}) }];
```

`nodes/map-writeback.js`:
```js
// Glue: shape the Queue row update after a successful publish.
const d = $('Route Decision').first().json;
const pub = $json;

if (pub && pub.error) {
  return [{ json: { ok: false, error: JSON.stringify(pub.error), id: d.row_id } }];
}

// _rowNumber is what the targeted batchUpdate writes against.
const rowNumber = $('Pick Row').first().json.row._rowNumber;

return [{ json: Object.assign({ ok: true, _rowNumber: rowNumber }, buildQueueUpdate({
  id: d.row_id, status: 'posted', caption: d.copy.caption,
  image_url: d.image_url, fb_post_id: pub.id || '',
})) }];
```

- [ ] **Step 3b: Write `build.js`**

```js
// Assembles fishpin-fb-ads.workflow.json.
// Libs are inlined VERBATIM ahead of each glue file: their `module.exports` is
// guarded by `typeof module !== 'undefined'`, which is false in the n8n Code
// sandbox, so no source transformation is needed.
// Run: node build.js
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const lib = (n) => read(path.join('lib', n));
const glue = (n) => read(path.join('nodes', n));
const code = (libs, g) => libs.map(lib).join('\n\n') + '\n\n' + glue(g);

const GEMINI = { id: 'S0qfsjLzQfKC04iG', name: 'Gemini - Brand Variations' };
const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
// Created by the owner after the Meta setup; see README section "Facebook token".
const FB = { id: 'FB_CRED_ID', name: 'FB Page - FishPin' };

const ERROR_WF = '660Xkpo164VSNTDZ';
const WEBHOOK_PATH = 'fishpin-ad';
const SHEET_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const pos = (x, y) => [x, y];
const codeNode = (id, name, jsCode, x, y = 300) => ({
  parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, y),
});
const ifNode = (id, name, leftValue, x, y) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c', leftValue, rightValue: true,
      operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(x, y),
});
const http = (id, name, params, x, y, cred, tries = 3) => ({
  parameters: Object.assign({ authentication: 'predefinedCredentialType' }, params),
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: tries, waitBetweenTries: 2000, onError: 'continueRegularOutput',
  credentials: cred,
});
const slack = (id, name, params, x, y) => ({
  parameters: Object.assign({ select: 'channel' }, params),
  id, name, type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(x, y),
  onError: 'continueRegularOutput', credentials: { slackApi: SLACK },
});
const slackMsg = (id, name, channelExpr, text, x, y) => slack(id, name, {
  channelId: { __rl: true, value: channelExpr, mode: 'id' }, text, otherOptions: {},
}, x, y);

const cfgVal = (k) => "={{ $('Config').first().json." + k + ' }}';
const sheetUrl = (suffix) => "={{ '" + SHEET_BASE + "/' + $('Config').first().json.sheetId + '" + suffix + "' }}";

const nodes = [
  { parameters: { rule: { interval: [
      { field: 'cronExpression', expression: '30 5 * * 1,3,5' },
      { field: 'cronExpression', expression: '30 18 * * 1,3,5' },
    ] } },
    id: 'n-sched', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(-620, 200) },
  { parameters: {}, id: 'n-man', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(-620, 360) },
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'lastNode', options: {} },
    id: 'n-wh', name: 'Loop Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-620, 520), webhookId: 'fishpin-ad-hook' },

  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'pageId', value: 'FILL_IN_FISHPIN_PAGE_ID', type: 'string' },
      { id: 'c2', name: 'graphVersion', value: 'v21.0', type: 'string' },
      { id: 'c3', name: 'sheetId', value: 'FILL_IN_SHEET_ID', type: 'string' },
      { id: 'c4', name: 'queueTab', value: 'Queue', type: 'string' },
      { id: 'c5', name: 'attemptsTab', value: 'Attempts', type: 'string' },
      { id: 'c6', name: 'copyModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c7', name: 'imageModel', value: 'gemini-2.5-flash-image', type: 'string' },
      { id: 'c8', name: 'copyTemperature', value: 0.8, type: 'number' },
      { id: 'c9', name: 'maxAttempts', value: 3, type: 'number' },
      { id: 'c10', name: 'maxCopyRetries', value: 1, type: 'number' },
      { id: 'c11', name: 'reviewTimeoutHours', value: 6, type: 'number' },
      { id: 'c12', name: 'reviewChannel', value: 'C0BDSV5RB5G', type: 'string' },
      { id: 'c13', name: 'opsChannel', value: 'C0BDSV5RB5G', type: 'string' },
      { id: 'c14', name: 'appPrice', value: 499, type: 'number' },
      { id: 'c15', name: 'playStoreUrl', value: 'https://play.google.com/store/apps/details?id=app.fishpin', type: 'string' },
      { id: 'c16', name: 'selfWebhookUrl', value: 'https://n8n.srv1193790.hstgr.cloud/webhook/' + WEBHOOK_PATH, type: 'string' },
    ] }, options: {} },
    id: 'n-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-400, 360) },

  http('n-read', 'Load Queue Row', {
    method: 'GET', url: sheetUrl("/values/' + $('Config').first().json.queueTab + '!A1:P1000"),
    nodeCredentialType: 'googleApi', options: {},
  }, -180, 360, { googleApi: SHEETS }),
  codeNode('n-pick', 'Pick Row', code(['sheet-rules.js'], 'load-queue.js'), 40, 360),
  ifNode('n-empty', 'Queue Empty?', '={{ !$json.found }}', 260, 360),
  slackMsg('n-empty-msg', 'Notify Queue Empty', cfgVal('opsChannel'),
    '=:inbox_tray: FishPin ad queue is empty. Nothing was posted. Add rows with status=ready.', 480, 200),

  // Targeted single-cell write to column G (status) of THIS row. Appending here
  // would add a second row with the same id, leaving the original still 'ready'
  // for the next scheduled run to pick up again.
  http('n-claim', 'Claim Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [['in_review']] }] }) }}",
    options: {},
  }, 480, 420, { googleApi: SHEETS }),

  codeNode('n-cprompt', 'Build Copy Prompt', code(['brand.js'], 'build-copy-prompt.js'), 700, 420),
  http('n-copy', 'Generate Copy', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.copyModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 60000 },
  }, 920, 420, { googlePalmApi: GEMINI }),
  codeNode('n-vcopy', 'Validate Copy', code(['brand.js', 'copy-rules.js'], 'validate-copy.js'), 1140, 420),
  ifNode('n-ifcopy', 'Copy Valid?', '={{ $json.valid }}', 1360, 420),

  codeNode('n-iprompt', 'Build Image Prompt', code(['image-rules.js'], 'build-image-prompt.js'), 1580, 340),
  http('n-img', 'Generate Image', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.imageModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 120000 },
  }, 1800, 340, { googlePalmApi: GEMINI }, 2),
  codeNode('n-vimg', 'Validate Image', code(['image-rules.js'], 'validate-image.js'), 2020, 340),
  ifNode('n-ifimg', 'Image Valid?', '={{ $json.valid }}', 2240, 340),
  slackMsg('n-imgfail', 'Notify Image Failed', cfgVal('opsChannel'),
    "=:warning: FishPin ad image generation FAILED for row {{ $('Pick Row').first().json.row.id }}. Nothing was posted.\nReasons: {{ $('Validate Image').first().json.reasons.join('; ') }}",
    2460, 480),

  http('n-up', 'Upload Photo (unpublished)', {
    method: 'POST',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Config').first().json.pageId + '/photos' }}",
    nodeCredentialType: 'facebookGraphApi', sendBody: true, contentType: 'multipart-form-data',
    bodyParameters: { parameters: [
      { name: 'published', value: 'false' },
      { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' },
    ] }, options: {},
  }, 2460, 260, { facebookGraphApi: FB }),
  http('n-url', 'Get Photo URL', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $json.id + '?fields=images' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 2680, 260, { facebookGraphApi: FB }),

  codeNode('n-att', 'Log Attempt', code(['sheet-rules.js'], 'log-attempt.js'), 2900, 260),
  http('n-attw', 'Write Attempt', {
    method: 'POST', url: sheetUrl("/values/' + $('Config').first().json.attemptsTab + '!A:I:append"),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ values: [[ $json.ts, $json.row_id, $json.attempt, $json.pillar, $json.headline, $json.caption, $json.image_url, $json.decision, $json.revision_note ]] }) }}',
    sendQuery: true, queryParameters: { parameters: [
      { name: 'valueInputOption', value: 'RAW' },
      { name: 'insertDataOption', value: 'INSERT_ROWS' },
    ] }, options: {},
  }, 3120, 260, { googleApi: SHEETS }),

  slack('n-prev', 'Post Preview', {
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    text: "=*FishPin ad ready for review* — `{{ $('Pick Row').first().json.row.id }}` · _{{ $('Pick Row').first().json.row.pillar }}_ · attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}\n\n*Headline:* {{ $('Validate Copy').first().json.copy.headline }}\n*Subhead:* {{ $('Validate Copy').first().json.copy.subhead }}\n\n{{ $('Validate Copy').first().json.copy.caption }}\n\n{{ $('Validate Copy').first().json.copy.cta }}\n{{ $('Validate Copy').first().json.copy.hashtags.join(' ') }}\n\n{{ $('Get Photo URL').first().json.images[0].source }}",
    otherOptions: {},
  }, 3340, 260),

  slack('n-rev', 'Slack Review', {
    operation: 'sendAndWait',
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    message: "=Review the FishPin ad above (`{{ $('Pick Row').first().json.row.id }}`, attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}).",
    responseType: 'customForm',
    formFields: { values: [
      { fieldLabel: 'Decision', fieldType: 'dropdown', requiredField: true,
        fieldOptions: { values: [
          { option: 'Approve' }, { option: 'Regenerate copy' },
          { option: 'Regenerate image' }, { option: 'Regenerate both' },
        ] } },
      { fieldLabel: 'Reason', fieldType: 'textarea', requiredField: false },
    ] },
    options: { limitWaitTime: true, resumeAmount: '={{ $(\'Config\').first().json.reviewTimeoutHours }}', resumeUnit: 'hours' },
  }, 3560, 260),

  codeNode('n-route', 'Route Decision', code(['flow-rules.js'], 'route-decision.js'), 3780, 260),
  ifNode('n-ifapp', 'Approved?', '={{ $json.approved }}', 4000, 260),

  http('n-pub', 'Publish Post', {
    method: 'POST',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Config').first().json.pageId + '/feed' }}",
    nodeCredentialType: 'facebookGraphApi', sendBody: true, contentType: 'form-urlencoded',
    bodyParameters: { parameters: [
      { name: 'message', value: "={{ $json.copy.caption + '\\n\\n' + $json.copy.cta + '\\n\\n' + $json.copy.hashtags.join(' ') }}" },
      { name: 'attached_media', value: "={{ JSON.stringify([{ media_fbid: $json.media_fbid }]) }}" },
    ] }, options: {},
  }, 4220, 180, { facebookGraphApi: FB }),
  codeNode('n-wb', 'Write Back', code(['sheet-rules.js'], 'map-writeback.js'), 4440, 180),
  // Two targeted ranges in one call: G = status, I:L = caption, image_url,
  // fb_post_id, posted_at. Column H (scheduled_for) is deliberately skipped so
  // the human's value is not blanked.
  http('n-wbw', 'Write Back Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [ { range: $('Config').first().json.queueTab + '!G' + $json._rowNumber, values: [[ $json.status ]] }, { range: $('Config').first().json.queueTab + '!I' + $json._rowNumber + ':L' + $json._rowNumber, values: [[ $json.caption, $json.image_url, $json.fb_post_id, $json.posted_at ]] } ] }) }}",
    options: {},
  }, 4660, 180, { googleApi: SHEETS }),
  slackMsg('n-ok', 'Notify Success', cfgVal('opsChannel'),
    "=:white_check_mark: Posted to the FishPin Page — row `{{ $('Route Decision').first().json.row_id }}` ({{ $('Route Decision').first().json.pillar }})\nPost id: {{ $('Publish Post').first().json.id }}\n{{ $('Route Decision').first().json.image_url }}",
    4880, 180),

  codeNode('n-guard', 'Loop Guard', code(['flow-rules.js'], 'loop-guard.js'), 4220, 400),
  ifNode('n-ifloop', 'Re-invoke?', '={{ $json.reinvoke }}', 4440, 400),
  http('n-re', 'Re-invoke', {
    method: 'POST', url: cfgVal('selfWebhookUrl'),
    authentication: 'none', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload) }}',
    options: {},
  }, 4660, 340, {}),
  http('n-term', 'Mark Terminal', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [[ $json.status ]] }] }) }}",
    options: {},
  }, 4660, 460, { googleApi: SHEETS }),
  slackMsg('n-stop', 'Notify Stopped', cfgVal('opsChannel'),
    '=:octagonal_sign: {{ $json.message }}', 4880, 460),
];

const c = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const cIf = (from, t, f) => ({ [from]: { main: [
  [{ node: t, type: 'main', index: 0 }], [{ node: f, type: 'main', index: 0 }]] } });

const connections = Object.assign({},
  c('Schedule Trigger', 'Config'),
  c('Manual Trigger', 'Config'),
  c('Loop Webhook', 'Config'),
  c('Config', 'Load Queue Row'),
  c('Load Queue Row', 'Pick Row'),
  c('Pick Row', 'Queue Empty?'),
  cIf('Queue Empty?', 'Notify Queue Empty', 'Claim Row'),
  c('Claim Row', 'Build Copy Prompt'),
  c('Build Copy Prompt', 'Generate Copy'),
  c('Generate Copy', 'Validate Copy'),
  c('Validate Copy', 'Copy Valid?'),
  cIf('Copy Valid?', 'Build Image Prompt', 'Loop Guard'),
  c('Build Image Prompt', 'Generate Image'),
  c('Generate Image', 'Validate Image'),
  c('Validate Image', 'Image Valid?'),
  cIf('Image Valid?', 'Upload Photo (unpublished)', 'Notify Image Failed'),
  c('Upload Photo (unpublished)', 'Get Photo URL'),
  c('Get Photo URL', 'Log Attempt'),
  c('Log Attempt', 'Write Attempt'),
  c('Write Attempt', 'Post Preview'),
  c('Post Preview', 'Slack Review'),
  c('Slack Review', 'Route Decision'),
  c('Route Decision', 'Approved?'),
  cIf('Approved?', 'Publish Post', 'Loop Guard'),
  c('Publish Post', 'Write Back'),
  c('Write Back', 'Write Back Row'),
  c('Write Back Row', 'Notify Success'),
  c('Loop Guard', 'Re-invoke?'),
  cIf('Re-invoke?', 'Re-invoke', 'Mark Terminal'),
  c('Mark Terminal', 'Notify Stopped'),
);

const workflow = {
  name: 'FishPin Ad Creative -> FB (Approve)',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: ERROR_WF },
};
const out = path.join(__dirname, 'fishpin-fb-ads.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
```

Note: the `Copy Valid?` false branch feeds `Loop Guard`. `route-decision.js` is not on that path, so `Loop Guard` must see `decision: 'copy_invalid'`. Add a one-line `Set` shim or, simpler, extend `nodes/loop-guard.js` to derive the decision when `Route Decision` has not executed:

```js
// at the top of nodes/loop-guard.js, replace `const d = $json;` with:
const routed = $('Route Decision').isExecuted;
const v = $('Validate Copy').first().json;
const d = routed ? $json : {
  decision: 'copy_invalid', attempt: v.attempt, copy_retry: v.copy_retry,
  reason: (v.reasons || []).join('; '), row_id: (v.row && v.row.id) || '',
  copy: v.copy,
};
```

- [ ] **Step 4: Build and run the tests**

```bash
node build.js && node test.js
```

Expected: `Wrote .../fishpin-fb-ads.workflow.json (35 nodes)` then every section passing, including all `workflow` structural checks. If `no orphan nodes` fails, the named node is not wired into `connections` — fix the connection, not the test.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): n8n glue nodes and main workflow builder"
```

---

## Task 7: Insights workflow

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/nodes/select-due.js`
- Create: `n8n-control/builds/06-fishpin-fb-ads/nodes/map-metrics.js`
- Create: `n8n-control/builds/06-fishpin-fb-ads/build-insights.js`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append an `insights` section)

**Interfaces:**
- Consumes: `selectDueRows`, `mapMetrics` from Task 5.
- Produces: `fishpin-insights.workflow.json`.
- Test tags: `--only=insights`

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block:

```js
// ---------------------------------------------------------------- insights wf
section('insights', 'Insights workflow structure', () => {
  const fs = require('fs');
  const p = path.join(__dirname, 'fishpin-insights.workflow.json');
  if (!fs.existsSync(p)) { check('fishpin-insights.workflow.json exists (run: node build-insights.js)', false); return; }
  const wf = JSON.parse(fs.readFileSync(p, 'utf8'));
  const byName = {}; wf.nodes.forEach(n => { byName[n.name] = n; });

  check('links the ops error workflow', wf.settings.errorWorkflow === '660Xkpo164VSNTDZ');
  ['Schedule Trigger', 'Config', 'Read Queue', 'Select Due', 'Any Due?', 'Split Posts',
   'Get Insights', 'Get Engagement', 'Map Metrics', 'Update Row', 'Notify Digest']
    .forEach(n => check('has node: ' + n, Object.prototype.hasOwnProperty.call(byName, n)));

  ['Read Queue', 'Get Insights', 'Get Engagement', 'Update Row'].forEach(n => {
    check(n + ' retries on fail', byName[n].retryOnFail === true);
    check(n + ' continues on error', byName[n].onError === 'continueRegularOutput');
  });

  const ins = JSON.stringify(byName['Get Insights'].parameters);
  ['post_impressions', 'post_engaged_users', 'post_reactions_by_type_total']
    .forEach(m => check('requests metric: ' + m, ins.includes(m)));
  const eng = JSON.stringify(byName['Get Engagement'].parameters);
  check('requests comments summary', eng.includes('comments.summary(true)'));
  check('requests the share count', eng.includes('shares'));

  const cfg = byName['Config'].parameters.assignments.assignments.map(a => a.name);
  ['sheetId', 'queueTab', 'graphVersion', 'opsChannel', 'insightsDelayHours']
    .forEach(k => check('Config defines ' + k, cfg.includes(k)));

  const bodies = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code').map(n => n.parameters.jsCode).join('\n');
  check('selectDueRows is inlined', /function selectDueRows/.test(bodies));
  check('mapMetrics is inlined', /function mapMetrics/.test(bodies));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test.js --only=insights
```

Expected: one failing check, `fishpin-insights.workflow.json exists`.

- [ ] **Step 3: Write the implementation**

`nodes/select-due.js`:
```js
// Glue: which posted rows are old enough to have real numbers and have none yet.
const cfg = $('Config').first().json;
const vals = ($json.values || []);
const headers = vals[0] || [];
const rows = vals.slice(1).map((r, i) => {
  const o = { _rowNumber: i + 2 };
  headers.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
  return o;
});

const due = selectDueRows(rows, Date.now(), Number(cfg.insightsDelayHours || 24));
if (!due.length) return [{ json: { any: false, count: 0, due: [] } }];
return due.map((r) => ({ json: { any: true, count: due.length, row: r } }));
```

`nodes/map-metrics.js`:
```js
// Glue: fold the two Graph responses into the four sheet columns.
const row = $('Split Posts').first().json.row;
const insights = $('Get Insights').first().json;
const engagement = $json;

const m = mapMetrics(insights, engagement);
return [{ json: Object.assign({ id: row.id, _rowNumber: row._rowNumber, status: 'measured' }, m) }];
```

`build-insights.js`:
```js
// Assembles fishpin-insights.workflow.json — hourly scan for posts that are
// 24h old and still unmeasured. A 24h Wait node does not survive an n8n restart.
// Run: node build-insights.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const code = (libs, g) => libs.map((n) => read(path.join('lib', n))).join('\n\n') + '\n\n' + read(path.join('nodes', g));

const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
const FB = { id: 'FB_CRED_ID', name: 'FB Page - FishPin' };
const SHEET_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const pos = (x, y) => [x, y];
const sheetUrl = (s) => "={{ '" + SHEET_BASE + "/' + $('Config').first().json.sheetId + '" + s + "' }}";

const http = (id, name, params, x, y, cred) => ({
  parameters: Object.assign({ authentication: 'predefinedCredentialType' }, params),
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput', credentials: cred,
});

const nodes = [
  { parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
    id: 'i-sched', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(-400, 300) },
  { parameters: { assignments: { assignments: [
      { id: 'i1', name: 'sheetId', value: 'FILL_IN_SHEET_ID', type: 'string' },
      { id: 'i2', name: 'queueTab', value: 'Queue', type: 'string' },
      { id: 'i3', name: 'graphVersion', value: 'v21.0', type: 'string' },
      { id: 'i4', name: 'opsChannel', value: 'C0BDSV5RB5G', type: 'string' },
      { id: 'i5', name: 'insightsDelayHours', value: 24, type: 'number' },
    ] }, options: {} },
    id: 'i-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-180, 300) },
  http('i-read', 'Read Queue', {
    method: 'GET', url: sheetUrl("/values/' + $('Config').first().json.queueTab + '!A1:P1000"),
    nodeCredentialType: 'googleApi', options: {},
  }, 40, 300, { googleApi: SHEETS }),
  { parameters: { jsCode: code(['sheet-rules.js'], 'select-due.js') },
    id: 'i-due', name: 'Select Due', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(260, 300) },
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'c', leftValue: '={{ $json.any }}', rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    id: 'i-if', name: 'Any Due?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(480, 300) },
  { parameters: { jsCode: 'return items;' },
    id: 'i-split', name: 'Split Posts', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(700, 220) },
  http('i-ins', 'Get Insights', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $json.row.fb_post_id + '/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 920, 220, { facebookGraphApi: FB }),
  http('i-eng', 'Get Engagement', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Split Posts').first().json.row.fb_post_id + '?fields=comments.summary(true),shares,reactions.summary(true)' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 1140, 220, { facebookGraphApi: FB }),
  { parameters: { jsCode: code(['sheet-rules.js'], 'map-metrics.js') },
    id: 'i-map', name: 'Map Metrics', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1360, 220) },
  // G = status, M:P = likes, comments, shares, reach. Writing G:P as one range
  // would blank columns H-L (scheduled_for, caption, image_url, fb_post_id,
  // posted_at), destroying the record of what was actually published.
  http('i-upd', 'Update Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [ { range: $('Config').first().json.queueTab + '!G' + $json._rowNumber, values: [[ $json.status ]] }, { range: $('Config').first().json.queueTab + '!M' + $json._rowNumber + ':P' + $json._rowNumber, values: [[ $json.likes, $json.comments, $json.shares, $json.reach ]] } ] }) }}",
    options: {},
  }, 1580, 220, { googleApi: SHEETS }),
  { parameters: { select: 'channel',
      channelId: { __rl: true, value: "={{ $('Config').first().json.opsChannel }}", mode: 'id' },
      text: '=:bar_chart: FishPin 24h numbers for `{{ $json.id }}`: reach {{ $json.reach }}, likes {{ $json.likes }}, comments {{ $json.comments }}, shares {{ $json.shares }}',
      otherOptions: {} },
    id: 'i-slack', name: 'Notify Digest', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(1800, 220),
    onError: 'continueRegularOutput', credentials: { slackApi: SLACK } },
];

const connections = {
  'Schedule Trigger': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Read Queue', type: 'main', index: 0 }]] },
  'Read Queue': { main: [[{ node: 'Select Due', type: 'main', index: 0 }]] },
  'Select Due': { main: [[{ node: 'Any Due?', type: 'main', index: 0 }]] },
  'Any Due?': { main: [[{ node: 'Split Posts', type: 'main', index: 0 }], []] },
  'Split Posts': { main: [[{ node: 'Get Insights', type: 'main', index: 0 }]] },
  'Get Insights': { main: [[{ node: 'Get Engagement', type: 'main', index: 0 }]] },
  'Get Engagement': { main: [[{ node: 'Map Metrics', type: 'main', index: 0 }]] },
  'Map Metrics': { main: [[{ node: 'Update Row', type: 'main', index: 0 }]] },
  'Update Row': { main: [[{ node: 'Notify Digest', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'FishPin Ad Insights (24h)', nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' },
};
const out = path.join(__dirname, 'fishpin-insights.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
```

- [ ] **Step 4: Build and run the tests**

```bash
node build-insights.js && node test.js
```

Expected: `Wrote .../fishpin-insights.workflow.json (11 nodes)` and every section passing.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): 24h insights scanner workflow"
```

---

## Task 8: Seed queue, README, and the live copy test

**Files:**
- Create: `n8n-control/builds/06-fishpin-fb-ads/queue-seed.csv`
- Create: `n8n-control/builds/06-fishpin-fb-ads/README.md`
- Modify: `n8n-control/builds/06-fishpin-fb-ads/test.js` (append the `live` section)

**Interfaces:**
- Consumes: `buildSystemPrompt`, `buildUserPrompt`, `COPY_SCHEMA` (Task 1); `validateCopy` (Task 2).
- Produces: a `--live` test path that proves generated copy passes the validator unmodified.
- Test tags: `--only=live` (only runs with `--live`)

- [ ] **Step 1: Write the failing test**

Append to `test.js` before the results block:

```js
// ---------------------------------------------------------------- live
if (LIVE) {
  const B = L('brand.js');
  const { validateCopy } = L('copy-rules.js');
  const KEY = process.env.GEMINI_API_KEY || '';
  const MODEL = process.env.COPY_MODEL || 'gemini-2.5-flash';

  const seedRows = [
    { id: 'FP-001', pillar: 'feature spotlight', topic: 'Offline maps work with zero signal offshore',
      key_message: 'Download the map on Wi-Fi once, use it forever at sea', cta: 'I-download sa Play Store', notes: '' },
    { id: 'FP-003', pillar: 'safety', topic: 'SOS sends your exact coordinates to saved contacts by SMS',
      key_message: 'Mas mabilis kang mahanap kung may aberya', cta: 'I-download sa Play Store', notes: '' },
    { id: 'FP-005', pillar: 'fish fact', topic: 'Species of the day from the fish guide',
      key_message: 'Alamin ang tamang season at habitat', cta: 'I-download sa Play Store', notes: '' },
    { id: 'FP-008', pillar: 'cost comparison', topic: 'One-time PHP 499 versus a handheld GPS device',
      key_message: 'Isang bayad lang, walang subscription', cta: 'I-download sa Play Store', notes: '' },
  ];

  (async () => {
    console.log('\n■ Live copy generation (' + MODEL + ')');
    if (!KEY) { console.log('  ! set GEMINI_API_KEY to run the live test'); process.exit(fail ? 1 : 0); }

    for (const row of seedRows) {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: B.buildSystemPrompt() }] },
            contents: [{ role: 'user', parts: [{ text: B.buildUserPrompt(row, '', '') }] }],
            generationConfig: { temperature: 0.8, responseMimeType: 'application/json', responseSchema: B.COPY_SCHEMA },
          }) }).then(r => r.json());

      let copy = null;
      try { copy = JSON.parse(res.candidates[0].content.parts[0].text); } catch (e) { /* reported below */ }
      check(row.pillar + ': returned parseable JSON', !!copy);
      if (!copy) { console.log('     raw: ' + JSON.stringify(res).slice(0, 400)); continue; }

      const v = validateCopy(copy, { bannedWords: B.BANNED_WORDS, competitors: B.COMPETITORS, price: B.PRODUCT.price });
      check(row.pillar + ': passes the validator unmodified', v.valid);
      if (!v.valid) console.log('     reasons: ' + v.reasons.join(' | '));
      check(row.pillar + ': image_prompt requests no text of its own', !!copy.image_prompt);
      console.log('     headline: ' + copy.headline);
    }

    console.log('\n' + '─'.repeat(40));
    console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
    if (fails.length) console.log('Failed: ' + fails.join('; '));
    process.exit(fail ? 1 : 0);
  })();
} else {
  // ---- results (existing block moves here so the live path can own the exit)
}
```

Move the existing results block into the `else` branch shown above.

- [ ] **Step 2: Run to verify it reports the missing key**

```bash
node test.js --live
```

Expected: offline sections pass, then `! set GEMINI_API_KEY to run the live test`.

- [ ] **Step 3: Write the seed queue and README**

`queue-seed.csv` — header row exactly `QUEUE_HEADERS`, then:

```csv
id,pillar,topic,key_message,cta,notes,status,scheduled_for,caption,image_url,fb_post_id,posted_at,likes,comments,shares,reach
FP-001,feature spotlight,Offline maps work with zero signal offshore,Download the map on Wi-Fi once and use it forever at sea,I-download sa Play Store,,ready,,,,,,,,,
FP-002,feature spotlight,Save a fishing spot and navigate back to it exactly,Hindi na mawawala ang magandang tagpuan,I-download sa Play Store,,ready,,,,,,,,,
FP-003,safety,SOS sends your exact coordinates to saved contacts by SMS,Mas mabilis kang mahanap kung may aberya sa laot,I-download sa Play Store,Serious tone. No sales pressure. Never promise rescue.,ready,,,,,,,,,
FP-004,safety,Tell family when you will be back and record your path,Alam ng pamilya kung saan ka at kailan ka uuwi,I-download sa Play Store,Serious tone. Speak to the wives and children too.,ready,,,,,,,,,
FP-005,fish fact,Species of the day from the 200+ fish guide,Alamin ang local name season at habitat,I-download sa Play Store,Square 1:1 image. Say generally considered safe to eat.,ready,,,,,,,,,
FP-006,fish fact,Local name season and habitat of a common catch,Mas madaling mahuli kung alam mo ang ugali nito,I-download sa Play Store,Square 1:1 image. Say generally considered safe to eat.,ready,,,,,,,,,
FP-007,tip or how-to,How to mark a spot properly so you can find it again,Gamitin ang kulay at icon para madaling makilala,I-download sa Play Store,,ready,,,,,,,,,
FP-008,cost comparison,One-time PHP 499 versus a handheld GPS device,Isang bayad lang walang buwanang subscription,I-download sa Play Store,Compare to a GPS device generically. Never name a brand.,ready,,,,,,,,,
FP-009,social proof,Real user screenshot or quote,Totoong mangingisda totoong karanasan,I-download sa Play Store,BLOCKED. Needs a real screenshot review or quote from Robert. Never fabricate.,blocked_needs_asset,,,,,,,,,
FP-010,behind the scenes,Built in the Philippines by a Filipino developer,Gawa ng Pilipino para sa Pilipinong mangingisda,I-download sa Play Store,,ready,,,,,,,,,
```

`README.md` must cover, in this order: the business problem and the pitch; the two workflow diagrams; the Definition-of-Done checklist from `CLAUDE.md` with each box justified; the Sheet setup (create, share with the service account, paste both header rows, import `queue-seed.csv`); the **Facebook token** section (Meta app of type Business, add Facebook Login for Business and Pages, request `pages_manage_posts` / `pages_read_engagement` / `pages_show_list`, note which clear Development mode for a Page admin versus needing App Review, generate a long-lived token via a System User in Meta Business Suite, verify expiry in the Access Token Debugger, store as an n8n credential named `FB Page - FishPin`, then replace `FB_CRED_ID` in both build files and rebuild); the Slack setup (`chat:write`, `files:write`, `channels:read`, invite the bot, note that `sendAndWait` needs a public `WEBHOOK_URL`); the Config table; the test commands; and the pre-first-live-post checklist from spec §13.

- [ ] **Step 4: Verify**

```bash
node build.js && node build-insights.js && node test.js
GEMINI_API_KEY=... node test.js --live
```

Expected: all offline sections pass; the live run generates four drafts that pass the validator unmodified. If a pillar fails validation repeatedly, tighten the corresponding rule text in `buildSystemPrompt()` — never loosen the validator.

- [ ] **Step 5: Commit**

```bash
git add n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): seed queue, README, and live copy-generation test"
```

---

## Task 9: Deploy and verify against the live instance

**Files:**
- Modify: `CLAUDE.md` (progress log entry)
- Modify: `n8n-control/builds/06-fishpin-fb-ads/README.md` (record the live workflow IDs)

**Interfaces:**
- Consumes: both workflow JSONs from Tasks 6 and 7.
- Produces: two live workflow IDs.

- [ ] **Step 1: Activate the fleet error handler**

The workflows reference `660Xkpo164VSNTDZ` as their error workflow, and it is currently inactive, so failures would alert nowhere.

```bash
cd n8n-control && ./n8n.ps1 list | grep 660Xkpo164VSNTDZ
```

Activate it in the n8n UI (the public API has no activate endpoint), then re-run the list and confirm it reads `ACTIVE`.

- [ ] **Step 2: Fill in the real IDs and rebuild**

In `build.js` and `build-insights.js` replace `FILL_IN_FISHPIN_PAGE_ID`, `FILL_IN_SHEET_ID`, and `FB_CRED_ID` with the real values, then:

```bash
cd n8n-control/builds/06-fishpin-fb-ads && node build.js && node build-insights.js && node test.js
```

Expected: all tests pass with the real values in place.

- [ ] **Step 3: Push both workflows**

```bash
cd n8n-control
./n8n.ps1 create builds/06-fishpin-fb-ads/fishpin-fb-ads.workflow.json
./n8n.ps1 create builds/06-fishpin-fb-ads/fishpin-insights.workflow.json
```

Record both returned IDs in the README.

- [ ] **Step 4: Run the pre-live checklist**

Execute the main workflow manually from the n8n UI and verify, in order:
1. A row is claimed and its `status` flips to `in_review` in the Sheet.
2. A preview image plus caption lands in the review channel.
3. The `sendAndWait` form renders with all four dropdown options.
4. Choosing **Regenerate copy** with a typed reason re-enters the workflow, the Attempts tab gains a row, and `attempt` reads 2 on the next review, against the **same** queue row.
5. Choosing **Approve** publishes to the Page, and the Queue row gains `caption`, `image_url`, `fb_post_id`, and `posted_at`.
6. After 24h, run the insights workflow manually and confirm `reach`, `likes`, `comments`, `shares`, and `status = measured`.

Record the observed `aspect` value from the Attempts log. If it is not `4:5`, note in the README that `gemini-2.5-flash-image` ignores `imageConfig.aspectRatio` and that posts are square (spec §16 item 1).

- [ ] **Step 5: Update the progress log and commit**

Add to `CLAUDE.md` under Workflow / Progress Log, matching the existing entry format:

```
- #6 FishPin FB Ad Engine — `<mainId>` + `<insightsId>` — ✅ DONE & tested live. Webhook `/webhook/fishpin-ad`. Folder: `builds/06-fishpin-fb-ads/`. Sheet queue → Gemini copy (responseSchema + deterministic brand/compliance validator) → Gemini image with the headline baked in → FB unpublished-photo archive → Slack customForm approval loop (approve / regen copy / regen image / regen both, 3 attempts) → Page post → hourly 24h insights backfill. REAL venture deployment, second FishPin build after the chatbot.
```

```bash
git add CLAUDE.md n8n-control/builds/06-fishpin-fb-ads/
git commit -m "feat(fishpin-ads): deploy both workflows and record live IDs"
```

---

## Self-Review Notes

**Spec coverage.** Every spec section maps to a task: §3 architecture → Tasks 6, 7; §4 data model → Task 5; §5 copy generation → Task 1; §6 validation → Task 2; §7 image → Task 3; §8 approval loop → Tasks 4, 6; §9 publishing → Task 6; §10 pillars and the social-proof block → Tasks 1, 8; §11 error handling → Global Constraints, enforced by the Task 6 structural tests; §12 credentials → Tasks 6, 8, 9; §13 testing → every task, plus Task 9; §14 file layout → File Structure; §15 seed queue → Task 8; §16 open items → items 1 and 2 are designed away (dimensions read from bytes, decision routing is shape-agnostic), item 3 is a Task 8 README deliverable verified in Task 9.

**Pre-flight corrections (applied 2026-09-10, before Task 1).** A scan before dispatch found three defects in this plan and they are now fixed above:

1. `Claim Row`, `Write Back Row`, and `Mark Terminal` appended new rows instead of updating the row in place. An append leaves the original row still `ready`, so the next scheduled run reposts the same idea forever, defeating the row-claiming mechanism the spec added in §4. All three now use `values:batchUpdate` against `_rowNumber`.
2. `load-queue.js` treated the Sheets response as one item per row. The values endpoint returns a single object holding a `values` matrix. It now parses that matrix and attaches `_rowNumber`, matching `select-due.js`.
3. The insights `Update Row` wrote the range `G:P` in one shot, blanking columns H through L — `scheduled_for`, `caption`, `image_url`, `fb_post_id`, `posted_at` — and so destroying the record of what was published. It now writes `G` and `M:P` as two ranges in one batched call.

Task 6's structural tests assert all three: no `:append` on Queue writes, `_rowNumber` targeting, and `batchUpdate` usage. The Attempts tab still appends, which is correct for a log.

**Known plan-mandated patterns a reviewer may flag.** Two are deliberate. `build.js` and `build-insights.js` each redeclare the credential constants and the `pos`/`http`/`sheetUrl` helpers rather than sharing a module, because every existing `builds/*/build.js` in this repo is self-contained and deployable on its own. The insights `Split Posts` node is a Code node whose body is `return items;`, which exists to give `map-metrics.js` a stable `$('Split Posts')` reference for per-item fan-out. Neither is an oversight; if a reviewer raises them, adjudicate against this note.
