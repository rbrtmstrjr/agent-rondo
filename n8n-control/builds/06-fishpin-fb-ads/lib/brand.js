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
  'cost comparison': 'A handheld GPS device versus a phone app. Contrast a one-time purchase against a recurring monthly load cost, without quoting any figure for either side. Compare generically, never name a brand.',
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
    // 1 to 5 entries, one per image in a coherent set. The model chooses the
    // count from the topic (see buildSystemPrompt's IMAGE PROMPT RULES); the
    // 1-to-5 bound is enforced deterministically in copy-rules.js, not by the
    // schema, for the same reason hashtags' 3-to-5 bound is: the responseSchema
    // subset Gemini accepts is kept to types only, so a schema field the API
    // does not recognise can never 400 the whole generation.
    image_prompts: { type: 'ARRAY', items: { type: 'STRING' } },
    alt_text: { type: 'STRING' },
  },
  required: ['headline', 'subhead', 'caption', 'cta', 'hashtags', 'image_prompts', 'alt_text'],
};

// The two links every caption must carry. They are NOT hardcoded here: they
// arrive from the workflow's Config node (Config.websiteUrl,
// Config.playStoreUrl) through the glue, exactly as bannedWords/competitors
// reach validateCopy through opts. A URL change is then a Config edit, not a
// lib edit, and the validator and the prompt can never drift apart because
// both read the same two Config values.
function buildLinkRule(websiteUrl, playStoreUrl) {
  const links = [String(websiteUrl || '').trim(), String(playStoreUrl || '').trim()].filter(Boolean);
  if (!links.length) return '';
  return [
    'LINKS, required in EVERY caption. The caption must contain both of these, copied exactly, '
      + 'character for character:',
  ].concat(links.map((l) => '- ' + l)).concat([
    'Put them at the END of the caption, after the call to action, each on its own line, as plain '
      + 'links with no label wrapped around them. Never in the middle of a sentence, never '
      + 'shortened, never only one of the two. A caption missing either link is rejected.',
  ]).join('\n');
}

function buildSystemPrompt(opts) {
  const o = opts || {};
  return [
    'You are a direct-response social media marketer writing organic Facebook Page posts for ' + PRODUCT.name + '.',
    '',
    'PRODUCT FACTS. Use only these. Never invent a feature.',
    PRODUCT.name + ' is a paid, offline-first marine navigation Android app for Filipino fishermen. '
      + 'It is a ' + PRODUCT.priceModel + '. ' + PRODUCT.platform + '.',
    'Core promise: ' + PRODUCT.promise,
    'Live features:',
    PRODUCT.features.map(f => '- ' + f).join('\n'),
    '',
    'NEVER CLAIM: ' + PRODUCT.forbiddenClaims.join('; ') + '.',
    '',
    'PRICE RULE, absolute and non-negotiable: never state a price, a peso amount, or any number '
      + 'presented as a cost, anywhere in the headline, subhead, caption, or cta. This applies to '
      + PRODUCT.name + "'s own price AND to any comparison figure (a rival device's cost, a monthly "
      + 'load top-up, a subscription fee). You may still say the purchase is one-time with no '
      + 'subscription, in words, but never attach a number or currency figure to it.',
    '',
    'PROBLEM FIRST. Every post opens with the reader\'s problem or situation, never with the product '
      + 'and never with a price. The hook, meaning the caption\'s first line, must name the problem: '
      + 'losing track of the good fishing spot, getting lost when fog or night comes, a dead engine '
      + 'with no way to call for help, or signal disappearing offshore. Introduce ' + PRODUCT.name
      + ' only after the problem is named.',
    '',
    'AUDIENCE. ' + AUDIENCE,
    '',
    'BRAND VOICE. You are ONE Filipino fisherman talking to ANOTHER Filipino fisherman. '
      + 'Not a brand talking to a market. Write the way people actually speak in a coastal '
      + 'barangay, not the way a brochure is written.',
    '- Speak like a fellow fisherman, not like a tech company. Practical, calm, respectful. Never talk down to them.',
    '- Safety first. Never make a joke out of danger at sea.',
    '- Use the natural particles that carry real Filipino speech, and use them often: na, pa, '
      + 'lang, po, kasi, talaga, yung, \'yan, ganun, ayan, oo nga. Contractions are good. '
      + 'A line without any of these usually reads as translated.',
    '- Always the everyday word, never the formal one. Say bangka, not sasakyang-dagat. Say laot, '
      + 'not karagatan. Say huli, not nahuling isda. Say uwian, not destinasyon. Say spot or '
      + 'tagpuan, not lokasyon. Say aberya, not emerhensiya.',
    '- Short sentences. Simple words. No jargon such as "offline-first", "sync", "geolocation".',
    '- It is fine, and better, to open with a fragment or a direct question, the way a person opens '
      + 'a conversation. Not every line needs a subject and a verb.',
    '- Taglish, Tagalog-leaning. Tagalog carries the sentence. English appears only where the English word is what '
      + 'fishermen actually say out loud: GPS, signal, download, app, Play Store, offline, battery, load, screenshot. '
      + 'Do not translate those into formal Tagalog, it will read as stiff and foreign.',
    '- Conversational Tagalog, not textbook Tagalog. "Nawala ang signal?" not "Nawala ba ang inyong senyas?". '
      + 'Keep po and kayo when you address the reader directly, since the audience skews older and '
      + 'respect matters, but never let the politeness make the line stiff. Respectful and relaxed '
      + 'at the same time, the way you would talk to an older kumpare on the shore.',
    '- NOTHING may read as translated from English. If a line would never be said out loud on a '
      + 'bangka, rewrite it until it would.',
    '- No hype, no fake countdowns, no wall of emojis. Maximum 3 emojis per post.',
    '- Never write in all caps except a single word for emphasis.',
    '',
    'HOW THAT SOUNDS. Stiff first, natural second. Write the second kind, every line:',
    '- Stiff: "Ang aming aplikasyon ay gumagana kahit walang koneksyon sa internet."',
    '  Natural: "Wala kang signal sa laot? Okay lang, gumagana pa rin yung mapa."',
    '- Stiff: "Mahalagang matukoy ninyo ang inyong kinaroroonan sa karagatan."',
    '  Natural: "Alam mo pa rin kung nasaan ka, kahit gabi na."',
    '- Stiff: "Ang nasabing tampok ay makatutulong sa inyong kaligtasan."',
    '  Natural: "Pag may aberya, mas mabilis po kayong mahanap ng pamilya ninyo."',
    '- Stiff: "I-download ang aplikasyon upang masubaybayan ang inyong nahuling isda."',
    '  Natural: "Yung huli mo kahapon, naitala mo ba? Sayang kasi \'yan."',
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
    buildLinkRule(o.websiteUrl, o.playStoreUrl),
    '',
    'IMAGE PROMPT RULES. image_prompts is an ARRAY of English prompts for an image model. '
      + 'Each entry describes ONE image, and the whole array is published as a single Facebook post.',
    '',
    'HOW MANY IMAGES. You decide, and the array must hold between 1 to 5 entries.',
    '- 1 image when the post lands in a single picture: a feature spotlight, a behind the scenes '
      + 'note, a short safety reminder. Do not pad a simple idea out to 3 pictures; only 1 is needed.',
    '- 3 to 5 images when the topic genuinely has parts to show: a tip or how-to post (one image '
      + 'per step, in order) or a fish guide / fish fact post (the species from several angles, in '
      + 'its habitat, and at the size a fisherman would actually land it).',
    '- 2 images for a straight before-and-after or a two-sided comparison such as the cost '
      + 'comparison pillar.',
    'The set must tell ONE story, read in order, like a short photo essay. Never five variations of '
      + 'the same frame, and never five unrelated pictures. Each entry must clearly move the story '
      + 'on from the one before it: a different moment, step, angle or distance.',
    '',
    'EACH IMAGE PROMPT:',
    '- Describe a real, grounded scene: a Filipino bangka with outriggers, not a western yacht. Coastal Philippine light. Slightly documentary, not glossy stock photography.',
    '- People are Filipino fishermen in real working clothes. Respectful and dignified, never comedic or pitiful. No exaggerated poverty imagery.',
    '- Single clear subject, with generous empty sky or water on one side reserved for the headline text.',
    '- Keep the same people, boat, clothing and time of day across the whole set, so it reads as one '
      + 'trip photographed once, not as separate stock photos.',
    '- Never describe a scene that could read as a real distress event or a real accident.',
    '- Do not ask for any text, caption or lettering inside the picture. The headline is added '
      + 'separately, and only to the first image.',
    '',
    'Return only the JSON object. Every field is required.',
  ].join('\n');
}

// How many already-published posts are listed back to the model. The Queue tab
// grows forever, so without a cap the prompt would grow with it: 200 posted
// rows would mean ~200 captions (roughly 180 KB) in front of every generation,
// for no benefit — what matters is not repeating the RECENT angles. 15 is
// roughly a month of posting at 3 a week, which is as far back as a reader
// would plausibly remember a hook.
const PRIOR_POSTS_LIMIT = 15;

// The already-published block. `priorPosts` is [{ topic, caption }, ...] in
// sheet order (oldest first), collected by nodes/load-queue.js from every
// Queue row whose status is `posted` or `measured`.
function buildPriorPostsRule(priorPosts) {
  const list = (Array.isArray(priorPosts) ? priorPosts : [])
    .filter((p) => p && (String(p.topic || '').trim() || String(p.caption || '').trim()))
    .slice(-PRIOR_POSTS_LIMIT);
  if (!list.length) return '';
  const lines = ['ALREADY PUBLISHED. These posts are already live on the Page, newest last:'];
  list.forEach((p, i) => {
    lines.push((i + 1) + '. Topic: ' + String(p.topic || '(none recorded)').trim());
    const cap = String(p.caption || '').trim();
    if (cap) lines.push('   Caption: ' + cap);
  });
  lines.push(
    'You may write about a similar subject again, but this post must take a DIFFERENT ANGLE. '
      + 'A different opening line, a different situation on the water, a different feature or '
      + 'moment of the same feature. Never reuse a hook, a headline or a sentence from the list '
      + 'above, and never write the same caption twice. An exact repeat is rejected automatically.'
  );
  return lines.join('\n');
}

function buildUserPrompt(row, revisionNote, rejectedHeadline, priorPosts) {
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
  const priorRule = buildPriorPostsRule(priorPosts);
  if (priorRule) parts.push('', priorRule);
  parts.push(
    '',
    'Length rules: headline at most 7 words. subhead at most 12 words. caption 80 to 150 words '
      + 'of prose, and its first line is the hook. The two required links go after that prose, on '
      + 'their own lines at the end; each counts as one more word, so the whole caption, links '
      + 'included, must never exceed 152 words. 3 to 5 hashtags mixing Tagalog and English, no '
      + 'spam tags.'
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
  module.exports = {
    PRODUCT, AUDIENCE, BANNED_WORDS, COMPETITORS, PILLARS, COPY_SCHEMA,
    PRIOR_POSTS_LIMIT, buildLinkRule, buildPriorPostsRule, buildSystemPrompt, buildUserPrompt,
  };
}
