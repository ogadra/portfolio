import { fetchGithubStats, type GithubEnv, type GithubStats, type WaitUntil } from './github';
import { FIXTURE_STATS } from './github.fixture';
import { parseStatsMode, STATS_MODE } from './statsMode';

interface HomeStatsEnv extends GithubEnv {
	GITHUB_STATS?: string;
}

/**
 * Picks where the home page data comes from. GITHUB_STATS pins it for the
 * browser tests; unset means a live fetch.
 */
export const resolveGithubStats = async (
	env: HomeStatsEnv,
	waitUntil: WaitUntil,
): Promise<GithubStats | null> => {
	switch (parseStatsMode(env.GITHUB_STATS)) {
		case STATS_MODE.fixture:
			return FIXTURE_STATS;
		case STATS_MODE.offline:
			return null;
		default:
			return fetchGithubStats(env, waitUntil);
	}
};
