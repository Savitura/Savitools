import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GraphService } from './graph.service';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

@ApiTags('graph')
@Controller('transaction')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  // Authenticated (#260): each request fans out Horizon calls, so an anonymous
  // caller must not be able to trigger crawls. The service also caps each one.
  @Post('graph')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Build a Stellar account relationship graph (signers / offers / payments)',
  })
  @ApiBody({ type: GraphQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Graph nodes and edges; truncated/truncatedBy report a traversal limit being hit',
  })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({ status: 404, description: 'Root account not found on network' })
  @ApiResponse({ status: 400, description: 'Invalid query or Horizon failure' })
  buildGraph(@Body() dto: GraphQueryDto) {
    return this.graphService.buildGraph(dto);
  }
}

export { GraphMode };
