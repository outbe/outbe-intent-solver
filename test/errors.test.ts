import { expect, test } from "vitest";
import { decodeRevert } from "../solvers/utils.js";

test("decodes custom errors and Error(string)", () => {
  expect(decodeRevert("0x13f10bb3")).toBe("RevealPhaseNotActive()");
  expect(
    decodeRevert(
      "0x08c379a0" +
        "0000000000000000000000000000000000000000000000000000000000000020" +
        "0000000000000000000000000000000000000000000000000000000000000003" +
        "6e6f700000000000000000000000000000000000000000000000000000000000",
    ),
  ).toBe("nop");
  expect(decodeRevert("0x")).toBeUndefined();
});
