/** Stateless deterministic PRNG. Never consults Math.random or the clock. */
export function nextRandom(seed:number): {state:number; value:number} {
  let x=(seed>>>0)||0x9e3779b9;
  x^=x<<13; x^=x>>>17; x^=x<<5;
  return {state:x>>>0,value:(x>>>0)/0x100000000};
}
export function clamp(value:number,min=0,max=100):number { return Math.max(min,Math.min(max,value)); }
export function round(value:number):number { return Math.round(value*1000)/1000; }
