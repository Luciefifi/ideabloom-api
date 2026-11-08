import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Idea } from '../ideas/entities/idea.entity';
import { Project } from '../projects/entities/project.entity';
import type { AttachmentFieldsDto } from './attachment.dto';

/**
 * Notes and resources can be attached to ONE idea OR ONE project (or nothing).
 * The database enforces "not both" with a CHECK; this file holds the shared
 * request fields and the ownership rules.
 */
export interface Attachment {
  ideaId: string | null;
  projectId: string | null;
}

/**
 * Works out the new attachment from what was sent:
 * - sending an ideaId attaches to that idea and detaches from any project (and vice versa);
 * - sending null detaches; sending nothing keeps the current attachment.
 * Throws 400 for both at once, and 404 when the idea/project isn't the user's.
 */
export async function resolveAttachment(
  manager: EntityManager,
  userId: string,
  current: Attachment,
  dto: AttachmentFieldsDto,
): Promise<Attachment> {
  if (dto.ideaId && dto.projectId) {
    throw new BadRequestException(
      'Attach it to an idea or to a project, not both.',
    );
  }
  const next = { ...current };
  if (dto.ideaId !== undefined) {
    next.ideaId = dto.ideaId;
    if (dto.ideaId) next.projectId = null;
  }
  if (dto.projectId !== undefined) {
    next.projectId = dto.projectId;
    if (dto.projectId) next.ideaId = null;
  }

  if (next.ideaId && next.ideaId !== current.ideaId) {
    if (!(await manager.existsBy(Idea, { id: next.ideaId, userId }))) {
      throw new NotFoundException('Idea not found');
    }
  }
  if (next.projectId && next.projectId !== current.projectId) {
    if (!(await manager.existsBy(Project, { id: next.projectId, userId }))) {
      throw new NotFoundException('Project not found');
    }
  }
  return next;
}

/** Loads the project title, to log "Added note …" on the project's timeline. */
export async function projectTitle(
  manager: EntityManager,
  projectId: string,
): Promise<string> {
  const project = await manager.findOneByOrFail(Project, { id: projectId });
  return project.title;
}
