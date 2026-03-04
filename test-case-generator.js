/**
 * test-case-generator.js
 * Reads uploaded use-case documents (TXT, CSV, XLSX) and generates
 * structured test cases with severity and test-case-type tags.
 *
 * Depends on read-excel-file (v7) already loaded by the host page.
 */

'use strict';

/* ─────────────────────────────────────────────
   Severity & type detection rules
───────────────────────────────────────────── */

const SEVERITY_RULES = [
    {
        level: 'showstopper',
        keywords: [
            'login', 'logout', 'sign in', 'sign out', 'authentication', 'authorize',
            'payment', 'checkout', 'billing', 'transaction', 'purchase',
            'access denied', 'security', 'crash', 'critical', 'unable to access',
            'data loss', 'account', 'password', 'token', 'session',
        ],
    },
    {
        level: 'critical',
        keywords: [
            'create', 'submit', 'save', 'register', 'user', 'profile',
            'data', 'record', 'delete', 'remove', 'export', 'import',
            'upload', 'download', 'notification', 'email', 'permission',
            'role', 'admin',
        ],
    },
    {
        level: 'major',
        keywords: [
            'update', 'edit', 'search', 'filter', 'sort', 'list', 'view',
            'report', 'dashboard', 'integration', 'api', 'sync', 'refresh',
            'pagination', 'validate', 'verify',
        ],
    },
    // default is 'minor'
];

const TYPE_RULES = [
    {
        type: 'security',
        keywords: [
            'login', 'logout', 'password', 'authentication', 'authorization',
            'token', 'session', 'xss', 'injection', 'csrf', 'encryption',
            'https', 'access denied', 'privilege', 'security', 'hacker',
            'brute force', 'otp', 'mfa', '2fa', 'sso',
        ],
    },
    {
        type: 'privacy',
        keywords: [
            'personal data', 'pii', 'email', 'phone', 'address', 'dob',
            'date of birth', 'ssn', 'gdpr', 'ccpa', 'consent', 'opt-in',
            'opt-out', 'data retention', 'mask', 'redact', 'anonymize',
            'sensitive', 'privacy', 'personal information',
        ],
    },
    {
        type: 'ui',
        keywords: [
            'display', 'show', 'visible', 'button', 'form', 'field',
            'dropdown', 'checkbox', 'radio', 'placeholder', 'label', 'icon',
            'tooltip', 'modal', 'popup', 'dialog', 'layout', 'responsive',
            'color', 'font', 'style', 'ui', 'ux', 'interface', 'screen',
            'page', 'navigation', 'menu', 'header', 'footer', 'sidebar',
        ],
    },
    {
        type: 'non-functional',
        keywords: [
            'performance', 'load', 'stress', 'scalability', 'latency',
            'response time', 'throughput', 'concurrent', 'availability',
            'reliability', 'uptime', 'recovery', 'backup', 'disaster',
            'accessibility', 'a11y', 'wcag', 'aria', 'screen reader',
        ],
    },
    // default is 'functional'
];

/* ─────────────────────────────────────────────
   Cached lookups for condition functions
───────────────────────────────────────────── */
const UI_RULE_KEYWORDS       = TYPE_RULES.find(r => r.type === 'ui').keywords;
const PRIVACY_RULE_KEYWORDS  = TYPE_RULES.find(r => r.type === 'privacy').keywords;
const SECURITY_RULE_KEYWORDS = TYPE_RULES.find(r => r.type === 'security').keywords;
const NONFUNC_RULE_KEYWORDS  = TYPE_RULES.find(r => r.type === 'non-functional').keywords;
const BOUNDARY_RE = /\b(limit|max|min|maximum|minimum|length|count|number|characters?|size|range|value|amount|quantity)\b/i;

/* ─────────────────────────────────────────────
   Test case template generators
───────────────────────────────────────────── */

/**
 * Each template produces zero or more test case objects for a given
 * use-case text.  Templates with a `condition` only fire when the
 * condition returns true.
 *
 * @typedef {{ ucRef:string, title:string, description:string, severity:string, type:string }} TC
 */
const TEMPLATES = [
    // 1. Happy / positive path — always generated
    {
        id: 'happy-path',
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify successful ${feature} with valid inputs`,
                description: `Ensure the ${feature} completes successfully when all required inputs are valid and the user has the appropriate permissions.`,
                severity: detectSeverity(ucText),
                type: 'functional',
            }];
        },
    },

    // 2. Negative / invalid input path — always generated
    {
        id: 'negative-path',
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify error handling for invalid inputs in ${feature}`,
                description: `Ensure the system displays a clear error message and does not proceed when invalid, missing, or malformed inputs are provided for ${feature}.`,
                severity: 'major',
                type: 'functional',
            }];
        },
    },

    // 3. Boundary conditions — generated when numeric/limit keywords present
    {
        id: 'boundary',
        condition: text => BOUNDARY_RE.test(text),
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify boundary values for ${feature}`,
                description: `Test the ${feature} at the minimum, maximum, and just-beyond-maximum allowed values to ensure correct acceptance and rejection behaviour.`,
                severity: 'major',
                type: 'functional',
            }];
        },
    },

    // 4. UI / display — generated when UI keywords present
    {
        id: 'ui-check',
        condition: text => { const lower = text.toLowerCase(); return UI_RULE_KEYWORDS.some(kw => lower.includes(kw)); },
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify UI elements and layout for ${feature}`,
                description: `Ensure all UI elements (buttons, labels, fields, messages) for the ${feature} are correctly displayed, labelled, and accessible across supported screen sizes.`,
                severity: 'minor',
                type: 'ui',
            }];
        },
    },

    // 5. Privacy — generated when personal-data keywords present
    {
        id: 'privacy-check',
        condition: text => { const lower = text.toLowerCase(); return PRIVACY_RULE_KEYWORDS.some(kw => lower.includes(kw)); },
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify personal data protection in ${feature}`,
                description: `Ensure all personal/sensitive data handled by the ${feature} is properly masked, encrypted, and only accessible to authorized roles in compliance with privacy regulations.`,
                severity: 'critical',
                type: 'privacy',
            }];
        },
    },

    // 6. Security — generated when auth/security keywords present
    {
        id: 'security-check',
        condition: text => { const lower = text.toLowerCase(); return SECURITY_RULE_KEYWORDS.some(kw => lower.includes(kw)); },
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify access control and security for ${feature}`,
                description: `Ensure the ${feature} enforces proper authentication, authorization, and protection against common security threats (injection, XSS, CSRF, brute-force, etc.).`,
                severity: 'showstopper',
                type: 'security',
            }];
        },
    },

    // 7. Non-functional — generated when performance/reliability keywords present
    {
        id: 'non-functional-check',
        condition: text => { const lower = text.toLowerCase(); return NONFUNC_RULE_KEYWORDS.some(kw => lower.includes(kw)); },
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify performance and reliability of ${feature}`,
                description: `Ensure the ${feature} meets the defined non-functional requirements (response time, load capacity, availability) under normal and peak traffic conditions.`,
                severity: 'minor',
                type: 'non-functional',
            }];
        },
    },
];

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function detectSeverity(text) {
    const lower = text.toLowerCase();
    for (const rule of SEVERITY_RULES) {
        if (rule.keywords.some(kw => lower.includes(kw))) return rule.level;
    }
    return 'minor';
}

/**
 * Extract a short feature label from the use-case text.
 * Prefers "As a … I want to …" style; falls back to first 6 words.
 */
function extractFeature(text) {
    // "I want to [verb phrase]" pattern
    const m = text.match(/i want to\s+([^,.;!?\n]+)/i);
    if (m) return truncateWords(m[1].trim(), 60);

    // "should be able to [verb phrase]"
    const m2 = text.match(/should be able to\s+([^,.;!?\n]+)/i);
    if (m2) return truncateWords(m2[1].trim(), 60);

    // "Use Case: [title]"
    const m3 = text.match(/use case\s*\d*\s*[:\-–]\s*(.+)/i);
    if (m3) return truncateWords(m3[1].trim(), 60);

    // Fall back to first few meaningful words
    return truncateWords(text.replace(/[^\w\s]/g, ' '), 60);
}

/** Truncate text at a word boundary to at most maxLen characters. */
function truncateWords(text, maxLen) {
    if (text.length <= maxLen) return text;
    const words = text.split(/\s+/).filter(Boolean);
    let result = '';
    for (const word of words) {
        const candidate = result ? result + ' ' + word : word;
        if (candidate.length > maxLen) break;
        result = candidate;
    }
    return result || text.slice(0, maxLen);
}

/** HTML-escape a string to prevent XSS. */
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────
   Core generator
───────────────────────────────────────────── */

/**
 * Given an array of use-case descriptors [{ref, text}], produce an
 * array of test-case objects.
 *
 * @param {{ ref: string, text: string }[]} useCases
 * @returns {TC[]}
 */
function generateTestCases(useCases) {
    const allTCs = [];
    let tcIndex = 1;

    useCases.forEach(({ ref, text }) => {
        if (!text || !text.trim()) return;
        const feature = extractFeature(text);

        TEMPLATES.forEach(tpl => {
            if (tpl.condition && !tpl.condition(text)) return;
            const produced = tpl.generate(text, ref, feature);
            produced.forEach(tc => {
                allTCs.push({ id: `TC-${String(tcIndex++).padStart(3, '0')}`, ...tc });
            });
        });
    });

    return allTCs;
}

/* ─────────────────────────────────────────────
   File parsing helpers
───────────────────────────────────────────── */

/**
 * Parse a plain-text file into use cases.
 * Splits on blank lines or numbered entries.
 */
function parseTxt(text) {
    // Split on blank lines or lines starting with "Use Case"/"UC" numbering
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

    if (blocks.length === 0) return [];

    return blocks.map((block, i) => {
        // Extract a ref if the block starts with "Use Case N" or "UC-N"
        const refMatch = block.match(/^(use\s+case\s*\d+|uc[-\s]?\d+)[:\-–\s]*/i);
        const ref = refMatch
            ? refMatch[0].trim().replace(/[:\-–\s]+$/, '')
            : `UC-${String(i + 1).padStart(3, '0')}`;
        const txt = refMatch ? block.slice(refMatch[0].length).trim() : block;
        return { ref, text: txt };
    });
}

/**
 * Parse a CSV text string into use-case objects.
 * Attempts to detect a "use case" / "description" / "title" column.
 */
function parseCsvToUseCases(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    function splitLine(line) {
        const fields = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                fields.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        fields.push(cur);
        return fields.map(f => f.trim());
    }

    const headers = splitLine(lines[0]).map(h => h.toLowerCase());
    const rows    = lines.slice(1).map(l => splitLine(l));

    // Detect the ref column
    const refCol = headers.findIndex(h =>
        /use\s*case\s*(id|no|number|#)/i.test(h) || /^(id|uc[-_]?\d*|ref)$/i.test(h)
    );

    // Detect the description/text column (exclude the already-identified refCol)
    const txtCol = headers.findIndex((h, idx) => {
        if (idx === refCol) return false;
        return /description|user\s*story|scenario|requirement/i.test(h) ||
               /^(title|name)$/i.test(h) ||
               /use\s*case$/i.test(h);
    });

    if (txtCol === -1) {
        // No recognizable column — treat each row joined (excluding ref) as one use case
        return rows.map((row, i) => ({
            ref: refCol !== -1 && row[refCol] ? row[refCol] : `UC-${String(i + 1).padStart(3, '0')}`,
            text: row.filter((_, j) => j !== refCol).join(' '),
        }));
    }

    return rows
        .filter(row => row[txtCol])
        .map((row, i) => ({
            ref: refCol !== -1 && row[refCol] ? row[refCol] : `UC-${String(i + 1).padStart(3, '0')}`,
            text: row[txtCol],
        }));
}

/**
 * Convert an XLSX array-of-arrays (from read-excel-file) into use-case objects.
 */
function parseXlsxToUseCases(rawRows) {
    if (!rawRows || rawRows.length < 2) return [];
    const headers = rawRows[0].map(h => String(h ?? '').toLowerCase());
    const dataRows = rawRows.slice(1);

    const refCol = headers.findIndex(h =>
        /use\s*case\s*(id|no|number|#)/i.test(h) || /^(id|uc[-_]?\d*|ref)$/i.test(h)
    );
    const txtCol = headers.findIndex((h, idx) => {
        if (idx === refCol) return false;
        return /description|user\s*story|scenario|requirement/i.test(h) ||
               /^(title|name)$/i.test(h) ||
               /use\s*case$/i.test(h);
    });

    if (txtCol === -1) {
        return dataRows.map((row, i) => ({
            ref: refCol !== -1 && row[refCol] ? String(row[refCol]) : `UC-${String(i + 1).padStart(3, '0')}`,
            text: row.filter((_, j) => j !== refCol).filter(Boolean).join(' '),
        }));
    }

    return dataRows
        .filter(row => row[txtCol])
        .map((row, i) => ({
            ref: refCol !== -1 && row[refCol] ? String(row[refCol]) : `UC-${String(i + 1).padStart(3, '0')}`,
            text: String(row[txtCol] ?? ''),
        }));
}

/* ─────────────────────────────────────────────
   UI / DOM logic  (runs only when this script's
   host elements exist on the page)
───────────────────────────────────────────── */

(function () {
    const dropZone    = document.getElementById('gen-drop-zone');
    const fileInput   = document.getElementById('gen-file-input');
    const btnGenerate = document.getElementById('btn-generate');
    const statusEl    = document.getElementById('gen-status');

    const secSummary  = document.getElementById('gen-sec-summary');
    const secTable    = document.getElementById('gen-sec-table');

    if (!dropZone) return; // guard: generator elements not present

    let parsedUseCases = null;
    let generatedTCs   = null;

    /* ── Helpers ── */
    function setStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.className   = type;
        statusEl.style.display = 'block';
    }

    function clearResults() {
        [secSummary, secTable].forEach(s => s && s.classList.remove('visible'));
        generatedTCs = null;
    }

    /* ── Drag-and-drop ── */
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
        const name = file.name.toLowerCase();
        const allowed = ['.txt', '.csv', '.xlsx'];
        if (!allowed.some(ext => name.endsWith(ext))) {
            setStatus('⚠ Please upload a .txt, .csv, or .xlsx file.', 'error');
            btnGenerate.disabled = true;
            return;
        }
        document.getElementById('gen-drop-label').textContent = '📄 ' + file.name;
        document.getElementById('gen-drop-hint').textContent  = (file.size / 1024).toFixed(1) + ' KB';
        setStatus('File ready. Click "Generate Test Cases" to start.', 'info');
        btnGenerate.disabled = false;
        parsedUseCases = null;
        clearResults();
        readFile(file);
    }

    function readFile(file) {
        const name = file.name.toLowerCase();

        if (name.endsWith('.txt')) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    parsedUseCases = parseTxt(e.target.result);
                    if (!parsedUseCases.length) {
                        setStatus('⚠ No use cases found in the file. Ensure the file has content.', 'error');
                        btnGenerate.disabled = true;
                        return;
                    }
                    setStatus(`✔ Found ${parsedUseCases.length} use case block(s). Click Generate.`, 'success');
                    btnGenerate.disabled = false;
                } catch (err) {
                    setStatus('⚠ Could not read file: ' + err.message, 'error');
                    btnGenerate.disabled = true;
                }
            };
            reader.readAsText(file);

        } else if (name.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    parsedUseCases = parseCsvToUseCases(e.target.result);
                    if (!parsedUseCases.length) {
                        setStatus('⚠ No use cases found in the CSV.', 'error');
                        btnGenerate.disabled = true;
                        return;
                    }
                    setStatus(`✔ Found ${parsedUseCases.length} use case(s) in CSV. Click Generate.`, 'success');
                    btnGenerate.disabled = false;
                } catch (err) {
                    setStatus('⚠ Could not parse CSV: ' + err.message, 'error');
                    btnGenerate.disabled = true;
                }
            };
            reader.readAsText(file);

        } else {
            // .xlsx
            if (typeof readXlsxFile === 'undefined') {
                setStatus('⚠ XLSX library not loaded. Please refresh the page.', 'error');
                btnGenerate.disabled = true;
                return;
            }
            readXlsxFile(file).then(rawRows => {
                parsedUseCases = parseXlsxToUseCases(rawRows);
                if (!parsedUseCases.length) {
                    setStatus('⚠ No use cases found in the spreadsheet.', 'error');
                    btnGenerate.disabled = true;
                    return;
                }
                setStatus(`✔ Found ${parsedUseCases.length} use case(s) in spreadsheet. Click Generate.`, 'success');
                btnGenerate.disabled = false;
            }).catch(err => {
                setStatus('⚠ Could not parse XLSX: ' + err.message, 'error');
                btnGenerate.disabled = true;
            });
        }
    }

    /* ── Generate button ── */
    btnGenerate.addEventListener('click', () => {
        if (!parsedUseCases || !parsedUseCases.length) {
            setStatus('Please select a file first.', 'error');
            return;
        }
        generatedTCs = generateTestCases(parsedUseCases);
        if (!generatedTCs.length) {
            setStatus('⚠ No test cases could be generated. Please check the file content.', 'error');
            return;
        }
        renderResults(generatedTCs);
        setStatus(`✔ Generated ${generatedTCs.length} test case(s) from ${parsedUseCases.length} use case(s).`, 'success');
    });

    /* ── Render results ── */
    function renderResults(tcs) {
        renderSummary(tcs);
        renderTable(tcs);
    }

    function renderSummary(tcs) {
        const countBySev  = { showstopper: 0, critical: 0, major: 0, minor: 0 };
        const countByType = { functional: 0, 'non-functional': 0, ui: 0, privacy: 0, security: 0 };
        tcs.forEach(tc => {
            if (tc.severity in countBySev)  countBySev[tc.severity]++;
            if (tc.type     in countByType) countByType[tc.type]++;
        });

        document.getElementById('gen-stat-total').textContent        = tcs.length;
        document.getElementById('gen-stat-showstopper').textContent  = countBySev.showstopper;
        document.getElementById('gen-stat-critical').textContent     = countBySev.critical;
        document.getElementById('gen-stat-major').textContent        = countBySev.major;
        document.getElementById('gen-stat-minor').textContent        = countBySev.minor;

        document.getElementById('gen-stat-functional').textContent      = countByType.functional;
        document.getElementById('gen-stat-nonfunctional').textContent   = countByType['non-functional'];
        document.getElementById('gen-stat-ui').textContent             = countByType.ui;
        document.getElementById('gen-stat-privacy').textContent        = countByType.privacy;
        document.getElementById('gen-stat-security').textContent       = countByType.security;

        secSummary.classList.add('visible');
    }

    function renderTable(tcs) {
        const tbody = document.getElementById('gen-table-body');
        tbody.innerHTML = '';
        tcs.forEach(tc => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(tc.id)}</td>
                <td>${esc(tc.ucRef)}</td>
                <td>${esc(tc.title)}</td>
                <td>${esc(tc.description)}</td>
                <td><span class="badge-severity sev-${esc(tc.severity)}">${esc(tc.severity)}</span></td>
                <td><span class="badge-type type-${esc(tc.type)}">${esc(tc.type)}</span></td>
            `;
            tbody.appendChild(tr);
        });
        secTable.classList.add('visible');
    }

    /* ── Export to CSV ── */
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (!generatedTCs || !generatedTCs.length) return;
            const header = ['TC ID', 'Use Case Ref', 'Title', 'Description', 'Severity', 'Type'];
            const rows   = generatedTCs.map(tc => [tc.id, tc.ucRef, tc.title, tc.description, tc.severity, tc.type]);
            const csvContent = [header, ...rows]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = 'generated-test-cases.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

})();
