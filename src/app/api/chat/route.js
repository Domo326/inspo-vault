import { NextResponse } from 'next/server';

export async function POST(req) {
  const { messages, entry } = await req.json();

  if (!messages?.length) return NextResponse.json({ error: 'No messages' }, { status: 400 });

  const ghCtx = entry?.source_type === 'github' && entry?.stars != null
    ? `\n- GitHub Stars: ${entry.stars?.toLocaleString()} | Forks: ${entry.forks?.toLocaleString()}`
    : '';

  const promptCtx = entry?.prompt_text
    ? `\n\n─── SAVED PROMPT ───────────────────────────────\nFull text:\n${entry.prompt_text}\n\nTool: ${entry.prompt_tool || 'unknown'}\nType: ${entry.prompt_type} (${entry.prompt_type === 'extracted' ? 'copied from screenshot' : 'AI-suggested based on image'})\n────────────────────────────────────────────────`
    : '';

  const system = `You are InspoVault AI — a sharp, enthusiastic creative assistant helping Domo (also goes by Neko).

WHO HE IS:
- Field marketing manager on tour (Verizon Local West Tour, drives a 26-ft box truck)
- 3D printing entrepreneur: PrintNest (channel letter fabrication + filament products)
- Unity game developer: LayerUp (idle/tycoon 3D printing game)
- Content creator + maker + self-hosted tech nerd

ACTIVE PROJECTS:
- PrintNest — 3D printing business, channel letter signs
- ROLL — disposable camera PWA (Next.js + Supabase)
- Premium Tracker — Verizon tour inventory PWA
- LayerUp — Unity idle game about running a 3D printing empire
- InspoVault — this app (saving links, screenshots, AI prompts)
- Homelab on UGREEN NAS (Sonarr, Radarr, Portainer, etc.)

CURRENT ENTRY CONTEXT:
- Title: ${entry?.title || 'Unknown'}
- Source: ${entry?.source_type || 'unknown'}
- URL: ${entry?.url || '(screenshot)'}
- Description: ${entry?.description || ''}
- Tags: ${entry?.tags?.join(', ') || 'none'}
- His personal notes: ${entry?.notes || 'none'}
- Times viewed: ${entry?.opens || 0}${ghCtx}${promptCtx}

BEHAVIOR:
- Use emojis naturally throughout — keep it fun, not corporate
- Give specific, actionable advice tied to his real projects when relevant
- If the entry has a prompt: help him use it, tweak it, understand what it creates, or adapt it for PrintNest/ROLL/content
- If it's a GitHub repo: offer to walk through setup step by step
- If it's a business/content idea: connect it to his tour life, 3D printing, or game dev
- Keep responses focused — no rambling`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system,
        messages,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return NextResponse.json({ content: data.content?.[0]?.text || 'Something went sideways 😅' });

  } catch (err) {
    console.error('[chat] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
