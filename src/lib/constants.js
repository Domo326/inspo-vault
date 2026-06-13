// ─── Design tokens — InspoVault Brand Palette ────────────────────────────────
export const C = {
  // Core
  bg:         '#0F0F0F',   // Black
  s1:         '#080D1A',   // Deep card surface
  s2:         '#0C1220',   // Elevated surface
  s3:         '#10192E',   // Higher elevated / inputs
  // Brand blues
  accent:     '#0046FF',   // Electric Blue — ambient, tech, borders
  accentDeep: '#001B87',   // Deep Space Blue — deep elements
  // Signature orange
  orange:     '#E67A2E',   // Signal Orange — primary actions, highlights
  orangeDeep: '#B85A18',   // Deep orange
  orangeGlow: 'rgba(230,122,46,0.2)',
  blueGlow:   'rgba(0,70,255,0.15)',
  // Neutrals
  gray:       '#A8A8A8',   // Space Gray
  text:       '#FFFFFF',   // White
  sub:        '#A8A8A8',   // Space Gray for secondary text
  muted:      '#4A5A7A',   // Muted blue-grey
  border:     'rgba(0,70,255,0.2)',  // Blue border
  // Mapped for backwards compat
  cyan:       '#60B8FF',
  green:      '#34D399',
  gold:       '#E67A2E',   // gold → orange (used for stars)
  purple:     '#0046FF',   // purple → blue (extracted prompts)
  teal:       '#E67A2E',   // teal → orange (suggested prompts)
};

// prompt_type: "extracted" = verbatim | "suggested" = AI-generated from image
export const PROMPT_STYLES = {
  extracted: { emoji:'🧠', label:'Extracted Prompt',  color:'#0046FF', bg:'rgba(0,70,255,0.1)',   border:'rgba(0,70,255,0.3)',   desc:'Copied directly from the screenshot' },
  suggested: { emoji:'✨', label:'Suggested Prompt',   color:'#E67A2E', bg:'rgba(230,122,46,0.1)', border:'rgba(230,122,46,0.3)', desc:'AI-generated based on what InspoVault saw — edit before using!' },
};

export const SOURCES = {
  github:    { emoji:'🐙', label:'GitHub',     color:'#0046FF', bg:'rgba(0,70,255,0.12)'   },
  instagram: { emoji:'📸', label:'Instagram',  color:'#E67A2E', bg:'rgba(230,122,46,0.12)' },
  x:         { emoji:'🐦', label:'X/Twitter',  color:'#60B8FF', bg:'rgba(96,184,255,0.12)' },
  facebook:  { emoji:'👤', label:'Facebook',   color:'#4D8BFF', bg:'rgba(77,139,255,0.12)' },
  youtube:   { emoji:'📺', label:'YouTube',    color:'#FF4444', bg:'rgba(255,68,68,0.12)'  },
  threads:   { emoji:'🧵', label:'Threads',    color:'#A8A8A8', bg:'rgba(168,168,168,0.1)' },
  screenshot:{ emoji:'📷', label:'Screenshot', color:'#E67A2E', bg:'rgba(230,122,46,0.12)' },
  other:     { emoji:'🌐', label:'Web',        color:'#A8A8A8', bg:'rgba(168,168,168,0.1)' },
};

export const GRADIENTS = {
  github:    'linear-gradient(135deg, #080D1A 0%, #001B87 100%)',
  instagram: 'linear-gradient(135deg, #1A0800 0%, #8B3500 60%, #E67A2E 100%)',
  x:         'linear-gradient(135deg, #080D1A 0%, #001B87 70%, #0046FF 100%)',
  facebook:  'linear-gradient(135deg, #080D1A 0%, #001466 100%)',
  youtube:   'linear-gradient(135deg, #1A0000 0%, #6B0000 100%)',
  threads:   'linear-gradient(135deg, #0F0F0F 0%, #1E1E1E 100%)',
  screenshot:'linear-gradient(135deg, #1A0800 0%, #7A2E00 100%)',
  other:     'linear-gradient(135deg, #080D1A 0%, #001B87 100%)',
};

export const SORT_OPTIONS = [
  { key:'newest',  label:'⬇️ Newest'       },
  { key:'oldest',  label:'⬆️ Oldest'       },
  { key:'az',      label:'🔤 A → Z'        },
  { key:'opens',   label:'👁️ Most Opened'  },
  { key:'stars',   label:'⭐ Most Stars'   },
  { key:'prompts', label:'🧠 Prompts First' },
];

export const ALL_FILTERS = ['all','github','instagram','x','youtube','facebook','threads','screenshot','other'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function detectSource(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('github'))    return 'github';
    if (h.includes('instagram')) return 'instagram';
    if (h === 'x.com' || h.endsWith('.x.com') || h.includes('twitter')) return 'x';
    if (h.includes('facebook') || h.includes('fb.com')) return 'facebook';
    if (h.includes('youtube') || h.includes('youtu.be')) return 'youtube';
    if (h.includes('threads'))   return 'threads';
    return 'other';
  } catch { return 'other'; }
}

export function timeAgo(d) {
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  if (days < 365) return `${Math.floor(days/30)}mo ago`;
  return `${Math.floor(days/365)}y ago`;
}

export function fmtNum(n) {
  if (!n && n !== 0) return null;
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function sortEntries(entries, key) {
  const c = [...entries];
  switch (key) {
    case 'newest':  return c.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    case 'oldest':  return c.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    case 'az':      return c.sort((a,b) => a.title.localeCompare(b.title));
    case 'opens':   return c.sort((a,b) => (b.opens||0) - (a.opens||0));
    case 'stars':   return c.sort((a,b) => (b.stars??-1) - (a.stars??-1));
    case 'prompts': return c.sort((a,b) => (b.prompt_text?1:0) - (a.prompt_text?1:0));
    default: return c;
  }
}
