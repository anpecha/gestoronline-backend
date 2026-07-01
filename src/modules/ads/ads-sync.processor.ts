import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { MetaAdsService } from './meta-ads.service';

@Processor('ads-sync')
export class AdsSyncProcessor {
  constructor(private metaAds: MetaAdsService) {}

  @Process('sync-all')
  async handleSync(job: Job<{ organizationId: string }>) {
    const { organizationId } = job.data;
    await this.metaAds.syncCampaigns(organizationId);
    await this.metaAds.syncMetrics(organizationId);
  }
}
