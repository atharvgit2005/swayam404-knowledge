// Test environment setup for Vitest
import { afterEach } from 'vitest';

// Clear mock storage after each test
afterEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});
