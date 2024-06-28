# Discord Music Bot

<!-- ![Discord](https://img.shields.io/discord/your-guild-id?label=Discord&logo=discord) -->

## Описание

Это Discord бот для воспроизведения музыки с YouTube. Бот поддерживает команды для воспроизведения, паузы, возобновления, пропуска и остановки музыки, а также для управления очередью песен.

## Установка и запуск

### Шаг 1: Подготовка окружения

1. **Установите Node.js и npm**:
   - Загрузите и установите последнюю версию Node.js с официального сайта: [Node.js](https://nodejs.org/).
   - При установке Node.js, npm (Node Package Manager) будет установлен автоматически.

   **Для Windows**:
   - Загрузите установочный файл с [официального сайта Node.js](https://nodejs.org/).
   - Запустите установочный файл и следуйте инструкциям на экране, убедившись, что опция "Add to PATH" выбрана.

   **Для macOS**:
   - Загрузите `.pkg` файл с [официального сайта Node.js](https://nodejs.org/).
   - Запустите его и следуйте инструкциям установщика.

   **Для Linux**:
   - Для Debian и Ubuntu:
     ```bash
     sudo apt update
     sudo apt install nodejs npm
     ```
   - Для Fedora:
     ```bash
     sudo dnf install nodejs npm
     ```
   - Для Arch Linux:
     ```bash
     sudo pacman -S nodejs npm
     ```

2. **Установите Git** (если у вас его еще нет):
   - Загрузите и установите Git с официального сайта: [Git](https://git-scm.com/).

   **Для Windows**:
   - Загрузите установочный файл с [официального сайта Git](https://git-scm.com/).
   - Запустите установочный файл и следуйте инструкциям на экране.

   **Для macOS**:
   - Установите Git через Homebrew:
     ```bash
     brew install git
     ```

   **Для Linux**:
   - Для Debian и Ubuntu:
     ```bash
     sudo apt update
     sudo apt install git
     ```
   - Для Fedora:
     ```bash
     sudo dnf install git
     ```
   - Для Arch Linux:
     ```bash
     sudo pacman -S git
     ```

### Шаг 2: Скачивание файлов бота

1. **Клонируйте репозиторий**:
   ```bash
   git clone https://github.com/your-username/your-bot-repo.git

### Шаг 3: Настройка проекта

1. Перейдите в папку с проектом:
   ```bash
   cd your-bot-repo
2. Установите зависимости:
   ```bash
   npm install

### Шаг 4: Настройка конфигурационного файла

1. Создайте файл `config.json` в корневой папке проекта и заполните его следующим содержимым, заменив значения на свои:

   ```json
   {
     "token": "ВАШ_ТОКЕН",
     "clientId": "ВАШ_CLIENT_ID",
     "guildIds": ["ID_СЕРВЕРА_1", "ID_СЕРВЕРА_2"],
     "ownerId": "ID_ВЛАДЕЛЬЦА"
   }
### Шаг 5: Запуск бота

1. Запустите бота с помощью команды:
   ```bash
   node bot.js
   
