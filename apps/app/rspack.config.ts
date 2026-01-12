import { resolve } from 'path';
import { defineConfig } from '@rspack/cli';
import { DefinePlugin, HtmlRspackPlugin } from '@rspack/core';

export default defineConfig({
  entry: './src/index.tsx',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/', // Required for client-side routing
  },
  resolve: {
    // Platform-specific extensions first, then generic
    // Prefer .tsx for all files (even non-JSX), .ts only for config/scripts
    // .js at end is required for node_modules (including rspack internals)
    extensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.js'],
    // Ensure single React instance in monorepo
    alias: {
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              transform: {
                react: {
                  runtime: 'automatic',
                },
              },
            },
          },
        },
        type: 'javascript/auto',
      },
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              esModule: false,
              modules: {
                localIdentName: '[name]__[local]--[hash:base64:5]',
                namedExport: false,
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new DefinePlugin({
      'process.env.PUBLIC_API_URL': JSON.stringify(process.env.PUBLIC_API_URL || ''),
    }),
    new HtmlRspackPlugin({
      template: './src/index.html',
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true, // Serve index.html for all routes (HTML5 routing)
  },
});
