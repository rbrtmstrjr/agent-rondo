// Glue: build the Gemini image request. On a "regenerate image" pass the
// approved caption is reused and the reviewer's note steers the visual only.
//
// The copy is read from $json, NOT from $('Validate Copy'): this node has two
// possible predecessors — Copy Valid? (true), whose item is Validate Copy's
// output, and Reuse Copy, which emits the same shape from the approved copy
// carried back through the loop. Validate Copy never executes on that second
// branch, so naming it here would throw.
//
// This node is therefore the single point where "the copy this ad will
// actually use" exists on every branch, so it re-emits `copy` for Log Attempt,
// Route Decision and the Post Preview expression to read.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;
const v = $json;

let prompt = buildImagePrompt(v.copy, q.row.pillar);
if (q.keep_copy && q.revision_note) prompt += '\nReviewer note on the previous image: ' + q.revision_note;

const body = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: aspectFor(q.row.pillar) },
  },
};
return [{ json: {
  geminiBody: body,
  imagePrompt: prompt,
  aspectRequested: aspectFor(q.row.pillar),
  copy: v.copy,
  reused_copy: v.reused === true,
} }];
