import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Operation,
  nativeToScVal,
  scValToNative,
  hash,
  Address,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly rpcServer: rpc.Server;
  private readonly deployer: Keypair;
  private readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.getOrThrow<string>('STELLAR_RPC_URL');
    this.rpcServer = new rpc.Server(rpcUrl, { allowHttp: true });

    const secretKey = this.configService.getOrThrow<string>('DEPLOYER_SECRET_KEY');
    this.deployer = Keypair.fromSecret(secretKey);

    this.networkPassphrase = Networks.TESTNET;
  }

  async deploy(
    wasmBuffer: Buffer,
    constructorArgs?: unknown[],
  ): Promise<{ contractId: string; wasmHash: string; txHash: string }> {
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }

    if (wasmBuffer.length > 1024 * 1024) {
      throw new BadRequestException('WASM file exceeds maximum size of 1MB');
    }

    const scVals: xdr.ScVal[] = (constructorArgs ?? []).map((arg) => nativeToScVal(arg));

    const wasmHashBytes = hash(wasmBuffer);

    this.logger.log(`Uploading WASM (${wasmBuffer.length} bytes)...`);
    const uploadTxHash = await this.uploadWasm(wasmBuffer);

    this.logger.log(`Creating contract from WASM hash ${wasmHashBytes.toString('hex')}...`);
    const salt = Keypair.random().xdrPublicKey().value();
    const contractId = this.computeContractId(salt);
    const createTxHash = await this.createContract(wasmHashBytes, salt, scVals);

    return {
      contractId,
      wasmHash: wasmHashBytes.toString('hex'),
      txHash: createTxHash,
    };
  }

  private async uploadWasm(wasmBuffer: Buffer): Promise<string> {
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `WASM upload failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    return sendResult.hash;
  }

  private computeContractId(salt: Buffer): string {
    const address = new Address(this.deployer.publicKey());
    const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({
        address: address.toScAddress(),
        salt: salt,
      }),
    );
    const preimageHash = hash(preimage.toXDR());
    return StrKey.encodeContract(preimageHash);
  }

  private async createContract(
    wasmHash: Buffer,
    salt: Buffer,
    constructorArgs: xdr.ScVal[],
  ): Promise<string> {
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());
    const address = new Address(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createCustomContract({
          address,
          wasmHash,
          salt,
          constructorArgs,
        }),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `Contract creation failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    return sendResult.hash;
  }

  async invoke(
    contractId: string,
    functionName: string,
    args: unknown[],
  ): Promise<{ result: unknown; txHash: string }> {
    if (!StrKey.isValidContract(contractId)) {
      throw new BadRequestException('Invalid contract ID format');
    }

    const scVals: xdr.ScVal[] = args.map((arg) => nativeToScVal(arg));
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: functionName,
          args: scVals,
        }),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `Invocation failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    const returnValue = result.returnValue ? scValToNative(result.returnValue) : null;

    return {
      result: returnValue,
      txHash: sendResult.hash,
    };
  }

  async getInfo(
    contractId: string,
  ): Promise<{ contractId: string; wasmHash: string; network: string }> {
    if (!StrKey.isValidContract(contractId)) {
      throw new BadRequestException('Invalid contract ID format');
    }

    let wasmHashHex: string;
    try {
      const wasm = await this.rpcServer.getContractWasmByContractId(contractId);
      wasmHashHex = hash(wasm).toString('hex');
    } catch {
      throw new NotFoundException('Contract not found on the network');
    }

    return {
      contractId,
      wasmHash: wasmHashHex,
      network: 'testnet',
    };
  }
}
