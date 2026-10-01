// Shared Jest setup for @savitools/web.
//
// Registered for every suite via `setupFilesAfterEnv` in jest.config.js, so
// components can use the jest-dom matchers (toBeInTheDocument, …).
import '@testing-library/jest-dom';

afterEach(() => {
  // Preferences and recent items are persisted in localStorage, which jsdom
  // keeps for the whole file by default. Reset it so suites stay independent.
  // Guarded because a handful of Node-only suites opt out of jsdom with the
  // `@jest-environment node` docblock.
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});
