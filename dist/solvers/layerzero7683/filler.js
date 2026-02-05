import { AddressZero, MaxUint256, Zero } from "@ethersproject/constants";
import { addressToBytes32, bytes32ToAddress, } from "@hyperlane-xyz/utils";
import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { LayerZero7683__factory } from "../../typechain/factories/layerzero7683/contracts/LayerZero7683__factory.js";
import { log, quoteSettleFee } from "./utils.js";
import { chainIdsToName } from "../../config/index.js";
import { BaseFiller } from "../BaseFiller.js";
import { retrieveOriginInfo, retrieveTargetInfo, retrieveTokenBalance, } from "../utils.js";
import { allowBlockLists, metadata } from "./config/index.js";
import { saveBlockNumber } from "./db.js";
class LayerZero7683Filler extends BaseFiller {
    constructor(multiProvider, rules) {
        super(multiProvider, allowBlockLists, metadata, log, rules);
    }
    async retrieveOriginInfo(parsedArgs) {
        const originTokens = parsedArgs.resolvedOrder.minReceived.map(({ amount, chainId, token }) => {
            const tokenAddress = bytes32ToAddress(token);
            const chainName = chainIdsToName[chainId.toString()];
            return { amount, chainName, tokenAddress };
        });
        return retrieveOriginInfo({
            multiProvider: this.multiProvider,
            tokens: originTokens,
        });
    }
    async retrieveTargetInfo(parsedArgs) {
        const targetTokens = parsedArgs.resolvedOrder.maxSpent.map(({ amount, chainId, token }) => {
            const tokenAddress = bytes32ToAddress(token);
            const chainName = chainIdsToName[chainId.toString()];
            return { amount, chainName, tokenAddress };
        });
        return retrieveTargetInfo({
            multiProvider: this.multiProvider,
            tokens: targetTokens,
        });
    }
    async prepareIntent(parsedArgs) {
        const { fillInstructions, maxSpent } = parsedArgs.resolvedOrder;
        try {
            await super.prepareIntent(parsedArgs);
            return { data: { fillInstructions, maxSpent }, success: true };
        }
        catch (error) {
            return {
                error: error.message ?? "Failed to prepare LayerZero7683 Intent.",
                success: false,
            };
        }
    }
    async fill(parsedArgs, data, originChainName, blockNumber, winningAmount) {
        this.log.info({
            msg: "Filling Intent",
            intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
            winningAmount: winningAmount?.toString(),
        });
        await Promise.all(data.maxSpent.map(async ({ amount, chainId, recipient, token: tokenAddress }) => {
            tokenAddress = bytes32ToAddress(tokenAddress);
            recipient = bytes32ToAddress(recipient);
            const _chainId = chainId.toString();
            const filler = this.multiProvider.getSigner(_chainId);
            if (tokenAddress === AddressZero) {
                // native token
                return;
            }
            const token = Erc20__factory.connect(tokenAddress, filler);
            const fillerAddress = await filler.getAddress();
            const allowance = await token.allowance(fillerAddress, recipient);
            if (allowance.lt(amount)) {
                const tx = await Erc20__factory.connect(tokenAddress, filler).approve(recipient, MaxUint256);
                const receipt = await tx.wait();
                const baseUrl = this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]
                    .url;
                this.log.debug({
                    msg: "Approval",
                    protocolName: this.metadata.protocolName,
                    amount: MaxUint256.toString(),
                    tokenAddress,
                    recipient,
                    chainId: _chainId,
                    tx: baseUrl
                        ? `${baseUrl}/tx/${receipt.transactionHash}`
                        : `${receipt.transactionHash}`,
                });
            }
            else {
                this.log.debug({
                    msg: "Approval not required",
                    protocolName: this.metadata.protocolName,
                    amount: amount.toString(),
                    allowance: allowance.toString(),
                    tokenAddress,
                    recipient,
                    chainId: _chainId,
                });
            }
        }));
        await Promise.all(data.fillInstructions.map(async ({ destinationChainId, destinationSettler, originData }, index) => {
            destinationSettler = bytes32ToAddress(destinationSettler);
            const _chainId = destinationChainId.toString();
            const filler = this.multiProvider.getSigner(_chainId);
            const fillerAddress = await filler.getAddress();
            const destination = LayerZero7683__factory.connect(destinationSettler, filler);
            const value = bytes32ToAddress(data.maxSpent[index].token) === AddressZero
                ? winningAmount || data.maxSpent[index].amount
                : undefined;
            // Depending on the implementation we may call `destination.fill` directly or call some other
            // contract that will produce the funds needed to execute this leg and then in turn call
            // `destination.fill`
            const tx = await destination.fill(parsedArgs.orderId, originData, addressToBytes32(fillerAddress), { value });
            const receipt = await tx.wait();
            const baseUrl = this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]
                .url;
            const txInfo = baseUrl
                ? `${baseUrl}/tx/${receipt.transactionHash}`
                : receipt.transactionHash;
            log.info({
                msg: "Filled Intent",
                intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                txDetails: txInfo,
                txHash: receipt.transactionHash,
            });
        }));
        await saveBlockNumber(originChainName, blockNumber, parsedArgs.orderId);
    }
    async settleOrder(parsedArgs, data, originChainName) {
        this.log.info({
            msg: "Settling Intent",
            intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
        });
        const destinationSettlers = data.fillInstructions.reduce((acc, fillInstruction) => {
            const destinationChain = fillInstruction.destinationChainId.toString();
            const destinationSettler = bytes32ToAddress(fillInstruction.destinationSettler);
            acc[destinationChain] ||= [];
            acc[destinationChain].push(destinationSettler);
            return acc;
        }, {});
        await Promise.all(Object.entries(destinationSettlers).map(async ([destinationChain, settlers]) => {
            const uniqueSettlers = [...new Set(settlers)];
            const filler = this.multiProvider.getSigner(destinationChain);
            return Promise.all(uniqueSettlers.map(async (destinationSettler) => {
                const destination = LayerZero7683__factory.connect(destinationSettler, filler);
                try {
                    // Get fillerData from filled order
                    const filledOrder = await destination.filledOrders(parsedArgs.orderId);
                    // Calculate LayerZero fee for settlement
                    const fee = await quoteSettleFee(destination, parsedArgs.resolvedOrder.originChainId, parsedArgs.orderId, filledOrder.fillerData);
                    // Settle with LayerZero fee
                    const tx = await destination.settle([parsedArgs.orderId], {
                        value: fee,
                    });
                    const receipt = await tx.wait();
                    this.log.info({
                        msg: "Settlement message sent to LayerZero",
                        intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                        status: "Waiting for LayerZero delivery to origin chain",
                        // txDetails: `https://testnet.layerzeroscan.com/tx/${receipt.transactionHash}`,
                        txDetails: `${receipt.transactionHash}`,
                        txHash: receipt.transactionHash,
                    });
                }
                catch (error) {
                    this.log.error({
                        msg: `Failed settling`,
                        intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                        error,
                    });
                    return;
                }
            }));
        }));
    }
}
const enoughBalanceOnDestination = async (parsedArgs, context) => {
    const amountByTokenByChain = parsedArgs.resolvedOrder.maxSpent.reduce((acc, { token, ...output }) => {
        token = bytes32ToAddress(token);
        const chainId = output.chainId.toNumber();
        acc[chainId] ||= { [token]: Zero };
        acc[chainId][token] ||= Zero;
        acc[chainId][token] = acc[chainId][token].add(output.amount);
        return acc;
    }, {});
    for (const chainId in amountByTokenByChain) {
        const chainTokens = amountByTokenByChain[chainId];
        const fillerAddress = await context.multiProvider.getSignerAddress(chainId);
        const provider = context.multiProvider.getProvider(chainId);
        for (const tokenAddress in chainTokens) {
            const amount = chainTokens[tokenAddress];
            const balance = await retrieveTokenBalance(tokenAddress, fillerAddress, provider);
            if (balance.lt(amount)) {
                return {
                    error: `Insufficient balance on destination chain ${chainId}, for ${tokenAddress}`,
                    success: false,
                };
            }
        }
    }
    return { data: "Enough tokens to fulfill the intent", success: true };
};
export const create = (multiProvider, customRules) => {
    return new LayerZero7683Filler(multiProvider, {
        base: [enoughBalanceOnDestination],
        custom: customRules,
    }).create();
};
//# sourceMappingURL=filler.js.map