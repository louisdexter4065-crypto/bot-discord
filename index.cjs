const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    ChannelType,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const express = require('express');

// --- ANTI-CRASH SYSTEM (Empêche le bot de s'arrêter sur une erreur) ---
process.on('unhandledRejection', (reason) => console.error('⚠️ [ANTI-CRASH] Erreur non gérée :', reason));
process.on('uncaughtException', (err) => console.error('⚠️ [ANTI-CRASH] Exception non capturée :', err));
process.on('uncaughtExceptionMonitor', (err) => console.error('⚠️ [ANTI-CRASH] Surveillance exception :', err));

// --- 1. SERVEUR EXPRESS (Anti-mise en veille Render) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.status(200).send('AKUMA E-SPORT Bot est en ligne !'));
app.get('/ping', (req, res) => res.send('Pong ! Bot actif.'));

app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`🚀 Serveur Web AKUMA prêt sur le port ${PORT}`);
    console.log(`=============================================`);
});

// --- 2. CONFIGURATION DU BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// URL de l'image AKUMA E-SPORT
const LOGO_URL = 'https://i.imgur.com/YOUR_IMAGE_HERE.png';

// Base de données en mémoire (XP & Économie)
const db = {
    users: new Map(),
    getUser(id) {
        if (!this.users.has(id)) {
            this.users.set(id, {
                xp: 0,
                level: 1,
                coins: 100,
                lastDaily: 0,
                themeColor: '#FF0000'
            });
        }
        return this.users.get(id);
    }
};

// --- 3. DÉCLARATION DES COMMANDES SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName('profil')
        .setDescription('Affiche votre profil complet AKUMA')
        .addUserOption(opt => opt.setName('membre').setDescription('Membre à afficher').setRequired(false)),

    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Récupère ta récompense quotidienne de pièces !'),

    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Envoie des pièces à un autre membre')
        .addUserOption(opt => opt.setName('destinataire').setDescription('Le membre qui reçoit').setRequired(true))
        .addIntegerOption(opt => opt.setName('montant').setDescription('Nombre de pièces').setRequired(true)),

    new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Affiche la boutique du serveur AKUMA'),

    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Parier des pièces à pile ou face !')
        .addStringOption(opt => opt.setName('choix').setDescription('Pile ou Face').setRequired(true).addChoices(
            { name: 'Pile', value: 'pile' },
            { name: 'Face', value: 'face' }
        ))
        .addIntegerOption(opt => opt.setName('mise').setDescription('Montant de la mise').setRequired(true)),

    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Affiche les statistiques complètes du serveur AKUMA E-SPORT'),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre du serveur')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('membre').setDescription('Membre à expulser').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison de l\'expulsion').setRequired(false)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre du serveur')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('membre').setDescription('Membre à bannir').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison du bannissement').setRequired(false)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprime des messages dans le salon')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName('nombre').setDescription('Nombre de messages (1 à 100)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('annonce')
        .setDescription('Publie un embed d\'annonce officielle AKUMA')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('titre').setDescription('Titre de l\'annonce').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Contenu du message').setRequired(true))
].map(c => c.toJSON());

const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

// --- 4. ÉVÉNEMENT READY & INSTALLATION AUTOMATIQUE ---
client.once('ready', async () => {
    console.log(`👹 AKUMA BOT connecté avec succès sous : ${client.user.tag}`);

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commandes Slash enregistrées !');
    } catch (err) {
        console.error('❌ Erreur slash commands :', err);
    }

    // Installation automatique des salons et des panneaux dans tous les serveurs
    client.guilds.cache.forEach(async (guild) => {
        try {
            // A. PANNEAU CAPTCHA AUTOMATIQUE
            let captchaChannel = guild.channels.cache.find(c => c.name.includes('verification') || c.name.includes('captcha'));
            if (!captchaChannel) {
                captchaChannel = await guild.channels.create({
                    name: '🔒-vérification',
                    type: ChannelType.GuildText
                });
            }

            const captchaMessages = await captchaChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const hasCaptcha = captchaMessages?.some(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('Vérification'));

            if (!hasCaptcha) {
                const captchaEmbed = new EmbedBuilder()
                    .setTitle('🛡️ Vérification - AKUMA E-SPORT')
                    .setDescription('Clique ci-dessous pour vérifier ton profil et débloquer les salons !')
                    .setColor('#FF0000')
                    .setThumbnail(LOGO_URL);

                const captchaRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('verify_btn').setLabel('S\'enregistrer').setStyle(ButtonStyle.Success).setEmoji('🔒')
                );

                await captchaChannel.send({ embeds: [captchaEmbed], components: [captchaRow] });
                console.log(`✅ Panneau Captcha placé automatiquement dans #${captchaChannel.name} (${guild.name})`);
            }

            // B. PANNEAU TICKETS AUTOMATIQUE
            let ticketChannel = guild.channels.cache.find(c => c.name.includes('ticket') || c.name.includes('support'));
            if (!ticketChannel) {
                ticketChannel = await guild.channels.create({
                    name: '📩-tickets',
                    type: ChannelType.GuildText
                });
            }

            const ticketMessages = await ticketChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const hasTicket = ticketMessages?.some(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('Centre d\'Assistance'));

            if (!hasTicket) {
                const ticketEmbed = new EmbedBuilder()
                    .setTitle('📩 Centre d\'Assistance & Support - AKUMA E-SPORT')
                    .setDescription('Sélectionne un bouton ci-dessous pour créer ton salon privé avec l\'équipe.')
                    .setColor('#FF0000')
                    .setThumbnail(LOGO_URL);

                const ticketRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ticket_support').setLabel('Support Général').setStyle(ButtonStyle.Primary).setEmoji('❓'),
                    new ButtonBuilder().setCustomId('ticket_recrutement').setLabel('Recrutement Esport').setStyle(ButtonStyle.Success).setEmoji('🏆'),
                    new ButtonBuilder().setCustomId('ticket_partenariat').setLabel('Partenariat').setStyle(ButtonStyle.Secondary).setEmoji('🤝')
                );

                await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketRow] });
                console.log(`✅ Panneau Ticket placé automatiquement dans #${ticketChannel.name} (${guild.name})`);
            }
        } catch (error) {
            console.error(`⚠️ Erreur d'installation automatique dans ${guild.name} :`, error);
        }
    });
});

// --- 5. SYSTÈME D'XP SUR CHAT ---
client.on('messageCreate', (message) => {
    if (message.author.bot || !message.guild) return;
    
    const user = db.getUser(message.author.id);
    user.xp += Math.floor(Math.random() * 10) + 5;
    
    if (user.xp >= user.level * 100) {
        user.level += 1;
        user.coins += 50;
        message.channel.send(`🎉 Félicitations ${message.author}, tu passes niveau **${user.level}** et tu gagnes **50 pièces** !`).catch(() => {});
    }
});

// --- 6. BIENVENUE AUTOMATIQUE ---
client.on('guildMemberAdd', async (member) => {
    const welcomeChannel = member.guild.channels.cache.find(ch => 
        ch.name.includes('bienvenue') || ch.name.includes('welcome')
    );
    if (!welcomeChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('👹 Bienvenue dans la AKUMA E-SPORT !')
        .setDescription(`Bienvenue dans la akuma esport ${member} ! Amuse toi bien et n'hésite pas à faire 1 ticket ! 🚀`)
        .setColor('#FF0000')
        .setThumbnail(LOGO_URL)
        .setImage(LOGO_URL)
        .setFooter({ text: 'AKUMA E-SPORT', iconURL: LOGO_URL })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_btn_welcome').setLabel('Se Vérifier').setStyle(ButtonStyle.Success).setEmoji('✅')
    );

    welcomeChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
});

// --- 7. GESTION DES COMMANDES ET BOUTONS ---
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            const userData = db.getUser(interaction.user.id);

            if (commandName === 'profil') {
                const target = interaction.options.getUser('membre') || interaction.user;
                const targetData = db.getUser(target.id);

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Profil AKUMA • ${target.username}`)
                    .setColor(targetData.themeColor || '#FF0000')
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '⭐ Niveau', value: `${targetData.level}`, inline: true },
                        { name: '✨ Expérience', value: `${targetData.xp} XP`, inline: true },
                        { name: '🪙 Solde', value: `${targetData.coins} pièces`, inline: true }
                    )
                    .setFooter({ text: 'AKUMA E-SPORT', iconURL: LOGO_URL });

                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'daily') {
                const now = Date.now();
                const cooldown = 24 * 60 * 60 * 1000;

                if (now - userData.lastDaily < cooldown) {
                    const remaining = Math.ceil((cooldown - (now - userData.lastDaily)) / (1000 * 60 * 60));
                    return interaction.reply({ content: `⏳ Revenez dans ${remaining}h pour votre bonus !`, flags: 64 });
                }

                userData.coins += 150;
                userData.lastDaily = now;
                return interaction.reply({ content: '🎁 Bonus quotidien de **150 pièces** récupéré !' });
            }

            if (commandName === 'pay') {
                const dest = interaction.options.getUser('destinataire');
                const amount = interaction.options.getInteger('montant');

                if (amount <= 0 || userData.coins < amount) {
                    return interaction.reply({ content: '❌ Solde insuffisant !', flags: 64 });
                }

                const destData = db.getUser(dest.id);
                userData.coins -= amount;
                destData.coins += amount;

                return interaction.reply({ content: `💸 Tu as envoyé **${amount} pièces** à ${dest} !` });
            }

            if (commandName === 'shop') {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Boutique AKUMA E-SPORT')
                    .setDescription('Avantages à débloquer :')
                    .setColor('#FF0000')
                    .addFields(
                        { name: '🥇 Rôle VIP', value: '500 pièces', inline: true },
                        { name: '🎨 Couleur Custom Profil', value: '1000 pièces', inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'coinflip') {
                const choix = interaction.options.getString('choix');
                const mise = interaction.options.getInteger('mise');

                if (mise <= 0 || userData.coins < mise) {
                    return interaction.reply({ content: '❌ Mise invalide.', flags: 64 });
                }

                const resultat = Math.random() < 0.5 ? 'pile' : 'face';
                if (choix === resultat) {
                    userData.coins += mise;
                    return interaction.reply({ content: `🎲 **${resultat}** ! Tu gagnes **${mise} pièces** !` });
                } else {
                    userData.coins -= mise;
                    return interaction.reply({ content: `🎲 **${resultat}**... Tu perds **${mise} pièces**.` });
                }
            }

            if (commandName === 'serverinfo') {
                const embed = new EmbedBuilder()
                    .setTitle(`📊 Infos Serveur • ${interaction.guild.name}`)
                    .setColor('#FF0000')
                    .setThumbnail(interaction.guild.iconURL() || LOGO_URL)
                    .addFields(
                        { name: '👥 Membres', value: `${interaction.guild.memberCount}`, inline: true },
                        { name: '👑 Owner', value: `<@${interaction.guild.ownerId}>`, inline: true }
                    );
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'kick') {
                const target = interaction.options.getUser('membre');
                const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
                const member = interaction.guild.members.cache.get(target.id);
                if (member) {
                    await member.kick(reason);
                    return interaction.reply({ content: `👢 ${target.tag} a été expulsé. Raison : ${reason}` });
                }
            }

            if (commandName === 'ban') {
                const target = interaction.options.getUser('membre');
                const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
                const member = interaction.guild.members.cache.get(target.id);
                if (member) {
                    await member.ban({ reason });
                    return interaction.reply({ content: `🔨 ${target.tag} a été banni. Raison : ${reason}` });
                }
            }

            if (commandName === 'clear') {
                const amount = interaction.options.getInteger('nombre');
                if (amount < 1 || amount > 100) return interaction.reply({ content: 'Nombre entre 1 et 100.', flags: 64 });

                await interaction.channel.bulkDelete(amount, true);
                return interaction.reply({ content: `🧹 **${amount} messages** supprimés.`, flags: 64 });
            }

            if (commandName === 'annonce') {
                const titre = interaction.options.getString('titre');
                const message = interaction.options.getString('message');

                const embed = new EmbedBuilder()
                    .setTitle(`📢 ${titre}`)
                    .setDescription(message)
                    .setColor('#FF0000')
                    .setFooter({ text: 'AKUMA E-SPORT', iconURL: LOGO_URL });

                await interaction.channel.send({ embeds: [embed] });
                return interaction.reply({ content: 'Annonce envoyée !', flags: 64 });
            }
        }

        if (interaction.isButton()) {
            const { customId, guild, member } = interaction;

            if (customId === 'verify_btn' || customId === 'verify_btn_welcome') {
                const role = guild.roles.cache.find(r => r.name.toLowerCase().includes('membre'));
                if (role) await member.roles.add(role).catch(() => {});
                return interaction.reply({ content: '✅ Tu es maintenant vérifié chez AKUMA E-SPORT !', flags: 64 });
            }

            if (['ticket_support', 'ticket_recrutement', 'ticket_partenariat'].includes(customId)) {
                const type = customId.split('_')[1];
                const channelName = `ticket-${type}-${member.user.username}`.toLowerCase();

                if (guild.channels.cache.find(c => c.name === channelName)) {
                    return interaction.reply({ content: '❌ Tu as déjà un ticket ouvert !', flags: 64 });
                }

                const channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const embed = new EmbedBuilder()
                    .setTitle(`🎫 Ticket ${type.toUpperCase()} - AKUMA`)
                    .setDescription(`Bienvenue ${member}, pose tes questions ici, un admin répondra au plus vite !`)
                    .setColor('#FF0000');

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                );

                await channel.send({ content: `${member}`, embeds: [embed], components: [closeRow] });
                return interaction.reply({ content: `✅ Ticket créé : ${channel}`, flags: 64 });
            }

            if (customId === 'close_ticket') {
                await interaction.reply({ content: '🔒 Fermeture du ticket dans 5 secondes...' });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }
        }
    } catch (err) {
        console.error('⚠️ [INTERACTION ERROR]', err);
    }
});

// Connexion via la variable d'environnement de Render
client.login(token);
