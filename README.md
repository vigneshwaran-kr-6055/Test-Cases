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

> **You already have GitHub connected to Catalyst — so this is only 4 steps and requires no installs, no CLI, and no tokens.**

---

### Step 1 — Open your Catalyst project and go to Web Client

1. Sign in at **[catalyst.zoho.com](https://catalyst.zoho.com)**.
2. Open your project (e.g. **Project-Rainfall**).
3. In the left sidebar, click **Web Client**.

---

### Step 2 — Create a new Web Client linked to this GitHub repo

1. Click **Create Web Client** (or the **+** button).
2. Give it any name (e.g. `app`).
3. Under **Source**, choose **Git Repository**.
4. Select your connected GitHub account (**vigneshwaran-kr-6055**).
5. Pick the repository **Test-Cases**.
6. Set **Branch** to `main`.
7. Set **Build / App Folder** to `client/app`.
8. Leave **Build Command** blank (this is a static site — no build step needed).
9. Click **Create**.

Catalyst will pull the code from GitHub and deploy it immediately. ✅

---

### Step 3 — Note your site URL

Once the deployment finishes, Catalyst shows you the URL. It will look like:

> `https://<your-project>.catalystserverless.com/app/`

Click it to confirm the site loads.

---

### Step 4 — Promote to Production (optional)

The first deploy goes to the **Development** environment.  
To make it publicly live on the Production URL:

1. In the Catalyst Console, click **Deployments** in the left sidebar.
2. Click **Promote to Production**.

Your site is now live at the Production URL. 🎉

---

### That's it! 🎉

From now on, **every time a change is merged to `main`** (whether you make it or Copilot makes it), Catalyst automatically pulls the latest code and redeploys — no manual steps ever needed again.

## Making enhancements after deployment

All site source files live in this GitHub repository under `client/app/`. The full enhancement loop is:

```
Edit files in client/app/  →  open / merge a PR  →  push to main  →  Catalyst auto-redeploys
```

- **GitHub Copilot** can create PRs with new features, bug fixes, and improvements exactly as it does today.
- You can raise an issue or describe a change (e.g. "add a dark mode"), and Copilot will update the relevant files in `client/app/` via a PR.
- Once the PR is merged to `main`, Catalyst detects the change and redeploys — no manual steps needed.

**GitHub is the source of truth. Catalyst is just the host.**

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