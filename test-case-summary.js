/**
 * test-case-summary.js
 * Reads an uploaded test-case spreadsheet (XLSX or CSV), optionally calls an
 * AI model (OpenAI GPT-4o or Google Gemini 1.5 Pro), and produces a concise,
 * human-readable summary of the entire test suite.
 *
 * Depends on read-excel-file (v7) already loaded by the host page.
 */

'use strict';

/* ─────────────────────────────────────────────
   Standard column name mapping
   Keys are semantic field names; values are arrays of recognised header
   variants (compared case-insensitively, trimmed).
───────────────────────────────────────────── */
const SUM_COL_MAP = {
    useCase:        ['use case', 'usecase', 'use_case', 'module', 'feature', 'epic', 'user story', 'userstory'],
    testCaseId:     ['test case id', 'tc id', 'testcaseid', 'tc_id', 'test id', 'case id', 'id'],
    testCase:       ['test case', 'test name', 'title', 'scenario', 'test scenario', 'description', 'test'],
    precondition:   ['precondition', 'pre-condition', 'pre condition', 'prerequisite', 'preconditions', 'setup'],
    steps:          ['steps', 'step', 'test steps', 'test procedure', 'procedure', 'actions', 'action'],
    expectedResult: ['expected results', 'expected result', 'expected outcome', 'expected', 'outcome', 'expected behavior'],
    severity:       ['severity', 'priority', 'impact', 'risk level', 'criticality'],
    status:         ['status', 'result', 'execution status', 'test result', 'pass/fail', 'run status'],
    isAutomatable:  ['is automatable', 'automatable', 'automation', 'can automate', 'automate', 'automation feasibility'],
    bugId:          ['bug id', 'defect id', 'issue id', 'jira id', 'bug', 'defect', 'ticket', 'linked bug'],
    comments:       ['comments', 'notes', 'remarks', 'observation', 'remark'],
};

/* ─────────────────────────────────────────────
   Column detection helper
───────────────────────────────────────────── */
function detectSumColumns(headers) {
    const normalised = headers.map(h => String(h).trim().toLowerCase());
    const result = {};
    Object.entries(SUM_COL_MAP).forEach(function ([field, variants]) {
        for (var i = 0; i < variants.length; i++) {
            var idx = normalised.indexOf(variants[i]);
            if (idx !== -1) { result[field] = headers[idx]; break; }
        }
    });
    return result; // { useCase: 'Use Case', testCase: 'Test Case', … }
}

/* ─────────────────────────────────────────────
   File parsing helpers (XLSX + CSV)
───────────────────────────────────────────── */
function sumRowsToObjects(rawRows) {
    if (!rawRows || rawRows.length < 2) return [];
    var headers = rawRows[0].map(function (h) {
        return h !== null && h !== undefined ? String(h) : '';
    });
    return rawRows.slice(1).map(function (row) {
        return Object.fromEntries(
            headers.map(function (h, i) {
                return [h, row[i] !== null && row[i] !== undefined ? row[i] : ''];
            })
        );
    });
}

function sumParseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return [];
    function splitLine(line) {
        var fields = [], cur = '', inQuote = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                fields.push(cur); cur = '';
            } else { cur += ch; }
        }
        fields.push(cur);
        return fields;
    }
    var headers = splitLine(lines[0]);
    return lines.slice(1).map(function (line) {
        var vals = splitLine(line);
        return Object.fromEntries(
            headers.map(function (h, i) {
                return [h, vals[i] !== null && vals[i] !== undefined ? vals[i] : ''];
            })
        );
    });
}

/* ─────────────────────────────────────────────
   Data extraction / aggregation
───────────────────────────────────────────── */
function extractSumStats(rows, cols) {
    var stats = {
        total: rows.length,
        bySeverity: {},
        byStatus:   {},
        automatable: 0,
        notAutomatable: 0,
        withBug: 0,
        useCases: [],
    };

    var ucSet = new Set();

    rows.forEach(function (row) {
        // Severity
        if (cols.severity) {
            var sev = String(row[cols.severity] || '').trim().toLowerCase() || 'unspecified';
            stats.bySeverity[sev] = (stats.bySeverity[sev] || 0) + 1;
        }
        // Status
        if (cols.status) {
            var st = String(row[cols.status] || '').trim().toLowerCase() || 'unspecified';
            stats.byStatus[st] = (stats.byStatus[st] || 0) + 1;
        }
        // Automatable
        if (cols.isAutomatable) {
            var auto = String(row[cols.isAutomatable] || '').trim().toLowerCase();
            if (/^(yes|y|true|1|automatable)$/.test(auto)) stats.automatable++;
            else if (/^(no|n|false|0|manual|not automatable)$/.test(auto)) stats.notAutomatable++;
        }
        // Bug ID
        if (cols.bugId) {
            var bug = String(row[cols.bugId] || '').trim();
            if (bug && bug !== '-' && bug !== 'n/a' && bug !== 'na') stats.withBug++;
        }
        // Use Cases
        if (cols.useCase) {
            var uc = String(row[cols.useCase] || '').trim();
            if (uc) ucSet.add(uc);
        }
    });

    stats.useCases = Array.from(ucSet);
    return stats;
}

function groupByUseCase(rows, cols) {
    var groups = new Map();
    rows.forEach(function (row) {
        var uc = cols.useCase ? String(row[cols.useCase] || '').trim() : '';
        var key = uc || '(No Use Case)';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });
    return groups;
}

/* ─────────────────────────────────────────────
   Built-in summarisation engine
   Produces a user-story / use-case narrative so stakeholders understand
   what the product does and how it behaves — without statistics or
   severity breakdowns.
───────────────────────────────────────────── */
function builtInSummarise(rows, cols, stats) {
    var ucList  = stats.useCases;
    var groups  = groupByUseCase(rows, cols);

    /* ── 1. Intro sentence ── */
    var intro = ucList.length > 0
        ? 'The test suite covers <strong>' + ucList.length + ' feature area' +
          (ucList.length !== 1 ? 's' : '') + '</strong>.'
        : 'The test suite covers general application functionality.';

    /* ── 2. Feature stories — one entry per named use case ── */
    var features   = [];   // { name, scenarios[], hasMore }
    var ungrouped  = [];   // test case names that have no use case assigned

    groups.forEach(function (ucRows, ucName) {
        // Collect representative scenario names / descriptions
        var scenarios = [];
        ucRows.forEach(function (r) {
            var name = (cols.testCase   ? String(r[cols.testCase]   || '') : '').trim()
                    || (cols.testCaseId ? String(r[cols.testCaseId] || '') : '').trim();
            if (name && scenarios.indexOf(name) === -1) scenarios.push(name);
        });

        if (ucName === '(No Use Case)') {
            ungrouped = scenarios;
        } else {
            var shown = scenarios.slice(0, 5);
            features.push({
                name:     ucName,
                scenarios: shown,
                hasMore:  scenarios.length > shown.length,
                extraCount: scenarios.length - shown.length,
            });
        }
    });

    /* ── 3. Unclassified note (if any) ── */
    var ungroupedNote = '';
    if (ungrouped.length > 0) {
        var allText = rows.map(function (r) {
            return Object.values(r).join(' ').toLowerCase();
        }).join(' ');

        var areas = [];
        if (/\b(login|logout|sign in|sign out|auth|session|password|credential)\b/.test(allText)) areas.push('authentication & session management');
        if (/\b(create|add|new|register|submit|insert)\b/.test(allText)) areas.push('data creation');
        if (/\b(edit|update|modify|change|save|patch)\b/.test(allText)) areas.push('editing & updates');
        if (/\b(delete|remove|archive|purge)\b/.test(allText)) areas.push('deletion');
        if (/\b(search|filter|sort|find|query|lookup)\b/.test(allText)) areas.push('search & filtering');
        if (/\b(upload|download|import|export|attachment|file)\b/.test(allText)) areas.push('file management');
        if (/\b(role|permission|access|admin|rbac|privilege)\b/.test(allText)) areas.push('access control');
        if (/\b(notification|email|sms|alert|push|reminder)\b/.test(allText)) areas.push('notifications & alerts');
        if (/\b(invalid|negative|error|exception|boundary|edge)\b/.test(allText)) areas.push('error & edge cases');
        if (/\b(ui|ux|display|visible|layout|responsive|screen)\b/.test(allText)) areas.push('UI/UX behaviour');
        if (/\b(performance|load|stress|latency|speed|concurr)\b/.test(allText)) areas.push('performance');

        ungroupedNote = ungrouped.length + ' additional scenario' +
            (ungrouped.length !== 1 ? 's are' : ' is') + ' not assigned to a named feature' +
            (areas.length > 0 ? ', spanning areas such as ' + areas.join(', ') : '') + '.';
    }

    return {
        intro:          intro,
        features:       features,
        ungroupedNote:  ungroupedNote,
    };
}

/* ─────────────────────────────────────────────
   Build AI prompt from test case data
───────────────────────────────────────────── */
function buildAIPrompt(rows, cols, stats) {
    var total = stats.total;
    var ucList = stats.useCases;

    var prompt = 'You are a senior QA engineer. Read the test case data below and write a clear, concise feature narrative — in the style of user stories or use cases — so that any stakeholder can immediately understand what the product does and how it behaves.\n\n';

    prompt += '## Test Suite Data\n';
    prompt += '- Total test cases: ' + total + '\n';
    if (ucList.length) prompt += '- Feature areas / use cases: ' + ucList.join(', ') + '\n';

    // Sample test cases (limited to AI_MAX_SAMPLE_ROWS to stay within API token limits)
    var sample = rows.slice(0, AI_MAX_SAMPLE_ROWS);
    prompt += '\n## Sample Test Cases\n';
    sample.forEach(function (row, i) {
        var parts = [];
        if (cols.testCaseId)     parts.push('ID: '       + String(row[cols.testCaseId]     || '').trim());
        if (cols.testCase)       parts.push('Name: '     + String(row[cols.testCase]       || '').trim());
        if (cols.useCase)        parts.push('Use Case: ' + String(row[cols.useCase]        || '').trim());
        if (cols.expectedResult) parts.push('Expected: ' + String(row[cols.expectedResult] || '').trim().slice(0, 120));
        prompt += (i + 1) + '. ' + parts.join(' | ') + '\n';
    });
    if (rows.length > AI_MAX_SAMPLE_ROWS) {
        prompt += '… and ' + (rows.length - AI_MAX_SAMPLE_ROWS) + ' more test cases not shown.\n';
    }

    prompt += '\n## Your Task\n';
    prompt += 'Write a feature narrative describing:\n';
    prompt += '1. **What the product / feature does** — from the user\'s perspective\n';
    prompt += '2. **How each feature area behaves** — what users can do, what the system does in response\n';
    prompt += '3. **Notable behaviours or edge cases** that are explicitly tested\n';
    prompt += '\nGuidelines:\n';
    prompt += '- Write in short, plain-language paragraphs or use one heading per feature area.\n';
    prompt += '- Do NOT include statistics, severity labels, test counts, or pass/fail numbers.\n';
    prompt += '- Make it easily digestible for a non-technical stakeholder.\n';

    return prompt;
}

/* ─────────────────────────────────────────────
   AI API callers
───────────────────────────────────────────── */
async function callOpenAI(apiKey, prompt) {
    var response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: AI_MAX_RESPONSE_TOKENS,
            temperature: AI_TEMPERATURE,
        }),
    });

    if (!response.ok) {
        var errData = await response.json().catch(function () { return {}; });
        throw new Error(errData.error && errData.error.message
            ? errData.error.message
            : 'OpenAI API returned status ' + response.status);
    }
    var data = await response.json();
    return data.choices[0].message.content.trim();
}

async function callGemini(apiKey, prompt) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + encodeURIComponent(apiKey);
    var response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: AI_TEMPERATURE, maxOutputTokens: AI_MAX_RESPONSE_TOKENS },
        }),
    });

    if (!response.ok) {
        var errData = await response.json().catch(function () { return {}; });
        throw new Error(errData.error && errData.error.message
            ? errData.error.message
            : 'Gemini API returned status ' + response.status);
    }
    var data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
}

/* ─────────────────────────────────────────────
   HTML helpers
───────────────────────────────────────────── */
function escSum(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capFirst(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* Convert plain-text AI response (markdown-lite) to safe HTML. */
function aiTextToHtml(text) {
    var escaped = escSum(text);
    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.+?)__/g,      '<strong>$1</strong>');
    // Headers: ## text or # text
    escaped = escaped.replace(/^### (.+)$/gm, '<h4 style="margin:14px 0 6px;color:var(--accent)">$1</h4>');
    escaped = escaped.replace(/^## (.+)$/gm,  '<h3 style="margin:16px 0 8px;color:var(--accent)">$1</h3>');
    escaped = escaped.replace(/^# (.+)$/gm,   '<h3 style="margin:16px 0 8px;color:var(--accent)">$1</h3>');
    // Numbered list items: 1. text
    escaped = escaped.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-bottom:6px">$1</li>');
    // Bulleted list items: - text or * text
    escaped = escaped.replace(/^[*\-]\s+(.+)$/gm, '<li style="margin-bottom:6px">$1</li>');
    // Wrap consecutive <li> runs in <ol> or <ul>
    escaped = escaped.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g, function (match) {
        return '<ul style="padding-left:20px;margin:8px 0">' + match + '</ul>';
    });
    // Blank lines → paragraph breaks
    escaped = escaped.replace(/\n{2,}/g, '</p><p style="margin:10px 0">');
    return '<p style="margin:10px 0">' + escaped + '</p>';
}

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
/** Maximum number of test case rows sent to AI APIs (keeps prompt within typical token limits). */
var AI_MAX_SAMPLE_ROWS = 80;

/** Max tokens requested from AI models — long enough for a detailed summary, short enough to be cost-effective. */
var AI_MAX_RESPONSE_TOKENS = 1500;

/** Low temperature for factual, consistent summaries (not creative writing). */
var AI_TEMPERATURE = 0.3;

/* ─────────────────────────────────────────────
   History helpers
───────────────────────────────────────────── */
const SUM_HISTORY_KEY = 'tca_sum_history';
/** Cap at 20 entries — balances UX utility and localStorage size constraints. */
const SUM_HISTORY_MAX = 20;

function saveToSumHistory(fileName, modelLabel, stats, summaryHtml, useCaseBreakdown) {
    var history = [];
    try { history = JSON.parse(localStorage.getItem(SUM_HISTORY_KEY) || '[]'); } catch (e) { history = []; }
    var entry = {
        id:               Date.now(),
        fileName:         fileName,
        timestamp:        new Date().toISOString(),
        model:            modelLabel,
        totalRows:        stats.total,
        useCases:         stats.useCases,
        stats:            stats,
        summaryHtml:      summaryHtml,
        useCaseBreakdown: useCaseBreakdown,
    };
    history.unshift(entry);
    if (history.length > SUM_HISTORY_MAX) history = history.slice(0, SUM_HISTORY_MAX);
    try {
        localStorage.setItem(SUM_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // localStorage quota exceeded — trim entries one by one until it fits
        while (history.length > 1) {
            history.pop();
            try { localStorage.setItem(SUM_HISTORY_KEY, JSON.stringify(history)); break; } catch (e2) { /* continue trimming */ }
        }
    }
    // Notify the history tab to refresh (failure is non-fatal — tab will refresh on next open)
    try { window.dispatchEvent(new CustomEvent('tca-history-updated')); } catch (e) { /* ignore */ }
}

/* ─────────────────────────────────────────────
   UI / DOM logic
───────────────────────────────────────────── */
(function () {
    var dropZone    = document.getElementById('sum-drop-zone');
    var fileInput   = document.getElementById('sum-file-input');
    var modelSelect = document.getElementById('sum-ai-model');
    var apiKeyRow   = document.getElementById('sum-api-key-row');
    var apiKeyInput = document.getElementById('sum-api-key');
    var btnSummarise = document.getElementById('btn-summarise');
    var statusEl    = document.getElementById('sum-status');

    var secStats    = document.getElementById('sum-sec-stats');
    var secSummary  = document.getElementById('sum-sec-summary');

    var parsedRows      = null;
    var currentFileName = '';

    /* ── Model selector ── */
    modelSelect.addEventListener('change', function () {
        apiKeyRow.hidden = modelSelect.value === 'builtin';
        apiKeyInput.value = '';
    });

    /* ── Status bar ── */
    function setStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.className   = type || '';
        statusEl.style.display = msg ? 'block' : 'none';
    }

    function clearResults() {
        [secStats, secSummary].forEach(function (s) {
            if (s) s.classList.remove('visible');
        });
    }

    /* ── Drag-and-drop ── */
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file) handleFileSelected(file);
    });

    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
    });

    function handleFileSelected(file) {
        var name = file.name.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
            setStatus('⚠ Please upload an .xlsx or .csv file.', 'error');
            btnSummarise.disabled = true;
            return;
        }
        document.getElementById('sum-drop-label').textContent = '📄 ' + file.name;
        document.getElementById('sum-drop-hint').textContent  = (file.size / 1024).toFixed(1) + ' KB';
        setStatus('File ready. Click "Summarise Test Cases" to continue.', 'info');
        btnSummarise.disabled = false;
        currentFileName = file.name;
        parsedRows = null;
        clearResults();
        readSumFile(file);
    }

    function readSumFile(file) {
        setStatus('Reading file…', 'info');
        var name = file.name.toLowerCase();

        if (name.endsWith('.csv')) {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var rows = sumParseCSV(e.target.result);
                    if (!rows.length) {
                        setStatus('⚠ The CSV file appears to be empty or has only a header row.', 'error');
                        btnSummarise.disabled = true;
                        return;
                    }
                    parsedRows = rows;
                    setStatus('✔ Parsed ' + rows.length + ' rows. Click "Summarise Test Cases".', 'success');
                    btnSummarise.disabled = false;
                } catch (err) {
                    setStatus('⚠ Could not parse CSV: ' + err.message, 'error');
                    btnSummarise.disabled = true;
                }
            };
            reader.readAsText(file);
        } else {
            readXlsxFile(file).then(function (rawRows) {
                var rows = sumRowsToObjects(rawRows);
                if (!rows.length) {
                    setStatus('⚠ The spreadsheet appears to be empty or has only a header row.', 'error');
                    btnSummarise.disabled = true;
                    return;
                }
                parsedRows = rows;
                setStatus('✔ Parsed ' + rows.length + ' rows. Click "Summarise Test Cases".', 'success');
                btnSummarise.disabled = false;
            }).catch(function (err) {
                setStatus('⚠ Could not parse file: ' + err.message, 'error');
                btnSummarise.disabled = true;
            });
        }
    }

    /* ── Summarise button ── */
    btnSummarise.addEventListener('click', async function () {
        if (!parsedRows || parsedRows.length === 0) {
            setStatus('⚠ Please upload a file first.', 'error');
            return;
        }

        var selectedModel = modelSelect.value;
        var apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

        if (selectedModel !== 'builtin' && !apiKey) {
            setStatus('⚠ Please enter your API key for the selected AI model.', 'error');
            return;
        }

        btnSummarise.disabled = true;
        clearResults();

        var headers = Object.keys(parsedRows[0]);
        var cols    = detectSumColumns(headers);
        var stats   = extractSumStats(parsedRows, cols);

        try {
            var summaryHtml;
            var modelLabel;

            if (selectedModel === 'openai') {
                setStatus('⏳ Calling OpenAI GPT-4o…', 'info');
                modelLabel = 'OpenAI GPT-4o';
                var prompt   = buildAIPrompt(parsedRows, cols, stats);
                var aiText   = await callOpenAI(apiKey, prompt);
                summaryHtml  = aiTextToHtml(aiText);
            } else if (selectedModel === 'gemini') {
                setStatus('⏳ Calling Google Gemini 1.5 Pro…', 'info');
                modelLabel = 'Google Gemini 1.5 Pro';
                var prompt   = buildAIPrompt(parsedRows, cols, stats);
                var aiText   = await callGemini(apiKey, prompt);
                summaryHtml  = aiTextToHtml(aiText);
            } else {
                setStatus('⏳ Generating built-in summary…', 'info');
                modelLabel = 'Built-in Analysis';
                var builtIn  = builtInSummarise(parsedRows, cols, stats);
                summaryHtml  = buildBuiltInSummaryHtml(builtIn);
            }

            renderSumStats(stats, cols);
            renderSumSummary(summaryHtml, modelLabel);

            // Save to history before rendering so the entry is always captured
            var ucBreakdownArr = [];
            var ucGroups = groupByUseCase(parsedRows, cols);
            ucGroups.forEach(function (ucRows, ucName) {
                ucBreakdownArr.push({ name: ucName, count: ucRows.length });
            });
            saveToSumHistory(currentFileName, modelLabel, stats, summaryHtml, ucBreakdownArr);

            setStatus('✔ Summary complete.', 'success');
        } catch (err) {
            setStatus('⚠ ' + err.message, 'error');
        } finally {
            btnSummarise.disabled = false;
        }
    });

    /* ── Render stats section ── */
    function renderSumStats(stats, cols) {
        var container = document.getElementById('sum-stats-body');
        if (!container) return;

        var html = '<div class="stats-row">';

        // Total
        html += '<div class="stat-chip"><div class="num">' + stats.total + '</div><div class="lbl">Total test cases</div></div>';

        // Use cases
        if (stats.useCases.length > 0) {
            html += '<div class="stat-chip"><div class="num">' + stats.useCases.length + '</div><div class="lbl">Feature areas</div></div>';
        }

        // Automatable
        var autoTotal = stats.automatable + stats.notAutomatable;
        if (autoTotal > 0) {
            var autoPct = Math.round((stats.automatable / autoTotal) * 100);
            html += '<div class="stat-chip" style="border-top:3px solid #2e7d32"><div class="num" style="color:#2e7d32">' + autoPct + '%</div><div class="lbl">Automatable</div></div>';
        }

        // Bugs
        if (stats.withBug > 0) {
            html += '<div class="stat-chip" style="border-top:3px solid #c62828"><div class="num" style="color:#c62828">' + stats.withBug + '</div><div class="lbl">Linked bugs</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
        secStats.classList.add('visible');
    }

    /* ── Render summary section ── */
    function renderSumSummary(html, modelLabel) {
        var titleEl   = document.getElementById('sum-summary-title');
        var contentEl = document.getElementById('sum-content');
        var baseTitle = '📋 What\'s Being Tested';
        var label = (modelLabel === 'Built-in Analysis') ? baseTitle : baseTitle + ' — ' + modelLabel;
        if (titleEl)   titleEl.textContent = label;
        if (contentEl) contentEl.innerHTML  = html;
        secSummary.classList.add('visible');
    }

    /* ── Build HTML for built-in summary result ── */
    function buildBuiltInSummaryHtml(builtIn) {
        var html = '';

        html += '<p class="sum-narrative-intro">' + builtIn.intro + '</p>';

        if (builtIn.features && builtIn.features.length > 0) {
            builtIn.features.forEach(function (feature) {
                html += '<div class="sum-feature-block">';
                html += '<p class="sum-feature-name"><strong>' + escSum(feature.name) + '</strong></p>';
                if (feature.scenarios && feature.scenarios.length > 0) {
                    html += '<ul class="sum-scenario-list">';
                    feature.scenarios.forEach(function (s) {
                        html += '<li>' + escSum(s) + '</li>';
                    });
                    if (feature.hasMore) {
                        html += '<li class="sum-more-hint">…and ' + feature.extraCount +
                                ' more scenario' + (feature.extraCount !== 1 ? 's' : '') + '</li>';
                    }
                    html += '</ul>';
                }
                html += '</div>';
            });
        }

        if (builtIn.ungroupedNote) {
            html += '<p class="sum-ungrouped-note">' + escSum(builtIn.ungroupedNote) + '</p>';
        }

        return html;
    }

    /* ── Init: nothing to do on load ── */
}());
