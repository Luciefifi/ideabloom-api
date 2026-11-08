import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/** Shared by notes and resources: attach to ONE idea or ONE project. */
export class AttachmentFieldsDto {
  /** Attach to one of YOUR ideas (clears projectId), or null to detach. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'ideaId must be a valid id' })
  ideaId?: string | null;

  /** Attach to one of YOUR projects (clears ideaId), or null to detach. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'projectId must be a valid id' })
  projectId?: string | null;
}
