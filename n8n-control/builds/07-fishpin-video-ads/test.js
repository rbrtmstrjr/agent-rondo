// FishPin Video Ads — offline unit tests. No dependencies.
// Run:  node test.js              (all)
//       node test.js --only=script
const path = require('path');
const fs = require('fs');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

let pass = 0, fail = 0; const fails = [];
const PENDING = [];
const defer = (label, p) => PENDING.push(Promise.resolve(p).catch((e) => check(label + ' threw: ' + e.message, false)));
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
const L06 = (f) => require(path.join(__dirname, '..', '06-fishpin-fb-ads', 'lib', f));

// ---------------------------------------------------------------- script
section('script', 'Script validation', () => {
  const S = L('script-rules.js');
  const B = L06('brand.js');
  const C = L06('copy-rules.js');
  const OPTS = { checkProse: C.checkProse, bannedWords: B.BANNED_WORDS, competitors: B.COMPETITORS,
    pillars: Object.keys(B.PILLARS), priorVideos: [] };

  const good = {
    pillar: 'safety',
    topic: 'Finding the way home when fog and night come',
    hook: 'Nawala ang signal, gabi na sa laot',
    voiceover: 'Gabi na, makapal ang ulap, at nawala ang signal sa laot. Kinakabahan ka, di ba? '
      + 'Nasa bahay ang pamilya, naghihintay. Sa FishPin, alam mo pa rin kung nasaan ka, kahit walang '
      + 'internet. Naka-save ang iyong daan pauwi, at ang compass ay nagtuturo sa uwian. Mas panatag '
      + 'ang biyahe, mas panatag ang pamilya. I-download na po.',
    description: 'Nawala ang signal sa laot at gabi na? Huwag mag-alala.\n\nSa FishPin, alam mo pa rin '
      + 'kung nasaan ka at ang daan pauwi, kahit walang internet. Para sa mas panatag na biyahe.',
    hashtags: ['#FishPin', '#Mangingisda', '#KaligtasanSaLaot'],
    scenes: [
      { beat: 'hook', type: 'veo', seconds: 3, prompt: 'Fog rolls over a bangka at dusk, the fisherman looks up.' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'Dark sea, no shoreline visible, a single lantern.' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'A mother at a doorway looking out to sea at night.' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'navigate' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'offline' },
      { beat: 'relief', type: 'image', seconds: 5, prompt: 'The bangka reaches the shore at dawn, family waving.' },
    ],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const w = (mut) => { const s = clone(good); mut(s); return s; };
  const rejects = (name, s, rx, opts) => {
    const r = S.validateScript(s, opts || OPTS);
    check(name, r.valid === false && r.reasons.some((x) => rx.test(x)));
    if (!(r.valid === false && r.reasons.some((x) => rx.test(x)))) console.log('     got: ' + JSON.stringify(r.reasons));
  };
  const words = (n) => Array.from({ length: n }, () => 'salita').join(' ');

  const g = S.validateScript(good, OPTS);
  check('accepts the clean script', g.valid === true);
  check('clean script has no reasons', g.reasons.length === 0);
  if (g.reasons.length) console.log('     got: ' + JSON.stringify(g.reasons));

  rejects('rejects when prose rules are not wired', good, /prose rules/, Object.assign({}, OPTS, { checkProse: undefined }));
  rejects('rejects the social proof pillar', w((s) => { s.pillar = 'social proof'; }), /social proof/);
  rejects('rejects an unknown pillar', w((s) => { s.pillar = 'giveaway'; }), /pillar/);
  rejects('rejects an empty topic', w((s) => { s.topic = ' '; }), /topic/);
  rejects('rejects a 9-word hook', w((s) => { s.hook = words(9); }), /hook/);
  rejects('rejects a 44-word voiceover', w((s) => { s.voiceover = words(44); }), /voiceover/);
  rejects('rejects a 71-word voiceover', w((s) => { s.voiceover = words(71); }), /voiceover/);
  rejects('rejects a 19-word description', w((s) => { s.description = words(19); }), /description/);
  rejects('rejects a 3-paragraph description',
    w((s) => { s.description = words(8) + '\n\n' + words(8) + '\n\n' + words(8); }), /paragraph/);
  rejects('rejects a link in the description', w((s) => { s.description += ' www.fishpin.app'; }), /link/);
  rejects('rejects a hashtag in the description', w((s) => { s.description += ' #FishPin'; }), /hashtag/);
  rejects('rejects 2 hashtags', w((s) => { s.hashtags = ['#a', '#b']; }), /hashtags/);
  rejects('rejects 4 scenes', w((s) => { s.scenes = s.scenes.slice(0, 4); }), /scenes/);
  rejects('rejects 7 scenes', w((s) => { s.scenes.push({ beat: 'relief', type: 'image', seconds: 1, prompt: 'x' }); }), /scenes/);
  rejects('rejects a first scene that is not the Veo hook', w((s) => { s.scenes[0].type = 'image'; }), /first scene/);
  rejects('rejects two Veo scenes', w((s) => { s.scenes[1].type = 'veo'; }), /exactly one/);
  rejects('rejects an unknown screen id', w((s) => { s.scenes[3].screen = 'sos'; }), /screen/);
  rejects('rejects the sign-in screen', w((s) => { s.scenes[3].screen = 'signin'; }), /screen/);
  rejects('rejects zero screen scenes',
    w((s) => { s.scenes[3] = { beat: 'demo', type: 'image', seconds: 4, prompt: 'x' };
      s.scenes[4] = { beat: 'demo', type: 'image', seconds: 4, prompt: 'y' }; }), /screen/);
  rejects('rejects three screen scenes', w((s) => { s.scenes[5] = { beat: 'relief', type: 'screen', seconds: 5, screen: 'smarter' }; }), /screen/);
  rejects('rejects an image scene without a prompt', w((s) => { s.scenes[1].prompt = ''; }), /prompt/);
  rejects('rejects an unknown beat', w((s) => { s.scenes[1].beat = 'cta'; }), /beat/);
  rejects('rejects zero seconds', w((s) => { s.scenes[1].seconds = 0; }), /seconds/);
  rejects('rejects a 17s plan', w((s) => { s.scenes[5].seconds = 1; }), /planned/);
  rejects('rejects a 29s plan', w((s) => { s.scenes[5].seconds = 13; }), /planned/);
  rejects('rejects an em dash in the voiceover', w((s) => { s.voiceover = s.voiceover.replace('Kinakabahan ka,', 'Kinakabahan ka —'); }), /Em dash found in voiceover/);
  rejects('rejects a price in the description', w((s) => { s.description = s.description.replace('Para sa', 'Halagang P999 lang, para sa'); }), /price/);
  rejects('rejects an exact repeat of a published hook', good, /already been published/,
    Object.assign({}, OPTS, { priorVideos: [{ hook: good.hook, voiceover: 'other' }] }));
  rejects('rejects a whitespace/case variant of a published voiceover', good, /already been published/,
    Object.assign({}, OPTS, { priorVideos: [{ hook: 'other', voiceover: '  ' + good.voiceover.toUpperCase() + ' ' }] }));
  check('allows a near-duplicate hook (exact-match rule only)',
    S.validateScript(good, Object.assign({}, OPTS, { priorVideos: [{ hook: good.hook + ' po', voiceover: 'other' }] })).valid === true);

  check('screen allowlist is exactly the six approved ids',
    JSON.stringify(S.SCREEN_IDS) === JSON.stringify(['offline', 'spots', 'path', 'navigate', 'dashboard', 'smarter']));
  check('screen allowlist excludes the sign-in screen', S.SCREEN_IDS.indexOf('signin') === -1 && S.SCREEN_IDS.indexOf('onboarding6') === -1);
});

// ---------------------------------------------------------------- plan
section('plan', 'Scene plan to render payload', () => {
  const P = L('scene-plan.js');
  const script = {
    voiceover: 'Gabi na, nawala ang signal.',
    scenes: [
      { beat: 'hook', type: 'veo', seconds: 3, prompt: 'fog' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'a' },
      { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'b' },
      { beat: 'demo', type: 'screen', seconds: 4, screen: 'navigate' },
      { beat: 'relief', type: 'image', seconds: 5, prompt: 'c' },
    ],
  };
  const assets = { voiceoverB64: 'VO', hookClipB64: 'CLIP', hookStillB64: 'STILL', imagesB64: ['I1', 'I2', 'I3'] };
  const cfg = { endCardCta: 'I-download sa Play Store', websiteUrl: 'www.fishpin.app', endCardSeconds: 3.5 };

  check('screen urls are all on www.fishpin.app',
    Object.keys(P.SCREEN_URLS).every((k) => P.SCREEN_URLS[k].indexOf('https://www.fishpin.app/') === 0));
  check('navigate is onboarding4', P.SCREEN_URLS.navigate === 'https://www.fishpin.app/images/onboarding/onboarding4.png');
  check('dashboard is features1', P.SCREEN_URLS.dashboard === 'https://www.fishpin.app/images/features/features1.jpg');
  check('no url points at onboarding6', !JSON.stringify(P.SCREEN_URLS).includes('onboarding6'));
  check('counts image scenes', P.imageSceneCount(script) === 3);

  const r = P.buildRenderPayload(script, assets, cfg);
  check('ok with complete assets', r.ok === true && r.reason === '');
  check('no fallback when the clip exists', r.hookFallback === false);
  check('payload is 1080x1920 at 30fps', r.payload.width === 1080 && r.payload.height === 1920 && r.payload.fps === 30);
  check('payload carries voiceover audio and script text', r.payload.audio_b64 === 'VO' && r.payload.script === script.voiceover);
  check('payload language is Tagalog', r.payload.language === 'tl');
  check('hook becomes a video scene with ambient sound',
    JSON.stringify(r.payload.scenes[0]) === JSON.stringify({ type: 'video', b64: 'CLIP', seconds: 3, ambient: true }));
  check('images keep script order', r.payload.scenes[1].b64 === 'I1' && r.payload.scenes[2].b64 === 'I2' && r.payload.scenes[4].b64 === 'I3');
  check('screen scene resolves its url',
    JSON.stringify(r.payload.scenes[3]) === JSON.stringify({ type: 'screen', url: P.SCREEN_URLS.navigate, seconds: 4 }));
  check('end card comes from cfg',
    JSON.stringify(r.payload.end_card) === JSON.stringify({ cta: 'I-download sa Play Store', url: 'www.fishpin.app', seconds: 3.5 }));

  const fb = P.buildRenderPayload(script, Object.assign({}, assets, { hookClipB64: '' }), cfg);
  check('missing clip falls back to the still', fb.ok === true && fb.hookFallback === true);
  check('fallback hook is a punched image of the still',
    JSON.stringify(fb.payload.scenes[0]) === JSON.stringify({ type: 'image', b64: 'STILL', seconds: 3, punch: true }));

  const noStill = P.buildRenderPayload(script, Object.assign({}, assets, { hookClipB64: '', hookStillB64: '' }), cfg);
  check('no clip and no still is not ok', noStill.ok === false && /hook/.test(noStill.reason) && noStill.payload === null);
  const short = P.buildRenderPayload(script, Object.assign({}, assets, { imagesB64: ['I1'] }), cfg);
  check('too few images is not ok', short.ok === false && /image/.test(short.reason));
  const badScreen = P.buildRenderPayload({ voiceover: 'x', scenes: [script.scenes[0], { beat: 'demo', type: 'screen', seconds: 4, screen: 'signin' }] },
    assets, cfg);
  check('unknown screen is not ok', badScreen.ok === false && /screen/.test(badScreen.reason));
  const noVo = P.buildRenderPayload(script, Object.assign({}, assets, { voiceoverB64: '' }), cfg);
  check('missing voiceover is not ok', noVo.ok === false && /voiceover/.test(noVo.reason));
});

// ---------------------------------------------------------------- prompt
section('prompt', 'Script prompts and generation requests', () => {
  const V = L('video-prompt.js');
  const S = L('script-rules.js');
  const B = L06('brand.js');
  const I = L06('image-rules.js');
  const voice = B.buildVoiceRules();

  const schema = V.buildScriptSchema(S.SCREEN_IDS, S.BEATS);
  check('schema requires all seven top-level fields',
    JSON.stringify(schema.required) === JSON.stringify(['pillar', 'topic', 'hook', 'voiceover', 'description', 'hashtags', 'scenes']));
  check('schema restricts screen to the allowlist',
    JSON.stringify(schema.properties.scenes.items.properties.screen.enum) === JSON.stringify(S.SCREEN_IDS));
  check('schema restricts scene type', JSON.stringify(schema.properties.scenes.items.properties.type.enum) === JSON.stringify(['veo', 'image', 'screen']));
  check('screen guide covers exactly the allowlist', JSON.stringify(Object.keys(V.SCREEN_GUIDE)) === JSON.stringify(S.SCREEN_IDS));

  const sys = V.buildScriptSystemPrompt(voice);
  check('system prompt includes the shared voice rules verbatim', sys.indexOf(voice) !== -1);
  check('system prompt states the length and scene rules',
    /8 words/.test(sys) && /45 to 70 words/.test(sys) && /first scene/i.test(sys) && /exactly one veo/i.test(sys) && /1 or 2 screen/i.test(sys));
  check('system prompt names every approved screen', S.SCREEN_IDS.every((id) => sys.indexOf('"' + id + '"') !== -1));
  check('system prompt forbids drawn app screens and text in images', /never draw an app screen/i.test(sys) && /no text/i.test(sys));
  check('system prompt forbids the social proof pillar', /social proof/i.test(sys));

  const withTopic = V.buildScriptUserPrompt({ topicInput: 'SOS feature for night fishing', pillars: Object.keys(B.PILLARS) });
  check('user prompt carries the typed topic', withTopic.indexOf('SOS feature for night fishing') !== -1);
  const noTopic = V.buildScriptUserPrompt({ topicInput: '', pillars: Object.keys(B.PILLARS) });
  check('blank topic lists pillars without social proof', /cost comparison/.test(noTopic) && !/social proof/.test(noTopic));
  const prior = Array.from({ length: 20 }, (_, i) => ({ hook: 'hook number ' + i, topic: 't' + i }));
  const withPrior = V.buildScriptUserPrompt({ topicInput: '', pillars: [], priorVideos: prior });
  check('prior videos are capped to the most recent 15',
    withPrior.indexOf('hook number 19') !== -1 && withPrior.indexOf('hook number 5') !== -1 && withPrior.indexOf('hook number 4') === -1);

  const still = V.buildStillRequest('A fisherman at dusk.', I.STYLE_SUFFIX, I.NEGATIVES);
  check('still is a 9:16 image request',
    still.generationConfig.imageConfig.aspectRatio === '9:16' && JSON.stringify(still.generationConfig.responseModalities) === '["IMAGE"]');
  const stillText = still.contents[0].parts[0].text;
  check('still prompt has no brand lockup instruction', !/BRAND LOCKUP/.test(stillText) && still.contents[0].parts.length === 1);
  check('still prompt forbids logos and text', /no logo/i.test(stillText) && /no text/i.test(stillText));
  check('video negatives drop the supplied-logo exception', V.videoNegatives(I.NEGATIVES).every((n) => !/FishPin logo/.test(n)));

  const veo = V.buildVeoRequest('B64', 'image/png', 'Fog rolls in.', { veoResolution: '1080p', veoSeconds: 6 });
  check('Veo request is 9:16, 1080p, 6 seconds, adults only',
    JSON.stringify(veo.parameters) === JSON.stringify({ aspectRatio: '9:16', resolution: '1080p', durationSeconds: '6', personGeneration: 'allow_adult' }));
  check('Veo request animates the still', veo.instances[0].image.inlineData.data === 'B64' && veo.instances[0].image.inlineData.mimeType === 'image/png');

  const tts = V.buildTtsRequest('Gabi na sa laot.', 'Gacrux');
  check('TTS request uses the voice and returns audio',
    tts.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Gacrux'
      && JSON.stringify(tts.generationConfig.responseModalities) === '["AUDIO"]'
      && tts.contents[0].parts[0].text.indexOf('Gabi na sa laot.') !== -1);
});

// ---------------------------------------------------------------- sheet
section('sheet', 'Videos tab rules', () => {
  const V = L('video-sheet-rules.js');
  check('headers are exactly the 10 Videos columns in order', JSON.stringify(V.VIDEO_HEADERS) === JSON.stringify(
    ['id', 'created_at', 'topic_input', 'pillar', 'topic', 'hook', 'voiceover', 'status', 'video_url', 'est_cost_usd']));
  check('column letters', V.columnLetter(0) === 'A' && V.columnLetter(7) === 'H' && V.columnLetter(9) === 'J');

  const values = [V.VIDEO_HEADERS,
    ['VID-1', '', '', 'safety', 't1', 'h1', 'v1', 'delivered'],
    ['VID-2', '', '', 'safety', 't2', 'h2', 'v2', 'failed']];
  const rows = V.parseValues(values);
  check('parses rows with sheet row numbers', rows.length === 2 && rows[0]._rowNumber === 2 && rows[1].hook === 'h2');
  check('prior videos come only from delivered rows', JSON.stringify(V.collectPriorVideos(rows)) === JSON.stringify([{ hook: 'h1', voiceover: 'v1', topic: 't1' }]));
  const many = Array.from({ length: 20 }, (_, i) => ({ status: 'delivered', hook: 'h' + i, voiceover: 'v', topic: 't' }));
  const capped = V.collectPriorVideos(many);
  check('prior videos are capped to the most recent 15', capped.length === 15 && capped[0].hook === 'h5' && capped[14].hook === 'h19');

  const row = V.buildNewRow({ id: 'VID-9', createdAt: '2026-09-15T01:02:03Z', topicInput: 'SOS at night' });
  check('new row has 10 cells', row.length === 10);
  check('new row places id, time and topic input', row[0] === 'VID-9' && row[1] === '2026-09-15T01:02:03Z' && row[2] === 'SOS at night');
  check('new row starts generating', row[7] === 'generating');

  check('row number from an append range', V.rowNumberFromAppend({ updates: { updatedRange: 'Videos!A7:J7' } }) === 7);
  check('row number from a quoted tab name', V.rowNumberFromAppend({ updates: { updatedRange: "'Videos'!A12:J12" } }) === 12);
  check('row number is null when absent', V.rowNumberFromAppend({}) === null);

  const up = V.statusUpdate('Videos', 5, { video_url: 'https://files.slack.com/x', status: 'delivered', nonsense: 'x' });
  check('status update targets exact cells in header order', JSON.stringify(up) === JSON.stringify({ valueInputOption: 'RAW', data: [
    { range: 'Videos!H5', values: [['delivered']] }, { range: 'Videos!I5', values: [['https://files.slack.com/x']] }] }));
  check('video id format', V.newVideoId(new Date(Date.UTC(2026, 8, 15, 1, 2, 3))) === 'VID-20260915-010203');
  check('cost with a Veo hook and 4 images', V.estCost({ veoUsed: true, veoSeconds: 6, images: 4 }) === 0.65);
  check('cost after a Veo fallback', V.estCost({ veoUsed: false, veoSeconds: 6, images: 4 }) === 0.17);
});

// ---------------------------------------------------------------- glue harness
// Runs a real glue body exactly as build.js assembles it, under AsyncFunction,
// with a fake n8n: $('Node') serves canned items (isExecuted false and a throw
// on read for anything not supplied), and binaries are base64 in memory.
const { NODE_LIBS, assemble } = require('./node-libs.js');
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const binOf = (buf, mimeType, fileName) => ({ data: buf.toString('base64'), mimeType, fileName: fileName || 'data', fileSize: String(buf.length) });
async function runNode(file, ctx) {
  const c = ctx || {};
  const store = c.nodes || {};
  const input = c.input || [{ json: {} }];
  const $ = (name) => {
    const list = store[name];
    if (!list) {
      const boom = () => { throw new Error("$('" + name + "') was read but has not executed"); };
      return { isExecuted: false, first: boom, all: boom };
    }
    return { isExecuted: true, first: () => list[0], all: () => list };
  };
  const helpers = {
    prepareBinaryData: async (buf, fileName, mimeType) => binOf(buf, mimeType, fileName),
    getBinaryDataBuffer: async (i, prop) => Buffer.from(input[i].binary[prop].data, 'base64'),
  };
  const fn = new AsyncFn('$', '$json', '$input', 'items', '$runIndex', assemble(file));
  return fn.call({ helpers }, $, input[0].json, { first: () => input[0], all: () => input }, input, c.runIndex || 0);
}
const J = (json) => [{ json }];
const glue = (label, file, ctx, assert) => defer(label, runNode(file, ctx).then((out) => assert(out, (out && out[0] && out[0].json) || {})));

const CFG = {
  sheetId: 'SHEET', videosTab: 'Videos', deliveryChannel: 'C0C1WS8PAAJ', opsChannel: 'C0C1WS8PAAJ',
  scriptModel: 'gemini-2.5-flash', scriptTemperature: 0.9, imageModel: 'gemini-2.5-flash-image',
  veoModel: 'veo-3.1-lite-generate-preview', veoSeconds: 6, veoResolution: '1080p', veoMaxWaitMinutes: 8,
  ttsModel: 'gemini-3.1-flash-tts-preview', ttsVoice: 'Gacrux', maxScriptRetries: 3,
  renderUrl: 'http://172.18.0.1:8088/render-ad', websiteUrl: 'www.fishpin.app',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.fishpin.app',
  endCardCta: 'I-download sa Play Store', endCardSeconds: 3.5, postCta: 'I-download ang FishPin sa Play Store.',
  triggerSecret: 'test-trigger-secret', renderToken: 'test-render-token',
};
const GOOD_SCRIPT = {
  pillar: 'safety',
  topic: 'Finding the way home when fog and night come',
  hook: 'Nawala ang signal, gabi na sa laot',
  voiceover: 'Gabi na, makapal ang ulap, at nawala ang signal sa laot. Kinakabahan ka, di ba? '
    + 'Nasa bahay ang pamilya, naghihintay. Sa FishPin, alam mo pa rin kung nasaan ka, kahit walang '
    + 'internet. Naka-save ang iyong daan pauwi, at ang compass ay nagtuturo sa uwian. Mas panatag '
    + 'ang biyahe, mas panatag ang pamilya. I-download na po.',
  description: 'Nawala ang signal sa laot at gabi na? Huwag mag-alala.\n\nSa FishPin, alam mo pa rin '
    + 'kung nasaan ka at ang daan pauwi, kahit walang internet. Para sa mas panatag na biyahe.',
  hashtags: ['#FishPin', '#Mangingisda', '#KaligtasanSaLaot'],
  scenes: [
    { beat: 'hook', type: 'veo', seconds: 3, prompt: 'Fog rolls over a bangka at dusk, the fisherman looks up.' },
    { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'Dark sea, no shoreline visible, a single lantern.' },
    { beat: 'stakes', type: 'image', seconds: 2.5, prompt: 'A mother at a doorway looking out to sea at night.' },
    { beat: 'demo', type: 'screen', seconds: 4, screen: 'navigate' },
    { beat: 'demo', type: 'screen', seconds: 4, screen: 'offline' },
    { beat: 'relief', type: 'image', seconds: 5, prompt: 'The bangka reaches the shore at dawn, family waving.' },
  ],
};
const HEADERS = ['id', 'created_at', 'topic_input', 'pillar', 'topic', 'hook', 'voiceover', 'status', 'video_url', 'est_cost_usd'];
const SHEET_VALUES = { values: [HEADERS,
  ['VID-1', '', '', 'safety', 't1', 'h1', 'v1', 'delivered'],
  ['VID-2', '', 'topic two', 'safety', 't2', 'h2', 'v2', 'failed']] };
const SET_ROW_NEW = { ok: true, id: 'VID-20260915-010203', row_number: 7, topic_input: 'SOS at night', prior_videos: [], new_row: [] };
const geminiText = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const geminiInline = (b64, mimeType) => ({ candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType } }] } }] });
const HOOK_B64 = Buffer.alloc(30000, 1).toString('base64');
const SCENE_B64 = Buffer.alloc(30000, 2).toString('base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200000)]);
const withCfg = (over) => J(Object.assign({}, CFG, over || {}));

// ---------------------------------------------------------------- gen
section('gen', 'Generation glue (real node bodies)', () => {
  const S = L('script-rules.js');
  const hook9 = Object.assign({}, GOOD_SCRIPT, { hook: 'salita salita salita salita salita salita salita salita salita' });
  const webhook = (body) => [{ json: { body } }];

  // start-run
  glue('start-run manual', 'start-run.js', { nodes: { Config: withCfg() }, input: J(SHEET_VALUES) }, (o, j) => {
    check('start-run: a manual run starts a new video with no topic', j.ok === true && /^VID-\d{8}-\d{6}$/.test(j.id) && j.topic_input === '');
    check('start-run: the new row starts generating', j.new_row.length === 10 && j.new_row[0] === j.id && j.new_row[7] === 'generating');
    check('start-run: only delivered rows become prior videos', j.prior_videos.length === 1 && j.prior_videos[0].hook === 'h1');
  });
  glue('start-run topic', 'start-run.js', { nodes: { Config: withCfg(), 'Trigger Webhook': webhook({ secret: CFG.triggerSecret, topic: 'SOS\n\tat   night' }) }, input: J(SHEET_VALUES) }, (o, j) => {
    check('start-run: the trigger page topic is cleaned and kept', j.topic_input === 'SOS at night' && j.new_row[2] === 'SOS at night');
  });
  glue('start-run long', 'start-run.js', { nodes: { Config: withCfg(), 'Trigger Webhook': webhook({ secret: CFG.triggerSecret, topic: 'x'.repeat(300) }) }, input: J(SHEET_VALUES) }, (o, j) => {
    check('start-run: a 300-character topic is capped at 200', j.topic_input.length === 200);
  });
  glue('start-run secret', 'start-run.js', { nodes: { Config: withCfg(), 'Trigger Webhook': webhook({ secret: 'nope' }) }, input: J(SHEET_VALUES) }, (o, j) => {
    check('start-run: a wrong secret is rejected', j.ok === false && j.status === 'rejected' && /secret/.test(j.message));
  });
  glue('start-run placeholder', 'start-run.js', { nodes: { Config: withCfg({ triggerSecret: 'FILL_IN_VIDEO_TRIGGER_SECRET' }), 'Trigger Webhook': webhook({ secret: 'FILL_IN_VIDEO_TRIGGER_SECRET' }) }, input: J(SHEET_VALUES) }, (o, j) => {
    check('start-run: a placeholder secret rejects every webhook call', j.ok === false && /placeholder/.test(j.message));
  });
  glue('start-run headers', 'start-run.js', { nodes: { Config: withCfg() }, input: J({ values: [['id', 'x']] }) }, (o, j) => {
    check('start-run: a wrong header row is rejected', j.ok === false && /header row/.test(j.message));
  });
  glue('start-run sheets', 'start-run.js', { nodes: { Config: withCfg() }, input: J({ error: { message: '403 forbidden' } }) }, (o, j) => {
    check('start-run: a Sheets error is rejected', j.ok === false && /could not read/.test(j.message));
  });

  // set-row
  const started = { ok: true, id: 'VID-20260915-010203', topic_input: '', prior_videos: [], new_row: [] };
  glue('set-row new', 'set-row.js', { nodes: { Config: withCfg(), 'Start Run': J(started) }, input: J({ updates: { updatedRange: 'Videos!A7:J7' } }) }, (o, j) => {
    check('set-row: takes the row number from the append response', j.ok === true && j.row_number === 7 && j.id === started.id);
  });
  glue('set-row append failed', 'set-row.js', { nodes: { Config: withCfg(), 'Start Run': J(started) }, input: J({ error: { message: 'quota exceeded' } }) }, (o, j) => {
    check('set-row: a failed append stops the run before any spend', j.ok === false && j.status === 'failed' && /quota exceeded/.test(j.message));
  });

  // build-script-request
  const bodyOf = (j) => JSON.parse(j.geminiBody);
  const userText = (j) => bodyOf(j).contents[0].parts[0].text;
  glue('script request', 'build-script-request.js', { nodes: { Config: withCfg(), 'Set Row': J(SET_ROW_NEW) }, input: J({ spreadsheetId: 'SHEET' }) }, (o, j) => {
    const b = bodyOf(j);
    check('build-script-request: asks for JSON matching the script schema', b.generationConfig.responseMimeType === 'application/json'
      && JSON.stringify(b.generationConfig.responseSchema.properties.scenes.items.properties.screen.enum) === JSON.stringify(S.SCREEN_IDS));
    check('build-script-request: the system prompt carries the video rules and the brand voice',
      /VIDEO AD RULES/.test(b.systemInstruction.parts[0].text) && /BRAND VOICE/.test(b.systemInstruction.parts[0].text));
    check('build-script-request: the typed topic reaches the prompt', userText(j).indexOf('SOS at night') !== -1);
  });
  glue('script request retry', 'build-script-request.js', { nodes: { Config: withCfg(), 'Set Row': J(SET_ROW_NEW) }, input: J({ valid: false, reasons: ['hook is 9 words, must be 1 to 8.'] }) }, (o, j) => {
    check('build-script-request: the last try\'s validator reasons are fed back', userText(j).indexOf('hook is 9 words, must be 1 to 8.') !== -1);
  });

  // validate-script
  const vsNodes = (setRow) => ({ Config: withCfg(), 'Set Row': J(setRow || SET_ROW_NEW) });
  glue('validate clean', 'validate-script.js', { nodes: vsNodes(), input: J(geminiText(GOOD_SCRIPT)) }, (o, j) => {
    check('validate-script: accepts a clean script on the first try', j.valid === true && j.script.hook === GOOD_SCRIPT.hook && j.script_try === 1);
  });
  glue('validate retry', 'validate-script.js', { nodes: vsNodes(), input: J(geminiText(hook9)) }, (o, j) => {
    check('validate-script: an invalid script under the cap asks for a retry', j.valid === false && j.retry === true && j.reasons.some((r) => /hook/.test(r)));
  });
  glue('validate cap', 'validate-script.js', { nodes: vsNodes(), input: J(geminiText(hook9)), runIndex: 2 }, (o, j) => {
    check('validate-script: the third invalid script stops as needs_manual', j.retry === false && j.status === 'needs_manual' && /3 times/.test(j.message));
  });
  glue('validate json', 'validate-script.js', { nodes: vsNodes(), input: J(geminiText('not json')) }, (o, j) => {
    check('validate-script: unparseable output is a reason, not a crash', j.valid === false && j.reasons.some((r) => /not valid JSON/.test(r)));
  });
  glue('validate repeat', 'validate-script.js', { nodes: vsNodes(Object.assign({}, SET_ROW_NEW, { prior_videos: [{ hook: GOOD_SCRIPT.hook, voiceover: 'x', topic: 't' }] })), input: J(geminiText(GOOD_SCRIPT)) }, (o, j) => {
    check('validate-script: an exact repeat of an earlier hook is rejected', j.valid === false && j.reasons.some((r) => /already been published/.test(r)));
  });
  glue('validate error', 'validate-script.js', { nodes: vsNodes(), input: J({ error: { message: 'model overloaded' } }) }, (o, j) => {
    check('validate-script: a Gemini error becomes a reason', j.valid === false && j.reasons.some((r) => /no script/.test(r) && /overloaded/.test(r)));
  });

  // TTS
  const VS = J({ valid: true, script: GOOD_SCRIPT, script_try: 1 });
  glue('tts request', 'build-tts-request.js', { nodes: { Config: withCfg(), 'Validate Script': VS } }, (o, j) => {
    const b = JSON.parse(j.geminiBody);
    check('build-tts-request: uses the Config voice and the validated voiceover',
      b.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Gacrux' && b.contents[0].parts[0].text.indexOf(GOOD_SCRIPT.voiceover) !== -1);
  });
  const pcm = (seconds) => Buffer.alloc(24000 * 2 * seconds).toString('base64');
  glue('voice ok', 'voice-wav.js', { nodes: { 'Set Row': J(SET_ROW_NEW) }, input: J(geminiInline(pcm(12), 'audio/L16;codec=pcm;rate=24000')) }, (o, j) => {
    const wav = Buffer.from(j.wav_b64 || '', 'base64');
    check('voice-wav: wraps 24 kHz PCM in a WAV header', wav.toString('latin1', 0, 4) === 'RIFF' && wav.readUInt32LE(24) === 24000);
    check('voice-wav: reports the audio length', j.ok === true && j.seconds === 12);
  });
  glue('voice missing', 'voice-wav.js', { nodes: { 'Set Row': J(SET_ROW_NEW) }, input: J({ error: { message: 'tts down' } }) }, (o, j) => {
    check('voice-wav: missing audio stops the run before any image spend', j.ok === false && j.status === 'failed' && /TTS/.test(j.message));
  });
  glue('voice short', 'voice-wav.js', { nodes: { 'Set Row': J(SET_ROW_NEW) }, input: J(geminiInline(pcm(3), 'audio/L16;codec=pcm;rate=24000')) }, (o, j) => {
    check('voice-wav: audio under 10 seconds is refused', j.ok === false && /too short/.test(j.message));
  });

  // images
  glue('image requests', 'build-image-requests.js', { nodes: { 'Validate Script': VS } }, (o) => {
    check('build-image-requests: one request for the hook still plus each image scene', o.length === 4);
    check('build-image-requests: items keep their index and the hook still comes first',
      JSON.stringify(o.map((it) => it.json.index)) === '[0,1,2,3]' && o[0].json.role === 'hook still');
    check('build-image-requests: every request is a 9:16 still with no logo lockup', o.every((it) => {
      const b = JSON.parse(it.json.geminiBody);
      return b.generationConfig.imageConfig.aspectRatio === '9:16' && !/BRAND LOCKUP/.test(it.json.geminiBody);
    }));
  });
  const BIR = [0, 1, 2, 3].map((index) => ({ json: { index, role: index === 0 ? 'hook still' : 'scene image ' + index } }));
  const picsIn = [HOOK_B64, SCENE_B64, SCENE_B64, SCENE_B64].map((b) => ({ json: geminiInline(b, 'image/png') }));
  glue('collect ok', 'collect-images.js', { nodes: { 'Set Row': J(SET_ROW_NEW), 'Build Image Requests': BIR }, input: picsIn }, (o, j) => {
    check('collect-images: four pictures join into one item', o.length === 1 && j.ok === true && j.images_b64.length === 3 && j.image_count === 4);
    check('collect-images: the first picture is the hook still', j.hook_still_b64 === HOOK_B64 && j.images_b64[0] === SCENE_B64);
  });
  glue('collect one bad', 'collect-images.js', { nodes: { 'Set Row': J(SET_ROW_NEW), 'Build Image Requests': BIR },
    input: [picsIn[0], picsIn[1], { json: { error: { message: 'overloaded' } } }, picsIn[3]] }, (o, j) => {
    check('collect-images: one empty picture sinks the whole set', o.length === 1 && j.ok === false && /Image 3 of 4/.test(j.message));
  });
  glue('collect short', 'collect-images.js', { nodes: { 'Set Row': J(SET_ROW_NEW), 'Build Image Requests': BIR }, input: picsIn.slice(0, 3) }, (o, j) => {
    check('collect-images: fewer results than requests is refused', j.ok === false && /Expected 4/.test(j.message));
  });

  // Veo
  glue('veo request', 'build-veo-request.js', { nodes: { Config: withCfg(), 'Validate Script': VS,
    'Collect Images': J({ ok: true, hook_still_b64: 'STILL', hook_still_mime: 'image/png' }) } }, (o, j) => {
    const b = JSON.parse(j.veoBody);
    check('build-veo-request: animates the hook still at 9:16, 1080p, 6 seconds',
      b.parameters.durationSeconds === '6' && b.parameters.aspectRatio === '9:16' && b.parameters.resolution === '1080p'
        && b.instances[0].image.inlineData.data === 'STILL' && b.instances[0].prompt.indexOf(GOOD_SCRIPT.scenes[0].prompt) !== -1);
  });
  glue('veo started', 'check-veo-start.js', { input: J({ name: 'models/veo-3.1-lite-generate-preview/operations/abc' }) }, (o, j) => {
    check('check-veo-start: an operation name means started', j.started === true && /operations\/abc$/.test(j.name));
  });
  glue('veo not started', 'check-veo-start.js', { input: J({ error: { message: 'quota' } }) }, (o, j) => {
    check('check-veo-start: an error falls back instead of stopping', j.started === false && /quota/.test(j.reason));
  });
  const pollNodes = { Config: withCfg() };
  glue('veo done', 'check-veo-poll.js', { nodes: pollNodes, input: J({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://x/v.mp4' } }] } } }) }, (o, j) => {
    check('check-veo-poll: a finished operation yields the clip uri', j.state === 'done' && j.uri === 'https://x/v.mp4');
  });
  glue('veo pending', 'check-veo-poll.js', { nodes: pollNodes, input: J({ name: 'op' }) }, (o, j) => {
    check('check-veo-poll: an unfinished operation keeps polling', j.state === 'pending');
  });
  glue('veo timeout', 'check-veo-poll.js', { nodes: pollNodes, input: J({ name: 'op' }), runIndex: 31 }, (o, j) => {
    check('check-veo-poll: gives up after 8 minutes of polls', j.state === 'failed' && /8 minutes/.test(j.reason));
  });
  glue('veo filtered', 'check-veo-poll.js', { nodes: pollNodes, input: J({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['person filter'] } } }) }, (o, j) => {
    check('check-veo-poll: a filtered clip falls back with the filter reason', j.state === 'failed' && /person filter/.test(j.reason));
  });

  // render payload
  const renderNodes = (over) => Object.assign({
    Config: withCfg(), 'Set Row': J(SET_ROW_NEW), 'Validate Script': VS,
    'Collect Images': J({ ok: true, hook_still_b64: 'STILL', hook_still_mime: 'image/png', images_b64: ['I1', 'I2', 'I3'], image_count: 4 }),
    'Voice WAV': J({ ok: true, wav_b64: 'WAV', seconds: 24 }),
    'Check Veo Start': J({ started: true, name: 'op', reason: '' }),
  }, over || {});
  const payloadOf = (o) => JSON.parse(Buffer.from(o[0].binary.payload.data, 'base64').toString('utf8'));
  const clipItem = { json: {}, binary: { data: binOf(MP4, 'video/mp4') } };
  glue('payload clip', 'build-render-payload.js', { nodes: renderNodes({ 'Check Veo Poll': J({ state: 'done' }), 'Veo Download': [clipItem] }), input: [clipItem] }, (o, j) => {
    const p = payloadOf(o);
    check('build-render-payload: with the clip the hook is a video scene', j.ok === true && j.hook_fallback === false
      && p.scenes[0].type === 'video' && p.scenes[0].b64 === MP4.toString('base64'));
    check('build-render-payload: the body is handed on as a JSON binary', o[0].binary.payload.mimeType === 'application/json');
    check('build-render-payload: the payload carries the voiceover and the end card', p.audio_b64 === 'WAV' && p.end_card.cta === 'I-download sa Play Store');
  });
  const pollFailed = J({ state: 'failed', reason: 'Veo did not finish within 8 minutes.' });
  glue('payload fallback', 'build-render-payload.js', { nodes: renderNodes({ 'Check Veo Poll': pollFailed }), input: pollFailed }, (o, j) => {
    const p = payloadOf(o);
    check('build-render-payload: without a clip the hook is the punched still, with the reason', j.hook_fallback === true
      && /8 minutes/.test(j.veo_note) && p.scenes[0].type === 'image' && p.scenes[0].punch === true);
  });
  const badClip = { json: {}, binary: { data: binOf(Buffer.from('{"error":"denied"}'), 'application/json') } };
  glue('payload bad clip', 'build-render-payload.js', { nodes: renderNodes({ 'Check Veo Poll': J({ state: 'done' }), 'Veo Download': [badClip] }), input: [badClip] }, (o, j) => {
    check('build-render-payload: a download that is not a video falls back', j.hook_fallback === true && /not a usable video/.test(j.veo_note));
  });
  glue('payload token', 'build-render-payload.js', { nodes: renderNodes({ Config: withCfg({ renderToken: 'FILL_IN_RENDER_TOKEN' }), 'Check Veo Poll': pollFailed }), input: pollFailed }, (o, j) => {
    check('build-render-payload: a placeholder render token stops before rendering', j.ok === false && /renderToken/.test(j.message));
  });

  // check-render
  const crNodes = (over) => Object.assign({
    Config: withCfg(), 'Set Row': J(SET_ROW_NEW), 'Validate Script': VS,
    'Collect Images': J({ ok: true, image_count: 4 }),
    'Build Render Payload': J({ ok: true, hook_fallback: false, veo_note: '' }),
    'Check Veo Poll': J({ state: 'done' }),
  }, over || {});
  const mp4Item = { json: {}, binary: { data: binOf(MP4, 'video/mp4') } };
  glue('render ok', 'check-render.js', { nodes: crNodes(), input: [mp4Item] }, (o, j) => {
    check('check-render: an MP4 response is ok and keeps the video binary', j.ok === true && j.bytes === MP4.length && !!o[0].binary.video);
    check('check-render: the caption to paste is the composed message', j.post_message.indexOf('Huwag mag-alala.') !== -1
      && j.post_message.indexOf('www.fishpin.app') !== -1 && j.post_message.indexOf(CFG.playStoreUrl) !== -1
      && j.post_message.indexOf('#FishPin') !== -1 && j.post_message.indexOf(CFG.postCta) !== -1);
    check('check-render: the Slack message carries the hook, voiceover, caption and cost', j.message_text.indexOf(GOOD_SCRIPT.hook) !== -1
      && j.message_text.indexOf(GOOD_SCRIPT.voiceover) !== -1 && j.message_text.indexOf(j.post_message) !== -1
      && j.message_text.indexOf('$0.65') !== -1);
    check('check-render: the file is named by the video id and the cost is kept', j.file_name === 'VID-20260915-010203.mp4' && j.est_cost === 0.65);
  });
  const errItem = { json: {}, binary: { data: binOf(Buffer.from(JSON.stringify({ error: 'scene 2: b64 is required for image' })), 'application/json') } };
  glue('render error body', 'check-render.js', { nodes: crNodes(), input: [errItem] }, (o, j) => {
    check('check-render: a JSON error body is reported with its text', j.ok === false && /scene 2: b64 is required/.test(j.message));
  });
  glue('render connection', 'check-render.js', { nodes: crNodes(), input: J({ error: { message: 'ETIMEDOUT' } }) }, (o, j) => {
    check('check-render: a connection failure is reported', j.ok === false && /ETIMEDOUT/.test(j.message));
  });
  glue('render fallback cost', 'check-render.js', { nodes: crNodes({
    'Check Veo Poll': J({ state: 'failed' }),
    'Build Render Payload': J({ ok: true, hook_fallback: true, veo_note: 'Veo did not start: quota' }),
  }), input: [mp4Item] }, (o, j) => {
    check('check-render: a Veo fallback costs less and is noted in the message',
      j.est_cost === 0.17 && j.message_text.indexOf('$0.17') !== -1 && j.message_text.indexOf('Veo did not start: quota') !== -1);
  });
});

// ---------------------------------------------------------------- deliver
section('deliver', 'Slack delivery and failure sink glue (real node bodies)', () => {
  const VS = J({ valid: true, script: GOOD_SCRIPT, script_try: 1 });
  const SR = (over) => J(Object.assign({}, SET_ROW_NEW, over || {}));
  const renderItem = [{ json: { ok: true, bytes: MP4.length, file_name: 'VID-20260915-010203.mp4', est_cost: 0.65 },
    binary: { video: binOf(MP4, 'video/mp4') } }];
  const cells = (j) => JSON.stringify(j.sheet_body && j.sheet_body.data);
  const complete = (over) => J(Object.assign({ ok: true, files: [{ id: 'F1', permalink: 'https://fishpin.slack.com/files/U1/F1/vid.mp4' }] }, over || {}));

  // upload
  glue('reattach ok', 'reattach-video.js', { nodes: { 'Set Row': SR(), 'Check Render': renderItem },
    input: J({ ok: true, upload_url: 'https://files.slack.com/upload/v1/x', file_id: 'F1' }) }, (o, j) => {
    check('reattach-video: puts the MP4 back on the item for the byte upload',
      j.ok === true && j.file_id === 'F1' && o[0].binary.video.data === MP4.toString('base64'));
  });
  glue('reattach refused', 'reattach-video.js', { nodes: { 'Set Row': SR(), 'Check Render': renderItem }, input: J({ ok: false, error: 'invalid_auth' }) }, (o, j) => {
    check('reattach-video: Slack refusing the upload stops the run', j.ok === false && j.status === 'failed' && /invalid_auth/.test(j.message));
  });

  // delivery
  const dNodes = (over) => Object.assign({ Config: withCfg(), 'Set Row': SR(), 'Validate Script': VS, 'Check Render': renderItem, 'Slack Complete': complete() }, over || {});
  glue('delivery ok', 'check-delivery.js', { nodes: dNodes(), input: J({ ok: true, ts: '1726000000.0001' }) }, (o, j) => {
    check('check-delivery: a delivered message carries the Slack file link', j.ok === true && j.ts === '1726000000.0001'
      && j.video_url === 'https://fishpin.slack.com/files/U1/F1/vid.mp4');
    check('check-delivery: the row is marked delivered with the script, link and cost', cells(j) === JSON.stringify([
      { range: 'Videos!D7', values: [[GOOD_SCRIPT.pillar]] }, { range: 'Videos!E7', values: [[GOOD_SCRIPT.topic]] },
      { range: 'Videos!F7', values: [[GOOD_SCRIPT.hook]] }, { range: 'Videos!G7', values: [[GOOD_SCRIPT.voiceover]] },
      { range: 'Videos!H7', values: [['delivered']] }, { range: 'Videos!I7', values: [['https://fishpin.slack.com/files/U1/F1/vid.mp4']] },
      { range: 'Videos!J7', values: [['0.65']] }]));
  });
  glue('delivery upload failed', 'check-delivery.js', { nodes: dNodes({ 'Slack Complete': J({ ok: false, error: 'file_not_found' }) }), input: J({ ok: true, ts: '1' }) }, (o, j) => {
    check('check-delivery: an unfinished upload stops the run', j.ok === false && /upload/.test(j.message) && /file_not_found/.test(j.message));
  });
  glue('delivery not posted', 'check-delivery.js', { nodes: dNodes(), input: J({ ok: false, error: 'channel_not_found' }) }, (o, j) => {
    check('check-delivery: an undelivered message stops the run', j.ok === false && j.status === 'failed' && /channel_not_found/.test(j.message));
  });

  // failure sink
  glue('stop failed', 'stop.js', { nodes: { Config: withCfg(), 'Set Row': SR() }, input: J({ ok: false, status: 'failed', message: 'render failed' }) }, (o, j) => {
    check('stop: records the failure status on the row',
      j.has_row === true && j.message === 'render failed' && cells(j) === JSON.stringify([{ range: 'Videos!H7', values: [['failed']] }]));
  });
  glue('stop no row', 'stop.js', { nodes: { Config: withCfg() }, input: J({ ok: false, status: 'rejected', message: 'wrong secret' }) }, (o, j) => {
    check('stop: a run rejected before any row exists writes nothing', j.has_row === false && j.sheet_body === null && j.status === 'rejected');
  });
  glue('stop bad row', 'stop.js', { nodes: { Config: withCfg(), 'Set Row': J({ ok: false, status: 'failed', message: 'append failed' }) }, input: J({ status: 'failed', message: 'append failed' }) }, (o, j) => {
    check('stop: a failed Set Row writes nothing', j.has_row === false && j.sheet_body === null);
  });
  glue('stop no message', 'stop.js', { nodes: { Config: withCfg(), 'Set Row': SR() }, input: J({}) }, (o, j) => {
    check('stop: a missing message still says where to look', j.status === 'failed' && /n8n execution/.test(j.message));
  });
});

// ---------------------------------------------------------------- results
Promise.all(PENDING).then(() => {
  console.log('\n' + '─'.repeat(40));
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('Failed: ' + fails.join('; '));
  process.exit(fail ? 1 : 0);
});
