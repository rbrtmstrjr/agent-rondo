// Glue: build the Gemini copy request from the brand bible.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;

// No urls are passed into the copy prompt any more. The model writes PROSE
// ONLY; the call to action, both Config links and the hashtags are appended
// deterministically by buildPostMessage in Collect Photos, which is what both
// Publish Post and Post Preview read. Handing the urls to the model was how
// the CTA came out twice on the first live post, and a url named in the prompt
// is a url the model may copy into the caption, which Validate Copy rejects.
const body = {
  system_instruction: { parts: [{ text: buildSystemPrompt() }] },
  // prior_posts: every already-published topic and caption (Pick Row collects
  // them from the Queue tab), so the model can cover a subject again but is
  // told to take a different angle and never repeat a hook or a sentence.
  contents: [{ role: 'user', parts: [{ text: buildUserPrompt(
    q.row, q.revision_note, q.rejected_headline, q.prior_posts,
  ) }] }],
  generationConfig: {
    temperature: Number(cfg.copyTemperature),
    responseMimeType: 'application/json',
    responseSchema: COPY_SCHEMA,
  },
};
return [{ json: { geminiBody: body } }];
