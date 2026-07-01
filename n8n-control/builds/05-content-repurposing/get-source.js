// ============================================================================
// Get Source & Build Prompt — Code node (no creds). Accepts text / URL / topic.
// If it's a URL, fetches + strips the article (plain httpRequest works in Code
// nodes; only the *authenticated* helper doesn't). Builds the Gemini request that
// generates all 4 platform drafts + an image prompt in one structured call.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Content Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

let input = String(body.input || body.text || body.url || body.topic || '').trim();
if (!input) return [{ json: { valid: false, reason: 'No input provided. Send {"input": "...text, URL, or topic..."}.' } }];

let sourceType = 'topic';
let sourceText = input;

if (/^https?:\/\//i.test(input)) {
  sourceType = 'url';
  try {
    const html = await this.helpers.httpRequest({ method: 'GET', url: input, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
    sourceText = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
    if (sourceText.length < 60) { sourceType = 'url (little text found)'; }
  } catch (e) { sourceType = 'url (fetch failed — using as topic)'; sourceText = input; }
} else if (input.length > 280) {
  sourceType = 'text';
}

const voice = cfg.brandVoice || 'helpful, friendly, trustworthy, and practical';
const sys = 'You are the social media manager for ' + cfg.companyName + ', a home-services company (HVAC, plumbing, electrical) serving the Greater Portland area. '
  + 'Repurpose the SOURCE into platform-native posts in a ' + voice + ' brand voice. Stay accurate to home services; never invent prices or guarantees. '
  + 'Include a soft, natural call-to-action (book online or call ' + (cfg.phone || '') + ') where it fits. '
  + 'Return JSON with: '
  + 'title (a short internal title for this content); '
  + 'summary (1 sentence); '
  + 'linkedin (professional: strong hook, value, short paragraphs/line breaks, ~900-1300 chars, 0-3 hashtags); '
  + 'twitter (one punchy post, MAX 280 characters, may use 1-2 hashtags); '
  + 'facebook (warm and conversational, ends with a question to drive comments); '
  + 'instagram (an engaging caption with line breaks and a few emojis); '
  + 'hashtags (8-15 relevant hashtags as one space-separated string, for Instagram); '
  + 'imagePrompt (a vivid description for a clean, professional, on-brand SQUARE graphic with NO text in the image).';

const geminiBody = {
  systemInstruction: { parts: [{ text: sys }] },
  contents: [{ role: 'user', parts: [{ text: 'SOURCE (' + sourceType + '):\n' + sourceText }] }],
  generationConfig: {
    temperature: 0.8,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        summary: { type: 'STRING' },
        linkedin: { type: 'STRING' },
        twitter: { type: 'STRING' },
        facebook: { type: 'STRING' },
        instagram: { type: 'STRING' },
        hashtags: { type: 'STRING' },
        imagePrompt: { type: 'STRING' },
      },
      required: ['title', 'linkedin', 'twitter', 'facebook', 'instagram', 'hashtags', 'imagePrompt'],
    },
  },
};

return [{ json: { valid: true, sourceType, sourceText: sourceText.slice(0, 2000), input, geminiBody } }];
