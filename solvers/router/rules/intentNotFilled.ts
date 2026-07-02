import { bytes32ToAddress } from "@hyperlane-xyz/utils";

import { Router__factory } from "../../../typechain/factories/Router__factory.js";
import { RouterRule } from "../prepare.js";

export function intentNotFilled(): RouterRule {
  return async (parsedArgs, context) => {
    const destinationSettler = bytes32ToAddress(
      parsedArgs.resolvedOrder.fillInstructions[0].destinationSettler,
    );
    const _chainId =
      parsedArgs.resolvedOrder.fillInstructions[0].destinationChainId.toString();
    const filler = await context.multiProvider.getSigner(_chainId);

    const destination = Router__factory.connect(
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
