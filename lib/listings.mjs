// Existing launches hidden at the creator's request on 2026-09-19.
// This controls website visibility only; the blockchain contracts are unchanged.
export const HIDDEN_TOKENS=Object.freeze([
 '0x75a55cb36d82c2dfc2d91096928719433bb26fca',
 '0x5b3bdfd87bdc53dc6857c686db2e474a640d569a',
 '0x2e52f7080e67dcf42a03a2120fadfc905333f544',
 '0x3e8a2b2a65ca7f4caa13fa63c4cf59e587120ffd'
]);
const hidden=new Set(HIDDEN_TOKENS);
export function isHiddenToken(address){return typeof address==='string'&&hidden.has(address.toLowerCase());}
export function visibleListings(tokens){return tokens.filter(t=>!isHiddenToken(t.token));}
