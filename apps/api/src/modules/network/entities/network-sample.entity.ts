import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("network_samples")
@Index(["network", "sampledAt"])
export class NetworkSample {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 16 })
  network: "mainnet" | "testnet";

  @Column({ name: "horizon_base_url" })
  horizonBaseUrl: string;

  @Column()
  ok: boolean;

  @Column({ name: "latency_ms", type: "integer", nullable: true })
  latencyMs: number | null;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @Column({
    name: "sampled_at",
    type: "timestamptz",
    default: () => "now()",
  })
  sampledAt: Date;
}

@Entity("network_profiles")
@Index(["ownerId", "name"], { unique: true })
export class NetworkProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column( { name: "owner_id" })
  ownerId: string;

  @Column()
  name: string;

  @Column({ name: "horizon_url" })
  horizonUrl: string;

  @Column({ name: "network_passphrase" })
  networkPassphrase: string;

  @Column({ name: "friendbot_url", type: "text", nullable: true })
  friendbotUrl: string | null;

  @Column({ name: "is_default", default: false })
  isDefault: boolean;

  @Column({ name: "is_shared", default: false })
  isShared: boolean;
}