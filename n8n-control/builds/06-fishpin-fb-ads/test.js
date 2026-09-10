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
});

// ---------------------------------------------------------------- results
console.log('\n' + '─'.repeat(40));
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fails.length) console.log('Failed: ' + fails.join('; '));
process.exit(fail ? 1 : 0);
