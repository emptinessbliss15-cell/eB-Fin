import test from 'node:test';
import assert from 'node:assert/strict';
import {cents,balances,totals,importRows,parseCSV,exportCSV,dateValid} from '../public/domain.js';
test('decimal money parsing is exact and rejects ambiguous values',()=>{
 assert.equal(cents('12.34'),1234);assert.equal(cents('-0.29'),-29);assert.equal(cents('0.1'),10);
 for(const value of ['1.005','1e3','1,000','$12','Infinity',''])assert.throws(()=>cents(value));
});
test('transfers move balances atomically without becoming income or spending',()=>{
 const accounts=[{id:'a',opening_balance_cents:10000},{id:'b',opening_balance_cents:-1000}];
 const ts=[{account_id:'a',to_account_id:'b',amount_cents:-2000,kind:'transfer',status:'posted',date:'2026-09-01'},{account_id:'a',amount_cents:-500,kind:'expense',status:'pending',date:'2026-09-01'},{account_id:'a',amount_cents:900,kind:'income',status:'posted',date:'2026-10-01'},{account_id:'b',amount_cents:-100,kind:'expense',status:'posted',date:'2026-09-02'}];
 const b=balances(accounts,ts,'2026-09-17');assert.equal(b.get('a'),8000);assert.equal(b.get('b'),900);
 assert.deepEqual(totals(ts,'2026-09','2026-09-17'),{income:0,spending:100,net:-100});
});
test('CSV handles quoted commas, escaped quotes, BOM, CRLF, and multiline notes',()=>{
 const rows=importRows('\uFEFFdate,payee,amount,notes\r\n2026-09-10,"Shop, Inc.",-12.34,"A ""quote""\nand a line"\r\n');
 assert.equal(rows.length,1);assert.equal(rows[0].payee,'Shop, Inc.');assert.equal(rows[0].amount_cents,-1234);assert.equal(rows[0].notes,'A "quote"\nand a line');
 assert.throws(()=>parseCSV('"open'));assert.throws(()=>importRows('date,payee,amount\n2026-02-30,Shop,20'));
});
test('invalid and leap-day dates are checked',()=>{assert.equal(dateValid('2026-02-29'),false);assert.equal(dateValid('2028-02-29'),true);assert.equal(dateValid('x'),false);});
test('CSV export neutralizes spreadsheet formulas and preserves decimal values',()=>{const out=exportCSV([['=SUM(A1)','+cmd','@formula','-cmd','-12.34','a"b']]);assert.equal(out,'"\'=SUM(A1)","\'+cmd","\'@formula","\'-cmd","-12.34","a""b"');});
