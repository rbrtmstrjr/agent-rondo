// ============================================================================
// Prepare — Code node (no credentials). FishPin knowledge base + a single
// batchEmbedContents request (all KB chunks + the user's question).
// KB content is drawn faithfully from the live site's source of truth:
// fishpin-web/lib/{site,faqs,features,comparison}.ts — keep in sync if the site changes.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Chat Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

const message = String(body.message || body.query || body.text || '').trim();
const sessionId = String(body.sessionId || body.session_id || 'anonymous').trim();

const KB = [
  { title: 'What is FishPin', text: 'FishPin is an offline marine navigation app built for Filipino fishermen. It combines offline marine maps, real-time GPS navigation, saved fishing hotspots, trail recording, weather and marine conditions, and an AI fish guide. The goal: everything you need to head out and come home safely, with no internet signal required. Tagline: marine navigation for Filipino fishermen.' },
  { title: 'Price and cost', text: 'FishPin costs 499 Philippine pesos (₱499), paid once on Google Play before you download. There is no subscription, no in-app purchases, no premium unlock, and no recurring fees. For comparison: Navionics is about ₱3,250 per year, Fishbrain Pro about ₱4,200 per year, and a Garmin chartplotter is roughly ₱8,000 to ₱30,000 in hardware.' },
  { title: 'Works offline without internet', text: 'Yes, FishPin works fully without internet. Once you download a region, it uses your phone\'s built-in GPS chip, which works without any signal, and renders the cached map tiles offline. It is offline-first and designed for life at sea, so no data plan is needed once you are out.' },
  { title: 'Supported devices and platform', text: 'FishPin is Android-first and runs on virtually any modern Android phone. iOS (iPhone) support is planned for later in the year. There is no special hardware required.' },
  { title: 'How to download and get FishPin', text: 'You can get FishPin on the Google Play Store at https://play.google.com/store/apps/details?id=com.fishpin.app. You pay ₱499 once on Google Play before downloading, and there are no further charges after that.' },
  { title: 'Privacy of your fishing spots', text: 'Your fishing spots stay private. Pins are stored on your phone in a private database tied to your account. They are never shared with other fishermen and never sold to anyone.' },
  { title: 'Why FishPin focuses on Filipino fishermen', text: 'FishPin is built specifically for Filipino fishermen because small-scale fishing in the Philippines is dominated by fishermen who cannot afford an ₱8,000 to ₱30,000 marine GPS device. FishPin is affordable and designed with Philippine species, local conditions, and an offline-first design.' },
  { title: 'Partnership, sponsorship and contributing', text: 'FishPin works with fishing cooperatives, LGUs (local government units), NGOs, and individual sponsors to put the app in more hands, including sponsoring devices and training for fishermen who cannot afford it. To help, sponsor, partner, or contribute, email fishpinsupport@gmail.com.' },
  { title: 'Real-time GPS, compass and speed', text: 'FishPin provides real-time GPS, a compass, and speed. It gives continuous GPS at 4 fixes per second (4 Hz), a true magnetic compass, and a live speed readout in knots, so every movement appears instantly with no laggy refresh.' },
  { title: 'Background trail recording', text: 'FishPin records your fishing trip trail in the background, even with the screen off, using a persistent foreground service. You can lock the phone to save battery and pick up exactly where you left off.' },
  { title: 'Save and re-follow paths', text: 'You can save full trips with distance, average speed, and duration, then pick any saved path later. FishPin overlays it on the map so you can re-follow and re-fish the same productive route.' },
  { title: 'Custom spot pinning', text: 'FishPin lets you mark hotspots with custom pins. Long-press anywhere on the map to drop a pin, choose from 8 colors and 8 marine icons (anchor, fish, palm, sailboat and more), and add a private note.' },
  { title: 'AI fish scanner', text: 'FishPin has an AI fish scanner. Snap a photo of your catch and the app uses AI to identify the species, suggest a size estimate, and link straight into the local fish guide.' },
  { title: 'Philippine fish species guide', text: 'FishPin includes a Philippine fish species guide: a searchable guide focused on species found in Philippine waters, with local names, seasons, baits, and notes. It works fully offline.' },
  { title: 'Weather and marine conditions', text: 'FishPin shows weather and marine conditions: an hourly Open-Meteo forecast tied to your current GPS spot (temperature, wind, visibility) plus wave height, wind direction, and current strength in plain language, so you know before leaving shore whether today is a go or a no-go.' },
  { title: 'Fishing score', text: 'FishPin\'s Fishing Score reads the live weather for your current spot (wind, pressure, temperature, visibility, and conditions) and turns it into a single 0 to 100 score, so one glance tells you whether to go fishing or stay in, with no guesswork and no wasted fuel.' },
  { title: 'Emergency SOS alert', text: 'FishPin has an Emergency SOS alert. In an emergency, tap SOS to broadcast your last known GPS position, boat name, and contact details to your trusted contacts and nearby rescue channels, even with limited signal.' },
  { title: 'Nautical charts with depth zones', text: 'FishPin includes nautical charts with depth zones: a nautical map layer with bathymetric depth contours, seamarks, and depth shading, powered by MapTiler Ocean and OpenSeaMap data.' },
  { title: 'Offline map downloads', text: 'You can download offline map regions before you sail. Pick any rectangle on the map and download street or satellite tiles to your phone. FishPin shows the estimated download size before you commit.' },
  { title: 'Route planning with ETA', text: 'FishPin offers route planning with ETA (estimated time of arrival). Tap any pin to start navigation and FishPin draws a heading line and shows live distance, bearing, and an ETA based on your current speed.' },
  { title: 'How FishPin compares to Navionics, Fishbrain and Garmin', text: 'Compared to alternatives, FishPin is ₱499 once with no subscription; Navionics is about ₱3,250 per year; Fishbrain about ₱4,200 per year; Garmin GPS is ₱8,000 to ₱30,000 in hardware. FishPin works fully offline, has AI fish identification, a Philippine species guide, nautical depth charts, offline map downloads, and emergency SOS, and runs on any Android phone with no special hardware. Over five years FishPin costs about ₱499 versus roughly ₱16,250 for Navionics or ₱21,000 for Fishbrain.' },
  { title: 'Contact and support', text: 'You can contact FishPin support by email at fishpinsupport@gmail.com. The website is https://www.fishpin.app and the app is on the Google Play Store.' },
];

// ---- Conversation memory: load recent history for this session ----
// Stored in the workflow's persistent static data, keyed by sessionId, with a
// TTL so old chats expire. Best-effort: never break the flow if it fails.
let history = [];
let summary = '';
try {
  const sd = $getWorkflowStaticData('global');
  sd.sessions = sd.sessions || {};
  const now = Date.now();
  const ttlMs = Number(cfg.memoryTtlMin || 120) * 60000;
  for (const k of Object.keys(sd.sessions)) {
    if (now - (sd.sessions[k].updated || 0) > ttlMs) delete sd.sessions[k];
  }
  const sess = sd.sessions[sessionId];
  history = (sess && Array.isArray(sess.turns)) ? sess.turns : [];
  summary = (sess && sess.summary) ? sess.summary : '';
} catch (e) {
  history = [];
  summary = '';
}

// Retrieval query = recent user turns + current message, so follow-ups like
// "does it work offline too?" still retrieve the right KB chunks.
const recentUser = history.filter((t) => t.role === 'user').slice(-2).map((t) => t.text);
const retrievalQuery = [...recentUser, message].join(' \n ').trim() || 'hello';

const model = 'models/' + cfg.embedModel;
const texts = KB.map((c) => c.title + '. ' + c.text);
texts.push(retrievalQuery);

const requests = texts.map((t) => ({ model, content: { parts: [{ text: String(t).slice(0, 8000) }] } }));

return [{ json: {
  message,
  sessionId,
  kb: KB.map((c) => ({ title: c.title, text: c.text })),
  history,
  summary,
  embedBody: { requests },
} }];
