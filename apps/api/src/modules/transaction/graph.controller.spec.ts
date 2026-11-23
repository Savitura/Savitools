import { Test, TestingModule } from '@nestjs/testing';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

describe('GraphController', () => {
  let controller: GraphController;
  let graphService: { getTransactionGraph: jest.Mock };

  beforeEach(async () => {
    graphService = {
      getTransactionGraph: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GraphController],
      providers: [{ provide: GraphService, useValue: graphService }],
    }).compile();

    controller = module.get<GraphController>(GraphController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('transaction graph endpoint', () => {
    it('should delegate to GraphService with the requested transaction hash', async () => {
      const hash = 'a'.repeat(64);
      const graph = { nodes: [], edges: [] };
      graphService.getTransactionGraph.mockResolvedValue(graph);

      const result = await controller.getTransactionGraph(hash);

      expect(graphService.getTransactionGraph).toHaveBeenCalledWith(hash);
      expect(result).toEqual(graph);
    });

    it('should propagate errors raised by GraphService', async () => {
      const hash = 'b'.repeat(64);
      graphService.getTransactionGraph.mockRejectedValue(new Error('not found'));

      await expect(controller.getTransactionGraph(hash)).rejects.toThrow('not found');
    });
  });
});
