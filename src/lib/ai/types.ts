import { QuestionType, LlmAnswerResponse } from '@/types';
import { RetrievedExcerpt } from '@/lib/context/retrievalService';

export interface LlmPromptContext {
  questionId: string;
  courseTitle: string;
  unitOrWeek?: string;
  questionText: string;
  options: string[];
  questionType: QuestionType;
  retrievedExcerpts?: RetrievedExcerpt[];
  historicalExample?: {
    questionText: string;
    acceptedAnswers: string[];
    explanation?: string;
  };
}

export interface ILlmProvider {
  readonly id: string;
  readonly name: string;
  testConnection(apiKey: string, model: string): Promise<{ success: boolean; message: string }>;
  recommendAnswer(
    context: LlmPromptContext,
    apiKey: string,
    model: string
  ): Promise<LlmAnswerResponse>;
}
