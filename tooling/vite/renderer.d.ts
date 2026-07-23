import type { UserConfig } from 'vite';

declare function createRendererViteConfig(options?: UserConfig): UserConfig;

export default createRendererViteConfig;
