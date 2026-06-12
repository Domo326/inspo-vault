import { NextResponse } from 'next/server';

export async function POST(req) {
  const { base64Data, mimeType } = await req.json();

  if (!base64Data || !mimeType) {
    return NextResponse.json({ error: 'base64Data and mimeType required' }, { status: 400 });
  }

  const prompt = `Analyze this screenshot carefully. Return ONLY a valid JSON object — no markdown fences, no backticks, no extra text before or after.

─── DECISION TREE ────────────────────────────────────────────────────────────

STEP 1: Is there explicit AI prompt text visible?
An "AI prompt" = text clearly meant to be copy-pasted into ChatGPT, Midjourney, Gemini, DALL-E, Stable Diffusion, Ideogram, etc.
Tips lists, how-to steps, business advice, and research topics are NOT prompts.

STEP 2: Set prompt_type based on what you find:

  Case A — Explicit prompt IS visible in the screenshot:
    prompt_type = "extracted"
    Copy the FULL prompt text verbatim into prompt_text. Get every word.

  Case B — No explicit prompt text, but you can clearly see AI-generated output
  (artwork, characters, images, designs, sticker sheets, renders, etc.):
    prompt_type = "suggested"
    Write a complete, detailed, ready-to-use prompt in prompt_text that would
    recreate what you see. Cover: style, subject, composition, colors, mood,
    any text/layout visible, aspect ratio if obvious. Start with "Create..." or "Generate..."

  Case C — Regular social content, website screenshots, text posts, business tips:
    prompt_type = null
    prompt_text = null

─── REQUIRED OUTPUT ─────────────────────────────────────────────────────────

{
  "title": "Descriptive title max 60 chars",
  "source_type": "instagram|facebook|x|youtube|threads|screenshot|other",
  "platform": "Human-readable platform name",
  "description": "2-3 sentences: what this is, what it shows or teaches, why it's useful",
  "prompt_text": "Full extracted or suggested prompt text, or null",
  "prompt_tool": "Best AI tool for this prompt: ChatGPT|Midjourney|Gemini|DALL-E|Ideogram|Stable Diffusion|etc, or null",
  "prompt_type": "extracted" or "suggested" or null,
  "use_case": "One sentence: practical use for a content creator or maker",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "has_prompt": true or false
}`;

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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text',  text:  prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const raw = data.content?.[0]?.text || '{}';
    try {
      const clean = raw.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
      return NextResponse.json(JSON.parse(clean));
    } catch {
      console.error('[analyze] JSON parse failed, raw:', raw.slice(0, 200));
      return NextResponse.json({
        title:       'Screenshot',
        source_type: 'screenshot',
        description: raw.slice(0, 300),
        prompt_text: null,
        prompt_type: null,
        tags:        ['screenshot'],
        has_prompt:  false,
      });
    }

  } catch (err) {
    console.error('[analyze] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
