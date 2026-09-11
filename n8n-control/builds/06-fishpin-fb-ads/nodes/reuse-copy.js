// Glue: the "Regenerate image" branch (spec §8 — "re-enter keeping the
// approved caption, appending revision_note to the image prompt, SKIPPING copy
// generation"). The reviewer liked the words and objected to the picture, so
// running Build Copy Prompt -> Generate Copy -> Validate Copy again would hand
// them a completely different ad and would inject the image complaint into the
// COPY prompt as "write a different angle" — telling the model to drop the
// headline the reviewer just approved.
//
// This node stands in for Validate Copy on that branch: it emits the same
// shape from the copy carried back through the re-invoke payload, so
// Build Image Prompt (and everything downstream of it) is unaware of which
// branch produced the copy.
const q = $('Pick Row').first().json;
const prior = q.prior_copy || {};

const copy = {
  headline: String(prior.headline || ''),
  subhead: String(prior.subhead || ''),
  caption: String(prior.caption || ''),
  cta: String(prior.cta || ''),
  hashtags: Array.isArray(prior.hashtags) ? prior.hashtags : [],
  image_prompts: Array.isArray(prior.image_prompts) ? prior.image_prompts : [],
  alt_text: String(prior.alt_text || ''),
};

return [{ json: {
  valid: true,
  reasons: [],
  copy,
  attempt: q.attempt,
  copy_retry: q.copy_retry,
  row: q.row,
  reused: true,
} }];
