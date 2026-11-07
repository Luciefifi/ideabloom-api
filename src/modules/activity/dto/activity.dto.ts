import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type {
  Activity,
  ActivityAction,
  ActivityEntityType,
  ActivityMetadata,
} from '../entities/activity.entity';

export class ActivityQueryDto {
  /** How many entries (newest first). @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ActivityResponseDto {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  /** @example "Plant watering app" */
  summary: string;
  metadata: ActivityMetadata;
  createdAt: Date;
}

export function toActivityResponse(activity: Activity): ActivityResponseDto {
  return {
    id: activity.id,
    entityType: activity.entityType,
    entityId: activity.entityId,
    action: activity.action,
    summary: activity.summary,
    metadata: activity.metadata,
    createdAt: activity.createdAt,
  };
}
