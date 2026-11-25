import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only record of one connectivity probe against a saved network profile.
 *
 * Kept separate from `NetworkSample` (which tracks the public Horizon networks)
 * because a profile points at a user-supplied Horizon URL and is scoped to its
 * owner.
 */
@Entity('network_profile_history')
@Index(['profileId', 'checkedAt'])
export class NetworkProfileHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'profile_id' })
  profileId: string;

  /** Denormalised owner so reads can be scoped without joining the profile. */
  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column()
  ok: boolean;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs: number | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'checked_at', type: 'timestamptz' })
  checkedAt: Date;
}
