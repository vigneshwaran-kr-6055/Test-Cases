# SDLC Dashboard — Test Case Analyser

Live site: **https://test-case-assist-tjrwuase.onslate.eu/**

> The site is hosted on **Zoho Catalyst Slate** using your existing GitHub integration — no CLI and no tokens required.

## Project structure

```
├── backend-proxy.js               # Express server — serves the static site + /api/zoho proxy
├── package.json                   # Node.js app config; "npm start" launches backend-proxy.js
├── client/
│   └── app/                       # Static web-client (served by the Express server)
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
│       └── client-package.json
└── .github/
    └── workflows/
        └── catalyst-deploy.yml    # (kept for reference — Slate deploys directly from GitHub)
```

## How deployment works

You already have the `test-case-assist` Slate app configured in **Project-Rainfall** and your GitHub account `vigneshwaran-kr-6055` is already connected.

The deployment was failing because `package.json` was missing a `start` script and the required `express`/`axios` dependencies. This PR fixes that. Once this branch is merged to `main`:

1. Go to **[catalyst.zoho.com](https://catalyst.zoho.com)** → **Project-Rainfall** → **Slate** in the left sidebar.
2. Click **Create Deployment** (or wait — Slate may auto-detect the push and deploy).
3. Slate runs `npm install && npm start`, serving the site at:  
   **https://test-case-assist-tjrwuase.onslate.eu/**
4. Click **Deploy to Production** in the top-right bar to promote it.

> **From now on**, every push to `main` triggers a new Slate deployment automatically — no manual steps needed.

## Making enhancements after deployment

All site source files live in this GitHub repository under `client/app/`. The full enhancement loop is:

```
Edit files in client/app/  →  open / merge a PR  →  push to main  →  Slate auto-redeploys
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