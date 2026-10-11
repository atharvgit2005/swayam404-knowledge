import {
  ScannedQuestion,
  ScannedOption,
  PopulationTarget,
  PopulationItemResult,
  QuestionType,
  CourseTask,
  TaskType,
  TaskStatus,
  CapturedQuestionRecord,
  VerificationStatus,
  SubmissionStatus,
  WeekInfo,
} from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export interface ISiteAdapter {
  name: string;
  canHandle(document: Document, url: string): boolean;
  scanQuestions(document: Document): ScannedQuestion[];
  populateQuestion(document: Document, target: PopulationTarget): PopulationItemResult;
  detectCourseIdentity(document: Document, url?: string): {
    courseTitle?: string;
    externalId?: string;
    assignmentTitle?: string;
    unitTitle?: string;
    unitId?: string;
    assessmentId?: string;
    detectedWeek?: string;
    detectedWeekNumber?: number;
    isAlreadySubmitted?: boolean;
    submissionStatus?: SubmissionStatus;
  };
  scanCourseOutline(document: Document, url?: string): {
    portalCourseTitle?: string;
    externalCourseId?: string;
    tasks: CourseTask[];
  };
  captureAssignmentFeedback(document: Document, url?: string): {
    portalCourseTitle?: string;
    externalCourseId?: string;
    assignmentTitle?: string;
    unitTitle?: string;
    capturedRecords: CapturedQuestionRecord[];
  };
}

/**
 * Universal safe helper to dispatch input and change events for framework-controlled elements
 */
export function dispatchSafeInputEvents(element: HTMLElement, value?: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // React 16+ value tracker override
    const prototype = Object.getPrototypeOf(element);
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeSetter && typeof value === 'string') {
      nativeSetter.call(element, value);
    } else if (typeof value === 'string') {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  } else if (element instanceof HTMLSelectElement) {
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }
}

/**
 * Safely sets checked state (true or false) with proper event bubbling and React tracker support
 */
export function dispatchSafeCheck(input: HTMLInputElement, shouldBeChecked: boolean): void {
  if (input.checked === shouldBeChecked) {
    return; // Already in desired state
  }

  const prototype = Object.getPrototypeOf(input);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'checked')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, shouldBeChecked);
  } else {
    input.checked = shouldBeChecked;
  }

  input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // If DOM default action toggled checked state, restore desired state
  if (input.checked !== shouldBeChecked) {
    if (nativeSetter) {
      nativeSetter.call(input, shouldBeChecked);
    } else {
      input.checked = shouldBeChecked;
    }
  }

  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

/**
 * Backward-compatible helper to click an input to checked=true
 */
export function dispatchSafeClick(input: HTMLInputElement): void {
  dispatchSafeCheck(input, true);
}

function safeCssEscape(str: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(str);
  }
  return str.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
}

/**
 * Extracts visible label text associated with an input element
 */
export function getAssociatedLabelText(input: HTMLElement, container: HTMLElement): string {
  // 1. Check native labels property
  const inputEl = input as HTMLInputElement;
  if (inputEl.labels && inputEl.labels.length > 0) {
    for (let i = 0; i < inputEl.labels.length; i++) {
      const lbl = inputEl.labels[i];
      const clone = lbl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea, .badge, [class*="badge"], .status, .score, svg').forEach((el) => el.remove());
      const txt = clone.textContent?.replace(/[✔✓]/g, '').trim();
      if (txt) return txt;
    }
  }

  // 2. Check <label for="inputId">
  if (input.id) {
    const doc = input.ownerDocument || document;
    const label = doc.querySelector(`label[for="${safeCssEscape(input.id)}"]`);
    if (label && label.textContent?.trim()) {
      const clone = label.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea, .badge, [class*="badge"], .status, .score, svg').forEach((el) => el.remove());
      const txt = clone.textContent?.replace(/[✔✓]/g, '').trim();
      if (txt) return txt;
    }
  }

  // 3. Check enclosing <label>
  const parentLabel = input.closest('label');
  if (parentLabel && parentLabel.textContent?.trim()) {
    // Clone to remove input text itself if present
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    const innerInputs = clone.querySelectorAll('input, select, textarea, .badge, [class*="badge"], .status, .score, svg');
    innerInputs.forEach((i) => i.remove());
    const txt = clone.textContent?.replace(/[✔✓]/g, '').trim();
    if (txt) {
      return txt;
    }
  }

  // 4. Check aria-labelledby or aria-label
  const ariaLabelledby = input.getAttribute('aria-labelledby');
  if (ariaLabelledby) {
    const doc = input.ownerDocument || document;
    const el = doc.getElementById(ariaLabelledby);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 5. Check adjacent sibling or parent span
  const nextSib = input.nextElementSibling;
  if (nextSib && (nextSib.tagName === 'SPAN' || nextSib.tagName === 'LABEL' || nextSib.tagName === 'P')) {
    if (nextSib.textContent?.trim()) return nextSib.textContent.trim();
  }

  // 6. Parent row text
  const parentRow = input.closest('.option-row, .choice, .gcb-option, li, div');
  if (parentRow && parentRow !== container) {
    const clone = parentRow.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach((i) => i.remove());
    if (clone.textContent?.trim()) return clone.textContent.trim();
  }

  return (input as HTMLInputElement).value || 'Option';
}

/**
 * Safely extracts clean text from an element, removing inputs, buttons, svg, and screen-reader badges
 */
export function extractCleanText(element: HTMLElement | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'input, select, textarea, button, script, style, svg, .badge, [class*="badge"], .status, [class*="status"], .score, [class*="score"], .sr, .sr-only, .visually-hidden'
    )
    .forEach((el) => el.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Helper to identify if text is just a point value / marks badge (e.g. "1 Point", "2 Points", "1 mark")
 */
export function isPointOrScoreBadge(text: string): boolean {
  return /^\d+(?:\.\d+)?\s*(?:points?|marks?|pts?)\.?$/i.test(text.trim());
}

/**
 * Extracts complete, rich question prompt text from a question container or surrounding DOM.
 * Accurately merges question indexes ("Question 1" or "1.") with the question body/stem ("What is MVP?"),
 * filters out point/score badges ("1 Point"), and inspects preceding siblings or parent problem wrappers.
 */
export function extractQuestionText(container: HTMLElement, questionIdx: number): string {
  // 1. Check for explicit question stem / prompt / description elements inside container
  const stemSelectors = [
    '.question-content', // SWAYAM 2 Next.js assessment question body
    '.problem-description', // Open edX
    '.question-description',
    '.question-stem',
    '.qt-question-text', // GCB
    '.question-text', // Note: On SWAYAM 2, .question-text is used for "1 Point" so we filter out score badges
    '.questiontext', // Moodle
    '.problem-content',
    '.gcb-question-label',
    '.prompt',
    '.stimulus',
    '.description',
    '.detailed-problem-challenge',
    '.qtext',
    '.formulation',
  ];

  let stemText = '';
  for (const sel of stemSelectors) {
    const stemEl = container.querySelector<HTMLElement>(sel);
    if (stemEl) {
      const txt = extractCleanText(stemEl);
      if (txt && !isPointOrScoreBadge(txt)) {
        stemText = txt;
        break;
      }
    }
  }

  // 2. Check for header / title / index elements (including SWAYAM 2 question-row index)
  let headerText = '';

  const qRow = container.querySelector<HTMLElement>('.question-row');
  if (qRow) {
    const numSpan = qRow.querySelector<HTMLElement>('span');
    if (numSpan) {
      const numTxt = extractCleanText(numSpan);
      if (/^\d+\.?$/.test(numTxt)) {
        headerText = numTxt.endsWith('.') ? numTxt : `${numTxt}.`;
      }
    }
  }

  const headerSelectors = [
    'h1, h2, h3, h4, h5, h6',
    '.problem-header',
    '.question-header',
    '.question-title',
    'legend',
    '.header',
  ];

  if (!headerText) {
    for (const sel of headerSelectors) {
      const headEl = container.querySelector<HTMLElement>(sel);
      if (headEl) {
        const txt = extractCleanText(headEl);
        if (txt && !isPointOrScoreBadge(txt)) {
          headerText = txt;
          break;
        }
      }
    }
  }

  // 3. If stem not found inside container, check enclosing parent problem or preceding siblings
  if (!stemText) {
    const parentProblem = container.closest<HTMLElement>(
      'section, .problem, .wrapper-problem-response, .detailed-problem-challenge, .gcb-form-element, [data-question-id], .assignment-question, .question-card, .quiz-question, .question-block, .que'
    );
    if (parentProblem && parentProblem !== container) {
      for (const sel of stemSelectors) {
        const pStem = parentProblem.querySelector<HTMLElement>(sel);
        if (pStem) {
          const txt = extractCleanText(pStem);
          if (txt && !isPointOrScoreBadge(txt)) {
            stemText = txt;
            break;
          }
        }
      }
      if (!headerText) {
        for (const sel of headerSelectors) {
          const pHead = parentProblem.querySelector<HTMLElement>(sel);
          if (pHead) {
            const txt = extractCleanText(pHead);
            if (txt && !isPointOrScoreBadge(txt)) {
              headerText = txt;
              break;
            }
          }
        }
      }
    }
  }

  // 4. If stem or header not found, check preceding siblings of container
  if (!stemText || !headerText) {
    let prev = container.previousElementSibling as HTMLElement | null;
    let lookback = 0;
    while (prev && lookback < 5) {
      if (!stemText) {
        for (const sel of stemSelectors) {
          if (prev.matches(sel)) {
            const txt = extractCleanText(prev);
            if (txt && !isPointOrScoreBadge(txt)) {
              stemText = txt;
              break;
            }
          }
          const innerStem = prev.querySelector<HTMLElement>(sel);
          if (innerStem) {
            const txt = extractCleanText(innerStem);
            if (txt && !isPointOrScoreBadge(txt)) {
              stemText = txt;
              break;
            }
          }
        }
      }

      // Check for paragraph or header in sibling
      const txt = extractCleanText(prev);
      if (txt && !isPointOrScoreBadge(txt)) {
        if (/^(?:question|q\.?|problem)\s*#?\d+[:.]?$/i.test(txt) || /^H[1-6]$/.test(prev.tagName) || prev.matches('.question-header, .problem-header')) {
          if (!headerText) headerText = txt;
        } else if (!stemText && (prev.tagName === 'P' || prev.matches('.question-stem, .problem-description, .question-content'))) {
          stemText = txt;
        }
      }

      if (stemText && headerText) break;

      prev = prev.previousElementSibling as HTMLElement | null;
      lookback++;
    }
  }

  // 5. If still no stem, search for paragraphs or text elements inside container before inputs
  if (!stemText) {
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('p, div, span'));
    for (const el of candidates) {
      if (
        el.closest('label, button, input, select, textarea, .choice, .choices, .field') ||
        el.querySelectorAll('input, select, textarea').length > 0
      ) {
        continue;
      }
      const txt = extractCleanText(el);
      if (txt && txt.length > 5 && !isPointOrScoreBadge(txt) && !/^(?:submit|save|reset|clear|previous|next)/i.test(txt)) {
        if (/^(?:question|q\.?|problem)\s*#?\d+[:.]?$/i.test(txt)) {
          if (!headerText) headerText = txt;
        } else {
          stemText = txt;
          break;
        }
      }
    }
  }

  // 6. If still no stem, clone container and strip inputs, labels, and buttons
  if (!stemText) {
    const rawClean = extractCleanText(container);
    if (rawClean && rawClean.length > 2 && !isPointOrScoreBadge(rawClean)) {
      stemText = rawClean;
    }
  }

  // 7. Harmonize header and stem
  const isGenericIndexHeader =
    headerText && /^(?:question\s*#?\d+[:.]?|q\.?\s*#?\d+[:.]?|problem\s*#?\d+[:.]?|\d+\.?)$/i.test(headerText.trim());

  if (stemText) {
    if (isGenericIndexHeader) {
      if (stemText.toLowerCase().startsWith(headerText.toLowerCase())) {
        return stemText;
      }
      const sep = headerText.endsWith(':') || headerText.endsWith('.') ? ' ' : ': ';
      return `${headerText}${sep}${stemText}`;
    }
    if (headerText && !headerText.includes(stemText) && !stemText.includes(headerText)) {
      return `${headerText} — ${stemText}`;
    }
    return stemText;
  }

  if (headerText) {
    return headerText;
  }

  return `Question ${questionIdx}`;
}

/**
 * Extracts week information from elements, breadcrumbs, titles, and URLs
 */
export function extractWeekInfo(document: Document, url: string = ''): WeekInfo {
  // 1. Breadcrumbs (highest accuracy on Swayam / NPTEL)
  const breadcrumbElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.breadcrumb-item, .breadcrumb li, nav[aria-label="breadcrumb"] li, .breadcrumbs a, .breadcrumbs span, .nav-breadcrumb'
    )
  );

  for (const el of breadcrumbElements) {
    const text = el.textContent?.trim() || '';
    const match = text.match(/\bweek\s*(\d{1,2})\b/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return {
        formattedWeek: `Week ${num}`,
        weekNumber: num,
        rawText: text,
      };
    }
  }

  // 2. Unit selectors (.unit-title, .week-header, .week-title, h3.unit, accordion headers, etc.)
  const unitSelectors = [
    '.week-header',
    '.week-title',
    '.unit-title',
    'h3.unit',
    '.accordion-item.active .accordion-button',
    '.accordion-button:not(.collapsed)',
    '.unit-card.active',
    '.chapter-title',
    'summary',
  ];

  for (const sel of unitSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.textContent?.trim()) {
      const text = el.textContent.trim();
      const match = text.match(/\b(?:week|w)\s*(\d{1,2})\b/i);
      if (match) {
        const num = parseInt(match[1], 10);
        return {
          formattedWeek: `Week ${num}`,
          weekNumber: num,
          rawText: text,
        };
      }
    }
  }

  // 3. Assignment / Page Headings (.assignment-title, .quiz-title, h1, h2, h3, .header p)
  const headingSelectors = [
    '.assignment-title',
    '.quiz-title',
    '.qt-assignment-title',
    'h1',
    'h2',
    'h3',
    '.header p',
  ];

  for (const sel of headingSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.textContent?.trim()) {
      const text = el.textContent.trim();
      const weekMatch = text.match(/\b(?:week|w)\s*(\d{1,2})\b/i);
      if (weekMatch) {
        const num = parseInt(weekMatch[1], 10);
        return {
          formattedWeek: `Week ${num}`,
          weekNumber: num,
          rawText: text,
        };
      }
      // If assignment has e.g. "Assignment 04" or "Assignment 4", map to Week 4 in SWAYAM
      const assignMatch = text.match(/\bassignment\s*(\d{1,2})\b/i);
      if (assignMatch) {
        const num = parseInt(assignMatch[1], 10);
        return {
          formattedWeek: `Week ${num}`,
          weekNumber: num,
          rawText: text,
        };
      }
    }
  }

  // 4. Document title
  if (document.title) {
    const title = document.title;
    const weekMatch = title.match(/\b(?:week|w)\s*(\d{1,2})\b/i);
    if (weekMatch) {
      const num = parseInt(weekMatch[1], 10);
      return {
        formattedWeek: `Week ${num}`,
        weekNumber: num,
        rawText: title,
      };
    }
    const assignMatch = title.match(/\bassignment\s*(\d{1,2})\b/i);
    if (assignMatch) {
      const num = parseInt(assignMatch[1], 10);
      return {
        formattedWeek: `Week ${num}`,
        weekNumber: num,
        rawText: title,
      };
    }
  }

  // 5. URL query params or path (e.g. ?unit=3, /week3/, /week-3/)
  if (url) {
    const urlWeek = url.match(/(?:week|w)[-_/]?(\d{1,2})/i);
    if (urlWeek) {
      const num = parseInt(urlWeek[1], 10);
      return {
        formattedWeek: `Week ${num}`,
        weekNumber: num,
        rawText: `URL: ${urlWeek[0]}`,
      };
    }
    const urlUnit = url.match(/[?&]unit(?:Id)?=(\d{1,2})/i);
    if (urlUnit) {
      const num = parseInt(urlUnit[1], 10);
      return {
        formattedWeek: `Week ${num}`,
        weekNumber: num,
        rawText: `Unit ${num}`,
      };
    }
  }

  return {};
}

/**
 * Detects whether the current assignment is already submitted, graded, or closed
 */
export function detectSubmissionStatus(document: Document): SubmissionStatus {
  const bodyText = document.body ? document.body.innerText || document.body.textContent || '' : '';

  // 1. Text markers for submission
  const submittedPatterns = [
    /you\s+have\s+already\s+submitted\s+this\s+assignment/i,
    /your\s+(?:last\s+)?submission\s+(?:was\s+)?(?:recorded|received|done|on)/i,
    /submission\s+date\s*:/i,
    /submitted\s+on\s*:/i,
    /last\s+submitted\s+on\s*:/i,
    /assignment\s+submitted\s+successfully/i,
    /final\s+submission\s+done/i,
    /assessment\s+submitted/i,
  ];

  let isSubmitted = submittedPatterns.some((pattern) => pattern.test(bodyText));

  // 2. Class markers for submission
  if (!isSubmitted) {
    const submittedElements = document.querySelectorAll(
      '.submitted, .completed, .assignment-submitted, .submission-info, .gcb-scored-assignment, [data-submission-status="submitted"], [data-status="submitted"], .status-submitted'
    );
    if (submittedElements.length > 0) {
      isSubmitted = true;
    }
  }

  // 3. Presence of feedback elements indicating it was already submitted/graded
  if (!isSubmitted) {
    const feedbackMarkers = document.querySelectorAll(
      '.qt-feedback, .accepted-answers, .gcb-feedback, .detailed-solution, .solution-block, [data-portal-feedback="true"]'
    );
    const correctIndicators = document.querySelectorAll('.correct, .badge-correct, [data-is-correct="true"]');
    if (feedbackMarkers.length > 0 || correctIndicators.length > 0) {
      isSubmitted = true;
    }
  }

  // 4. Check for Past Due / Closed
  const pastDuePatterns = [
    /the\s+due\s+date\s+for\s+submitting\s+this\s+assignment\s+has\s+passed/i,
    /this\s+assignment\s+is\s+closed/i,
    /assessment\s+is\s+closed/i,
    /due\s+date\s+passed/i,
    /submissions?\s+are\s+no\s+longer\s+accepted/i,
  ];
  const isPastDue = pastDuePatterns.some((pattern) => pattern.test(bodyText));

  // 5. Extract score text if available
  let scoreText: string | undefined;
  const scoreMatch = bodyText.match(/(?:score|marks|total\s+score)\s*:\s*(\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?|%|\s*out\s+of\s+\d+))/i);
  if (scoreMatch) {
    scoreText = scoreMatch[0].trim();
    isSubmitted = true;
  }

  // 6. Check for submission timestamp text
  let submittedAt: string | undefined;
  const dateMatch = bodyText.match(/(?:submitted\s+on|submission\s+date|last\s+submitted\s+on)\s*:\s*([^\n\r<]{5,40})/i);
  if (dateMatch) {
    submittedAt = dateMatch[1].trim();
  }

  // 7. Check if all inputs are locked / disabled
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input[type="radio"], input[type="checkbox"], input[type="text"], textarea, select'
    )
  );

  const isLocked = inputs.length > 0 && inputs.every((inp) => inp.disabled || (inp as HTMLInputElement).readOnly);

  let statusText = 'Open & Active';
  if (isSubmitted) {
    statusText = scoreText ? `Submitted (${scoreText})` : submittedAt ? `Submitted on ${submittedAt}` : 'Submitted';
  } else if (isPastDue) {
    statusText = 'Closed (Due date passed)';
  } else if (isLocked) {
    statusText = 'Locked (Inputs disabled)';
  }

  return {
    isSubmitted,
    isLocked,
    isPastDue,
    statusText,
    scoreText,
    submittedAt,
    details: isSubmitted
      ? 'This assignment has already been completed on the portal. Option inputs are locked.'
      : isPastDue
      ? 'The assignment submission window has closed.'
      : undefined,
  };
}

/**
 * SWAYAM Portal & Generic Educational Assessment Adapter
 */
export class SwayamPortalAdapter implements ISiteAdapter {
  name = 'SwayamPortalAdapter';

  canHandle(document: Document, url: string): boolean {
    const isSwayamUrl =
      /swayam\.gov\.in|swayam2\.ac\.in|nptel\.ac\.in/i.test(url) ||
      /localhost|127\.0\.0\.1/i.test(url) ||
      url.includes('fixtures');
    const hasContainers =
      document.querySelectorAll(
        'section, .problem, .wrapper-problem-response, .detailed-problem-challenge, .gcb-form-element, .qt-question, .assignment-question, .question-card, .question-content, fieldset, [data-question-id]'
      ).length > 0;
    return isSwayamUrl || hasContainers;
  }

  scanQuestions(document: Document): ScannedQuestion[] {
    const results: ScannedQuestion[] = [];

    // Prioritized selectors for question containers (SWAYAM 2 sections, Open edX, GCB, Moodle, custom)
    const containerSelectors = [
      'section',
      '.problem',
      '.wrapper-problem-response',
      '.detailed-problem-challenge',
      '.problem-content',
      'div[id^="problem_"]',
      'div[id^="question_"]',
      'div[id^="q_"]',
      'div[id^="question-"]',
      'li.gcb-assessment-item',
      '.gcb-form-element',
      '[data-question-id]',
      '.qt-question',
      '.assignment-question',
      '.quiz-question',
      '.question-block',
      '.question-card',
      '.question',
      '.que',
      'fieldset.question',
      'fieldset',
    ];

    let rawContainers: HTMLElement[] = [];
    for (const sel of containerSelectors) {
      const found = Array.from(document.querySelectorAll<HTMLElement>(sel));
      // Filter out containers that don't contain any input or text
      const valid = found.filter((el) => {
        const inputs = el.querySelectorAll('input, select, textarea');
        if (inputs.length === 0) return false;
        // If it's a section, ensure it is an individual question card, not a massive whole-page wrapper
        if (el.tagName === 'SECTION') {
          const names = new Set(Array.from(inputs).map((i) => (i as HTMLInputElement).name || ''));
          names.delete('');
          // If a section contains > 2 different named radio/input groups, it's a page wrapper
          if (names.size > 2) return false;
        }
        return true;
      });
      if (valid.length > 0) {
        rawContainers = valid;
        break;
      }
    }

    // Elevate any sub-containers (e.g. fieldset, choices wrapper) to their enclosing question container if present
    const containers: HTMLElement[] = [];
    const seenContainers = new Set<HTMLElement>();

    if (rawContainers.length > 0) {
      for (const c of rawContainers) {
        const parentProblem = c.closest<HTMLElement>(
          'section, .problem, .wrapper-problem-response, .detailed-problem-challenge, .gcb-form-element, [data-question-id], .assignment-question, .question-card, .quiz-question, .question-block, .que'
        );
        const target = parentProblem && parentProblem !== c && parentProblem.contains(c) ? parentProblem : c;
        if (!seenContainers.has(target)) {
          seenContainers.add(target);
          containers.push(target);
        }
      }
    }

    // Fallback: If no distinct classes found, group by fieldsets or lowest common ancestor of input groups
    if (containers.length === 0) {
      const fieldsets = Array.from(document.querySelectorAll<HTMLElement>('fieldset'));
      const validFieldsets = fieldsets.filter((el) => el.querySelectorAll('input, select, textarea').length > 0);
      if (validFieldsets.length > 0) {
        for (const f of validFieldsets) {
          const parentProblem = f.closest<HTMLElement>(
            '.problem, .wrapper-problem-response, .detailed-problem-challenge, .gcb-form-element, [data-question-id], .assignment-question, .question-card, .quiz-question, .question-block, .que'
          );
          const target = parentProblem && parentProblem !== f && parentProblem.contains(f) ? parentProblem : f;
          if (!seenContainers.has(target)) {
            seenContainers.add(target);
            containers.push(target);
          }
        }
      } else {
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            'input[type="radio"], input[type="checkbox"], input[type="text"], textarea'
          )
        );
        const nameGroups = new Map<string, HTMLInputElement[]>();
        for (const inp of inputs) {
          const key = inp.name || inp.id || `anon-${Math.random()}`;
          if (!nameGroups.has(key)) nameGroups.set(key, []);
          nameGroups.get(key)!.push(inp);
        }

        const discovered = new Set<HTMLElement>();
        for (const group of nameGroups.values()) {
          const enclosing = group[0].closest<HTMLElement>(
            '.problem, .wrapper-problem-response, .detailed-problem-challenge, .gcb-form-element, [data-question-id], .assignment-question, .question-card, .quiz-question, .question-block, .que, fieldset.question'
          );
          if (enclosing) {
            discovered.add(enclosing);
            continue;
          }

          if (group.length === 1) {
            const p =
              (group[0].closest('.question, .problem, li, tr, div') as HTMLElement) ||
              group[0].parentElement ||
              document.body;
            discovered.add(p);
          } else {
            let parent = group[0].parentElement;
            while (parent && parent !== document.body && parent.tagName !== 'FORM') {
              if (group.every((item) => parent!.contains(item))) {
                break;
              }
              parent = parent.parentElement;
            }
            if (parent && parent !== document.body && parent.tagName !== 'FORM') {
              if (
                parent.matches('.choices, .choicegroup, .options, .answers, fieldset, ul, ol') &&
                parent.parentElement &&
                parent.parentElement !== document.body &&
                parent.parentElement.tagName !== 'FORM'
              ) {
                discovered.add(parent.parentElement);
              } else {
                discovered.add(parent);
              }
            } else {
              discovered.add(group[0].parentElement || document.body);
            }
          }
        }
        containers.push(...Array.from(discovered));
      }
    }

    let questionIdx = 1;

    for (const container of containers) {
      // 1. Extract Question Text using dedicated multi-stage extractor
      const questionText = extractQuestionText(container, questionIdx);

      // 2. Discover Input Controls
      const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
      const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
      const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
      const textInputs = Array.from(
        container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea')
      );

      let questionType: QuestionType = 'single-choice';
      let formType: ScannedQuestion['formType'] = 'unknown';
      const options: ScannedOption[] = [];

      if (radios.length > 0) {
        formType = 'radio';
        questionType = radios.length === 2 && /true|false/i.test(radios.map((r) => getAssociatedLabelText(r, container)).join(' '))
          ? 'true-false'
          : 'single-choice';

        radios.forEach((r, idx) => {
          const optText = getAssociatedLabelText(r, container);
          // Set a unique identifier or selector
          if (!r.id) {
            r.id = `swayam404-auto-radio-${questionIdx}-${idx}`;
          }
          options.push({
            id: r.id,
            text: optText,
            value: r.value,
            inputSelector: `#${safeCssEscape(r.id)}`,
          });
        });
      } else if (checkboxes.length > 0) {
        formType = 'checkbox';
        questionType = 'multiple-choice';

        checkboxes.forEach((cb, idx) => {
          const optText = getAssociatedLabelText(cb, container);
          if (!cb.id) {
            cb.id = `swayam404-auto-check-${questionIdx}-${idx}`;
          }
          options.push({
            id: cb.id,
            text: optText,
            value: cb.value,
            inputSelector: `#${safeCssEscape(cb.id)}`,
          });
        });
      } else if (selects.length > 0) {
        formType = 'select';
        questionType = 'single-choice';
        const select = selects[0];
        if (!select.id) {
          select.id = `swayam404-auto-select-${questionIdx}`;
        }
        Array.from(select.options).forEach((opt, idx) => {
          if (opt.value !== '' && opt.text.trim()) {
            options.push({
              id: `${select.id}-opt-${idx}`,
              text: opt.text.trim(),
              value: opt.value,
              inputSelector: `#${safeCssEscape(select.id)}`,
            });
          }
        });
      } else if (textInputs.length > 0) {
        formType = 'text';
        questionType = 'short-text';
        const txt = textInputs[0];
        if (!txt.id) {
          txt.id = `swayam404-auto-text-${questionIdx}`;
        }
        options.push({
          id: txt.id,
          text: 'Short Text Input',
          value: txt.value,
          inputSelector: `#${safeCssEscape(txt.id)}`,
        });
      }

      // Unique container ID for reliable matching
      const containerId =
        container.getAttribute('data-question-id') ||
        container.id ||
        `q-${questionIdx}`;

      results.push({
        id: containerId,
        index: questionIdx,
        questionText,
        questionType,
        formType,
        options,
        controlSelector: container.id ? `#${safeCssEscape(container.id)}` : undefined,
      });

      questionIdx++;
    }

    return results;
  }

  populateQuestion(document: Document, target: PopulationTarget): PopulationItemResult {
    const { questionId, questionText, questionType, selectedAnswers, options } = target;

    if (!selectedAnswers || selectedAnswers.length === 0) {
      return {
        questionId,
        questionText,
        success: false,
        message: 'No answers approved for population.',
        populatedAnswers: [],
      };
    }

    try {
      if (questionType === 'short-text') {
        const textTarget = selectedAnswers[0];
        const opt = options[0];
        if (!opt?.inputSelector) {
          return {
            questionId,
            questionText,
            success: false,
            message: 'Input control selector not found for text field.',
            populatedAnswers: [],
          };
        }

        const input =
          ((opt.id ? document.getElementById(opt.id) : null) as HTMLInputElement | HTMLTextAreaElement | null) ||
          document.querySelector<HTMLInputElement | HTMLTextAreaElement>(opt.inputSelector);
        if (!input || input.disabled) {
          return {
            questionId,
            questionText,
            success: false,
            message: 'Text input element not found or is disabled on the page.',
            populatedAnswers: [],
          };
        }

        dispatchSafeInputEvents(input, textTarget);
        return {
          questionId,
          questionText,
          success: true,
          message: `Populated short text "${textTarget}".`,
          populatedAnswers: [textTarget],
        };
      }

      // Choice-based (Radio, Checkbox, Select)
      const populated: string[] = [];

      if (questionType === 'multiple-choice') {
        const normTargets = new Set(selectedAnswers.map((a) => normalizeOptionText(a)));
        for (const opt of options) {
          if (!opt.inputSelector) continue;
          const control =
            ((opt.id ? document.getElementById(opt.id) : null) as HTMLInputElement | null) ||
            document.querySelector<HTMLInputElement>(opt.inputSelector);
          if (!control || control.disabled || control.type !== 'checkbox') continue;

          const isTarget = normTargets.has(normalizeOptionText(opt.text));
          dispatchSafeCheck(control, isTarget);

          // Verify DOM state
          if (control.checked === isTarget && isTarget) {
            populated.push(opt.text);
          }
        }
      } else {
        // Single-choice (radio, true-false, select)
        const primaryTarget = selectedAnswers[0];
        if (!primaryTarget) {
          return {
            questionId,
            questionText,
            success: false,
            message: 'No target answer selected.',
            populatedAnswers: [],
          };
        }
        const normTarget = normalizeOptionText(primaryTarget);

        for (const opt of options) {
          if (!opt.inputSelector) continue;
          const control =
            ((opt.id ? document.getElementById(opt.id) : null) as HTMLInputElement | HTMLSelectElement | null) ||
            document.querySelector<HTMLInputElement | HTMLSelectElement>(opt.inputSelector);
          if (!control || control.disabled) continue;

          const isTarget = normalizeOptionText(opt.text) === normTarget;

          if (control instanceof HTMLInputElement && control.type === 'radio') {
            if (isTarget) {
              dispatchSafeCheck(control, true);
              if (control.checked) {
                populated.push(opt.text);
              }
            }
          } else if (control instanceof HTMLSelectElement) {
            const optEl = Array.from(control.options).find(
              (o) => normalizeOptionText(o.text) === normTarget || o.value === opt.value
            );
            if (optEl && isTarget) {
              control.value = optEl.value;
              dispatchSafeInputEvents(control, optEl.value);
              if (control.value === optEl.value) {
                populated.push(opt.text);
              }
            }
          }
        }
      }

      if (populated.length === 0) {
        const anyDisabled = options.some((opt) => {
          if (!opt.inputSelector) return false;
          const ctrl = (document.getElementById(opt.id) ||
            document.querySelector(opt.inputSelector)) as HTMLInputElement | null;
          return ctrl && ctrl.disabled;
        });

        const failureMsg = anyDisabled
          ? `Input controls are locked/disabled on this page (assignment has already been submitted or closed).`
          : `Could not safely match control on page for target(s): ${selectedAnswers.join(', ')}.`;

        return {
          questionId,
          questionText,
          success: false,
          message: failureMsg,
          populatedAnswers: [],
        };
      }

      return {
        questionId,
        questionText,
        success: true,
        message: `Successfully set: ${populated.join(', ')}.`,
        populatedAnswers: populated,
      };
    } catch (err) {
      return {
        questionId,
        questionText,
        success: false,
        message: `Error during population: ${(err as Error).message}`,
        populatedAnswers: [],
      };
    }
  }

  /**
   * Cleans raw course title strings by stripping common prefix tags (Course:, SWAYAM:, NPTEL:)
   * and trailing metadata (- Week X, | SWAYAM, Assignment X, Quiz, etc.).
   */
  cleanCourseTitle(title: string): string {
    if (!title) return '';
    let cleaned = title.trim();
    // Strip leading prefixes: "Course:", "SWAYAM:", "NPTEL:", "Course -", etc.
    cleaned = cleaned.replace(/^(?:course|swayam|nptel|portal)\s*[:\/-]\s*/gi, '');
    cleaned = cleaned.replace(/^(?:course|swayam|nptel|portal)\s*[:\/-]\s*/gi, '');
    // Strip trailing suffixes: "- Week X", "| SWAYAM", "- NPTEL", "Assignment X", "Quiz", etc.
    cleaned = cleaned.replace(/\s*[-—|:]\s*(?:swayam|nptel|portal|week\s*\d+|assignment\s*\d+|feedback|quiz).*/gi, '');
    cleaned = cleaned.replace(/\s*\|\s*(?:swayam|nptel).*/gi, '');
    cleaned = cleaned.replace(/\s*[-—]\s*(?:swayam|nptel).*/gi, '');
    return cleaned.trim();
  }

  detectCourseIdentity(
    document: Document,
    url: string = ''
  ): {
    courseTitle?: string;
    externalId?: string;
    assignmentTitle?: string;
    unitTitle?: string;
    unitId?: string;
    assessmentId?: string;
    detectedWeek?: string;
    detectedWeekNumber?: number;
    isAlreadySubmitted?: boolean;
    submissionStatus?: SubmissionStatus;
  } {
    // 1. Detect course title
    let courseTitle: string | undefined = undefined;
    const dataTitle = document.querySelector('[data-course-title]')?.getAttribute('data-course-title');
    if (dataTitle?.trim()) {
      const candidate = this.cleanCourseTitle(dataTitle.trim());
      if (candidate.length > 2) courseTitle = candidate;
    } else {
      const titleSelectors = [
        '.portal-course-header',
        '.course-title',
        'h1.course-name',
        '.gcb-course-title',
        '.header h1',
      ];

      for (const sel of titleSelectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && el.textContent?.trim()) {
          const firstLine = el.textContent.trim().split('\n')[0].trim();
          const candidate = this.cleanCourseTitle(firstLine);
          if (candidate.length > 2) {
            courseTitle = candidate;
            break;
          }
        }
      }
    }

    if (!courseTitle && document.title) {
      const candidate = this.cleanCourseTitle(document.title);
      if (candidate.length > 2) {
        courseTitle = candidate;
      }
    }

    // 2. Detect external course ID (handles /course/ini26_cm22, /courses/noc24-hs101, etc.)
    let externalId: string | undefined = undefined;
    const idAttr = document.querySelector('[data-course-id]')?.getAttribute('data-course-id');
    if (idAttr) {
      externalId = idAttr.trim();
    } else {
      const matchUrl = url.match(/(?:courses?\/|courseId=)([a-zA-Z0-9_-]+)/i);
      if (matchUrl) {
        externalId = matchUrl[1];
      }
    }

    // 3. Detect unitId and assessmentId from URL query params
    let unitId: string | undefined = undefined;
    const unitMatch = url.match(/[?&]unit(?:Id)?=([a-zA-Z0-9_-]+)/i);
    if (unitMatch) {
      unitId = unitMatch[1];
    }

    let assessmentId: string | undefined = undefined;
    const assessMatch = url.match(/[?&]assessment(?:Id)?=([a-zA-Z0-9_-]+)/i);
    if (assessMatch) {
      assessmentId = assessMatch[1];
    }

    // 4. Detect unit title (e.g. Week 3: Elasticity)
    let unitTitle: string | undefined = undefined;
    const unitSelectors = ['.unit-title', '.week-header', '.week-title', 'h3.unit', '.breadcrumb-item:nth-child(2)'];
    for (const sel of unitSelectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && el.textContent?.trim()) {
        unitTitle = el.textContent.trim();
        break;
      }
    }

    // 5. Detect assignment title
    let assignmentTitle: string | undefined = undefined;
    const assignSelectors = [
      '.assignment-title',
      '.quiz-title',
      '.header p',
      '.qt-assignment-title',
      '.header h2',
    ];

    for (const sel of assignSelectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && el.textContent?.trim()) {
        assignmentTitle = el.textContent.trim();
        break;
      }
    }

    // 6. Detect Week and Submission Status
    const weekInfo = extractWeekInfo(document, url);
    const submissionStatus = detectSubmissionStatus(document);

    return {
      courseTitle,
      externalId,
      assignmentTitle,
      unitTitle,
      unitId,
      assessmentId,
      detectedWeek: weekInfo.formattedWeek || (weekInfo.weekNumber ? `Week ${weekInfo.weekNumber}` : undefined),
      detectedWeekNumber: weekInfo.weekNumber,
      isAlreadySubmitted: submissionStatus.isSubmitted,
      submissionStatus,
    };
  }

  scanCourseOutline(
    document: Document,
    url: string = ''
  ): {
    portalCourseTitle?: string;
    externalCourseId?: string;
    tasks: CourseTask[];
  } {
    const identity = this.detectCourseIdentity(document, url);
    const tasks: CourseTask[] = [];

    const outlineContainers = [
      '#course-outline',
      '.course-outline',
      'nav[aria-label="Course"]',
      'nav[aria-label="Course Outline"]',
      '.course-navigation',
      '.course-material',
      '#course-index',
      '.course-content',
      '.gcb-nav-bar',
      'nav.course-nav',
      'nav.course-sidebar',
      'nav.sidebar',
      '.sidebar',
      '.unit-list',
      '.syllabus',
      '.course-units',
      '.week-list',
      '.accordion',
      'main',
      '#content',
    ];

    let container: HTMLElement | null = null;
    for (const sel of outlineContainers) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        container = el;
        break;
      }
    }

    const root = container || document.body;

    const allUnitCandidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.unit-card, .week-block, details, .accordion-item, .unit-container, section.week, .unit-item, .chapter, .section, ol.outline-item, div[class*="chapter"], div[class*="week"], div[class*="unit"], div[class*="module"], .card'
      )
    );
    // Keep only top-level units so nested sections aren't double-processed
    const unitElements = allUnitCandidates.filter(
      (unit) => !allUnitCandidates.some((other) => other !== unit && other.contains(unit))
    );

    const slugify = (text: string) =>
      text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const processTaskItem = (el: HTMLElement, unitName?: string) => {
      const anchor = (el.tagName === 'A' ? el : el.querySelector('a')) as HTMLAnchorElement | null;
      const rawText = el.textContent?.trim() || '';
      if (!rawText) return;

      const clone = el.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll(
          '.status, .badge, .score, svg, .completed, .submitted, [class*="badge"], [class*="status"], [class*="score"], .sr, .sr-only'
        )
        .forEach((c) => c.remove());
      const title = (clone.textContent || '').replace(/\s+/g, ' ').trim() || rawText;
      if (title.length < 2) return;

      // Ignore navigation buttons / tab controls
      if (/^(?:expand all|collapse all|previous|next|course|home|discussion|wiki|progress)$/i.test(title)) {
        return;
      }

      let type: TaskType = 'unknown';
      if (/quiz/i.test(title)) {
        type = 'quiz';
      } else if (/assignment|week\s*\d+\s*assignment|hw|homework|graded/i.test(title)) {
        type = 'assignment';
      } else if (/practice|exercise|self-assessment/i.test(title)) {
        type = 'practice';
      } else if (/feedback|survey/i.test(title)) {
        type = 'feedback';
      } else if (/lecture|video|reading|notes|pdf/i.test(title)) {
        type = 'resource';
      } else {
        type = 'assignment';
      }

      const hasCompletedClass =
        el.matches('.submitted, .completed, .done, .passed, [data-completed="true"], [class*="completed"], [class*="submitted"]') ||
        el.querySelector('.submitted, .completed, .done, .passed, [data-completed="true"], .badge-success, [class*="completed"], [class*="submitted"]') !== null;

      const completionTextMatches = /submitted|score\s*:\s*\d+|completed|graded|points\s*earned|100%/i.test(rawText);
      const portalReportedComplete = hasCompletedClass || completionTextMatches;

      let portalStatusText: string | undefined = undefined;
      if (portalReportedComplete) {
        const scoreMatch = rawText.match(/score\s*:\s*\d+(?:\.\d+)?%?/i);
        portalStatusText = scoreMatch ? scoreMatch[0] : 'Submitted';
      }

      let status: TaskStatus = 'not-scanned';
      if (portalReportedComplete) {
        status = 'completed';
      } else if (type === 'assignment' || type === 'quiz' || type === 'practice') {
        status = 'ready-to-prepare';
      } else if (type === 'resource') {
        status = 'not-scanned';
      } else {
        status = 'unsupported';
      }

      const taskUrl = anchor ? anchor.href : undefined;
      const taskId = el.id || `task-${slugify(unitName || 'general')}-${slugify(title)}`;

      // Deduplicate by taskId or exact title within the same unit
      if (tasks.some((t) => t.id === taskId || (t.title === title && t.unitTitle === unitName))) {
        return;
      }

      tasks.push({
        id: taskId,
        courseId: '',
        title,
        unitTitle: unitName,
        type,
        url: taskUrl,
        targetSelector: el.id ? `#${el.id}` : undefined,
        status,
        portalReportedComplete,
        portalStatusText,
      });
    };

    if (unitElements.length > 0) {
      for (const unit of unitElements) {
        const unitTitleEl = unit.querySelector(
          'summary, .unit-title, .chapter-title, .section-title, h2, h3, h4, .week-header, .header, button[class*="title"], [class*="chapter-title"], [class*="section-title"]'
        );
        const unitTitle = unitTitleEl?.textContent?.trim().replace(/\s+/g, ' ') || 'Unit';

        // Prefer task row elements (.task-row, .lesson-item, .assessment-item, .subsection, .vertical, li)
        let items = Array.from(
          unit.querySelectorAll<HTMLElement>(
            '.task-row, .lesson-item, .assessment-item, .subsection, .vertical, li'
          )
        );

        if (items.length === 0) {
          items = Array.from(
            unit.querySelectorAll<HTMLElement>(
              'a.outline-button, a.unit-link, a[href*="jump_to_id"], a[href*="assignment"], a[href*="assessment"], a[href*="quiz"], a[href*="courseware"]'
            )
          );
        }

        // Retain leaf task elements so parents containing children are not treated as monolithic tasks
        items = items.filter(
          (item) => !items.some((other) => other !== item && item.contains(other))
        );

        if (items.length > 0) {
          for (const item of items) {
            processTaskItem(item, unitTitle);
          }
        } else {
          // Check for direct links inside unit
          const links = Array.from(unit.querySelectorAll<HTMLAnchorElement>('a[href]'));
          for (const link of links) {
            const linkText = link.textContent?.trim() || '';
            if (
              linkText.length > 2 &&
              !/^(?:expand|collapse|menu|home|course|info|discussion|wiki|progress)$/i.test(linkText)
            ) {
              processTaskItem(link, unitTitle);
            }
          }
        }
      }
    } else {
      let rawLinks = Array.from(
        root.querySelectorAll<HTMLElement>(
          '.task-row, .lesson-item, .assessment-item, .subsection, .vertical, li'
        )
      );
      if (rawLinks.length === 0) {
        rawLinks = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a.outline-button, a.unit-link, a[href*="jump_to_id"], a[href*="assignment"], a[href*="assessment"], a[href*="quiz"], a[href*="courseware"]'
          )
        );
      }
      const links = rawLinks.filter(
        (item) => !rawLinks.some((other) => other !== item && item.contains(other))
      );
      for (const link of links) {
        processTaskItem(link);
      }
      if (tasks.length === 0) {
        const allAnchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'));
        for (const anchor of allAnchors) {
          const text = anchor.textContent?.trim() || '';
          if (
            /assignment|quiz|practice|feedback|survey|lecture|week\s*\d+|assessment|test|exam/i.test(
              text
            )
          ) {
            processTaskItem(anchor);
          }
        }
      }
    }

    return {
      portalCourseTitle: identity.courseTitle,
      externalCourseId: identity.externalId,
      tasks,
    };
  }

  captureAssignmentFeedback(
    document: Document,
    url: string = ''
  ): {
    portalCourseTitle?: string;
    externalCourseId?: string;
    assignmentTitle?: string;
    unitTitle?: string;
    capturedRecords: CapturedQuestionRecord[];
  } {
    const identity = this.detectCourseIdentity(document, url);
    const scanned = this.scanQuestions(document);
    const capturedRecords: CapturedQuestionRecord[] = [];

    for (const q of scanned) {
      let container: HTMLElement | null = null;
      if (q.options.length > 0 && q.options[0].inputSelector) {
        const input = document.querySelector(q.options[0].inputSelector);
        if (input) {
          container = input.closest<HTMLElement>(
            '[data-question-id], .gcb-form-element, .qt-question, .assignment-question, .question-card, fieldset'
          );
        }
      }
      if (!container) {
        container = (document.querySelector(`[data-question-id="${safeCssEscape(q.id)}"]`) ||
          document.body) as HTMLElement;
      }

      const acceptedAnswers: string[] = [];
      const selectedOptions: string[] = [];
      let explanation: string | undefined = undefined;
      let verificationSource = 'portal-feedback';
      let hasExplicitFeedback = false;
      let feedbackText: string | undefined = undefined;
      let ambiguityWarning: string | undefined = undefined;

      // 1. Identify what the student currently had selected in the DOM
      for (const opt of q.options) {
        if (opt.inputSelector) {
          const input =
            ((opt.id ? document.getElementById(opt.id) : null) as HTMLInputElement | null) ||
            document.querySelector<HTMLInputElement>(opt.inputSelector);
          if (input && (input.checked || (input.type === 'text' && input.value.trim() !== ''))) {
            selectedOptions.push(opt.text);
          }
        }
      }

      // 2. Check for explicit Option-Level indicators (green checkmark, badge, .correct, etc.)
      const optionElements = Array.from(
        container.querySelectorAll<HTMLElement>('.choice, .choice-label, .gcb-option, label, tr, li')
      );

      for (const optEl of optionElements) {
        const text = optEl.textContent?.trim() || '';
        const isMarkedCorrect =
          optEl.matches('.correct, .correct-answer, .is-correct, .accepted, [data-correct="true"]') ||
          optEl.querySelector(
            '.correct, .correct-answer, .is-correct, .accepted, [data-correct="true"], .badge-success, .text-success, [aria-label="Correct"], .fa-check, svg[data-icon="check"]'
          ) !== null ||
          /\((?:correct|accepted)\)|\[(?:correct|accepted)\]|correct\s*answer|✔/i.test(text);

        if (isMarkedCorrect) {
          const clone = optEl.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('input, select, textarea, .badge, .status, svg, .score').forEach((c) => c.remove());
          const cleanText = clone.textContent?.trim() || text;

          // Match against scanned option text
          const matchedScannedOpt = q.options.find(
            (o) =>
              normalizeOptionText(o.text) === normalizeOptionText(cleanText) ||
              cleanText.includes(o.text) ||
              o.text.includes(cleanText)
          );

          const answerTextToAdd = matchedScannedOpt ? matchedScannedOpt.text : cleanText;
          if (answerTextToAdd && !acceptedAnswers.includes(answerTextToAdd)) {
            acceptedAnswers.push(answerTextToAdd);
            hasExplicitFeedback = true;
            verificationSource = 'option_correct_indicator';
          }
        }
      }

      // 3. Check for Question-Level Feedback Block below / inside container
      const feedbackContainers = Array.from(
        container.querySelectorAll<HTMLElement>(
          '.accepted-answers, .qt-feedback, .gcb-solution, .explanation, .qt-explanation, .solution, .feedback-block, .result-explanation, [data-feedback]'
        )
      );

      for (const fb of feedbackContainers) {
        const fbText = fb.textContent?.trim() || '';
        if (fbText) {
          feedbackText = fbText;

          // Check for Explanation
          const explMatch = fbText.match(/(?:explanation|solution)[:\s]+([\s\S]+?)(?=(?:accepted\s*answers?|score|$))/i);
          if (explMatch) {
            explanation = explMatch[1].trim();
          }

          // Check for Accepted Answers pattern
          const accMatch = fbText.match(
            /(?:accepted\s*answers?|correct\s*answers?|answer)[:\s]+([\s\S]+?)(?=(?:explanation|solution|score|$))/i
          );
          if (accMatch) {
            const rawAnswers = accMatch[1].trim();
            hasExplicitFeedback = true;
            verificationSource = 'portal_accepted_answers_block';

            // Match against scanned options for choice questions
            if (q.questionType !== 'short-text') {
              for (const opt of q.options) {
                const normOpt = normalizeOptionText(opt.text);
                if (
                  rawAnswers.toLowerCase().includes(normOpt) ||
                  (opt.value && rawAnswers.toLowerCase().includes(normalizeOptionText(opt.value)))
                ) {
                  if (!acceptedAnswers.includes(opt.text)) {
                    acceptedAnswers.push(opt.text);
                  }
                }
              }
            }

            // If none of the options matched, or for short-text, extract lines from rawAnswers
            if (acceptedAnswers.length === 0 && rawAnswers) {
              const lines = rawAnswers
                .split(/\n+/)
                .map((l) => l.trim().replace(/^[•\-*]\s*/, ''))
                .filter((l) => l.length > 0 && !/^score/i.test(l));
              acceptedAnswers.push(...lines);
            }
          }
        }
      }

      // 4. Verify Ambiguity and Classification
      let verificationStatus: VerificationStatus = 'unverified';

      if (hasExplicitFeedback && acceptedAnswers.length > 0) {
        if (q.questionType === 'multiple-choice' && acceptedAnswers.length < 2) {
          ambiguityWarning = 'Multiple-choice question with only 1 confirmed option; verify full option set.';
          verificationStatus = 'portal-confirmed';
        } else {
          verificationStatus = 'portal-confirmed';
        }
      } else {
        // No explicit accepted answer feedback found!
        hasExplicitFeedback = false;
        verificationStatus = 'unverified';
        const scoreMatch = container.textContent?.match(/score\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i);
        if (scoreMatch) {
          ambiguityWarning = `Score visible (${scoreMatch[0]}), but portal did not explicitly state which option is correct. Not auto-verified.`;
        } else {
          ambiguityWarning = 'No explicit correct-answer feedback found for this question on the page.';
        }
      }

      capturedRecords.push({
        id: `captured-${q.id || q.index}`,
        questionIndex: q.index,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options.map((o) => o.text),
        selectedOptions,
        acceptedAnswers,
        explanation,
        verificationStatus,
        verificationSource,
        hasExplicitFeedback,
        feedbackText,
        ambiguityWarning,
        isSelectedForSave: hasExplicitFeedback && acceptedAnswers.length > 0,
        portalCourseTitle: identity.courseTitle,
        externalCourseId: identity.externalId,
        assignmentTitle: identity.assignmentTitle,
        unitTitle: identity.unitTitle,
      });
    }

    return {
      portalCourseTitle: identity.courseTitle,
      externalCourseId: identity.externalId,
      assignmentTitle: identity.assignmentTitle,
      unitTitle: identity.unitTitle,
      capturedRecords,
    };
  }
}
