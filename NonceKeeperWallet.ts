import { defaultPath, HDNode } from "@ethersproject/hdnode";
import type { Deferrable } from "@ethersproject/properties";
import type {
  Provider,
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { BigNumber, type BigNumberish } from "@ethersproject/bignumber";
import type { Wordlist } from "@ethersproject/wordlists";

import { Logger } from "@ethersproject/logger";
const ethersLogger = new Logger("NonceKeeperWallet");

import { log } from "./logger.js";
import { getGasMultiplier, getFeeOverrides } from "./config/chainMetadata.js";

const nonces: Record<number, Promise<number>> = {};
// Track nonce at startup + how many tx-es this process issued, per chain.
// Diff between (onChainNonce) and (initial + sent) shows external tx activity
// on the same key — signal that the private key is used elsewhere.
const initialNonce: Record<number, number> = {};
const sentCount: Record<number, number> = {};

export class NonceKeeperWallet extends Wallet {
  connect(provider: Provider): NonceKeeperWallet {
    return new NonceKeeperWallet(this, provider);
  }

  async getNextNonce(): Promise<number> {
    const chainId = await this.getChainId();
    if (nonces[chainId] == null) {
      const start = super.getTransactionCount();
      nonces[chainId] = start;
      sentCount[chainId] = 0;
      initialNonce[chainId] = await start;
    }
    const nonce = nonces[chainId];
    nonces[chainId] = nonces[chainId].then((nonce) => nonce + 1);
    sentCount[chainId] = (sentCount[chainId] ?? 0) + 1;

    return nonce;
  }

  private async resyncNonce(reason: string): Promise<void> {
    const chainId = await this.getChainId();
    const onChain = await super.getTransactionCount();
    const expected = (initialNonce[chainId] ?? 0) + (sentCount[chainId] ?? 0);
    const externalTxCount = onChain - expected;
    log.warn({
      msg: "Nonce desync — resyncing from chain",
      reason,
      chainId,
      onChainNonce: onChain,
      expectedNonce: expected,
      externalTxCount,
      hint:
        externalTxCount > 0
          ? "Private key is used by another process/wallet"
          : "Local cache stale (restart / dropped tx)",
    });
    delete nonces[chainId];
    initialNonce[chainId] = onChain;
    sentCount[chainId] = 0;
  }

  /**
   * Fees for the chain, from chainMetadata.ts: pinned `transactionOverrides` if it has them,
   * otherwise the RPC estimate scaled by `gasMultiplier`.
   */
  private async applyGasMultiplier(
    transaction: Deferrable<TransactionRequest>,
  ): Promise<void> {
    if (transaction.gasPrice != null || transaction.maxFeePerGas != null) return;

    const chainId = await this.getChainId();

    const pinned = getFeeOverrides(chainId);
    if (pinned.gasPrice != null || pinned.maxFeePerGas != null) {
      Object.assign(transaction, pinned);
      return;
    }

    const multiplier = getGasMultiplier(chainId);
    if (!(multiplier > 1)) return;

    const scale = (value: BigNumberish) =>
      BigNumber.from(value).mul(Math.round(multiplier * 100)).div(100);

    const {gasPrice, maxFeePerGas, maxPriorityFeePerGas} = await this.provider.getFeeData();

    if (maxFeePerGas && maxPriorityFeePerGas) {
      transaction.maxFeePerGas = scale(maxFeePerGas);
      transaction.maxPriorityFeePerGas = scale(maxPriorityFeePerGas);
    } else if (gasPrice) {
      transaction.gasPrice = scale(gasPrice);
    }
  }

  async sendTransaction(
    transaction: Deferrable<TransactionRequest>,
    _retryCount = 0,
  ): Promise<TransactionResponse> {
    await this.applyGasMultiplier(transaction);

    try {
      // this check is necessary in order to not generate new nonces when a tx is going to fail
      await super.estimateGas(transaction);
    } catch (error: any) {
      const message = extractErrorMessage(error);
      if (message.match(/nonce (is )?too low|nonce has already been used/i) && _retryCount < 3) {
        await this.resyncNonce("estimateGas returned 'nonce too low'");
        transaction.nonce = undefined;
        return this.sendTransaction(transaction, _retryCount + 1);
      }
      checkError(error, {transaction});
    }

    if (transaction.nonce == null) {
      transaction.nonce = await this.getNextNonce();
    }

    log.debug({ msg: "transaction", transaction });

    try {
      return await super.sendTransaction(transaction);
    } catch (error: any) {
      const message = extractErrorMessage(error);
      if (message.match(/incorrect account sequence/i) && _retryCount < 3) {
        log.warn({
          msg: "Incorrect account sequence, resetting nonce and retrying",
          retry: _retryCount + 1,
        });
        const chainId = await this.getChainId();
        delete nonces[chainId];
        transaction.nonce = undefined;
        return this.sendTransaction(transaction, _retryCount + 1);
      }
      if (message.match(/nonce (is )?too low|nonce has already been used/i) && _retryCount < 3) {
        await this.resyncNonce("sendTransaction returned 'nonce too low'");
        transaction.nonce = undefined;
        return this.sendTransaction(transaction, _retryCount + 1);
      }
      throw error;
    }
  }

  static override fromMnemonic(
    mnemonic: string,
    path?: string,
    wordlist?: Wordlist,
  ) {
    if (!path) {
      path = defaultPath;
    }

    return new NonceKeeperWallet(
      HDNode.fromMnemonic(mnemonic, undefined, wordlist).derivePath(path),
    );
  }
}

function extractErrorMessage(error: any): string {
  let message = error.message;
  if (error.code === Logger.errors.SERVER_ERROR && error.error && typeof(error.error.message) === "string") {
      message = error.error.message;
  } else if (typeof(error.body) === "string") {
      message = error.body;
  } else if (typeof(error.responseText) === "string") {
      message = error.responseText;
  }
  return (message || "").toLowerCase();
}

function checkError(error: any, params: any): any {
  const transaction = params.transaction || params.signedTransaction;
  const message = extractErrorMessage(error);

  // "insufficient funds for gas * price + value + cost(data)"
  if (message.match(/insufficient funds|base fee exceeds gas limit/i)) {
      ethersLogger.throwError("insufficient funds for intrinsic transaction cost", Logger.errors.INSUFFICIENT_FUNDS, {
          error, transaction
      });
  }

  // "nonce too low"
  if (message.match(/nonce (is )?too low/i)) {
      ethersLogger.throwError("nonce has already been used", Logger.errors.NONCE_EXPIRED, {
          error, transaction
      });
  }

  // "replacement transaction underpriced"
  if (message.match(/replacement transaction underpriced|transaction gas price.*too low/i)) {
      ethersLogger.throwError("replacement fee too low", Logger.errors.REPLACEMENT_UNDERPRICED, {
          error, transaction
      });
  }

  // "replacement transaction underpriced"
  if (message.match(/only replay-protected/i)) {
      ethersLogger.throwError("legacy pre-eip-155 transactions not supported", Logger.errors.UNSUPPORTED_OPERATION, {
          error, transaction
      });
  }

  if (message.match(/gas required exceeds allowance|always failing transaction|execution reverted/)) {
      ethersLogger.throwError("cannot estimate gas; transaction may fail or may require manual gas limit", Logger.errors.UNPREDICTABLE_GAS_LIMIT, {
          error, transaction
      });
  }

  throw error;
}
