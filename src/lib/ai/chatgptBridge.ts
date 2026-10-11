import { ScannedQuestion, QuestionMatchResult } from '@/types';
import { normalizeOptionText, normalizeQuestionText } from '@/lib/matching/normalizer';

export interface ChatGptPromptParams {
  questions: ScannedQuestion[];
  courseName?: string;
  assignmentTitle?: string;
  batchIndex?: number;
  totalBatches?: number;
}

export interface RawChatGptAnswerItem {
  // Question text or identifier
  question?: string;
  questionText?: string;
  prompt?: string;
  q?: string;
  stem?: string;
  questionNumber?: number | string;
  number?: number | string;
  index?: number | string;
  qNum?: number | string;
  questionId?: string;
  id?: string;

  // Selected option(s)
  selectedOption?: string;
  selectedOptionText?: string;
  selectedOptionTexts?: string[];
  selectedOptions?: string[];
  selectedAnswer?: string;
  selectedAnswers?: string[];
  answer?: string | string[];
  answers?: string[];
  option?: string;
  options?: string[];
  choice?: string;
  choices?: string[];
  selectedOptionId?: string;
  selectedOptionIds?: string[];

  explanation?: string;
  status?: 'suggested' | 'ambiguous' | 'unresolved';
}

export interface MatchedImportItem {
  questionId: string;
  scannedQuestion: ScannedQuestion;
  matchedOptionIds: string[];
  matchedOptionTexts: string[];
  explanation?: string;
  status: 'suggested' | 'ambiguous' | 'unresolved';
  basis: 'chatgpt-suggested';
}

export interface ChatGptImportResult {
  success: boolean;
  totalParsed: number;
  matchedCount: number;
  skippedCount: number;
  invalidCount: number;
  errors: string[];
  matchedItems: MatchedImportItem[];
  invalidItems: { questionId?: string; reason: string }[];
}

export class ChatGptBridgeService {
  /**
   * Constructs a compact, natural academic prompt formatted for ChatGPT.
   * Directly uses real question strings and options without internal DOM IDs.
   */
  static buildPrompt(params: ChatGptPromptParams): string {
    const { questions, courseName, assignmentTitle, batchIndex, totalBatches } = params;

    const batchHeader =
      batchIndex !== undefined && totalBatches !== undefined && totalBatches > 1
        ? ` (Batch ${batchIndex + 1} of ${totalBatches})`
        : '';

    const courseHeader = courseName ? `Course: "${courseName}"` : 'Course: General Education';
    const assignHeader = assignmentTitle ? `\nAssignment: "${assignmentTitle}"` : '';

    const questionBlocks = questions
      .map((q, idx) => {
        const qNum = q.index !== undefined ? q.index : idx + 1;
        const optionLines =
          q.options && q.options.length > 0
            ? q.options
                .map((opt, oIdx) => `   ${String.fromCharCode(65 + oIdx)}. ${opt.text}`)
                .join('\n')
            : '   (Short answer / text response required)';

        const textClean = q.questionText.replace(new RegExp(`^(?:Question\\s*)?${qNum}[.:\\-\\s]+`, 'i'), '').trim();
        const displayQuestion = textClean ? `${qNum}. ${textClean}` : q.questionText;

        return `${displayQuestion}
Options:
${optionLines}`;
      })
      .join('\n\n');

    return `You are an expert academic tutor assisting with assignment questions${batchHeader}.
${courseHeader}${assignHeader}

Analyze each question carefully and select the exact correct answer from the visible options provided.

CRITICAL INSTRUCTIONS:
1. For single-choice, true-false, or dropdown questions, select EXACTLY ONE option.
2. For multiple-choice questions, select ALL options that are correct.
3. Respond in valid JSON format where each entry in "answers" explicitly includes the questionNumber, question string, and the selected option:
{
  "answers": [
    {
      "questionNumber": 1,
      "question": "exact question text",
      "selectedOption": "exact option text"
    }
  ]
}

For multiple-choice questions with multiple correct options:
{
  "questionNumber": 2,
  "question": "exact question text",
  "selectedOptions": ["Option A text", "Option B text"]
}

QUESTIONS TO SOLVE:
${questionBlocks}`;
  }

  /**
   * Splits a large set of questions into manageable prompt batches (default max 10 per batch)
   */
  static createBatches(questions: ScannedQuestion[], batchSize = 10): ScannedQuestion[][] {
    if (questions.length <= batchSize) {
      return [questions];
    }
    const batches: ScannedQuestion[][] = [];
    for (let i = 0; i < questions.length; i += batchSize) {
      batches.push(questions.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Copies text to the system clipboard using extension-compatible APIs with fallback
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback to execCommand
    }

    try {
      if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Opens Web AI (ChatGPT or Claude) in a new browser tab without automating its internal DOM
   */
  static async openChatGptTab(url: string = 'https://chatgpt.com/'): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      await chrome.tabs.create({ url });
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  /**
   * Safely extracts JSON from arbitrary text containing markdown fences or conversational wrapper text
   */
  static extractJsonFromText(rawText: string): unknown {
    let trimmed = rawText.trim();

    // 0. Clean conversational prefixes before JSON markers if any
    trimmed = trimmed.replace(/^[\s\S]*?(?=\{|\[|```)/, '').trim();

    // Helper to safely parse JSON with trailing comma cleanup
    const safeParse = (str: string): unknown => {
      try {
        return JSON.parse(str);
      } catch {
        const cleaned = str.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(cleaned);
      }
    };

    // 1. Try direct parse
    try {
      return safeParse(trimmed);
    } catch {
      // Continue to fence / bracket extraction
    }

    // 2. Strip markdown code fences: ```json ... ``` or ``` ... ``` (even if trailing fence is missing)
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (fenceMatch && fenceMatch[1]) {
      const code = fenceMatch[1].trim();
      try {
        return safeParse(code);
      } catch {
        try {
          return safeParse(`[${code}]`);
        } catch {
          // Continue to bracket search
        }
      }
    }

    // 3. Search for outermost JSON array delimiters [ ... ]
    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = trimmed.substring(firstBracket, lastBracket + 1);
      try {
        return safeParse(candidate);
      } catch {
        // Fall through
      }
    }

    // 4. Search for outermost JSON object delimiters { ... }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.substring(firstBrace, lastBrace + 1);
      try {
        return safeParse(candidate);
      } catch {
        // Candidate could be multiple comma-separated objects: { ... }, { ... }
        try {
          return safeParse(`[${candidate}]`);
        } catch {
          // Fall through
        }
      }
    }

    throw new Error('No valid JSON object or array found in text.');
  }

  /**
   * Helper to robustly find the matching scanned question for a parsed answer item.
   * Prioritizes question text string, then question numbers, then question IDs, then sequential index.
   */
  private static findQuestionForEntry(
    item: RawChatGptAnswerItem,
    itemIndex: number,
    scannedQuestions: ScannedQuestion[],
    matchedTargetQuestionIds: Set<string>
  ): ScannedQuestion | null {
    // 1. Match by Question Number or Index (Primary if provided by AI e.g. questionNumber: 1)
    const rawNum = item.questionNumber ?? item.number ?? item.index ?? item.qNum;
    if (rawNum !== undefined && rawNum !== null) {
      const num = typeof rawNum === 'number' ? rawNum : parseInt(String(rawNum).replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > 0) {
        const found = scannedQuestions.find((q) => q.index === num) || scannedQuestions[num - 1];
        if (found && !matchedTargetQuestionIds.has(found.id)) return found;
      }
    }

    // 2. Match by Question ID / DOM ID if provided (backward compatibility)
    const rawId = item.questionId || item.id;
    if (rawId) {
      const strId = String(rawId).trim();
      const byId = scannedQuestions.find((q) => q.id === strId);
      if (byId) return byId;

      // Extract number from id e.g. "q-1" -> 1 or "q-101" -> 101
      const numInId = parseInt(strId.replace(/\D/g, ''), 10);
      if (!isNaN(numInId) && numInId > 0) {
        const found = scannedQuestions.find((q) => q.index === numInId) || scannedQuestions[numInId - 1];
        if (found) return found;
      }
    }

    // 3. Match by Question Text string (Primary & Most Natural)
    const candidateTexts: string[] = [];
    if (item.question) candidateTexts.push(String(item.question));
    if (item.questionText) candidateTexts.push(String(item.questionText));
    if (item.prompt) candidateTexts.push(String(item.prompt));
    if (item.q && typeof item.q === 'string') candidateTexts.push(item.q);
    if (item.stem) candidateTexts.push(String(item.stem));

    for (const rawCand of candidateTexts) {
      const trimmed = rawCand.trim();
      if (!trimmed) continue;

      const normCand = normalizeQuestionText(trimmed);

      // Exact normalized question match
      for (const q of scannedQuestions) {
        if (normalizeQuestionText(q.questionText) === normCand) {
          return q;
        }
      }

      // High similarity or substring match (if candidate has substantial length)
      if (normCand.length >= 8) {
        for (const q of scannedQuestions) {
          const normQ = normalizeQuestionText(q.questionText);
          if (normQ.length >= 8 && (normQ.includes(normCand) || normCand.includes(normQ))) {
            return q;
          }
        }
      }

      // Word overlap match (45%+ token overlap)
      const candWords = normCand.split(/\s+/).filter((w) => w.length > 2);
      if (candWords.length >= 2) {
        let bestQ: ScannedQuestion | null = null;
        let bestScore = 0;
        for (const q of scannedQuestions) {
          const qWords = new Set(normalizeQuestionText(q.questionText).split(/\s+/).filter((w) => w.length > 2));
          if (qWords.size === 0) continue;
          let overlap = 0;
          for (const w of candWords) {
            if (qWords.has(w)) overlap++;
          }
          const score = overlap / Math.min(candWords.length, qWords.size);
          if (score >= 0.45 && score > bestScore) {
            bestScore = score;
            bestQ = q;
          }
        }
        if (bestQ) return bestQ;
      }

      // Check for leading question numbering e.g. "1. " or "Question 1: " or "Q2)"
      const numMatch = trimmed.match(/^(?:question\s*|q\s*\.?\s*)?(\d+)[\.\)\:\-\s]/i);
      if (numMatch) {
        const qNum = parseInt(numMatch[1], 10);
        const found = scannedQuestions.find((q) => q.index === qNum) || scannedQuestions[qNum - 1];
        if (found) return found;
      }
    }

    // 4. Positional fallback:
    // If an explicit question ID or question number was provided and failed to match, reject it
    if (
      item.questionId ||
      item.id ||
      item.questionNumber !== undefined ||
      item.number !== undefined ||
      item.index !== undefined ||
      item.qNum !== undefined
    ) {
      return null;
    }

    if (itemIndex >= 0 && itemIndex < scannedQuestions.length) {
      const posCandidate = scannedQuestions[itemIndex];
      if (!matchedTargetQuestionIds.has(posCandidate.id)) {
        if (candidateTexts.length > 0) {
          const firstCand = normalizeQuestionText(candidateTexts[0]);
          const candWords = firstCand.split(/\s+/).filter((w) => w.length > 2);
          const qWords = new Set(normalizeQuestionText(posCandidate.questionText).split(/\s+/).filter((w) => w.length > 2));
          let overlap = 0;
          for (const w of candWords) {
            if (qWords.has(w)) overlap++;
          }
          const score = candWords.length > 0 ? overlap / candWords.length : 0;
          if (score >= 0.25) {
            return posCandidate;
          }
        } else {
          return posCandidate;
        }
      }
    }

    return null;
  }

  /**
   * Collects all candidate option values proposed in an answer item
   */
  private static extractProposedOptionValues(
    item: RawChatGptAnswerItem,
    targetQuestion: ScannedQuestion
  ): string[] {
    const rawValues: string[] = [];

    const addVal = (v: unknown) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) {
        v.forEach(addVal);
        return;
      }
      const str = String(v).trim();
      if (!str) return;

      // Handle comma-separated letter lists like "A, C" for multiple-choice questions
      if (targetQuestion.questionType === 'multiple-choice' && /^[A-E](?:\s*,\s*[A-E])+$/i.test(str)) {
        str.split(',').forEach((p) => {
          if (p.trim()) rawValues.push(p.trim());
        });
        return;
      }

      rawValues.push(str);
    };

    addVal(item.selectedOption);
    addVal(item.selectedOptionText);
    addVal(item.selectedOptionTexts);
    addVal(item.selectedOptions);
    addVal(item.selectedAnswer);
    addVal(item.selectedAnswers);
    addVal(item.answer);
    addVal(item.answers);
    addVal(item.option);
    addVal(item.options);
    addVal(item.choice);
    addVal(item.choices);
    addVal((item as Record<string, unknown>).value);
    addVal(item.selectedOptionId);
    addVal(item.selectedOptionIds);

    return rawValues;
  }

  /**
   * Parses and validates raw ChatGPT response text against the scanned questions
   */
  static parseResponse(rawInput: string, scannedQuestions: ScannedQuestion[]): ChatGptImportResult {
    const errors: string[] = [];
    const invalidItems: { questionId?: string; reason: string }[] = [];
    const matchedItems: MatchedImportItem[] = [];

    if (!rawInput || rawInput.trim() === '') {
      return {
        success: false,
        totalParsed: 0,
        matchedCount: 0,
        skippedCount: 0,
        invalidCount: 0,
        errors: ['Pasted response is empty. Please paste the JSON returned by ChatGPT.'],
        matchedItems: [],
        invalidItems: [],
      };
    }

    let parsedData: unknown;
    try {
      parsedData = this.extractJsonFromText(rawInput);
    } catch {
      // If JSON extraction fails, attempt to parse flexible text / numbered list format
      return this.parseTextListResponse(rawInput, scannedQuestions);
    }

    // Normalize input to array of RawChatGptAnswerItem
    let rawAnswers: RawChatGptAnswerItem[] = [];
    if (Array.isArray(parsedData)) {
      rawAnswers = parsedData as RawChatGptAnswerItem[];
    } else if (typeof parsedData === 'object' && parsedData !== null) {
      const obj = parsedData as Record<string, unknown>;
      if (Array.isArray(obj.answers)) {
        rawAnswers = obj.answers as RawChatGptAnswerItem[];
      } else if (Array.isArray(obj.results)) {
        rawAnswers = obj.results as RawChatGptAnswerItem[];
      } else if (Array.isArray(obj.questions)) {
        rawAnswers = obj.questions as RawChatGptAnswerItem[];
      } else if (Array.isArray(obj.solutions)) {
        rawAnswers = obj.solutions as RawChatGptAnswerItem[];
      } else if (Array.isArray(obj.data)) {
        rawAnswers = obj.data as RawChatGptAnswerItem[];
      } else {
        // Direct dictionary mapping of questions to answers
        const entries = Object.entries(obj);
        if (
          entries.length > 0 &&
          entries.every(
            ([k, v]) =>
              typeof k === 'string' &&
              (typeof v === 'string' || typeof v === 'object' || typeof v === 'number')
          )
        ) {
          rawAnswers = entries.map(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
              return { question: key, ...(val as Record<string, unknown>) };
            }
            return { question: key, selectedOption: String(val) };
          });
        }
      }
    }

    if (rawAnswers.length === 0) {
      // Non-standard structure, fallback to text list parser
      const fallbackRes = this.parseTextListResponse(rawInput, scannedQuestions);
      if (fallbackRes.matchedCount > 0) {
        return fallbackRes;
      }

      return {
        success: false,
        totalParsed: 0,
        matchedCount: 0,
        skippedCount: 0,
        invalidCount: 0,
        errors: [
          'Invalid JSON structure: Expected an object with an "answers" array or a direct list of answers.',
        ],
        matchedItems: [],
        invalidItems: [],
      };
    }

    const matchedTargetQuestionIds = new Set<string>();

    for (let i = 0; i < rawAnswers.length; i++) {
      const item = rawAnswers[i];
      if (!item || typeof item !== 'object') {
        invalidItems.push({ reason: `Entry #${i + 1} is not an object.` });
        continue;
      }

      // Find target question by question text string, index, or ID
      const targetQuestion = this.findQuestionForEntry(
        item,
        i,
        scannedQuestions,
        matchedTargetQuestionIds
      );

      if (!targetQuestion) {
        const candidateId = item.questionId || item.id;
        if (candidateId) {
          invalidItems.push({
            questionId: String(candidateId),
            reason: `Question ID "${candidateId}" does not belong to the currently scanned assignment.`,
          });
        } else {
          const identifier =
            item.question ||
            item.questionText ||
            item.prompt ||
            item.questionNumber ||
            `Entry #${i + 1}`;
          invalidItems.push({
            reason: `Question "${identifier}" could not be matched to any question in the currently scanned assignment.`,
          });
        }
        continue;
      }

      if (matchedTargetQuestionIds.has(targetQuestion.id)) {
        const dupId = item.questionId || targetQuestion.id;
        invalidItems.push({
          questionId: dupId,
          reason: `Duplicate answer entry for question ID "${dupId}".`,
        });
        continue;
      }
      matchedTargetQuestionIds.add(targetQuestion.id);

      // Collect proposed option values from all possible answer properties
      const rawOptValues = this.extractProposedOptionValues(item, targetQuestion);

      // For short-text questions
      if (targetQuestion.questionType === 'short-text') {
        const textAnswer = rawOptValues[0] || '';
        if (textAnswer) {
          matchedItems.push({
            questionId: targetQuestion.id,
            scannedQuestion: targetQuestion,
            matchedOptionIds: [],
            matchedOptionTexts: [textAnswer],
            explanation: item.explanation,
            status: item.status || 'suggested',
            basis: 'chatgpt-suggested',
          });
        } else {
          invalidItems.push({
            questionId: targetQuestion.id,
            reason: `No text answer provided for short-text question "${targetQuestion.id}".`,
          });
        }
        continue;
      }

      // Validate option references against target question's visible options
      const matchedOptIds: string[] = [];
      const matchedOptTexts: string[] = [];

      for (const val of rawOptValues) {
        let found: { id: string; text: string } | undefined;

        // 1. Match by Option Text (exact & normalized)
        const normVal = normalizeOptionText(val);
        found = targetQuestion.options.find((o) => {
          const normOpt = normalizeOptionText(o.text);
          return normOpt === normVal || o.text.trim().toLowerCase() === val.toLowerCase();
        });

        // 2. Match by Option Letter prefix (e.g. "B. Angel", "B", "(B)", "B.", "Option B", "B - Bootstrapping")
        const lMatch = val.match(/^(?:(?:option|choice)\s*)?\(?([A-E])\)?(?:\s*[\.\:\-\)]\s*(.*))?$/i);
        if (lMatch) {
          const letterIdx = lMatch[1].toUpperCase().charCodeAt(0) - 65;
          const letterCandidate = targetQuestion.options[letterIdx];
          if (!found && letterCandidate) {
            found = letterCandidate;
          }
        }

        // 3. Substring / fuzzy match on option text if length >= 3
        if (!found && normVal.length >= 3) {
          found = targetQuestion.options.find((o) => {
            const normOpt = normalizeOptionText(o.text);
            return (
              normOpt.includes(normVal) ||
              normVal.includes(normOpt) ||
              o.text.toLowerCase().includes(val.toLowerCase()) ||
              val.toLowerCase().includes(o.text.toLowerCase())
            );
          });
        }

        // 4. Match by Option ID directly (for backward compatibility)
        if (!found) {
          found = targetQuestion.options.find((o) => o.id === val);
        }

        if (found && !matchedOptIds.includes(found.id)) {
          matchedOptIds.push(found.id);
          matchedOptTexts.push(found.text);
        }
      }

      if (matchedOptIds.length > 0) {
        // Enforce single-choice constraint if needed
        if (
          (targetQuestion.questionType === 'single-choice' ||
            targetQuestion.questionType === 'true-false') &&
          matchedOptTexts.length > 1
        ) {
          matchedItems.push({
            questionId: targetQuestion.id,
            scannedQuestion: targetQuestion,
            matchedOptionIds: [matchedOptIds[0]],
            matchedOptionTexts: [matchedOptTexts[0]],
            explanation: `${item.explanation || ''} (Trimmed multiple answers to single option).`.trim(),
            status: 'suggested',
            basis: 'chatgpt-suggested',
          });
        } else {
          matchedItems.push({
            questionId: targetQuestion.id,
            scannedQuestion: targetQuestion,
            matchedOptionIds: matchedOptIds,
            matchedOptionTexts: matchedOptTexts,
            explanation: item.explanation,
            status: item.status || 'suggested',
            basis: 'chatgpt-suggested',
          });
        }
      } else {
        const attempted = rawOptValues.join(', ') || 'none';
        invalidItems.push({
          questionId: targetQuestion.id,
          reason: `Proposed option (${attempted}) does not match any visible option on question "${targetQuestion.id}".`,
        });
      }
    }

    const skippedCount = Math.max(0, scannedQuestions.length - matchedItems.length);

    return {
      success: matchedItems.length > 0,
      totalParsed: rawAnswers.length,
      matchedCount: matchedItems.length,
      skippedCount,
      invalidCount: invalidItems.length,
      errors,
      matchedItems,
      invalidItems,
    };
  }

  /**
   * Resilient fallback parser that handles human-like or markdown numbered lists, e.g.:
   * 1. B - Innovation
   * 2. (A) Angel Investors
   * Question 3: C
   */
  static parseTextListResponse(
    rawInput: string,
    scannedQuestions: ScannedQuestion[]
  ): ChatGptImportResult {
    const matchedItems: MatchedImportItem[] = [];
    const invalidItems: { questionId?: string; reason: string }[] = [];
    const questionIndexMap = new Map<number, ScannedQuestion>();

    for (let i = 0; i < scannedQuestions.length; i++) {
      const q = scannedQuestions[i];
      questionIndexMap.set(q.index, q);
      questionIndexMap.set(i + 1, q); // also 1-based sequential index
    }

    // Split by newlines, or inline question delimiters like "1. B, 2. A" or "; 2. "
    const normalized = rawInput.replace(/[,;]\s*(?=(?:Question|Q\.?|\d+)[\.\)\:\-\s])/gi, '\n');
    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Strip leading markdown bullets (*, -, +) or header hashes (#) and bold asterisks (**)
      const clean = line
        .replace(/^[\*\-\+\#\s]+/, '')
        .replace(/\*\*/g, '')
        .trim();

      // Matches: "1. B", "1) B", "Question 1: B", "Q1: (B)", "1 - A", "Q.01: B", "1 B", "### 1. B"
      const lineMatch = clean.match(
        /^(?:(?:Question|Q\.?)\s*(\d+)|(\d+)[\.\)\:\-\s])\s*[:\-\.]?\s*(.*)$/i
      );

      if (!lineMatch) continue;

      const qNum = parseInt(lineMatch[1] || lineMatch[2], 10);
      const answerContent = (lineMatch[3] || '').trim();

      const targetQuestion = questionIndexMap.get(qNum);
      if (!targetQuestion) continue;

      if (matchedItems.some((m) => m.questionId === targetQuestion.id)) continue;

      if (targetQuestion.questionType === 'short-text') {
        if (answerContent) {
          matchedItems.push({
            questionId: targetQuestion.id,
            scannedQuestion: targetQuestion,
            matchedOptionIds: [],
            matchedOptionTexts: [answerContent],
            explanation: 'Answer extracted from ChatGPT web response.',
            status: 'suggested',
            basis: 'chatgpt-suggested',
          });
        }
        continue;
      }

      const matchedOptIds: string[] = [];
      const matchedOptTexts: string[] = [];

      // Check letter references A, B, C, D, E
      const letterMatches = Array.from(
        answerContent.matchAll(/(?:\b|\()([A-E])(?:\b|\.|\)|\:|\-|\s|$)/gi)
      ).map((m) => m[1].toUpperCase());

      if (letterMatches.length > 0) {
        for (const letter of letterMatches) {
          const letterIdx = letter.charCodeAt(0) - 65;
          if (targetQuestion.options[letterIdx]) {
            const opt = targetQuestion.options[letterIdx];
            if (!matchedOptIds.includes(opt.id)) {
              matchedOptIds.push(opt.id);
              matchedOptTexts.push(opt.text);
            }
          }
        }
      }

      // If no letters matched, check option texts
      if (matchedOptIds.length === 0 && targetQuestion.options.length > 0) {
        const normAnswer = normalizeOptionText(answerContent);
        for (const opt of targetQuestion.options) {
          const normOpt = normalizeOptionText(opt.text);
          if (
            normAnswer === normOpt ||
            normAnswer.includes(normOpt) ||
            normOpt.includes(normAnswer)
          ) {
            if (!matchedOptIds.includes(opt.id)) {
              matchedOptIds.push(opt.id);
              matchedOptTexts.push(opt.text);
            }
          }
        }
      }

      if (matchedOptIds.length > 0) {
        const isSingle =
          targetQuestion.questionType === 'single-choice' ||
          targetQuestion.questionType === 'true-false';
        const finalIds = isSingle ? [matchedOptIds[0]] : matchedOptIds;
        const finalTexts = isSingle ? [matchedOptTexts[0]] : matchedOptTexts;

        matchedItems.push({
          questionId: targetQuestion.id,
          scannedQuestion: targetQuestion,
          matchedOptionIds: finalIds,
          matchedOptionTexts: finalTexts,
          explanation: `Answer matched from ChatGPT web output: "${answerContent.slice(0, 80)}"`,
          status: 'suggested',
          basis: 'chatgpt-suggested',
        });
      } else {
        invalidItems.push({
          questionId: targetQuestion.id,
          reason: `Could not match any option for question #${qNum} from text: "${answerContent}"`,
        });
      }
    }

    const skippedCount = Math.max(0, scannedQuestions.length - matchedItems.length);

    return {
      success: matchedItems.length > 0,
      totalParsed: lines.length,
      matchedCount: matchedItems.length,
      skippedCount,
      invalidCount: invalidItems.length,
      errors:
        matchedItems.length === 0
          ? [
              'Failed to parse JSON: No valid JSON or question answers could be matched from the pasted text. Please make sure the output contains question numbers (e.g. "1. B" or "Question 1: Option A") or valid JSON.',
            ]
          : [],
      matchedItems,
      invalidItems,
    };
  }

  /**
   * Merges imported ChatGPT suggestions into existing review state without overwriting
   * portal-confirmed or verified records.
   */
  static mergeImportedAnswers(
    currentResults: QuestionMatchResult[],
    importResult: ChatGptImportResult
  ): {
    updatedResults: QuestionMatchResult[];
    mergedCount: number;
    protectedCount: number;
  } {
    const importMap = new Map<string, MatchedImportItem>(
      importResult.matchedItems.map((item) => [item.questionId, item])
    );

    let mergedCount = 0;
    let protectedCount = 0;

    const updatedResults = currentResults.map((r) => {
      const imported = importMap.get(r.scannedQuestion.id);
      if (!imported) {
        return r;
      }

      // CRITICAL SAFEGUARD: Do not overwrite portal-confirmed or existing verified records
      const isPortalConfirmed =
        r.resolutionState === 'portal-confirmed' ||
        r.matchedRecord?.reviewStatus === 'portal-confirmed';
      const isVerified =
        r.resolutionState === 'student-reviewed' ||
        r.matchedRecord?.reviewStatus === 'verified' ||
        r.matchedRecord?.reviewStatus === 'student-reviewed';

      if (isPortalConfirmed || isVerified) {
        protectedCount++;
        return r; // Protected from overwrite
      }

      mergedCount++;

      return {
        ...r,
        resolutionState: 'chatgpt-suggested' as const,
        status: 'probable-match' as const,
        proposedAnswers: imported.matchedOptionTexts,
        aiExplanation:
          imported.explanation ||
          'Suggested via ChatGPT manual session import.',
        isApproved: false, // Explicit user review required before population
        requiresReview: true,
        reasons: [
          'Imported from ChatGPT session. Review carefully before approving.',
        ],
        basis: 'ai-reasoning' as const,
        candidateOptions: r.scannedQuestion.options.map((o) => o.text),
      };
    });

    return {
      updatedResults,
      mergedCount,
      protectedCount,
    };
  }
}
