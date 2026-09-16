// Which libs are inlined ahead of each glue file, in order, and the one
// function that assembles a Code node body. Shared by build.js and test.js so
// the tests run exactly the bodies the workflow runs. '06/' is build 06's lib
// folder. Libs listed together must not share a top-level name.
const fs = require('fs');
const path = require('path');

const NODE_LIBS = {
  'start-run.js': ['video-sheet-rules.js'],
  'set-row.js': ['video-sheet-rules.js'],
  'build-script-request.js': ['06/brand.js', 'script-rules.js', 'video-prompt.js'],
  'validate-script.js': ['06/brand.js', '06/copy-rules.js', 'script-rules.js'],
  'build-tts-request.js': ['video-prompt.js'],
  'voice-wav.js': [],
  'build-image-requests.js': ['06/image-rules.js', 'video-prompt.js'],
  'collect-images.js': [],
  'build-veo-request.js': ['video-prompt.js'],
  'check-veo-start.js': [],
  'check-veo-poll.js': [],
  'build-render-payload.js': ['scene-plan.js'],
  'check-render.js': ['06/copy-rules.js', 'video-sheet-rules.js'],
};

function libSource(name) {
  const file = name.indexOf('06/') === 0
    ? path.join(__dirname, '..', '06-fishpin-fb-ads', 'lib', name.slice(3))
    : path.join(__dirname, 'lib', name);
  // Neutralise the export line so no body references `module` inside n8n.
  return fs.readFileSync(file, 'utf8').replace(/module\.exports\s*=/g, 'void ');
}

function assemble(file) {
  if (!NODE_LIBS[file]) throw new Error('node-libs.js has no entry for ' + file);
  return NODE_LIBS[file].map(libSource)
    .concat([fs.readFileSync(path.join(__dirname, 'nodes', file), 'utf8')])
    .join('\n\n');
}

module.exports = { NODE_LIBS, assemble };
