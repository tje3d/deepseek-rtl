// ==UserScript==
// @name         deepseek-rtl
// @namespace    https://chat.deepseek.com/
// @version      1.0.0
// @description  Fix RTL text alignment, emoji positioning, and font consistency for Persian, Arabic, Urdu, Pashto, Kurdish, and Hebrew in DeepSeek (LTR-safe code blocks)
// @author       Moein Porkamel
// @license      MIT
// @match        https://chat.deepseek.com/*
// @grant        none
// @downloadURL https://raw.githubusercontent.com/tje3d/deepseek-rtl/main/deepseek-rtl.user.js
// @updateURL   https://raw.githubusercontent.com/tje3d/deepseek-rtl/main/deepseek-rtl.meta.js
// ==/UserScript==


(function () {
  'use strict';

  /* =========================
     CONFIG & STATE
  ========================= */

  const STORAGE_KEY = 'deepseek_rtl_enabled';
  let RTL_ENABLED = true;
  let processedElements = new WeakSet();

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'false') {
    RTL_ENABLED = false;
  } else {
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  const DEBUG = false;
  const log = (...args) => DEBUG && console.log(...args);

  // Selector for elements that must always stay LTR (code blocks, inline code, syntax highlighting)
  const CODE_BLOCK_SELECTOR =
    'pre, code, .code-block, [class*="md-code"], [class*="code-block"], [class*="language-"]';

  /* =========================
     CSS STYLESHEET
  ========================= */

  const addStyles = () => {
    const styleId = 'rtl-assistant-styles';
    if (document.getElementById(styleId)) return;

    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = `
      .rtl-assistant-persian {
        direction: rtl !important;
        text-align: right;
        font-weight: normal;
        unicode-bidi: plaintext !important;
      }

      .rtl-assistant-english {
        direction: ltr !important;
        text-align: left;
        unicode-bidi: isolate !important;
        font-weight: normal;
      }

      .rtl-assistant-ltr-number {
        direction: ltr !important;
        unicode-bidi: embed !important;
        display: inline-block;
      }

      .rtl-assistant-ltr-symbol {
        direction: ltr !important;
        unicode-bidi: embed !important;
        display: inline-block;
        margin-left: 2px;
        margin-right: 2px;
      }

      .rtl-assistant-prefix-symbol {
        direction: ltr !important;
        unicode-bidi: embed !important;
        display: inline-block;
        margin-left: 2px;
      }

      .rtl-assistant-textarea {
        direction: rtl !important;
        text-align: right;
      }

      /* === RTL FIX: code blocks must always stay LTR === */
      pre,
      pre *,
      code,
      code *,
      .code-block,
      .code-block *,
      [class*="md-code"],
      [class*="md-code"] *,
      [class*="code-block"],
      [class*="code-block"] *,
      [class*="language-"],
      [class*="language-"] * {
        direction: ltr !important;
        text-align: left !important;
        unicode-bidi: embed !important;
      }
      /* === end code block fix === */

      #rtl-toggle-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
      }

      #rtl-toggle-btn.rtl-on {
        background-color: #10b981;
        color: white;
      }

      #rtl-toggle-btn.rtl-off {
        background-color: #ef4444;
        color: white;
      }

      #rtl-toggle-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      }
    `;

    document.head.appendChild(styleSheet);
  };

  /* =========================
     TEXT ANALYSIS
  ========================= */

  // Updated to include Hebrew characters (U+0590 to U+05FF)
  const RTL_CHARS = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const ENGLISH_CHARS = /[A-Za-z]/;

  const EMOJI_AND_SYMBOLS = /[\u2600-\u26FF\u2700-\u27BF\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2000}-\u206F\u2100-\u214F\u2190-\u21FF\u2300-\u23FF\u2500-\u257F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2900-\u297F\u2B00-\u2BFF\u3000-\u303F}\u{1F000}-\u{1F02F}]/u;

  const PREFIX_SYMBOLS = /[\u2705\u2714\u2713\u2611\u2610\u2605\u2606\u272A\u2730\u273F\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|[\uD83C][\uDF00-\uDFFF]|[\uD83D][\uDC00-\uDE4F]|[\uD83D][\uDE80-\uDEFF]|[\uD83E][\uDD00-\uDDFF]/u;

  // Built once — the previous version rebuilt this RegExp per text node.
  const COMBINED_SPLIT_REGEX = new RegExp(`(\\d+|${EMOJI_AND_SYMBOLS.source})`, 'gu');

  const WRAPPED_SPAN_CLASSES = [
    'rtl-assistant-ltr-number',
    'rtl-assistant-ltr-symbol',
    'rtl-assistant-prefix-symbol',
  ];
  const WRAPPED_SPAN_SELECTOR = WRAPPED_SPAN_CLASSES.map(c => '.' + c).join(', ');
  const RTL_CLASSES = [
    'rtl-assistant-persian',
    'rtl-assistant-english',
    ...WRAPPED_SPAN_CLASSES,
    'rtl-assistant-textarea',
  ];
  const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'IMG', 'CANVAS', 'VIDEO', 'AUDIO',
    'INPUT', 'BUTTON', 'SELECT', 'OPTION', 'TEXTAREA', 'META', 'LINK', 'BR', 'HR'];
  const LIST_TAGS = ['OL', 'UL'];
  const TEXT_TAGS = ['P', 'DIV', 'SPAN', 'LI', 'ARTICLE', 'SECTION',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGCAPTION',
    'TD', 'TH', 'LABEL', ...LIST_TAGS];
  const TEXT_CLASSES = ['message', 'chat', 'content', 'text', 'prose',
    'markdown', 'paragraph', 'bubble', 'response'];
  const PRIORITY_SELECTORS = [
    '.message, .chat-message, [class*="message-"], [class*="chat-"]',
    '.prose, .markdown, [class*="content"], [class*="text"]',
    'p, h1, h2, h3, h4, h5, h6, li, blockquote, ol, ul',
  ];
  const MARKED_SELECTOR = '[class*="rtl-assistant-"], [data-rtl-processed], [data-rtl-numbers]';

  const analyzeText = (text) => {
    const cleanText = text.trim();
    if (cleanText.length < 2) return null;

    let rtlCount = 0;
    let englishCount = 0;
    let symbolCount = 0;
    let totalChars = 0;

    const sampleSize = Math.min(cleanText.length, 200);
    const step = Math.max(1, Math.floor(cleanText.length / sampleSize));

    for (let i = 0; i < cleanText.length; i += step) {
      const char = cleanText[i];
      if (RTL_CHARS.test(char)) {
        rtlCount++;
        totalChars++;
      } else if (ENGLISH_CHARS.test(char)) {
        englishCount++;
        totalChars++;
      } else if (EMOJI_AND_SYMBOLS.test(char)) {
        symbolCount++;
        totalChars++;
      }
    }

    if (totalChars === 0) return null;

    const rtlRatio = rtlCount / totalChars;
    const englishRatio = englishCount / totalChars;
    const symbolRatio = symbolCount / totalChars;
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);

    return {
      hasRTL: rtlCount > 0,
      hasEnglish: englishCount > 0,
      hasSymbols: symbolCount > 0,
      rtlRatio,
      englishRatio,
      symbolRatio,
      wordCount: words.length,
      totalChars: cleanText.length
    };
  };

  // Pure: text stats -> which direction class to apply (or null for none).
  const decideAction = (stats) => {
    if (!stats) return null;

    if (stats.hasRTL && (stats.rtlRatio > 0.2 || stats.wordCount < 5)) {
      return 'persian';
    }
    if (stats.hasEnglish && !stats.hasRTL) {
      return stats.wordCount <= 3 && stats.totalChars < 20 ? 'persian' : 'english';
    }
    if (stats.hasRTL && stats.rtlRatio <= 0.2) {
      return 'english';
    }
    return null;
  };

  /* =========================
     ELEMENT FILTERING
  ========================= */

  const isSVGorRelated = (el) => {
    if (!el || el.nodeType !== 1) return false;

    const className = el.className || '';
    if (typeof className === 'string' &&
        (className.includes('icon') ||
         className.includes('svg') ||
         className.includes('feather'))) {
      return true;
    }

    return el.tagName.toUpperCase() === 'SVG' ||
           el.closest('svg') !== null ||
           el.hasAttribute('d') ||
           el.hasAttribute('points');
  };

  const isRealTextElement = (el) => {
    if (!el || el.nodeType !== 1) return false;

    if (
      el.hasAttribute('aria-label') ||
      el.getAttribute('role') === 'button' ||
      el.contentEditable === 'false'
    ) {
      return false;
    }

    if (isSVGorRelated(el)) return false;

    if (IGNORE_TAGS.includes(el.tagName.toUpperCase())) return false;

    // RTL FIX: skip anything inside code blocks / inline code / syntax highlight
    if (el.closest(CODE_BLOCK_SELECTOR)) {
      return false;
    }

    const text = el.textContent || '';
    const trimmedText = text.trim();

    if (trimmedText.length < 2 || trimmedText.length > 10000) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0) {
      return false;
    }

    if (TEXT_TAGS.includes(el.tagName.toUpperCase())) {
      return true;
    }

    const className = el.className || '';
    if (typeof className === 'string') {
      const lower = className.toLowerCase();
      return TEXT_CLASSES.some(c => lower.includes(c));
    }

    return false;
  };

  /* =========================
     DIRECTION APPLICATION - FIXED
  ========================= */

  const unwrapWrappedSpans = (root) => {
    root.querySelectorAll(WRAPPED_SPAN_SELECTOR).forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
      }
    });
  };

  // One pass restores plain text and clears every marker this script adds.
  const stripMarks = () => {
    unwrapWrappedSpans(document);
    document.querySelectorAll(MARKED_SELECTOR).forEach(el => {
      el.classList.remove(...RTL_CLASSES);
      delete el.dataset.rtlProcessed;
      delete el.dataset.rtlNumbers;
    });
  };

  const processNumbersAndSymbolsSafely = (element) => {
    if (!element || !element.childNodes) return;

    // Reset on every pass: applyDirectionSafely unwraps spans first, so they
    // must be re-wrapped here. A stale flag used to skip re-wrapping and left
    // numbers/emoji unstyled after a force scan.
    delete element.dataset.rtlNumbers;

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      // RTL FIX: reject text nodes inside code blocks so they never get wrapped
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && parent.closest(CODE_BLOCK_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent && (/\d+/.test(node.textContent) || EMOJI_AND_SYMBOLS.test(node.textContent))) {
        nodes.push(node);
      }
    }

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const text = node.textContent;

      const parts = text.split(COMBINED_SPLIT_REGEX);

      if (parts.length <= 1) continue;

      const fragment = document.createDocumentFragment();

      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        if (!part) continue;

        if (/^\d+$/.test(part)) {
          const span = document.createElement('span');
          span.className = 'rtl-assistant-ltr-number';
          span.textContent = part;
          fragment.appendChild(span);
        }
        else if (PREFIX_SYMBOLS.test(part)) {
          const span = document.createElement('span');
          span.className = 'rtl-assistant-prefix-symbol';
          span.textContent = part;
          fragment.appendChild(span);
        }
        else if (EMOJI_AND_SYMBOLS.test(part)) {
          const span = document.createElement('span');
          span.className = 'rtl-assistant-ltr-symbol';
          span.textContent = part;
          fragment.appendChild(span);
        }
        else {
          fragment.appendChild(document.createTextNode(part));
        }
      }

      node.parentNode.replaceChild(fragment, node);
    }
  };

  // Read-only phase: gather everything that needs a layout/style read.
  const planDirection = (el) => {
    if (!el || !el.isConnected || !isRealTextElement(el)) return null;

    const trimmedText = (el.textContent || '').trim();
    if (trimmedText.length < 2) return { action: null, wrap: false };

    const action = decideAction(analyzeText(trimmedText));
    return { action, wrap: action === 'persian' };
  };

  // Write-only phase: mutate the DOM using a previously computed plan.
  const commitDirection = (el, plan) => {
    try {
      el.classList.remove('rtl-assistant-persian', 'rtl-assistant-english');
      unwrapWrappedSpans(el);

      if (RTL_ENABLED && plan.action) {
        el.classList.add('rtl-assistant-' + plan.action);
        if (plan.wrap) processNumbersAndSymbolsSafely(el);
      }

      processedElements.add(el);
      el.dataset.rtlProcessed = '1';
    } catch (error) {
      DEBUG && console.warn('Error applying direction:', error);
      processedElements.add(el);
      el.dataset.rtlProcessed = '1';
    }
  };

  const applyDirectionSafely = (el, force = false) => {
    if (!el || !el.isConnected) return;
    if (!force && processedElements.has(el)) return;
    const plan = planDirection(el);
    if (plan) commitDirection(el, plan);
  };

  /* =========================
     SCANNING WITH FORCE OPTION
  ========================= */

  let scanTimeout = null;
  const SCAN_DELAY = 300;

  const requestScan = (force = false) => {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
    }

    scanTimeout = setTimeout(() => {
      scanImportantElements(force);
      scanTimeout = null;
    }, SCAN_DELAY);
  };

  const scanImportantElements = (force = false) => {
    if (!RTL_ENABLED && !force) return;

    try {
      let elements = [];
      PRIORITY_SELECTORS.forEach(selector => {
        elements = elements.concat(Array.from(document.querySelectorAll(selector)));
      });

      // Lists are structural containers: their markers align with the list's
      // own direction, so every OL/UL must be processed regardless of the
      // recency cap that drops older elements on long chat pages.
      const allLists = Array.from(document.querySelectorAll('ol, ul'));
      const candidates = [...new Set([...elements.slice(-500), ...allLists])];

      // Nested selectors (e.g. .message and its <p>) would make the parent
      // unwrap spans the child just wrapped. Keep only leaf-most candidates:
      // mark every ancestor of a candidate, then drop marked candidates.
      const ancestorsOfCandidates = new Set();
      candidates.forEach(el => {
        let ancestor = el.parentElement;
        while (ancestor) {
          ancestorsOfCandidates.add(ancestor);
          ancestor = ancestor.parentElement;
        }
      });
      // Lists keep their direction too: markers/bullets align with the
      // list's direction, so an OL/UL must not be dropped just because its
      // <li> children are also candidates.
      const leaves = candidates.filter(el =>
        !ancestorsOfCandidates.has(el) || LIST_TAGS.includes(el.tagName.toUpperCase()));

      // Phase 1: all style/layout reads. Phase 2: all DOM writes. Keeping
      // them apart avoids forced synchronous reflow on every element.
      const plans = leaves.map(el => [
        el,
        (force || !processedElements.has(el)) ? planDirection(el) : null,
      ]);

      plans.forEach(([el, plan]) => {
        if (plan) commitDirection(el, plan);
      });

      document.querySelectorAll('textarea').forEach(ta => {
        ta.classList.toggle('rtl-assistant-textarea', RTL_ENABLED);
      });

    } catch (error) {
      DEBUG && console.warn('Scan error:', error);
    }
  };

  /* =========================
     OBSERVER
  ========================= */

  const setupEfficientObserver = () => {
    try {
      const mainContent = document.querySelector('main, .chat-container, [role="main"]') || document.body;

      const observer = new MutationObserver((mutations) => {
        if (!RTL_ENABLED) return;

        let hasRelevantChanges = false;

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) {
                // Skip code blocks entirely (RTL FIX)
                if (node.matches && node.matches(CODE_BLOCK_SELECTOR)) return;

                if (node.matches &&
                   (node.matches('.message, .chat-message, p, [class*="content"]') ||
                    node.querySelector('.message, .chat-message, p, [class*="content"]'))) {
                  hasRelevantChanges = true;

                  if (node.matches('.message, .chat-message')) {
                    applyDirectionSafely(node);
                  }
                }
              }
            });
          }
        }

        if (hasRelevantChanges) {
          requestScan();
        }
      });

      observer.observe(mainContent, {
        childList: true,
        subtree: true,
        characterData: false
      });

    } catch (error) {
      DEBUG && console.warn('Observer error:', error);
    }
  };

  /* =========================
     TOGGLE BUTTON - FIXED VERSION
  ========================= */

  const createToggleButton = () => {
    const oldBtn = document.getElementById('rtl-toggle-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'rtl-toggle-btn';
    btn.className = RTL_ENABLED ? 'rtl-on' : 'rtl-off';
    btn.textContent = RTL_ENABLED ? 'RTL ON' : 'RTL OFF';

    btn.onclick = () => {
      RTL_ENABLED = !RTL_ENABLED;
      localStorage.setItem(STORAGE_KEY, RTL_ENABLED);

      btn.className = RTL_ENABLED ? 'rtl-on' : 'rtl-off';
      btn.textContent = RTL_ENABLED ? 'RTL ON' : 'RTL OFF';

      // One cleanup pass restores text and clears all markers in both
      // directions. ON re-scans afterwards; OFF stops here.
      stripMarks();
      processedElements = new WeakSet();

      if (RTL_ENABLED) {
        setTimeout(() => scanImportantElements(true), 100);
      }
    };

    document.body.appendChild(btn);
    return btn;
  };

  /* =========================
     INITIALIZATION
  ========================= */

  const init = () => {
    addStyles();

    createToggleButton();

    setTimeout(setupEfficientObserver, 500);

    setTimeout(() => {
      if (RTL_ENABLED) {
        scanImportantElements();
      }
    }, 1000);

    window.addEventListener('load', () => {
      setTimeout(() => {
        if (RTL_ENABLED) {
          requestScan();
        }
      }, 2000);
    });
  };

  /* =========================
     STARTUP
  ========================= */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

})();
