// Glue: the single paid clip. Animates the hook still.
const cfg = $('Config').first().json;
const script = $('Validate Script').first().json.script;
const pics = $('Collect Images').first().json;
return [{ json: { veoBody: JSON.stringify(buildVeoRequest(pics.hook_still_b64, pics.hook_still_mime,
  script.scenes[0].prompt, { veoResolution: cfg.veoResolution, veoSeconds: cfg.veoSeconds })) } }];
