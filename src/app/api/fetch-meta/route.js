import { NextResponse } from 'next/server';

function detectSource(hostname) {
  if (hostname === 'github.com')   return 'github';
  if (hostname.includes('instagram')) return 'instagram';
  if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname.includes('twitter')) return 'x';
  if (hostname.includes('facebook') || hostname.includes('fb.com')) return 'facebook';
  if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube';
  if (hostname.includes('threads')) return 'threads';
  return 'other';
}

function parseOG(html, tag) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${tag}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${tag}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${tag}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseTitle(html) {
  const og = parseOG(html, 'title');
  if (og) return og;
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m?.[1]?.trim() || '';
}

export async function POST(req) {
  const { url } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    const urlObj  = new URL(url);
    const host    = urlObj.hostname.toLowerCase();
    const source  = detectSource(host);

    // ── GitHub: use the API for accurate data ──────────────────────────────
    if (source === 'github') {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const repo = `${parts[0]}/${parts[1]}`;
        const ghRes  = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'InspoVault/1.0',
          },
        });
        const gh = await ghRes.json();
        return NextResponse.json({
          source_type: 'github',
          title:       gh.name || repo,
          description: gh.description || 'Open source repository.',
          image_url:   null,
          stars:       gh.stargazers_count ?? null,
          forks:       gh.forks_count      ?? null,
          language:    gh.language         ?? null,
        });
      }
    }

    // ── Everything else: fetch HTML and parse OG tags ──────────────────────
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InspoVault/1.0; +https://inspovault.app)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    const html = await res.text();
    const title       = parseTitle(html) || url;
    const description = parseOG(html, 'description') || parseOG(html, 'desc') || '';
    const image_url   = parseOG(html, 'image') || null;

    return NextResponse.json({ source_type: source, title, description, image_url, stars: null, forks: null });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
