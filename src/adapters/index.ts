import {
  ScannedQuestion,
  ScannedOption,
  PopulationTarget,
  PopulationItemResult,
  QuestionType,
} from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export interface ISiteAdapter {
  name: string;
  canHandle(document: Document, url: string): boolean;
  scanQuestions(document: Document): ScannedQuestion[];
  populateQuestion(document: Document, target: PopulationTarget): PopulationItemResult;
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
 * Safely clicks an input (like radio or checkbox) with proper event bubbling and React tracker support
 */
export function dispatchSafeClick(input: HTMLInputElement): void {
  const prototype = Object.getPrototypeOf(input);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'checked')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, true);
  } else {
    input.checked = true;
  }

  input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
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
      clone.querySelectorAll('input, select, textarea').forEach((el) => el.remove());
      const txt = clone.textContent?.trim();
      if (txt) return txt;
    }
  }

  // 2. Check <label for="inputId">
  if (input.id) {
    const doc = input.ownerDocument || document;
    const label = doc.querySelector(`label[for="${safeCssEscape(input.id)}"]`);
    if (label && label.textContent?.trim()) {
      return label.textContent.trim();
    }
  }

  // 3. Check enclosing <label>
  const parentLabel = input.closest('label');
  if (parentLabel && parentLabel.textContent?.trim()) {
    // Clone to remove input text itself if present
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    const innerInputs = clone.querySelectorAll('input, select, textarea');
    innerInputs.forEach((i) => i.remove());
    if (clone.textContent?.trim()) {
      return clone.textContent.trim();
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
 * SWAYAM Portal & Generic Educational Assessment Adapter
 */
export class SwayamPortalAdapter implements ISiteAdapter {
  name = 'SwayamPortalAdapter';

  canHandle(document: Document, url: string): boolean {
    const isSwayamUrl = /swayam\.gov\.in/i.test(url) || /localhost|127\.0\.0\.1/i.test(url);
    const hasContainers =
      document.querySelectorAll(
        '.gcb-form-element, .qt-question, .assignment-question, .question-card, fieldset, [data-question-id]'
      ).length > 0;
    return isSwayamUrl || hasContainers;
  }

  scanQuestions(document: Document): ScannedQuestion[] {
    const results: ScannedQuestion[] = [];

    // Prioritized selectors for question containers
    const containerSelectors = [
      '[data-question-id]',
      '.gcb-form-element',
      '.qt-question',
      '.assignment-question',
      '.quiz-question',
      '.question-block',
      '.question-card',
      'fieldset.question',
      'fieldset',
    ];

    let containers: HTMLElement[] = [];
    for (const sel of containerSelectors) {
      const found = Array.from(document.querySelectorAll<HTMLElement>(sel));
      // Filter out containers that don't contain any input or text
      const valid = found.filter((el) => el.querySelectorAll('input, select, textarea').length > 0);
      if (valid.length > 0) {
        containers = valid;
        break;
      }
    }

    // Fallback: If no distinct classes found, group by fieldsets or lowest common ancestor of input groups
    if (containers.length === 0) {
      const fieldsets = Array.from(document.querySelectorAll<HTMLElement>('fieldset'));
      if (fieldsets.length > 0) {
        containers = fieldsets;
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
          if (group.length === 1) {
            const p = (group[0].closest('.question, .problem, li, tr, div') as HTMLElement) || group[0].parentElement || document.body;
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
              discovered.add(parent);
            } else {
              discovered.add(group[0].parentElement || document.body);
            }
          }
        }
        containers = Array.from(discovered);
      }
    }

    let questionIdx = 1;

    for (const container of containers) {
      // 1. Extract Question Text
      let questionText = '';
      const textSelectors = [
        '.qt-question-text',
        '.question-title',
        '.question-text',
        '.gcb-question-label',
        'legend',
        'h2, h3, h4, h5',
        '.prompt',
        '.header',
      ];

      for (const tSel of textSelectors) {
        const titleEl = container.querySelector<HTMLElement>(tSel);
        if (titleEl && titleEl.textContent?.trim()) {
          questionText = titleEl.textContent.trim();
          break;
        }
      }

      // If still empty, inspect the first non-input paragraph or top text
      if (!questionText) {
        const p = container.querySelector<HTMLElement>('p');
        if (p && p.textContent?.trim()) {
          questionText = p.textContent.trim();
        } else {
          // Clone container and strip options/inputs to get prompt
          const clone = container.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('input, select, textarea, label, button').forEach((el) => el.remove());
          questionText = clone.textContent?.trim() || `Question ${questionIdx}`;
        }
      }

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
        `q-discovered-${questionIdx}`;

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

      for (const targetAnswerText of selectedAnswers) {
        const normTarget = normalizeOptionText(targetAnswerText);
        // Find corresponding scanned option
        const matchedOpt = options.find((o) => normalizeOptionText(o.text) === normTarget);

        if (!matchedOpt || !matchedOpt.inputSelector) {
          continue;
        }

        const control =
          ((matchedOpt.id ? document.getElementById(matchedOpt.id) : null) as HTMLInputElement | HTMLSelectElement | null) ||
          document.querySelector<HTMLInputElement | HTMLSelectElement>(matchedOpt.inputSelector);
        if (!control || control.disabled) {
          continue;
        }

        if (control instanceof HTMLInputElement) {
          if (control.type === 'radio' || control.type === 'checkbox') {
            dispatchSafeClick(control);
            populated.push(matchedOpt.text);
          }
        } else if (control instanceof HTMLSelectElement) {
          // Select dropdown
          const optEl = Array.from(control.options).find(
            (o) => normalizeOptionText(o.text) === normTarget || o.value === matchedOpt.value
          );
          if (optEl) {
            control.value = optEl.value;
            dispatchSafeInputEvents(control, optEl.value);
            populated.push(matchedOpt.text);
          }
        }
      }

      if (populated.length === 0) {
        return {
          questionId,
          questionText,
          success: false,
          message: `Could not safely match control on page for target(s): ${selectedAnswers.join(', ')}.`,
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
}
