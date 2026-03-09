import { HashZero } from "@ethersproject/constants";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";

import { LayerZeroRouter__factory } from "../../../typechain/factories/solvers/layerzeroRouter/contracts/LayerZeroRouter__factory.js";
import { LayerZeroRouterRule } from "../prepare.js";

const UNKNOWN = HashZero;

export function intentNotFilled(): LayerZeroRouterRule {
  return async (parsedArgs, context) => {
    const destinationSettler = bytes32ToAddress(
      parsedArgs.resolvedOrder.fillInstructions[0].destinationSettler,
    );
    const _chainId =
      parsedArgs.resolvedOrder.fillInstructions[0].destinationChainId.toString();
    const filler = await context.multiProvider.getSigner(_chainId);

    const destination = LayerZeroRouter__factory.connect(
      destinationSettler,
      filler,
    );

    const orderStatus = await destination.orderStatus(parsedArgs.orderId);

    if (orderStatus !== UNKNOWN) {
      return { error: "Intent already filled", success: false };
    }
    return { data: "Intent not yet filled", success: true };
  };
}
