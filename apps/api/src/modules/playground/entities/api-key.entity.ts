import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum ApiKeyProvider {
  FLUXA = 'fluxa',
  CROWDPAY = 'crowdpay',
}

@Entity('api_keys')
@Unique(['userId', 'provider', 'label'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: ApiKeyProvider })
  provider!: ApiKeyProvider;

  @Column()
  label!: string;

  @Column({ name: 'encrypted_key' })
  encryptedKey!: string;

  @Column()
  iv!: string;

  @Column({ name: 'auth_tag' })
  authTag!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
