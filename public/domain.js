export function cents(value) {
  const s=String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole,fraction='']=s.replace('-','').split('.');
  const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(n) || n>1000000000000) throw new Error('Amount is too large.');
  return s.startsWith('-') ? -n : n;
}
export function money(value, currency='USD') { return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value)/100); }
export function dateValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
export function today() { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function balances(accounts, transactions, asOf=today()) {
  const result=new Map(accounts.map(a=>[a.id,Number(a.opening_balance_cents)]));
  for(const t of transactions) {
    if(t.status!=='posted'||t.date>asOf)continue;
    result.set(t.account_id,(result.get(t.account_id)||0)+Number(t.amount_cents));
    if(t.kind==='transfer')result.set(t.to_account_id,(result.get(t.to_account_id)||0)-Number(t.amount_cents));
  }
  return result;
}
export function totals(transactions, month, asOf=today()) {
  const rows=transactions.filter(t=>t.status==='posted'&&t.date<=asOf&&(!month||t.date.startsWith(month)));
  const income=rows.filter(t=>t.kind==='income').reduce((n,t)=>n+Number(t.amount_cents),0);
  const spending=-rows.filter(t=>t.kind==='expense').reduce((n,t)=>n+Number(t.amount_cents),0);
  return {income,spending,net:income-spending};
}
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted){quoted=false;}else if(field===''){quoted=true;}else throw new Error('Unexpected quote in CSV.'); }
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('Unclosed quote in CSV.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
export function importRows(text) {
  const [header,...rows]=parseCSV(text);
  if(!header)throw new Error('CSV is empty.');
  const columns=header.map(h=>h.trim().toLowerCase());
  for(const key of ['date','payee','amount'])if(!columns.includes(key))throw new Error('CSV needs date, payee, amount columns.');
  if(rows.length>1000)throw new Error('Import up to 1,000 rows per file.');
  return rows.map((r,i)=>{
    const get=k=>(r[columns.indexOf(k)]||'').trim();
    const date=get('date'),payee=get('payee'),amount_cents=cents(get('amount'));
    if(!dateValid(date)||!payee||payee.length>200||!amount_cents)throw new Error(`Row ${i+2}: use YYYY-MM-DD, a payee, and a nonzero amount.`);
    return {date,payee,amount_cents,kind:amount_cents>0?'income':'expense',status:'posted',notes:get('notes'),reviewed:false,category_id:null,to_account_id:null};
  });
}
export function exportCSV(rows) {
  const cell=(v)=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'$&").replace(/^-([^\d])/ ,"'-$1").replaceAll('"','""')+'"';
  return rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
