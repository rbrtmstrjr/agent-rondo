// Glue: the script request. Entered from Row OK? on the first try and from
// Retry Script? afterwards, when $json carries the validator's reasons.
const cfg = $('Config').first().json;
const run = $('Set Row').first().json;
const prevReasons = Array.isArray($json.reasons) ? $json.reasons : [];

let user = buildScriptUserPrompt({ topicInput: run.topic_input, pillars: Object.keys(PILLARS), priorVideos: run.prior_videos });
if (prevReasons.length) user += '\n\nYour last draft broke these rules. Fix every one:\n- ' + prevReasons.join('\n- ');

const geminiBody = {
  systemInstruction: { parts: [{ text: buildScriptSystemPrompt(buildVoiceRules()) }] },
  contents: [{ role: 'user', parts: [{ text: user }] }],
  generationConfig: {
    temperature: Number(cfg.scriptTemperature),
    responseMimeType: 'application/json',
    responseSchema: buildScriptSchema(SCREEN_IDS, BEATS),
  },
};
return [{ json: { geminiBody: JSON.stringify(geminiBody) } }];
