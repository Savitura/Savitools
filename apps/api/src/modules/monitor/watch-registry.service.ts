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

  async load(): Promise<void> {
    this.watchesByKey.clear();
    const watches = await this.watchRepository.find();
    for (const watch of watches) {
      this.add(watch);
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
