# SDLC Dashboard — Test Case Analyser

Live site: **https://test-case-analyser.production.catalystserverless.com/app/**

> The site is hosted on **Zoho Catalyst** — the URL is purely project-name based and does not include any GitHub username.

## Project structure

```
├── catalyst.json                  # Zoho Catalyst project configuration
├── client/
│   └── app/                       # Static web-client (served by Catalyst)
│       ├── index.html
│       ├── test-case-analyzer.html
│       ├── test-case-analyzer.js
│       ├── test-case-analyzer.css
│       ├── styles.css
│       ├── dashboard.html
│       ├── dashboard.js
│       ├── dashboard-script.js
│       ├── dashboard-styles.css
│       ├── read-excel-file.min.js
│       └── client-package.json    # Catalyst web-client descriptor
└── .github/
    └── workflows/
        └── catalyst-deploy.yml    # Auto-deploys to Catalyst on push to main
```

## Step-by-step: how to host on Zoho Catalyst

Follow these steps **once** to get the site live. After that, every future change you or Copilot makes will deploy automatically.

---

### Step 1 — Create a Zoho account and sign in to Catalyst

1. Go to **[catalyst.zoho.com](https://catalyst.zoho.com)**.
2. Click **Sign Up** if you don't have a Zoho account, or **Sign In** if you do.

---

### Step 2 — Create a Catalyst project

1. Inside the Catalyst Console, click **Create Project**.
2. Name the project exactly **`test-case-analyser`** (lowercase, hyphenated).
3. Choose the **Spark** (free) plan.
4. Click **Create**.

---

### Step 3 — Collect your three IDs

You need three numbers from the Catalyst Console. Open the project you just created and note them down:

| ID | Where to find it |
|---|---|
| **Project ID** | Catalyst Console → your project → **Settings** → Project Details |
| **Org ID** | Catalyst Console → top-right profile menu → **Organization Settings** |
| **Web Client ID** | Catalyst Console → your project → **Web Client** → click your client → **App Settings** |

---

### Step 4 — Update `catalyst.json` in GitHub

1. Open this repository on GitHub.
2. Click on the file **`catalyst.json`** and then click the ✏️ **Edit** (pencil) icon.
3. Replace the three placeholder values with the real IDs you noted in Step 3:

   ```json
   {
     "project_name": "test-case-analyser",
     "project_id": "1234567890",
     "org_id":     "9876543210",
     ...
     "web_client": [
       {
         "id": "1122334455",
         ...
       }
     ]
   }
   ```

4. Scroll down and click **Commit changes** (commit directly to `main`).

---

### Step 5 — Install Node.js and the Catalyst CLI (on your computer)

> **Skip this step** if you only want auto-deployment via GitHub Actions and never need to deploy manually.

1. Download and install **Node.js** from [nodejs.org](https://nodejs.org) (LTS version).
2. Open a terminal (Command Prompt / PowerShell on Windows, Terminal on Mac/Linux) and run:

   ```bash
   npm install -g zcatalyst-cli
   ```

3. Log in to Catalyst from the terminal:

   ```bash
   catalyst login
   ```

   This opens a browser window — sign in with your Zoho account.

---

### Step 6 — Generate a Catalyst token and add it to GitHub

This allows GitHub Actions to deploy on your behalf automatically.

1. In the same terminal, run:

   ```bash
   catalyst token:generate
   ```

   Copy the token that is printed.

2. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Set:
   - **Name:** `CATALYST_TOKEN`
   - **Secret:** *(paste the token you copied)*
4. Click **Add secret**.

---

### Step 7 — Trigger the first deployment

1. Go to your GitHub repository → **Actions** tab.
2. Click **Deploy to Zoho Catalyst** in the left panel.
3. Click **Run workflow** → **Run workflow**.

GitHub Actions will install the Catalyst CLI and push the site to Catalyst. The run takes about 1–2 minutes.

---

### Step 8 — Promote to production

The workflow deploys to the **Development** environment first.

1. In the Catalyst Console, open your project.
2. Go to **Deployments** and click **Promote to Production**.

Your site is now live at:

> **https://test-case-analyser.production.catalystserverless.com/app/**

---

### That's it! 🎉

From now on, every time a change is merged to `main` (whether you make it or Copilot makes it), GitHub Actions redeploys the site to Catalyst automatically — no manual steps needed.

## URL

| Environment | URL |
|---|---|
| Development | `https://test-case-analyser-development.catalystserverless.com/app/` |
| Production  | `https://test-case-analyser.production.catalystserverless.com/app/`  |

> **Tip:** To remove the `/app` suffix, add an API Gateway rule in the Catalyst Console:
> - Request URL: `/ {path1: (.*)}`
> - Target: Web Client Hosting → `/app/{path1}`

## Making enhancements after deployment

Deploying to Catalyst does **not** change how the site is developed. All site source files continue to live in this GitHub repository under `client/app/`. The full enhancement loop is:

```
Edit files in client/app/  →  open / merge a PR  →  push to main  →  GitHub Actions redeploys to Catalyst automatically
```

This means:
- **GitHub Copilot** can still create PRs with new features, bug fixes, and improvements exactly as it does today — nothing changes on the development side.
- You can raise an issue or describe a change (e.g. "add a dark mode", "improve the gap detection logic"), and Copilot will update the relevant files in `client/app/` via a PR.
- Once the PR is merged to `main`, the updated site is live on Catalyst within a minute — no manual deployment step needed.

**Summary:** GitHub is the source of truth. Catalyst is just the host. Enhancements always happen in GitHub, and Catalyst always reflects whatever is on `main`.

## Local development

Clone the repo and open `client/app/index.html` directly in your browser — no build step needed.

```bash
git clone https://github.com/vigneshwaran-kr-6055/Test-Cases.git
cd Test-Cases/client/app
open index.html          # macOS
# or: start index.html   (Windows)
# or: xdg-open index.html (Linux)
```

## API Integration Guide
* To integrate the API, follow these steps:
    1. **Authentication:**
        - Use the API Key provided in the `.env` file for authentication in all requests.
    2. **Endpoints:**
        - **GET /api/dashboard/data**: Retrieve dashboard data.
        - **POST /api/dashboard/update**: Update dashboard information.
        - **DELETE /api/dashboard/{id}**: Delete dashboard entry by ID.
    3. **Example Request:**  
        ```javascript
        fetch('/api/dashboard/data', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.API_KEY}`
            }
        })
        .then(response => response.json())
        .then(data => console.log(data));
        ```

## Security Best Practices
- **Keep Dependencies Updated:**
  Regularly check for updates and vulnerabilities in dependencies.
- **Environment Variables:**
  Never hard-code sensitive information like API keys, passwords, etc. Always use environment variables.
- **Authentication:**
  Use robust authentication mechanisms and ensure that API keys are kept secure.
- **Input Validation:**
  Always validate user inputs to prevent SQL injection and other attacks.
- **Regular Security Audits:**
  Schedule regular audits of your codebase for security vulnerabilities.

## Conclusion
Following these instructions will help you set up the SDLC Dashboard smoothly and integrate it with best security practices in mind.