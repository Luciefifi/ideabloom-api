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
  ConvertIdeaDto,
  CreateProjectDto,
  LinkIdeaDto,
  ListProjectsQueryDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List your projects (active ones by default)' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<ProjectListResponseDto> {
    return this.projects.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project (only the title is required)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One project with progress, milestones and related ideas',
  })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project (send only what changes)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete a project and its milestones (ideas stay; the source idea returns to "planned")',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.projects.remove(user.id, id);
  }

  @Post(':id/ideas')
  @ApiOperation({ summary: 'Link one of your ideas to this project' })
  linkIdea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkIdeaDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.linkIdea(user.id, id, dto.ideaId);
  }

  @Delete(':id/ideas/:ideaId')
  @ApiOperation({ summary: 'Unlink an idea from this project' })
  unlinkIdea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ideaId', ParseUUIDPipe) ideaId: string,
  ): Promise<ProjectResponseDto> {
    return this.projects.unlinkIdea(user.id, id, ideaId);
  }
}

/** Lives with projects because converting creates a project. */
@ApiTags('Ideas')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('ideas')
export class IdeaConversionController {
  constructor(private readonly projects: ProjectsService) {}

  @Post(':id/convert')
  @ApiOperation({
    summary:
      'Turn an idea into a project (copies title, description, category and priority)',
  })
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertIdeaDto,
  ): Promise<ProjectResponseDto> {
    return this.projects.convertIdea(user.id, id, dto);
  }
}
