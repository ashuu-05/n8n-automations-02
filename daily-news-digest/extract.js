// Cleans an n8n export for publishing and pulls the Code node bodies out into
// readable .js files. Run from this folder:  node extract.js "../Daily News Digest.json"
const fs = require('fs');
const path = require('path');

const src = process.argv[2] || '../Daily News Digest.json';
const wf = JSON.parse(fs.readFileSync(path.resolve(__dirname, src), 'utf8'));

const PLACEHOLDER = 'you@example.com';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let scrubbed = 0;
let stripped = 0;
const written = [];

for (const node of wf.nodes) {
  // Personal addresses must not be published.
  if (node.parameters && node.parameters.fromEmail) {
    node.parameters.fromEmail = PLACEHOLDER;
    scrubbed++;
  }
  if (node.parameters && node.parameters.toEmail) {
    node.parameters.toEmail = PLACEHOLDER;
    scrubbed++;
  }

  // Credential IDs are specific to one n8n instance and useless elsewhere.
  // Importers pick their own, so drop the block entirely.
  if (node.credentials) {
    delete node.credentials;
    stripped++;
  }

  // Save each Code node body as its own file so it is reviewable on GitHub.
  if (node.type === 'n8n-nodes-base.code' && node.parameters && node.parameters.jsCode) {
    const file = slug(node.name) + '.js';
    fs.writeFileSync(
      path.join(__dirname, 'code', file),
      '// ' + node.name + ' — Code node\n' +
      '// Extracted from workflow.json for readability. workflow.json is the source of truth.\n\n' +
      node.parameters.jsCode.trim() + '\n',
      'utf8'
    );
    written.push(file);
  }
}

fs.writeFileSync(
  path.join(__dirname, 'workflow.json'),
  JSON.stringify(wf, null, 2),
  'utf8'
);

console.log('emails scrubbed:      ' + scrubbed);
console.log('credential blocks:    ' + stripped + ' stripped');
console.log('code files written:   ' + written.length);
written.forEach((f) => console.log('  code/' + f));
