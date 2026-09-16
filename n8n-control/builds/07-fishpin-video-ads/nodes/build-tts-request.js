// Glue: the voiceover request, in the Config voice.
const cfg = $('Config').first().json;
const script = $('Validate Script').first().json.script;
return [{ json: { geminiBody: JSON.stringify(buildTtsRequest(script.voiceover, cfg.ttsVoice)) } }];
