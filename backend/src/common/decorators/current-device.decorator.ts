import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DeviceIdentity } from '../guards/device-auth.guard';

/** Injects the device identity attached by DeviceAuthGuard. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DeviceIdentity => {
    return ctx.switchToHttp().getRequest().device as DeviceIdentity;
  },
);
