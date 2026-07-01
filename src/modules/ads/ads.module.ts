import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { MetaAdsService } from './meta-ads.service';
import { GoogleAdsService } from './google-ads.service';
import { AdsSyncProcessor } from './ads-sync.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'ads-sync' }),
  ],
  controllers: [AdsController],
  providers: [AdsService, MetaAdsService, GoogleAdsService, AdsSyncProcessor],
  exports: [AdsService],
})
export class AdsModule {}
