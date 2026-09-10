// Glue: build the Gemini image request. On a "regenerate image" pass the
// approved caption is reused and the reviewer's note steers the visual only.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;
const v = $('Validate Copy').first().json;

let prompt = buildImagePrompt(v.copy, q.row.pillar);
if (q.keep_copy && q.revision_note) prompt += '\nReviewer note on the previous image: ' + q.revision_note;

const body = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: aspectFor(q.row.pillar) },
  },
};
return [{ json: { geminiBody: body, imagePrompt: prompt, aspectRequested: aspectFor(q.row.pillar) } }];
