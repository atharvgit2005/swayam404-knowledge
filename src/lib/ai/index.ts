import { ILlmProvider } from './types';
import { geminiProvider } from './geminiProvider';
import { grokProvider } from './grokProvider';
import { openAiProvider } from './openaiProvider';
import { LlmProviderType } from '@/types';

export * from './types';
export * from './geminiProvider';
export * from './grokProvider';
export * from './openaiProvider';

export function getLlmProvider(type: LlmProviderType = 'gemini'): ILlmProvider {
  switch (type) {
    case 'grok':
      return grokProvider;
    case 'openai':
      return openAiProvider;
    case 'gemini':
    default:
      return geminiProvider;
  }
}
