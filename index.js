// index.js - FINAL FULL PATCH
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  Partials, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const MOD1_ID = process.env.MOD1_ID;
const MOD2_ID = process.env.MOD2_ID;
const BYPASS_CHANNEL_ID = process.env.BYPASS_CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !MOD1_ID || !MOD2_ID) process.exit(1);

const DATA_DIR = __dirname;
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const PAID_FILE = path.join(DATA_DIR, 'paid.json');

function loadJsonSafe(fp, fallback){try{if(!fs.existsSync(fp)){fs.writeFileSync(fp,JSON.stringify(fallback,null,2));return fallback;} return JSON.parse(fs.readFileSync(fp,'utf8')||JSON.stringify(fallback));}catch(e){return fallback;}}
function saveJsonSafe(fp,obj){try{fs.writeFileSync(fp,JSON.stringify(obj,null,2));}catch(e){}}
let QUEUE=loadJsonSafe(QUEUE_FILE,{accounts:['08170512639','085219498004'],counts:{'08170512639':0,'085219498004':0}});
let PAID_USERS=loadJsonSafe(PAID_FILE,{});

const MODS = {'08170512639':{id:MOD1_ID,tag:'@jojo168',account:'08170512639'},'085219498004':{id:MOD2_ID,tag:'@whoisnda_',account:'085219498004'}};
const MOD_ID_TO_ACCOUNT={}; for(const a of Object.keys(MODS)) MOD_ID_TO_ACCOUNT[MODS[a].id]=a;

const PROOF_TARGET=new Map();
const PENDING=new Map();
const BYPASS_EMBEDS=new Map();
const FORWARD_MAP=new Map();

let ONLINE={}; for(const a of Object.keys(MODS)) ONLINE[a]=true;

const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.DirectMessages,GatewayIntentBits.MessageContent],partials:[Partials.Channel]});

const PAID_TTL_MS=24*60*60*1000;
function markUserPaid(u,mod){PAID_USERS[u]={modAccount:mod,ts:Date.now()}; saveJsonSafe(PAID_FILE,PAID_USERS);}
function getPaidInfo(u){const r=PAID_USERS[u]; if(!r) return null; if(Date.now()-r.ts>PAID_TTL_MS){delete PAID_USERS[u]; saveJsonSafe(PAID_FILE,PAID_USERS); return null;} return r;}
function decrementModCount(acc){if(!acc) return; QUEUE.counts[acc]=Math.max(0,(QUEUE.counts[acc]||0)-1); saveJsonSafe(QUEUE_FILE,QUEUE);}
function getLeastLoadedOnlineAccount(){const online=QUEUE.accounts.filter(a=>ONLINE[a]); if(!online.length) return null; let best=online[0],bc=QUEUE.counts[best]||0; for(const a of online){const c=QUEUE.counts[a]||0; if(c<bc){best=a; bc=c;}} QUEUE.counts[best]=(QUEUE.counts[best]||0)+1; saveJsonSafe(QUEUE_FILE,QUEUE); return best;}

function queueStatusFields(){const who='085219498004',jo='08170512639'; const online=QUEUE.accounts.filter(a=>ONLINE[a]); let nextTag='No moderators online'; if(online.length){let b=online[0],bc=QUEUE.counts[b]||0; for(const a of online){const c=QUEUE.counts[a]||0; if(c<bc){b=a;bc=c;}} nextTag=MODS[b].tag;} let notices=[]; if(!ONLINE[jo]) notices.push(`${MODS[jo].tag.replace('@','')} is offline, try contacting ${MODS[who].tag.replace('@','')}`); if(!ONLINE[who]) notices.push(`${MODS[who].tag.replace('@','')} is offline, try contacting ${MODS[jo].tag.replace('@','')}`); return [{name:`${MODS[who].tag}`,value:`${QUEUE.counts[who]||0} antrian${!ONLINE[who]?' (OFFLINE)':''}`,inline:true},{name:`${MODS[jo].tag}`,value:`${QUEUE.counts[jo]||0} antrian${!ONLINE[jo]?' (OFFLINE)':''}`,inline:true},{name:'Next assignment',value:nextTag,inline:false},...(notices.length?[{name:'Notices',value:notices.join('\n'),inline:false}]:[])];}

async function deployCommands(){try{const rest=new REST({version:'10'}).setToken(TOKEN); await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:[{name:'bypass',description:'Tampilkan panel bypass'}]}); console.log('Commands deployed');}catch(e){console.error(e);}}

client.once('ready',async()=>{console.log(`Bot ready — ${client.user.tag}`); await deployCommands();});
// ===== Part 2 — Interaction handlers, message handling, final glue =====
// Append this to the bottom of Part 1 (after client.once('ready'...))
// Assumes Part 1 already declared: client, PROOF_TARGET, PENDING, QUEUE, QUEUE_FILE, BYPASS_EMBEDS, FORWARD_MAP,
// MODS, MOD_ID_TO_ACCOUNT, ONLINE, recomputeQueueCounts (or equivalents), startEmbedRefresher, forwardRequestToMod, queueStatusFields, etc.

// Ensure TEMP_ATTACH exists (store last screenshot per user in DM)
const TEMP_ATTACH = globalThis.TEMP_ATTACH || (globalThis.TEMP_ATTACH = new Map());

// small helper: save history if saveHistory / HISTORY exist
function saveHistoryIfExists(entry) {
  try {
    if (typeof HISTORY !== 'undefined' && Array.isArray(HISTORY)) {
      HISTORY.push(entry);
      if (typeof saveHistory === 'function') saveHistory(HISTORY);
      else if (typeof saveJsonSafe === 'function') saveJsonSafe(HISTORY_FILE, HISTORY);
    }
  } catch (e) {}
}

// Helper to refresh all bypass embeds (if not defined in Part1)
async function refreshAllIfNeeded() {
  if (typeof refreshAll === 'function') return refreshAll();
  // fallback: iterate BYPASS_EMBEDS and edit
  for (const [msgId, msg] of BYPASS_EMBEDS.entries()) {
    try {
      const newEmbed = new EmbedBuilder()
        .setTitle('Bypass Service — Rp. 3.000/hari')
        .setDescription('Layanan bypass. Tombol biru — sistem akan mengarahkan Anda ke moderator yang online dan dengan antrian paling sedikit.')
        .setColor(0x2B6CB0)
        .addFields(...queueStatusFields())
        .setFooter({ text: 'made by @unstoppable_neid' })
        .setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('assign_btn_jojo').setLabel('Contact Jojo').setStyle(ButtonStyle.Primary).setDisabled(!ONLINE['08170512639']),
        new ButtonBuilder().setCustomId('assign_btn_whoisnda').setLabel('Contact WhoisNda').setStyle(ButtonStyle.Primary).setDisabled(!ONLINE['085219498004']),
        new ButtonBuilder().setCustomId('already_paid').setLabel('Already Paid ✅').setStyle(ButtonStyle.Success)
      );
      (async () => {
        try {
          if (msg.editable) await msg.edit({ embeds: [newEmbed], components: [row] });
          else {
            const fetched = await msg.channel.messages.fetch(msg.id).catch(()=>null);
            if (fetched && fetched.editable) await fetched.edit({ embeds: [newEmbed], components: [row] });
            else BYPASS_EMBEDS.delete(msgId);
          }
        } catch (e) { BYPASS_EMBEDS.delete(msgId); }
      })();
    } catch (e) { BYPASS_EMBEDS.delete(msgId); }
  }
}

// Interaction handler (buttons + modals + slash already in Part1 — but we need full runtime handlers)
client.on('interactionCreate', async (interaction) => {
  try {
    // BUTTON handlers (some may already exist in part1; duplicate-safe guards below)
    if (interaction.isButton && interaction.customId) {
      const cid = interaction.customId;

      // 1) Contact buttons (server-side guard already implemented in Part1; this is extra guard to be safe)
      if (cid === 'assign_btn_jojo' || cid === 'assign_btn_whoisnda') {
        const assigned = (cid === 'assign_btn_jojo') ? '08170512639' : '085219498004';
        if (!ONLINE[assigned]) {
          return interaction.reply({ content: `Moderator ${MODS[assigned].tag} sedang OFFLINE. Silakan hubungi moderator lain.`, ephemeral: true });
        }
        // If Part1 already handles, we allow Part1 logic (avoid double-processing)
        // We'll check if PROOF_TARGET already set for this user — if so, reply ephemeral indicating DM already sent.
        if (PROOF_TARGET.has(interaction.user.id)) {
          return interaction.reply({ content: 'Permintaan sudah diproses. Cek DM kamu.', ephemeral: true });
        }

        // same DM flow: set assignment, DM embed with instruction, provide SUBMIT/CANCEL buttons
        const mod = MODS[assigned];
        try {
          PROOF_TARGET.set(interaction.user.id, assigned);
          const dmEmbed = new EmbedBuilder()
            .setTitle('Bypass Service — Rp. 3.000/hari')
            .setDescription(`Kirim **screenshot** bukti transfer di DM ini, lalu tekan **SUBMIT**. Bot akan meneruskannya ke ${mod.tag}.`)
            .addFields({ name: 'Rekening Tujuan', value: mod.account, inline: true })
            .setFooter({ text: 'Attach 1 foto bukti TF lalu tekan SUBMIT' })
            .setTimestamp();
          const dmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('submit_proof').setLabel('SUBMIT').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cancel_proof').setLabel('CANCEL').setStyle(ButtonStyle.Danger)
          );
          const dmUser = await client.users.fetch(interaction.user.id);
          await dmUser.send({ embeds: [dmEmbed], components: [dmRow] });
          return interaction.reply({ content: `DM terkirim. Silakan cek DM dan upload screenshot lalu tekan SUBMIT.`, ephemeral: true });
        } catch (e) {
          PROOF_TARGET.delete(interaction.user.id);
          return interaction.reply({ content: 'Gagal mengirim DM — pastikan DM terbuka untuk server ini.', ephemeral: true });
        }
      }

      // 2) Already Paid button -> show modal (ephemeral) to input link
      if (cid === 'already_paid') {
        // check paid record
        const paid = getPaidInfo(interaction.user.id);
        if (!paid) return interaction.reply({ content: '❌ Kamu belum ditandai bayar hari ini. Gunakan Contact untuk kirim bukti.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`modal_alreadypaid_${paid.modAccount}_${interaction.user.id}`).setTitle('Already Paid — Link bypass');
        const linkInput = new TextInputBuilder().setCustomId('link').setLabel('Link / Data yang ingin dibypass').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('contoh: https://...');
        modal.addComponents({ type: 1, components: [linkInput] });
        return interaction.showModal(modal);
      }

      // 3) SUBMIT in DM (user) -> open modal for link
      if (cid === 'submit_proof') {
        // ensure DM
        const ch = interaction.channel;
        if (!ch) return interaction.reply({ content: 'Tombol ini hanya bekerja di DM bot.', ephemeral: true });
        // ChannelType may differ between versions; check presence of .isDMBased or similar
        if (ch.type !== 1 && ch.type !== 'DM') {
          return interaction.reply({ content: 'Tombol ini hanya bekerja di DM bot.', ephemeral: true });
        }
        const uid = interaction.user.id;
        if (!PROOF_TARGET.has(uid)) return interaction.reply({ content: 'Kamu belum memulai permintaan via Contact. Tekan tombol Contact di server dulu.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_submitlink_${uid}`).setTitle('Masukkan Link yang ingin di-bypass');
        const linkInput = new TextInputBuilder().setCustomId('link').setLabel('Link / Data').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('contoh: https://...');
        modal.addComponents({ type: 1, components: [linkInput] });
        return interaction.showModal(modal);
      }

      // 4) CANCEL in DM (member cancels)
      if (cid === 'cancel_proof') {
        const uid = interaction.user.id;
        if (PROOF_TARGET.has(uid)) PROOF_TARGET.delete(uid);
        TEMP_ATTACH.delete(uid);
        return interaction.reply({ content: 'Proses dibatalkan.', ephemeral: true });
      }

      // 5) Mod actions: sendbypass_{userId} / cancel_{userId}
      if (/^(sendbypass|cancel)_\d+$/.test(cid)) {
        const [action, userId] = cid.split('_');
        const modUserId = interaction.user.id;
        if (action === 'cancel') {
          // delete pending, notify user
          if (PENDING.has(userId)) { PENDING.delete(userId); recomputeQueueCounts(); }
          // edit forwarded message if possible
          try {
            const forwardKey = `${modUserId}_${userId}`;
            const forwardMsgId = FORWARD_MAP.get(forwardKey);
            if (forwardMsgId) {
              const modUser = await client.users.fetch(modUserId);
              const dm = await modUser.createDM();
              const fmsg = await dm.messages.fetch(forwardMsgId).catch(()=>null);
              if (fmsg) await fmsg.edit({ content: `Canceled by <@${modUserId}>`, components: [], embeds: fmsg.embeds }).catch(()=>{});
              FORWARD_MAP.delete(forwardKey);
            } else {
              try { await interaction.update({ content: `Canceled by <@${modUserId}>`, components: [], embeds: interaction.message.embeds }); } catch(e){}
            }
          } catch (e) {}
          try { const targetUser = await client.users.fetch(userId); await targetUser.send({ embeds: [ new EmbedBuilder().setTitle('Transfer: Canceled ❌').setDescription(`Moderator <@${modUserId}> membatalkan proses.`).setTimestamp() ] }); } catch(e){}
          recomputeQueueCounts();
          await refreshAllIfNeeded();
          return interaction.reply({ content: 'Request dibatalkan.', ephemeral: true });
        }

        if (action === 'sendbypass') {
          // show modal to mod
          const modal = new ModalBuilder().setCustomId(`modal_bypass_${userId}_${interaction.user.id}`).setTitle('Kirim Bypass Code');
          const bypassInput = new TextInputBuilder().setCustomId('bypass_code').setLabel('Masukkan bypass code').setStyle(TextInputStyle.Short).setRequired(true);
          const noteInput = new TextInputBuilder().setCustomId('note').setLabel('Pesan tambahan (opsional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
          modal.addComponents({ type: 1, components: [bypassInput] }, { type: 1, components: [noteInput] });
          return interaction.showModal(modal);
        }
      }
    }

    // MODAL submits
    if (interaction.isModalSubmit && interaction.customId) {
      const cid = interaction.customId;

      // Member submitted link after uploading screenshot in DM
      if (cid.startsWith('modal_submitlink_')) {
        const userId = cid.split('_')[2];
        if (interaction.user.id !== userId) return interaction.reply({ content: 'Modal tidak cocok dengan pengguna.', ephemeral: true });

        const att = TEMP_ATTACH.get(userId);
        if (!att || !att.url) return interaction.reply({ content: 'Tidak menemukan screenshot bukti. Silakan upload screenshot di DM lalu tekan SUBMIT lagi.', ephemeral: true });

        const link = interaction.fields.getTextInputValue('link').trim();
        let assigned = PROOF_TARGET.get(userId) || getLeastLoadedOnlineAccount();
        if (!assigned) return interaction.reply({ content: 'Tidak ada moderator online saat ini. Coba lagi nanti.', ephemeral: true });
        const mod = MODS[assigned];

        // forward to mod (creates PENDING)
        const ok = await forwardRequestToMod(userId, mod, '(Proof with screenshot)', link);
        if (!ok) return interaction.reply({ content: 'Gagal menghubungi moderator. Coba lagi nanti.', ephemeral: true });

        // send attachment to mod
        try {
          const modUser = await client.users.fetch(mod.id);
          await modUser.send({ content: `File bukti dari <@${userId}>:`, files: [att.url] }).catch(()=>{});
        } catch (e) {}

        saveHistoryIfExists({ type: 'proof_forwarded', userId, toMod: mod.id, link, attachment: att, at: new Date().toISOString() });

        // keep PENDING until mod sends bypass or cancels
        // clear prep state only
        TEMP_ATTACH.delete(userId);
        PROOF_TARGET.delete(userId);

        recomputeQueueCounts();
        await refreshAllIfNeeded();
        return interaction.reply({ content: `Bukti dan link berhasil dikirim ke ${mod.tag}. Tunggu balasan mereka di DM.`, ephemeral: true });
      }

      // Already Paid modal (forward immediately)
      if (cid.startsWith('modal_alreadypaid_')) {
        const parts = cid.split('_'); // modal_alreadypaid_<modAccount>_<userId>
        const preferred = parts[2];
        const userId = parts[3] || interaction.user.id;
        if (interaction.user.id !== userId) return interaction.reply({ content: 'Modal tidak cocok dengan pengguna.', ephemeral: true });
        const link = interaction.fields.getTextInputValue('link').trim();
        let target = preferred;
        if (!ONLINE[preferred]) {
          const alt = getLeastLoadedOnlineAccount();
          if (!alt) return interaction.reply({ content: 'Tidak ada moderator online sekarang.', ephemeral: true });
          target = alt;
        }
        const mod = MODS[target];
        const ok = await forwardRequestToMod(userId, mod, '(Already Paid)', link);
        if (!ok) return interaction.reply({ content: 'Gagal menghubungi moderator. Coba lagi nanti.', ephemeral: true });
        saveHistoryIfExists({ type: 'already_paid_forwarded', userId, toMod: mod.id, link, at: new Date().toISOString() });
        recomputeQueueCounts();
        await refreshAllIfNeeded();
        return interaction.reply({ content: `Permintaan kamu sudah dikirim ke ${mod.tag}.`, ephemeral: true });
      }

      // Mod sending bypass code (robust)
      if (cid.startsWith('modal_bypass_')) {
        const parts = cid.split('_'); // modal_bypass_<userId>_<modId>
        const userId = parts[2];
        const modIdFromModal = parts[3];
        const modClickingId = interaction.user.id;
        if (modClickingId !== modIdFromModal) return interaction.reply({ content: 'Anda tidak berwenang.', ephemeral: true });

        const bypassCode = interaction.fields.getTextInputValue('bypass_code').trim();
        const note = interaction.fields.getTextInputValue('note') || '';
        const plain = `copy this bypass : ${bypassCode}`;
        const finalMsg = note ? `${plain}\n\n${note}` : plain;

        try {
          const user = await client.users.fetch(userId);
          await user.send({ content: finalMsg }).catch(()=>{});

          // mark paid for 24h
          const modAcc = MOD_ID_TO_ACCOUNT[modClickingId];
          if (modAcc) markUserPaid(userId, modAcc);

          // remove pending and recompute
          if (PENDING.has(userId)) { PENDING.delete(userId); recomputeQueueCounts(); }

          // Remove buttons from forwarded message in mod DM if stored
          try {
            const forwardKey = `${modClickingId}_${userId}`;
            const forwardMsgId = FORWARD_MAP.get(forwardKey);
            if (forwardMsgId) {
              const modUser = await client.users.fetch(modClickingId);
              const dm = await modUser.createDM();
              const fmsg = await dm.messages.fetch(forwardMsgId).catch(()=>null);
              if (fmsg) {
                await fmsg.edit({ content: `Bypass sent by <@${modClickingId}>`, components: [], embeds: fmsg.embeds }).catch(()=>{});
              }
              FORWARD_MAP.delete(forwardKey);
            } else {
              try { await interaction.message?.edit?.({ components: [] }); } catch(e){}
            }
          } catch (e) {}

          saveHistoryIfExists({ type: 'bypass_sent', to: userId, fromMod: modClickingId, code: bypassCode, note, at: new Date().toISOString() });
          await refreshAllIfNeeded();
          return interaction.reply({ content: 'Bypass code dikirim ke user.', ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: 'Gagal mengirim bypass ke user (mungkin DM terblokir).', ephemeral: true });
        }
      }
    }
  } catch (err) {
    console.error('part2 interactionCreate err', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'Terjadi error.', ephemeral: true }); } catch (e) {}
  }
});

// messageCreate (capture attachments in DM and also optionally accept text commands)
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    // capture attachments only in DM
    if (message.channel && (message.channel.type === 1 || message.channel.type === 'DM')) {
      const uid = message.author.id;
      if (message.attachments && message.attachments.size > 0) {
        const a = message.attachments.first();
        TEMP_ATTACH.set(uid, { url: a.url, name: a.name || '' });
        // reply - not ephemeral available here
        try { await message.reply('Screenshot terdeteksi dan disimpan. Tekan SUBMIT untuk mengirim ke moderator.'); } catch(e) {}
      }
      // simple DM commands for moderators (on/off) — keep existing behavior
      const txt = (message.content || '').trim().toLowerCase();
      if (txt === '/off' || txt === '/on') {
        const discordId = message.author.id;
        const account = MOD_ID_TO_ACCOUNT[discordId];
        if (!account) return message.reply('Perintah ini hanya untuk moderator.');
        ONLINE[account] = (txt === '/on');
        await message.reply(`Status: you are now ${ONLINE[account] ? 'ONLINE' : 'OFFLINE'}.`);
        await refreshAllIfNeeded();
        return;
      }
    }
  } catch (e) {
    console.error('part2 messageCreate err', e);
  }
});

// Keepalive small HTTP server for Replit (optional — requires express installed or will be skipped)
try {
  const express = require('express');
  const app = express();
  const PORT = process.env.PORT || 3000;
  app.get('/', (req, res) => res.send('Bot is alive'));
  app.listen(PORT, () => console.log(`Keepalive server listening on ${PORT}`));
} catch (e) {
  // express not installed — optional
}

// done — Part 2 end
