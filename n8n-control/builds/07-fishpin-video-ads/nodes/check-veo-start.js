// Glue: a Veo failure never stops the run; the hook falls back to the still.
if ($json.name && !$json.error) return [{ json: { started: true, name: String($json.name), reason: '' } }];
return [{ json: { started: false, name: '', reason: 'Veo did not start: ' + JSON.stringify($json.error || $json).slice(0, 300) } }];
