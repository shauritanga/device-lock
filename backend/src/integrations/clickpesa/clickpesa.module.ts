import { Global, Module } from '@nestjs/common';
import { ClickPesaService } from './clickpesa.service';

@Global()
@Module({
  providers: [ClickPesaService],
  exports: [ClickPesaService],
})
export class ClickPesaModule {}
