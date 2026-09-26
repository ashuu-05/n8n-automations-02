// Trim Articles — Code node
// Extracted from workflow.json for readability. workflow.json is the source of truth.

return $input.all().map((item, i) => ({
  json: {
    id: i,
    title: item.json.title || '',
    link: item.json.link || '',
    date: item.json.isoDate || '',
    snippet: (item.json.contentSnippet || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300),
  },
}));
;
