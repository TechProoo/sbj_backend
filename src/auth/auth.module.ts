import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
