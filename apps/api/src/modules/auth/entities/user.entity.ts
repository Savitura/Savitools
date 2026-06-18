import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiKey } from '../../playground/entities/api-key.entity';
import { RefreshToken } from './refresh-token.entity';
import { Workspace } from '../../workspace/entities/workspace.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'fluxa_tenant_id', nullable: true, unique: true })
  fluxaTenantId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];

  @OneToMany(() => Workspace, (workspace) => workspace.user)
  workspaces!: Workspace[];

  @OneToMany(() => ApiKey, (apiKey) => apiKey.user)
  apiKeys!: ApiKey[];
}
