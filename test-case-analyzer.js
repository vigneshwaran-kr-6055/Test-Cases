/**
 * test-case-analyzer.js
 * Parses an uploaded XLSX file of test cases and identifies
 * missing functional, privacy, and security test cases.
 *
 * Depends on read-excel-file (v7) loaded locally from read-excel-file.min.js.
 */

'use strict';

/* ─────────────────────────────────────────────
   Keyword banks for gap detection
───────────────────────────────────────────── */

// Functional patterns – each entry is {id, label, keywords, scenarios}
const FUNCTIONAL_CHECKS = [
    { id: 'happy-path',      label: 'Happy / positive path tests',       severity: 'critical',     keywords: ['success', 'valid', 'positive', 'happy', 'correct', 'should work', 'verify that', 'able to'],
      scenarios: [
        'Verify user can complete the primary workflow end-to-end with valid inputs.',
        'Verify the expected success message / confirmation is displayed on completion.',
        'Verify data is correctly saved and retrievable after a successful operation.',
        'Verify the UI state updates correctly after a successful action.',
      ]},
    { id: 'negative-path',   label: 'Negative / invalid input tests',    severity: 'major',        keywords: ['invalid', 'negative', 'incorrect', 'wrong', 'bad input', 'fail', 'reject', 'error message', 'not allowed'],
      scenarios: [
        'Verify an appropriate error message is shown when invalid data is submitted.',
        'Verify the system rejects empty required fields and highlights them.',
        'Verify the user cannot proceed past a step with incorrect/missing inputs.',
        'Verify attempting a forbidden action returns a clear denial message.',
      ]},
    { id: 'boundary',        label: 'Boundary / edge value tests',       severity: 'major',        keywords: ['boundary', 'edge', 'limit', 'min', 'max', 'maximum', 'minimum', 'overflow', 'empty', 'zero', 'null'],
      scenarios: [
        'Verify the field accepts exactly the maximum allowed number of characters.',
        'Verify the field rejects input one character beyond the maximum limit.',
        'Verify the minimum valid value (e.g. 0 or 1) is accepted.',
        'Verify the system handles null / empty values gracefully without crashing.',
        'Verify numeric overflow or extremely large values are rejected with a clear message.',
      ]},
    { id: 'error-handling',  label: 'Error handling tests',              severity: 'major',        keywords: ['error', 'exception', 'timeout', 'network failure', '500', '404', 'unavailable', 'retry'],
      scenarios: [
        'Verify a user-friendly error page / message is shown on a server 500 response.',
        'Verify a 404 page is displayed for invalid or non-existent routes.',
        'Verify the application handles network timeouts gracefully and offers a retry option.',
        'Verify partial failures (one service down) do not break the entire page.',
      ]},
    { id: 'ui-validation',   label: 'UI / form validation tests',        severity: 'minor',        keywords: ['form', 'field', 'required', 'placeholder', 'dropdown', 'checkbox', 'radio', 'submit button', 'validation message'],
      scenarios: [
        'Verify required field indicators (asterisks / labels) are visible.',
        'Verify inline validation messages appear on blur for invalid fields.',
        'Verify dropdown / select defaults to the correct initial option.',
        'Verify the submit button is disabled until all required fields are valid.',
        'Verify checkbox and radio button states are toggled correctly.',
      ]},
    { id: 'pagination',      label: 'Pagination / list navigation tests',severity: 'minor',        keywords: ['page', 'pagination', 'next', 'previous', 'sort', 'filter', 'search results', 'load more'],
      scenarios: [
        'Verify the "Next" button navigates to the next page of results.',
        'Verify the "Previous" button is disabled on the first page.',
        'Verify sorting by a column reorders the list correctly.',
        'Verify the correct number of items per page is displayed.',
        'Verify search / filter results update the paginated list accurately.',
      ]},
    { id: 'crud',            label: 'CRUD operation tests (C/R/U/D)',    severity: 'critical',     keywords: ['create', 'read', 'update', 'delete', 'add', 'edit', 'remove', 'save', 'modify'],
      scenarios: [
        'Verify a new record can be created and appears in the list.',
        'Verify record details can be viewed/read without modification.',
        'Verify an existing record can be edited and changes are persisted.',
        'Verify a record can be deleted and no longer appears after deletion.',
        'Verify a confirmation prompt is shown before irreversible delete.',
      ]},
    { id: 'concurrency',     label: 'Concurrency / race condition tests', severity: 'major',        keywords: ['concurrent', 'simultaneous', 'parallel', 'race condition', 'lock', 'duplicate submission'],
      scenarios: [
        'Verify duplicate form submissions are prevented (button disabled after first click).',
        'Verify concurrent edits to the same record by two users are handled gracefully.',
        'Verify no data corruption occurs when multiple users save simultaneously.',
        'Verify optimistic-locking or conflict resolution messages are shown when needed.',
      ]},
    { id: 'performance',     label: 'Performance / load tests',          severity: 'minor',        keywords: ['performance', 'load', 'stress', 'latency', 'response time', 'throughput', 'scalability'],
      scenarios: [
        'Verify the main page loads within the acceptable time threshold (e.g. < 3 s).',
        'Verify the application remains responsive under expected concurrent user load.',
        'Verify API response times stay within SLA under normal traffic.',
        'Verify performance does not degrade significantly as data volume grows.',
      ]},
    { id: 'accessibility',   label: 'Accessibility tests',               severity: 'minor',        keywords: ['accessibility', 'screen reader', 'keyboard navigation', 'aria', 'wcag', 'a11y', 'tab order'],
      scenarios: [
        'Verify all interactive elements are reachable and operable via keyboard alone.',
        'Verify ARIA labels / roles are present on all form controls and icons.',
        'Verify colour contrast ratios meet WCAG AA standards (4.5:1 for normal text).',
        'Verify focus order follows a logical reading sequence.',
        'Verify screen-reader announcements are made for dynamic content updates.',
      ]},
];

// Privacy patterns
const PRIVACY_CHECKS = [
    { id: 'pii-display',     label: 'PII masking / display tests (emails, phone, SSN, DOB)',  severity: 'critical',     keywords: ['pii', 'personal', 'mask', 'redact', 'email', 'phone', 'ssn', 'date of birth', 'dob', 'address', 'name visible', 'sensitive data'],
      scenarios: [
        'Verify email addresses are partially masked (e.g. j***@example.com) in the UI.',
        'Verify phone numbers display only the last 4 digits.',
        'Verify SSN / national ID is masked and never shown in full.',
        'Verify PII fields are not included in client-side logs or error messages.',
        'Verify sensitive data is not exposed in URL query parameters.',
      ]},
    { id: 'consent',         label: 'User consent & opt-in/opt-out tests',                    severity: 'critical',     keywords: ['consent', 'opt-in', 'opt-out', 'gdpr', 'ccpa', 'privacy policy', 'cookie', 'agree', 'permission'],
      scenarios: [
        'Verify a consent / cookie banner is shown to new users on first visit.',
        'Verify users can opt-out of non-essential cookies and the preference is saved.',
        'Verify marketing emails are only sent to users who have opted in.',
        'Verify the privacy policy link is accessible from the consent form.',
        'Verify withdrawing consent stops further data processing immediately.',
      ]},
    { id: 'data-retention',  label: 'Data retention & deletion tests',                        severity: 'major',        keywords: ['retention', 'delete account', 'right to erasure', 'data deletion', 'purge', 'anonymize', 'right to be forgotten'],
      scenarios: [
        'Verify user data is purged / anonymized after the defined retention period.',
        'Verify a user can request full account deletion and all their data is removed.',
        'Verify deletion is confirmed to the user after the data erasure request is fulfilled.',
        'Verify backup copies are also cleared within the defined timeframe.',
      ]},
    { id: 'data-access',     label: 'Data access control tests (who can see what)',           severity: 'critical',     keywords: ['access control', 'who can see', 'visibility', 'profile privacy', 'data sharing', 'expose', 'leak', 'third party'],
      scenarios: [
        'Verify a user can only view their own personal data, not other users\'.',
        'Verify the admin role can view all records but regular users cannot.',
        'Verify sensitive fields are hidden from lower-privilege roles.',
        'Verify API endpoints do not return data belonging to a different user.',
        'Verify third-party data sharing is clearly disclosed and controllable by the user.',
      ]},
    { id: 'audit-log',       label: 'Audit / activity log tests',                             severity: 'major',        keywords: ['audit', 'activity log', 'history', 'track', 'log access', 'audit trail'],
      scenarios: [
        'Verify successful and failed login attempts are recorded in the audit log.',
        'Verify access to sensitive data generates an audit-log entry with timestamp and user.',
        'Verify audit log entries cannot be modified or deleted by regular users.',
        'Verify admins can filter / search the audit log by user, date, and action.',
      ]},
    { id: 'data-export',     label: 'Data export / portability tests',                        severity: 'minor',        keywords: ['export', 'download data', 'data portability', 'backup', 'portable'],
      scenarios: [
        'Verify users can download their personal data in a standard format (CSV / JSON).',
        'Verify the exported file contains all relevant user data fields.',
        'Verify the export function is restricted to the authenticated account owner.',
        'Verify a confirmation / notification is sent when a data export is ready.',
      ]},
];

// Security patterns
const SECURITY_CHECKS = [
    { id: 'authn',           label: 'Authentication tests (login, logout, MFA)',              severity: 'showstopper',  keywords: ['login', 'logout', 'sign in', 'sign out', 'authentication', 'mfa', '2fa', 'otp', 'sso', 'token', 'session'],
      scenarios: [
        'Verify a user cannot access protected pages without being logged in.',
        'Verify the session is fully invalidated on logout.',
        'Verify MFA / OTP is required for sensitive operations or privileged accounts.',
        'Verify login fails with incorrect credentials and shows a generic error.',
        'Verify SSO / third-party login flow completes correctly and creates a session.',
      ]},
    { id: 'authz',           label: 'Authorization / role-based access tests',                severity: 'showstopper',  keywords: ['authorization', 'role', 'permission', 'access denied', 'forbidden', 'privilege', 'rbac', 'admin only', 'unauthorized'],
      scenarios: [
        'Verify non-admin users cannot access admin-only pages (expect 403 / redirect).',
        'Verify RBAC permissions are enforced on all API endpoints.',
        'Verify a user cannot modify another user\'s resources via direct URL manipulation.',
        'Verify privilege escalation attempts are rejected.',
        'Verify "Access Denied" messages do not leak sensitive system information.',
      ]},
    { id: 'injection',       label: 'Injection attack tests (SQL, command, LDAP)',            severity: 'critical',     keywords: ['sql injection', 'injection', 'command injection', 'ldap', 'nosql injection', 'xpath', 'special characters'],
      scenarios: [
        'Verify SQL injection payloads (e.g. \' OR 1=1 --) in input fields are sanitized.',
        'Verify command injection characters (;, |, &&) are rejected or escaped.',
        'Verify NoSQL injection attempts do not return unintended data.',
        'Verify parameterized queries / prepared statements are used for DB interactions.',
      ]},
    { id: 'xss',             label: 'Cross-site scripting (XSS) tests',                       severity: 'critical',     keywords: ['xss', 'cross-site scripting', 'script injection', '<script', 'alert(', 'javascript:'],
      scenarios: [
        'Verify user-supplied content containing <script> tags is escaped before rendering.',
        'Verify javascript: URIs in href/src attributes are blocked.',
        'Verify stored XSS payloads in user profiles / comments are not executed.',
        'Verify DOM-based XSS via URL parameters is prevented.',
      ]},
    { id: 'csrf',            label: 'CSRF protection tests',                                  severity: 'critical',     keywords: ['csrf', 'cross-site request forgery', 'anti-csrf', 'csrf token', 'samesite'],
      scenarios: [
        'Verify all state-changing requests (POST/PUT/DELETE) include a valid CSRF token.',
        'Verify requests without a valid CSRF token are rejected with 403.',
        'Verify SameSite cookie attribute is set to Strict or Lax.',
        'Verify CSRF tokens are unique per session and not reused.',
      ]},
    { id: 'session-mgmt',    label: 'Session management tests (expiry, fixation)',            severity: 'critical',     keywords: ['session expir', 'session timeout', 'session fixation', 'cookie secure', 'httponly', 'session hijack'],
      scenarios: [
        'Verify the session automatically expires after the configured idle timeout.',
        'Verify a new session token is issued on login (prevents session fixation).',
        'Verify session cookies have HttpOnly and Secure flags set.',
        'Verify the old session token is invalid after logout.',
      ]},
    { id: 'input-validation',label: 'Input validation & sanitization tests',                  severity: 'major',        keywords: ['sanitiz', 'whitelist', 'blacklist', 'input length', 'special char', 'html escap', 'encode', 'valid input'],
      scenarios: [
        'Verify all input fields enforce maximum length limits on both client and server.',
        'Verify special characters are HTML-encoded before being reflected in responses.',
        'Verify path traversal patterns (../) in filename inputs are rejected.',
        'Verify server-side validation rejects payloads that pass client-side checks.',
      ]},
    { id: 'encryption',      label: 'Encryption / data-at-rest and in-transit tests',         severity: 'critical',     keywords: ['encrypt', 'decrypt', 'https', 'tls', 'ssl', 'at rest', 'in transit', 'hash', 'password storage'],
      scenarios: [
        'Verify all pages and API calls are served over HTTPS (no mixed content).',
        'Verify passwords are stored as salted hashes (never plaintext).',
        'Verify sensitive data fields in the database are encrypted at rest.',
        'Verify TLS certificate is valid and not expired.',
      ]},
    { id: 'rate-limiting',   label: 'Rate limiting / brute-force protection tests',           severity: 'major',        keywords: ['rate limit', 'brute force', 'lockout', 'throttle', 'too many attempts', 'captcha'],
      scenarios: [
        'Verify the account is locked / throttled after N consecutive failed login attempts.',
        'Verify API endpoints return HTTP 429 when the rate limit is exceeded.',
        'Verify CAPTCHA is triggered after repeated failed authentication attempts.',
        'Verify IP-based rate limiting is applied to sensitive endpoints.',
      ]},
    { id: 'file-upload-sec', label: 'File upload security tests',                             severity: 'major',        keywords: ['file upload', 'malicious file', 'file type', 'antivirus', 'file size limit', 'mime type'],
      scenarios: [
        'Verify only explicitly allowed file types (whitelist) can be uploaded.',
        'Verify files exceeding the size limit are rejected with a clear error.',
        'Verify uploaded files are stored outside the web root (not directly accessible).',
        'Verify file names are sanitized to prevent path traversal or script execution.',
        'Verify MIME type is validated server-side, not just by file extension.',
      ]},
];

/* ─────────────────────────────────────────────
   Utility helpers
───────────────────────────────────────────── */

/**
 * Return a lowercase single string from all text columns in a row object.
 */
function rowText(row) {
    return Object.values(row).join(' ').toLowerCase();
}

/**
 * Check whether any keyword appears in the given text.
 */
function anyKeyword(text, keywords) {
    return keywords.some(kw => text.includes(kw.toLowerCase()));
}

/**
 * Detect the likely column that holds test-case names / titles.
 */
function detectTitleColumn(headers) {
    const candidates = ['test case', 'test name', 'title', 'scenario', 'description', 'name', 'test', 'case'];
    for (const c of candidates) {
        const match = headers.find(h => h.toLowerCase().includes(c));
        if (match) return match;
    }
    return headers[0];
}

/**
 * Attempt to derive a "feature / module" label from a row using common column names.
 */
function detectFeatureColumn(headers) {
    const candidates = ['feature', 'module', 'component', 'section', 'area', 'category', 'epic', 'sprint'];
    for (const c of candidates) {
        const match = headers.find(h => h.toLowerCase().includes(c));
        if (match) return match;
    }
    return null;
}

/**
 * Run one bank of checks (FUNCTIONAL / PRIVACY / SECURITY) against all rows.
 * Returns an array of {id, label, covered: bool} results.
 */
function runChecks(checks, allRowTexts) {
    return checks.map(check => {
        const covered = allRowTexts.some(t => anyKeyword(t, check.keywords));
        return { id: check.id, label: check.label, covered, severity: check.severity || 'minor', scenarios: check.scenarios || [] };
    });
}

/**
 * Infer unique features from rows using the detected feature column.
 * Falls back to extracting keywords if no explicit column exists.
 */
function extractFeatures(rows, featureCol) {
    const features = new Set();
    if (featureCol) {
        rows.forEach(r => {
            const v = (r[featureCol] || '').toString().trim();
            if (v) features.add(v);
        });
    } else {
        // Heuristic: pull capitalised proper-noun-ish tokens from test names
        const titleKws = ['login', 'signup', 'dashboard', 'profile', 'settings', 'search',
                          'upload', 'download', 'payment', 'checkout', 'cart', 'notification',
                          'report', 'admin', 'user', 'role', 'permission', 'api', 'integration'];
        rows.forEach(r => {
            const text = rowText(r);
            titleKws.forEach(kw => { if (text.includes(kw)) features.add(kw.charAt(0).toUpperCase() + kw.slice(1)); });
        });
    }
    return [...features].filter(Boolean);
}

/* ─────────────────────────────────────────────
   Main analysis entry-point
───────────────────────────────────────────── */

/**
 * Analyse an array of row objects (parsed from XLSX).
 * Returns a structured result object for the UI to render.
 */
function analyzeTestCases(rows) {
    if (!rows || rows.length === 0) {
        return { error: 'No data rows found in the spreadsheet.' };
    }

    const headers    = Object.keys(rows[0]);
    const titleCol   = detectTitleColumn(headers);
    const featureCol = detectFeatureColumn(headers);
    const allTexts   = rows.map(rowText);

    const functionalResults = runChecks(FUNCTIONAL_CHECKS, allTexts);
    const privacyResults    = runChecks(PRIVACY_CHECKS,    allTexts);
    const securityResults   = runChecks(SECURITY_CHECKS,   allTexts);

    const features = extractFeatures(rows, featureCol);

    return {
        totalRows:   rows.length,
        headers,
        titleCol,
        featureCol,
        features,
        functional:  functionalResults,
        privacy:     privacyResults,
        security:    securityResults,
        rows,
    };
}

/* ─────────────────────────────────────────────
   DOM / UI logic
───────────────────────────────────────────── */

(function () {
    const dropZone   = document.getElementById('drop-zone');
    const fileInput  = document.getElementById('file-input');
    const btnAnalyze = document.getElementById('btn-analyze');
    const statusBar  = document.getElementById('status-bar');

    const secSummary    = document.getElementById('sec-summary');
    const secFeatures   = document.getElementById('sec-features');
    const secFunctional = document.getElementById('sec-functional');
    const secPrivacy    = document.getElementById('sec-privacy');
    const secSecurity   = document.getElementById('sec-security');
    const secTable      = document.getElementById('sec-table');

    let parsedRows = null;

    /* ── File selection helpers ── */
    function setStatus(msg, type) {
        statusBar.textContent = msg;
        statusBar.className   = type;
        statusBar.style.display = 'block';
    }

    function clearResults() {
        [secSummary, secFeatures, secFunctional, secPrivacy, secSecurity, secTable]
            .forEach(s => s.classList.remove('visible'));
    }

    /* ── Drag-and-drop ── */
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelected(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
    });

    function handleFileSelected(file) {
        const name = file.name.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
            setStatus('⚠ Please upload an .xlsx or .csv file.', 'error');
            btnAnalyze.disabled = true;
            return;
        }
        document.getElementById('drop-label').textContent  = '📄 ' + file.name;
        document.getElementById('drop-hint').textContent   = (file.size / 1024).toFixed(1) + ' KB';
        setStatus('File ready. Click "Analyse Test Cases" to start.', 'info');
        btnAnalyze.disabled = false;
        parsedRows = null; // reset previous parse
        clearResults();

        // Pre-parse immediately for quick analysis
        readFile(file);
    }

    /**
     * Convert an array-of-arrays (from read-excel-file) where the first row
     * is the header into an array of plain objects.
     */
    function rowsToObjects(rawRows) {
        if (!rawRows || rawRows.length < 2) return [];
        const headers = rawRows[0].map(h => (h !== null && h !== undefined ? String(h) : ''));
        return rawRows.slice(1).map(row =>
            Object.fromEntries(headers.map((h, i) => [h, row[i] !== null && row[i] !== undefined ? row[i] : '']))
        );
    }

    /**
     * Parse a CSV text string into an array of objects using the first row as headers.
     * Handles quoted fields containing commas.
     */
    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) return [];
        function splitLine(line) {
            const fields = [];
            let cur = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                    else inQuote = !inQuote;
                } else if (ch === ',' && !inQuote) {
                    fields.push(cur); cur = '';
                } else {
                    cur += ch;
                }
            }
            fields.push(cur);
            return fields;
        }
        const headers = splitLine(lines[0]);
        return lines.slice(1).map(line => {
            const vals = splitLine(line);
            return Object.fromEntries(headers.map((h, i) => [h, vals[i] !== null && vals[i] !== undefined ? vals[i] : '']));
        });
    }

    function readFile(file) {
        setStatus('Reading file…', 'info');
        const name = file.name.toLowerCase();

        if (name.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const rows = parseCSV(e.target.result);
                    if (!rows.length) {
                        setStatus('⚠ The CSV file appears to be empty or has only a header row.', 'error');
                        btnAnalyze.disabled = true;
                        return;
                    }
                    parsedRows = rows;
                    setStatus(`✔ Parsed ${rows.length} rows from CSV. Click Analyse.`, 'success');
                    btnAnalyze.disabled = false;
                } catch (err) {
                    setStatus('⚠ Could not parse CSV: ' + err.message, 'error');
                    btnAnalyze.disabled = true;
                }
            };
            reader.readAsText(file);
        } else {
            // .xlsx via read-excel-file
            readXlsxFile(file).then(rawRows => {
                const rows = rowsToObjects(rawRows);
                if (!rows.length) {
                    setStatus('⚠ The first sheet appears to be empty or has only a header row.', 'error');
                    btnAnalyze.disabled = true;
                    return;
                }
                parsedRows = rows;
                setStatus(`✔ Parsed ${rows.length} rows. Click Analyse.`, 'success');
                btnAnalyze.disabled = false;
            }).catch(err => {
                setStatus('⚠ Could not parse file: ' + err.message, 'error');
                btnAnalyze.disabled = true;
            });
        }
    }

    /* ── Analyse button ── */
    btnAnalyze.addEventListener('click', () => {
        if (!parsedRows) { setStatus('Please select a file first.', 'error'); return; }
        const result = analyzeTestCases(parsedRows);
        if (result.error) { setStatus('⚠ ' + result.error, 'error'); return; }
        renderResults(result);
        setStatus(`✔ Analysis complete — ${result.totalRows} test cases analysed.`, 'success');
    });

    /* ── Render helpers ── */
    function renderResults(r) {
        renderSummary(r);
        renderFeatures(r);
        renderGapSection(secFunctional, 'Functional Test Gaps', r.functional, r.features);
        renderGapSection(secPrivacy,    'Privacy Test Gaps',    r.privacy,    r.features);
        renderGapSection(secSecurity,   'Security Test Gaps',   r.security,   r.features);
        renderTable(r);
    }

    function renderSummary(r) {
        const missing = fn => fn.filter(x => !x.covered).length;
        const mFn  = missing(r.functional);
        const mPr  = missing(r.privacy);
        const mSec = missing(r.security);

        document.getElementById('stat-total').textContent    = r.totalRows;
        document.getElementById('stat-features').textContent = r.features.length || '—';
        document.getElementById('stat-fn-miss').textContent  = mFn;
        document.getElementById('stat-pr-miss').textContent  = mPr;
        document.getElementById('stat-sec-miss').textContent = mSec;

        secSummary.classList.add('visible');
    }

    function renderFeatures(r) {
        const container = document.getElementById('feature-tags-container');
        container.innerHTML = '';
        if (!r.features.length) {
            container.innerHTML = '<span style="color:#999;font-size:.9rem">No distinct feature/module column detected. Add a "Feature" or "Module" column for better insights.</span>';
        } else {
            r.features.forEach(f => {
                const span = document.createElement('span');
                span.className   = 'feature-tag';
                span.textContent = f;
                container.appendChild(span);
            });
        }
        secFeatures.classList.add('visible');
    }

    function renderGapSection(sectionEl, title, checks, features) {
        const h2 = sectionEl.querySelector('h2');
        h2.textContent = title;

        const body = sectionEl.querySelector('.gap-body');
        body.innerHTML = '';

        // Feature summary
        if (features && features.length) {
            const featSummary = document.createElement('div');
            featSummary.className = 'gap-feature-summary';
            const label = document.createElement('span');
            label.className = 'gap-feature-summary-label';
            label.textContent = 'Features / Modules in scope:';
            featSummary.appendChild(label);
            const tags = document.createElement('div');
            tags.className = 'feature-tags';
            features.forEach(f => {
                const span = document.createElement('span');
                span.className = 'feature-tag';
                span.textContent = f;
                tags.appendChild(span);
            });
            featSummary.appendChild(tags);
            body.appendChild(featSummary);
        }

        const missing = checks.filter(c => !c.covered);
        const covered = checks.filter(c =>  c.covered);

        if (!missing.length) {
            body.insertAdjacentHTML('beforeend', '<div class="no-gaps-banner">✅ No obvious gaps detected in this category.</div>');
            sectionEl.classList.add('visible');
            return;
        }

        // Missing
        const missCat = document.createElement('div');
        missCat.className = 'gap-category';
        missCat.innerHTML = `<h3>Potentially missing test cases <span class="badge missing">${missing.length} gaps</span></h3>`;
        const missUl = document.createElement('ul');
        missUl.className = 'gap-list';
        missing.forEach(c => {
            const li = document.createElement('li');
            li.className = 'gap-item expandable';
            li.setAttribute('role', 'button');
            li.setAttribute('aria-expanded', 'false');
            li.setAttribute('tabindex', '0');
            li.innerHTML = `<span class="icon-mark">❌</span><span class="gap-label">${escapeHtml(c.label)}</span><span class="severity-badge severity-${escapeHtml(c.severity)}">${escapeHtml(c.severity)}</span><span class="expand-arrow" aria-hidden="true">▶</span>`;

            if (c.scenarios && c.scenarios.length) {
                const panel = document.createElement('div');
                panel.className = 'scenarios-panel';
                panel.setAttribute('aria-hidden', 'true');
                const ul = document.createElement('ul');
                c.scenarios.forEach(s => {
                    const item = document.createElement('li');
                    item.textContent = s;
                    ul.appendChild(item);
                });
                panel.appendChild(ul);
                li.appendChild(panel);

                function toggleScenarios(e) {
                    const expanded = li.getAttribute('aria-expanded') === 'true';
                    li.setAttribute('aria-expanded', String(!expanded));
                    panel.setAttribute('aria-hidden', String(expanded));
                    li.classList.toggle('open', !expanded);
                }
                li.addEventListener('click', toggleScenarios);
                li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleScenarios(e); } });
            }

            missUl.appendChild(li);
        });
        missCat.appendChild(missUl);
        body.appendChild(missCat);

        // Covered
        if (covered.length) {
            const covCat = document.createElement('div');
            covCat.className = 'gap-category';
            covCat.innerHTML = `<h3>Covered areas <span class="badge covered">${covered.length} found</span></h3>`;
            const covUl = document.createElement('ul');
            covUl.className = 'gap-list';
            covered.forEach(c => {
                const li = document.createElement('li');
                li.className = 'ok-item';
                li.innerHTML = `<span class="icon-mark">✅</span><span>${escapeHtml(c.label)}</span>`;
                covUl.appendChild(li);
            });
            covCat.appendChild(covUl);
            body.appendChild(covCat);
        }

        sectionEl.classList.add('visible');
    }

    function renderTable(r) {
        const thead = document.getElementById('table-head');
        const tbody = document.getElementById('table-body');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        const tr = document.createElement('tr');
        r.headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        thead.appendChild(tr);

        const maxRows = Math.min(r.rows.length, 200); // cap to 200 for performance
        for (let i = 0; i < maxRows; i++) {
            const row   = r.rows[i];
            const trRow = document.createElement('tr');
            r.headers.forEach(h => {
                const td = document.createElement('td');
                td.textContent = row[h] !== null && row[h] !== undefined ? row[h] : '';
                trRow.appendChild(td);
            });
            tbody.appendChild(trRow);
        }

        if (r.rows.length > maxRows) {
            const note = document.createElement('tr');
            const td   = document.createElement('td');
            td.colSpan  = r.headers.length;
            td.style.textAlign  = 'center';
            td.style.color      = '#888';
            td.style.padding    = '10px';
            td.textContent = `… ${r.rows.length - maxRows} more rows not shown`;
            note.appendChild(td);
            tbody.appendChild(note);
        }

        secTable.classList.add('visible');
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
