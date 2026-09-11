// Watches Swap events of one pool and posts each swap to Telegram + writes it to swaps.db (SQLite).
// Supported: Uniswap V2 / V3, Trader Joe Liquidity Book (UNI_POOL = pair address),
//            Uniswap V4 (UNI_POOL = 32-byte PoolId, events come from the PoolManager singleton).
// Usage: cp .env.example .env, fill it, then `yarn uni:watch` from repo root (or `npx tsx index.ts` here).
import "dotenv-flow/config";
import {ethers} from "ethers";
import {DatabaseSync} from "node:sqlite";

const {UNI_RPC, UNI_POOL, TG_TOKEN, TG_CHAT} = process.env;
if (!UNI_RPC || !UNI_POOL || !TG_TOKEN || !TG_CHAT) throw new Error("need UNI_RPC, UNI_POOL, TG_TOKEN, TG_CHAT");
// V4 singletons; same address on mainnet/base/arbitrum/op/polygon. Override for other chains.
const POOL_MANAGER = process.env.UNI_POOL_MANAGER ?? "0x000000000004444c5dc75cB358380D2e3dE08A90";
const POSITION_MANAGER = process.env.UNI_POSITION_MANAGER ?? "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";
const isV4 = ethers.utils.hexDataLength(UNI_POOL) === 32;
// Optional: swaps sent by addresses whitelisted in this contract are ignored.
const WHITELIST = process.env.WHITELIST_CONTRACT;

const provider = UNI_RPC.startsWith("ws")
    ? new ethers.providers.WebSocketProvider(UNI_RPC)
    : new ethers.providers.JsonRpcProvider(UNI_RPC);

const pool = new ethers.Contract(
    isV4 ? POOL_MANAGER : UNI_POOL,
    [
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function getTokenX() view returns (address)",
        "function getTokenY() view returns (address)",
        "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
        "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
        "event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)",
        "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
    ],
    provider,
);
const whitelist = WHITELIST && new ethers.Contract(WHITELIST, ["function isWhitelisted(address) view returns (bool)"], provider);
const erc20 = (a: string) =>
    a === ethers.constants.AddressZero // V4 native currency
        ? Promise.resolve(["ETH", 18] as const)
        : Promise.all([
              new ethers.Contract(a, ["function symbol() view returns (string)"], provider).symbol() as Promise<string>,
              new ethers.Contract(a, ["function decimals() view returns (uint8)"], provider).decimals() as Promise<number>,
          ]);

async function tokens(): Promise<[string, string]> {
    if (isV4) {
        // PositionManager stores the PoolKey under the first 25 bytes of the PoolId.
        const posm = new ethers.Contract(POSITION_MANAGER, ["function poolKeys(bytes25) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)"], provider);
        const k = await posm.poolKeys(ethers.utils.hexDataSlice(UNI_POOL!, 0, 25));
        if (k.currency0 === k.currency1) throw new Error("PoolId unknown to PositionManager; set UNI_POSITION_MANAGER for this chain");
        return [k.currency0, k.currency1];
    }
    // Uniswap exposes token0/token1, Trader Joe LB exposes getTokenX/getTokenY.
    return Promise.all([pool.token0(), pool.token1()]).catch(() => Promise.all([pool.getTokenX(), pool.getTokenY()]));
}
const [t0, t1] = await tokens();
const [[sym0, dec0], [sym1, dec1]] = await Promise.all([erc20(t0), erc20(t1)]);
const {chainId, name} = await provider.getNetwork();
const fmt = (v: ethers.BigNumber, dec: number) => ethers.utils.formatUnits(v, dec);
const MASK128 = ethers.BigNumber.from(1).shl(128).sub(1);
// LB packs (x, y) into one bytes32: low 128 bits = token X, high 128 bits = token Y.
const unpack = (b: string) => [ethers.BigNumber.from(b).and(MASK128), ethers.BigNumber.from(b).shr(128)];

const db = new DatabaseSync(new URL("./swaps.db", import.meta.url).pathname);
db.exec(`create table if not exists swaps (
    tx text primary key, block integer, ts integer, chain_id integer, pool text,
    "from" text, "to" text, sold_amount text, sold_token text, bought_amount text, bought_token text, bin integer
)`);
const insert = db.prepare(`insert or ignore into swaps values (?,?,?,?,?,?,?,?,?,?,?,?)`);

const tg = (text: string) =>
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({chat_id: TG_CHAT, text, disable_web_page_preview: true}),
    }).then((r) => (r.ok ? undefined : r.text().then((e) => console.error("tg:", e))));

function pick(in0: ethers.BigNumber, in1: ethers.BigNumber, out0: ethers.BigNumber, out1: ethers.BigNumber) {
    const zeroForOne = !in0.isZero();
    return zeroForOne
        ? {sold: fmt(in0, dec0), soldToken: sym0, bought: fmt(out1, dec1), boughtToken: sym1}
        : {sold: fmt(in1, dec1), soldToken: sym1, bought: fmt(out0, dec0), boughtToken: sym0};
}
// Signed deltas → (in0, in1, out0, out1). `intoPoolPositive`: V3 positive = token entered the pool;
// V4 deltas are from the user's view, so positive = user received.
const zero = ethers.constants.Zero;
const fromDeltas = (a0: ethers.BigNumber, a1: ethers.BigNumber, intoPoolPositive: boolean) => {
    if (!intoPoolPositive) [a0, a1] = [a0.mul(-1), a1.mul(-1)];
    return pick(a0.gt(0) ? a0 : zero, a1.gt(0) ? a1 : zero, a0.lt(0) ? a0.abs() : zero, a1.lt(0) ? a1.abs() : zero);
};

async function onSwap(ev: ethers.Event) {
    const a = ev.args!;
    let r: ReturnType<typeof pick>;
    if (a.amountsIn !== undefined) {
        const [xIn, yIn] = unpack(a.amountsIn);
        const [xOut, yOut] = unpack(a.amountsOut);
        r = pick(xIn, yIn, xOut, yOut);
    } else if (a.amount0In !== undefined) r = pick(a.amount0In, a.amount1In, a.amount0Out, a.amount1Out);
    else r = fromDeltas(a.amount0, a.amount1, !isV4);
    const tx = await ev.getTransaction();
    if (whitelist && (await whitelist.isWhitelisted(tx.from))) return console.log(`skip whitelisted ${tx.from} ${ev.transactionHash}`);
    const bin = a.id !== undefined && !isV4 ? Number(a.id) : null;
    const to = a.to ?? a.recipient ?? tx.from; // V4 event has no recipient
    insert.run(ev.transactionHash, ev.blockNumber, Math.floor(Date.now() / 1000), chainId, UNI_POOL!,
        tx.from, to, r.sold, r.soldToken, r.bought, r.boughtToken, bin);
    const msg = [
        `🔁 Swap ${sym0}/${sym1} (${name} #${chainId})${bin !== null ? ` bin ${bin}` : ""}`,
        `from: ${tx.from}`,
        `to:   ${to}`,
        `sold:   ${r.sold} ${r.soldToken}`,
        `bought: ${r.bought} ${r.boughtToken}`,
        `tx: ${ev.transactionHash}`,
    ].join("\n");
    console.log(msg);
    await tg(msg);
}

if (isV4) pool.on(pool.filters["Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"](UNI_POOL), (...args) => onSwap(args.at(-1)));
else
    for (const sig of Object.keys(pool.filters).filter((s) => s.startsWith("Swap(") && !s.startsWith("Swap(bytes32")))
        pool.on(pool.filters[sig](), (...args) => onSwap(args.at(-1)));
console.log(`watching ${sym0}/${sym1} at ${UNI_POOL} on ${name} (#${chainId})`);
