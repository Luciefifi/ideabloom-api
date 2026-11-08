import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserResponse, UserResponseDto } from './dto/user-response.dto';
import type { Response } from 'express';
import { AuthRateLimit } from '../../common/throttling/throttler.config';
import { DataExport, DataExportService } from './data-export.service';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly dataExport: DataExportService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the logged-in user' })
  async getMe(@CurrentUser() currentUser: AuthUser): Promise<UserResponseDto> {
    const user = await this.usersService.findById(currentUser.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update your profile (name, bio, time zone) and preferences',
  })
  async updateMe(
    @CurrentUser() currentUser: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    // The id always comes from the token, so you can only ever edit yourself.
    const { preferences, ...profile } = dto;
    const user = await this.usersService.updateProfile(
      currentUser.id,
      profile,
      preferences,
    );
    return toUserResponse(user);
  }

  @Get('me/export')
  @AuthRateLimit()
  @ApiOperation({
    summary:
      'Download everything you have created, as JSON (no password or session data)',
  })
  async exportMe(
    @CurrentUser() currentUser: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataExport> {
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ideabloom-export-${day}.json"`,
    );
    return this.dataExport.export(currentUser.id);
  }
}
