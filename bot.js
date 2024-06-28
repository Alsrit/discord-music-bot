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
        .setName('volume')
        .setDescription('Устанавливает громкость проигрывания музыки')
        .addIntegerOption(option => option.setName('volume').setDescription('Громкость (от 1 до 100)').setRequired(true)),
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
        client.user.setBanner('./doc.gif')
            .then(async user => {
                console.log('New banner set!');
                const owner = await client.users.fetch(ownerId);
                if (owner) {
                    await owner.send(`Установлен новый баннер для бота: ${user.bannerURL()}`);
                }
            })
            .catch(console.error);

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
    const owner = await client.users.fetch(ownerId);
    if (owner) {
        await owner.send('Я был перезагружен.');
    }
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
        case 'volume':
            await volume(interaction, serverQueue);
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
                clearTimeout(queueContruct.idleTimer);
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
    return interaction.reply(`Текущая очередь:\n${queueString}`);
}

function remove(interaction, serverQueue) {
    const index = interaction.options.getInteger('index') - 1;
    if (!serverQueue || !serverQueue.songs.length) return interaction.reply('Очередь пуста!');
    if (index < 0 || index >= serverQueue.songs.length) return interaction.reply('Неверный номер песни.');
    const removedSong = serverQueue.songs.splice(index, 1);
    return interaction.reply(`**${removedSong[0].title}** была удалена из очереди!`);
}


function volume(interaction, serverQueue) {
    const volume = interaction.options.getInteger('volume');

    if (!serverQueue || !serverQueue.connection || !serverQueue.player) {
        return interaction.reply('Бот не находится в голосовом канале или не воспроизводит музыку.');
    }

    if (volume < 0 || volume > 100) {
        return interaction.reply('Громкость должна быть задана в диапазоне от 0 до 100.');
    }

    try {
        if (serverQueue.player instanceof AudioPlayer) {
            serverQueue.player.setVolume(volume / 100);
            return interaction.reply(`Громкость установлена на ${volume}%`);
        } else {
            return interaction.reply('Не удалось установить громкость: неправильный тип аудиоплеера.');
        }
    } catch (error) {
        console.error('Ошибка при установке громкости:', error);
        return interaction.reply('Произошла ошибка при попытке установить громкость.');
    }
}


function nowPlaying(interaction, serverQueue) {
    if (!serverQueue || !serverQueue.connection || !serverQueue.songs.length) {
        return interaction.reply('На данный момент ничего не проигрывается.');
    }

    const currentSong = serverQueue.songs[0];
    return interaction.reply(`Сейчас играет: **${currentSong.title}**`);
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!serverQueue || !song) {
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(guild.id);
        console.error(`Невозможно воспроизвести песню. Очередь для сервера ${guild.id} не найдена или песня не указана.`);
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly' });
    const resource = createAudioResource(stream);

    if (serverQueue.connection) {
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            if (serverQueue.loop === 'single') {
                play(guild, serverQueue.songs[0]);
            } else if (serverQueue.loop === 'queue') {
                serverQueue.songs.push(serverQueue.songs.shift());
                play(guild, serverQueue.songs[0]);
            } else {
                serverQueue.songs.shift();
                if (serverQueue.songs.length > 0) {
                    play(guild, serverQueue.songs[0]);
                } else {
                    resetIdleTimer(serverQueue);
                }
            }
        });

        serverQueue.player.on('error', error => {
            console.error('Ошибка аудиоплеера:', error);
            handleAudioPlayerError(guild.id, error);
        });

        resetIdleTimer(serverQueue);
    } else {
        console.error(`Соединение для сервера ${guild.id} не определено. Невозможно воспроизвести песню.`);
        queue.delete(guild.id);
    }
}

function resetIdleTimer(serverQueue) {
    if (serverQueue.idleTimer) {
        clearTimeout(serverQueue.idleTimer);
    }
    serverQueue.idleTimer = setTimeout(() => {
        const voiceChannel = serverQueue.voiceChannel;
        if (!voiceChannel || voiceChannel.members.size === 1) {
            if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                serverQueue.connection.destroy();
                console.log('Вышел из голосового канала из-за отсутствия активности.');
            }
            queue.delete(serverQueue.voiceChannel.guild.id);
            console.log('Музыка остановлена, так как все пользователи покинули канал или отсутствует активность.');
        }
    }, 120000); // Тайм-аут 2 минуты
}

function handleAudioPlayerError(guildId, error) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue) return;

    console.error(`Ошибка аудиоплеера на сервере "${guildId}":`, error);

    const owner = client.users.cache.get(ownerId);
    if (owner) {
        owner.send(`Ошибка аудиоплеера на сервере "${guildId}": ${error.message}`)
            .catch(console.error);
    }
}

client.on('messageCreate', async message => {
    console.log('Сообщение получено:', message.content);

    // Проверяем, является ли сообщение личным сообщением (DM)
    if (message.channel.type === 'DM' || message.channel.type === 1) {

        // Проверяем, отправлено ли сообщение от владельца бота
        if (message.author.id === ownerId) {

            // Проверяем содержимое сообщения для выполнения команды !reloadcommands
            if (message.content === '!reloadcommands') {

                // Выполняем регистрацию команд
                await registerCommands();

                // Отправляем ответное сообщение об успешной операции
                await message.reply('Slash команды обновлены!');
            } else {
            }
        } else {
        }
    } else {
    }
});

client.on('error', async (error, guildId) => {
    console.error(`Бот столкнулся с ошибкой на сервере "${guildId.name}" (${guildId.id}):`, error);

    const owner = await client.users.fetch(ownerId);
    if (owner) {
        await owner.send(`Бот столкнулся с ошибкой на сервере "${guildId.name}" (${guildId.id}): ${error.message}`);
    }
});

process.on('unhandledRejection', async (reason, promise, guildId) => {
    console.error(`Необработанное отклонение промиса на сервере "${guildId.name}" (${guildId.id}):`, reason);

    const owner = await client.users.fetch(ownerId);
    if (owner) {
        await owner.send(`Необработанное отклонение промиса на сервере "${guildId.name}" (${guildId.id}): ${reason}`);
    }
});

// Логирование в файл

const logDirectory = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

const logFileName = () => {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}.log`;
};

const logStream = fs.createWriteStream(path.join(logDirectory, logFileName()), { flags: 'a' });

function logToFile(message) {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
}

client.on('error', error => {
    logToFile(`Произошла ошибка: ${error.message}`);
});

client.login(token);
