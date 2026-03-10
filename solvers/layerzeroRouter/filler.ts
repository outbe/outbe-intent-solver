import {BigNumber} from "@ethersproject/bignumber";
import {ethers} from "ethers";
import {AddressZero, MaxUint256} from "@ethersproject/constants";
import type {MultiProvider} from "@hyperlane-xyz/sdk";
import {
    addressToBytes32,
    bytes32ToAddress,
    type Result,
} from "@hyperlane-xyz/utils";

import {Erc20__factory} from "../../typechain/factories/contracts/Erc20__factory.js";
import {LayerZeroRouter__factory} from "../../typechain/factories/layerzeroRouter/contracts/LayerZeroRouter__factory.js";
import type {
    LayerZeroRouterMetadata,
    IntentData,
    OpenEventArgs,
} from "./types.js";
import {log, quoteSettleFee, getTokenDecimals, getTokenSymbol} from "./utils.js";

import {BaseFiller} from "../BaseFiller.js";
import {allowBlockLists, metadata} from "./config/index.js";
import {saveBlockNumber} from "./db.js";

class LayerZeroRouterFiller extends BaseFiller<
    LayerZeroRouterMetadata,
    OpenEventArgs,
    IntentData
> {
    constructor(multiProvider: MultiProvider) {
        super(multiProvider, allowBlockLists, metadata, log);
    }

    protected async prepareIntent(
        parsedArgs: OpenEventArgs,
    ): Promise<Result<IntentData>> {
        const {fillInstructions, maxSpent} = parsedArgs.resolvedOrder;

        try {
            await super.prepareIntent(parsedArgs);

            return {data: {fillInstructions, maxSpent}, success: true};
        } catch (error: any) {
            return {
                error: error.message ?? "Failed to prepare LayerZeroRouter Intent.",
                success: false,
            };
        }
    }

    protected async fill(
        parsedArgs: OpenEventArgs,
        data: IntentData,
        originChainName: string,
        blockNumber: number,
        winningAmount?: BigNumber,
    ) {
        this.log.info({
            msg: "Filling Intent",
            intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
            winningAmount: winningAmount?.toString(),
        });

        await Promise.all(
            data.maxSpent.map(
                async ({amount, chainId, recipient, token: tokenAddress}) => {
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
                        const tx = await Erc20__factory.connect(
                            tokenAddress,
                            filler,
                        ).approve(recipient, MaxUint256);

                        const receipt = await tx.wait();
                        const baseUrl =
                            this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]
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
                    } else {
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
                },
            ),
        );

        await Promise.all(
            data.fillInstructions.map(
                async (
                    {destinationChainId, destinationSettler, originData},
                    index,
                ) => {
                    destinationSettler = bytes32ToAddress(destinationSettler);
                    const _chainId = destinationChainId.toString();

                    const filler = this.multiProvider.getSigner(_chainId);
                    const fillerAddress = await filler.getAddress();
                    const destination = LayerZeroRouter__factory.connect(
                        destinationSettler,
                        filler,
                    );

                    const value =
                        bytes32ToAddress(data.maxSpent[index].token) === AddressZero
                            ? winningAmount || data.maxSpent[index].amount
                            : undefined;

                    const tx = await destination.fill(
                        parsedArgs.orderId,
                        originData,
                        addressToBytes32(fillerAddress),
                        {value},

                    );

                    const receipt = await tx.wait();
                    const baseUrl =
                        this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]?.url;
                    const txInfo = baseUrl
                        ? `${baseUrl}/tx/${receipt.transactionHash}`
                        : receipt.transactionHash;

                    log.info({
                        msg: "Filled Intent",
                        intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                        txDetails: txInfo,
                        txHash: receipt.transactionHash,
                    });
                },
            ),
        );

        await saveBlockNumber(originChainName, blockNumber, parsedArgs.orderId);
    }

    protected async settleOrder(
        parsedArgs: OpenEventArgs,
        data: IntentData,
        originChainName: string,
    ) {
        this.log.info({
            msg: "Settling Intent",
            intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
        });

        const destinationSettlers = data.fillInstructions.reduce<
            Record<string, Array<string>>
        >((acc, fillInstruction) => {
            const destinationChain = fillInstruction.destinationChainId.toString();
            const destinationSettler = bytes32ToAddress(
                fillInstruction.destinationSettler,
            );

            acc[destinationChain] ||= [];
            acc[destinationChain].push(destinationSettler);

            return acc;
        }, {});

        await Promise.all(
            Object.entries(destinationSettlers).map(
                async ([destinationChain, settlers]) => {
                    const uniqueSettlers = [...new Set(settlers)];
                    const filler = this.multiProvider.getSigner(destinationChain);

                    return Promise.all(
                        uniqueSettlers.map(async (destinationSettler) => {
                            const destination = LayerZeroRouter__factory.connect(
                                destinationSettler,
                                filler,
                            );
                            try {
                                // Get fillerData from filled order
                                const filledOrder = await destination.filledOrders(
                                    parsedArgs.orderId,
                                );

                                // Calculate LayerZero fee for settlement
                                const fee = await quoteSettleFee(
                                    destination,
                                    parsedArgs.resolvedOrder.originChainId,
                                    parsedArgs.orderId,
                                    filledOrder.fillerData,
                                );

                                // Settle with LayerZero fee
                                const tx = await destination.settle([parsedArgs.orderId], {
                                    value: fee,
                                });

                                const receipt = await tx.wait();

                                this.log.info({
                                    msg: "Settlement message sent to LayerZero",
                                    intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                                    status: "Waiting for LayerZero delivery to origin chain",
                                    txDetails: `${receipt.transactionHash}`,
                                    txHash: receipt.transactionHash,
                                });

                                this.waitForSettled(parsedArgs.orderId, originChainName, parsedArgs.resolvedOrder);
                            } catch (error) {
                                this.log.error({
                                    msg: `Failed settling`,
                                    intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
                                    error,
                                });
                                return;
                            }
                        }),
                    );
                },
            ),
        );
    }

    private async waitForSettled(
        orderId: string,
        originChainName: string,
        resolvedOrder: OpenEventArgs["resolvedOrder"],
    ) {
        const originSettlerAddress = this.metadata.contracts.find(
            (c) => c.chainName === originChainName,
        )?.address;

        if (!originSettlerAddress) return;

        const originProvider = this.multiProvider.getProvider(originChainName);
        const originContract = LayerZeroRouter__factory.connect(
            originSettlerAddress,
            originProvider,
        );

        const filter = originContract.filters.Settled();
        const intent = `${this.metadata.protocolName}-${orderId}`;
        const TIMEOUT_MS = 10 * 60 * 1000;

        const received = await Promise.all(
            resolvedOrder.minReceived.map(async (o) => {
                const tokenAddress = bytes32ToAddress(o.token);
                const [symbol, decimals] = await Promise.all([
                    getTokenSymbol(tokenAddress, originChainName, this.multiProvider),
                    getTokenDecimals(tokenAddress, originChainName, this.multiProvider),
                ]);
                return {
                    token: tokenAddress,
                    symbol,
                    amount: ethers.utils.formatUnits(o.amount, decimals),
                };
            }),
        );

        const handler = (eventOrderId: string, receiver: string, event: any) => {
            if (eventOrderId !== orderId) return;
            clearTimeout(timeout);
            originContract.off(filter, handler);
            this.log.info({
                msg: "LayerZero msg delivered, Order settled on origin chain",
                intent,
                receiver,
                chainName: originChainName,
                received,
                txHash: event.transactionHash,
            });
        };

        const timeout = setTimeout(() => {
            originContract.off(filter, handler);
            this.log.warn({
                msg: "Settled event timeout, removing listener",
                intent,
            });
        }, TIMEOUT_MS);

        originContract.on(filter, handler);
    }
}

export const create = (multiProvider: MultiProvider) => {
    return new LayerZeroRouterFiller(multiProvider).create();
};
