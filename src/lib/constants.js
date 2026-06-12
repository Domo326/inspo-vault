// ─── Design tokens ────────────────────────────────────────────────────────────
export const C = {
  bg:'#070910', s1:'#0D1018', s2:'#131722', s3:'#1A2033',
  accent:'#818CF8', accentDeep:'#4F46E5', cyan:'#67E8F9',
  gold:'#FBBF24', green:'#34D399', purple:'#A78BFA', teal:'#2DD4BF',
  text:'#F1F5F9', sub:'#94A3B8', muted:'#475569',
  border:'rgba(255,255,255,0.07)',
};

// prompt_type: "extracted" = verbatim | "suggested" = AI-generated from image
export const PROMPT_STYLES = {
  extracted: { emoji:'🧠', label:'Extracted Prompt',  color:'#A78BFA', bg:'rgba(167,139,250,0.12)', border:'rgba(167,139,250,0.25)', desc:'Copied directly from the screenshot' },
  suggested: { emoji:'✨', label:'Suggested Prompt',  color:'#2DD4BF', bg:'rgba(45,212,191,0.10)',  border:'rgba(45,212,191,0.25)',  desc:'AI-generated based on what InspoVault saw — edit before using!' },
};

export const SOURCES = {
  github:    { emoji:'🐙', label:'GitHub',     color:'#818CF8', bg:'rgba(129,140,248,0.12)' },
  instagram: { emoji:'📸', label:'Instagram',  color:'#F472B6', bg:'rgba(244,114,182,0.12)' },
  x:         { emoji:'🐦', label:'X/Twitter',  color:'#67E8F9', bg:'rgba(103,232,249,0.12)' },
  facebook:  { emoji:'👤', label:'Facebook',   color:'#60A5FA', bg:'rgba(96,165,250,0.12)'  },
  youtube:   { emoji:'📺', label:'YouTube',    color:'#F87171', bg:'rgba(248,113,113,0.12)' },
  threads:   { emoji:'🧵', label:'Threads',    color:'#C084FC', bg:'rgba(192,132,252,0.12)' },
  screenshot:{ emoji:'📷', label:'Screenshot', color:'#A78BFA', bg:'rgba(167,139,250,0.12)' },
  other:     { emoji:'🌐', label:'Web',        color:'#34D399', bg:'rgba(52,211,153,0.12)'  },
};

export const GRADIENTS = {
  github:    'linear-gradient(135deg,#1e1b4b,#312e81)',
  instagram: 'linear-gradient(135deg,#7c3aed,#db2777 50%,#ea580c)',
  x:         'linear-gradient(135deg,#0c1a2e,#1e3a5f)',
  facebook:  'linear-gradient(135deg,#1d4ed8,#1e40af)',
  youtube:   'linear-gradient(135deg,#7f1d1d,#dc2626)',
  threads:   'linear-gradient(135deg,#4c1d95,#7c3aed)',
  screenshot:'linear-gradient(135deg,#312e81,#4c1d95)',
  other:     'linear-gradient(135deg,#065f46,#0d9488)',
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
