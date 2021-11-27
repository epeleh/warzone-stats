import { Client, Message, MessageEmbed } from 'discord.js';
import * as _ from 'lodash';
import { Duration, GameMode, Player, Stats } from '../common/types';
import { getRecentMatches } from './api';
import { formatDuration, formatPlayername, getEmbedTemplate } from '../utilities/util';
import TaskRepeater from '../utilities/task-repeater';

export async function sendPlayerStats(message: Message, player: Player, duration: Duration, mode: GameMode) {
  const reply = await message.reply(getEmbedTemplate(`${formatPlayername(player, message.client)}`, 'Fetching stats...', player.avatarUrl));

  try {
    // create a onError callback
    const onError = (e, retryNum, totalRetries) => {
      reply.edit(getEmbedTemplate(`${formatPlayername(player, message.client)}`, `Failed to fetch stats!\n${e.message}\nRetry ${retryNum} of ${totalRetries}`, player.avatarUrl));
    };

    // create a taskrepeater instance
    const taskRepeater = new TaskRepeater(fetchTask, [player, duration, mode], 5000, 5, onError);

    // run the repeater
    const playerStats: Stats = await taskRepeater.run();

    // create a stats embed and send
    const embed = createStatsEmbed(player, playerStats, duration, message.client);
    await reply.edit(embed);

    // check if an author of the message is wz bot and the k/d field is found
    if (message.author.id === message.client.user.id && embed.fields.some(({ name }) => name === 'K/D')) {
      const guildMember = message.guild.members.cache.filter(({ user: { bot } }) => !bot)
        .find(({ user: { username } }) => username.toLowerCase() === player.discordUsername);

      if (guildMember) {
        const roleNames = ['0+', '0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0+'];

        // calculate new role name
        const kd = parseFloat(embed.fields.find(({ name }) => name === 'K/D').value);
        const newRoleName = roleNames.find((rn) => parseFloat(rn) === Math.floor(kd * 2) / 2);

        // skip if the member already has the role
        if (!guildMember.roles.cache.some(({ name }) => name === newRoleName)) {
          // remove old k/d roles
          for (const role of guildMember.roles.cache.filter(({ name }) => roleNames.includes(name))) {
            await guildMember.roles.remove(role);
          }

          // create the role if doesn't exist
          let newRole = message.guild.roles.cache.find(({ name }) => name === newRoleName);
          if (!newRole) newRole = await message.guild.roles.create({ data: { name: newRoleName } });

          // add new role
          await guildMember.roles.add(newRole);
          await message.channel.send(`<@${guildMember.user.id}> got new role: <@&${newRole.id}>`);
        }
      }
    }
  } catch (e) {
    await reply.edit(getEmbedTemplate(`${formatPlayername(player, message.client)}`, `Failed to fetch stats.\n${e.message}`, player.avatarUrl));
  }
}

async function fetchTask(player: Player, duration: Duration, mode: GameMode) {
  const matches = await getRecentMatches(player, duration, mode);
  return calculateStats(matches);
}

function createStatsEmbed(player: Player, stats: Stats, duration: Duration, client: Client): MessageEmbed {
  const embed = getEmbedTemplate(`${formatPlayername(player, client)}`, `Stats for the past ${duration.value} ${duration.unit}(s)`, player.avatarUrl);

  // no matches played, early return
  if (stats.Matches == 0) {
    embed.setDescription(`No matches played over the past ${duration.value} ${duration.unit}(s)!`);
    return embed;
  }

  // proceed with formatting
  embed.setDescription(`over the past ${duration.value} ${duration.unit}(s)`);

  // to get these stats on top
  embed.addField('Matches', stats.Matches);
  embed.addField('Kills', stats.Kills, true);
  embed.addField('Deaths', stats.Deaths, true);
  embed.addField('K/D', stats['K/D'], true);

  // add stats as embedded fields
  for (const stat in stats) {
    if (keepStat(stat, stats[stat])) {
      embed.addField(stat, stats[stat], true);
    }
  }

  return embed;
}

function keepStat(key, value) {
  // skip default stats
  if (['Matches', 'Kills', 'Deaths', 'K/D'].includes(key)) return false;
  // remove 0 value stats
  if (!value) return false;
  if (value == 0) return false;
  if (_.isNaN(value)) return false;
  if (value == '0.00') return false;
  if (value == '0s') return false;
  return true;
}

function sum(stats, field): number {
  try {
    // select field values
    const values = stats.map((x) => (x[field] ? x[field].value : 0));
    // sum all these values and return
    return values.reduce((a, b) => a + b, 0);
  } catch (e) {
    // something went wrong, possibly a change in the API
    console.error("Couldn't sum field", field);
    return NaN;
  }
}

function calculateStats(matches): Stats {
  const stats = matches.map((x) => x.segments[0].stats);
  const statValues: Stats = {
    Matches: stats.length,
    Kills: sum(stats, 'kills'),
    Deaths: sum(stats, 'deaths'),
    Assists: sum(stats, 'assists'),
    'Time Played': formatDuration(sum(stats, 'timePlayed')),
    'Avg. Game Time': formatDuration(sum(stats, 'timePlayed') / stats.length),
    Headshots: sum(stats, 'headshots'),
    Executions: sum(stats, 'executions'),
    'Longest Streak': Math.max(...stats.map((x) => (x.longestStreak ? x.longestStreak.value : 0))),
    'Vehicles Destroyed': sum(stats, 'objectiveDestroyedVehicleLight') + sum(stats, 'objectiveDestroyedVehicleMedium') + sum(stats, 'objectiveDestroyedVehicleHeavy'),
    'Team Wipes': sum(stats, 'objectiveTeamWiped'),
    Wins: stats.map((x) => (x.placement && x.placement.value == 1 ? 1 : 0)).reduce((x, y) => x + y, 0),
  };

  // calculate K/D
  const kd = statValues.Kills / Math.max(statValues.Deaths, 1);
  statValues['K/D'] = kd.toFixed(2);

  // calculate lobby K/D
  const lobbyKdMatches = matches.map((x) => x.attributes.avgKd).filter((x) => x);
  const lobbyKd = lobbyKdMatches.reduce((total, x) => total + x.kd, 0) / lobbyKdMatches.length;
  statValues['Avg. Lobby K/D'] = lobbyKd.toFixed(2);

  // calculate win percentage
  statValues['Win Ratio'] = `${(100 * statValues.Wins / statValues.Matches).toFixed(0)}%`;

  // calculate placement percentile
  const matchesTotalTeams = matches.map((x) => x.metadata.teamCount);
  const matchesPlacements = stats.map((x) => x.placement.value);
  if (matchesTotalTeams.length == matchesPlacements.length) {
    const percentile = 100 * (matchesPlacements.map((x, i) => x / matchesTotalTeams[i]).reduce((x, y) => x + y, 0)) / statValues.Matches;
    statValues['Avg. Team Placement'] = `Top ${percentile.toFixed(1)}%`;
  }

  return statValues;
}
