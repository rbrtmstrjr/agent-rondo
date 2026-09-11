// Glue: build ONE Gemini image request PER IMAGE in the set. This is the
// fan-out node: the copy model decided how many images the topic needs (1 to 5,
// enforced by validateCopy), and this emits one item for each of them, so
// Generate Image, Validate Image, Upload Photo and Get Photo URL all run
// per-image and Collect Photos aggregates them back into one album.
//
// On a "regenerate image" pass the approved caption is reused and the
// reviewer's note steers the visuals only.
//
// The copy is read from $json, NOT from $('Validate Copy'): this node has two
// possible predecessors — Copy Valid? (true), whose item is Validate Copy's
// output, and Reuse Copy, which emits the same shape from the approved copy
// carried back through the loop. Validate Copy never executes on that second
// branch, so naming it here would throw.
//
// This node is therefore the single point where "the copy this ad will
// actually use" exists on every branch, so it re-emits `copy` on every item for
// Collect Photos (and, through it, Log Attempt, the Post Preview and Publish
// Post) to read.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;
const v = $json;

let prompts = promptsOf(v.copy);
if (!prompts.length) {
  // Unreachable in practice: validateCopy rejects anything outside 1 to 5
  // non-empty entries before the Copy Valid? gate, and the Reuse Copy branch
  // replays an already-validated set. Degrade to one sane documentary frame
  // rather than throwing, so the run still reaches the human review gate (a
  // throw here would strand the row at in_review with no terminal status).
  prompts = [String((v.copy || {}).alt_text || '').trim()
    || 'A Filipino fisherman on a bangka with outriggers at sea, documentary photograph.'];
}

const copy = Object.assign({}, v.copy, { image_prompts: prompts });
const aspectRequested = aspectFor(q.row.pillar);

return prompts.map((_, i) => {
  let prompt = buildImagePrompt(copy, q.row.pillar, i, prompts.length);
  if (q.keep_copy && q.revision_note) prompt += '\nReviewer note on the previous image: ' + q.revision_note;

  return { json: {
    // The FishPin logo rides along as an inline reference image ahead of the
    // text part — the request shape proven in builds/brand-photoshoot-variations.
    // FISHPIN_LOGO_B64 is injected at build time by build.js from assets/logo.png.
    geminiBody: {
      contents: [{ role: 'user', parts: [
        { inline_data: { mime_type: 'image/png', data: FISHPIN_LOGO_B64 } },
        { text: prompt },
      ] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: aspectRequested },
      },
    },
    imagePrompt: prompt,
    index: i,
    total: prompts.length,
    aspectRequested,
    copy,
    reused_copy: v.reused === true,
  } };
});
