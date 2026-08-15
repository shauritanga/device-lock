import {
  Controller,
  Get,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import { Public } from '../common/decorators/public.decorator';
import { ProvisioningService } from './provisioning.service';

/**
 * Serves the agent APK to the Android setup wizard during QR provisioning.
 * Public + unauthenticated: a factory-fresh device has no credentials yet, and
 * the wizard verifies the download against the signature checksum in the QR,
 * so serving the binary openly is safe.
 */
@Public()
@Controller('provisioning')
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get('agent.apk')
  downloadApk(@Res() res: Response) {
    const apk = this.provisioning.apkPath;
    if (!existsSync(apk)) {
      throw new NotFoundException(
        'Agent APK not found — build android-dpc (assembleRelease) or set PROVISIONING_APK_PATH',
      );
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="agent.apk"');
    res.setHeader('Content-Length', statSync(apk).size);
    createReadStream(apk).pipe(res);
  }
}
