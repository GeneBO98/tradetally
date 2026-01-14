const axios = require('axios');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * Service for checking application version and available updates
 */
class VersionService {
  constructor() {
    this.githubRepo = 'GeneBO98/tradetally';
    this.cacheKey = 'github_latest_release';
    this.cacheTTL = 60 * 60 * 1000; // 1 hour in ms
  }

  /**
   * Get the current application version from package.json
   */
  getCurrentVersion() {
    const packageInfo = require('../../package.json');
    return packageInfo.version;
  }

  /**
   * Fetch the latest release from GitHub API
   * Results are cached for 1 hour to avoid rate limiting
   */
  async getLatestRelease() {
    // Check cache first
    const cached = cache.get(this.cacheKey);
    if (cached) {
      logger.info('[VERSION] Version check served from cache');
      return cached;
    }

    try {
      logger.info('[VERSION] Fetching latest release from GitHub');

      const response = await axios.get(
        `https://api.github.com/repos/${this.githubRepo}/releases/latest`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'TradeTally-Backend'
          },
          timeout: 10000
        }
      );

      const releaseData = {
        version: response.data.tag_name.replace(/^v/, ''),
        name: response.data.name,
        published_at: response.data.published_at,
        html_url: response.data.html_url,
        body: response.data.body
      };

      // Cache the result
      cache.set(this.cacheKey, releaseData, this.cacheTTL);
      logger.info('[VERSION] Latest release fetched and cached: v' + releaseData.version);

      return releaseData;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn('[VERSION] No releases found on GitHub');
        return null;
      }
      logger.error('[VERSION] Failed to fetch GitHub releases', error);
      throw error;
    }
  }

  /**
   * Compare two semver versions
   * @returns 1 if latest > current (update available), -1 if current > latest, 0 if equal
   */
  compareVersions(current, latest) {
    const parseVersion = (v) => {
      const parts = v.split('.');
      return parts.map(p => parseInt(p, 10) || 0);
    };

    const c = parseVersion(current);
    const l = parseVersion(latest);

    for (let i = 0; i < 3; i++) {
      const currentPart = c[i] || 0;
      const latestPart = l[i] || 0;

      if (latestPart > currentPart) return 1;  // Update available
      if (latestPart < currentPart) return -1; // Current is newer
    }
    return 0; // Same version
  }

  /**
   * Check if an update is available
   * Returns full version info with update status
   */
  async checkForUpdates() {
    const currentVersion = this.getCurrentVersion();

    let latestRelease = null;
    let updateAvailable = false;
    let error = null;

    try {
      latestRelease = await this.getLatestRelease();

      if (latestRelease) {
        const comparison = this.compareVersions(currentVersion, latestRelease.version);
        updateAvailable = comparison > 0;

        logger.info(`[VERSION] Version check: current=${currentVersion}, latest=${latestRelease.version}, updateAvailable=${updateAvailable}`);
      }
    } catch (fetchError) {
      logger.error('[VERSION] Version check failed', fetchError);
      error = 'Unable to check for updates';
    }

    return {
      current_version: currentVersion,
      latest_version: latestRelease?.version || null,
      update_available: updateAvailable,
      release_url: latestRelease?.html_url || null,
      release_name: latestRelease?.name || null,
      published_at: latestRelease?.published_at || null,
      error: error
    };
  }
}

module.exports = new VersionService();
