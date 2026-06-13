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
    .filter(url => { if (seen.has(url)) return false; seen.add(url); return true; });
}

async function fetchGithubStats(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const res = await fetch(`https://api.github.com/repos/${parts[0]}/${parts[1]}`, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'InspoVault/1.0' },
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.message === 'Not Found') return null;
    return {
      url:        `https://github.com/${parts[0]}/${parts[1]}`,
      name:       d.name,
      full_name:  d.full_name,
      gh_desc:    d.description || '',
      stars:      d.stargazers_count ?? null,
      forks:      d.forks_count      ?? null,
      language:   d.language         ?? null,
      verified:   true,
    };
  } catch { return null; }
}

async function getTranscript(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.events
      ?.filter(e => e.segs)
      .flatMap(e => e.segs.map(s => s.utf8 || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text?.length > 200 ? text : null;
  } catch { return null; }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req) {
  const { url } = await req.json();

  const videoId = extractVideoId(url);
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });

  // 1 ── Fetch YouTube page ─────────────────────────────────────────────────
  let title = '', description = '', thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InspoVault/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    title     = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1]       || '';
    thumbnail = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]       || thumbnail;

    // Try full description from ytInitialData first (more complete than og:description)
    const fullDescMatch = html.match(/"description":\{"simpleText":"((?:[^"\\]|\\.)*)"/);
    if (fullDescMatch) {
      description = fullDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      description = html.match(/<meta (?:name|property)="(?:og:)?description" content="([^"]+)"/)?.[1] || '';
    }
  } catch (e) {
    console.error('[youtube-meta] page fetch error:', e.message);
  }

  // 2 ── Get transcript ──────────────────────────────────────────────────────
  const transcript = await getTranscript(videoId);

  // 3 ── Extract GitHub links from description + transcript ──────────────────
  const allText    = [description, transcript || ''].join('\n');
  const ghUrls     = extractGithubLinks(allText);

  // 4 ── Fetch real GitHub stats for confirmed links ─────────────────────────
  const confirmedRepos = (await Promise.all(ghUrls.map(fetchGithubStats))).filter(Boolean);
  const confirmedNames = confirmedRepos.map(r => r.full_name.toLowerCase());

  // 5 ── Ask Claude to summarize + find additional repos ────────────────────
  const systemPrompt = `You analyze YouTube videos about software tools and GitHub repositories. 
Return ONLY valid JSON — no markdown, no backticks, no explanation.`;

  const userPrompt = `Video title: "${title}"
Description: ${description.slice(0, 2000)}
${transcript ? `Transcript excerpt: ${transcript.slice(0, 3000)}` : '(transcript unavailable — use description only)'}
GitHub repos already confirmed from links in description: ${confirmedNames.join(', ') || 'none yet'}

Do TWO things:

1. Write a 2-3 sentence summary of what this video covers and what the viewer will learn or get from it.

2. Identify ALL GitHub repositories mentioned in this video (by name, demo, or discussion) that are NOT in the confirmed list above. 
   For each one, provide your best guess at its GitHub URL (owner/repo format).
   Describe what the video specifically says or shows about it.
   Rate your confidence in the URL.

Return this exact JSON structure:
{
  "summary": "2-3 sentences about the video",
  "additional_repos": [
    {
      "name": "repo-name",
      "url": "https://github.com/owner/repo",
      "context": "What the video says/shows about this repo in 1-2 sentences",
      "confidence": "high"
    }
  ]
}

If no additional repos beyond the confirmed ones: set additional_repos to [].
confidence values: "high" (very sure of URL), "medium" (pretty sure), "low" (guessing).`;

  let summary = description.slice(0, 300);
  let additionalRepos = [];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });
    const d   = await res.json();
    const raw = d.content?.[0]?.text || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    summary         = parsed.summary        || summary;
    additionalRepos = parsed.additional_repos || [];
  } catch (e) {
    console.error('[youtube-meta] Claude error:', e.message);
  }

  // 6 ── Verify additional repos against GitHub API ──────────────────────────
  const verifiedAdditional = await Promise.all(
    additionalRepos.map(async (repo) => {
      const stats = await fetchGithubStats(repo.url);
      if (stats) {
        return { ...stats, context: repo.context, confidence: repo.confidence };
      }
      // Not found on GitHub — include but flag as unverified
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

  // 7 ── Combine: confirmed (from description links) + additional (from Claude) 
  const allRepos = [
    ...confirmedRepos.map(r => ({ ...r, context: '', confidence: 'high' })),
    ...verifiedAdditional,
  ];

  return NextResponse.json({
    source_type:     'youtube',
    title,
    description:     summary,
    image_url:       thumbnail,
    stars:           null,
    forks:           null,
    extracted_repos: allRepos,
  });
}
