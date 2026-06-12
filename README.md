# 🗂️ InspoVault

Your personal inspiration HQ — save links, screenshots, and AI prompts from anywhere, chat with AI about each one, and never lose a good idea again.

---

## ✨ Features

- 🔗 **URL saving** — paste any link, auto-fetches title, description, and cover image
- 📷 **Screenshot upload** — Claude Vision reads your screenshot and extracts prompts or suggests one based on what it sees
- 🐙 **GitHub integration** — auto-pulls ⭐ stars and 🍴 forks from the GitHub API
- 🧠 **AI chat** — Claude Haiku knows the full context of each entry, including saved prompts
- 📱 **PWA** — installs on your phone, works offline
- 📤 **Android share sheet** — share any link directly from Instagram, GitHub, X, etc. into InspoVault
- 🔐 **Auth** — Supabase email/password, row-level security so only you see your data

---

## 🛠️ Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database + Auth | Supabase |
| AI | Claude Haiku (`claude-haiku-4-5-20251001`) via server-side API routes |
| Deployment | Vercel |
| PWA | Web manifest + custom service worker |

---

## 🚀 Setup

### 1. Clone and install

```bash
git clone https://github.com/Domo326/inspo-vault.git
cd inspo-vault
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Paste and run the contents of `supabase/schema.sql`
4. Go to **Settings → API** and copy your project URL and anon key

### 3. Set up environment variables

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with your actual keys:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-your-key
```

> ⚠️ The `ANTHROPIC_API_KEY` must **not** be prefixed with `NEXT_PUBLIC_` — it stays server-side only.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. In **Environment Variables**, add all three keys from your `.env.local`
4. Deploy!

---

## 📱 Install as PWA (Android — share sheet)

1. Open InspoVault in Chrome on your Android phone
2. Tap the **⋮ menu** → **Add to Home Screen**
3. Done! InspoVault now appears in your share sheet when you hit share on Instagram, GitHub, X, etc.

On Galaxy Z Fold 7, it'll show up as a full-screen app with no browser chrome 🔥

---

## 📁 Project Structure

```
inspo-vault/
├── public/
│   ├── manifest.json        # PWA + Web Share Target
│   └── sw.js                # Service worker
├── src/
│   ├── app/
│   │   ├── page.js          # Main app (client component)
│   │   ├── layout.js        # Root layout + SW registration
│   │   ├── globals.css      # All styles
│   │   ├── share-target/    # Handles incoming Android shares
│   │   └── api/
│   │       ├── fetch-meta/  # URL metadata (OG tags + GitHub API)
│   │       ├── chat/        # Claude Haiku chat
│   │       └── analyze/     # Claude Vision screenshot analysis
│   └── lib/
│       ├── supabase.js      # Auth + CRUD helpers
│       └── constants.js     # Design tokens, source configs, helpers
└── supabase/
    └── schema.sql           # Run this in Supabase SQL editor
```

---

## 🔑 Environment Variables

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

---

Built by Neko 🤙
