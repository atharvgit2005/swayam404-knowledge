import { ILlmProvider, LlmPromptContext } from './types';
import { LlmAnswerResponse, LlmRecommendation, AnswerBasis } from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export class GrokProvider implements ILlmProvider {
  readonly id = 'grok';
  readonly name = 'xAI Grok';

  async testConnection(
    apiKey: string,
    model = 'grok-2-latest'
  ): Promise<{ success: boolean; message: string }> {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, message: 'xAI Grok API key is required.' };
    }

    try {
      const endpoint = 'https://api.x.ai/v1/chat/completions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim() || 'grok-2-latest',
          messages: [
            {
              role: 'user',
              content: 'Respond with the word OK if this connection test succeeded.',
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
          } else if (errJson?.error) {
            parsedMessage = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
          }
        } catch {}

        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            message: `xAI Grok authentication failed (HTTP ${res.status}): Invalid API key.`,
          };
        }
        if (res.status === 429) {
          return {
            success: false,
            message: `xAI Grok quota or rate limit exceeded (HTTP 429): ${parsedMessage}.`,
          };
        }

        return {
          success: false,
          message: `Grok API error (HTTP ${res.status}): ${parsedMessage}`,
        };
      }

      return {
        success: true,
        message: `Successfully connected to xAI Grok using model "${model}".`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Network failure connecting to xAI Grok: ${(err as Error).message}`,
      };
    }
  }

  async recommendAnswer(
    context: LlmPromptContext,
    apiKey: string,
    model = 'grok-2-latest'
  ): Promise<LlmAnswerResponse> {
    if (!apiKey || apiKey.trim() === '') {
      return {
        provider: this.id,
        model,
        recommendations: [
          {
            questionId: context.questionId,
            recommendedAnswers: [],
            explanation: 'xAI Grok API key not configured in Settings.',
            basis: 'unresolved',
            uncertaintyReasons: ['Grok API key missing in extension settings.'],
            needsReview: true,
          },
        ],
        error: 'API key missing in settings.',
      };
    }

    try {
      const systemPrompt = `You are a strict, highly accurate academic assistant aiding university students on the SWAYAM / NPTEL learning portal.
Your task is to analyze an assignment question, retrieve evidence from the provided lecture excerpts or domain knowledge, and select the correct answer(s).

Rules:
1. For single-choice, true-false, and multiple-choice questions, your recommended answers MUST match EXACTLY one (or more) of the provided options verbatim. NEVER invent or hallucinate alternative text.
2. For multiple-choice questions (checkboxes), recommend all options that are demonstrably correct.
3. For short-text questions, output the concise, exact formula, phrase, or term required.
4. If the question is ambiguous or insufficient evidence is available, set needsReview to true and explain the uncertainty.
5. Return ONLY a single valid JSON object strictly following this structure:
{
  "recommendedAnswers": ["Exact Option Text 1"],
  "explanation": "Clear explanation citing lecture concepts",
  "evidence": "Direct quote or principle from lecture context if available",
  "basis": "course-context" | "llm-general-knowledge" | "unresolved",
  "uncertaintyReasons": ["Reason why ambiguous (if any)"],
  "needsReview": false | true
}`;

      const userPrompt = this.buildPrompt(context);

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim() || 'grok-2-latest',
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
          } else if (errJson?.error) {
            parsedMessage = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
          }
        } catch {}

        const isAuth = response.status === 401 || response.status === 403;
        const isQuota = response.status === 429;
        const formattedErr = isAuth
          ? `[Auth Error ${response.status}] Invalid or unauthorized xAI Grok API key: ${parsedMessage}`
          : isQuota
          ? `[Quota Error 429] xAI Grok rate limit or quota exceeded: ${parsedMessage}`
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
              explanation: 'Empty response received from Grok.',
              basis: 'unresolved',
              uncertaintyReasons: ['Grok returned empty response text.'],
              needsReview: true,
            },
          ],
          error: 'Empty response',
        };
      }

      const parsed = this.parseResponse(content, context);
      return {
        provider: this.id,
        model,
        recommendations: [parsed],
        usageTokens: json.usage?.total_tokens,
      };
    } catch (err) {
      return {
        provider: this.id,
        model,
        recommendations: [
          {
            questionId: context.questionId,
            recommendedAnswers: [],
            explanation: `Execution error: ${(err as Error).message}`,
            basis: 'unresolved',
            uncertaintyReasons: [(err as Error).message],
            needsReview: true,
          },
        ],
        error: (err as Error).message,
      };
    }
  }

  private buildPrompt(ctx: LlmPromptContext): string {
    const lines: string[] = [];
    lines.push(`Course: ${ctx.courseTitle}`);
    if (ctx.unitOrWeek) {
      lines.push(`Unit / Week: ${ctx.unitOrWeek}`);
    }
    lines.push(`Question Type: ${ctx.questionType}`);
    lines.push(`Question: ${ctx.questionText}`);

    if (ctx.options.length > 0) {
      lines.push('Available Options:');
      ctx.options.forEach((opt, idx) => {
        lines.push(`  [Option ${idx + 1}] ${opt}`);
      });
    }

    if (ctx.retrievedExcerpts && ctx.retrievedExcerpts.length > 0) {
      lines.push('\nRelevant Course Lecture Excerpts:');
      ctx.retrievedExcerpts.slice(0, 3).forEach((ex, idx) => {
        const srcTitle = ex.sourceTitle || ex.title || ex.materialTitle;
        const metaParts = [
          srcTitle,
          ex.lectureId ? `Lecture: ${ex.lectureId}` : '',
          ex.timestamp ? `Time: ${ex.timestamp}` : '',
          ex.unitTitle ? `Unit: ${ex.unitTitle}` : '',
          ex.retrievalSource === 'shared-knowledge-base' ? 'Shared KB' : 'Local Notes',
          ex.license ? `License: ${ex.license}` : '',
        ].filter(Boolean);
        const bounded = ex.excerpt.length > 400 ? `${ex.excerpt.slice(0, 400)}...` : ex.excerpt;
        lines.push(`--- Excerpt ${idx + 1} (${metaParts.join(' | ')}) ---`);
        lines.push(bounded);
      });
      lines.push('\nINSTRUCTION: Base reasoning on provided excerpts where possible. Do NOT invent citations.');
    }

    if (ctx.historicalExample) {
      lines.push('\nVerified Historical Reference from Course Bank:');
      lines.push(`Question: ${ctx.historicalExample.questionText}`);
      lines.push(`Accepted Answer(s): ${ctx.historicalExample.acceptedAnswers.join(', ')}`);
      if (ctx.historicalExample.explanation) {
        lines.push(`Notes: ${ctx.historicalExample.explanation}`);
      }
    }

    return lines.join('\n');
  }

  private parseResponse(
    rawText: string,
    context: LlmPromptContext
  ): LlmRecommendation {
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
            throw new Error('No JSON object found in Grok response.');
          }
        }
      }
      const rawRecs: string[] = Array.isArray(parsed.recommendedAnswers)
        ? parsed.recommendedAnswers
        : typeof parsed.recommendedAnswers === 'string'
        ? [parsed.recommendedAnswers]
        : [];

      // Validate options against actual available options if choice-based
      const validatedRecs: string[] = [];
      const uncertainty: string[] = Array.isArray(parsed.uncertaintyReasons)
        ? parsed.uncertaintyReasons
        : [];

      if (context.options.length > 0) {
        for (const candidate of rawRecs) {
          const match = context.options.find(
            (opt) => normalizeOptionText(opt) === normalizeOptionText(candidate)
          );
          if (match) {
            validatedRecs.push(match);
          } else {
            uncertainty.push(`AI suggested "${candidate}" which does not match any valid option.`);
          }
        }
      } else {
        validatedRecs.push(...rawRecs);
      }

      const basis: AnswerBasis =
        parsed.basis === 'course-context' ||
        parsed.basis === 'llm-general-knowledge' ||
        parsed.basis === 'historical-match'
          ? parsed.basis
          : context.retrievedExcerpts && context.retrievedExcerpts.length > 0
          ? 'course-context'
          : 'llm-general-knowledge';

      const needsReview =
        parsed.needsReview === true ||
        validatedRecs.length === 0 ||
        uncertainty.length > 0;

      return {
        questionId: context.questionId,
        recommendedAnswers: validatedRecs,
        explanation: parsed.explanation || 'No explanation provided by AI.',
        evidence: parsed.evidence || undefined,
        confidence: typeof parsed.confidence === 'number' && !isNaN(parsed.confidence) ? parsed.confidence : undefined,
        basis: validatedRecs.length === 0 ? 'unresolved' : basis,
        uncertaintyReasons: uncertainty.length > 0 ? uncertainty : undefined,
        needsReview,
      };
    } catch {
      return {
        questionId: context.questionId,
        recommendedAnswers: [],
        explanation: 'Failed to parse JSON response from Grok model.',
        basis: 'unresolved',
        uncertaintyReasons: ['Grok output could not be parsed as valid JSON.'],
        needsReview: true,
      };
    }
  }
}

export const grokProvider = new GrokProvider();
