import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
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
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
  @ApiOperation({ summary: 'Update your profile (name, bio, time zone)' })
  async updateMe(
    @CurrentUser() currentUser: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    // The id always comes from the token, so you can only ever edit yourself.
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return toUserResponse(user);
  }
}
