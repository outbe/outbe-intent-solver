import  { BigNumber } from "@ethersproject/bignumber";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
import {bytes32ToAddress} from "@hyperlane-xyz/utils";

import { LayerZero7683__factory } from "../../typechain/factories/layerzero7683/contracts/LayerZero7683__factory.js";
import type { OpenEventArgs, IntentData } from "./types.js";
import { log, getTokenDecimals, calculateSolverOutput } from "./utils.js";
import * as OrderEncoder from "../../lib/OrderEncoder.js";
import {chainIdsToName, tradingPairs} from "../../config/index.js";
import {
    retrieveOriginInfo,
    retrieveTargetInfo,
} from "../utils.js";

class LayerZero7683Prepare {
  private destinationCt!: any;
  private destinationSigner!: any;

  constructor(private multiProvider: MultiProvider) {}

  /**
   * Submit quote during auction period
   */
  private async submitQuote(
    parsedArgs: OpenEventArgs,
    data: IntentData
  ): Promise<void> {
    const {  originData } =
      data.fillInstructions[0];

    const fillerAddress = await this.destinationSigner.getAddress();



    // Decode order data
    const orderData = OrderEncoder.decode(originData);

    // Check if already quoted (on-chain deduplication)
    const alreadyQuoted = await this.destinationCt.hasSolverQuoted(
      parsedArgs.orderId,
      fillerAddress
    );

    if (alreadyQuoted) {
      log.info({
        msg: "Already submitted quote",
        orderId: parsedArgs.orderId,
      });
      return;
    }

    // Calculate best output amount
    const bestOutputAmount = await this.calculateBestOutput(data);

    log.info({
      msg: "Submitting quote",
      orderId: parsedArgs.orderId,
      amount: bestOutputAmount.toString(),
    });

    // Submit quote on destination chain
    const tx = await this.destinationCt.submitQuote(
      parsedArgs.orderId,
      bestOutputAmount,
      orderData
    );

    const receipt = await tx.wait();
    const baseUrl =
      this.destinationSigner.blockExplorers?.[0].url;

    const txInfo = baseUrl
      ? `${baseUrl}/tx/${receipt.transactionHash}`
      : receipt.transactionHash;

    log.info({
      msg: "Quote submitted",
      orderId: parsedArgs.orderId,
      amount: bestOutputAmount.toString(),
      txDetails: txInfo,
      txHash: receipt.transactionHash,
    });
  }

  /**
   * Calculate best output amount for competitive bidding
   * Uses tradingPairs config to calculate market rate + quoteTolerance
   */
  private async calculateBestOutput(
    data: IntentData
  ): Promise<BigNumber> {
    const originData = data.fillInstructions[0].originData;
    const orderData = OrderEncoder.decode(originData);

    // Extract order info
    const originDomainId = orderData.originDomain;
    const destinationDomainId = orderData.destinationDomain;

    const { chainIdsToName } = await import("../../config/index.js");
    const originChainName = chainIdsToName[originDomainId.toString()];
    const destinationChainName = chainIdsToName[destinationDomainId.toString()];

    const inputToken = bytes32ToAddress(orderData.inputToken); // Assuming sender is input token address
    const outputToken = bytes32ToAddress(orderData.outputToken);
    const inputAmount = orderData.amountIn;
    const minOutputAmount = orderData.amountOut;

    // Find trading pair (already validated by checkExchangeRate rule)
    const pair = tradingPairs.find(
      (p) =>
        p.originChain === originChainName &&
        p.destinationChain === destinationChainName &&
        p.inputToken.toLowerCase() === inputToken.toLowerCase() &&
        p.outputToken.toLowerCase() === outputToken.toLowerCase()
    );

    if (!pair) {
      throw new Error(`Trading pair not found: ${originChainName}:${inputToken} → ${destinationChainName}:${outputToken}`);
    }

    // Get decimals
    const inputDecimals = await getTokenDecimals(inputToken, originChainName, this.multiProvider);
    const outputDecimals = await getTokenDecimals(outputToken, destinationChainName, this.multiProvider);

    // Calculate boosted output (market rate + quoteTolerance for auction)
    const boostedOutput = calculateSolverOutput(
      inputAmount,
      pair.exchangeRate,
      inputDecimals,
      outputDecimals,
      pair.quoteTolerance
    );

    // Ensure we meet minimum requirement
    const finalOutput = boostedOutput.gt(minOutputAmount) ? boostedOutput : minOutputAmount;

    log.debug({
      msg: "Calculated competitive quote",
      minRequired: minOutputAmount.toString(),
      boostedOutput: boostedOutput.toString(),
      finalOffering: finalOutput.toString(),
      boostPercent: `${(pair.quoteTolerance * 100).toFixed(1)}%`,
    });

    return finalOutput;
  }

  /**
   * Wait for quoting period to end by polling contract
   */
  private async waitForQuotingEnd(orderData: any): Promise<void> {
    const pollInterval = 1000; // Check every 1 second

    const quotingPeriod = await this.destinationCt.quotingPeriod();

    log.info({
      msg: "Waiting for quoting period to end",
      quotingPeriodSeconds: quotingPeriod.toNumber(),
    });

    while (true) {
      const quotingEnded = await this.destinationCt.isQuotingEnded(orderData);

      if (quotingEnded) {
        log.info({
          msg: "Quoting period ended",
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Check if this solver won the auction
   * Returns winning amount if won, undefined otherwise
   */
  private async isWinner(
    parsedArgs: OpenEventArgs,
    data: IntentData
  ): Promise<BigNumber | undefined> {
    const fillerAddress = await this.destinationSigner.getAddress();

    const originData = data.fillInstructions[0].originData;
    const orderData = OrderEncoder.decode(originData);

    // Check if there are any quotes
    const hasQuotes = await this.destinationCt.hasQuotes(parsedArgs.orderId);
    if (!hasQuotes) {
      log.info({
        msg: "No quotes submitted - cannot fill",
        orderId: parsedArgs.orderId,
      });
      return undefined;
    }

    // Get winner from contract
    const [winnerAddress, winningAmount] = await this.destinationCt.getWinner(
      parsedArgs.orderId,
      orderData
    );

    const isWinner =
      winnerAddress.toLowerCase() === fillerAddress.toLowerCase();

    if (!isWinner) {
      log.info({
        msg: "Not the auction winner",
        orderId: parsedArgs.orderId,
        winner: winnerAddress,
        winningAmount: winningAmount.toString(),
      });
      return undefined;
    }

    log.info({
      msg: "Won auction - ready to fill",
      orderId: parsedArgs.orderId,
      winningAmount: winningAmount.toString(),
    });

    return winningAmount;
  }


    protected async retrieveOriginInfo(parsedArgs: OpenEventArgs) {
        const originTokens = parsedArgs.resolvedOrder.minReceived.map(
            ({ amount, chainId, token }) => {
                const tokenAddress = bytes32ToAddress(token);
                const chainName = chainIdsToName[chainId.toString()];
                return { amount, chainName, tokenAddress };
            },
        );

        return retrieveOriginInfo({
            multiProvider: this.multiProvider,
            tokens: originTokens,
        });
    }

    protected async retrieveTargetInfo(parsedArgs: OpenEventArgs) {
        const targetTokens = parsedArgs.resolvedOrder.maxSpent.map(
            ({ amount, chainId, token }) => {
                const tokenAddress = bytes32ToAddress(token);
                const chainName = chainIdsToName[chainId.toString()];
                return { amount, chainName, tokenAddress };
            },
        );

        return retrieveTargetInfo({
            multiProvider: this.multiProvider,
            tokens: targetTokens,
        });
    }


  /**
   * Prepare order for filling - handles auction logic
   * Returns object with shouldFill flag and winningAmount if won
   */
  async prepare(
    parsedArgs: OpenEventArgs,
    originChainName: string,
    blockNumber: number
  ): Promise<{ shouldFill: boolean; winningAmount?: BigNumber }> {
    // Extract intent data
    const data: IntentData = {
      fillInstructions: parsedArgs.resolvedOrder.fillInstructions,
      maxSpent: parsedArgs.resolvedOrder.maxSpent,
    };



    // Decode order data to check auction phase
    const originData = data.fillInstructions[0].originData;
    const orderData = OrderEncoder.decode(originData);

      try {
          const origin = await this.retrieveOriginInfo(
              parsedArgs,
          );
          const target = await this.retrieveTargetInfo(parsedArgs);

          log.info({
              msg: "Intent Indexed",
              intent: `${parsedArgs.orderId}`,
              origin: origin.join(", "),
              target: target.join(", "),
          });
      } catch (error) {
          log.error({
              msg: "Failed retrieving origin and target info",
              intent: `${parsedArgs.orderId}`,
              error: JSON.stringify(error),
          });
      }



    // Setup destination contract (reused across all methods)
    const destinationSettler = bytes32ToAddress(
      data.fillInstructions[0].destinationSettler
    );
    const _chainId = data.fillInstructions[0].destinationChainId.toString();

    this.destinationSigner = this.multiProvider.getSigner(_chainId);
      this.destinationCt = LayerZero7683__factory.connect(
          destinationSettler,
          this.destinationSigner
      );

    // PHASE DETECTION: Check if quoting period has ended
    const quotingEnded = await this.destinationCt.isQuotingEnded(orderData);

    if (quotingEnded) {
      // Quoting already ended, skip to winner check
      log.info({
        msg: "Quoting already ended - checking winner directly",
        orderId: parsedArgs.orderId,
      });
    } else {
      // QUOTING PHASE: Submit quote and wait for period to end
      log.info({
        msg: "Quoting phase active - submitting quote",
        orderId: parsedArgs.orderId,
      });

      await this.submitQuote(parsedArgs, data);

      // Wait for quoting period to end
      await this.waitForQuotingEnd(orderData);
    }

    // FILLING PHASE: Check if we won the auction
    log.info({
      msg: "Filling phase - checking auction winner",
      orderId: parsedArgs.orderId,
    });

    const winningAmount = await this.isWinner(parsedArgs, data);

    if (winningAmount) {
      return { shouldFill: true, winningAmount };
    } else {
      return { shouldFill: false };
    }
  }

  create() {
    return (args: OpenEventArgs, originChainName: string, blockNumber: number) =>
      this.prepare(args, originChainName, blockNumber);
  }
}

export const create = (multiProvider: MultiProvider) => {
  return new LayerZero7683Prepare(multiProvider).create();
};
