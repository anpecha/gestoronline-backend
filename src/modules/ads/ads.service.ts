import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MetaAdsService } from './meta-ads.service';
import { GoogleAdsService } from './google-ads.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class AdsService {
  constructor(
    private prisma: PrismaService,
    private metaAds: MetaAdsService,
    private googleAds: GoogleAdsService,
  ) {}

  async connectMeta(organizationId: string, accessToken: string) {
    const longToken = await this.metaAds.getLongLivedToken(accessToken);
    const metaAccounts = await this.metaAds.getAdAccounts(longToken);
    const connected: string[] = [];

    for (const account of metaAccounts) {
      await this.prisma.adAccount.upsert({
        where: {
          organizationId_platform_accountId: {
            organizationId,
            platform: 'META',
            accountId: account.account_id,
          },
        },
        update: {
          name: account.name,
          accessToken: longToken,
          status: 'ACTIVE',
        },
        create: {
          organizationId,
          platform: 'META',
          name: account.name,
          accountId: account.account_id,
          accessToken: longToken,
          status: 'ACTIVE',
        },
      });
      connected.push(account.account_id);
    }

    await this.metaAds.syncCampaigns(organizationId);

    return { connected, total: connected.length };
  }

  async connectGoogle(
    organizationId: string,
    dto: { accessToken: string; refreshToken: string; clientId: string; clientSecret: string },
  ) {
    const developerToken = process.env.GOOGLE_ADS_DEV_TOKEN || '';
    const accounts = await this.googleAds.getAdAccounts(dto.accessToken, developerToken);
    const connected: string[] = [];

    for (const resource of accounts) {
      const customerId = resource.replace('customers/', '');
      await this.prisma.adAccount.upsert({
        where: {
          organizationId_platform_accountId: {
            organizationId,
            platform: 'GOOGLE',
            accountId: customerId,
          },
        },
        update: {
          name: `Google Ads - ${customerId}`,
          accessToken: dto.accessToken,
          status: 'ACTIVE',
        },
        create: {
          organizationId,
          platform: 'GOOGLE',
          name: `Google Ads - ${customerId}`,
          accountId: customerId,
          accessToken: dto.accessToken,
          status: 'ACTIVE',
        },
      });
      connected.push(customerId);
    }

    return { connected, total: connected.length };
  }

  async getAccounts(organizationId: string) {
    return this.prisma.adAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaigns(organizationId: string, accountId?: string) {
    const where: any = { adAccount: { organizationId } };
    if (accountId) where.adAccountId = accountId;

    return this.prisma.campaign.findMany({
      where,
      include: { adAccount: true, metrics: { orderBy: { date: 'desc' }, take: 30 } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOverview(organizationId: string) {
    const accounts = await this.prisma.adAccount.findMany({
      where: { organizationId, status: 'ACTIVE' },
    });

    const campaignIds = await this.prisma.campaign.findMany({
      where: { adAccount: { organizationId } },
      select: { id: true },
    });

    const metrics = await this.prisma.campaignMetric.findMany({
      where: { campaignId: { in: campaignIds.map((c) => c.id) } },
    });

    const total = metrics.reduce(
      (acc, m) => ({
        spend: acc.spend + m.spend,
        impressions: acc.impressions + m.impressions,
        clicks: acc.clicks + m.clicks,
        conversions: acc.conversions + m.conversions,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
    );

    const activeCampaigns = await this.prisma.campaign.count({
      where: { adAccount: { organizationId }, status: 'ACTIVE' },
    });

    return {
      accounts: accounts.length,
      activeCampaigns,
      metrics: {
        ...total,
        ctr: total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0,
        cpc: total.clicks > 0 ? total.spend / total.clicks : 0,
      },
    };
  }

  async getDailyMetrics(organizationId: string, days: number, platform?: string) {
    const where: Prisma.CampaignMetricWhereInput = {
      campaign: { adAccount: { organizationId } },
      date: { gte: new Date(Date.now() - days * 86400000) },
    };

    if (platform) {
      (where.campaign as any).adAccount.platform = platform;
    }

    const metrics = await this.prisma.campaignMetric.findMany({
      where,
      include: { campaign: { include: { adAccount: true } } },
      orderBy: { date: 'asc' },
    });

    const dailyMap = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();

    for (const m of metrics) {
      const key = m.date.toISOString().split('T')[0];
      const existing = dailyMap.get(key) || { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      existing.spend += m.spend;
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.conversions += m.conversions;
      dailyMap.set(key, existing);
    }

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      ...data,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
      cpc: data.clicks > 0 ? data.spend / data.clicks : 0,
    }));
  }
}
