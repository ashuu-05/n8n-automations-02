// Build Dashboard — Code node (Run Once for All Items)
// Input: the OpenRouter summary response.
// Output: { html } plus QuickChart preview URLs for the n8n output panel.

const agg = $('Aggregate Results').first().json;
const video = agg.video;
const stats = agg.stats;

// Every tunable lives in the Settings node — edit it there, in the n8n UI.
const cfg = $('Settings').first().json;

const TOP_ASPECTS = Number(cfg.topAspects) || 8;
const QUOTES = Number(cfg.quotesPerSection) || 5;
const PALETTE = {
  posLight: cfg.colorPositive || '#2a78d6', posDark: cfg.colorPositiveDark || '#3987e5',
  neuLight: cfg.colorNeutral || '#898781', neuDark: cfg.colorNeutralDark || '#6b6963',
  negLight: cfg.colorNegative || '#e34948', negDark: cfg.colorNegativeDark || '#e66767',
};

// ---------------------------------------------------------------- summary
const raw = (() => {
  const j = $input.first().json || {};
  const c = j.choices && j.choices[0] && j.choices[0].message
    ? j.choices[0].message.content : null;
  if (!c) return {};
  try { return JSON.parse(c); } catch (e) { /* fall through */ }
  const m = String(c).match(/\{[\s\S]*\}/);
  if (!m) return {};
  try { return JSON.parse(m[0]); } catch (e) { return {}; }
})();

const fallbackAspects = (arr) => (arr || []).slice(0, TOP_ASPECTS)
  .map((a) => ({ aspect: a.aspect, count: a.count }));

const summary = {
  overall: raw.overall || 'The summary model did not return a verdict.',
  positive: raw.positive_summary || '',
  negative: raw.negative_summary || '',
  neutral: raw.neutral_summary || '',
  topPositive: Array.isArray(raw.top_positive_aspects) && raw.top_positive_aspects.length
    ? raw.top_positive_aspects.slice(0, TOP_ASPECTS)
    : fallbackAspects(agg.rawAspects.positive),
  topNegative: Array.isArray(raw.top_negative_aspects) && raw.top_negative_aspects.length
    ? raw.top_negative_aspects.slice(0, TOP_ASPECTS)
    : fallbackAspects(agg.rawAspects.negative),
  requests: Array.isArray(raw.requests) ? raw.requests.slice(0, 5) : [],
  recommendations: Array.isArray(raw.recommendations) ? raw.recommendations.slice(0, 5) : [],
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};
const comma = (n) => (Number(n) || 0).toLocaleString('en-US');

// Rounded-corner rect as a path. r applies only to the named corners.
const barPath = (x, y, w, h, r, corners) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const tl = corners.indexOf('tl') >= 0 ? r : 0;
  const tr = corners.indexOf('tr') >= 0 ? r : 0;
  const br = corners.indexOf('br') >= 0 ? r : 0;
  const bl = corners.indexOf('bl') >= 0 ? r : 0;
  return [
    'M', x + tl, y,
    'H', x + w - tr, tr ? 'A ' + tr + ' ' + tr + ' 0 0 1 ' + (x + w) + ' ' + (y + tr) : '',
    'V', y + h - br, br ? 'A ' + br + ' ' + br + ' 0 0 1 ' + (x + w - br) + ' ' + (y + h) : '',
    'H', x + bl, bl ? 'A ' + bl + ' ' + bl + ' 0 0 1 ' + x + ' ' + (y + h - bl) : '',
    'V', y + tl, tl ? 'A ' + tl + ' ' + tl + ' 0 0 1 ' + (x + tl) + ' ' + y : '',
    'Z',
  ].join(' ');
};

// ------------------------------------------- chart 1: diverging stacked bar
// Sentiment is an ordered scale, so the bar is centred on the neutral band.
function divergingBar() {
  const W = 720, H = 104;
  const PAD = 16;
  const innerW = W - PAD * 2;
  const barH = 24;            // spec: bars cap at 24px
  const barY = 34;
  const GAP = 2;              // spec: 2px surface gap between segments

  const neg = stats.negativePct, neu = stats.neutralPct, pos = stats.positivePct;
  const total = neg + neu + pos || 100;

  const wNeg = (neg / total) * innerW;
  const wNeu = (neu / total) * innerW;
  const wPos = (pos / total) * innerW;

  // Zero line sits at the middle of the neutral band.
  const zeroX = PAD + wNeg + wNeu / 2;

  const segs = [
    { x: PAD, w: wNeg, fill: 'var(--neg)', cls: 'seg-neg', corners: ['tl', 'bl'], label: 'Negative', v: neg, n: stats.negative },
    { x: PAD + wNeg, w: wNeu, fill: 'var(--neu)', cls: 'seg-neu', corners: [], label: 'Neutral', v: neu, n: stats.neutral },
    { x: PAD + wNeg + wNeu, w: wPos, fill: 'var(--pos)', cls: 'seg-pos', corners: ['tr', 'br'], label: 'Positive', v: pos, n: stats.positive },
  ];

  let s = '';
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    // Shrink each segment to leave the 2px surface gap between neighbours.
    const left = i === 0 ? g.x : g.x + GAP / 2;
    const w = g.w - (i === 0 || i === segs.length - 1 ? GAP / 2 : GAP);
    if (w <= 0.5) continue;

    s += '<path class="mark" d="' + barPath(left, barY, w, barH, 4, g.corners) + '" fill="' + g.fill + '"'
      + ' data-label="' + esc(g.label) + '" data-value="' + comma(g.n) + ' comments · ' + g.v + '%">'
      + '<title>' + esc(g.label) + ': ' + comma(g.n) + ' (' + g.v + '%)</title></path>';

    // Direct label inside the segment, but only when it genuinely fits.
    const txt = g.v + '%';
    if (w > txt.length * 8 + 16) {
      s += '<text x="' + (left + w / 2) + '" y="' + (barY + barH / 2 + 4)
        + '" class="in-bar ' + g.cls + '" text-anchor="middle">' + txt + '</text>';
    }
  }

  // Zero line + caption. At the extremes (a bar that is all one sentiment) the
  // line sits on the edge, so the caption anchors inward instead of overflowing.
  s += '<line x1="' + zeroX + '" y1="' + (barY - 8) + '" x2="' + zeroX + '" y2="' + (barY + barH + 8)
    + '" class="zero"/>';
  const capAnchor = zeroX < 70 ? 'start' : (zeroX > W - 70 ? 'end' : 'middle');
  s += '<text x="' + zeroX + '" y="' + (barY + barH + 22) + '" class="axis" text-anchor="'
    + capAnchor + '">neutral midpoint</text>';
  s += '<text x="' + PAD + '" y="20" class="axis">← more negative</text>';
  s += '<text x="' + (W - PAD) + '" y="20" class="axis" text-anchor="end">more positive →</text>';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sentiment share, centred on neutral">' + s + '</svg>';
}

// ------------------------------------------------- charts 2 & 3: aspect bars
function aspectChart(items, colorVar, emptyMsg) {
  if (!items || !items.length) return '<p class="empty">' + esc(emptyMsg) + '</p>';

  const rows = items.slice(0, TOP_ASPECTS);
  const max = Math.max.apply(null, rows.map((r) => r.count)) || 1;

  const W = 720;
  const rowH = 34, barH = 20, labelW = 200, valW = 56;
  const H = rows.length * rowH + 8;
  const trackX = labelW + 12;
  const trackW = W - trackX - valW;

  let s = '';
  rows.forEach((r, i) => {
    const y = i * rowH + 4;
    const w = Math.max(2, (r.count / max) * trackW);
    const label = String(r.aspect || '').replace(/\b\w/g, (c) => c.toUpperCase());

    s += '<text x="' + labelW + '" y="' + (y + barH / 2 + 4) + '" class="cat" text-anchor="end">'
      + esc(label.length > 26 ? label.slice(0, 25) + '…' : label) + '</text>';
    s += '<path class="mark" d="' + barPath(trackX, y, w, barH, 4, ['tr', 'br']) + '" fill="var(' + colorVar + ')"'
      + ' data-label="' + esc(label) + '" data-value="' + comma(r.count) + ' mentions">'
      + '<title>' + esc(label) + ': ' + comma(r.count) + ' mentions</title></path>';
    s += '<text x="' + (trackX + w + 8) + '" y="' + (y + barH / 2 + 4) + '" class="val">' + comma(r.count) + '</text>';
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Most mentioned aspects">' + s + '</svg>';
}

// ---------------------------------------------------------------- fragments
const statTile = (label, value, sub, dotVar) =>
  '<div class="tile">'
  + '<div class="tile-label">' + (dotVar ? '<span class="dot" style="background:var(' + dotVar + ')"></span>' : '') + esc(label) + '</div>'
  + '<div class="tile-value">' + esc(value) + '</div>'
  + (sub ? '<div class="tile-sub">' + esc(sub) + '</div>' : '')
  + '</div>';

const quoteList = (arr) => !arr || !arr.length ? ''
  : '<ul class="quotes">' + arr.map((q) =>
    '<li><span class="q-text">' + esc(q.text) + '</span><span class="q-meta">' + comma(q.likes) + ' likes</span></li>'
  ).join('') + '</ul>';

const bulletList = (arr) => !arr || !arr.length ? ''
  : '<ul class="bullets">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';

const aspectTable = () => {
  const rows = [];
  const push = (list, sent) => (list || []).forEach((a) =>
    rows.push('<tr><td>' + esc(a.aspect) + '</td><td>' + esc(sent) + '</td><td class="num">' + comma(a.count) + '</td></tr>'));
  push(summary.topPositive, 'Positive');
  push(summary.topNegative, 'Negative');
  if (!rows.length) return '';
  return '<table class="tbl"><thead><tr><th>Aspect</th><th>Sentiment</th><th class="num">Mentions</th></tr></thead>'
    + '<tbody>' + rows.join('') + '</tbody></table>';
};

// ---------------------------------------------------------------------- HTML
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<title>Comment sentiment — ' + esc(video.title) + '</title><style>'
+ ':root{color-scheme:light dark;'
+ '--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;'
+ '--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);'
+ '--pos:' + PALETTE.posLight + ';--neu:' + PALETTE.neuLight + ';--neg:' + PALETTE.negLight + ';}'
+ '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){'
+ '--surface:#1a1a19;--plane:#0d0d0d;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;'
+ '--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);'
+ '--pos:' + PALETTE.posDark + ';--neu:' + PALETTE.neuDark + ';--neg:' + PALETTE.negDark + ';}}'
+ '[data-theme="dark"]{--surface:#1a1a19;--plane:#0d0d0d;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;'
+ '--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);'
+ '--pos:' + PALETTE.posDark + ';--neu:' + PALETTE.neuDark + ';--neg:' + PALETTE.negDark + ';}'
+ '*{box-sizing:border-box}'
+ 'body{margin:0;background:var(--plane);color:var(--ink);'
+ 'font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;}'
+ '.wrap{max-width:860px;margin:0 auto;padding:32px 16px 64px}'
+ 'header{display:flex;gap:16px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap}'
+ 'header img{width:160px;border-radius:8px;border:1px solid var(--ring)}'
+ 'h1{font-size:20px;line-height:1.3;margin:0 0 4px}'
+ 'h2{font-size:15px;margin:0 0 14px;letter-spacing:.01em}'
+ '.sub{color:var(--ink-2);font-size:13px;margin:0}'
+ '.sub a{color:inherit}'
+ '.card{background:var(--surface);border:1px solid var(--ring);border-radius:12px;'
+ 'padding:20px;margin-top:16px}'
+ '.hero{font-size:48px;font-weight:600;line-height:1.05;margin:2px 0 2px}'
+ '.hero-label{color:var(--ink-2);font-size:13px}'
+ '.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}'
+ '.tile{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:14px 16px}'
+ '.tile-label{color:var(--ink-2);font-size:12px;display:flex;align-items:center;gap:6px}'
+ '.tile-value{font-size:26px;font-weight:600;margin-top:4px}'
+ '.tile-sub{color:var(--muted);font-size:12px;margin-top:2px}'
+ '.dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}'
+ 'svg{width:100%;height:auto;display:block;overflow:visible}'
+ '.mark{transition:opacity .12s}.mark:hover{opacity:.82;cursor:default}'
+ 'text{font:12px system-ui,-apple-system,"Segoe UI",sans-serif}'
+ '.axis{fill:var(--muted);font-size:11px}'
+ '.cat{fill:var(--ink-2)}'
+ '.val{fill:var(--ink-2);font-variant-numeric:tabular-nums}'
// Label-inside-fill colours are picked per fill by measured contrast, not by
// habit: black clears 4.5:1 on every fill except the dark-mode neutral gray.
+ '.in-bar{fill:#000;font-size:11px;font-weight:600}'
+ '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .in-bar.seg-neu{fill:#fff}}'
+ '[data-theme="dark"] .in-bar.seg-neu{fill:#fff}'
+ '.zero{stroke:var(--axis);stroke-width:1}'
+ '.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:var(--ink-2)}'
+ '.legend span{display:flex;align-items:center;gap:7px}'
+ '.grid2{display:grid;grid-template-columns:1fr;gap:16px}'
+ '@media(min-width:720px){.grid2{grid-template-columns:1fr 1fr}}'
+ '.prose{color:var(--ink-2);margin:0}'
+ '.quotes{list-style:none;padding:0;margin:12px 0 0}'
+ '.quotes li{border-top:1px solid var(--grid);padding:9px 0;display:flex;gap:12px;justify-content:space-between}'
+ '.q-text{flex:1}'
+ '.q-meta{color:var(--muted);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}'
+ '.bullets{margin:8px 0 0;padding-left:18px;color:var(--ink-2)}'
+ '.bullets li{margin:4px 0}'
+ '.tbl{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}'
+ '.tbl th,.tbl td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--grid)}'
+ '.tbl th{color:var(--muted);font-weight:500;font-size:12px}'
+ '.tbl .num{text-align:right;font-variant-numeric:tabular-nums}'
+ 'details{margin-top:16px}summary{cursor:pointer;color:var(--ink-2);font-size:13px}'
+ '.empty{color:var(--muted);font-size:13px;margin:4px 0}'
+ 'footer{color:var(--muted);font-size:12px;margin-top:28px;text-align:center}'
+ '#tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;'
+ 'background:var(--ink);color:var(--surface);padding:6px 9px;border-radius:6px;'
+ 'font-size:12px;z-index:9;white-space:nowrap}'
+ '</style></head><body><div class="wrap">'

+ '<header>'
+ (video.thumbnail ? '<img src="' + esc(video.thumbnail) + '" alt="">' : '')
+ '<div><h1>' + esc(video.title) + '</h1>'
+ '<p class="sub">' + esc(video.channel) + ' · ' + compact(video.views) + ' views · '
+ compact(video.likes) + ' likes<br><a href="' + esc(video.url) + '">' + esc(video.url) + '</a></p></div>'
+ '</header>'

+ '<div class="card"><div class="hero-label">Comments analysed</div>'
+ '<div class="hero">' + comma(stats.classified) + '</div>'
+ '<p class="prose">' + esc(summary.overall) + '</p></div>'

+ '<div class="tiles">'
+ statTile('Positive', comma(stats.positive), stats.positivePct + '% of analysed', '--pos')
+ statTile('Neutral', comma(stats.neutral), stats.neutralPct + '% of analysed', '--neu')
+ statTile('Negative', comma(stats.negative), stats.negativePct + '% of analysed', '--neg')
+ statTile('On the video', comma(video.totalComments), 'total comments reported by YouTube', '')
+ '</div>'

+ '<div class="card"><h2>Sentiment share</h2>' + divergingBar()
+ '<div class="legend">'
+ '<span><i class="dot" style="background:var(--neg)"></i>Negative ' + comma(stats.negative) + '</span>'
+ '<span><i class="dot" style="background:var(--neu)"></i>Neutral ' + comma(stats.neutral) + '</span>'
+ '<span><i class="dot" style="background:var(--pos)"></i>Positive ' + comma(stats.positive) + '</span>'
+ '</div></div>'

+ '<div class="card"><h2>What viewers praised</h2>'
+ aspectChart(summary.topPositive, '--pos', 'No recurring positive themes were named.')
+ '<p class="prose" style="margin-top:14px">' + esc(summary.positive) + '</p>'
+ quoteList(agg.samples.positive.slice(0, QUOTES)) + '</div>'

+ '<div class="card"><h2>What viewers criticised</h2>'
+ aspectChart(summary.topNegative, '--neg', 'No recurring criticisms were named.')
+ '<p class="prose" style="margin-top:14px">' + esc(summary.negative) + '</p>'
+ quoteList(agg.samples.negative.slice(0, QUOTES)) + '</div>'

+ '<div class="card"><h2>Neutral chatter</h2>'
+ '<p class="prose">' + esc(summary.neutral) + '</p>'
+ quoteList(agg.samples.neutral.slice(0, Math.max(1, QUOTES - 1))) + '</div>'

+ (summary.requests.length || summary.recommendations.length
  ? '<div class="grid2">'
    + (summary.requests.length ? '<div class="card"><h2>What viewers asked for</h2>' + bulletList(summary.requests) + '</div>' : '')
    + (summary.recommendations.length ? '<div class="card"><h2>Suggested next steps</h2>' + bulletList(summary.recommendations) + '</div>' : '')
    + '</div>'
  : '')

+ '<details><summary>Table view — aspect counts</summary><div class="card">' + aspectTable() + '</div></details>'

+ '<footer>Generated ' + esc(new Date(agg.generatedAt).toUTCString())
+ ' · ' + comma(stats.fetched) + ' comments fetched, ' + comma(stats.classified) + ' classified'
+ (stats.failedBatches ? ' · ' + stats.failedBatches + ' batch(es) failed to parse' : '')
+ '</footer>'

+ '</div><div id="tip"></div><script>'
+ '(function(){var t=document.getElementById("tip");'
+ 'document.querySelectorAll(".mark").forEach(function(m){'
+ 'm.addEventListener("mousemove",function(e){'
+ 't.textContent=m.dataset.label+" — "+m.dataset.value;'
+ 't.style.opacity=1;t.style.left=(e.clientX+14)+"px";t.style.top=(e.clientY-10)+"px";});'
+ 'm.addEventListener("mouseleave",function(){t.style.opacity=0;});});})();'
+ '</script></body></html>';

// ------------------------------------------- QuickChart previews (for n8n UI)
const qc = (cfg, w, h) => 'https://quickchart.io/chart?w=' + w + '&h=' + h
  + '&bkg=%23fcfcfb&c=' + encodeURIComponent(JSON.stringify(cfg));

const sentimentChartUrl = qc({
  type: 'horizontalBar',
  data: {
    labels: ['Sentiment'],
    datasets: [
      { label: 'Negative', data: [stats.negative], backgroundColor: PALETTE.negLight },
      { label: 'Neutral', data: [stats.neutral], backgroundColor: PALETTE.neuLight },
      { label: 'Positive', data: [stats.positive], backgroundColor: PALETTE.posLight },
    ],
  },
  options: {
    legend: { position: 'bottom' },
    scales: { xAxes: [{ stacked: true }], yAxes: [{ stacked: true }] },
  },
}, 640, 200);

const aspectsChartUrl = qc({
  type: 'horizontalBar',
  data: {
    labels: summary.topPositive.slice(0, 6).map((a) => a.aspect),
    datasets: [{
      label: 'Positive mentions',
      data: summary.topPositive.slice(0, 6).map((a) => a.count),
      backgroundColor: PALETTE.posLight,
    }],
  },
  options: { legend: { display: false } },
}, 640, 280);

return [{
  json: {
    html,
    video,
    stats,
    summary,
    previews: { sentiment: sentimentChartUrl, topPositiveAspects: aspectsChartUrl },
  },
}];
