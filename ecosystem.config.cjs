module.exports = {
  apps: [{
    name: "smart-school-hub",
    script: "./node_modules/.bin/tsx",
    args: "server/index.ts",
    cwd: "/Users/yeong/.openclaw/workspace/smart-school-hub",
    interpreter: "none",
    env: {
      NODE_ENV: "development",
      PORT: "5001"
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 2000,
    exp_backoff_restart_delay: 100,
  }]
};
