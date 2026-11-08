import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateResourceDto,
  ListResourcesQueryDto,
  ResourceListResponseDto,
  ResourceResponseDto,
  UpdateResourceDto,
} from './dto/resource.dto';
import { ResourcesService } from './resources.service';

@ApiTags('Resources')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOperation({ summary: 'Your saved links, with search and filters' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListResourcesQueryDto,
  ): Promise<ResourceListResponseDto> {
    return this.resources.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Save a link (title and url are required)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateResourceDto,
  ): Promise<ResourceResponseDto> {
    return this.resources.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One resource' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResourceResponseDto> {
    return this.resources.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a resource (send only what changes)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
  ): Promise<ResourceResponseDto> {
    return this.resources.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a resource permanently' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.resources.remove(user.id, id);
  }
}
