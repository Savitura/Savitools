import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('watches')
export class Watch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column()
  address!: string;

  @Column({ type: 'varchar', length: 50 })
  type!: 'account' | 'contract';

  @Column({ nullable: true })
  label!: string;

  @Column({ type: 'varchar', length: 50, default: 'testnet' })
  network!: 'testnet' | 'public';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
