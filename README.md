# SPIN SH*TTY — worldwide high scores

This folder is the whole site: the game (`index.html`) and a small server function that stores the top 10 (`netlify/functions/scores.mjs`).

Scores are stored in **Netlify Blobs**, which is built into every Netlify site. There's no separate database account, no keys to set up, and it's free on the starter plan.

## Deploy (pick one)

Plain drag-and-drop on app.netlify.com does **not** install the function's dependency, so use Git or the CLI.

### A. Netlify CLI (quickest)
```bash
npm install -g netlify-cli
cd life-cycle-site
npm install
netlify login
netlify deploy --prod      # first time: choose "Create & configure a new site"
```

### B. GitHub
1. Push this folder to a new GitHub repo.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Leave the build settings empty; `netlify.toml` already has them. Click **Deploy**.

## Check it works
- Open `https://YOUR-SITE.netlify.app/api/scores`. It should show `{"top":[]}`.
- Play a shift and enter your initials. The board footer should say **WORLDWIDE TOP 10**.

## Optional settings
- `SCORE_SECRET` (Site settings → Environment variables): the key used to sign shift tokens. If you leave it unset, a random secret is generated and stored automatically.

## Wiping the board
In Netlify: **Blobs → store `life-cycle-scores`** → delete the `top` entry.
Or run: `netlify blobs:delete life-cycle-scores top`

## Anti-cheat (light)
- Every shift gets a signed, single-use token from the server.
- A score is only accepted if the shift lasted at least 30 s and the token is under 1 h old.
- The score must be achievable in that elapsed time.
- Each network address can submit once per 20 s.
- Initials are limited to 3 letters A–Z, and scores to 1–99,999.

This stops casual tampering, not a determined hacker: a browser game can never fully prove its own score.

## SEO / sharing
- `index.html` contains the title, description, Open Graph and Twitter share tags, and VideoGame structured data (keywords: laundromat minigame, Bed-Stuy, Brooklyn, Axis of Good). It also has hidden crawler-readable text, because the game itself is a canvas with no text search engines can read.
- `og-image.png` is the 1200×630 image used for link previews.
- When you know the final address, change `og-image.png` in the `og:image`, `twitter:image` and JSON-LD `image` entries to the full URL (e.g. `https://spinshitty.com/og-image.png`). Facebook and LinkedIn need the full URL. Also add `<link rel="canonical" href="https://YOUR-DOMAIN/">`.
- After going live, submit the site in Google Search Console, and link to it from axisofgood.com.
