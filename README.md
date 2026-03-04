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

## How to publish to Zoho Catalyst

### Prerequisites

1. Sign up / log in at [catalyst.zoho.com](https://catalyst.zoho.com).
2. Install the Catalyst CLI:
   ```bash
   npm install -g zcatalyst-cli
   ```
3. Create a new Catalyst project named **`test-case-analyser`** in the Catalyst console.
4. Note down your **Project ID**, **Org ID**, and **Web Client ID** from the project settings.

### One-time setup

1. Open `catalyst.json` and replace the placeholder values with your actual IDs:

   | Placeholder | Where to find it |
   |---|---|
   | `YOUR_PROJECT_ID` | Catalyst Console → Project Settings |
   | `YOUR_ORG_ID` | Catalyst Console → Organization Settings |
   | `YOUR_CLIENT_ID` | Catalyst Console → Web Client → App settings |

2. Add a GitHub Actions secret named **`CATALYST_TOKEN`**:
   ```bash
   # Generate a token locally (run once, requires CLI login)
   catalyst token:generate
   ```
   Then go to **GitHub → Settings → Secrets → Actions** and add `CATALYST_TOKEN`.

### Automatic deployment (CI/CD)

Push to `main` — GitHub Actions runs `.github/workflows/catalyst-deploy.yml` and deploys to Catalyst automatically.

### Manual deployment

```bash
catalyst login          # authenticate once
catalyst deploy         # deploy to development environment
```

Promote to production from the **Catalyst Console → Deployments** tab.

## URL

| Environment | URL |
|---|---|
| Development | `https://test-case-analyser-development.catalystserverless.com/app/` |
| Production  | `https://test-case-analyser.production.catalystserverless.com/app/`  |

> **Tip:** To remove the `/app` suffix, add an API Gateway rule in the Catalyst Console:
> - Request URL: `/ {path1: (.*)}`
> - Target: Web Client Hosting → `/app/{path1}`

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