/**
 * app.js – Workboard Zia AI Assistant Widget
 *
 * Integrates with Zoho CRM via the Embedded App SDK to:
 *  1. Read the current Workboard record and its blueprint stage
 *  2. Display stage-aware required-field checklists
 *  3. Provide AI-powered guidance via Zoho Zia
 *  4. Accept free-text questions and answer them in-context
 *
 * Prerequisites (configured in Zoho CRM):
 *  - Widget uploaded and associated with the Workboard module (Record Detail page)
 *  - OAuth Connection "zia_connection" with scope ZohoZia.assistant.EXECUTE
 *  - OAuth Connection "crm_connection" with scope ZohoCRM.modules.workboard.READ
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   Blueprint stage definitions
   Each stage maps to: required fields, optional fields,
   next transitions, and AI guidance text.
───────────────────────────────────────────────────────────── */
var BLUEPRINT = {
  'Open': {
    label: 'Open',
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
    guidance: [
      'Begin by filling in a clear <strong>Workboard Name</strong> and concise <strong>Description</strong> so the team understands the scope immediately.',
      'Set a realistic <strong>Priority</strong> in collaboration with stakeholders before moving to analysis.',
      'When ready, click <strong>"Start Initial Analysis"</strong> to progress the blueprint.',
    ],
    suggestions: [
      { title: 'Writing a good description', body: 'Use the format: "As a [user], I need [capability] so that [goal]." This makes the scope clear to analysts and developers.' },
      { title: 'Priority guidelines', body: 'High = blocks release or a customer. Medium = important but has a workaround. Low = enhancement or cosmetic.' },
      { title: 'Skipping initial analysis', body: 'Only use "Skip Initial Analysis" for trivial or pre-approved changes where analysis has already been done offline.' },
    ],
  },

  'Initial Analysis In Progress': {
    label: 'Initial Analysis In Progress',
    requiredFields: [
      { name: 'Initial Analysis Notes',  hint: 'Document findings: scope, risks, dependencies, and effort estimate.' },
      { name: 'Estimated Effort (days)', hint: 'Provide a realistic story-point or day estimate for the work.' },
      { name: 'Impacted Modules',        hint: 'List all CRM modules or external systems affected.' },
    ],
    optionalFields: [
      { name: 'Risk Level',          hint: 'Flag any technical or business risks identified.' },
      { name: 'External References', hint: 'Links to specs, Confluence pages, or reference tickets.' },
    ],
    nextTransitions: ['Initial Analysis Completed', 'Draft Usecases In Parallel', 'Initial Analysis and Updated'],
    guidance: [
      'Focus on <strong>clarity over length</strong> in your analysis notes — bullet points beat paragraphs.',
      'Identify all <strong>impacted modules</strong> early; missed dependencies are a leading cause of rework.',
      'Once analysis is done, use <strong>"Initial Analysis Completed"</strong> to advance, or <strong>"Draft Usecases In Parallel"</strong> if use-case work can start simultaneously.',
    ],
    suggestions: [
      { title: 'Structuring analysis notes', body: 'Structure your notes as: 1) Objective, 2) Scope, 3) Approach / Solution Options, 4) Risks & Dependencies, 5) Effort Estimate.' },
      { title: 'Effort estimation tips', body: 'Break the work into sub-tasks and estimate each. Add 20% buffer for integration and testing overhead.' },
      { title: 'Parallel use-case drafting', body: 'If the scope is clear and stable, start drafting use cases while analysis is still in progress to save time.' },
    ],
  },

  'Initial Analysis Completed': {
    label: 'Initial Analysis Completed',
    requiredFields: [
      { name: 'Analysis Summary',   hint: 'One-paragraph summary suitable for stakeholder review.' },
      { name: 'Go / No-Go Decision', hint: 'Confirm whether to proceed, defer, or mark as "Usecase Not Required".' },
      { name: 'Reviewer Sign-off',  hint: 'Record who approved the analysis outcome.' },
    ],
    optionalFields: [
      { name: 'Deferred Reason', hint: 'If deferred or rejected, explain why.' },
    ],
    nextTransitions: ['Draft Usecases', 'Usecase Not Required'],
    guidance: [
      'Write an <strong>Analysis Summary</strong> that a non-technical stakeholder can understand in under two minutes.',
      'Get explicit <strong>Reviewer Sign-off</strong> before advancing — this is the gate before significant use-case effort is invested.',
      'If this item has no use cases, transition to <strong>"Usecase Not Required"</strong> with a clear reason.',
    ],
    suggestions: [
      { title: 'Effective summary writing', body: 'Cover: what the change is, why it is needed, what approach was chosen, and any important constraints or risks.' },
      { title: 'Sign-off best practice', body: 'Use the Reviewer Sign-off field to capture the approver\'s name and date. This provides an audit trail.' },
    ],
  },

  'Usecase Preparation': {
    label: 'Usecase Preparation',
    requiredFields: [
      { name: 'Use Case Name',     hint: 'A short, verb-noun name e.g., "Create Workboard Record".' },
      { name: 'Primary Actor',     hint: 'Who initiates this use case? e.g., Sales Rep, Admin.' },
      { name: 'Preconditions',     hint: 'What must be true before the use case begins?' },
      { name: 'Main Flow',         hint: 'Step-by-step numbered description of the happy path.' },
      { name: 'Alternate Flows',   hint: 'Variations and exception paths the system must handle.' },
      { name: 'Postconditions',    hint: 'What is the state of the system after successful completion?' },
    ],
    optionalFields: [
      { name: 'Business Rules',    hint: 'Any validation rules, constraints, or policies to enforce.' },
      { name: 'UI Wireframe Link', hint: 'Figma/XD link if a draft UI is available.' },
    ],
    nextTransitions: ['Usecase Documented'],
    guidance: [
      'Use case names should follow <strong>Verb + Object</strong> style: "Submit Analysis", "Update Record Status".',
      'Be specific in <strong>Preconditions</strong> — vague preconditions lead to incomplete test cases downstream.',
      'Cover at least one <strong>Alternate Flow</strong> per business rule to ensure edge cases are handled.',
    ],
    suggestions: [
      { title: 'Main flow writing guide', body: 'Write each step as "Actor does X; System responds with Y." Keep steps atomic — one action per step.' },
      { title: 'Alternate flow tip', body: 'For each field validation rule and each error condition, create a separate alternate flow. This directly maps to negative test cases.' },
      { title: 'Use case quality check', body: 'A good use case can be handed to a developer AND a tester independently, and both understand exactly what to build and test.' },
    ],
  },

  'Usecase Documented': {
    label: 'Usecase Documented',
    requiredFields: [
      { name: 'Use Case Document',  hint: 'Final approved use case document (attach or link).' },
      { name: 'Review Status',      hint: 'Confirmed as Reviewed / Approved by product team.' },
      { name: 'Test Cases Linked',  hint: 'Confirm test cases have been created and linked.' },
    ],
    optionalFields: [
      { name: 'Design Notes',       hint: 'Any constraints or notes for the UI designer.' },
    ],
    nextTransitions: ['Proceed to UI Phase', 'UI Not Required - Proceed'],
    guidance: [
      'Ensure the <strong>Use Case Document</strong> has been peer-reviewed and all comments resolved before advancing.',
      'Verify that test cases are <strong>linked to this workboard record</strong> — this maintains traceability.',
      'If no UI work is needed (e.g., backend/API-only), use <strong>"UI Not Required - Proceed"</strong> to skip the UI phase.',
    ],
    suggestions: [
      { title: 'Document review checklist', body: '✓ All actors identified  ✓ Main and alternate flows complete  ✓ Postconditions defined  ✓ Reviewed by product owner  ✓ Test cases created' },
      { title: 'Traceability tip', body: 'Link test cases to this workboard record using the related list. This enables impact analysis when requirements change.' },
    ],
  },

  'Moved to UI Phase': {
    label: 'Moved to UI Phase',
    requiredFields: [
      { name: 'UI Design Reference',  hint: 'Link to Figma/Adobe XD screens or attach design files.' },
      { name: 'UI Owner',             hint: 'Designer or front-end developer responsible.' },
      { name: 'UI Acceptance Criteria', hint: 'Specific, measurable criteria the UI must meet.' },
    ],
    optionalFields: [
      { name: 'Accessibility Requirements', hint: 'WCAG level, screen-reader requirements, colour contrast.' },
      { name: 'Responsive Breakpoints',     hint: 'Specify required viewport sizes.' },
    ],
    nextTransitions: ['UI Completed - Proceed to Development'],
    guidance: [
      'Attach or link <strong>UI design files</strong> immediately so the developer has them when picking this up.',
      'Write <strong>UI Acceptance Criteria</strong> as testable statements: "The button is disabled until all required fields are filled."',
      'Include <strong>Accessibility Requirements</strong> upfront — retrofitting is significantly more expensive.',
    ],
    suggestions: [
      { title: 'Good acceptance criteria format', body: 'Use GIVEN / WHEN / THEN: "GIVEN the form is empty WHEN the user clicks Submit THEN an error message is shown for each required field."' },
      { title: 'Handoff checklist', body: '✓ All screens exported  ✓ Component states defined (default, hover, active, error, disabled)  ✓ Spacing/typography specs included  ✓ Asset exports ready' },
    ],
  },

  'Moved to Development': {
    label: 'Moved to Development',
    requiredFields: [
      { name: 'Developer Assigned',     hint: 'Name of the developer picking this up.' },
      { name: 'Sprint / Milestone',     hint: 'Which sprint or release does this belong to?' },
      { name: 'Definition of Done',     hint: 'Checklist of what must be true for this to be "done".' },
    ],
    optionalFields: [
      { name: 'Technical Notes',        hint: 'Architecture decisions, API endpoints, DB schema changes.' },
      { name: 'Dependencies',           hint: 'Other tickets or services this depends on.' },
    ],
    nextTransitions: [],
    guidance: [
      'Set a clear <strong>Definition of Done</strong> agreed with the product owner before development starts.',
      'Note any <strong>technical dependencies</strong> that could block progress — surface these in the next stand-up.',
      'This is the final blueprint stage — ensure all previous documentation is complete and linked.',
    ],
    suggestions: [
      { title: 'Definition of Done example', body: '✓ Code reviewed  ✓ Unit tests written and passing  ✓ Integration tested  ✓ Documentation updated  ✓ Deployed to staging  ✓ Product owner accepted' },
      { title: 'Reducing rework', body: 'Read the use case document and UI specs thoroughly before writing a single line of code. Clarify ambiguities before starting, not during.' },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────
   Fallback / generic responses from Zia
───────────────────────────────────────────────────────────── */
var ZIA_FALLBACK_RESPONSES = [
  'I can help you with fields, transitions, and best practices for this workboard stage. Could you be more specific about what you need?',
  'Based on the current blueprint stage, make sure all required fields are filled before triggering the next transition.',
  'If you\'re unsure about a field, hover over it in Zoho CRM for the field description, or consult the use case document linked to this record.',
  'For complex queries, consider using the Zoho CRM AI panel (Zia icon in the top bar) for a global perspective.',
];

/* ─────────────────────────────────────────────────────────────
   Keyword-based intent matching for offline / mock responses
───────────────────────────────────────────────────────────── */
var INTENT_PATTERNS = [
  {
    patterns: ['next step', 'what next', 'how to proceed', 'transition', 'advance'],
    respond: function (stage) {
      var s = BLUEPRINT[stage];
      if (!s) return 'Complete all required fields for the current stage before advancing.';
      if (!s.nextTransitions.length) return 'This is the final stage. Ensure all fields are filled and the Definition of Done is met.';
      return 'For the <strong>' + s.label + '</strong> stage, the available transitions are:<ul>' +
        s.nextTransitions.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
        '</ul>Complete all required fields above before triggering a transition.';
    },
  },
  {
    patterns: ['required field', 'what fields', 'fill in', 'mandatory'],
    respond: function (stage) {
      var s = BLUEPRINT[stage];
      if (!s) return 'I could not detect the current stage. Please refresh the widget.';
      return 'Required fields for <strong>' + s.label + '</strong>:<ul>' +
        s.requiredFields.map(function (f) { return '<li><strong>' + f.name + '</strong> – ' + f.hint + '</li>'; }).join('') +
        '</ul>';
    },
  },
  {
    patterns: ['suggest', 'tip', 'advice', 'best practice', 'recommendation'],
    respond: function (stage) {
      var s = BLUEPRINT[stage];
      if (!s || !s.suggestions.length) return 'Follow the required fields checklist and standard Zoho CRM best practices for this stage.';
      var idx = Math.floor(Math.random() * s.suggestions.length);
      return '<strong>' + s.suggestions[idx].title + '</strong><br>' + s.suggestions[idx].body;
    },
  },
  {
    patterns: ['guide', 'help', 'what should i do', 'what to do'],
    respond: function (stage) {
      var s = BLUEPRINT[stage];
      if (!s) return 'Fill in all required fields and use the appropriate blueprint transition to move forward.';
      return s.guidance.join('<br><br>');
    },
  },
];

/* ─────────────────────────────────────────────────────────────
   State
───────────────────────────────────────────────────────────── */
var state = {
  recordId: null,
  recordData: null,
  currentStage: null,
  panelOpen: false,
};

/* ─────────────────────────────────────────────────────────────
   DOM helpers
───────────────────────────────────────────────────────────── */
function el(id) { return document.getElementById(id); }

function appendMessage(role, html) {
  var chat = el('zia-chat-area');
  var msg = document.createElement('div');
  msg.className = 'zia-message ' + (role === 'user' ? 'zia-user' : 'zia-bot');

  var avatar = document.createElement('div');
  avatar.className = 'zia-avatar';
  avatar.textContent = role === 'user' ? '🧑' : '🤖';

  var bubble = document.createElement('div');
  bubble.className = 'zia-bubble';
  bubble.innerHTML = html;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  return msg;
}

function showTypingIndicator() {
  var msg = document.createElement('div');
  msg.className = 'zia-message zia-bot zia-typing';
  msg.id = 'zia-typing';
  msg.innerHTML = '<div class="zia-avatar">🤖</div><div class="zia-bubble"><div class="zia-dot"></div><div class="zia-dot"></div><div class="zia-dot"></div></div>';
  el('zia-chat-area').appendChild(msg);
  el('zia-chat-area').scrollTop = el('zia-chat-area').scrollHeight;
}

function hideTypingIndicator() {
  var t = el('zia-typing');
  if (t) t.remove();
}

/* ─────────────────────────────────────────────────────────────
   Panel open / close
───────────────────────────────────────────────────────────── */
function openPanel() {
  el('zia-panel').hidden = false;
  state.panelOpen = true;
  el('zia-user-input').focus();
}

function closePanel() {
  el('zia-panel').hidden = true;
  state.panelOpen = false;
}

/* ─────────────────────────────────────────────────────────────
   Tab switching
───────────────────────────────────────────────────────────── */
function activateTab(tabId) {
  var tabs  = document.querySelectorAll('.zia-tab');
  var panes = document.querySelectorAll('.zia-pane');
  tabs.forEach(function (t) {
    var active = (t.id === tabId);
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  panes.forEach(function (p) {
    var controls = document.getElementById(tabId).getAttribute('aria-controls');
    p.hidden = (p.id !== controls);
  });
}

/* ─────────────────────────────────────────────────────────────
   Blueprint stage rendering
───────────────────────────────────────────────────────────── */
function renderStage(stageName) {
  state.currentStage = stageName;
  var badge = el('zia-stage-badge');
  var def = BLUEPRINT[stageName];
  badge.textContent = def ? def.label : stageName || 'Unknown Stage';

  renderRequiredFields(stageName);
  renderSuggestions(stageName);
  renderGuideIntro(stageName);
}

function renderRequiredFields(stageName) {
  var container = el('zia-required-list');
  var def = BLUEPRINT[stageName];
  if (!def) {
    container.innerHTML = '<p class="zia-loading-text">No field data found for stage "' + stageName + '".</p>';
    return;
  }

  var html = '';
  def.requiredFields.forEach(function (f) {
    var filled = state.recordData && state.recordData[f.name] ? 'filled' : 'missing';
    html += '<div class="zia-field-card">' +
      '<div class="zia-field-name">' + escHtml(f.name) + '</div>' +
      '<div class="zia-field-hint">' + escHtml(f.hint) + '</div>' +
      '<span class="zia-field-status ' + filled + '">' + (filled === 'filled' ? '✓ Filled' : '✗ Missing') + '</span>' +
      '</div>';
  });

  if (def.optionalFields.length) {
    html += '<div style="font-size:0.8rem;font-weight:600;color:#5f6b7c;padding:4px 0 2px">Optional</div>';
    def.optionalFields.forEach(function (f) {
      var filled = state.recordData && state.recordData[f.name] ? 'filled' : 'optional';
      html += '<div class="zia-field-card">' +
        '<div class="zia-field-name">' + escHtml(f.name) + '</div>' +
        '<div class="zia-field-hint">' + escHtml(f.hint) + '</div>' +
        '<span class="zia-field-status ' + filled + '">' + (filled === 'filled' ? '✓ Filled' : '○ Optional') + '</span>' +
        '</div>';
    });
  }

  container.innerHTML = html;
}

function renderSuggestions(stageName) {
  var container = el('zia-suggestions-list');
  var def = BLUEPRINT[stageName];
  if (!def || !def.suggestions.length) {
    container.innerHTML = '<p class="zia-loading-text">No suggestions available for this stage.</p>';
    return;
  }
  var html = '';
  def.suggestions.forEach(function (s) {
    html += '<div class="zia-suggestion-card"><strong>' + escHtml(s.title) + '</strong>' + escHtml(s.body) + '</div>';
  });
  container.innerHTML = html;
}

function renderGuideIntro(stageName) {
  var def = BLUEPRINT[stageName];
  var introHtml = def
    ? def.guidance.map(function (g) { return g; }).join('<br><br>')
    : 'Fill in all required fields and use the blueprint transition to advance this record.';

  var introEl = el('zia-intro-msg');
  if (introEl) {
    introEl.querySelector('.zia-bubble').innerHTML =
      'Hi! I\'m Zia 👋 You\'re currently in the <strong>' + escHtml(state.currentStage || stageName) + '</strong> stage.<br><br>' + introHtml;
  }
}

/* ─────────────────────────────────────────────────────────────
   Intent matching (offline / before Zia API responds)
───────────────────────────────────────────────────────────── */
function matchIntent(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < INTENT_PATTERNS.length; i++) {
    var pattern = INTENT_PATTERNS[i];
    for (var j = 0; j < pattern.patterns.length; j++) {
      if (lower.indexOf(pattern.patterns[j]) !== -1) {
        return pattern.respond(state.currentStage || '');
      }
    }
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────
   Zoho Zia API call (via CRM serverless function)
   Falls back to intent matching if the API is unavailable.
───────────────────────────────────────────────────────────── */
function callZiaAgent(userText, callback) {
  var contextSummary = buildContextSummary();

  ZOHO.CRM.CONNECTION.invoke('zia_connection', {
    url: 'https://zia.zoho.com/workboard/assist',
    method: 'POST',
    param_type: 1,
    parameters: JSON.stringify({
      query: userText,
      context: contextSummary,
      record_id: state.recordId,
      blueprint_stage: state.currentStage,
    }),
  }).then(function (response) {
    if (response && response.details && response.details.statusMessage) {
      try {
        var data = JSON.parse(response.details.statusMessage);
        callback(null, data.response || data.message || 'Zia could not generate a response.');
      } catch (e) {
        callback(null, response.details.statusMessage);
      }
    } else {
      callback('empty_response', null);
    }
  }).catch(function () {
    callback('api_error', null);
  });
}

function buildContextSummary() {
  var def = BLUEPRINT[state.currentStage] || {};
  var missingFields = [];
  if (def.requiredFields) {
    def.requiredFields.forEach(function (f) {
      if (!state.recordData || !state.recordData[f.name]) {
        missingFields.push(f.name);
      }
    });
  }
  return {
    stage: state.currentStage,
    next_transitions: (def.nextTransitions || []).join(', '),
    missing_required_fields: missingFields.join(', '),
  };
}

/* ─────────────────────────────────────────────────────────────
   Handle user message submission
───────────────────────────────────────────────────────────── */
function handleUserMessage(text) {
  text = text.trim();
  if (!text) return;

  appendMessage('user', escHtml(text));
  el('zia-user-input').value = '';

  // Try local intent matching first for instant response
  var localAnswer = matchIntent(text);
  if (localAnswer) {
    setTimeout(function () { appendMessage('bot', localAnswer); }, 300);
    return;
  }

  // Otherwise call Zia API
  showTypingIndicator();
  callZiaAgent(text, function (err, reply) {
    hideTypingIndicator();
    if (err || !reply) {
      var fallback = ZIA_FALLBACK_RESPONSES[Math.floor(Math.random() * ZIA_FALLBACK_RESPONSES.length)];
      appendMessage('bot', fallback);
    } else {
      appendMessage('bot', escHtml(reply));
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   Security helper – HTML entity encoding
───────────────────────────────────────────────────────────── */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────────────────────────
   ZOHO SDK initialisation
───────────────────────────────────────────────────────────── */
ZOHO.embeddedApp.on('PageLoad', function (data) {
  // data.Entity = module name, data.EntityId = record ID
  state.recordId = data.EntityId;

  // Fetch the record to get field values and blueprint stage
  ZOHO.CRM.API.getRecord({ Entity: 'Workboard', RecordID: data.EntityId })
    .then(function (response) {
      var records = response && response.data;
      if (records && records.length) {
        state.recordData = records[0];
        // Blueprint stage is stored in the '$blueprint_transition_state' meta
        // or in a custom field 'Blueprint_Stage' depending on CRM configuration.
        var stage =
          (state.recordData['$blueprint'] && state.recordData['$blueprint']['process_info'] && state.recordData['$blueprint']['process_info']['current_state']) ||
          state.recordData['Blueprint_Stage'] ||
          state.recordData['Stage'] ||
          'Open';
        renderStage(stage);
      } else {
        renderStage('Open');
      }
    })
    .catch(function () {
      renderStage('Open');
    });
});

ZOHO.embeddedApp.init();

/* ─────────────────────────────────────────────────────────────
   Event listeners (run after DOM is ready)
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  // Launcher button
  el('zia-launcher').addEventListener('click', function () {
    if (state.panelOpen) { closePanel(); } else { openPanel(); }
  });

  // Close button
  el('zia-close-btn').addEventListener('click', closePanel);

  // Tab buttons
  document.querySelectorAll('.zia-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab.id); });
  });

  // Message form
  el('zia-input-form').addEventListener('submit', function (e) {
    e.preventDefault();
    handleUserMessage(el('zia-user-input').value);
  });

  // Keyboard: Escape closes the panel
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.panelOpen) closePanel();
  });
});
