module.exports = {
  apps: [
    {
      name: "cloudship-api",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/server.ts",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      name: "cloudship-worker",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/workers/builder.worker.ts",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
