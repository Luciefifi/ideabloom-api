import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  toActivityResponse,
  type ActivityResponseDto,
} from '../activity/dto/activity.dto';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateMilestoneDto,
  ProjectActivityQueryDto,
  ReorderMilestonesDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { ProjectResponseDto } from './dto/project.dto';
import { MilestonesService } from './milestones.service';
import { ProjectsService } from './projects.service';

@ApiTags('Milestones')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller()
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
  ) {}

  @Post('projects/:id/milestones')
  @ApiOperation({
    summary: 'Add a milestone (added last); returns the updated project',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateMilestoneDto,
  ): Promise<ProjectResponseDto> {
    return this.milestones.create(user.id, projectId, dto);
  }

  @Put('projects/:id/milestones/order')
  @ApiOperation({
    summary: 'Reorder milestones (send every id once, in the new order)',
  })
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: ReorderMilestonesDto,
  ): Promise<ProjectResponseDto> {
    return this.milestones.reorder(user.id, projectId, dto);
  }

  @Patch('milestones/:id')
  @ApiOperation({
    summary:
      'Edit, complete (completed: true) or reopen (completed: false) a milestone',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ): Promise<ProjectResponseDto> {
    return this.milestones.update(user.id, id, dto);
  }

  @Delete('milestones/:id')
  @ApiOperation({ summary: 'Delete a milestone; returns the updated project' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectResponseDto> {
    return this.milestones.remove(user.id, id);
  }

  @Get('projects/:id/activity')
  @ApiTags('Projects')
  @ApiOperation({ summary: "A project's history, newest first" })
  async projectActivity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectActivityQueryDto,
  ): Promise<ActivityResponseDto[]> {
    await this.projects.findOwned(user.id, projectId); // 404 if not yours
    const entries = await this.activity.findForEntity(
      user.id,
      'project',
      projectId,
      query.limit,
    );
    return entries.map(toActivityResponse);
  }
}
