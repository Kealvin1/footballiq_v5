# FootballIQ v5 — Complete Deployment Guide for Beginners

## What you need before starting
- The `footballiq-v5.zip` file (already downloaded)
- An email address
- Your Anthropic API key (`sk-ant-...`) from console.anthropic.com

**Total time: about 15 minutes**

---

## STEP 1 — Extract the ZIP file

**On Windows:**
Right-click `footballiq-v5.zip` → "Extract All" → Click "Extract"
You'll get a folder called `footballiq-v5` with these files inside:
```
footballiq-v5/
├── index.html
├── netlify.toml
├── package.json
├── .env.example
├── README.md
└── netlify/
    └── functions/
        ├── xg.js
        ├── referee.js
        ├── odds.js
        └── snap-odds.js
```

**On Mac:**
Double-click `footballiq-v5.zip` — it extracts automatically into the same folder.

---

## STEP 2 — Create a GitHub account

1. Open your browser and go to **https://github.com**
2. Click the green **"Sign up"** button
3. Enter your **email address** → click Continue
4. Create a **password** → click Continue
5. Choose a **username** (e.g. `yourname-football`) → click Continue
6. Click **"Continue for free"** when asked about a plan
7. Check your email for a verification code → enter it on GitHub
8. Skip all the setup questions (click "Skip this step" or "Skip personalization")
9. You're now on your GitHub dashboard ✓

---

## STEP 3 — Create a new repository

A "repository" is just a folder on GitHub that stores your project files.

1. On your GitHub dashboard, click the green **"New"** button (top left)
   — OR go to **https://github.com/new**

2. Fill in the form:
   - **Repository name:** `footballiq-v5`
   - **Description:** `AI football predictions` (optional)
   - **Public** is selected (leave it as is)
   - ☐ Do NOT tick "Add a README file"
   - ☐ Do NOT tick "Add .gitignore"
   - Leave everything else as default

3. Click the green **"Create repository"** button

4. You'll see a nearly empty page with a URL like:
   `https://github.com/YOUR-USERNAME/footballiq-v5`
   **Leave this page open** — you'll need it in the next step.

---

## STEP 4 — Upload your files to GitHub

This is the most important step. You need to upload the contents of your
`footballiq-v5` folder into this GitHub repository.

1. On your empty repository page, click **"uploading an existing file"**
   (it's a blue link in the middle of the page)

2. A file upload page opens with a big dashed box saying
   **"Drag files here to add them to your repository"**

3. Open your File Explorer (Windows) or Finder (Mac) and find the
   `footballiq-v5` folder you extracted in Step 1

4. **Select everything INSIDE that folder:**
   - On Windows: Open the folder → press Ctrl+A to select all files and folders
   - On Mac: Open the folder → press Cmd+A to select all

5. **Drag the selected files INTO the dashed box on GitHub**
   GitHub will show a progress spinner, then list all the files it detected.
   You should see something like:
   ```
   index.html
   netlify.toml
   package.json
   .env.example
   README.md
   netlify/functions/xg.js
   netlify/functions/referee.js
   netlify/functions/odds.js
   netlify/functions/snap-odds.js
   ```
   The `netlify/functions/` sub-folder structure is preserved automatically. ✓

   ⚠ If you don't see the `netlify/functions/` files listed, you dragged the
   FOLDER itself instead of its contents. Go back and try again — open the
   folder first, then select and drag what's inside.

6. Scroll down below the file list to the **"Commit changes"** section:
   - The first box already says "Add files via upload" — leave it as is
   - Click the green **"Commit changes"** button

7. Wait about 5–10 seconds. GitHub will refresh and show you all your files.
   You should see `index.html`, `netlify.toml`, `package.json` etc. listed.

   Click on the `netlify` folder — you should see a `functions` folder inside.
   Click `functions` — you should see `xg.js`, `referee.js`, `odds.js`, `snap-odds.js`.

   If all 9 files are there, you're done with GitHub ✓

---

## STEP 5 — Create a Netlify account

1. Go to **https://netlify.com**
2. Click **"Sign up"** (top right)
3. Click **"Sign up with GitHub"** — this is the easiest option
4. A GitHub popup appears asking permission → click **"Authorize Netlify"**
5. You're now logged into Netlify with your GitHub account ✓

---

## STEP 6 — Deploy your site on Netlify

1. On your Netlify dashboard, click the **"Add new site"** button

2. Click **"Import an existing project"**

3. Click **"GitHub"** under "Connect to Git provider"

4. If a popup appears asking you to authorize GitHub access, click
   **"Authorize Netlify"**

5. You'll see a list of your GitHub repositories.
   Click on **"footballiq-v5"**

6. A build settings page appears. Set it exactly like this:
   - **Branch to deploy:** `main`
   - **Base directory:** *(leave completely blank)*
   - **Build command:** *(leave completely blank)*
   - **Publish directory:** `.`
   
   Then click **"Deploy footballiq-v5"**

7. You'll see a deploy log with orange/green text scrolling by.
   Wait 1–2 minutes. When it's done, the top of the page shows:
   **"Site is live 🎉"** or a green **"Published"** badge

   Your site has a random URL like `https://cheerful-fox-abc123.netlify.app`
   — that's your app! But don't open it yet — finish Step 7 first.

---

## STEP 7 — Add your API keys (environment variables)

Your Anthropic API key needs to be stored securely in Netlify — not in any file.

**Add the Anthropic API key (required):**

1. In Netlify, click **"Site configuration"** in the left sidebar
   (or click **"Site settings"** — it may show either name)

2. In the left sidebar, click **"Environment variables"**

3. Click **"Add a variable"**

4. Fill in:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your API key starting with `sk-ant-...`
   
   *(Get your key at https://console.anthropic.com → click your name → API Keys → Create Key)*

5. Click **"Create variable"**

**Add The Odds API key (optional but recommended for live odds):**

6. Click **"Add a variable"** again

7. Fill in:
   - **Key:** `ODDS_API_KEY`
   - **Value:** your Odds API key
   
   *(Get a FREE key at https://the-odds-api.com → click "Get API Key" → sign up → free plan gives 500 requests/month)*

8. Click **"Create variable"**

---

## STEP 8 — Redeploy to apply the environment variables

The variables you just added need a fresh deploy to take effect.

1. Click **"Deploys"** in the left sidebar

2. Click the **"Trigger deploy"** dropdown button (top right of the deploys list)

3. Click **"Deploy site"**

4. Wait 1–2 minutes for the green **"Published"** status to appear

---

## STEP 9 — Open your app and configure it

1. Click your site URL at the top of the Netlify dashboard
   (looks like `https://cheerful-fox-abc123.netlify.app`)

2. FootballIQ v5 opens in your browser

3. Click the **⚙ Settings** button (top right of the app)

4. In the "Anthropic API Key" field, paste your `sk-ant-...` key
   *(Yes, you need to enter it here too — the Netlify one secures the data
   functions, this one is for the AI analysis)*

5. Set your preferred **Currency** (€, $, £, or MAD)

6. Click **Save**

7. Close the settings modal — your app is fully configured ✓

---

## STEP 10 — Run your first prediction

1. Click **Predict** (top nav)
2. Type a home team name (e.g. `Arsenal`)
3. Type an away team name (e.g. `Chelsea`)
4. Select the competition (e.g. `Premier League`)
5. Click **"Run v5 Analysis"**

You'll see the **3-phase loading screen:**
- 🟡 **Phase 0** (~3 seconds) — Fetching real xG data + live odds
- 🔵 **Phase 1** (~20 seconds) — AI searching for lineups, injuries, H2H
- 🟢 **Phase 2** (~25 seconds) — AI deep analysis with all data combined

Total wait: about 45–60 seconds for the first analysis.
After that, the same match is cached for 3 hours (instant reload).

---

## Troubleshooting

**"Icons are not showing"**
→ Wait 30 seconds and hard-refresh the page (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac)

**"Error: No API key configured"**
→ Go to ⚙ Settings in the app and enter your Anthropic key

**"xG data not found for this team"**
→ Only works for Premier League, La Liga, Bundesliga, Serie A, Ligue 1 teams.
Try the full official team name (e.g. "Manchester City" not "Man City")

**"Netlify function error"**
→ Check Netlify dashboard → Functions → check the function logs for details.
Most common cause: forgot to redeploy after adding environment variables (redo Step 8)

**"The site is blank"**
→ In Netlify, go to Deploys → check the most recent deploy shows "Published" not "Failed"
If Failed, click it to see the error log

**"I don't see my files after uploading to GitHub"**
→ Click on the `netlify` folder in your repo — if it's not there, repeat Step 4.
Make sure you opened the `footballiq-v5` folder first, then selected all contents inside it.

---

## How to update the app in the future

When a new version is available:
1. Go to your GitHub repository
2. Click on the file you want to update (e.g. `index.html`)
3. Click the pencil ✏ icon (Edit this file)
4. Replace the content, scroll down, click "Commit changes"
5. Netlify automatically redeploys within 1–2 minutes ✓
