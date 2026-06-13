import { NextResponse } from 'next/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  return m?.[1] || null;
}

function extractGithubLinks(text) {
  const seen = new Set();
  return [...text.matchAll(/https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/g)]
    .map(m => `https://github.com/${m[1]}/${m[2]}`)
    .filter(url => {
      // Skip github.com/github or generic pages
      const parts = url.split('/').filter(Boolean);
      if (parts.length < 5) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

async function fetchGithubStats(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const res = await fetch(`https://api.github.com/repos/${parts[0]}/${parts[1]}`, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'InspoVault/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.message === 'Not Found') return null;
    return {
      url:       `https://github.com/${parts[0]}/${parts[1]}`,
      name:      d.name,
      full_name: d.full_name,
      gh_desc:   d.description || '',
      stars:     d.stargazers_count ?? null,
      forks:     d.forks_count      ?? null,
      language:  d.language         ?? null,
      verified:  true,
    };
  } catch { return null; }
}

// Try multiple strategies to get the transcript
async function getTranscript(videoId, html) {
  // Strategy 1: Extract caption track URL from page HTML
  try {
    const captionMatch = html.match(/"captionTracks":\[(.+?)\],"audioTracks"/s);
    if (captionMatch) {
      const tracksJson = '[' + captionMatch[1] + ']';
      const tracks = JSON.parse(tracksJson.replace(/\\u0026/g, '&'));
      // Prefer English, then auto-generated English, then anything
      const preferred = tracks.find(t => t.languageCode === 'en' && !t.kind) ||
                        tracks.find(t => t.languageCode === 'en') ||
                        tracks.find(t => t.vssId?.startsWith('a.')) || // auto-generated
                        tracks[0];
      if (preferred?.baseUrl) {
        const captRes = await fetch(preferred.baseUrl + '&fmt=json3', {
          signal: AbortSignal.timeout(6000),
        });
        if (captRes.ok) {
          const data = await captRes.json();
          const text = data.events
            ?.filter(e => e.segs)
            .flatMap(e => e.segs.map(s => s.utf8 || ''))
            .join(' ')
            .replace(/\[.*?\]/g, '') // remove [Music], [Applause] etc
            .replace(/\s+/g, ' ')
            .trim();
          if (text?.length > 200) return text;
        }
      }
    }
  } catch (e) {
    console.error('[transcript] caption track strategy failed:', e.message);
  }

  // Strategy 2: Timedtext API with multiple language fallbacks
  for (const lang of ['en', 'en-US', 'a.en']) {
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}&fmt=json3`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.events
        ?.filter(e => e.segs)
        .flatMap(e => e.segs.map(s => s.utf8 || ''))
        .join(' ')
        .replace(/\[.*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text?.length > 200) return text;
    } catch {}
  }

  return null;
}

// Extract full description from ytInitialData using multiple patterns
function extractDescription(html) {
  // Pattern 1: shortDescription (most complete)
  const short = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  if (short && short.length > 50) {
    return short.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  // Pattern 2: videoDetails description
  const detail = html.match(/"videoDetails":\{[^}]*"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  if (detail && detail.length > 50) {
    return detail.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  // Pattern 3: OG description meta tag (fallback, usually truncated)
  const og = html.match(/<meta (?:name|property)="(?:og:)?description" content="([^"]+)"/)?.[1];
  return og || '';
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req) {
  const { url } = await req.json();
  const videoId = extractVideoId(url);
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });

  // 1 ── Fetch YouTube page ──────────────────────────────────────────────────
  let title = '', description = '', thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  let pageHtml = '';

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    pageHtml    = await res.text();
    title       = pageHtml.match(/<meta property="og:title" content="([^"]+)"/)?.[1]       || '';
    thumbnail   = pageHtml.match(/<meta property="og:image" content="([^"]+)"/)?.[1]       || thumbnail;
    description = extractDescription(pageHtml);
  } catch (e) {
    console.error('[youtube-meta] page fetch failed:', e.message);
  }

  // 2 ── Get transcript ──────────────────────────────────────────────────────
  const transcript = await getTranscript(videoId, pageHtml);
  console.log(`[youtube-meta] transcript: ${transcript ? transcript.length + ' chars' : 'none'}`);
  console.log(`[youtube-meta] description: ${description.length} chars`);

  // 3 ── Extract confirmed GitHub links from description + transcript ─────────
  const allText    = [description, transcript || ''].join('\n');
  const ghUrls     = extractGithubLinks(allText);
  console.log(`[youtube-meta] found ${ghUrls.length} github URLs in text`);

  // 4 ── Fetch GitHub stats for confirmed links ──────────────────────────────
  const confirmedRepos = (await Promise.all(ghUrls.map(fetchGithubStats))).filter(Boolean);
  const confirmedNames = confirmedRepos.map(r => r.full_name.toLowerCase());

  // 5 ── Claude: summarize + find additional repos + generate tags ───────────
  const transcriptExcerpt = transcript
    ? `TRANSCRIPT (${transcript.length} chars total, showing first 4000):\n${transcript.slice(0, 4000)}`
    : 'TRANSCRIPT: Not available for this video.';

  const claudePrompt = `You are analyzing a YouTube video. Extract GitHub repositories and generate useful metadata.

VIDEO TITLE: "${title}"

VIDEO DESCRIPTION (${description.length} chars):
${description.slice(0, 3000)}

${transcriptExcerpt}

GITHUB REPOS ALREADY CONFIRMED from links in the text: ${confirmedNames.join(', ') || 'none found yet'}

YOUR TASKS:

1. Write a 2-3 sentence summary of what this video is about and what viewers learn.

2. Find ALL GitHub repositories mentioned, shown, or discussed in this video that are NOT in the confirmed list.
   - Look for repo names mentioned verbally (e.g. "AutoGPT", "LangChain", "ComfyUI")
   - Look for GitHub usernames + repo names in the description
   - Construct the most likely GitHub URL for each
   - Describe what the video says about each one

3. Generate 4-6 short tags that categorize this content (e.g. "ai", "python", "gamedev", "tools", "automation")

4. Suggest a clean, descriptive title for saving this (improve on the YouTube title if it's clickbait-y)

Return ONLY this JSON (no markdown):
{
  "summary": "2-3 sentence summary",
  "suggested_title": "clean descriptive title",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "additional_repos": [
    {
      "name": "repo-name",
      "url": "https://github.com/owner/repo",
      "context": "What the video says about this in 1-2 sentences",
      "confidence": "high"
    }
  ]
}

For additional_repos: only include repos NOT already in the confirmed list. If none found, use [].
confidence: "high" = very sure of URL, "medium" = fairly sure, "low" = guessing.`;

  let summary        = description.slice(0, 300) || title;
  let suggestedTitle = title;
  let autoTags       = ['youtube'];
  let additionalRepos = [];

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages:   [{ role: 'user', content: claudePrompt }],
      }),
    });
    const d      = await claudeRes.json();
    const raw    = d.content?.[0]?.text || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    summary         = parsed.summary        || summary;
    suggestedTitle  = parsed.suggested_title|| title;
    autoTags        = parsed.tags           || autoTags;
    additionalRepos = parsed.additional_repos || [];
    console.log(`[youtube-meta] Claude found ${additionalRepos.length} additional repos`);
  } catch (e) {
    console.error('[youtube-meta] Claude error:', e.message);
  }

  // 6 ── Verify additional repos against GitHub API ──────────────────────────
  const verifiedAdditional = await Promise.all(
    additionalRepos.map(async (repo) => {
      const stats = await fetchGithubStats(repo.url);
      if (stats) return { ...stats, context: repo.context, confidence: repo.confidence };
      return {
        url:        repo.url,
        name:       repo.name || repo.url.split('/').pop(),
        full_name:  repo.url.replace('https://github.com/', ''),
        gh_desc:    '',
        stars:      null,
        forks:      null,
        language:   null,
        verified:   false,
        context:    repo.context,
        confidence: repo.confidence,
      };
    })
  );

  // 7 ── Combine repos ───────────────────────────────────────────────────────
  const allRepos = [
    ...confirmedRepos.map(r => ({ ...r, context: '', confidence: 'high' })),
    ...verifiedAdditional,
  ];

  console.log(`[youtube-meta] total repos: ${allRepos.length}`);

  return NextResponse.json({
    source_type:     'youtube',
    title:           suggestedTitle || title,
    description:     summary,
    image_url:       thumbnail,
    stars:           null,
    forks:           null,
    suggested_tags:  autoTags,
    extracted_repos: allRepos,
  });
}
