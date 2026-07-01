import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { AdsService } from './ads.service';
import { MetaAdsService } from './meta-ads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CacheService } from '../../common/cache/cache.service';
import { ConnectMetaDto } from './dto/connect-meta.dto';
import { ConnectGoogleDto } from './dto/connect-google.dto';
import { UpdateCampaignStatusDto, UpdateCampaignBudgetDto, CampaignAction } from './dto/update-campaign.dto';

@Controller('ads')
@UseGuards(JwtAuthGuard)
export class AdsController {
  constructor(
    private adsService: AdsService,
    private metaAds: MetaAdsService,
    private cache: CacheService,
  ) {}

  @Get('accounts')
  getAccounts(@CurrentUser('organizationId') orgId: string) {
    return this.adsService.getAccounts(orgId);
  }

  @Post('accounts/meta/connect')
  connectMeta(@CurrentUser('organizationId') orgId: string, @Body() dto: ConnectMetaDto) {
    return this.adsService.connectMeta(orgId, dto.accessToken);
  }

  @Post('accounts/google/connect')
  connectGoogle(@CurrentUser('organizationId') orgId: string, @Body() dto: ConnectGoogleDto) {
    return this.adsService.connectGoogle(orgId, dto);
  }

  @Get('campaigns')
  getCampaigns(
    @CurrentUser('organizationId') orgId: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.adsService.getCampaigns(orgId, accountId);
  }

  @Get('overview')
  async getOverview(@CurrentUser('organizationId') orgId: string) {
    const cacheKey = `overview:${orgId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;
    const data = await this.adsService.getOverview(orgId);
    await this.cache.set(cacheKey, data, 300);
    return data;
  }

  @Get('metrics/timeseries')
  async getTimeSeries(
    @CurrentUser('organizationId') orgId: string,
    @Query('days') days = '30',
    @Query('platform') platform?: string,
  ) {
    const cacheKey = `timeseries:${orgId}:${days}:${platform || 'all'}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const numDays = parseInt(days, 10);
    const metrics = await this.adsService.getDailyMetrics(orgId, numDays, platform);
    await this.cache.set(cacheKey, metrics, 300);
    return metrics;
  }

  @Post('campaigns/:id/status')
  async updateStatus(
    @Param('id') campaignId: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    const campaigns = await this.adsService.getCampaigns(orgId);
    const campaign = campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) throw new Error('Campanha não encontrada');
    const account = (campaign as any).adAccount;

    if (account.platform === 'META') {
      if (dto.action === CampaignAction.PAUSE) {
        await this.metaAds.pauseCampaign(account.accountId, (campaign as any).externalId, account.accessToken);
      } else {
        await this.metaAds.activateCampaign(account.accountId, (campaign as any).externalId, account.accessToken);
      }
    }

    await this.cache.del(`timeseries:${orgId}:*`);
    return { success: true };
  }

  @Post('campaigns/:id/budget')
  async updateBudget(
    @Param('id') campaignId: string,
    @Body() dto: UpdateCampaignBudgetDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    const campaigns = await this.adsService.getCampaigns(orgId);
    const campaign = campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) throw new Error('Campanha não encontrada');
    const account = (campaign as any).adAccount;

    if (account.platform === 'META') {
      await this.metaAds.updateBudget(account.accountId, (campaign as any).externalId, dto.budget, account.accessToken);
    }

    return { success: true };
  }

  @Post('sync')
  async sync(@CurrentUser('organizationId') orgId: string) {
    await this.metaAds.syncCampaigns(orgId);
    await this.metaAds.syncMetrics(orgId);
    await this.cache.del(`overview:${orgId}`);
    await this.cache.del(`timeseries:${orgId}:*`);
    return { success: true };
  }
}
