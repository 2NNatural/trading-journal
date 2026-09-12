import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeAccounting, stateBalanceDelta, balanceSequenceMatches } from './traces.ts';

const w='0x'+'1'.repeat(40),router='0x'+'2'.repeat(40),collector='0x'+'3'.repeat(40);
const trace=()=>({type:'CALL',from:w,to:router,value:'0x64',
  beforeEVMTransfers:[{purpose:'feePayment',from:w,to:null,value:'0x14'}],
  afterEVMTransfers:[{purpose:'gasRefund',from:null,to:w,value:'0xc'},{purpose:'feeCollection',from:null,to:collector,value:'0x8'}],
  calls:[{type:'CALL',from:router,to:w,value:'0xa'}]});

test('Arbitrum fees are reconciled to receipt gas without double charging',()=>{
  const result=nativeAccounting(trace(),w,8n);
  assert.equal(result.movement.rawDelta,'-90');
  assert.equal(result.system.rawDelta,'-8');
  assert.equal(result.rawNetIncludingGas,'-98');
  assert.equal(nativeAccounting(trace(),collector,8n).rawNetIncludingGas,'8');
});
test('reverted EVM movements vanish but system gas remains charged',()=>{
  const result=nativeAccounting({...trace(),error:'execution reverted'},w,8n);
  assert.equal(result.movement.rawDelta,'0');assert.equal(result.rawNetIncludingGas,'-8');
});
test('unknown, nested, redirected and nonconserving system transfers stop accounting',()=>{
  const unknown=trace();unknown.afterEVMTransfers[0]!.purpose='bridgeRefund';
  assert.throws(()=>nativeAccounting(unknown,w,8n),/SYSTEM_TRANSFERS_REQUIRE/);
  const redirected=trace();redirected.afterEVMTransfers[0]!.to=collector;
  assert.throws(()=>nativeAccounting(redirected,w,8n),/SYSTEM_TRANSFERS_REQUIRE/);
  assert.throws(()=>nativeAccounting({...trace(),calls:[trace()]},w,8n),/SYSTEM_TRANSFERS_REQUIRE/);
  assert.throws(()=>nativeAccounting(trace(),w,9n),/SYSTEM_GAS_RECEIPT_MISMATCH/);
  const missing=trace();missing.afterEVMTransfers.pop();
  assert.throws(()=>nativeAccounting(missing,w,8n),/SYSTEM_TRANSFERS_SCHEMA/);
});
test('transaction state balances require explicit values and preserve exact wei',()=>{
  assert.deepEqual(stateBalanceDelta({pre:{[w]:{balance:'0x1000000000000000001'}},post:{[w]:{balance:'0x1000000000000000000'}}},w),{preRaw:'4722366482869645213697',postRaw:'4722366482869645213696',rawDelta:'-1'});
  assert.throws(()=>stateBalanceDelta({pre:{[w]:{balance:'0x1'}},post:{[w]:{nonce:'2'}}},w),/STATE_BALANCE_NOT_EXPLICIT/);
});
test('same-block reconciliation requires both boundaries and every intermediate balance',()=>{
  const rows=[{index:'0xf',preRaw:'92',postRaw:'190'},{index:'0xd',preRaw:'100',postRaw:'92'}];
  assert.equal(balanceSequenceMatches(rows,'100','190'),true);
  assert.equal(balanceSequenceMatches(rows.slice(0,1),'100','190'),false);
  assert.equal(balanceSequenceMatches([rows[1]!,{...rows[0]!,preRaw:'90'}],'100','190'),false);
  assert.equal(balanceSequenceMatches([...rows,rows[0]!],'100','190'),false);
});
