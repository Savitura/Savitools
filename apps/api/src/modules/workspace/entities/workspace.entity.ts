import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { WorkspaceTool } from '../workspace-tool.enum';

@Entity('workspaces')
@Unique(['userId', 'tool'])
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.workspaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: WorkspaceTool })
  tool!: WorkspaceTool;

  @Column({ type: 'jsonb', default: {} })
  data!: Record<string, unknown>;
}
