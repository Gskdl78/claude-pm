import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest globals are off, so React Testing Library cannot register its own
// auto-cleanup; without this each test would leak its DOM into the next one.
afterEach(cleanup);
