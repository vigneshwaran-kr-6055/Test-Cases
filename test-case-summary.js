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
   Generates a rich, structured summary without any external API.
───────────────────────────────────────────── */
function builtInSummarise(rows, cols, stats) {
    var total = stats.total;

    /* ── 1. Executive paragraph ── */
    var exec = '';
    var ucList = stats.useCases;

    if (ucList.length > 0) {
        var listed = ucList.slice(0, 5).join(', ');
        var more = ucList.length > 5 ? ' and ' + (ucList.length - 5) + ' more' : '';
        exec += 'This test suite contains <strong>' + total + '</strong> test case' + (total !== 1 ? 's' : '') +
                ' covering <strong>' + ucList.length + '</strong> use case' + (ucList.length !== 1 ? 's' : '') +
                ': <em>' + escSum(listed) + more + '</em>. ';
    } else {
        exec += 'This test suite contains <strong>' + total + '</strong> test case' + (total !== 1 ? 's' : '') + '. ';
    }

    // Severity highlight
    var sevEntries = Object.entries(stats.bySeverity).sort(function (a, b) { return b[1] - a[1]; });
    if (sevEntries.length > 0) {
        var topSev = sevEntries[0];
        exec += 'The majority (' + topSev[1] + ' of ' + total + ') are categorised as <strong>' +
                escSum(capFirst(topSev[0])) + '</strong> severity. ';
    }

    // Status highlight
    var statusEntries = Object.entries(stats.byStatus).sort(function (a, b) { return b[1] - a[1]; });
    if (statusEntries.length > 0) {
        var passCount = 0, failCount = 0, notRunCount = 0;
        statusEntries.forEach(function (e) {
            var k = e[0];
            if (/pass|passed|done|success/.test(k))    passCount   += e[1];
            else if (/fail|failed|block|defect/.test(k)) failCount += e[1];
            else if (/not run|pending|new|untested/.test(k)) notRunCount += e[1];
        });
        var statusParts = [];
        if (passCount)   statusParts.push('<span style="color:#2e7d32"><strong>' + passCount   + ' passed</strong></span>');
        if (failCount)   statusParts.push('<span style="color:#c62828"><strong>' + failCount   + ' failed/blocked</strong></span>');
        if (notRunCount) statusParts.push('<span style="color:#e65100"><strong>' + notRunCount + ' not yet run</strong></span>');
        if (statusParts.length > 0) {
            exec += 'Execution status: ' + statusParts.join(', ') + '. ';
        }
    }

    // Automation
    var autoTotal = stats.automatable + stats.notAutomatable;
    if (autoTotal > 0) {
        var autoPct = Math.round((stats.automatable / autoTotal) * 100);
        exec += '<strong>' + autoPct + '%</strong> of test cases (' + stats.automatable + ' of ' + autoTotal + ') are marked as automatable. ';
    }

    // Bugs
    if (stats.withBug > 0) {
        exec += '<strong>' + stats.withBug + '</strong> test case' + (stats.withBug !== 1 ? 's have' : ' has') + ' linked bug IDs. ';
    }

    /* ── 2. Coverage assessment ── */
    var coverage = '';
    var allText = rows.map(function (r) {
        return Object.values(r).join(' ').toLowerCase();
    }).join(' ');

    var coverageAreas = [];
    if (/\b(login|logout|sign in|sign out|auth|session|password|credential)\b/.test(allText))
        coverageAreas.push('Authentication & Session Management');
    if (/\b(create|add|new|register|submit|insert)\b/.test(allText))
        coverageAreas.push('Data Creation');
    if (/\b(edit|update|modify|change|save|patch)\b/.test(allText))
        coverageAreas.push('Data Editing & Updates');
    if (/\b(delete|remove|archive|purge)\b/.test(allText))
        coverageAreas.push('Data Deletion');
    if (/\b(search|filter|sort|find|query|lookup)\b/.test(allText))
        coverageAreas.push('Search & Filtering');
    if (/\b(upload|download|import|export|attachment|file)\b/.test(allText))
        coverageAreas.push('File Upload/Download');
    if (/\b(payment|billing|invoice|checkout|transaction|order)\b/.test(allText))
        coverageAreas.push('Payment & Billing');
    if (/\b(report|analytics|dashboard|chart|graph|metric)\b/.test(allText))
        coverageAreas.push('Reporting & Analytics');
    if (/\b(role|permission|access|admin|rbac|privilege)\b/.test(allText))
        coverageAreas.push('Role & Access Control');
    if (/\b(notification|email|sms|alert|push|reminder)\b/.test(allText))
        coverageAreas.push('Notifications & Alerts');
    if (/\b(invalid|negative|error|exception|boundary|edge)\b/.test(allText))
        coverageAreas.push('Negative & Boundary Testing');
    if (/\b(ui|ux|display|visible|layout|responsive|screen)\b/.test(allText))
        coverageAreas.push('UI/UX Validation');
    if (/\b(api|endpoint|integration|rest|webhook|http)\b/.test(allText))
        coverageAreas.push('API & Integrations');
    if (/\b(performance|load|stress|latency|speed|concurr)\b/.test(allText))
        coverageAreas.push('Performance & Load Testing');

    if (coverageAreas.length > 0) {
        coverage = 'The test suite spans the following functional areas: <strong>' +
                   coverageAreas.join('</strong>, <strong>') + '</strong>.';
    } else {
        coverage = 'The test suite covers general application functionality.';
    }

    /* ── 3. Use case breakdown paragraphs ── */
    var ucBreakdown = [];
    var groups = groupByUseCase(rows, cols);
    groups.forEach(function (ucRows, ucName) {
        var sevMap = {};
        var passC = 0, failC = 0;
        var autoC = 0;
        ucRows.forEach(function (r) {
            if (cols.severity) {
                var s = String(r[cols.severity] || '').trim().toLowerCase() || 'unspecified';
                sevMap[s] = (sevMap[s] || 0) + 1;
            }
            if (cols.status) {
                var st = String(r[cols.status] || '').trim().toLowerCase();
                if (/pass|passed|done|success/.test(st)) passC++;
                else if (/fail|failed|block/.test(st)) failC++;
            }
            if (cols.isAutomatable) {
                var a = String(r[cols.isAutomatable] || '').trim().toLowerCase();
                if (/^(yes|y|true|1|automatable)$/.test(a)) autoC++;
            }
        });

        var sevSummary = Object.entries(sevMap)
            .sort(function (a, b) { return b[1] - a[1]; })
            .map(function (e) { return e[1] + ' ' + capFirst(e[0]); })
            .join(', ');

        var line = '<strong>' + escSum(ucName) + '</strong> — ' + ucRows.length +
                   ' test case' + (ucRows.length !== 1 ? 's' : '');
        if (sevSummary) line += ' (' + sevSummary + ')';
        if (passC || failC) {
            line += '; ' + passC + ' passed';
            if (failC) line += ', ' + failC + ' failed';
        }
        if (autoC) line += '; ' + autoC + ' automatable';
        ucBreakdown.push(line);
    });

    /* ── 4. Observations ── */
    var observations = [];
    var highSev = (stats.bySeverity['critical'] || 0) +
                  (stats.bySeverity['showstopper'] || 0) +
                  (stats.bySeverity['high'] || 0) +
                  (stats.bySeverity['blocker'] || 0);
    if (highSev > 0) {
        observations.push('⚠️ <strong>' + highSev + '</strong> high-priority test case' +
            (highSev !== 1 ? 's require' : ' requires') + ' immediate attention.');
    }

    var failedCount = 0;
    Object.entries(stats.byStatus).forEach(function (e) {
        if (/fail|failed|block|defect/.test(e[0])) failedCount += e[1];
    });
    if (failedCount > 0) {
        observations.push('🔴 <strong>' + failedCount + '</strong> test case' +
            (failedCount !== 1 ? 's have' : ' has') + ' a failed or blocked status — these should be investigated.');
    }

    var autoTotal2 = stats.automatable + stats.notAutomatable;
    if (autoTotal2 > 0 && stats.automatable === 0) {
        observations.push('🤖 No test cases are currently marked as automatable. Consider reviewing candidates for test automation.');
    } else if (autoTotal2 > 0) {
        var autoPct2 = Math.round((stats.automatable / autoTotal2) * 100);
        if (autoPct2 >= 70) {
            observations.push('✅ Strong automation readiness: <strong>' + autoPct2 + '%</strong> of test cases are marked automatable.');
        } else if (autoPct2 < 30) {
            observations.push('🤖 Low automation coverage (' + autoPct2 + '%). Increasing automatable tests can improve regression speed.');
        }
    }

    if (stats.withBug > 0) {
        var bugPct = Math.round((stats.withBug / total) * 100);
        observations.push('🐛 <strong>' + bugPct + '%</strong> of test cases (' + stats.withBug + ') have linked defect IDs — review their current resolution status.');
    }

    return {
        executive: exec,
        coverage:  coverage,
        useCaseBreakdown: ucBreakdown,
        observations: observations,
    };
}

/* ─────────────────────────────────────────────
   Build AI prompt from test case data
───────────────────────────────────────────── */
function buildAIPrompt(rows, cols, stats) {
    var total = stats.total;
    var ucList = stats.useCases;

    // Stats header
    var prompt = 'You are a senior QA architect. Summarise the following test suite data clearly and concisely so that any stakeholder — technical or non-technical — can fully understand what is being tested without reading each row individually. Avoid bullet-point lists where prose works better. Be specific and insightful.\n\n';

    prompt += '## Test Suite Overview\n';
    prompt += '- Total test cases: ' + total + '\n';
    if (ucList.length) prompt += '- Use cases / modules: ' + ucList.join(', ') + '\n';

    // Severity
    var sevParts = Object.entries(stats.bySeverity).map(function (e) { return e[1] + ' ' + e[0]; });
    if (sevParts.length) prompt += '- Severity breakdown: ' + sevParts.join(', ') + '\n';

    // Status
    var stParts = Object.entries(stats.byStatus).map(function (e) { return e[1] + ' ' + e[0]; });
    if (stParts.length) prompt += '- Execution status: ' + stParts.join(', ') + '\n';

    // Automation
    var autoTotal = stats.automatable + stats.notAutomatable;
    if (autoTotal > 0) {
        var autoPct = Math.round((stats.automatable / autoTotal) * 100);
        prompt += '- Automatable: ' + stats.automatable + ' of ' + autoTotal + ' (' + autoPct + '%)\n';
    }
    if (stats.withBug) prompt += '- Test cases with linked bug IDs: ' + stats.withBug + '\n';

    // Sample test cases (limited to AI_MAX_SAMPLE_ROWS to stay within API token limits)
    var sample = rows.slice(0, AI_MAX_SAMPLE_ROWS);
    prompt += '\n## Sample Test Cases\n';
    sample.forEach(function (row, i) {
        var parts = [];
        if (cols.testCaseId)     parts.push('ID: ' + String(row[cols.testCaseId] || '').trim());
        if (cols.testCase)       parts.push('Name: ' + String(row[cols.testCase] || '').trim());
        if (cols.useCase)        parts.push('Use Case: ' + String(row[cols.useCase] || '').trim());
        if (cols.severity)       parts.push('Severity: ' + String(row[cols.severity] || '').trim());
        if (cols.status)         parts.push('Status: ' + String(row[cols.status] || '').trim());
        if (cols.expectedResult) parts.push('Expected: ' + String(row[cols.expectedResult] || '').trim().slice(0, 120));
        prompt += (i + 1) + '. ' + parts.join(' | ') + '\n';
    });
    if (rows.length > AI_MAX_SAMPLE_ROWS) {
        prompt += '… and ' + (rows.length - AI_MAX_SAMPLE_ROWS) + ' more test cases not shown.\n';
    }

    prompt += '\n## Your Task\nPlease provide:\n';
    prompt += '1. **Executive Summary** (2–4 clear sentences explaining what this test suite covers and its current health)\n';
    prompt += '2. **Functional Coverage** (What features/areas are well covered?)\n';
    prompt += '3. **Notable Observations** (Any risks, gaps, patterns, or concerns worth highlighting)\n';
    prompt += '4. **Automation Readiness** (Brief assessment based on the automatable data)\n';
    prompt += '\nWrite in clear, professional prose. No filler phrases. Make it flawless so a stakeholder can understand the test coverage at a glance.\n';

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
    var secUseCase  = document.getElementById('sum-sec-usecase');

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
        [secStats, secSummary, secUseCase].forEach(function (s) {
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
            renderUseCaseBreakdown(parsedRows, cols, stats);

            // Save to history
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
            html += '<div class="stat-chip"><div class="num">' + stats.useCases.length + '</div><div class="lbl">Use cases / modules</div></div>';
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

        // Severity row
        if (Object.keys(stats.bySeverity).length > 0) {
            html += '<p class="section-label" style="margin-top:18px">By Severity</p><div class="stats-row">';
            var sevColors = {
                showstopper: '#3d0000', blocker: '#3d0000',
                critical: '#b71c1c', high: '#b71c1c',
                major: '#e65100', medium: '#e65100',
                minor: '#f9a825', low: '#f9a825',
            };
            Object.entries(stats.bySeverity).sort(function (a, b) { return b[1] - a[1]; })
                .forEach(function (e) {
                    var color = sevColors[e[0]] || '#1a73e8';
                    html += '<div class="stat-chip" style="border-top:3px solid ' + color + '"><div class="num" style="color:' + color + '">' + e[1] + '</div><div class="lbl">' + escSum(capFirst(e[0])) + '</div></div>';
                });
            html += '</div>';
        }

        // Status row
        if (Object.keys(stats.byStatus).length > 0) {
            html += '<p class="section-label" style="margin-top:18px">By Status</p><div class="stats-row">';
            var stColors = {
                pass: '#2e7d32', passed: '#2e7d32', done: '#2e7d32',
                fail: '#c62828', failed: '#c62828', blocked: '#c62828',
                'not run': '#e65100', pending: '#e65100', new: '#e65100',
            };
            Object.entries(stats.byStatus).sort(function (a, b) { return b[1] - a[1]; })
                .forEach(function (e) {
                    var color = stColors[e[0]] || '#888';
                    html += '<div class="stat-chip" style="border-top:3px solid ' + color + '"><div class="num" style="color:' + color + '">' + e[1] + '</div><div class="lbl">' + escSum(capFirst(e[0])) + '</div></div>';
                });
            html += '</div>';
        }

        container.innerHTML = html;
        secStats.classList.add('visible');
    }

    /* ── Render summary section ── */
    function renderSumSummary(html, modelLabel) {
        var titleEl   = document.getElementById('sum-summary-title');
        var contentEl = document.getElementById('sum-content');
        if (titleEl)   titleEl.textContent = '🤖 AI Summary — ' + modelLabel;
        if (contentEl) contentEl.innerHTML  = html;
        secSummary.classList.add('visible');
    }

    /* ── Render use case breakdown table ── */
    function renderUseCaseBreakdown(rows, cols, stats) {
        var container = document.getElementById('sum-usecase-body');
        if (!container) return;

        var groups = groupByUseCase(rows, cols);
        if (groups.size === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem">No use case column detected. Add a "Use Case" column for a detailed breakdown.</p>';
            secUseCase.classList.add('visible');
            return;
        }

        var html = '<div class="table-wrapper"><table><thead><tr>';
        html += '<th>Use Case / Module</th><th>Test Cases</th>';
        if (Object.keys(stats.bySeverity).length) html += '<th>Severity Breakdown</th>';
        if (Object.keys(stats.byStatus).length)   html += '<th>Status</th>';
        var autoTotal = stats.automatable + stats.notAutomatable;
        if (autoTotal > 0) html += '<th>Automatable</th>';
        html += '</tr></thead><tbody>';

        groups.forEach(function (ucRows, ucName) {
            var sevMap = {}, stMap = {}, autoC = 0;
            ucRows.forEach(function (r) {
                if (cols.severity) {
                    var s = String(r[cols.severity] || '').trim().toLowerCase() || 'unspecified';
                    sevMap[s] = (sevMap[s] || 0) + 1;
                }
                if (cols.status) {
                    var st = String(r[cols.status] || '').trim().toLowerCase() || 'unspecified';
                    stMap[st] = (stMap[st] || 0) + 1;
                }
                if (cols.isAutomatable) {
                    var a = String(r[cols.isAutomatable] || '').trim().toLowerCase();
                    if (/^(yes|y|true|1|automatable)$/.test(a)) autoC++;
                }
            });

            var sevColors2 = {
                showstopper: '#3d0000', blocker: '#3d0000',
                critical: '#b71c1c', high: '#b71c1c',
                major: '#e65100', medium: '#e65100',
                minor: '#f9a825', low: '#f9a825',
            };
            var stColors2 = {
                pass: '#2e7d32', passed: '#2e7d32',
                fail: '#c62828', failed: '#c62828', blocked: '#c62828',
                'not run': '#e65100', pending: '#e65100',
            };

            html += '<tr>';
            html += '<td><strong>' + escSum(ucName) + '</strong></td>';
            html += '<td style="text-align:center"><strong>' + ucRows.length + '</strong></td>';

            if (Object.keys(stats.bySeverity).length) {
                var sevHtml = Object.entries(sevMap).sort(function (a, b) { return b[1] - a[1]; })
                    .map(function (e) {
                        var c = sevColors2[e[0]] || '#888';
                        return '<span style="margin-right:6px;color:' + c + ';font-weight:600">' + e[1] + ' ' + capFirst(e[0]) + '</span>';
                    }).join('');
                html += '<td>' + (sevHtml || '—') + '</td>';
            }

            if (Object.keys(stats.byStatus).length) {
                var stHtml = Object.entries(stMap).sort(function (a, b) { return b[1] - a[1]; })
                    .map(function (e) {
                        var c = stColors2[e[0]] || '#888';
                        return '<span style="margin-right:6px;color:' + c + ';font-weight:600">' + e[1] + ' ' + capFirst(e[0]) + '</span>';
                    }).join('');
                html += '<td>' + (stHtml || '—') + '</td>';
            }

            if (autoTotal > 0) {
                html += '<td style="text-align:center">' + (autoC > 0 ? '<span style="color:#2e7d32;font-weight:600">' + autoC + ' ✓</span>' : '—') + '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
        secUseCase.classList.add('visible');
    }

    /* ── Build HTML for built-in summary result ── */
    function buildBuiltInSummaryHtml(builtIn) {
        var html = '';

        html += '<div class="sum-executive">' + builtIn.executive + '</div>';

        html += '<div class="sum-coverage-section">';
        html += '<h4 class="sum-sub-heading">📐 Functional Coverage</h4>';
        html += '<p>' + builtIn.coverage + '</p>';
        html += '</div>';

        if (builtIn.useCaseBreakdown && builtIn.useCaseBreakdown.length > 0) {
            html += '<div class="sum-uc-section">';
            html += '<h4 class="sum-sub-heading">📋 Use Case Highlights</h4>';
            html += '<ul class="sum-uc-list">';
            builtIn.useCaseBreakdown.forEach(function (line) {
                html += '<li>' + line + '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        if (builtIn.observations && builtIn.observations.length > 0) {
            html += '<div class="sum-obs-section">';
            html += '<h4 class="sum-sub-heading">🔎 Key Observations</h4>';
            html += '<ul class="sum-obs-list">';
            builtIn.observations.forEach(function (obs) {
                html += '<li>' + obs + '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        return html;
    }

    /* ── Init: nothing to do on load ── */
}());
