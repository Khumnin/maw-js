module.exports = {
  apps: [
    {
      name: 'maw',
      script: 'src/server.ts',
      interpreter: '/Users/kanatekhumnin/.bun/bin/bun',
      watch: ['src'],
      watch_delay: 500,
      ignore_watch: ['node_modules', 'dist-office', 'office'],
      env: {
        MAW_HOST: 'local',
        MAW_PORT: '3456',
        MAW_REMOTE_HOSTS: 'G35DX:asus-rog',
        MAW_INSTANCE_NAME: 'Mac',
        MAW_PEERS: 'G35DX:http://192.168.1.38:3456',
        GITLAB_URL: 'https://gitlab.tigersoftcloud.com',
        GITLAB_TOKEN: process.env.GITLAB_TOKEN || '',
      },
    },
    {
      name: 'maw-dev',
      script: 'node_modules/.bin/vite',
      args: '--host',
      cwd: './office',
      interpreter: '/Users/kanatekhumnin/.bun/bin/bun',
      env: {
        NODE_ENV: 'development',
      },
      // Only start manually: pm2 start ecosystem.config.cjs --only maw-dev
      autorestart: false,
    },
  ],
};
