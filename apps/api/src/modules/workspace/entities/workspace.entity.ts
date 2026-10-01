import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { WorkspaceTool } from '../workspace-tool.enum';

@Entity('workspaces')
// Named workspaces: (user_id, tool, name) is unique. This alone cannot express
// the default-workspace rule below, because PostgreSQL treats NULLs as distinct
// in a unique index.
@Unique(['userId', 'tool', 'name'])
// The default (unnamed) workspace: a partial unique index over the rows the
// composite unique above cannot cover, so at most one `name IS NULL` row exists
// per (user_id, tool). Mirrored by the migration, which also de-duplicates any
// rows that predate it.
@Index('UQ_workspaces_user_tool_default', ['userId', 'tool'], {
  unique: true,
  where: `"name" IS NULL`,
})
// Listing/fetching workspaces is always scoped by user_id; without this the
// only usable index led with the composite unique.
@Index('IDX_workspaces_user_id', ['userId'])
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.workspaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: WorkspaceTool })
  tool: WorkspaceTool;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'share_token', type: 'varchar', nullable: true, unique: true })
  shareToken: string | null;

  @Column({ name: 'share_expires_at', type: 'timestamptz', nullable: true })
  shareExpiresAt: Date | null;
}
