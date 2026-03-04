/**
 * test-case-generator.js
 * Reads uploaded use-case documents (TXT, CSV, XLSX, DOCX, PDF) and generates
 * structured test cases with severity and test-case-type tags.
 *
 * Depends on read-excel-file (v7), JSZip, and PDF.js already loaded by the host page.
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
 * @typedef {{ ucRef:string, title:string, description:string[], steps:string[], expectedResult:string, severity:string, type:string }} TC
 */
const TEMPLATES = [
    // 1. Happy / positive path — always generated
    {
        id: 'happy-path',
        generate(ucText, ucRef, feature) {
            return [{
                ucRef,
                title: `Verify successful ${feature} with valid inputs`,
                description: [
                    `Verify that the ${feature} completes successfully end-to-end.`,
                    'All required input fields are filled with valid data.',
                    'The user has the appropriate permissions to perform the action.',
                ],
                steps: [
                    'Log in with a valid user account that has the required permissions.',
                    `Navigate to the ${feature} screen/functionality.`,
                    'Fill in all required fields with valid, correctly formatted data.',
                    'Submit or confirm the action.',
                    'Observe the system response.',
                ],
                expectedResult: `The ${feature} completes successfully and the system confirms the action with an appropriate success message or state change.`,
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
                description: [
                    `Ensure the system handles invalid or missing inputs gracefully for ${feature}.`,
                    'The system must not proceed or corrupt data on bad input.',
                    'A clear, user-friendly error message must be displayed.',
                ],
                steps: [
                    'Navigate to the relevant screen for the feature.',
                    'Leave required fields empty or enter invalid/malformed data.',
                    'Attempt to submit or perform the action.',
                    'Observe the system response and any displayed messages.',
                ],
                expectedResult: `The system displays a clear, descriptive error message, highlights the problematic field(s), and does not process or save any data.`,
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
                description: [
                    `Validate correct behaviour at the defined limits for ${feature}.`,
                    'Test at exactly the minimum allowed value.',
                    'Test at exactly the maximum allowed value.',
                    'Test with a value just beyond the maximum.',
                ],
                steps: [
                    'Identify the minimum and maximum allowed values for the relevant field(s).',
                    'Enter the minimum valid value and submit — note the result.',
                    'Enter the maximum valid value and submit — note the result.',
                    'Enter one unit above the maximum and attempt to submit — note the result.',
                    'Enter one unit below the minimum and attempt to submit — note the result.',
                ],
                expectedResult: `Values within range are accepted; values outside the range are rejected with a clear validation message indicating the allowed limits.`,
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
                description: [
                    `All UI elements for ${feature} are correctly displayed and labelled.`,
                    'The layout must be consistent and accessible across supported screen sizes.',
                    'Interactive elements must be keyboard-navigable.',
                ],
                steps: [
                    `Open the page or screen for ${feature} on a desktop-sized viewport.`,
                    'Verify all buttons, labels, input fields, and icons are visible and correctly labelled.',
                    'Resize the viewport to tablet and mobile sizes; verify the layout adapts responsively.',
                    'Use keyboard-only navigation (Tab, Enter) to interact with all controls.',
                    'Check colour contrast for accessibility compliance.',
                ],
                expectedResult: `All UI elements render correctly on all supported viewport sizes, labels are accurate, and the interface is fully keyboard-accessible.`,
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
                description: [
                    `Sensitive/personal data in ${feature} must be protected at rest and in transit.`,
                    'Data must be masked or redacted in UI where applicable.',
                    'Access must be restricted to authorised roles only.',
                    'Processing must comply with applicable privacy regulations (GDPR, CCPA, etc.).',
                ],
                steps: [
                    'Log in as a user without elevated permissions and attempt to view or export sensitive data.',
                    'Inspect network requests to confirm personal data is transmitted over HTTPS.',
                    `Verify that sensitive fields (e.g. passwords, SSN) are masked in the UI for ${feature}.`,
                    'Check that audit/access logs capture access to personal data.',
                    'Confirm that data-retention and deletion policies are enforced.',
                ],
                expectedResult: `Personal and sensitive data is masked in the UI, transmitted securely, accessible only to authorised roles, and handled in compliance with privacy regulations.`,
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
                description: [
                    `${feature} must enforce proper authentication and authorisation.`,
                    'Common attack vectors must be mitigated (injection, XSS, CSRF, brute-force).',
                    'Unauthenticated or unauthorised access attempts must be rejected.',
                ],
                steps: [
                    'Attempt to access the feature without authentication — verify redirection to login.',
                    'Log in as a lower-privilege user and attempt to perform privileged actions.',
                    'Inject SQL/XSS payloads into input fields and verify they are sanitised.',
                    'Attempt repeated failed logins to verify brute-force protection/lockout.',
                    'Verify CSRF tokens are present and validated on state-changing requests.',
                ],
                expectedResult: `Unauthenticated and unauthorised requests are rejected; injected payloads are neutralised; brute-force and CSRF protections are active and effective.`,
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
                description: [
                    `${feature} must meet defined non-functional requirements under normal and peak load.`,
                    'Response times must stay within acceptable thresholds.',
                    'The feature must remain available and recover gracefully from failures.',
                ],
                steps: [
                    `Execute the ${feature} workflow under normal load and measure response time.`,
                    'Simulate peak load (concurrent users) and observe system performance.',
                    'Verify the feature remains available and returns within SLA limits.',
                    'Introduce a failure condition (e.g. service outage) and verify graceful degradation.',
                    'Verify recovery once the failure is resolved.',
                ],
                expectedResult: `The ${feature} responds within the defined SLA thresholds under normal and peak load, degrades gracefully under failure, and recovers automatically.`,
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

/**
 * Parse a plain-text string extracted from a DOCX or PDF file into use-case objects.
 * Delegates to the existing parseTxt logic.
 */
function parsePlainText(text) {
    return parseTxt(text);
}

/**
 * Extract plain text from a DOCX file (ArrayBuffer) using JSZip + DOMParser.
 * Returns a Promise that resolves to a plain-text string.
 */
async function extractDocxText(arrayBuffer) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded. Please refresh the page.');
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) throw new Error('Not a valid DOCX file (word/document.xml missing).');
    const xmlText = await xmlFile.async('string');

    // Parse the XML with DOMParser and extract text via the Word namespace
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = Array.from(doc.getElementsByTagNameNS(NS_W, 'p'));

    if (paragraphs.length > 0) {
        const lines = paragraphs.map(p =>
            Array.from(p.getElementsByTagNameNS(NS_W, 't'))
                .map(t => t.textContent)
                .join('')
        );
        return lines.filter(Boolean).join('\n\n').trim();
    }

    // Fallback: return raw text content (safe — no HTML involved)
    return doc.documentElement.textContent.trim();
}

/**
 * Extract plain text from a PDF file (ArrayBuffer) using PDF.js.
 * Returns a Promise that resolves to a plain-text string.
 */
async function extractPdfText(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded. Please refresh the page.');
    }
    // Point the worker at the same CDN version
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@4.9.155/legacy/build/pdf.worker.min.js';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n\n').trim();
}



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
        const allowed = ['.txt', '.csv', '.xlsx', '.docx', '.doc', '.pdf'];
        if (!allowed.some(ext => name.endsWith(ext))) {
            setStatus('⚠ Please upload a .txt, .csv, .xlsx, .docx, or .pdf file.', 'error');
            btnGenerate.disabled = true;
            return;
        }
        if (name.endsWith('.doc') && !name.endsWith('.docx')) {
            setStatus('⚠ Legacy .doc format is not supported. Please save the file as .docx and re-upload.', 'error');
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

        } else if (name.endsWith('.docx')) {
            const reader = new FileReader();
            reader.onload = e => {
                extractDocxText(e.target.result).then(text => {
                    parsedUseCases = parsePlainText(text);
                    if (!parsedUseCases.length) {
                        setStatus('⚠ No use cases found in the DOCX file.', 'error');
                        btnGenerate.disabled = true;
                        return;
                    }
                    setStatus(`✔ Found ${parsedUseCases.length} use case block(s) in DOCX. Click Generate.`, 'success');
                    btnGenerate.disabled = false;
                }).catch(err => {
                    setStatus('⚠ Could not parse DOCX: ' + err.message, 'error');
                    btnGenerate.disabled = true;
                });
            };
            reader.readAsArrayBuffer(file);

        } else if (name.endsWith('.pdf')) {
            const reader = new FileReader();
            reader.onload = e => {
                extractPdfText(e.target.result).then(text => {
                    parsedUseCases = parsePlainText(text);
                    if (!parsedUseCases.length) {
                        setStatus('⚠ No use cases found in the PDF.', 'error');
                        btnGenerate.disabled = true;
                        return;
                    }
                    setStatus(`✔ Found ${parsedUseCases.length} use case block(s) in PDF. Click Generate.`, 'success');
                    btnGenerate.disabled = false;
                }).catch(err => {
                    setStatus('⚠ Could not parse PDF: ' + err.message, 'error');
                    btnGenerate.disabled = true;
                });
            };
            reader.readAsArrayBuffer(file);

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

            // Description: bulleted list
            const descHtml = Array.isArray(tc.description)
                ? `<ul class="tc-list">${tc.description.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`
                : esc(tc.description);

            // Steps: numbered list
            const stepsHtml = Array.isArray(tc.steps) && tc.steps.length
                ? `<ol class="tc-list">${tc.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
                : '';

            // Expected Result: plain text
            const expectedHtml = tc.expectedResult ? esc(tc.expectedResult) : '';

            tr.innerHTML = `
                <td>${esc(tc.id)}</td>
                <td>${esc(tc.ucRef)}</td>
                <td>${esc(tc.title)}</td>
                <td>${descHtml}</td>
                <td>${stepsHtml}</td>
                <td>${expectedHtml}</td>
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
            const header = ['TC ID', 'Use Case Ref', 'Title', 'Description', 'Steps', 'Expected Result', 'Severity', 'Type'];
            const rows   = generatedTCs.map(tc => [
                tc.id,
                tc.ucRef,
                tc.title,
                Array.isArray(tc.description) && tc.description.length ? tc.description.join(' | ') : String(tc.description || ''),
                Array.isArray(tc.steps)       && tc.steps.length       ? tc.steps.join(' | ')       : String(tc.steps || ''),
                tc.expectedResult || '',
                tc.severity,
                tc.type,
            ]);
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
