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

// Functional patterns – each entry is {id, label, keywords}
const FUNCTIONAL_CHECKS = [
    { id: 'happy-path',      label: 'Happy / positive path tests',       keywords: ['success', 'valid', 'positive', 'happy', 'correct', 'should work', 'verify that', 'able to'] },
    { id: 'negative-path',   label: 'Negative / invalid input tests',    keywords: ['invalid', 'negative', 'incorrect', 'wrong', 'bad input', 'fail', 'reject', 'error message', 'not allowed'] },
    { id: 'boundary',        label: 'Boundary / edge value tests',       keywords: ['boundary', 'edge', 'limit', 'min', 'max', 'maximum', 'minimum', 'overflow', 'empty', 'zero', 'null'] },
    { id: 'error-handling',  label: 'Error handling tests',              keywords: ['error', 'exception', 'timeout', 'network failure', '500', '404', 'unavailable', 'retry'] },
    { id: 'ui-validation',   label: 'UI / form validation tests',        keywords: ['form', 'field', 'required', 'placeholder', 'dropdown', 'checkbox', 'radio', 'submit button', 'validation message'] },
    { id: 'pagination',      label: 'Pagination / list navigation tests',keywords: ['page', 'pagination', 'next', 'previous', 'sort', 'filter', 'search results', 'load more'] },
    { id: 'crud',            label: 'CRUD operation tests (C/R/U/D)',    keywords: ['create', 'read', 'update', 'delete', 'add', 'edit', 'remove', 'save', 'modify'] },
    { id: 'concurrency',     label: 'Concurrency / race condition tests', keywords: ['concurrent', 'simultaneous', 'parallel', 'race condition', 'lock', 'duplicate submission'] },
    { id: 'performance',     label: 'Performance / load tests',          keywords: ['performance', 'load', 'stress', 'latency', 'response time', 'throughput', 'scalability'] },
    { id: 'accessibility',   label: 'Accessibility tests',               keywords: ['accessibility', 'screen reader', 'keyboard navigation', 'aria', 'wcag', 'a11y', 'tab order'] },
];

// Privacy patterns
const PRIVACY_CHECKS = [
    { id: 'pii-display',     label: 'PII masking / display tests (emails, phone, SSN, DOB)',  keywords: ['pii', 'personal', 'mask', 'redact', 'email', 'phone', 'ssn', 'date of birth', 'dob', 'address', 'name visible', 'sensitive data'] },
    { id: 'consent',         label: 'User consent & opt-in/opt-out tests',                    keywords: ['consent', 'opt-in', 'opt-out', 'gdpr', 'ccpa', 'privacy policy', 'cookie', 'agree', 'permission'] },
    { id: 'data-retention',  label: 'Data retention & deletion tests',                        keywords: ['retention', 'delete account', 'right to erasure', 'data deletion', 'purge', 'anonymize', 'right to be forgotten'] },
    { id: 'data-access',     label: 'Data access control tests (who can see what)',           keywords: ['access control', 'who can see', 'visibility', 'profile privacy', 'data sharing', 'expose', 'leak', 'third party'] },
    { id: 'audit-log',       label: 'Audit / activity log tests',                             keywords: ['audit', 'activity log', 'history', 'track', 'log access', 'audit trail'] },
    { id: 'data-export',     label: 'Data export / portability tests',                        keywords: ['export', 'download data', 'data portability', 'backup', 'portable'] },
];

// Security patterns
const SECURITY_CHECKS = [
    { id: 'authn',           label: 'Authentication tests (login, logout, MFA)',              keywords: ['login', 'logout', 'sign in', 'sign out', 'authentication', 'mfa', '2fa', 'otp', 'sso', 'token', 'session'] },
    { id: 'authz',           label: 'Authorization / role-based access tests',                keywords: ['authorization', 'role', 'permission', 'access denied', 'forbidden', 'privilege', 'rbac', 'admin only', 'unauthorized'] },
    { id: 'injection',       label: 'Injection attack tests (SQL, command, LDAP)',            keywords: ['sql injection', 'injection', 'command injection', 'ldap', 'nosql injection', 'xpath', 'special characters'] },
    { id: 'xss',             label: 'Cross-site scripting (XSS) tests',                       keywords: ['xss', 'cross-site scripting', 'script injection', '<script', 'alert(', 'javascript:'] },
    { id: 'csrf',            label: 'CSRF protection tests',                                  keywords: ['csrf', 'cross-site request forgery', 'anti-csrf', 'csrf token', 'samesite'] },
    { id: 'session-mgmt',    label: 'Session management tests (expiry, fixation)',            keywords: ['session expir', 'session timeout', 'session fixation', 'cookie secure', 'httponly', 'session hijack'] },
    { id: 'input-validation',label: 'Input validation & sanitization tests',                  keywords: ['sanitiz', 'whitelist', 'blacklist', 'input length', 'special char', 'html escap', 'encode', 'valid input'] },
    { id: 'encryption',      label: 'Encryption / data-at-rest and in-transit tests',         keywords: ['encrypt', 'decrypt', 'https', 'tls', 'ssl', 'at rest', 'in transit', 'hash', 'password storage'] },
    { id: 'rate-limiting',   label: 'Rate limiting / brute-force protection tests',           keywords: ['rate limit', 'brute force', 'lockout', 'throttle', 'too many attempts', 'captcha'] },
    { id: 'file-upload-sec', label: 'File upload security tests',                             keywords: ['file upload', 'malicious file', 'file type', 'antivirus', 'file size limit', 'mime type'] },
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
        return { id: check.id, label: check.label, covered };
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
        renderGapSection(secFunctional, 'Functional Test Gaps', r.functional);
        renderGapSection(secPrivacy,    'Privacy Test Gaps',    r.privacy);
        renderGapSection(secSecurity,   'Security Test Gaps',   r.security);
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

    function renderGapSection(sectionEl, title, checks) {
        const h2 = sectionEl.querySelector('h2');
        h2.textContent = title;

        const body = sectionEl.querySelector('.gap-body');
        body.innerHTML = '';

        const missing = checks.filter(c => !c.covered);
        const covered = checks.filter(c =>  c.covered);

        if (!missing.length) {
            body.innerHTML = '<div class="no-gaps-banner">✅ No obvious gaps detected in this category.</div>';
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
            li.className = 'gap-item';
            li.innerHTML = `<span class="icon-mark">❌</span><span>${escapeHtml(c.label)}</span>`;
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
