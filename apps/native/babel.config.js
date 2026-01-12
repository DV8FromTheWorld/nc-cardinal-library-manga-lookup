const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            // @ points to apps/app/src (shared code)
            '@': path.resolve(__dirname, '../app/src'),
          },
        },
      ],
    ],
  };
};
