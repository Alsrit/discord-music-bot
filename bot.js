const { Client, GatewayIntentBits, REST, Routes, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, generateDependencyReport, VoiceConnectionStatus } = require('@discordjs/voice');
const { SlashCommandBuilder } = require('@discordjs/builders');
const ytdl = require('ytdl-core');
const { token, clientId, ownerId, guildIds } = require('./config.json');
const fs = require('fs');
const path = require('path');

console.log(generateDependencyReport());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: ['CHANNEL']
});

const queue = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Проигрывает музыку с YouTube')
        .addStringOption(option => option.setName('url').setDescription('YouTube URL').setRequired(true)),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Пропускает текущую песню'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Останавливает музыку и выходит из голосового канала'),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Приостанавливает воспроизведение музыки'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Возобновляет воспроизведение музыки'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Показывает текущую очередь песен'),
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Удаляет песню из очереди по номеру')
        .addIntegerOption(option => option.setName('index').setDescription('Номер песни в очереди').setRequired(true)),
    new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Включает или выключает циклическое воспроизведение')
        .addStringOption(option => option.setName('mode').setDescription('Один из вариантов: single, queue, off').setRequired(true)),
    new SlashCommandBuilder()
        .setName('np')
        .setDescription('Показывает текущую воспроизводимую песню'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
    try {
        console.log('Начата перезагрузка команд приложения (/).');
        for (const guildId of guildIds) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`Команды приложения (/) успешно перезагружены для сервера ${guildId}.`);
        }
        console.log('Все команды успешно перезагружены.');
    } catch (error) {
        console.error(error);
    }
}

registerCommands();

client.once('ready', async () => {
    console.log(`Вошел в систему как ${client.user.tag}`);

    try {
        // Установка аватара бота
        await client.user.setAvatar('./avatar.png');

        // Установка баннера
        client.user.setBanner('./doc.gif');

        // Установка статуса активности
        client.user.setActivity('discord.js', { type: ActivityType.Watching });

        // Установка информации "Обо мне"
        client.user.setPresence({
            activities: [{ name: 'Пушистая Любовь', type: ActivityType.Playing }],
            status: 'online'
        });

    } catch (error) {
        console.error('Ошибка установки активности бота:', error);
    }

    // Отправка уведомления о перезагрузке
    // const owner = await client.users.fetch(ownerId);
    // if (owner) {
    //     await owner.send('Я был перезагружен.');
    // }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const serverQueue = queue.get(interaction.guild.id);

    switch (interaction.commandName) {
        case 'play':
            await execute(interaction, serverQueue);
            break;
        case 'skip':
            await skip(interaction, serverQueue);
            break;
        case 'stop':
            await stop(interaction, serverQueue);
            break;
        case 'pause':
            await pause(interaction, serverQueue);
            break;
        case 'resume':
            await resume(interaction, serverQueue);
            break;
        case 'queue':
            await showQueue(interaction, serverQueue);
            break;
        case 'remove':
            await remove(interaction, serverQueue);
            break;
        case 'loop':
            await loop(interaction, serverQueue);
            break;
        case 'np':
            await nowPlaying(interaction, serverQueue);
            break;
        default:
            interaction.reply('Неизвестная команда!');
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const serverQueue = queue.get(newState.guild.id);

    if (!serverQueue) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (oldChannel !== newChannel) {
        if (newChannel && newChannel.members.size > 1) {
            resetIdleTimer(serverQueue);
        } else if (oldChannel && oldChannel.members.size === 1 && !newChannel) {
            resetIdleTimer(serverQueue);
        }
    }
});

async function execute(interaction, serverQueue) {
    const url = interaction.options.getString('url');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply('Вы должны быть в голосовом канале, чтобы использовать эту команду.');
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return interaction.reply('У меня нет разрешений для подключения и разговора в этом канале!');
    }

    if (!ytdl.validateURL(url)) {
        return interaction.reply('Укажите корректный YouTube URL для воспроизведения музыки с YouTube.');
    }

    const songInfo = await ytdl.getInfo(url);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
    };

    if (!serverQueue) {
        const queueContruct = {
            textChannel: interaction.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            player: createAudioPlayer(),
            idleTimer: null,
        };

        queue.set(interaction.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
            queueContruct.connection = connection;

            connection.on(VoiceConnectionStatus.Disconnected, () => {
                if (queueContruct.idleTimer) {
                    clearTimeout(queueContruct.idleTimer);
                }
                queue.delete(interaction.guild.id);
                console.log('Вышел из голосового канала, так как соединение было разорвано.');
            });

            play(interaction.guild, queueContruct.songs[0]);
            await interaction.reply(`Начинаем воспроизведение: **${song.title}**`);
        } catch (err) {
            console.log(err);
            queue.delete(interaction.guild.id);
            return interaction.reply('Ошибка при подключении к голосовому каналу.');
        }
    } else {
        serverQueue.songs.push(song);
        return interaction.reply(`**${song.title}** добавлена в очередь!`);
    }
}

function skip(interaction, serverQueue) {
    if (!serverQueue) return interaction.reply('Очередь пуста!');
    serverQueue.player.stop();
    return interaction.reply('Пропущена текущая песня!');
}

function stop(interaction, serverQueue) {
    if (!serverQueue) return interaction.reply('Очередь пуста!');
    serverQueue.songs = [];
    serverQueue.player.stop();
    if (serverQueue.connection) {
        serverQueue.connection.destroy();
    }
    queue.delete(interaction.guild.id);
    return interaction.reply('Музыка остановлена и бот покинул канал!');
}

function pause(interaction, serverQueue) {
    if (!serverQueue) return interaction.reply('Очередь пуста!');
    serverQueue.player.pause();
    resetIdleTimer(serverQueue);
    return interaction.reply('Музыка приостановлена!');
}

function resume(interaction, serverQueue) {
    if (!serverQueue) return interaction.reply('Очередь пуста!');
    serverQueue.player.unpause();
    resetIdleTimer(serverQueue);
    return interaction.reply('Музыка возобновлена!');
}

function showQueue(interaction, serverQueue) {
    if (!serverQueue || !serverQueue.songs.length) return interaction.reply('Очередь пуста!');
    const queueString = serverQueue.songs.map((song, index) => `${index + 1}. ${song.title}`).join('\n');
    return interaction.reply(`Текущая очередь песен:\n${queueString}`);
}

function remove(interaction, serverQueue) {
    if (!serverQueue) return interaction.reply('Очередь пуста!');
    const index = interaction.options.getInteger('index') - 1;
    if (!serverQueue || !serverQueue.songs.length || index < 0 || index >= serverQueue.songs.length) {
        return interaction.reply('Некорректный номер песни.');
    }
    const removedSong = serverQueue.songs.splice(index, 1);
    return interaction.reply(`**${removedSong[0].title}** удалена из очереди.`);
}

function loop(interaction, serverQueue) {
    const mode = interaction.options.getString('mode');
    if (!serverQueue) return interaction.reply('Очередь пуста!');

    if (mode === 'single') {
        serverQueue.loopMode = 'single';
        return interaction.reply('Циклическое воспроизведение одной песни включено.');
    } else if (mode === 'queue') {
        serverQueue.loopMode = 'queue';
        return interaction.reply('Циклическое воспроизведение всей очереди включено.');
    } else {
        serverQueue.loopMode = 'off';
        return interaction.reply('Циклическое воспроизведение выключено.');
    }
}

function nowPlaying(interaction, serverQueue) {
    if (!serverQueue || !serverQueue.songs.length) return interaction.reply('Очередь пуста!');
    return interaction.reply(`Сейчас играет: **${serverQueue.songs[0].title}**`);
}

function play(guild, song, retryCount = 0) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        if (serverQueue && serverQueue.idleTimer) {
            clearTimeout(serverQueue.idleTimer);
        }
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(guild.id);
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly' });
    const resource = createAudioResource(stream);
    serverQueue.player.play(resource);

    serverQueue.player.once(AudioPlayerStatus.Playing, () => {
        console.log(`Началось воспроизведение: ${song.title}`);
    });

    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
        if (serverQueue.loopMode === 'single') {
            play(guild, serverQueue.songs[0]);
        } else {
            if (serverQueue.loopMode !== 'queue') {
                serverQueue.songs.shift();
            }
            play(guild, serverQueue.songs[0]);
        }
    });

    serverQueue.player.on('error', error => {
        console.error(`Ошибка воспроизведения: ${error.message}`);
        if (retryCount < 3) {
            console.log(`Повторная попытка воспроизведения: ${song.title} (${retryCount + 1})`);
            play(guild, song, retryCount + 1);
        } else {
            console.log(`Пропущена песня: ${song.title} после 3 неудачных попыток`);
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        }
    });

    serverQueue.connection.subscribe(serverQueue.player);
    resetIdleTimer(serverQueue);
}

function resetIdleTimer(serverQueue) {
    if (serverQueue && serverQueue.idleTimer) {
        clearTimeout(serverQueue.idleTimer);
    }
    serverQueue.idleTimer = setTimeout(() => {
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(serverQueue.textChannel.guild.id);
        console.log('Вышел из голосового канала, так как никто не остался в канале.');
    }, 600000); // 10 минут
}

client.login(token);
