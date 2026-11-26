import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watch } from './entities/watch.entity';

@Injectable()
export class WatchRegistry {
  private readonly watchesByKey = new Map<string, Map<string, Watch>>();

  constructor(
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
  ) {}

  static readonly LOAD_BATCH_SIZE = 1_000;

  async load(): Promise<void> {
    this.watchesByKey.clear();
    let skip = 0;
    while (true) {
      const batch = await this.watchRepository.find({
        order: { id: 'ASC' },
        take: WatchRegistry.LOAD_BATCH_SIZE,
        skip,
      });
      for (const watch of batch) {
        this.add(watch);
      }
      if (batch.length < WatchRegistry.LOAD_BATCH_SIZE) {
        break;
      }
      skip += WatchRegistry.LOAD_BATCH_SIZE;
    }
  }

  add(watch: Watch): void {
    const key = this.keyFor(watch);
    const watches = this.watchesByKey.get(key) ?? new Map<string, Watch>();
    watches.set(watch.id, watch);
    this.watchesByKey.set(key, watches);
  }

  remove(watch: Watch): boolean {
    const key = this.keyFor(watch);
    const watches = this.watchesByKey.get(key);
    if (!watches) {
      return true;
    }

    watches.delete(watch.id);
    if (watches.size === 0) {
      this.watchesByKey.delete(key);
      return true;
    }
    return false;
  }

  get(key: string): Watch[] {
    return Array.from(this.watchesByKey.get(key)?.values() ?? []);
  }

  keys(): string[] {
    return Array.from(this.watchesByKey.keys());
  }

  keyFor(watch: Pick<Watch, 'network' | 'type' | 'publicKey'>): string {
    return `${watch.network}:${watch.type}:${watch.publicKey}`;
  }
}
