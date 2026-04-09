/**
 * zoho-workboard-ai.js
 * Powers the "Zoho Workboard AI" tab in Test Case Assist.
 *
 * Features:
 *  - Interactive live demo/preview of the Zia AI Assistant widget
 *  - Blueprint stage simulator (select any stage and see the required fields + guidance)
 *  - Setup guide (step-by-step deployment checklist)
 *  - Configuration export (copy-paste widget manifest)
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   Blueprint stage data (mirrors zoho-crm-widget/app.js)
───────────────────────────────────────────────────────────── */
var ZWA_BLUEPRINT = {
  'Open': {
    label: 'Open',
    color: '#1a73e8',
    requiredFields: [
      { name: 'Workboard Name',    hint: 'A clear, descriptive title for this workboard item.' },
      { name: 'Description',       hint: 'Summarise what needs to be built or analysed.' },
      { name: 'Priority',          hint: 'Set the business priority: High / Medium / Low.' },
      { name: 'Owner',             hint: 'Assign the person responsible for driving this item.' },
    ],
    optionalFields: [
      { name: 'Related Module',    hint: 'Which CRM module or feature area does this relate to?' },
      { name: 'Due Date',          hint: 'Target completion date for the initial analysis.' },
    ],
    nextTransitions: ['Start Initial Analysis', 'Exit Blueprint', 'Skip Initial Analysis'],
    guidance: 'Begin by filling in a clear <strong>Workboard Name</strong> and concise <strong>Description</strong>. Set the <strong>Priority</strong> with stakeholders, then click <strong>"Start Initial Analysis"</strong> to progress the blueprint.',
    suggestions: [
      { title: 'Writing a good description', body: 'Use: "As a [user], I need [capability] so that [goal]." This makes scope clear to analysts and developers.' },
      { title: 'Priority guidelines', body: '<strong>High</strong> = blocks release or a customer. <strong>Medium</strong> = important but has a workaround. <strong>Low</strong> = enhancement or cosmetic.' },
    ],
  },
  'Initial Analysis In Progress': {
    label: 'Initial Analysis In Progress',
    color: '#f57c00',
    requiredFields: [
      { name: 'Initial Analysis Notes',  hint: 'Document findings: scope, risks, dependencies, and effort estimate.' },
      { name: 'Estimated Effort (days)', hint: 'Provide a realistic story-point or day estimate.' },
      { name: 'Impacted Modules',        hint: 'List all CRM modules or external systems affected.' },
    ],
    optionalFields: [
      { name: 'Risk Level',          hint: 'Flag technical or business risks identified.' },
      { name: 'External References', hint: 'Links to specs, Confluence pages, or reference tickets.' },
    ],
    nextTransitions: ['Initial Analysis Completed', 'Draft Usecases In Parallel', 'Initial Analysis and Updated'],
    guidance: 'Focus on <strong>clarity over length</strong> in your analysis notes. Identify all <strong>impacted modules</strong> early to avoid rework later.',
    suggestions: [
      { title: 'Structuring analysis notes', body: '<strong>1)</strong> Objective  <strong>2)</strong> Scope  <strong>3)</strong> Solution Options  <strong>4)</strong> Risks & Dependencies  <strong>5)</strong> Effort Estimate' },
      { title: 'Effort estimation tips', body: 'Break into sub-tasks and estimate each. Add 20% buffer for integration and testing.' },
    ],
  },
  'Initial Analysis Completed': {
    label: 'Initial Analysis Completed',
    color: '#2e7d32',
    requiredFields: [
      { name: 'Analysis Summary',    hint: 'One-paragraph summary suitable for stakeholder review.' },
      { name: 'Go / No-Go Decision', hint: 'Confirm whether to proceed, defer, or mark as "Usecase Not Required".' },
      { name: 'Reviewer Sign-off',   hint: 'Record who approved the analysis outcome.' },
    ],
    optionalFields: [
      { name: 'Deferred Reason', hint: 'If deferred or rejected, explain why.' },
    ],
    nextTransitions: ['Draft Usecases', 'Usecase Not Required'],
    guidance: 'Write an <strong>Analysis Summary</strong> understandable by non-technical stakeholders. Get <strong>Reviewer Sign-off</strong> before advancing.',
    suggestions: [
      { title: 'Effective summary writing', body: 'Cover: what the change is, why it is needed, which approach was chosen, and any important constraints or risks.' },
    ],
  },
  'Usecase Preparation': {
    label: 'Usecase Preparation',
    color: '#6a1b9a',
    requiredFields: [
      { name: 'Use Case Name',   hint: 'A short verb-noun name e.g., "Create Workboard Record".' },
      { name: 'Primary Actor',   hint: 'Who initiates this use case? e.g., Sales Rep, Admin.' },
      { name: 'Preconditions',   hint: 'What must be true before the use case begins?' },
      { name: 'Main Flow',       hint: 'Step-by-step numbered description of the happy path.' },
      { name: 'Alternate Flows', hint: 'Variations and exception paths the system must handle.' },
      { name: 'Postconditions',  hint: 'State of the system after successful completion.' },
    ],
    optionalFields: [
      { name: 'Business Rules',    hint: 'Validation rules, constraints, or policies to enforce.' },
      { name: 'UI Wireframe Link', hint: 'Figma/XD link if a draft UI is available.' },
    ],
    nextTransitions: ['Usecase Documented'],
    guidance: 'Use case names should follow <strong>Verb + Object</strong> style. Be specific in <strong>Preconditions</strong> — vague preconditions lead to incomplete test cases downstream.',
    suggestions: [
      { title: 'Main flow writing guide', body: 'Write each step as "Actor does X; System responds with Y." Keep steps atomic — one action per step.' },
      { title: 'Alternate flow tip', body: 'For each field validation rule and error condition, create a separate alternate flow. This directly maps to negative test cases.' },
    ],
  },
  'Usecase Documented': {
    label: 'Usecase Documented',
    color: '#00796b',
    requiredFields: [
      { name: 'Use Case Document', hint: 'Final approved use case document (attach or link).' },
      { name: 'Review Status',     hint: 'Confirmed as Reviewed / Approved by product team.' },
      { name: 'Test Cases Linked', hint: 'Confirm test cases have been created and linked.' },
    ],
    optionalFields: [
      { name: 'Design Notes', hint: 'Constraints or notes for the UI designer.' },
    ],
    nextTransitions: ['Proceed to UI Phase', 'UI Not Required - Proceed'],
    guidance: 'Verify the <strong>Use Case Document</strong> has been peer-reviewed. Confirm <strong>test cases are linked</strong> to maintain traceability.',
    suggestions: [
      { title: 'Review checklist', body: '✓ All actors identified  ✓ Main & alternate flows complete  ✓ Postconditions defined  ✓ Product owner sign-off  ✓ Test cases created' },
    ],
  },
  'Moved to UI Phase': {
    label: 'Moved to UI Phase',
    color: '#c62828',
    requiredFields: [
      { name: 'UI Design Reference',     hint: 'Link to Figma/XD screens or attach design files.' },
      { name: 'UI Owner',                hint: 'Designer or front-end developer responsible.' },
      { name: 'UI Acceptance Criteria',  hint: 'Specific, measurable criteria the UI must meet.' },
    ],
    optionalFields: [
      { name: 'Accessibility Requirements', hint: 'WCAG level, screen-reader, colour contrast requirements.' },
      { name: 'Responsive Breakpoints',     hint: 'Required viewport sizes.' },
    ],
    nextTransitions: ['UI Completed - Proceed to Development'],
    guidance: 'Attach <strong>UI design files</strong> immediately so the developer has them when picking this up. Write <strong>UI Acceptance Criteria</strong> as testable statements.',
    suggestions: [
      { title: 'Good acceptance criteria format', body: 'GIVEN / WHEN / THEN: "GIVEN the form is empty WHEN the user clicks Submit THEN an error message is shown for each required field."' },
    ],
  },
  'Moved to Development': {
    label: 'Moved to Development',
    color: '#4527a0',
    requiredFields: [
      { name: 'Developer Assigned',  hint: 'Name of the developer picking this up.' },
      { name: 'Sprint / Milestone',  hint: 'Which sprint or release does this belong to?' },
      { name: 'Definition of Done',  hint: 'Checklist: what must be true for this item to be "done".' },
    ],
    optionalFields: [
      { name: 'Technical Notes', hint: 'Architecture decisions, API endpoints, DB schema changes.' },
      { name: 'Dependencies',    hint: 'Other tickets or services this depends on.' },
    ],
    nextTransitions: [],
    guidance: 'Set a clear <strong>Definition of Done</strong> agreed with the product owner before development starts. This is the final blueprint stage.',
    suggestions: [
      { title: 'Definition of Done example', body: '✓ Code reviewed  ✓ Unit tests written & passing  ✓ Integration tested  ✓ Docs updated  ✓ Deployed to staging  ✓ Product owner accepted' },
    ],
  },
};

var ZWA_STAGE_ORDER = [
  'Open',
  'Initial Analysis In Progress',
  'Initial Analysis Completed',
  'Usecase Preparation',
  'Usecase Documented',
  'Moved to UI Phase',
  'Moved to Development',
];

/* ─────────────────────────────────────────────────────────────
   DOM helpers
───────────────────────────────────────────────────────────── */
function zwaEl(id) { return document.getElementById(id); }

function zwaEscHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────────────────────────
   Render stage selector
───────────────────────────────────────────────────────────── */
function zwaRenderStageSelector() {
  var select = zwaEl('zwa-stage-select');
  if (!select) return;
  ZWA_STAGE_ORDER.forEach(function (stage) {
    var opt = document.createElement('option');
    opt.value       = stage;
    opt.textContent = ZWA_BLUEPRINT[stage].label;
    select.appendChild(opt);
  });
}

/* ─────────────────────────────────────────────────────────────
   Render demo panel for selected stage
───────────────────────────────────────────────────────────── */
function zwaRenderDemo(stageName) {
  var def = ZWA_BLUEPRINT[stageName];
  if (!def) return;

  // Stage badge
  var badge = zwaEl('zwa-demo-stage-badge');
  if (badge) {
    badge.textContent        = def.label;
    badge.style.background   = def.color + '22';
    badge.style.color        = def.color;
    badge.style.borderColor  = def.color + '55';
  }

  // Guidance
  var guidanceEl = zwaEl('zwa-demo-guidance');
  if (guidanceEl) guidanceEl.innerHTML = def.guidance;

  // Required fields
  var fieldsEl = zwaEl('zwa-demo-fields');
  if (fieldsEl) {
    var html = '';
    def.requiredFields.forEach(function (f) {
      html += '<div class="zwa-field-row">' +
        '<span class="zwa-field-required-dot" title="Required">●</span>' +
        '<div><strong class="zwa-field-name">' + zwaEscHtml(f.name) + '</strong>' +
        '<div class="zwa-field-hint">' + zwaEscHtml(f.hint) + '</div></div>' +
        '</div>';
    });
    if (def.optionalFields.length) {
      html += '<div class="zwa-optional-header">Optional</div>';
      def.optionalFields.forEach(function (f) {
        html += '<div class="zwa-field-row zwa-field-optional">' +
          '<span class="zwa-field-optional-dot" title="Optional">○</span>' +
          '<div><strong class="zwa-field-name">' + zwaEscHtml(f.name) + '</strong>' +
          '<div class="zwa-field-hint">' + zwaEscHtml(f.hint) + '</div></div>' +
          '</div>';
      });
    }
    fieldsEl.innerHTML = html;
  }

  // Suggestions
  var suggestEl = zwaEl('zwa-demo-suggestions');
  if (suggestEl) {
    var sHtml = '';
    // s.body is static trusted markup defined in ZWA_BLUEPRINT above (never user-supplied).
    def.suggestions.forEach(function (s) {
      sHtml += '<div class="zwa-suggestion-item">' +
        '<strong>' + zwaEscHtml(s.title) + '</strong>' +
        '<p>' + s.body + '</p>' +
        '</div>';
    });
    suggestEl.innerHTML = sHtml;
  }

  // Next transitions
  var transEl = zwaEl('zwa-demo-transitions');
  if (transEl) {
    if (def.nextTransitions.length) {
      transEl.innerHTML = def.nextTransitions.map(function (t) {
        return '<span class="zwa-transition-badge">' + zwaEscHtml(t) + '</span>';
      }).join('');
    } else {
      transEl.innerHTML = '<span class="zwa-transition-badge zwa-transition-final">🏁 Final Stage</span>';
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   Blueprint flow diagram (text-based)
───────────────────────────────────────────────────────────── */
function zwaRenderBlueprintFlow(activeStage) {
  var container = zwaEl('zwa-flow-container');
  if (!container) return;

  var html = '<div class="zwa-flow">';
  ZWA_STAGE_ORDER.forEach(function (stage, idx) {
    var def    = ZWA_BLUEPRINT[stage];
    var active = (stage === activeStage);
    html += '<div class="zwa-flow-step' + (active ? ' zwa-flow-step-active' : '') + '" data-stage="' + zwaEscHtml(stage) + '">' +
      '<div class="zwa-flow-dot" style="border-color:' + def.color + ';background:' + (active ? def.color : 'transparent') + '"></div>' +
      '<div class="zwa-flow-label" style="color:' + (active ? def.color : '') + '">' + zwaEscHtml(def.label) + '</div>' +
      '</div>';
    if (idx < ZWA_STAGE_ORDER.length - 1) {
      html += '<div class="zwa-flow-arrow">↓</div>';
    }
  });
  html += '</div>';
  container.innerHTML = html;

  // Make stages clickable
  container.querySelectorAll('.zwa-flow-step').forEach(function (step) {
    step.addEventListener('click', function () {
      var s = step.getAttribute('data-stage');
      if (zwaEl('zwa-stage-select')) zwaEl('zwa-stage-select').value = s;
      zwaRenderDemo(s);
      zwaRenderBlueprintFlow(s);
    });
  });
}

/* ─────────────────────────────────────────────────────────────
   Setup guide tab
───────────────────────────────────────────────────────────── */
var ZWA_SETUP_STEPS = [
  {
    icon: '📦',
    title: 'Download the Widget Package',
    body: 'Clone or download this repository. The <code>zoho-crm-widget/</code> folder contains all widget files: <code>index.html</code>, <code>app.js</code>, <code>app.css</code>, and <code>widgetManifest.json</code>.',
    action: null,
  },
  {
    icon: '🗜️',
    title: 'Package as a ZIP file',
    body: 'Compress the contents of <code>zoho-crm-widget/</code> into a ZIP file (not the folder itself — zip the files inside). Name it <code>workboard-zia-assistant.zip</code>.',
    action: null,
  },
  {
    icon: '🔧',
    title: 'Upload the Widget to Zoho CRM',
    body: 'In Zoho CRM: <strong>Setup → Developer Space → Widgets → + New Widget</strong>.<br>Select <em>Custom Widget</em>, set Module = <em>Workboard</em>, upload the ZIP, and save. Copy the Widget ID shown.',
    action: null,
  },
  {
    icon: '🔑',
    title: 'Configure the Zia OAuth Connection',
    body: 'In Zoho CRM: <strong>Setup → Developer Space → Connections → + Add Connection</strong>.<br>Name it <code>zia_connection</code>, select <em>Zoho OAuth</em>, and add the scope <code>ZohoZia.assistant.EXECUTE</code>. Authorise the connection.',
    action: null,
  },
  {
    icon: '📝',
    title: 'Update the Widget ID in client-script.js',
    body: 'Open <code>zoho-crm-widget/client-script.js</code> and replace <code>YOUR_WIDGET_ID_HERE</code> with the Widget ID from Step 3.',
    action: null,
  },
  {
    icon: '💻',
    title: 'Deploy the Client Script',
    body: 'In Zoho CRM: <strong>Setup → Developer Space → Client Script → Create New Script</strong>.<br>Set Module = <em>Workboard</em>, Event = <em>Page Load – Detail</em>. Paste the updated contents of <code>client-script.js</code>. Save and activate.',
    action: null,
  },
  {
    icon: '✅',
    title: 'Verify the Integration',
    body: 'Open any Workboard record in Zoho CRM. You should see the ✨ <strong>Zia AI icon</strong> appear in the bottom-right corner. Click it to open the AI Assistant panel and confirm it shows the blueprint stage, required fields, and guidance.',
    action: null,
  },
];

function zwaRenderSetupGuide() {
  var container = zwaEl('zwa-setup-steps');
  if (!container) return;
  var html = '';
  ZWA_SETUP_STEPS.forEach(function (step, idx) {
    html += '<div class="zwa-setup-step">' +
      '<div class="zwa-step-num">' + (idx + 1) + '</div>' +
      '<div class="zwa-step-body">' +
      '<div class="zwa-step-header"><span class="zwa-step-icon">' + step.icon + '</span><strong>' + step.title + '</strong></div>' +
      '<div class="zwa-step-desc">' + step.body + '</div>' +
      '</div>' +
      '</div>';
  });
  container.innerHTML = html;
}

/* ─────────────────────────────────────────────────────────────
   Tab switching for ZWA tab
───────────────────────────────────────────────────────────── */
function zwaActivateTab(tabId) {
  document.querySelectorAll('.zwa-tab-btn').forEach(function (t) {
    var active = (t.id === tabId);
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.zwa-tab-pane').forEach(function (p) {
    var controls = document.getElementById(tabId) && document.getElementById(tabId).getAttribute('aria-controls');
    p.hidden = (p.id !== controls);
  });
}

/* ─────────────────────────────────────────────────────────────
   Copy to clipboard helper
───────────────────────────────────────────────────────────── */
function zwaCopyText(text, btnEl) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function () {
      var orig = btnEl.textContent;
      btnEl.textContent = '✓ Copied!';
      setTimeout(function () { btnEl.textContent = orig; }, 2000);
    }).catch(function () {
      var orig = btnEl.textContent;
      btnEl.textContent = '✗ Copy failed';
      setTimeout(function () { btnEl.textContent = orig; }, 2000);
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   Initialise
───────────────────────────────────────────────────────────── */
(function zwaInit() {
  // Wait for DOM
  var ready = document.readyState === 'loading'
    ? new Promise(function (res) { document.addEventListener('DOMContentLoaded', res); })
    : Promise.resolve();

  ready.then(function () {
    zwaRenderStageSelector();
    zwaRenderSetupGuide();

    var initialStage = ZWA_STAGE_ORDER[0];
    zwaRenderDemo(initialStage);
    zwaRenderBlueprintFlow(initialStage);

    // Stage selector change
    var sel = zwaEl('zwa-stage-select');
    if (sel) {
      sel.addEventListener('change', function () {
        zwaRenderDemo(sel.value);
        zwaRenderBlueprintFlow(sel.value);
      });
    }

    // Tab buttons
    document.querySelectorAll('.zwa-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { zwaActivateTab(btn.id); });
    });

    // Copy manifest button
    var copyBtn = zwaEl('zwa-copy-manifest-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var manifestEl = zwaEl('zwa-manifest-code');
        if (manifestEl) zwaCopyText(manifestEl.textContent, copyBtn);
      });
    }
  });
}());
