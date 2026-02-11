import { Zero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";

import { LayerZero7683Rule } from "../prepare.js";
import { retrieveTokenBalance } from "../../utils.js";

export function enoughBalanceOnDestination(): LayerZero7683Rule {
  return async (parsedArgs, context) => {
    const amountByTokenByChain = parsedArgs.resolvedOrder.maxSpent.reduce<{
      [chainId: number]: { [token: string]: BigNumber };
    }>((acc, { token, ...output }) => {
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
        const balance = await retrieveTokenBalance(
          tokenAddress,
          fillerAddress,
          provider,
        );

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
}
