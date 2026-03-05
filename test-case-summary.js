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
   Stop words for subject / keyword extraction
───────────────────────────────────────────── */
var SUM_STOP_WORDS = new Set([
    'the','and','that','this','with','from','into','have','been','when',
    'for','are','was','not','but','will','would','could','should','can',
    'may','after','before','while','under','also','both','via','use',
    'using','able','does','show','shows','verify','check','ensure',
    'user','users','section','option','button','action','icon','icons',
    'added','displayed','item','items','page','view','list','detail',
    'screen','panel','window','dialog','folder','folders','email','emails',
    'import','imported','export','upload','uploaded','file','files',
    'test','tests','case','cases','that','where','which','there','then',
]);

/**
 * Extract the most-frequent domain-meaningful keywords from an array of text strings.
 * Used as a universal fallback description for scenarios that do not match any of the
 * predefined theme patterns — works for any feature domain without hard-coded terms.
 *
 * Words in SUM_STOP_WORDS plus the additional QA-process stop-words below are excluded.
 * A word must appear in at least 2 scenarios to qualify (prevents single-mention noise).
 *
 * @param {string[]} texts    - Scenario / test-case text strings to analyse.
 * @param {number}   maxWords - Maximum distinct keywords to return.
 * @returns {string[]} Capitalised domain keywords sorted by descending frequency.
 */
function extractTopKeywords(texts, maxWords) {
    var qaStop = new Set([
        'able','cannot','must','given','then','when',
        'click','select','enter','type','open','close',
        'submit','save','cancel','back','next','done',
        'true','false','null','none','with','without',
        'workflow','scenario','confirm','valid',
    ]);
    var freq = {};
    texts.forEach(function (t) {
        (t.match(new RegExp('[a-zA-Z]{' + SUM_MIN_WORD_LENGTH + ',}', 'g')) || []).forEach(function (w) {
            var lw = w.toLowerCase();
            if (!SUM_STOP_WORDS.has(lw) && !qaStop.has(lw)) {
                freq[lw] = (freq[lw] || 0) + 1;
            }
        });
    });
    return Object.keys(freq)
        .filter(function (w) { return freq[w] >= SUM_MIN_KEYWORD_FREQ; })
        .sort(function (a, b) { return freq[b] - freq[a]; })
        .slice(0, maxWords)
        .map(capFirst);
}

/* ─────────────────────────────────────────────
   Theme patterns used to auto-classify scenarios
   that have no named use-case / feature assigned.
─────────────────────────────────────────────── */
var THEME_PATTERNS = [
    { key: 'auth',    label: 'Authentication & Session Management',
      re: /\b(login|log[\s\-]?in|logout|log[\s\-]?out|sign[\s\-]?in|sign[\s\-]?out|auth|session|password|credential|token|forgot|reset)/i },
    { key: 'create',  label: 'Data Creation',
      re: /\b(creat|add\b|new\b|register|submit|insert|generat)/i },
    { key: 'edit',    label: 'Editing & Updates',
      re: /\b(edit|updat|modif|chang|save|patch|renam|move)/i },
    { key: 'delete',  label: 'Deletion & Archiving',
      re: /\b(delet|remov|archiv|purg|cancel|discard)/i },
    { key: 'search',  label: 'Search & Filtering',
      re: /\b(search|filter|sort|find|query|lookup|browse)/i },
    { key: 'file',    label: 'File Management',
      re: /\b(upload|download|import|export|attachment|file|document)/i },
    { key: 'access',  label: 'Access Control',
      re: /\b(role|permission|access|admin|rbac|privilege|unauthori[sz]e|forbidden)/i },
    { key: 'notify',  label: 'Notifications & Alerts',
      re: /\b(notification|email|sms|alert|push|reminder|message)/i },
    { key: 'error',   label: 'Error & Edge Cases',
      re: /\b(invalid|negative|error|exception|boundary|edge|empty|null|overflow|validat)/i },
    { key: 'ui',      label: 'UI & UX Behaviour',
      re: /\b(ui|ux|display|visible|layout|responsive|screen|button|click|navigat|redirect)/i },
    { key: 'perf',    label: 'Performance',
      re: /\b(performance|load|stress|latency|speed|concurr|timeout)/i },
];

/**
 * Group an array of scenario name strings into themed feature blocks.
 * Returns an array in the same shape as the named-use-case `features` array.
 * Each scenario is assigned to the first matching theme (first-match wins);
 * this keeps the output clean and avoids duplicate entries across groups.
 */
function buildThemedFeatures(scenarios) {
    var grouped = {};
    var order   = [];

    scenarios.forEach(function (scenario) {
        var matched = false;
        for (var i = 0; i < THEME_PATTERNS.length; i++) {
            if (THEME_PATTERNS[i].re.test(scenario)) {
                var k = THEME_PATTERNS[i].key;
                if (!grouped[k]) { grouped[k] = { label: THEME_PATTERNS[i].label, list: [] }; order.push(k); }
                grouped[k].list.push(scenario);
                matched = true;
                break;
            }
        }
        if (!matched) {
            if (!grouped['misc']) { grouped['misc'] = { label: 'General Functionality', list: [] }; order.push('misc'); }
            grouped['misc'].list.push(scenario);
        }
    });

    return order.map(function (k) {
        var g     = grouped[k];
        var shown = g.list.slice(0, SUM_MAX_SCENARIOS_SHOWN);
        return {
            name:       g.label,
            scenarios:  shown,
            hasMore:    g.list.length > shown.length,
            extraCount: g.list.length - shown.length,
        };
    });
}

/**
 * Detect the primary subject / entity from scenario titles.
 * Prefers uppercase acronyms (e.g. EML, PST, CRM) that appear frequently,
 * then falls back to the most common meaningful noun.
 */
function detectSumSubject(scenarios) {
    var skipAcr = { UI: 1, UX: 1, ID: 1, TC: 1, OK: 1, URL: 1, API: 1, NA: 1 };
    var aFreq = {};
    scenarios.forEach(function (s) {
        (s.match(/\b[A-Z]{2,6}\b/g) || []).forEach(function (m) {
            if (!skipAcr[m]) aFreq[m] = (aFreq[m] || 0) + 1;
        });
    });
    var topAcr = Object.keys(aFreq).sort(function (a, b) { return aFreq[b] - aFreq[a]; })[0];
    if (topAcr && aFreq[topAcr] >= SUM_MIN_ACRONYM_FREQ) return topAcr;

    var wFreq = {};
    scenarios.forEach(function (s) {
        (s.match(new RegExp('[a-zA-Z]{' + SUM_MIN_WORD_LENGTH + ',}', 'g')) || []).forEach(function (w) {
            var lw = w.toLowerCase();
            if (!SUM_STOP_WORDS.has(lw)) wFreq[lw] = (wFreq[lw] || 0) + 1;
        });
    });
    var topW = Object.keys(wFreq).sort(function (a, b) { return wFreq[b] - wFreq[a]; })[0];
    return topW ? capFirst(topW) : '';
}

/**
 * Group all scenarios by theme. Returns ordered array of
 * { key, label, list[] } — full scenario list per theme (not sliced).
 */
function groupScenariosByTheme(scenarios) {
    var grouped = {}, order = [];
    scenarios.forEach(function (scenario) {
        var matched = false;
        for (var i = 0; i < THEME_PATTERNS.length; i++) {
            if (THEME_PATTERNS[i].re.test(scenario)) {
                var k = THEME_PATTERNS[i].key;
                if (!grouped[k]) { grouped[k] = { key: k, label: THEME_PATTERNS[i].label, list: [] }; order.push(k); }
                grouped[k].list.push(scenario);
                matched = true;
                break;
            }
        }
        if (!matched) {
            if (!grouped['misc']) { grouped['misc'] = { key: 'misc', label: 'General Functionality', list: [] }; order.push('misc'); }
            grouped['misc'].list.push(scenario);
        }
    });
    return order.map(function (k) { return grouped[k]; });
}

/**
 * Generate a brief one-line capability description for a theme group.
 * Returns null if nothing meaningful can be extracted.
 */
function themeCapability(key, scenarios) {
    var has = function (re) { return scenarios.some(function (x) { return re.test(x); }); };
    switch (key) {
        case 'file':
            var fParts = [];
            if (has(/drag.?and.?drop|drag/i))   fParts.push('drag-and-drop');
            if (has(/browse|browser|finder/i))  fParts.push('file browser');
            if (has(/zip|zipped/i))             fParts.push('zipped archives');
            if (has(/password/i))               fParts.push('password-protected files');
            if (has(/large|10gb/i))             fParts.push('large file handling');
            return 'Import and manage files' + (fParts.length ? ' — supports ' + fParts.join(', ') : '') + '.';
        case 'auth':
            var aParts = [];
            if (has(/password/i))   aParts.push('password-protected access');
            if (has(/session/i))    aParts.push('session handling');
            if (has(/invalid/i))    aParts.push('error messages for invalid credentials');
            return (aParts.length ? capFirst(aParts.join(', ')) : 'Authentication and session management') + '.';
        case 'edit':
            var eVerbs = [];
            if (has(/renam/i))  eVerbs.push('rename');
            if (has(/edit/i))   eVerbs.push('edit');
            if (has(/move/i))   eVerbs.push('move');
            if (has(/updat/i))  eVerbs.push('update');
            return (eVerbs.length ? capFirst(eVerbs.join(', ')) + ' items inline' : 'Edit and update items') + '.';
        case 'delete':
            var dParts = [];
            if (has(/confirm/i)) dParts.push('confirmation before deletion');
            if (has(/cancel/i))  dParts.push('cancel in-progress operations');
            if (has(/archiv/i))  dParts.push('archive support');
            return 'Delete and manage items' + (dParts.length ? ' with ' + dParts.join(', ') : '') + '.';
        case 'search':
            var sParts = [];
            if (has(/filter/i))          sParts.push('filter');
            if (has(/sort/i))            sParts.push('sort');
            if (has(/drag.?and.?drop/i)) sParts.push('drag-and-drop import');
            if (has(/invalid/i))         sParts.push('invalid file type handling');
            return 'Search' + (sParts.length ? ', ' + sParts.join(', ') : '') + ' across content.';
        case 'ui':
            var uParts = [];
            if (has(/hover/i))                uParts.push('hover actions');
            if (has(/read.?unread/i))         uParts.push('read/unread toggles');
            if (has(/right.?click|context/i)) uParts.push('right-click context menus');
            if (has(/select/i))               uParts.push('multi-select');
            return 'UI interactions: ' + (uParts.length ? uParts.join(', ') : 'visual states and layout') + '.';
        case 'create':
            var cVerbs = [];
            if (has(/reply.?all/i)) cVerbs.push('reply-all');
            else if (has(/reply/i)) cVerbs.push('reply');
            if (has(/forward/i))    cVerbs.push('forward');
            if (has(/archiv/i))     cVerbs.push('archive');
            if (has(/delet/i))      cVerbs.push('delete');
            if (has(/move/i))       cVerbs.push('move');
            if (has(/tag/i))        cVerbs.push('tag');
            return (cVerbs.length ? capFirst(cVerbs.slice(0, 5).join(', ')) + ' actions available' : 'Content actions available') + '.';
        case 'notify':
            var nParts = [];
            if (has(/inline image/i))   nParts.push('inline image rendering');
            if (has(/text selection/i)) nParts.push('text selection');
            if (has(/reply/i))          nParts.push('reply interactions');
            return (nParts.length ? capFirst(nParts.join(', ')) : 'Notifications and alerts') + '.';
        case 'error':
            var eTypes = [];
            if (has(/invalid/i))    eTypes.push('invalid input');
            if (has(/empty/i))      eTypes.push('empty states');
            if (has(/duplic/i))     eTypes.push('duplicates');
            if (has(/large|10gb/i)) eTypes.push('large files');
            return 'Edge case handling: ' + (eTypes.length ? eTypes.join(', ') : 'errors and boundary conditions') + '.';
        case 'perf':
            return 'Performance and load testing.';
        case 'misc':
        default:
            /* First try keyword extraction — works for any feature domain */
            var topKws = extractTopKeywords(scenarios, 4);
            if (topKws.length >= 1) {
                return topKws.join(', ') + '.';
            }
            /* Final hard-coded fallbacks for a small set of known misc patterns */
            var mParts = [];
            if (has(/mount/i))                mParts.push('simultaneous mounting');
            if (has(/maximum|limit|\b20\b/i)) mParts.push('item/folder limits');
            if (has(/duplic/i))               mParts.push('duplicate detection');
            if (has(/account/i))              mParts.push('account organisation');
            if (has(/delegat/i))              mParts.push('delegated accounts');
            return mParts.length ? capFirst(mParts.join(', ')) + '.' : 'General application functionality.';
    }
}

/**
 * Convert a list of named use-case / feature-area labels into concise capability bullets.
 * Bullets are sorted by test-case count (most-tested areas first) so the most important
 * areas appear at the top.  When there are more use-cases than maxCaps, the last bullet
 * mentions how many additional areas are covered.
 *
 * @param {string[]} ucList   - Distinct, non-empty use-case names.
 * @param {Object}   ucCounts - Map of { useCase: count }.
 * @param {number}   maxCaps  - Maximum number of bullet strings to return.
 * @returns {string[]}
 */
function useCasesToCapabilities(ucList, ucCounts, maxCaps) {
    /* Sort: highest test-case count first, then alphabetical for ties */
    var sorted = ucList.slice().sort(function (a, b) {
        var diff = (ucCounts[b] || 0) - (ucCounts[a] || 0);
        return diff !== 0 ? diff : a.localeCompare(b);
    });

    var shown    = sorted.slice(0, maxCaps);
    var overflow = sorted.length - shown.length;
    var caps     = [];

    shown.forEach(function (uc, i) {
        var isLast = (i === shown.length - 1);
        if (isLast && overflow > 0) {
            caps.push(capFirst(uc) + ' — and ' + overflow +
                      ' more feature area' + (overflow > 1 ? 's' : '') + '.');
        } else {
            caps.push(capFirst(uc) + '.');
        }
    });

    return caps;
}

/* ─────────────────────────────────────────────
   Built-in summarisation engine
   Produces a brief user-story narrative (≤ 15 lines, < 2 min read).
   No category headers — just an intro sentence and a short
   capability bullet per functional area.
───────────────────────────────────────────── */
function builtInSummarise(rows, cols, stats) {
    var groups = groupByUseCase(rows, cols);

    /* Collect all unique scenario texts across every use-case group.
     * Primary source: test-case name / title (cols.testCase, cols.testCaseId).
     * Fallback: when those columns are absent or contain only bare IDs (e.g. "TC001"),
     * also pull in text from the steps or expected-result columns so that theme-based
     * keyword analysis has meaningful content to work with on any file format. */
    var allScenarios = [];
    groups.forEach(function (ucRows) {
        ucRows.forEach(function (r) {
            var name = (cols.testCase   ? String(r[cols.testCase]   || '') : '').trim()
                    || (cols.testCaseId ? String(r[cols.testCaseId] || '') : '').trim();
            /* If the name looks like a bare ID (e.g. "TC001", "1", "R-42"), supplement
             * with richer descriptive text from other columns. */
            var isIdOnly = !name || SUM_ID_PATTERN.test(name);
            var text = isIdOnly
                ? ((cols.steps          ? String(r[cols.steps]          || '') : '').trim().slice(0, SUM_MAX_FALLBACK_TEXT)
                || (cols.expectedResult ? String(r[cols.expectedResult] || '') : '').trim().slice(0, SUM_MAX_FALLBACK_TEXT)
                || name)
                : name;
            if (text && allScenarios.indexOf(text) === -1) allScenarios.push(text);
        });
    });

    /* Detect main subject */
    var subject = detectSumSubject(allScenarios);

    /* Collect named feature areas and their test-case counts */
    var ucList = stats.useCases.filter(function (uc) { return uc && uc !== '(No Use Case)'; });
    var ucCounts = {};
    if (cols.useCase) {
        rows.forEach(function (row) {
            var uc = String(row[cols.useCase] || '').trim();
            if (uc) ucCounts[uc] = (ucCounts[uc] || 0) + 1;
        });
    }

    var capabilities = [];

    if (ucList.length >= 3) {
        /*
         * Strategy 1 — named feature areas (most accurate, content-driven).
         * The use-case / feature-area column already contains the real capability
         * names supplied by the author of the test suite.  Surface the top N
         * areas sorted by test coverage so stakeholders see the most important
         * areas first.
         */
        capabilities = useCasesToCapabilities(ucList, ucCounts, SUM_MAX_CAPABILITIES);
    } else {
        /*
         * Strategy 2 — theme-based keyword analysis (fallback when no named
         * feature areas are present or too few to be meaningful).
         */
        var themeGroups = groupScenariosByTheme(allScenarios);
        themeGroups.slice(0, SUM_MAX_CAPABILITIES).forEach(function (g) {
            var cap = themeCapability(g.key, g.list);
            if (cap) capabilities.push(cap);
        });
    }

    /* Build a single intro sentence.
     * Priority order:
     *  1. 1 named use-case area  → name it explicitly (most reliable for single-area files).
     *  2. 2 named use-case areas → name both (more reliable than a keyword guess).
     *  3. Detected subject keyword (any # of named areas or no use-case column).
     *  4. Count of named areas with a sample list.
     *  5. Generic scenario count fallback. */
    var ucListFull = stats.useCases;
    var intro;
    if (ucList.length === 1) {
        intro = '<strong>' + escSum(ucList[0]) + '</strong> feature validated across ' +
                '<strong>' + rows.length + ' scenario' + (rows.length !== 1 ? 's' : '') + '</strong>' +
                (capabilities.length > 0 ? ' — key capabilities below.' : '.');
    } else if (ucList.length === 2) {
        intro = '<strong>' + escSum(ucList[0]) + '</strong> and <strong>' + escSum(ucList[1]) +
                '</strong> validated across ' +
                '<strong>' + rows.length + ' scenario' + (rows.length !== 1 ? 's' : '') + '</strong>' +
                (capabilities.length > 0 ? ' — key capabilities below.' : '.');
    } else if (subject) {
        intro = '<strong>' + escSum(subject) + '</strong> feature validated across ' +
                '<strong>' + rows.length + ' scenario' + (rows.length !== 1 ? 's' : '') + '</strong>' +
                (capabilities.length > 0 ? ' — key capabilities below.' : '.');
    } else if (ucListFull.length > 0) {
        intro = 'Covers <strong>' + ucListFull.length + ' feature area' + (ucListFull.length !== 1 ? 's' : '') + '</strong>: ' +
                ucListFull.slice(0, SUM_MAX_USE_CASES_SHOWN).map(escSum).join(', ') + (ucListFull.length > SUM_MAX_USE_CASES_SHOWN ? ', and more' : '') + '.';
    } else {
        intro = 'Test suite covers <strong>' + rows.length + ' scenario' + (rows.length !== 1 ? 's' : '') + '</strong>.';
    }

    return { intro: intro, capabilities: capabilities };
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
    prompt += 'Write a **brief user-story style summary** of what this feature / product does.\n';
    prompt += 'Requirements:\n';
    prompt += '- Maximum 10–15 lines total. No categories, no headers, no numbered sections.\n';
    prompt += '- Open with 1–2 sentences describing the overall feature and its main user journey.\n';
    prompt += '- Follow with 4–6 short bullet points (one per key capability or flow).\n';
    prompt += '- Each bullet must be one concise line — describe what the user CAN DO or what the system DOES.\n';
    prompt += '- Do NOT list individual test case names, statistics, severity labels, or pass/fail numbers.\n';
    prompt += '- Plain language, easily readable by any non-technical stakeholder in under 2 minutes.\n';

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

/** Max representative scenarios shown per feature block (named or themed). */
var SUM_MAX_SCENARIOS_SHOWN = 5;

/** Max capability bullets shown in the built-in user-story narrative. */
var SUM_MAX_CAPABILITIES = 6;

/** Max use-case names shown in the intro when a use-case column is present. */
var SUM_MAX_USE_CASES_SHOWN = 3;

/** Minimum frequency for an acronym to be treated as the suite's main subject. */
var SUM_MIN_ACRONYM_FREQ = 2;

/** Minimum word length for noun extraction (excludes short prepositions, articles). */
var SUM_MIN_WORD_LENGTH = 4;

/** Minimum frequency (occurrences across scenarios) for a keyword to be surfaced. */
var SUM_MIN_KEYWORD_FREQ = 2;

/** Max characters taken from steps/expectedResult when testCase is a bare ID. */
var SUM_MAX_FALLBACK_TEXT = 200;

/** Regex that identifies a bare test-case ID (e.g. "TC001", "R-42", "1") vs a real title. */
var SUM_ID_PATTERN = /^[A-Za-z]{0,5}[-_]?\d+$/;

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
    var btnSummarise = document.getElementById('btn-summarise');
    var statusEl    = document.getElementById('sum-status');

    var secStats    = document.getElementById('sum-sec-stats');
    var secSummary  = document.getElementById('sum-sec-summary');

    var parsedRows      = null;
    var currentFileName = '';

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
        btnSummarise.disabled = true;
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
                    btnSummarise.disabled = false;
                    doSummarise();
                } catch (err) {
                    setStatus('⚠ Could not parse CSV: ' + err.message, 'error');
                    btnSummarise.disabled = true;
                }
            };
            reader.onerror = function () {
                setStatus('⚠ Could not read file. Please try again.', 'error');
                btnSummarise.disabled = true;
            };
            reader.readAsText(file);
        } else {
            if (typeof readXlsxFile === 'undefined') {
                setStatus('⚠ XLSX library not loaded. Please refresh the page.', 'error');
                btnSummarise.disabled = true;
                return;
            }
            try {
                readXlsxFile(file).then(function (rawRows) {
                    var rows = sumRowsToObjects(rawRows);
                    if (!rows.length) {
                        setStatus('⚠ The spreadsheet appears to be empty or has only a header row.', 'error');
                        btnSummarise.disabled = true;
                        return;
                    }
                    parsedRows = rows;
                    btnSummarise.disabled = false;
                    doSummarise();
                }).catch(function (err) {
                    setStatus('⚠ Could not parse file: ' + (err && err.message ? err.message : String(err)), 'error');
                    btnSummarise.disabled = true;
                });
            } catch (err) {
                setStatus('⚠ Could not read XLSX file: ' + (err && err.message ? err.message : String(err)), 'error');
                btnSummarise.disabled = true;
            }
        }
    }

    /* ── Core summarise logic (auto-triggered on upload and on button click) ── */
    function doSummarise() {
        if (!parsedRows || parsedRows.length === 0) {
            setStatus('⚠ Please upload a file first.', 'error');
            return;
        }

        btnSummarise.disabled = true;
        clearResults();

        var headers = Object.keys(parsedRows[0]);
        var cols    = detectSumColumns(headers);
        var stats   = extractSumStats(parsedRows, cols);

        try {
            setStatus('⏳ Generating summary…', 'info');
            var modelLabel  = 'Auto Analysis';
            var builtIn     = builtInSummarise(parsedRows, cols, stats);
            var summaryHtml = buildBuiltInSummaryHtml(builtIn);

            renderSumStats(stats, cols);
            renderSumSummary(summaryHtml, modelLabel);

            var ucBreakdownArr = [];
            var ucGroups = groupByUseCase(parsedRows, cols);
            ucGroups.forEach(function (ucRows, ucName) {
                ucBreakdownArr.push({ name: ucName, count: ucRows.length });
            });
            saveToSumHistory(currentFileName, modelLabel, stats, summaryHtml, ucBreakdownArr);

            setStatus('✔ Summary complete.', 'success');

            // Scroll results into view so the user can see them
            if (secStats) {
                secStats.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            setStatus('⚠ ' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
            btnSummarise.disabled = false;
        }
    }

    /* ── Summarise button (re-runs the summary on demand) ── */
    btnSummarise.addEventListener('click', function () {
        doSummarise();
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
        if (builtIn.capabilities && builtIn.capabilities.length > 0) {
            html += '<ul class="sum-capability-list">';
            builtIn.capabilities.forEach(function (cap) {
                html += '<li>' + escSum(cap) + '</li>';
            });
            html += '</ul>';
        }
        return html;
    }

    /* ── Init: nothing to do on load ── */
}());
