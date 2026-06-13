'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  supabase, signIn, signUp, signOut, fetchEntries, insertEntry, incrementOpens, deleteEntry, updateEntry
} from '@/lib/supabase';
import {
  C, PROMPT_STYLES, SOURCES, GRADIENTS, SORT_OPTIONS, ALL_FILTERS,
  timeAgo, fmtNum, sortEntries, detectSource,
} from '@/lib/constants';

// ─── Sub-components ────────────────────────────────────────────────────────

function PromptBadge({ type, small = false }) {
  if (!type) return null;
  const s = PROMPT_STYLES[type];
  return (
    <div className="tag" style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, fontSize:small?11:12 }}>
      {s.emoji} {small ? (type === 'extracted' ? 'Extracted' : 'Suggested') : s.label}
    </div>
  );
}

function PromptBox({ entry, expanded, onToggle, onCopy, copied }) {
  if (!entry?.prompt_text) return null;
  const s = PROMPT_STYLES[entry.prompt_type] || PROMPT_STYLES.suggested;
  return (
    <div className={`prompt-box${entry.prompt_type === 'suggested' ? ' sug' : ''}`} style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10, gap:12 }}>
        <div>
          <p style={{ fontSize:12, color:s.color, fontWeight:700 }}>{s.emoji} {s.label.toUpperCase()}</p>
          {entry.prompt_tool && <p style={{ fontSize:11, color:C.muted, marginTop:2 }}>🔧 For: {entry.prompt_tool}</p>}
          <p style={{ fontSize:11, color:entry.prompt_type==='suggested'?C.teal:C.muted, marginTop:3, lineHeight:1.4 }}>{s.desc}</p>
        </div>
        <button className="btn" style={{ flexShrink:0, background:'rgba(255,255,255,0.06)', color:C.sub, border:`1px solid ${C.border}`, padding:'5px 12px', borderRadius:8, fontSize:12 }} onClick={onToggle}>
          {expanded ? 'Hide ▲' : 'View ▼'}
        </button>
      </div>
      <p className="mono" style={{ fontSize:12, color:C.sub, lineHeight:1.6, whiteSpace:'pre-wrap', display:expanded?'block':'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:expanded?'visible':'hidden' }}>
        {entry.prompt_text}
      </p>
      {expanded && (
        <button className="btn" style={{ marginTop:12, width:'100%', background:s.bg, color:s.color, border:`1px solid ${s.border}`, padding:'10px', borderRadius:10, fontSize:14 }} onClick={() => onCopy(entry.prompt_text)}>
          {copied ? '✅ Copied!' : '📋 Copy Full Prompt'}
        </button>
      )}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────

function InspoVaultApp() {
  const searchParams = useSearchParams();

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user,       setUser]       = useState(null);
  const [authMode,    setAuthMode]    = useState('login');   // 'login' | 'signup'
  const [authEmail,   setAuthEmail]   = useState('');
  const [authPass,    setAuthPass]    = useState('');
  const [authLoad,    setAuthLoad]    = useState(false);
  const [authErr,     setAuthErr]     = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [booting,     setBooting]     = useState(true);

  // ── Entries state ─────────────────────────────────────────────────────────
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [sortKey,    setSortKey]    = useState('newest');

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showAdd,    setShowAdd]    = useState(false);
  const [addTab,     setAddTab]     = useState('url');
  const [showDetail, setShowDetail] = useState(false);
  const [showChat,   setShowChat]   = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [editData,   setEditData]   = useState(null);
  const [editLoad,   setEditLoad]   = useState(false);
  const [copied,     setCopied]     = useState(false);

  // ── URL-add state ─────────────────────────────────────────────────────────
  const [addUrl,     setAddUrl]     = useState('');
  const [fetching,   setFetching]   = useState(false);
  const [urlMeta,    setUrlMeta]    = useState(null);
  const [addTitle,   setAddTitle]   = useState('');
  const [addTags,    setAddTags]    = useState('');
  const [addNotes,   setAddNotes]   = useState('');
  const [saveErr,    setSaveErr]    = useState('');

  // ── Screenshot state ──────────────────────────────────────────────────────
  const [imgPreview, setImgPreview] = useState(null);
  const [imgB64,     setImgB64]     = useState(null);
  const [imgMime,    setImgMime]    = useState(null);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [analyzed,   setAnalyzed]   = useState(null);
  const [shotTitle,  setShotTitle]  = useState('');
  const [shotTags,   setShotTags]   = useState('');
  const [shotNotes,  setShotNotes]  = useState('');
  const [dragging,   setDragging]   = useState(false);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [msgs,       setMsgs]       = useState([]);
  const [chatIn,     setChatIn]     = useState('');
  const [chatLoad,   setChatLoad]   = useState(false);

  const chatEndRef  = useRef(null);
  const fileInputRef= useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  // ── Boot: check session ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setBooting(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load entries when user is set ─────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEntries();
      setEntries(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user) loadEntries();
  }, [user, loadEntries]);

  // ── Handle share target URL params on load ────────────────────────────────
  useEffect(() => {
    const addParam = searchParams.get('add');
    const urlParam = searchParams.get('url');
    if (addParam === 'true' && urlParam && user) {
      setAddUrl(decodeURIComponent(urlParam));
      setShowAdd(true);
    }
  }, [searchParams, user]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthLoad(true); setAuthErr(''); setAuthSuccess('');
    try {
      if (authMode === 'login') {
        await signIn(authEmail, authPass);
      } else {
        await signUp(authEmail, authPass);
        // If email confirmation is ON, no session fires — show a message
        // If confirmation is OFF, onAuthStateChange fires and logs them in automatically
        setAuthSuccess('✅ Account created! Check your email for a confirmation link, then come back and sign in. (If you turned off email confirmation in Supabase, you\'re already in!)');
        setAuthMode('login');
      }
    } catch (e) { setAuthErr(e.message); }
    finally { setAuthLoad(false); }
  };

  // ── URL fetch ─────────────────────────────────────────────────────────────
  const handleUrlFetch = async () => {
    if (!addUrl.trim()) return;
    setFetching(true); setUrlMeta(null);
    try {
      const isYouTube = addUrl.includes('youtube.com') || addUrl.includes('youtu.be');
      const endpoint  = isYouTube ? '/api/youtube-meta' : '/api/fetch-meta';
      const res  = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: addUrl }) });
      const data = await res.json();
      setUrlMeta(data);
      setAddTitle(data.title || '');
      if (data.suggested_tags?.length) setAddTags(data.suggested_tags.join(', '));
    } catch (e) { console.error(e); }
    finally { setFetching(false); }
  };

  const handleUrlSave = async () => {
    if (!urlMeta) return;
    setSaveErr('');
    try {
      const entry = await insertEntry({
        url: addUrl, title: addTitle || urlMeta.title, description: urlMeta.description,
        image_url: urlMeta.image_url, source_type: urlMeta.source_type,
        tags: addTags.split(',').map(t => t.trim()).filter(Boolean),
        notes: addNotes, prompt_text: null, prompt_tool: null, prompt_type: null,
        stars: urlMeta.stars ?? null, forks: urlMeta.forks ?? null, opens: 0,
        extracted_repos: urlMeta.extracted_repos || [],
      });
      setEntries(p => [entry, ...p]);
      closeAdd();
    } catch (e) { setSaveErr(e.message); }
  };

  // ── Screenshot flow ───────────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImgMime(file.type); setAnalyzed(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImgPreview(e.target.result);
      setImgB64(e.target.result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imgB64 || !imgMime) return;
    setAnalyzing(true);
    try {
      const res  = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ base64Data: imgB64, mimeType: imgMime }) });
      const data = await res.json();
      setAnalyzed(data);
      setShotTitle(data.title || '');
      setShotTags((data.tags || []).join(', '));
    } catch (e) { console.error(e); }
    finally { setAnalyzing(false); }
  };

  const handleShotSave = async () => {
    if (!analyzed) return;
    setSaveErr('');
    try {
      const entry = await insertEntry({
        url: '', title: shotTitle || analyzed.title || 'Screenshot',
        description: analyzed.description || '', image_url: imgPreview,
        source_type: analyzed.source_type || 'screenshot',
        tags: shotTags.split(',').map(t => t.trim()).filter(Boolean),
        notes: shotNotes, prompt_text: analyzed.prompt_text || null,
        prompt_tool: analyzed.prompt_tool || null, prompt_type: analyzed.prompt_type || null,
        stars: null, forks: null, opens: 0,
      });
      setEntries(p => [entry, ...p]);
      closeAdd();
    } catch (e) { setSaveErr(e.message); }
  };

  const closeAdd = () => {
    setShowAdd(false); setAddTab('url');
    setAddUrl(''); setUrlMeta(null); setAddTitle(''); setAddTags(''); setAddNotes(''); setSaveErr('');
    setImgPreview(null); setImgB64(null); setImgMime(null); setAnalyzed(null);
    setShotTitle(''); setShotTags(''); setShotNotes('');
  };

  // ── Open entry ────────────────────────────────────────────────────────────
  const openEntry = (entry) => {
    incrementOpens(entry.id).catch(() => {});
    const updated = { ...entry, opens: (entry.opens || 0) + 1 };
    setEntries(p => p.map(x => x.id === entry.id ? updated : x));
    setSelected(updated); setMsgs([]);
    setShowDetail(true); setShowChat(false); setShowPrompt(false);
  };

  const openChat = (entry) => {
    setSelected(entry); setShowDetail(false); setShowChat(true); setShowPrompt(false);
    const src = SOURCES[entry.source_type] || SOURCES.other;
    const ghLine  = entry.source_type === 'github' && entry.stars != null ? `\n⭐ **${fmtNum(entry.stars)} stars** · 🍴 **${fmtNum(entry.forks)} forks**` : '';
    const pLine   = entry.prompt_text ? `\n\n🧠 **This has a saved ${entry.prompt_type === 'suggested' ? 'suggested' : 'extracted'} prompt** for **${entry.prompt_tool || 'an AI tool'}**. I can help you use it, remix it, or walk you through exactly what it creates.` : '';
    setMsgs([{
      role:'assistant',
      content:`Hey Neko! 👋 Locked in on **${entry.title}** ${src.emoji}${ghLine}${pLine}\n\n**What it is:** ${entry.description}\n\n${entry.tags?.length ? `**Tags:** ${entry.tags.map(t=>`#${t}`).join(' ')}\n\n` : ''}${entry.notes ? `**Your note:** "${entry.notes}"\n\n` : ''}What do you want to do with this? 🚀`,
    }]);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatIn.trim() || chatLoad) return;
    const userMsg = { role:'user', content: chatIn };
    setChatIn('');
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs); setChatLoad(true);
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ messages: newMsgs, entry: selected }),
      });
      const data = await res.json();
      setMsgs(p => [...p, { role:'assistant', content: data.content || 'Something went sideways 😅' }]);
    } catch { setMsgs(p => [...p, { role:'assistant', content:'Hiccup! 😅 Try again.' }]); }
    finally { setChatLoad(false); }
  };

  // ── Share / copy prompt ───────────────────────────────────────────────────
  const shareEntry = async (entry) => {
    try {
      if (navigator.share) await navigator.share({ title: entry.title, text: entry.description, url: entry.url || window.location.href });
      else { await navigator.clipboard.writeText(entry.url || entry.title); alert('📋 Copied!'); }
    } catch {}
  };

  const copyPrompt = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const handleDelete = async (entry) => {
    if (!confirm(`Delete "${entry.title}"?`)) return;
    await deleteEntry(entry.id).catch(() => {});
    setEntries(p => p.filter(x => x.id !== entry.id));
    setShowDetail(false);
  };

  const handleSaveRepo = async (repo) => {
    try {
      const entry = await insertEntry({
        url:         repo.url,
        title:       repo.name || repo.full_name || repo.url,
        description: repo.context || repo.gh_desc || 'GitHub repository',
        image_url:   null,
        source_type: 'github',
        tags:        ['github', repo.language?.toLowerCase()].filter(Boolean),
        notes:       '',
        prompt_text: null, prompt_tool: null, prompt_type: null,
        stars:       repo.stars ?? null,
        forks:       repo.forks ?? null,
        opens:       0,
        extracted_repos: [],
      });
      setEntries(p => [entry, ...p]);
      alert(`✅ "${repo.name}" saved to your vault!`);
    } catch (e) { alert(`Error saving: ${e.message}`); }
  };

  const openEdit = (entry) => {
    setEditData({
      id:          entry.id,
      title:       entry.title       || '',
      description: entry.description || '',
      notes:       entry.notes       || '',
      tags:        entry.tags?.join(', ') || '',
      url:         entry.url         || '',
    });
    setShowDetail(false);
    setShowEdit(true);
  };

  const handleEditSave = async () => {
    if (!editData) return;
    setEditLoad(true);
    try {
      const updated = await updateEntry(editData.id, {
        title:       editData.title,
        description: editData.description,
        notes:       editData.notes,
        tags:        editData.tags.split(',').map(t => t.trim()).filter(Boolean),
        url:         editData.url,
      });
      setEntries(p => p.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
      setShowEdit(false);
      setShowDetail(true);
    } catch (e) { alert(`Save failed: ${e.message}`); }
    finally { setEditLoad(false); }
  };

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const activeFilters  = ALL_FILTERS.filter(s => s === 'all' || entries.some(e => e.source_type === s));
  const filtered       = filter === 'all' ? entries : entries.filter(e => e.source_type === filter);
  const display        = sortEntries(filtered, sortKey);
  const promptCount    = entries.filter(e => e.prompt_text).length;
  const extractedCount = entries.filter(e => e.prompt_type === 'extracted').length;
  const suggestedCount = entries.filter(e => e.prompt_type === 'suggested').length;

  // ─── BOOT LOADING ─────────────────────────────────────────────────────────
  if (booting) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:C.bg }}>
      <div style={{ fontSize:52, animation:'spin 1s linear infinite' }}>🗂️</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─── AUTH ──────────────────────────────────────────────────────────────────
  if (!user) return (
    <div className="iv" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:24 }}>
      <div style={{ textAlign:'center', marginBottom:48 }} className="fade-in">
        <div style={{ fontSize:72, marginBottom:12, filter:'drop-shadow(0 0 30px rgba(129,140,248,0.5))' }}>🗂️</div>
        <h1 className="sg" style={{ fontSize:40, fontWeight:700, letterSpacing:-1 }}>
          Inspo<span style={{ color:C.accent }}>Vault</span>
        </h1>
        <p style={{ color:C.sub, marginTop:8, fontSize:15 }}>Your personal inspiration HQ ✨</p>
      </div>

      <div className="slide-up" style={{ width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:12 }}>
        {/* Auth mode toggle */}
        <div style={{ display:'flex', gap:8, background:C.s2, padding:4, borderRadius:12, marginBottom:4 }}>
          {['login','signup'].map(m => (
            <button key={m} className={`tab ${authMode===m?'on':'off'}`} onClick={() => { setAuthMode(m); setAuthErr(''); }}>
              {m === 'login' ? '🔑 Sign In' : '✨ Sign Up'}
            </button>
          ))}
        </div>

        <input className="inp" type="email" placeholder="📧  Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />

        {/* Password field with show/hide toggle */}
        <div style={{ position:'relative' }}>
          <input
            className="inp"
            type={showPass ? 'text' : 'password'}
            placeholder="🔒  Password"
            value={authPass}
            onChange={e => setAuthPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{ paddingRight:48 }}
          />
          <button
            className="btn"
            onClick={() => setShowPass(p => !p)}
            style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', color:C.muted, fontSize:18, padding:0, lineHeight:1 }}
            tabIndex={-1}
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>

        {authErr     && <p style={{ color:'#F87171', fontSize:13, padding:'8px 12px', background:'rgba(248,113,113,0.1)', borderRadius:8 }}>{authErr}</p>}
        {authSuccess && <p style={{ color:'#34D399', fontSize:13, padding:'10px 12px', background:'rgba(52,211,153,0.1)', borderRadius:8, lineHeight:1.5 }}>{authSuccess}</p>}
        <button className="btn btn-p" style={{ width:'100%', marginTop:4, background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={handleAuth} disabled={authLoad}>
          {authLoad ? 'One sec... ⏳' : authMode === 'login' ? 'Enter the Vault 🚀' : 'Create Account ✨'}
        </button>
      </div>

      <p style={{ position:'absolute', bottom:24, color:C.muted, fontSize:12, textAlign:'center' }}>
        🐙 GitHub · 📸 Instagram · 🐦 X · 📺 YouTube · 🌐 Web
      </p>
    </div>
  );

  // ─── HOME ──────────────────────────────────────────────────────────────────
  return (
    <div className="iv">
      <div style={{ maxWidth:960, margin:'0 auto', padding:'0 16px 100px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'22px 0 20px' }}>
          <div>
            <h1 className="sg" style={{ fontSize:28, fontWeight:700 }}>Inspo<span style={{ color:C.accent }}>Vault</span> 🗂️</h1>
            <div style={{ display:'flex', gap:12, marginTop:4, flexWrap:'wrap' }}>
              <p style={{ color:C.muted, fontSize:13 }}>{entries.length} items</p>
              {extractedCount > 0 && <p style={{ color:C.purple, fontSize:13 }}>🧠 {extractedCount} extracted</p>}
              {suggestedCount > 0 && <p style={{ color:C.teal,   fontSize:13 }}>✨ {suggestedCount} suggested</p>}
            </div>
          </div>
          <button className="btn" onClick={() => { signOut(); setEntries([]); }}
            style={{ width:38, height:38, borderRadius:'50%', background:`linear-gradient(135deg,${C.accent},${C.cyan})`, color:'#fff', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Space Grotesk',sans-serif", fontWeight:700 }}
            title="Sign out">
            N
          </button>
        </div>

        {/* Prompt legend */}
        {promptCount > 0 && (
          <div style={{ display:'flex', gap:10, marginBottom:16, padding:'10px 14px', background:C.s1, borderRadius:12, border:`1px solid ${C.border}`, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:C.muted, alignSelf:'center' }}>Prompt types:</span>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <div className="tag" style={{ background:PROMPT_STYLES.extracted.bg, color:PROMPT_STYLES.extracted.color, border:`1px solid ${PROMPT_STYLES.extracted.border}`, fontSize:11 }}>🧠 Extracted — copied from screenshot</div>
              <div className="tag" style={{ background:PROMPT_STYLES.suggested.bg, color:PROMPT_STYLES.suggested.color, border:`1px solid ${PROMPT_STYLES.suggested.border}`, fontSize:11 }}>✨ Suggested — AI-generated from image</div>
            </div>
          </div>
        )}

        {/* Source filter */}
        <div className="scrow" style={{ marginBottom:12 }}>
          {activeFilters.map(s => (
            <button key={s} className={`chip${filter===s?' on':''}`} onClick={() => setFilter(s)}>
              {s === 'all' ? '✨ All' : `${SOURCES[s]?.emoji} ${SOURCES[s]?.label}`}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="scrow" style={{ marginBottom:20 }}>
          {SORT_OPTIONS.map(o => (
            <button key={o.key} className={`chip sort-chip${sortKey===o.key?' on':''}`} onClick={() => setSortKey(o.key)}>{o.label}</button>
          ))}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <p style={{ color:C.muted, fontSize:13 }}>{display.length} items{filter !== 'all' ? ` · ${SOURCES[filter]?.emoji} ${SOURCES[filter]?.label}` : ''}</p>
          <p style={{ color:C.muted, fontSize:12 }}>{SORT_OPTIONS.find(o => o.key===sortKey)?.label}</p>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid">
            {[1,2,3,4].map(i => (
              <div key={i} style={{ borderRadius:16, overflow:'hidden', background:C.s1 }}>
                <div className="shimmer" style={{ height:160 }} />
                <div style={{ padding:'14px 16px' }}>
                  <div className="shimmer" style={{ height:12, width:'40%', marginBottom:10 }} />
                  <div className="shimmer" style={{ height:16, marginBottom:8 }} />
                  <div className="shimmer" style={{ height:12, width:'80%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {!loading && (
          <div className="grid">
            {display.map(entry => {
              const src = SOURCES[entry.source_type] || SOURCES.other;
              const pt  = entry.prompt_type;
              return (
                <div key={entry.id} className={`card${pt ? ' '+pt : ''}`} onClick={() => openEntry(entry)}>
                  {entry.image_url
                    ? <img src={entry.image_url} alt={entry.title} style={{ width:'100%', height:160, objectFit:'cover' }} />
                    : <div style={{ width:'100%', height:160, background:GRADIENTS[entry.source_type]||GRADIENTS.other, display:'flex', alignItems:'center', justifyContent:'center', fontSize:54 }}>{src.emoji}</div>
                  }
                  <div style={{ padding:'14px 16px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:6, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <div className="tag" style={{ background:src.bg, color:src.color }}>{src.emoji} {src.label}</div>
                        {pt && <PromptBadge type={pt} small />}
                      </div>
                      {(entry.opens||0) > 0 && <span style={{ fontSize:11, color:C.muted }}>👁️ {entry.opens}</span>}
                    </div>
                    <h3 className="sg" style={{ fontSize:15, fontWeight:600, marginBottom:6, lineHeight:1.3 }}>{entry.title}</h3>
                    <p style={{ color:C.sub, fontSize:13, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{entry.description}</p>

                    {entry.prompt_text && (
                      <div style={{ marginTop:10, padding:'8px 12px', background:pt==='suggested'?'rgba(45,212,191,0.06)':'rgba(167,139,250,0.06)', borderRadius:8, border:`1px solid ${pt==='suggested'?'rgba(45,212,191,0.15)':'rgba(167,139,250,0.15)'}` }}>
                        <p style={{ fontSize:11, color:pt==='suggested'?C.teal:C.purple, fontWeight:600, marginBottom:3 }}>
                          {PROMPT_STYLES[pt]?.emoji} {entry.prompt_tool || 'AI Prompt'}{pt==='suggested'&&<span style={{ fontWeight:400, color:C.muted }}> — suggested</span>}
                        </p>
                        <p className="mono" style={{ fontSize:11, color:C.muted, lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{entry.prompt_text}</p>
                      </div>
                    )}

                    {entry.source_type === 'github' && (entry.stars != null || entry.forks != null) && (
                      <div style={{ display:'flex', gap:8, marginTop:10 }}>
                        {entry.stars != null && <span className="stat-pill">⭐ {fmtNum(entry.stars)}</span>}
                        {entry.forks != null && <span className="stat-pill forks">🍴 {fmtNum(entry.forks)}</span>}
                      </div>
                    )}

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10 }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {entry.tags?.slice(0,2).map(t => (
                          <span key={t} style={{ fontSize:11, color:C.muted, background:C.s2, padding:'2px 8px', borderRadius:20, border:`1px solid ${C.border}` }}>#{t}</span>
                        ))}
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {entry.extracted_repos?.length > 0 && (
                          <span style={{ fontSize:11, color:'#F87171', fontWeight:600 }}>📦 {entry.extracted_repos.length} repo{entry.extracted_repos.length > 1 ? 's' : ''}</span>
                        )}
                        <span style={{ color:C.muted, fontSize:12 }}>{timeAgo(entry.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && display.length === 0 && (
          <div style={{ textAlign:'center', padding:'80px 0', color:C.muted }}>
            <div style={{ fontSize:52, marginBottom:16 }}>🌌</div>
            <p className="sg" style={{ fontSize:18, color:C.sub }}>Nothing here yet</p>
            <p style={{ fontSize:14, marginTop:6 }}>Hit + to save your first item!</p>
          </div>
        )}

        {/* FAB */}
        <button className="btn" onClick={() => setShowAdd(true)} style={{
          position:'fixed', bottom:28, right:24, width:62, height:62, borderRadius:'50%',
          background:`linear-gradient(135deg,${C.accent},${C.accentDeep})`,
          color:'#fff', fontSize:30, display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:`0 4px 24px rgba(129,140,248,0.55)`,
        }}>+</button>
      </div>

      {/* ═══ ADD MODAL ══════════════════════════════════════════════════════ */}
      {showAdd && (
        <div className="overlay fade-in" onClick={e => e.target===e.currentTarget && closeAdd()}>
          <div className="panel slide-up" style={{ padding:'0 20px 36px' }}>
            <div style={{ width:40, height:4, background:C.s3, borderRadius:2, margin:'16px auto 20px' }} />
            <h2 className="sg" style={{ fontSize:22, fontWeight:700, marginBottom:16 }}>Add to Vault ➕</h2>

            {/* Tabs */}
            <div style={{ display:'flex', gap:8, marginBottom:20, background:C.s2, padding:4, borderRadius:12 }}>
              <button className={`tab ${addTab==='url'?'on':'off'}`} onClick={() => setAddTab('url')}>🔗 URL</button>
              <button className={`tab ${addTab==='screenshot'?'on':'off'}`} onClick={() => setAddTab('screenshot')}>📷 Screenshot</button>
            </div>

            {/* ── URL TAB ── */}
            {addTab === 'url' && (
              <>
                <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                  <input className="inp" placeholder="🔗  Paste any URL..." value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key==='Enter' && handleUrlFetch()} />
                  <button className="btn btn-p" style={{ flexShrink:0, padding:'12px 18px', background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={handleUrlFetch} disabled={fetching||!addUrl.trim()}>
                    {fetching ? '⏳' : 'Fetch 🔍'}
                  </button>
                </div>
                {addUrl.includes('github.com') && (
                  <p style={{ fontSize:12, color:C.accent, marginBottom:12, padding:'8px 12px', background:'rgba(129,140,248,0.08)', borderRadius:8, border:'1px solid rgba(129,140,248,0.2)' }}>
                    🐙 GitHub detected — will pull ⭐ stars and 🍴 forks from the API!
                  </p>
                )}
                {(addUrl.includes('youtube.com') || addUrl.includes('youtu.be')) && (
                  <p style={{ fontSize:12, color:'#F87171', marginBottom:12, padding:'8px 12px', background:'rgba(248,113,113,0.08)', borderRadius:8, border:'1px solid rgba(248,113,113,0.2)' }}>
                    📺 YouTube detected — will summarize the video and extract every GitHub repo mentioned!
                  </p>
                )}
                {fetching && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div className="shimmer" style={{ height:130 }} />
                    <div className="shimmer" style={{ height:16, width:'55%' }} />
                    <div className="shimmer" style={{ height:12, width:'75%' }} />
                  </div>
                )}
                {urlMeta && !fetching && (
                  <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {urlMeta.image_url
                      ? <img src={urlMeta.image_url} style={{ width:'100%', height:150, objectFit:'cover', borderRadius:12 }} alt="" />
                      : <div style={{ height:90, borderRadius:12, background:GRADIENTS[urlMeta.source_type]||GRADIENTS.other, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40 }}>{SOURCES[urlMeta.source_type]?.emoji}</div>
                    }
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                      <div className="tag" style={{ background:SOURCES[urlMeta.source_type]?.bg, color:SOURCES[urlMeta.source_type]?.color }}>{SOURCES[urlMeta.source_type]?.emoji} {SOURCES[urlMeta.source_type]?.label}</div>
                      {urlMeta.stars != null && <span className="stat-pill">⭐ {fmtNum(urlMeta.stars)}</span>}
                      {urlMeta.forks != null && <span className="stat-pill forks">🍴 {fmtNum(urlMeta.forks)}</span>}
                    </div>
                    <input className="inp" value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Title" />
                    <p style={{ color:C.sub, fontSize:13, lineHeight:1.5, padding:'10px 14px', background:C.s2, borderRadius:10, border:`1px solid ${C.border}` }}>{urlMeta.description}</p>
                    <input className="inp" placeholder="🏷️  Tags — design, tools, gamedev" value={addTags} onChange={e => setAddTags(e.target.value)} />
                    <textarea className="inp" placeholder="📝  Your notes..." value={addNotes} onChange={e => setAddNotes(e.target.value)} rows={3} style={{ resize:'none' }} />
                    {saveErr && <p style={{ color:'#F87171', fontSize:13 }}>⚠️ {saveErr}</p>}
                    <div style={{ display:'flex', gap:10, marginTop:4 }}>
                      <button className="btn btn-g" style={{ flex:1 }} onClick={closeAdd}>Cancel</button>
                      <button className="btn btn-p" style={{ flex:2, background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={handleUrlSave}>Save to Vault 💾</button>
                    </div>
                  </div>
                )}
                {!urlMeta && !fetching && (
                  <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
                    <p style={{ fontSize:14 }}>Paste any link and hit Fetch</p>
                    <p style={{ fontSize:12, marginTop:6 }}>GitHub · Instagram · X · YouTube · Threads · anything</p>
                  </div>
                )}
              </>
            )}

            {/* ── SCREENSHOT TAB ── */}
            {addTab === 'screenshot' && (
              <>
                {!imgPreview ? (
                  <>
                    <div
                      className={`drop-zone${dragging ? ' drag' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div style={{ fontSize:48, marginBottom:12 }}>📷</div>
                      <p className="sg" style={{ fontSize:16, fontWeight:600, color:C.sub }}>Drop your screenshot here</p>
                      <p style={{ fontSize:13, color:C.muted, marginTop:6 }}>or tap to browse · PNG, JPG, WEBP</p>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleFileSelect(e.target.files[0])} />
                    </div>
                    <p style={{ textAlign:'center', color:C.muted, fontSize:13, marginTop:14 }}>
                      ✨ Claude Vision will extract any prompts or generate a suggested one based on what it sees
                    </p>
                  </>
                ) : (
                  <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <div style={{ position:'relative' }}>
                      <img src={imgPreview} style={{ width:'100%', maxHeight:220, objectFit:'contain', borderRadius:12, background:C.s2 }} alt="Screenshot" />
                      <button className="btn" style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,0.6)', color:C.text, width:28, height:28, borderRadius:'50%', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}
                        onClick={() => { setImgPreview(null); setImgB64(null); setAnalyzed(null); }}>✕</button>
                    </div>

                    {!analyzed && !analyzing && (
                      <button className="btn btn-p" style={{ background:'linear-gradient(135deg,#A78BFA,#7C3AED)', borderRadius:12, padding:'14px' }} onClick={handleAnalyze}>
                        🧠 Analyze with Claude Vision
                      </button>
                    )}

                    {analyzing && (
                      <div style={{ textAlign:'center', padding:'20px 0' }}>
                        <div style={{ fontSize:32, marginBottom:8 }} className="spin">🧠</div>
                        <p style={{ color:C.purple, fontSize:14, fontWeight:500 }}>Reading your screenshot...</p>
                        <p style={{ color:C.muted, fontSize:12, marginTop:4 }}>Extracting prompts, tips, and metadata</p>
                      </div>
                    )}

                    {analyzed && !analyzing && (
                      <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:12 }}>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                          <div className="tag" style={{ background:SOURCES[analyzed.source_type]?.bg||SOURCES.screenshot.bg, color:SOURCES[analyzed.source_type]?.color||SOURCES.screenshot.color }}>
                            {SOURCES[analyzed.source_type]?.emoji||'📷'} {SOURCES[analyzed.source_type]?.label||analyzed.platform||'Screenshot'}
                          </div>
                          {analyzed.has_prompt && <PromptBadge type={analyzed.prompt_type} />}
                          {analyzed.prompt_tool && <div className="tag" style={{ background:'rgba(52,211,153,0.1)', color:C.green }}>🔧 {analyzed.prompt_tool}</div>}
                        </div>

                        <div style={{ padding:'10px 14px', background:C.s2, borderRadius:10, border:`1px solid ${C.border}` }}>
                          <p style={{ fontSize:12, color:C.muted, fontWeight:600, marginBottom:4 }}>✨ WHAT CLAUDE FOUND</p>
                          <p style={{ fontSize:13, color:C.sub, lineHeight:1.5 }}>{analyzed.description}</p>
                          {analyzed.use_case && <p style={{ fontSize:12, color:C.accent, marginTop:6 }}>💡 {analyzed.use_case}</p>}
                        </div>

                        {analyzed.prompt_text && (
                          <div className={`prompt-box${analyzed.prompt_type==='suggested'?' sug':''}`}>
                            <p style={{ fontSize:12, color:analyzed.prompt_type==='suggested'?C.teal:C.purple, fontWeight:600, marginBottom:6 }}>
                              {PROMPT_STYLES[analyzed.prompt_type]?.emoji} {PROMPT_STYLES[analyzed.prompt_type]?.label}
                            </p>
                            <p className="mono" style={{ fontSize:12, color:C.sub, lineHeight:1.6, maxHeight:100, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical' }}>{analyzed.prompt_text}</p>
                            <p style={{ fontSize:11, color:C.muted, marginTop:6 }}>Full prompt saved and copyable in the entry ✅</p>
                          </div>
                        )}

                        <input className="inp" value={shotTitle} onChange={e => setShotTitle(e.target.value)} placeholder="Title" />
                        <input className="inp" value={shotTags}  onChange={e => setShotTags(e.target.value)}  placeholder="🏷️  Tags" />
                        <textarea className="inp" placeholder="📝  Your notes..." value={shotNotes} onChange={e => setShotNotes(e.target.value)} rows={2} style={{ resize:'none' }} />
                        {saveErr && <p style={{ color:'#F87171', fontSize:13 }}>⚠️ {saveErr}</p>}
                        <div style={{ display:'flex', gap:10, marginTop:4 }}>
                          <button className="btn btn-g" style={{ flex:1 }} onClick={closeAdd}>Cancel</button>
                          <button className="btn" style={{ flex:2, background:'linear-gradient(135deg,#A78BFA,#7C3AED)', color:'#fff', padding:'12px', borderRadius:12, fontSize:15, fontWeight:500, border:'none', cursor:'pointer' }} onClick={handleShotSave}>Save to Vault 💾</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ DETAIL PANEL ═══════════════════════════════════════════════════ */}
      {showDetail && selected && (
        <div className="overlay fade-in" onClick={e => e.target===e.currentTarget && setShowDetail(false)}>
          <div className="panel slide-up">
            {selected.image_url
              ? <img src={selected.image_url} style={{ width:'100%', height:200, objectFit:'cover' }} alt="" />
              : <div style={{ height:140, background:GRADIENTS[selected.source_type]||GRADIENTS.other, display:'flex', alignItems:'center', justifyContent:'center', fontSize:60 }}>{SOURCES[selected.source_type]?.emoji}</div>
            }
            <div style={{ padding:'20px 20px 36px' }}>
              <div style={{ width:40, height:4, background:C.s3, borderRadius:2, margin:'-8px auto 20px' }} />
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                <div className="tag" style={{ background:SOURCES[selected.source_type]?.bg, color:SOURCES[selected.source_type]?.color }}>{SOURCES[selected.source_type]?.emoji} {SOURCES[selected.source_type]?.label}</div>
                {selected.prompt_type && <PromptBadge type={selected.prompt_type} />}
                {selected.stars != null && <span className="stat-pill">⭐ {fmtNum(selected.stars)}</span>}
                {selected.forks != null && <span className="stat-pill forks">🍴 {fmtNum(selected.forks)}</span>}
                <span style={{ fontSize:12, color:C.muted, alignSelf:'center' }}>👁️ {selected.opens||0}</span>
              </div>
              <h2 className="sg" style={{ fontSize:21, fontWeight:700, marginBottom:10, lineHeight:1.3 }}>{selected.title}</h2>
              <p style={{ color:C.sub, fontSize:14, lineHeight:1.6, marginBottom:16 }}>{selected.description}</p>
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display:'block', padding:'10px 14px', background:C.s2, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:16, textDecoration:'none' }}
                >
                  <p style={{ color:C.accent, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>🔗 {selected.url}</p>
                </a>
              )}
              {selected.tags?.length > 0 && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                  {selected.tags.map(t => <span key={t} style={{ fontSize:12, color:C.sub, background:C.s2, padding:'4px 12px', borderRadius:20, border:`1px solid ${C.border}` }}>#{t}</span>)}
                </div>
              )}
              {selected.notes && (
                <div style={{ padding:'12px 14px', background:'rgba(129,140,248,0.07)', borderRadius:10, border:'1px solid rgba(129,140,248,0.18)', marginBottom:16 }}>
                  <p style={{ fontSize:11, color:C.accent, fontWeight:600, marginBottom:4 }}>📝 YOUR NOTES</p>
                  <p style={{ fontSize:14, color:C.sub, lineHeight:1.5 }}>{selected.notes}</p>
                </div>
              )}

              <PromptBox entry={selected} expanded={showPrompt} onToggle={() => setShowPrompt(p => !p)} onCopy={copyPrompt} copied={copied} />

              {/* ── Extracted repos from YouTube video ── */}
              {selected.extracted_repos?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <p style={{ fontSize:12, color:'#F87171', fontWeight:700, marginBottom:12 }}>
                    📦 REPOS MENTIONED IN THIS VIDEO ({selected.extracted_repos.length})
                  </p>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {selected.extracted_repos.map((repo, i) => (
                      <div key={i} style={{ background:C.s2, border:`1px solid ${repo.verified ? 'rgba(129,140,248,0.2)' : 'rgba(251,191,36,0.2)'}`, borderRadius:12, padding:'12px 14px' }}>
                        {/* Repo header */}
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <span style={{ fontSize:14, fontWeight:600, fontFamily:"'Space Grotesk',sans-serif", color:C.text }}>
                                🐙 {repo.full_name || repo.name}
                              </span>
                              {!repo.verified && (
                                <span style={{ fontSize:10, color:'#FBBF24', background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', padding:'2px 7px', borderRadius:20, fontWeight:600 }}>
                                  ⚠️ UNVERIFIED
                                </span>
                              )}
                            </div>
                            {/* Stars + forks */}
                            {repo.stars != null && (
                              <div style={{ display:'flex', gap:10, marginTop:4 }}>
                                <span style={{ fontSize:12, color:'#FBBF24' }}>⭐ {repo.stars?.toLocaleString()}</span>
                                <span style={{ fontSize:12, color:C.green }}>🍴 {repo.forks?.toLocaleString()}</span>
                                {repo.language && <span style={{ fontSize:12, color:C.muted }}>{repo.language}</span>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* What the video says about it */}
                        {repo.context && (
                          <p style={{ fontSize:13, color:C.sub, lineHeight:1.5, marginBottom:10 }}>{repo.context}</p>
                        )}
                        {!repo.context && repo.gh_desc && (
                          <p style={{ fontSize:13, color:C.sub, lineHeight:1.5, marginBottom:10 }}>{repo.gh_desc}</p>
                        )}

                        {/* Actions */}
                        <div style={{ display:'flex', gap:8 }}>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ flex:1, textAlign:'center', padding:'8px', borderRadius:8, background:'rgba(129,140,248,0.12)', color:C.accent, border:'1px solid rgba(129,140,248,0.25)', fontSize:13, fontWeight:500, textDecoration:'none', cursor:'pointer' }}
                          >
                            Open Repo 🔗
                          </a>
                          <button
                            className="btn"
                            style={{ flex:1, padding:'8px', borderRadius:8, background:'rgba(52,211,153,0.1)', color:C.green, border:'1px solid rgba(52,211,153,0.25)', fontSize:13 }}
                            onClick={() => handleSaveRepo(repo)}
                          >
                            Save to Vault 💾
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                <button className="btn btn-g" style={{ flex:1 }} onClick={() => shareEntry(selected)}>📤 Share</button>
                <button className="btn btn-g" style={{ flex:1 }} onClick={() => openEdit(selected)}>✏️ Edit</button>
              </div>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <button className="btn btn-p" style={{ flex:1, background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={() => openChat(selected)}>
                  💬 {selected.prompt_text ? 'Chat & Use Prompt' : 'Chat About This'}
                </button>
              </div>
              <button className="btn btn-g" style={{ width:'100%', color:'#F87171', borderColor:'rgba(248,113,113,0.2)' }} onClick={() => handleDelete(selected)}>
                🗑️ Delete entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT MODAL ═════════════════════════════════════════════════════ */}
      {showEdit && editData && (
        <div className="overlay fade-in" onClick={e => e.target===e.currentTarget && setShowEdit(false)}>
          <div className="panel slide-up" style={{ padding:'0 20px 36px' }}>
            <div style={{ width:40, height:4, background:C.s3, borderRadius:2, margin:'16px auto 20px' }} />
            <h2 className="sg" style={{ fontSize:22, fontWeight:700, marginBottom:20 }}>Edit Entry ✏️</h2>

            {/* Title */}
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>TITLE</p>
              <input
                className="inp"
                value={editData.title}
                onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                placeholder="Give it a descriptive title..."
              />
            </div>

            {/* URL */}
            {editData.url && (
              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>URL</p>
                <input
                  className="inp"
                  value={editData.url}
                  onChange={e => setEditData(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://..."
                  style={{ fontSize:13 }}
                />
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>DESCRIPTION</p>
              <textarea
                className="inp"
                value={editData.description}
                onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                placeholder="What is this about..."
                rows={3}
                style={{ resize:'none' }}
              />
            </div>

            {/* Tags */}
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>TAGS</p>
              <input
                className="inp"
                value={editData.tags}
                onChange={e => setEditData(p => ({ ...p, tags: e.target.value }))}
                placeholder="ai, tools, gamedev, design..."
              />
              {/* Tag preview */}
              {editData.tags && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                  {editData.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} style={{ fontSize:12, color:C.sub, background:C.s2, padding:'3px 10px', borderRadius:20, border:`1px solid ${C.border}` }}>#{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom:20 }}>
              <p style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>YOUR NOTES</p>
              <textarea
                className="inp"
                value={editData.notes}
                onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Add your personal notes, ideas, or reminders..."
                rows={3}
                style={{ resize:'none' }}
              />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-g" style={{ flex:1 }} onClick={() => { setShowEdit(false); setShowDetail(true); }}>Cancel</button>
              <button className="btn btn-p" style={{ flex:2, background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={handleEditSave} disabled={editLoad}>
                {editLoad ? 'Saving... ⏳' : 'Save Changes 💾'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CHAT PANEL ═════════════════════════════════════════════════════ */}
      {showChat && selected && (
        <div className="overlay fade-in" onClick={e => e.target===e.currentTarget && setShowChat(false)}>
          <div className="panel slide-up" style={{ height:'92vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <span style={{ fontSize:28 }}>{SOURCES[selected.source_type]?.emoji||'📷'}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p className="sg" style={{ fontWeight:600, fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.title}</p>
                <div style={{ display:'flex', gap:8, marginTop:2, alignItems:'center' }}>
                  {selected.prompt_type && <span style={{ fontSize:11, color:selected.prompt_type==='suggested'?C.teal:C.purple }}>{PROMPT_STYLES[selected.prompt_type]?.emoji} {selected.prompt_type}</span>}
                  {selected.stars != null && <span style={{ fontSize:11, color:C.gold }}>⭐ {fmtNum(selected.stars)}</span>}
                  <span style={{ color:C.muted, fontSize:11 }}>Claude Haiku ⚡</span>
                </div>
              </div>
              <button className="btn" style={{ background:C.s2, width:36, height:36, borderRadius:'50%', fontSize:16, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowChat(false)}>✕</button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:14 }}>
              {msgs.map((m,i) => (
                <div key={i} className={`${m.role==='user'?'bu':'ba'} fade-in`}
                  dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>') }} />
              ))}
              {chatLoad && (
                <div className="ba" style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {[0,.2,.4].map(d => <div key={d} style={{ width:8, height:8, borderRadius:'50%', background:C.accent, animation:`pulse 1s ${d}s infinite` }} />)}
                  <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {msgs.length <= 1 && (
              <div className="scrow" style={{ padding:'0 12px 10px', flexShrink:0 }}>
                {(selected.prompt_text
                  ? ['🎯 How do I use this prompt?', '✏️ Help me customize this', '📺 Make a video walkthrough', '🚀 What can I create with this?']
                  : ['🛠️ How do I set this up?', '💡 Use cases for my projects', '📺 Help me make a video', '🚀 Walk me through it']
                ).map(q => <button key={q} className="btn chip" style={{ fontSize:12, padding:'8px 14px' }} onClick={() => setChatIn(q)}>{q}</button>)}
              </div>
            )}

            <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', gap:10, flexShrink:0 }}>
              <input className="inp" placeholder={selected.prompt_text ? 'Ask about this prompt... 🧠' : 'Ask anything... 💬'} value={chatIn} onChange={e => setChatIn(e.target.value)} onKeyDown={e => e.key==='Enter' && !e.shiftKey && sendChat()} style={{ flex:1 }} />
              <button className="btn btn-p" style={{ flexShrink:0, padding:'12px 16px', background:`linear-gradient(135deg,${C.accent},${C.accentDeep})` }} onClick={sendChat} disabled={chatLoad||!chatIn.trim()}>➤</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#070910', fontSize:52 }}>🗂️</div>}>
      <InspoVaultApp />
    </Suspense>
  );
}
