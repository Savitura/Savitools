import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('transaction_replays')
@Index(['userId', 'createdAt'])
export class TransactionReplay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'testnet' })
  network!: 'testnet' | 'mainnet';

  @Column({ name: 'original_hash', type: 'varchar', length: 64 })
  originalHash!: string;

  @Column({ name: 'original_xdr', type: 'text' })
  originalXdr!: string;

  @Column({ name: 'original_details', type: 'jsonb', nullable: true })
  originalDetails!: any;

  @Column({ name: 'modified_xdr', type: 'text' })
  modifiedXdr!: string;

  @Column({ type: 'jsonb' })
  modifications!: any;

  @Column({ name: 'simulation_result', type: 'jsonb' })
  simulationResult!: any;

  @Column({ type: 'boolean', default: false })
  submitted!: boolean;

  @Column({ name: 'submitted_hash', type: 'varchar', length: 64, nullable: true })
  submittedHash!: string | null;

  @Column({ name: 'submission_result', type: 'jsonb', nullable: true })
  submissionResult!: any | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
