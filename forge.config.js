'use strict';

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'CODY',
    executableName: 'cody',
    icon: './assets/icon',
    extraResource: [],
    ignore: [
      /^\/tests/,
      /^\/docs/,
      /^\/\.git/,
      /node_modules\/\.cache/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'cody',
        authors: 'CODY',
        description: 'Privacy-first local AI coding workspace',
        setupIcon: './assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [],
};
