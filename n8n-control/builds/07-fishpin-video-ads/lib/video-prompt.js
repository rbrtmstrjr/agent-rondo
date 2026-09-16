// ============================================================================
// Prompts and request bodies for the FishPin video ad. Pure; shared brand
// values arrive as arguments (build.js inlines build-06 libs alongside).
// ============================================================================
const PRIOR_VIDEOS_LIMIT = 15;

const SCREEN_GUIDE = {
  offline: 'Welcome screen: FishPin is your offline navigator at sea, no signal no problem',
  spots: 'Save your secret spots: long-press the map to drop a pin, name it, color it',
  path: 'Trace every journey: tap REC to record the route, keeps tracking with the screen locked',
  navigate: 'Navigate your spots: live compass, distance and ETA to a saved pin, always offline',
  dashboard: 'Home dashboard: fishing score, wind, wave height and humidity',
  smarter: 'Start fishing smarter: happy fishermen with a good catch, the closing screen',
};

function buildScriptSchema(screenIds, beats) {
  return {
    type: 'OBJECT',
    properties: {
      pillar: { type: 'STRING' },
      topic: { type: 'STRING' },
      hook: { type: 'STRING' },
      voiceover: { type: 'STRING' },
      description: { type: 'STRING' },
      hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
      scenes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            beat: { type: 'STRING', enum: beats },
            type: { type: 'STRING', enum: ['veo', 'image', 'screen'] },
            seconds: { type: 'NUMBER' },
            prompt: { type: 'STRING' },
            screen: { type: 'STRING', enum: screenIds },
          },
          required: ['beat', 'type', 'seconds'],
        },
      },
    },
    required: ['pillar', 'topic', 'hook', 'voiceover', 'description', 'hashtags', 'scenes'],
  };
}

function buildScriptSystemPrompt(voiceRules) {
  return [
    'You write short vertical video ads (Facebook Reels) for FishPin, spoken in natural Filipino.',
    '',
    voiceRules,
    '',
    'VIDEO AD RULES.',
    '- The video is 22 to 25 seconds: hook, stakes, a real app demo, relief. A branded end card with the '
      + 'call to action is added automatically after your scenes; do not write it as a scene.',
    '- hook: at most 8 words. It is spoken first, in the first 3 seconds. It names the '
      + 'problem, never the product and never a price.',
    '- voiceover: 45 to 70 words, written to be SPOKEN aloud by a calm kuya on the pier, about 24 seconds. '
      + 'It starts with the hook idea, walks through the problem, shows how FishPin helps, and ends on relief.',
    '- HARD LIMIT ON THE VOICEOVER: 45 to 70 words. Before you answer, count the words in your voiceover '
      + 'sentence by sentence and aim for 55 to 60 words, the safe middle of the range. A voiceover outside '
      + '45 to 70 words is rejected and the whole script is regenerated, so get the count right the first time.',
    '- description: the Reel caption, 20 to 60 words of prose in 1 or 2 short paragraphs. No links, no '
      + 'hashtags, no call-to-action line: those are added automatically.',
    '- hashtags: 3 to 5, mixing Tagalog and English, no spam tags.',
    '- The em dash rule, the price rule and every compliance rule above apply to hook, voiceover and description.',
    '- Never use the social proof pillar: it needs a real screenshot or quote from the owner.',
    '',
    'SCENES. 5 to 6 scenes, in story order, whose seconds add up to 18 to 28.',
    '- The first scene is the hook: beat "hook", type "veo". Its prompt describes ONE short moment of real '
      + 'motion that shows the problem (fog rolling over the sea, night falling, a dead engine). There is '
      + 'exactly one veo scene in the whole video.',
    '- FIELDS PER SCENE TYPE, EXACTLY: a scene with type "screen" MUST include a "screen" id from the list '
      + 'below and must NOT include "prompt". A scene with type "image" or "veo" MUST include a "prompt" and '
      + 'must NOT include "screen". A "screen" scene with no "screen" id is rejected.',
    '- Use 1 or 2 screen scenes (beat "demo") to show the real FishPin app. Choose only from these screens:',
    Object.keys(SCREEN_GUIDE).map((id) => '  "' + id + '": ' + SCREEN_GUIDE[id]).join('\n'),
    '- If the feature you talk about has no matching screen (SOS, the fish guide, AI fish scan, the catch '
      + 'log), show it with an image scene of a fisherman using his phone with the screen NOT visible. Never '
      + 'draw an app screen, a map interface or any phone UI in an image prompt.',
    '- Image and veo prompts are in English and describe a real documentary scene: Filipino fishermen and '
      + 'their bangkas with outriggers, adults only, dignified, calm. No text, no lettering, no logo, no '
      + 'watermark in the picture. Never a scene that reads as a real distress event or accident.',
    '- Keep the same fisherman, boat, clothing and time of day across the scenes so it reads as one trip.',
    '',
    'Return only the JSON object.',
  ].join('\n');
}

function buildScriptUserPrompt(ctx) {
  const c = ctx || {};
  const lines = [];
  const topic = String(c.topicInput || '').trim();
  if (topic) {
    lines.push('Make this video about: ' + topic);
  } else {
    const pillars = (c.pillars || []).filter((p) => p !== 'social proof');
    lines.push('Choose a fresh, specific topic yourself from one of these pillars: ' + pillars.join(', ') + '.');
  }
  const prior = (Array.isArray(c.priorVideos) ? c.priorVideos : []).slice(-PRIOR_VIDEOS_LIMIT);
  if (prior.length) {
    lines.push('', 'Already made. Do not repeat any of these hooks, and take a different angle on any repeated subject:');
    prior.forEach((p) => lines.push('- ' + String(p.hook || '') + (p.topic ? ' (topic: ' + p.topic + ')' : '')));
  }
  lines.push('', 'Before you answer, check:',
    '- voiceover is 45 to 70 words (count them)',
    '- every "screen" scene has an allowlisted "screen" id',
    '- every "image" or "veo" scene has a "prompt"',
    '- scene seconds add up to 18 to 28',
    '- 3 to 5 hashtags');
  return lines.join('\n');
}

function videoNegatives(negatives) {
  return (Array.isArray(negatives) ? negatives : [])
    .filter((n) => !/FishPin logo/.test(n))
    .concat(['no logo', 'no watermark', 'no text or lettering of any kind', 'no phone screen content']);
}

function buildStillRequest(scenePrompt, styleSuffix, negatives) {
  const text = [
    String(scenePrompt || '').trim(),
    '',
    'Style: ' + String(styleSuffix || '') + '.',
    'Composition: vertical 9:16 full frame, one clear subject. Keep the top-left corner and the middle band '
      + 'of the frame calm and uncluttered: a logo and captions are added later.',
    'No text anywhere in the picture.',
    'Avoid: ' + videoNegatives(negatives).join(', ') + '.',
  ].join('\n');
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
  };
}

function buildVeoRequest(stillB64, stillMime, scenePrompt, cfg) {
  const c = cfg || {};
  return {
    instances: [{
      prompt: String(scenePrompt || '').trim() + ' Slow, steady camera motion. No text on screen. No sudden cuts.',
      image: { bytesBase64Encoded: stillB64, mimeType: stillMime || 'image/png' },
    }],
    parameters: {
      aspectRatio: '9:16',
      resolution: c.veoResolution || '1080p',
      durationSeconds: Number(c.veoSeconds) || 8,
      personGeneration: 'allow_adult',
    },
  };
}

function buildTtsRequest(voiceover, voice) {
  return {
    contents: [{ parts: [{ text: 'Read this aloud in natural spoken Filipino, calm, warm and trustworthy, like a '
      + 'kuya on the pier talking to fellow fishermen. Unhurried, never slow. Text: ' + String(voiceover || '') }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCREEN_GUIDE, PRIOR_VIDEOS_LIMIT, buildScriptSchema, buildScriptSystemPrompt, buildScriptUserPrompt,
    videoNegatives, buildStillRequest, buildVeoRequest, buildTtsRequest,
  };
}
