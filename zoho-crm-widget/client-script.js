/**
 * client-script.js – Zoho CRM Client Script
 * Module  : Workboard
 * Event   : PageLoad (Record Detail)
 *
 * Purpose:
 *   Inject a floating "Zia AI Assistant" icon button on every Workboard record
 *   detail page. When clicked, it opens the Workboard AI Assistant widget in a
 *   side panel without leaving the record page.
 *
 * How to deploy this client script in Zoho CRM:
 *   1. Go to Setup → Developer Space → Client Script.
 *   2. Click "Create New Script".
 *   3. Set Module = "Workboard", Event = "Page Load – Detail".
 *   4. Paste the contents of this file into the editor.
 *   5. Save and activate the script.
 *
 * How to deploy the widget (zoho-crm-widget/ folder):
 *   1. Go to Setup → Developer Space → Widgets.
 *   2. Click "+ New Widget" and choose "Custom Widget".
 *   3. Upload the contents of the zoho-crm-widget/ folder as a ZIP.
 *   4. The widget will be available as the side panel opened by this script.
 *
 * Note: Replace WIDGET_ID below with the actual ID shown in the Widgets list
 *       after uploading the widget ZIP.
 */

/* global ZDK */
'use strict';

// ── Configuration ──────────────────────────────────────────────
var WIDGET_ID    = 'YOUR_WIDGET_ID_HERE';   // replace after widget upload
var PANEL_WIDTH  = '420px';
var PANEL_TITLE  = 'Zia AI Assistant';
var BTN_ID       = 'zia-ai-launcher-btn';
// ───────────────────────────────────────────────────────────────

/**
 * Build and inject the floating AI launcher button into the page.
 * The button is a fixed-position element so it appears on top of
 * the CRM record detail view.
 */
function injectAIButton(recordContext) {
  // Prevent duplicate injection on re-renders
  if (document.getElementById(BTN_ID)) return;

  /* ── Styles ── */
  var style = document.createElement('style');
  style.id  = BTN_ID + '-style';
  style.textContent = [
    '#' + BTN_ID + '{',
    '  position:fixed;bottom:32px;right:32px;',
    '  width:56px;height:56px;border-radius:50%;',
    '  background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);',
    '  border:none;cursor:pointer;',
    '  box-shadow:0 4px 16px rgba(26,115,232,0.5);',
    '  display:flex;align-items:center;justify-content:center;',
    '  z-index:99999;transition:transform .18s,box-shadow .18s;',
    '  outline:none;',
    '}',
    '#' + BTN_ID + ':hover{transform:scale(1.1);box-shadow:0 6px 24px rgba(26,115,232,0.65);}',
    '#' + BTN_ID + ':focus-visible{outline:3px solid #4a9eff;outline-offset:3px;}',
    '#' + BTN_ID + '-pulse{',
    '  position:absolute;inset:-4px;border-radius:50%;',
    '  border:3px solid rgba(26,115,232,.4);',
    '  animation:zia-cs-pulse 2.4s ease-in-out infinite;',
    '}',
    '@keyframes zia-cs-pulse{',
    '  0%{transform:scale(1);opacity:.9}',
    '  70%{transform:scale(1.35);opacity:0}',
    '  100%{transform:scale(1.35);opacity:0}',
    '}',
    '#' + BTN_ID + '-tooltip{',
    '  position:fixed;bottom:96px;right:36px;',
    '  background:#1a73e8;color:#fff;',
    '  font-size:12px;font-weight:500;font-family:inherit;',
    '  padding:5px 12px;border-radius:20px;',
    '  box-shadow:0 2px 8px rgba(0,0,0,.18);',
    '  pointer-events:none;opacity:0;',
    '  transition:opacity .2s;z-index:99998;white-space:nowrap;',
    '}',
    '#' + BTN_ID + ':hover ~ #' + BTN_ID + '-tooltip{opacity:1;}',
  ].join('');
  document.head.appendChild(style);

  /* ── Button ── */
  var btn = document.createElement('button');
  btn.id            = BTN_ID;
  btn.title         = PANEL_TITLE;
  btn.setAttribute('aria-label', 'Open Zia AI Assistant');
  btn.innerHTML = [
    '<span id="' + BTN_ID + '-pulse"></span>',
    '<svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '  <circle cx="18" cy="18" r="17" fill="#fff" opacity=".15"/>',
    '  <circle cx="14" cy="17" r="2.4" fill="#fff"/>',
    '  <circle cx="22" cy="17" r="2.4" fill="#fff"/>',
    '  <rect x="13" y="22" width="10" height="2" rx="1" fill="#fff" opacity=".8"/>',
    '  <rect x="16" y="8" width="4" height="3" rx="1" fill="#fff" opacity=".7"/>',
    '  <circle cx="18" cy="8.5" r="1.2" fill="#fff"/>',
    '  <path d="M5 8l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#ffd54f"/>',
    '  <path d="M29 5l.7 1.4 1.4.7-1.4.7L29 9.2l-.7-1.4-1.4-.7 1.4-.7z" fill="#ffd54f"/>',
    '</svg>',
  ].join('');

  /* ── Tooltip ── */
  var tooltip = document.createElement('div');
  tooltip.id          = BTN_ID + '-tooltip';
  tooltip.textContent = '✨ Zia AI Assistant';

  document.body.appendChild(btn);
  document.body.appendChild(tooltip);

  /* ── Click handler: open widget as a CRM side panel ── */
  btn.addEventListener('click', function () {
    if (WIDGET_ID === 'YOUR_WIDGET_ID_HERE') {
      alert(
        'Workboard AI Assistant: Widget ID is not configured.\n\n' +
        'Please update the WIDGET_ID constant in client-script.js with the ' +
        'ID shown in Zoho CRM → Setup → Developer Space → Widgets after ' +
        'uploading the zoho-crm-widget/ package.'
      );
      return;
    }
    ZDK.UI.Panel.open({
      widgetID: WIDGET_ID,
      title:    PANEL_TITLE,
      width:    PANEL_WIDTH,
      data: {
        EntityId: recordContext.EntityId,
        Entity:   recordContext.Entity,
      },
    });
  });
}

/* ── Entry point ── */
ZDK.Page.on('PageLoad', function (data) {
  injectAIButton({
    Entity:   'Workboard',
    EntityId: data.Entity.getId(),
  });
});
