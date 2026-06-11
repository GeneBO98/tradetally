require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

function parseArgs(argv) {
  const args = {
    releaseFile: null,
    announcementType: 'version',
    featureName: null,
    featureBenefit: null,
    ctaUrl: null,
    webhookUrl: process.env.N8N_ANNOUNCEMENT_WEBHOOK_URL || null,
    webhookSecret: process.env.N8N_ANNOUNCEMENT_SECRET || null,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--release-file' && next) {
      args.releaseFile = next;
      i += 1;
    } else if (arg === '--type' && next) {
      args.announcementType = next;
      i += 1;
    } else if (arg === '--feature-name' && next) {
      args.featureName = next;
      i += 1;
    } else if (arg === '--feature-benefit' && next) {
      args.featureBenefit = next;
      i += 1;
    } else if (arg === '--cta-url' && next) {
      args.ctaUrl = next;
      i += 1;
    } else if (arg === '--webhook-url' && next) {
      args.webhookUrl = next;
      i += 1;
    } else if (arg === '--webhook-secret' && next) {
      args.webhookSecret = next;
      i += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function parseReleaseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '') || null;
  const releasedLine = lines.find((line) => /^Released:\s+/i.test(line));
  const releasedAt = releasedLine ? releasedLine.replace(/^Released:\s+/i, '') : null;

  const sections = {};
  let currentSection = null;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      currentSection = line.replace(/^##\s+/, '').toLowerCase();
      sections[currentSection] = [];
      continue;
    }

    if (currentSection && line.startsWith('- ')) {
      sections[currentSection].push(line.replace(/^- /, ''));
    }
  }

  return {
    title,
    releasedAt,
    highlights: sections.highlights || sections.fixes || sections['fixes and improvements'] || [],
    upgradeNotes: sections['upgrade notes'] || [],
    rawSections: sections
  };
}

function buildCampaignBrief(payload) {
  const copyBrief = payload.announcementType === 'feature'
    ? 'Write a marketing-forward feature announcement. Sound confident, human, and specific. Avoid a specs sheet. Lead with the problem solved, then the payoff, then a concise CTA.'
    : 'Write a marketing-forward release announcement. Sound confident, punchy, and human. Avoid changelog language. Lead with the upgrade value, then what changed, then a short CTA.';

  return {
    brand: 'TradeTally',
    audience: 'active traders and journaling users',
    tone: 'confident, direct, slightly sharp, product-led',
    copyBrief,
    guardrails: [
      'No technical release-note formatting',
      'No feature bullet dump',
      'No corporate filler',
      'Keep it social-first and readable out loud',
      'Prefer one strong hook over a broad list'
    ],
    facts: {
      type: payload.announcementType,
      version: payload.version || null,
      title: payload.title || null,
      releasedAt: payload.releasedAt || null,
      highlights: payload.highlights || [],
      upgradeNotes: payload.upgradeNotes || [],
      featureName: payload.featureName || null,
      featureBenefit: payload.featureBenefit || null,
      ctaUrl: payload.ctaUrl || null
    }
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.webhookUrl && !args.dryRun) {
    throw new Error('Missing N8N announcement webhook URL. Set N8N_ANNOUNCEMENT_WEBHOOK_URL or pass --webhook-url.');
  }

  let releaseData = {
    title: null,
    releasedAt: null,
    highlights: [],
    upgradeNotes: []
  };

  if (args.releaseFile) {
    const releasePath = path.resolve(args.releaseFile);
    const markdown = fs.readFileSync(releasePath, 'utf8');
    releaseData = parseReleaseMarkdown(markdown);
  }

  const payload = {
    announcementType: args.announcementType,
    version: releaseData.title?.match(/v(\d+\.\d+\.\d+)/i)?.[1] || null,
    title: releaseData.title,
    releasedAt: releaseData.releasedAt,
    highlights: releaseData.highlights,
    upgradeNotes: releaseData.upgradeNotes,
    featureName: args.featureName,
    featureBenefit: args.featureBenefit,
    ctaUrl: args.ctaUrl || process.env.TRADETALLY_PUBLIC_URL || null,
    campaignBrief: buildCampaignBrief({
      announcementType: args.announcementType,
      version: releaseData.title?.match(/v(\d+\.\d+\.\d+)/i)?.[1] || null,
      title: releaseData.title,
      releasedAt: releaseData.releasedAt,
      highlights: releaseData.highlights,
      upgradeNotes: releaseData.upgradeNotes,
      featureName: args.featureName,
      featureBenefit: args.featureBenefit,
      ctaUrl: args.ctaUrl || process.env.TRADETALLY_PUBLIC_URL || null
    })
  };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const response = await axios.post(args.webhookUrl, payload, {
    headers: args.webhookSecret
      ? { 'X-TradeTally-Announcement-Secret': args.webhookSecret }
      : undefined,
    timeout: 15000
  });

  console.log(`[ANNOUNCEMENT] Sent to n8n: ${response.status}`);
}

main().catch((error) => {
  console.error('[ANNOUNCEMENT] Failed to send release announcement:', error.response?.data || error.message);
  process.exit(1);
});
