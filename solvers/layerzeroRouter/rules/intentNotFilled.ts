import { bytes32ToAddress } from "@hyperlane-xyz/utils";

import { LayerZeroRouter__factory } from "../../../typechain/factories/LayerZeroRouter__factory.js";
import { LayerZeroRouterRule } from "../prepare.js";

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

    const [orderStatus, UNKNOWN, OPENED] = await Promise.all([
      destination.orderStatus(parsedArgs.orderId),
      destination.UNKNOWN(),
      destination.OPENED(),
    ]);

    if (orderStatus !== UNKNOWN && orderStatus !== OPENED) {
      return { error: "Intent already processed", success: false };
    }
    return { data: "Intent not yet processed", success: true };
  };
}
