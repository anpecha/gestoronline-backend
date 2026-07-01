import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../common/prisma/prisma.service';

const META_GRAPH_URL = 'https://graph.facebook.com/v22.0';

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  start_time: string;
  ads?: any[];
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

@Injectable()
export class MetaAdsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getLongLivedToken(shortLivedToken: string): Promise<string> {
    const appId = this.configService.get('META_APP_ID');
    const appSecret = this.configService.get('META_APP_SECRET');

    if (appId && appSecret) {
      const { data } = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
      });
      return data.access_token;
    }
    return shortLivedToken;
  }

  async getAdAccounts(token: string): Promise<MetaAdAccount[]> {
    const { data } = await axios.get(`${META_GRAPH_URL}/me/adaccounts`, {
      params: {
        access_token: token,
        fields: 'id,name,account_id,account_status,currency',
        limit: 100,
      },
    });
    return data.data || [];
  }

  async getCampaigns(adAccountId: string, token: string): Promise<MetaCampaign[]> {
    const { data } = await axios.get(
      `${META_GRAPH_URL}/act_${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time',
          limit: 100,
        },
      },
    );
    return data.data || [];
  }

  async getCampaignMetrics(adAccountId: string, campaignId: string, token: string) {
    const { data } = await axios.get(
      `${META_GRAPH_URL}/act_${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
          'filtering': JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campaignId] }]),
          level: 'campaign',
          fields: 'campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions,conversions',
          date_preset: 'last_30d',
        },
      },
    );
    return data.data?.[0] || null;
  }

  async pauseCampaign(adAccountId: string, campaignId: string, token: string) {
    const { data } = await axios.post(
      `${META_GRAPH_URL}/${campaignId}`,
      { status: 'PAUSED', access_token: token },
    );
    return data;
  }

  async activateCampaign(adAccountId: string, campaignId: string, token: string) {
    const { data } = await axios.post(
      `${META_GRAPH_URL}/${campaignId}`,
      { status: 'ACTIVE', access_token: token },
    );
    return data;
  }

  async updateBudget(adAccountId: string, campaignId: string, budget: number, token: string) {
    const { data } = await axios.post(
      `${META_GRAPH_URL}/${campaignId}`,
      { daily_budget: Math.round(budget * 100), access_token: token },
    );
    return data;
  }

  async syncCampaigns(organizationId: string) {
    const accounts = await this.prisma.adAccount.findMany({
      where: { organizationId, platform: 'META', status: 'ACTIVE' },
    });

    for (const account of accounts) {
      if (!account.accessToken) continue;
      try {
        const campaigns = await this.getCampaigns(account.accountId, account.accessToken);

        for (const c of campaigns) {
          await this.prisma.campaign.upsert({
            where: { adAccountId_externalId: { adAccountId: account.id, externalId: c.id } },
            update: {
              name: c.name,
              status: c.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
              budget: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
              budgetType: c.daily_budget ? 'DAILY' : c.lifetime_budget ? 'LIFETIME' : null,
              objective: c.objective,
            },
            create: {
              adAccountId: account.id,
              externalId: c.id,
              name: c.name,
              status: c.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
              budget: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
              budgetType: c.daily_budget ? 'DAILY' : c.lifetime_budget ? 'LIFETIME' : null,
              objective: c.objective,
              startDate: c.start_time ? new Date(c.start_time) : null,
            },
          });
        }
      } catch (error) {
        console.error(`Erro sync Meta account ${account.accountId}:`, (error as Error).message);
      }
    }
  }

  async syncMetrics(organizationId: string) {
    const accounts = await this.prisma.adAccount.findMany({
      where: { organizationId, platform: 'META', status: 'ACTIVE' },
      include: { campaigns: true },
    });

    for (const account of accounts) {
      if (!account.accessToken) continue;
      for (const campaign of account.campaigns) {
        try {
          const metrics = await this.getCampaignMetrics(
            account.accountId,
            campaign.externalId,
            account.accessToken,
          );

          if (metrics) {
            const date = new Date();
            const spend = parseFloat(metrics.spend || '0');
            const impressions = parseInt(metrics.impressions || '0', 10);
            const clicks = parseInt(metrics.clicks || '0', 10);
            const conversions = parseInt(metrics.conversions || '0', 10);

            await this.prisma.campaignMetric.upsert({
              where: {
                campaignId_date: {
                  campaignId: campaign.id,
                  date: new Date(date.toISOString().split('T')[0]),
                },
              },
              update: {
                impressions,
                clicks,
                spend,
                ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                conversions,
              },
              create: {
                campaignId: campaign.id,
                date: new Date(date.toISOString().split('T')[0]),
                impressions,
                clicks,
                spend,
                ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                conversions,
              },
            });
          }
        } catch (error) {
          console.error(`Erro sync metrics Meta ${campaign.externalId}:`, (error as Error).message);
        }
      }
    }
  }
}
