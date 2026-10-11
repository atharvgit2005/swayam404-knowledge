import { ILlmProvider, LlmPromptContext } from './types';
import { LlmAnswerResponse, LlmRecommendation, AnswerBasis } from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export class OpenAiProvider implements ILlmProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  async testConnection(
    apiKey: string,
    model = 'gpt-4o-mini'
  ): Promise<{ success: boolean; message: string }> {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, message: 'OpenAI API key is required.' };
    }

    try {
      const endpoint = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim() || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: 'Respond with the single word OK if this connection test succeeded.',
            },
          ],
          max_tokens: 10,
          temperature: 0.1,
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

        if (res.status === 401) {
          return {
            success: false,
            message: `OpenAI authentication failed (HTTP 401): Invalid API key. Note: OpenAI API requires an API credit balance, separate from ChatGPT Plus web subscriptions.`,
          };
        }
        if (res.status === 429) {
          return {
            success: false,
            message: `OpenAI quota or rate limit exceeded (HTTP 429): ${parsedMessage}. Check your OpenAI API account billing credits.`,
          };
        }

        return {
          success: false,
          message: `OpenAI API error (HTTP ${res.status}): ${parsedMessage}`,
        };
      }

      return {
        success: true,
        message: `Successfully connected to OpenAI using model "${model}".`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Network failure connecting to OpenAI: ${(err as Error).message}`,
      };
    }
  }

  async recommendAnswer(
    context: LlmPromptContext,
    apiKey: string,
    model = 'gpt-4o-mini'
  ): Promise<LlmAnswerResponse> {
    if (!apiKey || apiKey.trim() === '') {
      return {
        provider: this.id,
        model,
        recommendations: [
          {
            questionId: context.questionId,
            recommendedAnswers: [],
            explanation: 'OpenAI API key not configured in Settings.',
            basis: 'unresolved',
            uncertaintyReasons: ['OpenAI API key missing in extension settings.'],
            needsReview: true,
          },
        ],
        error: 'API key missing in settings.',
      };
    }

    try {
      const systemPrompt = `You are an educational assessment assistant aiding university students on the SWAYAM / NPTEL learning portal.
Your task is to analyze the assigned question, review provided lecture notes or domain concepts, and select the exact correct answer(s) from the visible options.

CRITICAL RULES:
1. For single-choice, true-false, or dropdown questions, recommend EXACTLY ONE option from the Visible Options. Your recommended answer MUST match the visible option verbatim.
2. For multiple-choice questions (checkboxes), recommend all options that are demonstrably correct. Each answer must match a visible option verbatim.
3. For short-text questions, output the concise, exact formula or numerical response required.
4. NEVER invent, modify, or hallucinate option text not present in the Visible Options.
5. If the question is ambiguous or context is insufficient, set basis to "unresolved", set needsReview to true, and explain why.
6. Return ONLY a single valid JSON object adhering strictly to this schema:
{
  "questionId": "${context.questionId}",
  "recommendedAnswers": ["Exact Option Text"],
  "explanation": "Concise 1-2 sentence academic rationale",
  "evidence": "Direct quote or principle from lecture context if available",
  "basis": "course-material" | "ai-reasoning" | "unresolved",
  "uncertaintyReasons": ["Reason why ambiguous (if any)"],
  "needsReview": false | true
}`;

      const userPrompt = this.buildPrompt(context);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim() || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedMessage = errorText.slice(0, 150);
        try {
          const errJson = JSON.parse(errorText);
          if (errJson?.error?.message) {
            parsedMessage = errJson.error.message;
          }
        } catch {}

        const isAuth = response.status === 401;
        const isQuota = response.status === 429;
        const formattedErr = isAuth
          ? `[Auth Error 401] Invalid OpenAI API key. Check settings.`
          : isQuota
          ? `[Quota Error 429] OpenAI API quota exhausted or rate limit reached: ${parsedMessage}`
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
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        return {
          provider: this.id,
          model,
          recommendations: [
            {
              questionId: context.questionId,
              recommendedAnswers: [],
              explanation: 'Empty content returned by OpenAI.',
              basis: 'unresolved',
              uncertaintyReasons: ['Empty choices returned.'],
              needsReview: true,
            },
          ],
          error: 'Empty response',
        };
      }

      const rec = this.parseAndValidateRecommendation(content, context);
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
            explanation: `Network error connecting to OpenAI: ${(err as Error).message}`,
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

    return `COURSE CONTEXT:
Course: ${context.courseTitle}
${context.unitOrWeek ? `Module/Week: ${context.unitOrWeek}` : ''}

RELEVANT COURSE MATERIAL EXCERPTS:
${excerptsText}

${historicalText}

TARGET QUESTION:
Question Text: "${context.questionText}"
Question Type: ${context.questionType}
Visible Options:
${context.options.map((opt, i) => `${i + 1}. "${opt}"`).join('\n')}`;
  }

  private parseAndValidateRecommendation(
    rawText: string,
    context: LlmPromptContext
  ): LlmRecommendation {
    let parsed: any;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      // Fallback 1: Extract JSON inside markdown code blocks
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {}
      }

      // Fallback 2: Extract between outermost curly braces
      if (!parsed) {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          } catch {}
        }
      }
    }

    if (!parsed) {
      return {
        questionId: context.questionId,
        recommendedAnswers: [],
        explanation: 'Failed to parse JSON output from OpenAI response.',
        basis: 'unresolved',
        uncertaintyReasons: ['Malformed JSON response from model.'],
        needsReview: true,
      };
    }

    // Support answers array or recommendedAnswers
    let rawAnswers: string[] = [];
    if (Array.isArray(parsed.recommendedAnswers)) {
      rawAnswers = parsed.recommendedAnswers;
    } else if (typeof parsed.recommendedAnswers === 'string') {
      rawAnswers = [parsed.recommendedAnswers];
    } else if (Array.isArray(parsed.answers)) {
      rawAnswers = parsed.answers;
    } else if (typeof parsed.answers === 'string') {
      rawAnswers = [parsed.answers];
    }

    const validatedAnswers: string[] = [];
    const uncertaintyReasons: string[] = Array.isArray(parsed.uncertaintyReasons)
      ? parsed.uncertaintyReasons
      : [];

    if (context.options.length > 0) {
      for (const ans of rawAnswers) {
        const trimmed = ans.trim();
        const directMatch = context.options.find(
          (opt) => normalizeOptionText(opt) === normalizeOptionText(trimmed)
        );
        if (directMatch) {
          validatedAnswers.push(directMatch);
        } else {
          // Check for letter option prefix e.g., "A. Option" or "(A) Option"
          const letterMatch = trimmed.match(/^(?:[A-D][.)\s]+|\([A-D]\)\s*)(.*)$/i);
          if (letterMatch) {
            const stripped = letterMatch[1].trim();
            const matchingOpt = context.options.find(
              (opt) => normalizeOptionText(opt) === normalizeOptionText(stripped)
            );
            if (matchingOpt) {
              validatedAnswers.push(matchingOpt);
            }
          }
        }
      }

      if (validatedAnswers.length === 0 && rawAnswers.length > 0) {
        uncertaintyReasons.push(
          `OpenAI suggested "${rawAnswers.join(', ')}", which does not match any visible option on the assignment.`
        );
      }
    } else {
      validatedAnswers.push(...rawAnswers);
    }

    const needsReview =
      parsed.needsReview === true ||
      validatedAnswers.length === 0 ||
      (context.questionType === 'single-choice' && validatedAnswers.length > 1);

    let basis: AnswerBasis = 'ai-reasoning';
    if (parsed.basis === 'course-material' && parsed.evidence) {
      basis = 'course-material';
    } else if (validatedAnswers.length === 0) {
      basis = 'unresolved';
    }

    return {
      questionId: context.questionId,
      recommendedAnswers: validatedAnswers,
      explanation: parsed.explanation || 'Answer generated via OpenAI API analysis.',
      evidence: parsed.evidence,
      confidence: typeof parsed.confidence === 'number' && !isNaN(parsed.confidence) ? parsed.confidence : undefined,
      basis,
      uncertaintyReasons,
      needsReview,
    };
  }
}

export const openAiProvider = new OpenAiProvider();
