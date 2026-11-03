import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ng.nineja.roam',
  appName: '9ja Roam',
  webDir: 'dist',
  android: {
    allowMixedContent: false,    backgroundColor: '#0a0d12'
  }
};

export default config;
