import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags, ApiResponse } from "@nestjs/swagger";
import { NetworkService } from "./network.service";

@ApiTags("network")
@Controller("network")
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Get("status")
  @ApiOperation({ summary: "Get current Stellar network status and fees" })
  @ApiQuery({
    name: "network",
    required: false,
    enum: ["mainnet", "testnet"],
    description: "Network to query (default: mainnet)",
  })
  @ApiResponse({ status: 200, description: "Network status retrieved" })
  async getStatus(@Query("network") network: string = "mainnet") {
    const net = network === "testnet" ? "testnet" : "mainnet";
    return this.networkService.fetchCurrentStatus(net);
  }

  @Get("status/history")
  @ApiOperation({ summary: "Get network status history and uptime metrics" })
  @ApiQuery({
    name: "network",
    required: false,
    enum: ["mainnet", "testnet"],
    description: "Network to query (default: mainnet)",
  })
  @ApiQuery({
    name: "from",
    required: false,
    description: "ISO date lower bound (default: 60 minutes before to)",
  })
  @ApiQuery({
    name: "to",
    required: false,
    description: "ISO date upper bound (default: now)",
  })
  @ApiResponse({ status: 200, description: "Network status history retrieved" })
  async getHistory(
    @Query("network") network: string = "mainnet",
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const net = network === "testnet" ? "testnet" : "mainnet";
    return this.networkService.getHistory(net, from, to);
  }
}
