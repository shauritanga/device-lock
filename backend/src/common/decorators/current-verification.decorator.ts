import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { VerificationIdentity } from '../guards/verification-session.guard';

export const CurrentVerification = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): VerificationIdentity =>
    ctx.switchToHttp().getRequest().verification,
);
