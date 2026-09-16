import { pieFrame } from "../../src/scripts/motion-policy.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;

type PieFrameInput = Parameters<typeof pieFrame>;
type PieFrameResult = ReturnType<typeof pieFrame>;

type PieFrameInputContract = Expect<Equal<PieFrameInput, [progress: number, multiplier: number]>>;
type PieFrameResultContract = Expect<Equal<PieFrameResult, { fill: number; scale: number }>>;

export type TypeContracts = PieFrameInputContract | PieFrameResultContract;
