// Extract Video ID — Code node (Run Once for All Items)
// Accepts any common YouTube URL shape, or a bare 11-char video ID.

const input = $input.first().json;
const url = String(input.videoUrl || '').trim();
const maxPages = Number(input.maxPages) || 20;

if (!url) {
  throw new Error('No video URL provided. Open the "Video URL" node and paste a YouTube link.');
}

const patterns = [
  /(?:youtube\.com\/watch\?(?:[^&]*&)*v=)([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
];

let videoId = null;
for (const p of patterns) {
  const m = url.match(p);
  if (m) { videoId = m[1]; break; }
}
if (!videoId && /^[A-Za-z0-9_-]{11}$/.test(url)) videoId = url;

if (!videoId) {
  throw new Error(
    'Could not find a YouTube video ID in: "' + url + '". ' +
    'Expected something like https://www.youtube.com/watch?v=XXXXXXXXXXX'
  );
}

return [{ json: { videoId, videoUrl: url, maxPages } }];
