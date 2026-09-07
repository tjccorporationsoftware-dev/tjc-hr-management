import { Module } from "@nestjs/common";

import { CompanyDataController } from "./company-data.controller";
import { CompanyDataService } from "./company-data.service";

@Module({
  controllers: [CompanyDataController],
  providers: [CompanyDataService],
})
export class CompanyDataModule {}
