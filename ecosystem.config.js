module.exports = {
    apps: [
        {
            name: 'discord-bot',
            script: './bot.js',
            watch: true,
            max_restarts: 3, // ������������ ���������� ������������
            restart_delay: 5000, // �������� ����� ������������ � �������������
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};