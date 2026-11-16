import { BigNumber } from "@ethersproject/bignumber";
import { expect, test } from "vitest";
import { AuctionManager } from "../solvers/router/auction.js";

test("waitForCommitEnd waits for the deadline block, not a timestamp", async () => {
  const heads = [98, 99, 100];
  let polls = 0;
  const auctionCt: any = {
    getCommitDeadline: async () => BigNumber.from(100),
    provider: { getBlockNumber: async () => heads[Math.min(polls++, heads.length - 1)] },
  };
  const log: any = { info: () => {} };
  await new AuctionManager(auctionCt, {} as any, {} as any, log, 1).waitForCommitEnd("0x01");
  expect(polls).toBe(3);
});
