module.exports = {
    apps: [
        {
            name: 'discord-bot',
            script: './bot.js',
            watch: true,
            max_restarts: 3, // Максимальное количество перезапусков
            restart_delay: 5000, // Задержка перед перезапуском в миллисекундах
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};