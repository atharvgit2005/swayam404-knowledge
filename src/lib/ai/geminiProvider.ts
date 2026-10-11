import { ILlmProvider, LlmPromptContext } from './types';
import { LlmAnswerResponse, LlmRecommendation, AnswerBasis } from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export class GeminiProvider implements ILlmProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  async testConnection(
    apiKey: string,
    model = 'gemini-2.5-flash'
  ): Promise<{ success: boolean; message: string }> {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, message: 'Gemini API key is required.' };
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: 'Respond with the single word "OK" if this connection test succeeded.' }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 20,
          },
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        let parsedMessage = errorBody.slice(0, 200);
        try {
          const errJson = JSON.parse(errorBody);
          if (errJson?.error?.message) {
            parsedMessage = errJson.error.message;
          }
        } catch {}

        if ((res.status === 400 && parsedMessage.includes('API_KEY_INVALID')) || res.status === 401 || res.status === 403) {
          return {
            success: false,
            message: `Gemini authentication failed (HTTP ${res.status}): Invalid API key.`,
          };
        }
        if (res.status === 429) {
          return {
            success: false,
            message: `Gemini quota or rate limit exceeded (HTTP 429): ${parsedMessage}.`,
          };
        }
        return {
          success: false,
          message: `Gemini API error (HTTP ${res.status}): ${parsedMessage}`,
        };
      }

      return {
        success: true,
        message: `Successfully connected to Gemini using model "${model}".`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Network failure connecting to Gemini: ${(err as Error).message}`,
      };
    }
  }

  async recommendAnswer(
    context: LlmPromptContext,
    apiKey: string,
    model = 'gemini-2.5-flash'
  ): Promise<LlmAnswerResponse> {
    if (!apiKey || apiKey.trim() === '') {
      return {
        provider: this.id,
        model,
        recommendations: [
          {
            questionId: context.questionId,
            recommendedAnswers: [],
            explanation: 'Gemini API key not configured in Settings.',
            basis: 'unresolved',
            uncertaintyReasons: ['API key missing in settings.'],
            needsReview: true,
          },
        ],
        error: 'API key missing in settings.',
      };
    }

    const prompt = this.buildPrompt(context);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedMessage = errText.slice(0, 150);
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.message) {
            parsedMessage = errJson.error.message;
          }
        } catch {}

        const isAuth = (response.status === 400 && parsedMessage.includes('API_KEY_INVALID')) || response.status === 401 || response.status === 403;
        const isQuota = response.status === 429 || parsedMessage.toLowerCase().includes('quota') || parsedMessage.toLowerCase().includes('resource_exhausted');
        const isModel = response.status === 404;

        const formattedErr = isAuth
          ? `[Auth Error ${response.status}] Invalid or unauthorized Gemini API key: ${parsedMessage}`
          : isQuota
          ? `[Quota Error 429] Gemini API rate limit or quota exceeded: ${parsedMessage}`
          : isModel
          ? `[Model Error 404] Gemini model "${model}" not found or unsupported: ${parsedMessage}`
          : `[API Error ${response.status}] ${parsedMessage}`;

        return {
          provider: this.id,
          model,
          recommendations: [
            {
              questionId: context.questionId,
              recommendedAnswers: [],
              explanation: formattedErr,
              basis: 'unresolved',
              uncertaintyReasons: [formattedErr],
              needsReview: true,
            },
          ],
          error: formattedErr,
        };
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        return {
          provider: this.id,
          model,
          recommendations: [
            {
              questionId: context.questionId,
              recommendedAnswers: [],
              explanation: 'Empty response received from Gemini.',
              basis: 'unresolved',
              uncertaintyReasons: ['Model returned empty candidates.'],
              needsReview: true,
            },
          ],
          error: 'Empty response',
        };
      }

      const rec = this.parseAndValidateRecommendation(rawText, context);
      return {
        provider: this.id,
        model,
        recommendations: [rec],
      };
    } catch (err) {
      return {
        provider: this.id,
        model,
        recommendations: [
          {
            questionId: context.questionId,
            recommendedAnswers: [],
            explanation: `Error calling Gemini: ${(err as Error).message}`,
            basis: 'unresolved',
            uncertaintyReasons: [(err as Error).message],
            needsReview: true,
          },
        ],
        error: (err as Error).message,
      };
    }
  }

  private buildPrompt(context: LlmPromptContext): string {
    const excerptsText =
      context.retrievedExcerpts && context.retrievedExcerpts.length > 0
        ? context.retrievedExcerpts
            .slice(0, 3)
            .map((e, idx) => {
              const srcTitle = e.sourceTitle || e.title || e.materialTitle;
              const metaParts = [
                srcTitle,
                e.lectureId ? `Lecture: ${e.lectureId}` : '',
                e.timestamp ? `Timestamp: ${e.timestamp}` : '',
                e.unitTitle ? `Unit: ${e.unitTitle}` : '',
                e.retrievalSource === 'shared-knowledge-base' ? 'Shared Knowledge Base' : 'Local Notes',
                e.license ? `License: ${e.license}` : '',
              ].filter(Boolean);

              const boundedExcerpt = e.excerpt.length > 400 ? `${e.excerpt.slice(0, 400)}...` : e.excerpt;
              return `[Source Excerpt ${idx + 1} (${metaParts.join(' | ')})]:\n"${boundedExcerpt}"`;
            })
            .join('\n\n')
        : 'No specific course lecture excerpts available for this question.';

    const historicalText = context.historicalExample
      ? `[Relevant Historical Answer Record]:\nQuestion: "${context.historicalExample.questionText}"\nAccepted Answers: ${JSON.stringify(
          context.historicalExample.acceptedAnswers
        )}\nExplanation: "${context.historicalExample.explanation || ''}"`
      : '';

    return `You are an educational assessment assistant for the course "${context.courseTitle}".
Your task is to analyze the following question and select the exact correct answer(s) from the provided visible options.

COURSE CONTEXT:
Course: ${context.courseTitle}
${context.unitOrWeek ? `Module/Week: ${context.unitOrWeek}` : ''}

RELEVANT COURSE MATERIAL EXCERPTS:
${excerptsText}

${historicalText}

TARGET QUESTION:
Question Text: "${context.questionText}"
Question Type: ${context.questionType}
Visible Options:
${context.options.map((opt, i) => `${i + 1}. "${opt}"`).join('\n')}

STRICT RULES:
1. Base explanations on provided evidence where possible. Do NOT invent citations or references not provided in the excerpts.
2. If the provided evidence is insufficient, conflicting, or absent, explicitly note this in uncertaintyReasons.
3. For single-choice, true-false, or dropdown questions, recommend EXACTLY ONE option from the Visible Options. The text must match one of the visible options verbatim.
4. For multiple-choice questions, recommend the COMPLETE set of all correct options from the Visible Options. Every recommended answer must match a visible option verbatim.
5. For short-text questions, provide the exact expected concise answer.
6. If you have supporting evidence from the course material excerpts, set basis to "course-material" and cite the excerpt in the evidence field.
7. If the answer is based on general subject reasoning without direct lecture quotes, set basis to "ai-reasoning".
8. If the question is ambiguous or you cannot determine the answer with certainty, set basis to "unresolved", leave recommendedAnswers empty, and explain why in uncertaintyReasons. Do NOT invent an answer when evidence is insufficient.
9. Return ONLY valid JSON adhering to the schema below.

JSON SCHEMA:
{
  "questionId": "${context.questionId}",
  "recommendedAnswers": ["string"],
  "explanation": "string",
  "evidence": "string",
  "basis": "portal-confirmed" | "course-material" | "ai-reasoning" | "unresolved",
  "uncertaintyReasons": ["string"],
  "needsReview": boolean
}`;
  }

  /**
   * Safely parses and validates a single LLM recommendation
   */
  public parseAndValidateRecommendation(rawText: string, context: LlmPromptContext): LlmRecommendation {
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(rawText.trim());
      } catch {
        const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch && fenceMatch[1]) {
          try {
            parsed = JSON.parse(fenceMatch[1].trim());
          } catch {
            // continue
          }
        }
        if (!parsed) {
          const firstBrace = rawText.indexOf('{');
          const lastBrace = rawText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
          } else {
            throw new Error('No JSON object found in Gemini response.');
          }
        }
      }

      let basis: AnswerBasis = 'ai-reasoning';
      if (
        ['portal-confirmed', 'course-material', 'ai-reasoning', 'unresolved'].includes(
          parsed.basis
        )
      ) {
        basis = parsed.basis;
      }

      let recommendedAnswers: string[] = Array.isArray(parsed.recommendedAnswers)
        ? parsed.recommendedAnswers.map((a: unknown) => String(a).trim()).filter(Boolean)
        : [];

      const uncertaintyReasons: string[] = Array.isArray(parsed.uncertaintyReasons)
        ? parsed.uncertaintyReasons.map((u: unknown) => String(u).trim()).filter(Boolean)
        : [];

      let needsReview = Boolean(parsed.needsReview);

      // Validate option references against visible options
      if (context.options.length > 0 && recommendedAnswers.length > 0) {
        const validatedAnswers: string[] = [];
        for (const ans of recommendedAnswers) {
          const normAns = normalizeOptionText(ans);
          const matchedOpt = context.options.find(
            (opt) =>
              normalizeOptionText(opt) === normAns ||
              opt.toLowerCase().includes(normAns) ||
              normAns.includes(normalizeOptionText(opt))
          );
          if (matchedOpt) {
            validatedAnswers.push(matchedOpt);
          } else {
            uncertaintyReasons.push(`Model hallucinated option "${ans}" which does not match visible options.`);
            needsReview = true;
          }
        }
        recommendedAnswers = validatedAnswers;
      }

      // Check single-choice constraint
      if (
        (context.questionType === 'single-choice' || context.questionType === 'true-false') &&
        recommendedAnswers.length > 1
      ) {
        uncertaintyReasons.push('Model returned multiple answers for a single-choice question.');
        recommendedAnswers = [recommendedAnswers[0]];
        needsReview = true;
      }

      // If no valid answers remained
      if (recommendedAnswers.length === 0 && context.options.length > 0) {
        return {
          questionId: context.questionId,
          recommendedAnswers: [],
          explanation: parsed.explanation || 'No valid options could be matched from AI response.',
          evidence: parsed.evidence,
          basis: 'unresolved',
          uncertaintyReasons: uncertaintyReasons.length > 0 ? uncertaintyReasons : ['No valid option match found.'],
          needsReview: true,
        };
      }

      // AI reasoning alone without direct course material citation always flags needsReview
      if (basis === 'ai-reasoning' && (!parsed.evidence || parsed.evidence.trim() === '')) {
        needsReview = true;
      }

      return {
        questionId: context.questionId,
        recommendedAnswers,
        explanation: parsed.explanation || 'AI suggestion provided.',
        evidence: parsed.evidence,
        confidence: typeof parsed.confidence === 'number' && !isNaN(parsed.confidence) ? parsed.confidence : undefined,
        basis,
        uncertaintyReasons,
        needsReview,
      };
    } catch (parseErr) {
      return {
        questionId: context.questionId,
        recommendedAnswers: [],
        explanation: `Failed to parse AI structured response: ${(parseErr as Error).message}`,
        basis: 'unresolved',
        uncertaintyReasons: ['Malformed JSON from LLM.'],
        needsReview: true,
      };
    }
  }
}

export const geminiProvider = new GeminiProvider();
