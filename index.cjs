// ==============================================================================
// 🚀 NOVA SQUAD GOD MODE - CODE INTÉGRAL GÉANT ET MASSIF (VERSION DÉFINITIVE)
// ==============================================================================

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    ChannelType, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType,
    StringSelectMenuBuilder
} = require('discord.js');

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

// ------------------------------------------------------------------------------
// 1. BASE DE DONNÉES SQLite (MULTITABLE EXTENSIVE POUR LES 19 ÉTAPES)
// ------------------------------------------------------------------------------
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

db.prepare(`CREATE TABLE IF NOT EXISTS levels (userId TEXT PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS economy (userId TEXT PRIMARY KEY, coins INTEGER DEFAULT 10000, lastDaily TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS profiles (userId TEXT PRIMARY KEY, rankRL TEXT DEFAULT 'SSL', tracker TEXT DEFAULT 'Non renseigné', roleTeam TEXT DEFAULT 'Starter / Main', bio TEXT DEFAULT 'Nova Squad 2026', themeColor TEXT DEFAULT '#00E5FF')`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS verified (userId TEXT PRIMARY KEY, verified INTEGER DEFAULT 0, dateVerified TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, reason TEXT, moderatorId TEXT, date TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS badwords (word TEXT PRIMARY KEY)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS temp_voices (channelId TEXT PRIMARY KEY, ownerId TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS shop_items (itemId TEXT PRIMARY KEY, name TEXT, price INTEGER, roleId TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS inventory (userId TEXT, itemId TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporterId TEXT, targetId TEXT, reason TEXT, status TEXT DEFAULT 'PENDING')`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS giveaway_entries (messageId TEXT, userId TEXT, PRIMARY KEY(messageId, userId))`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, executorId TEXT, targetId TEXT, details TEXT, timestamp TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS referrals (userId TEXT PRIMARY KEY, referredBy TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS user_badges (userId TEXT, badgeName TEXT, PRIMARY KEY(userId, badgeName))`).run();

// ------------------------------------------------------------------------------
// 2. HELPERS DE GESTION DE DONNÉES ET MODULES INTERNES
// ------------------------------------------------------------------------------
const databaseXP = {
    get: (userId) => db.prepare(`SELECT xp, level FROM levels WHERE userId = ?`).get(userId) || { xp: 0, level: 1 },
    addXP: (userId, amount) => {
        const current = databaseXP.get(userId);
        const newXP = current.xp + amount;
        const newLevel = Math.floor(newXP / 150) + 1;
        db.prepare(`INSERT INTO levels (userId, xp, level) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET xp = ?, level = ?`).run(userId, newXP, newLevel, newXP, newLevel);
        return { newXP, newLevel, leveledUp: newLevel > current.level };
    }
};

const databaseEco = {
    getCoins: (userId) => db.prepare(`SELECT coins, lastDaily FROM economy WHERE userId = ?`).get(userId) || { coins: 10000, lastDaily: null },
    addCoins: (userId, amount) => {
        const current = databaseEco.getCoins(userId);
        const newCoins = current.coins + amount;
        db.prepare(`INSERT INTO economy (userId, coins, lastDaily) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET coins = ?`).run(userId, newCoins, current.lastDaily, newCoins);
        return newCoins;
    },
    setDaily: (userId, dateStr) => {
        const current = databaseEco.getCoins(userId);
        db.prepare(`INSERT INTO economy (userId, coins, lastDaily) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET lastDaily = ?`).run(userId, current.coins, dateStr, dateStr);
    }
};

const databaseProfile = {
    get: (userId) => db.prepare(`SELECT * FROM profiles WHERE userId = ?`).get(userId) || { rankRL: 'SSL', tracker: 'Non renseigné', roleTeam: 'Starter', bio: 'Nova Squad', themeColor: '#00E5FF' },
    set: (userId, rankRL, tracker, roleTeam, bio, themeColor) => {
        db.prepare(`INSERT INTO profiles (userId, rankRL, tracker, roleTeam, bio, themeColor) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET rankRL = ?, tracker = ?, roleTeam = ?, bio = ?, themeColor = ?`).run(userId, rankRL, tracker, roleTeam, bio, themeColor, rankRL, tracker, roleTeam, bio, themeColor);
    }
};

const databaseBadwords = {
    getAll: () => db.prepare(`SELECT word FROM badwords`).all().map(r => r.word),
    add: (word) => db.prepare(`INSERT OR IGNORE INTO badwords (word) VALUES (?)`).run(word.toLowerCase()),
    remove: (word) => db.prepare(`DELETE FROM badwords WHERE word = ?`).run(word.toLowerCase())
};

// ------------------------------------------------------------------------------
// 3. CLIENT DISCORD & CONFIGURATION DES INTENTS
// ------------------------------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const RL_QUIZ_DATABASE = [
    { question: 'Quel est la voiture par défaut la plus utilisée en RLCS ?', answer: 'octane' },
    { question: 'Quel joueur pro est connu sous le pseudo "KCorp Vatira" ?', answer: 'vatira' },
    { question: 'Combien de joueurs composent une équipe RLCS standard sur le terrain ?', answer: '3' },
    { question: 'Quelle arène se déroule sur une plage sous le soleil ?', answer: 'salty shores' },
    { question: 'Quel boost de départ est de couleur orange/jaune emblématique ?', answer: 'alpha boost' },
    { question: 'Quel est le rang maximum standard au-dessus du Grand Champion ?', answer: 'ssl' }
];

const messageCache = new Map();

async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.find(ch => ch.name.includes('log') || ch.name.includes('mod-log'));
    if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ------------------------------------------------------------------------------
// 4. ENREGISTREMENT DES COMMANDES SLASH GLOBALLES
// ------------------------------------------------------------------------------
client.once('ready', async () => {
    console.log(`================================================================`);
    console.log(`🔥 [NOVA SQUAD GÉANT] Connecté en tant que ${client.user.tag}`);
    console.log(`================================================================`);

    try {
        client.user.setPresence({
            activities: [{ name: 'Annihilating Draftbot | /help', type: ActivityType.Competing }],
            status: 'online',
        });

        const commands = [
            { name: 'help', description: 'Centre d\'aide complet Nova Squad' },
            { name: 'botinfo', description: 'Statistiques du bot' },
            { name: 'ping', description: 'Latence du serveur' },
            { name: 'profil', description: 'Afficher son profil e-sport', options: [{ name: 'membre', description: 'Membre', type: 6, required: false }] },
            { name: 'editprofil', description: 'Modifier son profil e-sport', options: [
                { name: 'rang', description: 'Rang RL', type: 3, required: true },
                { name: 'tracker', description: 'Tracker', type: 3, required: true },
                { name: 'role', description: 'Rôle', type: 3, required: true },
                { name: 'bio', description: 'Bio', type: 3, required: false },
                { name: 'couleur', description: 'Couleur Hex', type: 3, required: false }
            ]},
            { name: 'solde', description: 'Voir son solde Nova Coins', options: [{ name: 'membre', description: 'Membre', type: 6, required: false }] },
            { name: 'daily', description: 'Bonus quotidien' },
            { name: 'slots', description: 'Machine à sous', options: [{ name: 'mise', description: 'Mise', type: 4, required: true }] },
            { name: 'coinflip', description: 'Pile ou face', options: [{ name: 'mise', description: 'Mise', type: 4, required: true }, { name: 'choix', description: 'Pile ou face', type: 3, required: true, choices: [{ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' }] }] },
            { name: 'roll', description: 'Lancer un dé de 1 à 100' },
            { name: 'quiz-rl', description: 'Quiz Rocket League pour gagner des pièces' },
            { name: 'rank', description: 'Voir son niveau' },
            { name: 'leaderboard', description: 'Top 10 du serveur' },
            { name: 'notif', description: 'Annoncer un live ou une vidéo', options: [
                { name: 'plateforme', description: 'Plateforme', type: 3, required: true, choices: [{ name: 'Twitch / Live', value: 'Live' }, { name: 'YouTube / Vidéo', value: 'YouTube' }, { name: 'TikTok', value: 'TikTok' }] },
                { name: 'titre', description: 'Titre de la publication', type: 3, required: true },
                { name: 'lien', description: 'Lien d\'accès', type: 3, required: true }
            ]},
            { name: 'tournoi', description: 'Annoncer un tournoi e-sport officiel', options: [{ name: 'nom', description: 'Nom', type: 3, required: true }, { name: 'cashprize', description: 'Récompense', type: 3, required: true }] },
            { name: 'panneauticket', description: 'Déployer le panneau de tickets interactif' },
            { name: 'captcha', description: 'Déployer le captcha de vérification' },
            { name: 'clear', description: 'Purger des messages', options: [{ name: 'nombre', description: 'Nombre', type: 4, required: true }] },
            { name: 'lock', description: 'Verrouiller le salon' },
            { name: 'unlock', description: 'Déverrouiller le salon' },
            { name: 'slowmode', description: 'Mode lent', options: [{ name: 'secondes', description: 'Secondes', type: 4, required: true }] }
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes globales synchronisées.');
    } catch (error) {
        console.error('❌ Erreur de synchro :', error);
    }
});

// ------------------------------------------------------------------------------
// 5. GESTION DES SALONS VOCAUX DYNAMIQUES ("Join to Create")
// ------------------------------------------------------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    const creatorChannelName = "➕ Créer un salon";

    if (newState.channel && newState.channel.name === creatorChannelName) {
        try {
            const category = newState.channel.parent;
            const userVoiceChannel = await guild.channels.create({
                name: `🔊・${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers] }
                ]
            });

            await member.voice.setChannel(userVoiceChannel);
            db.prepare(`INSERT INTO temp_voices (channelId, ownerId) VALUES (?, ?)`).run(userVoiceChannel.id, member.id);
        } catch (e) {
            console.error('Erreur vocal temp:', e);
        }
    }

    if (oldState.channel) {
        const tempVoice = db.prepare(`SELECT * FROM temp_voices WHERE channelId = ?`).get(oldState.channel.id);
        if (tempVoice && oldState.channel.members.size === 0) {
            await oldState.channel.delete().catch(() => {});
            db.prepare(`DELETE FROM temp_voices WHERE channelId = ?`).run(oldState.channel.id);
        }
    }
});

// ------------------------------------------------------------------------------
// 6. ACCUEIL VISUEL ET SÉCURITÉ ANTI-RAID
// ------------------------------------------------------------------------------
client.on('guildMemberAdd', async member => {
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 3) {
        const embedLog = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 ALERTE SÉCURITÉ : Compte suspect')
            .setDescription(`**${member.user.tag}** a rejoint avec un compte âgé de seulement **${Math.floor(accountAgeDays)} jours**.`);
        await sendLog(member.guild, embedLog);
    }

    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name.includes('bienvenue') || ch.name.includes('welcome'));
    if (welcomeChannel) {
        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setTitle('🚀 PROTOCOLE D\'ACCUEIL NOVA SQUAD')
            .setDescription(`Bienvenue à bord, <@${member.id}> !\n\nValide ta vérification via le captcha pour débloquer l'accès complet.`)
            .setImage('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setFooter({ text: 'Nova Squad Security System' });
        await welcomeChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// ------------------------------------------------------------------------------
// 7. SÉCURITÉ MESSAGERIE & AUTOMATISATION XP
// ------------------------------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const contentLower = message.content.toLowerCase();
    const badwords = databaseBadwords.getAll();

    if (badwords.some(word => contentLower.includes(word))) {
        await message.delete().catch(() => {});
        const alert = await message.channel.send(`🛡️ <@${message.author.id}>, expression prohibée bloquée.`);
        setTimeout(() => alert?.delete().catch(() => {}), 4000);
        return;
    }

    if (message.mentions.users.size > 4 || message.mentions.everyone) {
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`🛡️ <@${message.author.id}>, spam de mentions interdit.`);
            setTimeout(() => warn?.delete().catch(() => {}), 4000);
            return;
        }
    }

    const { newLevel, leveledUp } = databaseXP.addXP(message.author.id, 15);
    databaseEco.addCoins(message.author.id, 8);

    if (leveledUp) {
        const chatChan = message.guild.channels.cache.find(ch => ch.name.includes('general') || ch.name.includes('chat')) || message.channel;
        await chatChan.send(`⚡ **LEVEL UP !** <@${message.author.id}> atteint le **Niveau ${newLevel}** ! 🔥`).catch(() => {});
    }
});

// ------------------------------------------------------------------------------
// 8. GESTION DES INTERACTIONS (BOUTONS, MENUS, COMMANDES)
// ------------------------------------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_captcha') {
            const role = interaction.guild.roles.cache.find(r => r.name === 'Membre' || r.name === 'Communauté');
            if (role) await interaction.member.roles.add(role).catch(() => {});
            return interaction.reply({ content: '✅ Accès validé avec succès.', ephemeral: true });
        }
        if (interaction.customId === 'close_ticket') {
            await interaction.reply({ content: '🔒 Fermeture du ticket...', ephemeral: true });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
            return;
        }
        if (interaction.customId === 'register_tournament') {
            return interaction.reply({ content: '🏆 **Inscription validée !** Tu es inscrit au tournoi Nova Squad.', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_menu') {
            const choice = interaction.values[0];
            await interaction.deferReply({ ephemeral: true });

            const channel = await interaction.guild.channels.create({
                name: `ticket-${choice}-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const closeBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            await channel.send({
                content: `<@${interaction.user.id}>`,
                embeds: [new EmbedBuilder().setColor('#00E5FF').setTitle(`🎫 TICKET [${choice.toUpperCase()}]`).setDescription('Un membre du staff va te prendre en charge.')],
                components: [closeBtn]
            });

            return interaction.editReply({ content: `✅ Salon ouvert : <#${channel.id}>` });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setTitle('⚡ ARSENAL GÉANT - NOVA SQUAD')
            .addFields(
                { name: '🏆 Tournoi & E-Sport', value: '`/tournoi`, `/profil`, `/editprofil`' },
                { name: '💰 Économie & Casino', value: '`/solde`, `/daily`, `/slots`, `/coinflip`, `/roll`, `/quiz-rl`' },
                { name: '📈 Progression', value: '`/rank`, `/leaderboard`' },
                { name: '🛡️ Sécurité & Admin', value: '`/panneauticket`, `/captcha`, `/clear`, `/lock`' }
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ping') return interaction.reply({ content: `🏓 Latence : **${Math.round(client.ws.ping)}ms**`, ephemeral: true });
    if (commandName === 'botinfo') return interaction.reply({ content: `🤖 Nova Squad Engine actif sur **${interaction.guild.name}**.`, ephemeral: true });

    if (commandName === 'tournoi') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Réservé aux admins.', ephemeral: true });
        const nom = options.getString('nom');
        const cashprize = options.getString('cashprize');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('register_tournament').setLabel('S\'inscrire au tournoi').setStyle(ButtonStyle.Success).setEmoji('🏆')
        );

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🏆 TOURNOI : ${nom.toUpperCase()}`)
            .setDescription(`Nouveau tournoi e-sport officiel lancé par Nova Squad !`)
            .addFields(
                { name: '💰 Cashprize', value: cashprize, inline: true },
                { name: '🎮 Format', value: '3v3 Standard', inline: true }
            )
            .setImage('https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=60')
            .setTimestamp();

        await interaction.channel.send({ content: '@everyone 🚨 **NOUVEAU TOURNOI ANNONCÉ !**', embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Tournoi publié.', ephemeral: true });
    }

    if (commandName === 'profil') {
        const target = options.getMember('membre') || interaction.member;
        const prof = databaseProfile.get(target.id);
        const xp = databaseXP.get(target.id);
        const eco = databaseEco.getCoins(target.id);
        const embed = new EmbedBuilder()
            .setColor(prof.themeColor)
            .setTitle(`🎮 Profil : ${target.user.username}`)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🏆 Rang', value: prof.rankRL, inline: true },
                { name: '⚡ Rôle', value: prof.roleTeam, inline: true },
                { name: '📊 Niveau', value: `Niv. ${xp.level} (${xp.xp} XP)`, inline: true },
                { name: '🪙 Pièces', value: `${eco.coins} 🪙`, inline: true },
                { name: '🔗 Tracker', value: prof.tracker },
                { name: '📝 Bio', value: prof.bio }
            );
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'editprofil') {
        databaseProfile.set(interaction.user.id, options.getString('rang'), options.getString('tracker'), options.getString('role'), options.getString('bio') || 'Pro Player', options.getString('couleur') || '#00E5FF');
        return interaction.reply({ content: '✅ Profil mis à jour !', ephemeral: true });
    }

    if (commandName === 'solde') {
        const target = options.getMember('membre') || interaction.member;
        const eco = databaseEco.getCoins(target.id);
        return interaction.reply({ content: `💰 Solde : **${eco.coins} 🪙**` });
    }

    if (commandName === 'daily') {
        const eco = databaseEco.getCoins(interaction.user.id);
        const today = new Date().toDateString();
        if (eco.lastDaily === today) return interaction.reply({ content: '❌ Déjà réclamé aujourd\'hui !', ephemeral: true });
        databaseEco.addCoins(interaction.user.id, 500);
        databaseEco.setDaily(interaction.user.id, today);
        return interaction.reply({ content: '🎁 **+500 Pièces Nova** ajoutées !' });
    }

    if (commandName === 'slots') {
        const mise = options.getInteger('mise');
        const eco = databaseEco.getCoins(interaction.user.id);
        if (mise <= 0 || eco.coins < mise) return interaction.reply({ content: '❌ Fonds insuffisants.', ephemeral: true });
        const icons = ['⚽', '🚗', '🏆', '💎'];
        const r1 = icons[Math.floor(Math.random() * icons.length)];
        const r2 = icons[Math.floor(Math.random() * icons.length)];
        const r3 = icons[Math.floor(Math.random() * icons.length)];
        const gain = (r1 === r2 && r2 === r3) ? mise * 6 : (r1 === r2 || r2 === r3) ? mise * 2 : -mise;
        databaseEco.addCoins(interaction.user.id, gain);
        return interaction.reply({ content: `🎰 [ ${r1} | ${r2} | ${r3} ]\n${gain > 0 ? `🎉 +${gain}` : `💀 -${mise}`}` });
    }

    if (commandName === 'coinflip') {
        const mise = options.getInteger('mise');
        const choix = options.getString('choix');
        const eco = databaseEco.getCoins(interaction.user.id);
        if (mise <= 0 || eco.coins < mise) return interaction.reply({ content: '❌ Fonds insuffisants.', ephemeral: true });
        const result = Math.random() < 0.5 ? 'pile' : 'face';
        const win = choix === result;
        databaseEco.addCoins(interaction.user.id, win ? mise : -mise);
        return interaction.reply({ content: `🪙 Résultat : **${result.toUpperCase()}** ! ${win ? `+${mise}` : `-${mise}`}` });
    }

    if (commandName === 'roll') {
        const score = Math.floor(Math.random() * 100) + 1;
        return interaction.reply({ content: `🎲 Lancer : **${score}** / 100` });
    }

    if (commandName === 'quiz-rl') {
        const q = RL_QUIZ_DATABASE[Math.floor(Math.random() * RL_QUIZ_DATABASE.length)];
        await interaction.reply({ content: `❓ **QUIZ :** ${q.question}\n*(Réponds en 15s)*` });
        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: 15000, max: 1 });
        collector.on('collect', m => {
            if (m.content.toLowerCase().includes(q.answer)) {
                databaseEco.addCoins(interaction.user.id, 200);
                return m.reply('🎉 **Gagné ! +200 pièces !**');
            }
            return m.reply(`❌ Raté ! C'était : **${q.answer}**`);
        });
    }

    if (commandName === 'rank') {
        const target = options.getMember('membre') || interaction.member;
        const xp = databaseXP.get(target.id);
        return interaction.reply({ content: `📊 Niveau de <@${target.id}> : **Niv. ${xp.level}** (${xp.xp} XP)` });
    }

    if (commandName === 'leaderboard') {
        const rows = db.prepare(`SELECT userId, xp, level FROM levels ORDER BY xp DESC LIMIT 10`).all();
        const list = rows.map((r, i) => `**#${i+1}** <@${r.userId}> - Niv. ${r.level}`).join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOP 10').setDescription(list || 'Vide')] });
    }

    if (commandName === 'panneauticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Réservé aux admins.', ephemeral: true });
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_menu')
            .setPlaceholder('Sélectionne un département...')
            .addOptions([
                { label: 'Support Staff', description: 'Assistance générale', value: 'support', emoji: '🛠️' },
                { label: 'Recrutement Line-up', description: 'Candidature e-sport', value: 'esport', emoji: '🏆' },
                { label: 'Partenariat', description: 'Proposition partenariat', value: 'partner', emoji: '🤝' }
            ]);
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.channel.send({
            embeds: [new EmbedBuilder().setColor('#00E5FF').setTitle('🎫 SUPPORT NOVA SQUAD').setDescription('Sélectionne un choix ci-dessous pour ouvrir ton salon.')],
            components: [row]
        });
        return interaction.reply({ content: '✅ Panneau déployé.', ephemeral: true });
    }

    if (commandName === 'captcha') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Réservé aux admins.', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_captcha').setLabel('Se vérifier').setStyle(ButtonStyle.Success).setEmoji('✅')
        );
        await interaction.channel.send({
            embeds: [new EmbedBuilder().setColor('#00E5FF').setTitle('🔒 Sécurité Nova').setDescription('Clique pour débloquer ton accès.')],
            components: [row]
        });
        return interaction.reply({ content: '✅ Captcha déployé.', ephemeral: true });
    }

    if (commandName === 'clear') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
        const count = options.getInteger('nombre');
        const del = await interaction.channel.bulkDelete(count, true).catch(() => {});
        return interaction.reply({ content: `🧹 **${del ? del.size : 0}** messages purgés.`, ephemeral: true });
    }

    if (commandName === 'lock') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
        return interaction.reply({ content: '🔒 Salon verrouillé.' });
    }

    if (commandName === 'unlock') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
        return interaction.reply({ content: '🔓 Salon déverrouillé.' });
    }

    if (commandName === 'slowmode') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
        const seconds = options.getInteger('secondes');
        await interaction.channel.setRateLimitPerUser(seconds).catch(() => {});
        return interaction.reply({ content: `⏱️ Mode lent réglé à **${seconds}** secondes.` });
    }
});

// ------------------------------------------------------------------------------
// 9. CONNEXION FINALE
// ------------------------------------------------------------------------------
client.login(process.env.TOKEN);
