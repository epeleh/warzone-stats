import { Message } from 'discord.js';
import { isValidCron } from 'cron-validator';
import { sendPlayerStats } from '../cod/stats';
import { getPlayerProfile } from '../cod/api';
import { CommandArgs, Player, Schedule } from '../common/types';
import { DAL } from '../dal/mongo-dal';
import { formatPlayername, shuffle } from '../utilities/util';
import { Scheduler } from '../utilities/scheduler';

export async function postStats(message: Message, args: CommandArgs) {
  const { modeId, playerId, platformId, duration } = args;

  const players: Array<Player> = [];

  // check if called for a specific player
  if (platformId && playerId) {
    // check if the specified player exists
    const player = await getPlayerProfile(platformId, playerId);
    if (player) {
      // add the player to players array
      players.push(player);
    } else {
      await message.reply('Player does not exist!');
    }
  } else {
    // if requesting for all registered players
    // fetch list of players registered in guild
    const guildId = message.guild.id;
    players.push(...await DAL.getGuildPlayers(guildId));

    // check if there are players registered in the guild
    if (!players.length) {
      await message.reply('No players registered! See `register` command.');
    }
  }

  if (message.author.id === message.client.user.id) {
    await Promise.all([
      message.guild.members.fetch({ user: players.map(({ memberId }) => memberId) }),
      message.guild.roles.fetch(),
    ]);
  }

  // send stats for each player in the players array
  players.forEach(async (player) => {
    await sendPlayerStats(message, player, duration, modeId);
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function postPlayers(message: Message, args: CommandArgs) {
  // fetch guild id
  const guildId = message.guild.id;

  // fetch players from db
  const players = await DAL.getGuildPlayers(guildId);

  // check if players registered
  if (!players || !players.length) {
    await message.reply('No players registered! See `register` command.');
    return;
  }

  const str = players.map((p) => `${formatPlayername(p, message.client)}  - <@!${p.memberId}>`)
    .reduce((s, p) => `${s}\n${p}`);

  await message.reply(`Registered players:\n${str}`);
}

export async function registerPlayer(message: Message, args: CommandArgs) {
  const { playerId, platformId, memberId } = args;

  // check if player exists
  const player = await getPlayerProfile(platformId, playerId);
  player.memberId = memberId;

  if (player) {
    // check if player is not already registered
    if (!await DAL.isPlayerRegisteredInGuild(player, message.guild.id)) {
      // check if discord member exists
      if ((await message.guild.members.fetch(player.memberId))?.user?.bot === false) {
        await DAL.addPlayerToGuild(player, message.guild.id);
        await message.reply(`${formatPlayername(player, message.client)} has been registered!`);
      } else {
        await message.reply(`Member <@!${player.memberId}> does not exist!`);
      }
    } else {
      await message.reply(`${formatPlayername(player, message.client)} is already registered!`);
    }
  } else {
    const fakePlayer: Player = { playerId: args.playerId, platformId: args.platformId };
    await message.reply(`${formatPlayername(fakePlayer, message.client)} does not exist!`);
  }
}

export async function unregisterPlayer(message: Message, args: CommandArgs) {
  // get player from args
  const { playerId, platformId } = args;

  // get player from db
  const player = await DAL.getPlayerFromGuild(message.guild.id, platformId, playerId);

  // check if the player is registered in db
  if (player) {
    await DAL.removePlayerFromGuild(player, message.guild.id);
    await message.reply(`${formatPlayername(player, message.client)} was unregistered!`);
  } else {
    await message.reply(`${formatPlayername(player, message.client)} is not registered!`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function postSingleStats(message: Message, args: CommandArgs) {
  await message.reply('This command has been merged with `!wz stats`. Please use that instead.');
}

export async function scheduleStats(message: Message, args: CommandArgs) {
  // get schedule args
  const { cron, modeId, duration } = args;

  // check if cron is valid
  if (!isValidCron(cron)) {
    message.reply('Invalid cron syntax! See https://crontab.guru/ for help.');
    return;
  }

  // schedule stats
  const schedule: Schedule = { cron, modeId, duration, channelId: message.channel.id };
  await Scheduler.schedule(schedule);

  await message.reply('Stats scheduled!');
}

export async function unscheduleStats(message: Message, args: CommandArgs) {
  // get schedule args
  const { cron, modeId, duration } = args;

  // unschedule stats
  const schedule: Schedule = { cron, modeId, duration, channelId: message.channel.id };
  await Scheduler.unschedule(schedule);

  await message.reply('Stats unscheduled!');
}

export async function postTeamSplit(message: Message, args: CommandArgs) {
  const { teamSize } = args;

  // get list of registered players
  const players = await DAL.getGuildPlayers(message.guild.id);
  shuffle(players);

  const str: Array<string> = [];

  for (let i = 0; i < players.length; i += 1) {
    if (i % teamSize == 0) {
      str.push(`\nTeam ${Math.floor(i / teamSize) + 1}`);
    }
    str.push(`${formatPlayername(players[i], message.client)}  - <@!${players[i].memberId}>`);
  }

  await message.reply(str.join('\n'));
}
