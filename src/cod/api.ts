import moment = require('moment');
import { Duration, GameMode, Player, Platform } from '../common/types';
import { request } from '../utilities/util';

export async function getPlayerProfile(platformId: Platform, playerId: string): Promise<Player> {
  const url = `https://api.tracker.gg/api/v2/warzone/standard/profile/${platformId}/${encodeURIComponent(playerId)}`;
  const res = await request(url);
  return res.errors ? null : {
    playerId: res.data.platformInfo.platformUserIdentifier,
    platformId: res.data.platformInfo.platformSlug,
    avatarUrl: res.data.platformInfo.avatarUrl,
  };
}

export async function getRecentMatches(player: Player, duration: Duration, mode: GameMode) {
  const now = moment();
  const recentMatches = [];

  let next = 'null';

  // fetch all matches during specified duration
  for (;;) {
    // get matches from tracker.gg api
    const url = `https://api.tracker.gg/api/v2/warzone/standard/matches/${player.platformId}/${encodeURIComponent(player.playerId)}?type=wz&next=${next}`;
    const res = await request(url);

    if (res.errors) {
      throw res.errors[0];
    }

    let { matches } = res.data;

    // filter out matches of other types
    matches = matches.filter((x) => x.attributes.modeId.startsWith(`${mode}_`));

    // filter to only today's matches
    const filteredMatches = matches.filter((x) => now.diff(x.metadata.timestamp, duration.unit) < duration.value);

    // append filtered matches to todays list
    recentMatches.push(...filteredMatches);

    // stop if reached duration limit or all matches
    if (filteredMatches.length < matches.length) {
      break;
    }

    // setup for next query
    next = res.data.metadata.next;
  }

  return recentMatches;
}
