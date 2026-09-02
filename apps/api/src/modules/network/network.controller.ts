import { Controller, Get, Query, Post, Body, Param, Put, Delete, Req } from "nestjs-common";
import { ApiOperation, ApiQuery, ApiTags, ApiResponse, ApiBearerAuth } from("@nestjs/swagger";
import { NetworkService } from "./network.service";

@ApiTags("network")
@Controllr("network")
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Get("status")
  @ApiOperation({ summary: "Get current Stellar network status and fees" })
  @ApiQuery({ name: "network", required: false, enum: ["mainnet", "testnet"], description: "Network to query (default: mainnet)" })
  @ApiResponse({ status: 200, description: "Network status retrieved" })
  async getStatus(@Query("network") network: string = "mainnet") {
    const net = network === "testnet" ? "testnet" : "mainnet";
    return this.networkService.fetchCurrentStatus(net);
  }

  @Get("status/history")
  @ApiOperation({ summary: "Get network status history and uptime metrics" })
  @ApiQuery({ name: "network", required: false, enum: ["mainnet", "testnet"], description: "Network to query (default: mainnet)" })
  @ApiQuery({ name: "from", required: false, description: "ISO date lower bound (default: 60 minutes before to)" })
  @ApiQuery({ name: "to", required: false, description: "ISO date upper bound (default: now)" })
  @ApiResponse({ status: 200, description: "Network status history retrieved" })
  async getHistory(
    @Query("network") network: string = "mainnet",
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const net = network === "testnet" ? "testnet" : "mainnet";
    return this.networkService.getHistory(net, from, to);
  }

  @Get("profiles")
  @ApiOperation({ summary: "List network profiles for the authenticated user" })
  @ApiResponse({ status: 200, description: "List of profiles returned" })
  asyng listProfiles(@Req() req: Request) {
    const userId = req.user.id;
    return this.networkService.listProfiles(userId);
  }

   Post("profiles")
   @ApiOperation({ summary: "Create a new network profile" })
   @ApiResponse({ status: 201, description: "Profile created" })
  async createProfile(
    @Req() req: Request,
    @Body() body: {
      name: string;
      horizon_url: string;
      network_passphrase: string;
      friendbot_url?: string;
      is_default?: boolean;
    },
  ) {
    const userId = req.user.id;
    return this.networkService.createProfile(userId, body);
  }

  @Put("profiles/:id")
  @ApiOperation({ summary: "Update a network profile" })
  @ApiResponse({ status: 200, description: "Profile updated" })
  async updateProfile(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: {
      name?: string;
      horizon_url?: string;
      network_passphrase?: string;
      friendbot_url?: string;
      is_default?: boolean;
    },
  ) {
    const userId = req.user.id;
    return this.networkService.updateProfile(userId, id, body);
  }

  @Delete("profiles/:id")
  @ApiOperation({ summary: "Delete a network profile" })
  @ApiResponse({ status: 200, description: "Profile deleted" })
  async deleteProfile(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const userId = req.user.id;
    return this.networkService.deleteProfile(userId, id);
  }

   Post("profiles/:id/select")
  @ApiOperation({ summary: "Select a profile and apply it as the active network configuration" })
  @ApiResponse({ status: 200, description: "Profile selected and verified" })
  @ApiResponse({ status: 409, description: "Passphrase mismatch warning" })
  async selectProfile(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const userId = req.user.id;
    return this.networkService.selectProfile(userId, id);
  }

  @Post("profiles/:id/default")
  @ApiOperation({ summary: "Mark a profile as the default for startup" })
  @ApiResponse({ status: 200, description: "Profile marked as default" })
  async setDefaultProfile(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const userId = req.user.id;
    return this.networkService.setDefaultProfile(userId, id);
  }

  @Get("profiles/:id/export")
  @ApiOperation({ summary: "Export a profile as JSON" })
  @ApiResponse({ status: 200, description: "Profile exported as JSON" })
  async exportProfile(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const userId = req.user.id;
    return this.networkService.exportProfile(userId, id);
  }

  @Post("profiles/import")
  @ApiOperation({ summary: "Import a network profile from JSON" })
  @ApiResponse({ status: 201, description: "Profile imported" })
  async importProfile(
    @Req() req: Request,
     @Body() body: {
      name: string;
      horizon_url: string;
      network_passphrase: string;
      friendbot_url?: string;
      is_default?: boolean;
    },
  ) {
    const userId = req.user.id;
    return this.networkService.importProfile(userId, body);
  }
}
