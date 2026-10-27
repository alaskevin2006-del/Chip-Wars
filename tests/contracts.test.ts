import { expect,it } from 'vitest';
import { AGENT_IDS,ACTION_IDS,resolveTurn } from '../src/engine';
it('freezes nine roles, 24 templates plus HOLD, and a resolver export',()=>{
  expect(AGENT_IDS).toHaveLength(9); expect(ACTION_IDS).toHaveLength(25); expect(resolveTurn).toBeTypeOf('function');
});
