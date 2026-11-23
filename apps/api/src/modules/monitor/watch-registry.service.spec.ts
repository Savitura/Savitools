import { Repository } from 'typeorm';
import { Watch } from './entities/watch.entity';
import { WatchRegistry } from './watch-registry.service';

describe('WatchRegistry', () => {
  it('deduplicates watches under one stream key and removes the key last', async () => {
    const watches = [watch('one'), watch('two')];
    const repository = {
      find: jest.fn().mockResolvedValue(watches),
    } as unknown as Repository<Watch>;
    const registry = new WatchRegistry(repository);

    await registry.load();

    expect(registry.keys()).toEqual(['testnet:account:GACCOUNT']);
    expect(registry.get(registry.keys()[0])).toHaveLength(2);
    expect(registry.remove(watches[0])).toBe(false);
    expect(registry.remove(watches[1])).toBe(true);
    expect(registry.keys()).toHaveLength(0);
  });
});

function watch(id: string): Watch {
  return {
    id,
    network: 'testnet',
    type: 'account',
    publicKey: 'GACCOUNT',
  } as Watch;
}
