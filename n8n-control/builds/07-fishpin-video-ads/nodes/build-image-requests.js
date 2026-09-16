// Glue: FAN-OUT. One item per picture: the hook still first (Veo animates it),
// then one per image scene in script order. Generate Image runs per item and
// must never be read with .first(); Collect Images joins them by position.
const script = $('Validate Script').first().json.script;
const prompts = [script.scenes[0].prompt]
  .concat(script.scenes.filter((sc) => sc.type === 'image').map((sc) => sc.prompt));
return prompts.map((p, index) => ({ json: {
  index, total: prompts.length, role: index === 0 ? 'hook still' : 'scene image ' + index,
  geminiBody: JSON.stringify(buildStillRequest(p, STYLE_SUFFIX, NEGATIVES)),
} }));
