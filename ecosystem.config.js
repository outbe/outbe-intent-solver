module.exports = {
    apps : [{
        name: "solver",
        script: "./dist/index.js",
        out_file: "./logs/solver-out.log",
        error_file: "./logs/solver-error.log",
        merge_logs: true,
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
            LOG_LEVEL: "info",
            LOG_FORMAT: "json",
        }
    }]
}