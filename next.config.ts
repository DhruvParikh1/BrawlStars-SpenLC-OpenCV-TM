// next.config.ts
import type { Configuration as WebpackConfig } from 'webpack';
import type { NextConfig } from 'next';

const config: NextConfig = {
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    // Ensure experiments object exists
    if (!config.experiments) {
      config.experiments = {};
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Ensure module object exists
    if (!config.module) {
      config.module = { rules: [] };
    }

    // Ensure rules array exists
    if (!config.module.rules) {
      config.module.rules = [];
    }

    // Add the fallback configuration
    if (!config.resolve) {
      config.resolve = {};
    }

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },
};

export default config;