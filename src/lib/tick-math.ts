/** Minimal Uniswap V3 TickMath port (getSqrtRatioAtTick). */
const MAX_TICK = 887272;
const MAGIC: bigint[] = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];

export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || Math.abs(tick) > MAX_TICK) throw new Error("Invalid tick");
  const abs = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let i = 0; i < 20; i++) {
    if (abs & (1 << i)) ratio = (ratio * MAGIC[i]) >> 128n;
  }
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/** Tick reached by moving `bps` basis points from `current`, bounded by the TWAP tick ±100. */
export function slippageTick(current: number, twap: number, downward: boolean, bps: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(twap) || Math.abs(current - twap) > 100 || !Number.isInteger(bps) || bps < 1 || bps > 500) {
    throw new Error("Pool price or quote allowance unavailable");
  }
  const span = Math.floor(Math.abs(Math.log(1 + ((downward ? -1 : 1) * bps) / 1e4) / Math.log(1.0001)));
  const target = downward ? Math.max(-887271, twap - 100, current - span) : Math.min(887271, twap + 100, current + span);
  if (downward ? target >= current : target <= current) throw new Error("No swap room inside the TWAP boundary");
  return target;
}
