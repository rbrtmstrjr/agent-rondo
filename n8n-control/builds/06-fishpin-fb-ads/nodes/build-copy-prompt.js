// Glue: build the Gemini copy request from the brand bible.
const cfg = $('Config').first().json;
const q = $('Pick Row').first().json;

// The two links every caption must carry come from Config, not from brand.js,
// so changing a url is a Config edit. The SAME two values are handed to
// Validate Copy, which rejects a caption missing either one: prompt and
// validator read one source, so they cannot drift apart.
const body = {
  system_instruction: { parts: [{ text: buildSystemPrompt({
    websiteUrl: cfg.websiteUrl,
    playStoreUrl: cfg.playStoreUrl,
  }) }] },
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
