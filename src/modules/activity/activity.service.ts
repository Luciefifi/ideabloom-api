import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  Activity,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityMetadata,
} from './entities/activity.entity';

export interface ActivityEntry {
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  /** Usually the item's title at the time, e.g. "Plant watering app". */
  summary: string;
  metadata?: ActivityMetadata;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
  ) {}

  /**
   * Records something the user did. Pass `manager` when inside a database
   * transaction, so the activity is saved (or undone) together with the change.
   */
  async log(
    userId: string,
    entry: ActivityEntry,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(Activity)
      : this.activities;
    await repository.insert({
      userId,
      ...entry,
      summary: entry.summary.slice(0, 255),
      metadata: entry.metadata ?? {},
    });
  }

  /** The user's most recent activity, newest first. */
  findRecent(userId: string, limit: number): Promise<Activity[]> {
    return this.activities.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
