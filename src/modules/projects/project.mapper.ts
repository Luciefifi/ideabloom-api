import type {
  MilestoneDto,
  ProjectResponseDto,
  ProjectSummaryDto,
} from './dto/project.dto';
import type { Milestone } from './entities/milestone.entity';
import type { Project } from './entities/project.entity';
import { computeProgress, type Counts, isOverdue } from './progress';

export function toMilestoneDto(
  milestone: Milestone,
  today: string,
): MilestoneDto {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    dueDate: milestone.dueDate,
    completedAt: milestone.completedAt,
    isOverdue:
      !milestone.completedAt &&
      milestone.dueDate !== null &&
      milestone.dueDate < today,
    position: milestone.position,
  };
}

export function toProjectSummary(
  project: Project,
  milestoneCounts: Counts,
  taskCounts: Counts,
  today: string,
): ProjectSummaryDto {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    priority: project.priority,
    category: project.category
      ? {
          id: project.category.id,
          name: project.category.name,
          color: project.category.color,
        }
      : null,
    startDate: project.startDate,
    targetDate: project.targetDate,
    completedAt: project.completedAt,
    isOverdue: isOverdue(project, today),
    progress: computeProgress({
      status: project.status,
      tasks: taskCounts,
      milestones: milestoneCounts,
    }),
    milestones: milestoneCounts,
    tasks: taskCounts,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Full project: needs `milestones`, `relatedIdeas`, `category` and `sourceIdea` loaded. */
export function toProjectResponse(
  project: Project,
  taskCounts: Counts,
  today: string,
): ProjectResponseDto {
  const milestones = [...(project.milestones ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const counts = {
    completed: milestones.filter((m) => m.completedAt).length,
    total: milestones.length,
  };

  return {
    ...toProjectSummary(project, counts, taskCounts, today),
    description: project.description,
    goals: project.goals,
    sourceIdea: project.sourceIdea
      ? { id: project.sourceIdea.id, title: project.sourceIdea.title }
      : null,
    relatedIdeas: (project.relatedIdeas ?? [])
      .map((idea) => ({
        id: idea.id,
        title: idea.title,
        status: idea.status,
        isArchived: idea.archivedAt !== null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    milestoneList: milestones.map((m) => toMilestoneDto(m, today)),
  };
}
