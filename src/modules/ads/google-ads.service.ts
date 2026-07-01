import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma/prisma.service';

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v18';

@Injectable()
export class GoogleAdsService {
  constructor(private prisma: PrismaService) {}

  async getAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    return data.access_token;
  }

  async getAdAccounts(accessToken: string, developerToken: string) {
    const { data } = await axios.post(
      `${GOOGLE_ADS_API}/customers:listAccessibleCustomers`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      },
    );
    return data.resourceNames || [];
  }

  async getCampaigns(
    customerId: string,
    accessToken: string,
    developerToken: string,
  ) {
    const { data } = await axios.post(
      `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
      {
        query: `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.start_date,
            campaign.end_date,
            campaign.optimization_score,
            campaign.advertising_channel_type,
            campaign.budget.amount_micros
          FROM campaign
          WHERE campaign.status != 'REMOVED'
          ORDER BY campaign.name
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      },
    );
    return data.results || [];
  }

  async getMetrics(
    customerId: string,
    campaignId: string,
    accessToken: string,
    developerToken: string,
  ) {
    const { data } = await axios.post(
      `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
      {
        query: `
          SELECT
            campaign.id,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.ctr,
            metrics.average_cpc,
            metrics.conversions,
            metrics.conversions_value
          FROM campaign
          WHERE campaign.id = ${campaignId}
          AND segments.date DURING LAST_30_DAYS
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      },
    );
    return data.results?.[0] || null;
  }

  async pauseCampaign(
    customerId: string,
    campaignId: string,
    accessToken: string,
    developerToken: string,
  ) {
    await axios.post(
      `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:mutate`,
      {
        operations: [
          {
            update: {
              resourceName: `customers/${customerId}/campaigns/${campaignId}`,
              status: 'PAUSED',
            },
            updateMask: 'status',
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      },
    );
  }
}
