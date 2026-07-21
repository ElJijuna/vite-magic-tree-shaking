import vitestConfig from 'super-configs/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(vitestConfig, {
  test: {
    include: ['src/**/*.test.ts'],
  },
});
