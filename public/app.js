import {initAuth} from './components/auth.js';
import {eBStatus} from './components/eBStatus.js';
import {CFstatus} from './components/CFstatus.js';
import {createEBGrid} from './components/eBGrid.js';
import {createEBComboBox} from './components/eBComboBox.js';
import {db,authAPI,loadData,save,remove,importTransactions} from './data.js';
import {cents,money,today,dateValid,balances,totals,importRows,exportCSV} from './domain.js';
import {demoData} from './demo.js';

const $=id=>document.getElementById(id);
const empty=()=>({workspaces:[],accounts:[],categories:[],transactions:[],budgets:[]});
let data=empty(),session=null,demo=false,workspaceId='',view='overview',accountId='',grid=null,epoch=0,loading=false;
let month=today().slice(0,7),search='',kindFilter='',reviewFilter='',statusFilter='';
const workspace=()=>data.workspaces.find(w=>w.id===workspaceId);
const rows=table=>data[table].filter(r=>r.workspace_id===workspaceId);
const fmt=n=>money(n,workspace()?.currency||'USD');
const el=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
const button=(text,fn,className='')=>{const b=el('button',text,className);b.type='button';b.onclick=()=>run(fn);return b;};
const run=async fn=>{try{await fn();}catch(e){eBStatus.error(e.message||'Something went wrong. Please try again.');}};
const select=(label,options,value,onChange)=>{const s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o);}s.value=value;s.onchange=()=>onChange(s.value);return s;};
const panel=(title)=>{const p=el('section','','panel');if(title)p.append(el('h2',title,'panel-title'));return p;};
const noRows=(parent,title,description,action)=>{const box=el('div','','empty-state');box.append(el('h2',title),el('p',description));if(action)box.append(action);parent.append(box);};

function form(title,fields,onSave,{submit='Save',description='',extra=null}={}) {
 const previous=document.activeElement,dialog=el('dialog','','finance-dialog'),f=el('form');
 const heading=el('div','','dialog-heading');heading.append(el('h2',title),button('×',()=>dialog.close()));
 heading.lastChild.setAttribute('aria-label','Close dialog');const body=el('div','','dialog-body');if(description)body.append(el('p',description));
 const inputs={};for(const field of fields){
  const label=el('label',field.label);let input;
  if(field.options){input=select(field.label,field.options,field.value??field.options[0]?.[0],()=>{});}
  else{input=el(field.type==='textarea'?'textarea':'input');if(field.type!=='textarea')input.type=field.type||'text';if(field.type!=='file')input.value=field.value??'';}
  input.name=field.name;input.required=!!field.required;if(field.maxLength)input.maxLength=field.maxLength;if(field.step)input.step=field.step;if(field.min)input.min=field.min;if(field.accept)input.accept=field.accept;
  label.append(input);body.append(label);inputs[field.name]=input;
 }
 if(extra)body.append(extra);const error=el('p','','form-error');error.setAttribute('role','alert');body.append(error);
 const actions=el('div','','dialog-actions'),cancel=button('Cancel',()=>dialog.close()),ok=el('button',submit,'primary');ok.type='submit';actions.append(cancel,ok);f.append(heading,body,actions);dialog.append(f);document.body.append(dialog);
 let saving=false;
 f.onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;ok.disabled=true;cancel.disabled=true;error.textContent='';try{await onSave(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.type==='file'?input.files[0]:input.value])),inputs);dialog.close();}catch(e){error.textContent=e.message||'Unable to save. Please retry.';}finally{saving=false;ok.disabled=false;cancel.disabled=false;}};
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();});dialog.showModal();Object.values(inputs)[0]?.focus();return {dialog,inputs,body};
}
function confirmDelete(table,row,label){form('Delete '+label,[],async()=>{await mutate(table,null,row.id,true);},{submit:'Delete',description:'This permanently removes this record. Accounts and categories with transactions or budgets cannot be deleted.'});}
async function mutate(table,row,id,deleting=false){
 if(!demo&&!session)throw new Error('Please sign in first.');
 const version=epoch;
 if(demo){
  if(deleting){if(['accounts','categories'].includes(table)&&data.transactions.some(t=>t.account_id===id||t.to_account_id===id||t.category_id===id)||table==='categories'&&data.budgets.some(b=>b.category_id===id))throw new Error('This record is in use. Remove its references first.');data[table]=data[table].filter(r=>r.id!==id);}
  else if(id)data[table]=data[table].map(r=>r.id===id?{...r,...row}:r);
  else data[table].push({...row,id:crypto.randomUUID()});
 }else{
  if(deleting)await remove(table,id);else await save(table,{...row,owner_id:session.user.id},id);
  if(version!==epoch)return;const next=await loadData(session.user.id);if(version!==epoch)return;data=next;
 }
 render();eBStatus.success(deleting?'Record deleted.':'Saved.');
}
async function refresh(){
 if(demo){render();eBStatus.info('Demo is up to date.');return;}
 if(!session)return;
 const token=++epoch,userId=session.user.id;loading=true;eBStatus.info('Loading your finances…');
 try{const next=await loadData(userId);if(token!==epoch)return;data=next;workspaceId=data.workspaces.some(w=>w.id===workspaceId)?workspaceId:data.workspaces[0]?.id||'';render();eBStatus.success('Your finances are up to date.');}
 finally{if(token===epoch)loading=false;}
}
async function onSession(next){
 const changed=session?.user?.id!==next?.user?.id;session=next;
 if(!changed&&!demo)return;
 ++epoch;document.querySelectorAll('.finance-dialog').forEach(d=>d.close());demo=false;data=empty();workspaceId='';accountId='';grid?.destroy();grid=null;
 eBStatus.clear();render();if(session)await run(refresh);else eBStatus.info('Sign in or explore the demo.');
}
function switchWorkspace(id){workspaceId=id;accountId='';search='';render();}
function navigate(next,account=''){view=next;accountId=account;search='';render();}
function renderTree(){
 const tree=$('tree');tree.replaceChildren();
 for(const w of data.workspaces){const section=el('div','','tree-workspace');const root=button((w.kind==='personal'?'◉ ':'▣ ')+w.name,()=>switchWorkspace(w.id),'tree-node');root.setAttribute('aria-current',workspaceId===w.id?'page':'false');section.append(root);
  if(workspaceId===w.id){const children=el('div','','tree-children');for(const [v,t]of[['overview','Overview'],['transactions','All transactions'],['budgets','Monthly budgets']]){const b=button(t,()=>navigate(v),'tree-node');b.setAttribute('aria-current',view===v&&!accountId?'page':'false');children.append(b);}
   const detail=el('details');detail.open=true;detail.append(el('summary','Accounts'));for(const a of rows('accounts')){const b=button(a.name,()=>navigate('transactions',a.id),'tree-node');b.setAttribute('aria-current',accountId===a.id?'page':'false');detail.append(b);}detail.append(button('+ Add account',()=>accountForm(),'tree-node'));children.append(detail);section.append(children);}
  tree.append(section);
 }
 if(!data.workspaces.length)tree.append(el('p','Your workspaces will appear here.','muted small'));
}
function render(){
 grid?.destroy();grid=null;
 $('demoBanner').hidden=!demo;$('welcome').hidden=!!session||demo;$('workspaceEmpty').hidden=!(session||demo)||data.workspaces.length>0;
 $('workspaceContent').hidden=!workspace();$('newWorkspace').disabled=!session&&!demo;
 const selector=$('workspace');selector.replaceChildren();for(const w of data.workspaces){const o=el('option',w.name);o.value=w.id;selector.append(o);}if(!data.workspaces.length){const o=el('option','No workspace');o.value='';selector.append(o);}selector.value=workspaceId;
 renderTree();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view?'page':'false'));
 if(!workspace())return;
 $('breadcrumb').textContent=(workspace().kind==='business'?'BUSINESS':'PERSONAL')+' / '+workspace().name;
 const titles={overview:['Overview','A clear picture of your money.'],transactions:['Transactions','Review, categorize, and keep your books in order.'],accounts:['Accounts','Your accounts, together in one place.'],budgets:['Monthly budgets','Give every category a little direction.'],categories:['Categories','Organize income and expenses your way.'],connections:['Bank connections','Manual today. Connected when you are ready.'],settings:['Settings','Make this workspace your own.']};
 $('viewTitle').textContent=accountId?rows('accounts').find(a=>a.id===accountId)?.name||'Transactions':titles[view][0];$('viewSubtitle').textContent=titles[view][1];$('pageActions').replaceChildren();$('content').replaceChildren();
 if(['overview','transactions','budgets'].includes(view)){const date=el('input');date.type='month';date.value=month;date.setAttribute('aria-label','Reporting month');date.onchange=()=>{if(date.value){month=date.value;render();}};$('pageActions').append(date);}
 if(['overview','transactions'].includes(view))$('pageActions').append(button('+ Transaction',()=>transactionForm(),'primary'));
 if(view==='accounts')$('pageActions').append(button('+ Account',()=>accountForm(),'primary'));
 if(view==='categories')$('pageActions').append(button('+ Category',()=>categoryForm(),'primary'));
 if(view==='budgets')$('pageActions').append(button('+ Budget',()=>budgetForm(),'primary'));
 ({overview:renderOverview,transactions:renderTransactions,accounts:renderAccounts,budgets:renderBudgets,categories:renderCategories,connections:renderConnections,settings:renderSettings})[view]();
}
function renderOverview(){
 const ts=rows('transactions'),accountBalances=balances(rows('accounts'),ts),summary=totals(ts,month);const metrics=el('div','','metrics');
 for(const [label,value,note]of[['Net balance',[...accountBalances.values()].reduce((a,b)=>a+b,0),'All accounts · posted through today'],['Income',summary.income,'Selected month · posted through today'],['Spending',summary.spending,'Selected month · excludes transfers'],['Net cash flow',summary.net,'Income less spending']]){const card=el('section','','metric');card.append(el('div',label,'metric-label'),el('div',fmt(value),'metric-value'),el('div',note,'metric-note'));metrics.append(card);}
 $('content').append(metrics);
 const columns=el('div','','overview-columns'),flow=panel('Cash flow'),chart=el('div','','flow-chart');const months=[];
 for(let i=5;i>=0;i--){const d=new Date(month+'-15T12:00:00');d.setMonth(d.getMonth()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push({key,label:d.toLocaleDateString('en-US',{month:'short'}),...totals(ts,key)});}
 const max=Math.max(...months.flatMap(m=>[m.income,m.spending]),1);
 for(const m of months){const wrap=el('div','','flow-month'),bars=el('div','','flow-bars');for(const [key,cls]of[['income',''],['spending','expense']]){const bar=el('div','','flow-bar '+cls);bar.style.height=(m[key]/max*100)+'%';bar.title=`${m.label} ${key}: ${fmt(m[key])}`;bar.setAttribute('role','img');bar.setAttribute('aria-label',bar.title);bars.append(bar);}wrap.append(bars,el('span',m.label));chart.append(wrap);}flow.append(chart);const legend=el('div','','legend');for(const [t,c]of[['Income',''],['Spending','expense']]){const item=el('span');item.append(el('i','',c),el('span',t));legend.append(item);}flow.append(legend);
 const spend=panel('Spending by category'),spent=new Map();for(const t of ts.filter(t=>t.kind==='expense'&&t.status==='posted'&&t.date<=today()&&t.date.startsWith(month)))spent.set(t.category_id,(spent.get(t.category_id)||0)-Number(t.amount_cents));
 for(const [id,value]of [...spent].sort((a,b)=>b[1]-a[1]).slice(0,5)){const row=el('div','','spending-row'),label=el('div','','spending-label');label.append(el('span',rows('categories').find(c=>c.id===id)?.name||'Uncategorized'),el('span',fmt(value)));const track=el('div','','bar-track'),fill=el('div','','bar-fill');fill.style.width=(value/Math.max(summary.spending,1)*100)+'%';track.append(fill);row.append(label,track);spend.append(row);}if(!spent.size)spend.append(el('p','No posted spending this month.','muted small'));columns.append(flow,spend);$('content').append(columns);
 const recent=panel('Recent transactions');recent.firstChild.append(button('View all →',()=>navigate('transactions')));$('content').append(recent);transactionGrid(recent,ts.filter(t=>t.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6),false);
}
function transactionGrid(parent,ts,paginate=true){
 if(!ts.length){noRows(parent,'No transactions here yet.','Add a transaction or adjust your filters.');return;}
 const host=el('div','','grid-host');parent.append(host);
 const mapped=ts.map(t=>({...t,account:rows('accounts').find(a=>a.id===t.account_id)?.name||'',destination:rows('accounts').find(a=>a.id===t.to_account_id)?.name||'',category:rows('categories').find(c=>c.id===t.category_id)?.name||(t.kind==='transfer'?'Transfer':'Uncategorized'),amount:fmt(t.amount_cents),review:t.reviewed?'Reviewed':'Needs review'}));
 grid=createEBGrid(host,{data:mapped,columns:[{key:'date',label:'Date',sortable:true},{key:'payee',label:'Payee',sortable:true},{key:'account',label:'Account',sortable:true},{key:'category',label:'Category',sortable:true},{key:'amount',label:'Amount',sortable:true,sort:(a,b)=>Number(String(a).replace(/[^0-9.-]/g,''))-Number(String(b).replace(/[^0-9.-]/g,''))},{key:'status',label:'Status',sortable:true},{key:'review',label:'Review',sortable:true},{key:'edit',label:'',type:'button',button:{text:'Edit',onClick:r=>transactionForm(data.transactions.find(t=>t.id===r.id))}}],filterable:false,sortable:true,pagination:paginate,pageSize:25,editableRows:false,selectable:false,contextMenu:false});
 parent.append(el('p',`${ts.length} transaction${ts.length===1?'':'s'} · Amounts in ${workspace().currency}. Transfers are stored once; the destination balance updates automatically.`,'grid-footer'));
}
function filteredTransactions(){return rows('transactions').filter(t=>(!accountId||t.account_id===accountId||t.to_account_id===accountId)&&t.date.startsWith(month)&&(!kindFilter||t.kind===kindFilter)&&(!statusFilter||t.status===statusFilter)&&(!reviewFilter||(reviewFilter==='reviewed'?t.reviewed:!t.reviewed))&&[t.payee,t.notes,rows('categories').find(c=>c.id===t.category_id)?.name,rows('accounts').find(a=>a.id===t.account_id)?.name].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));}
function renderTransactions(){
 const p=panel(),toolbar=el('div','','grid-toolbar'),input=el('input');input.type='search';input.placeholder='Search transactions…';input.setAttribute('aria-label','Search transactions');input.value=search;
 const results=el('div');const draw=()=>{grid?.destroy();grid=null;results.replaceChildren();transactionGrid(results,filteredTransactions());};input.oninput=()=>{search=input.value;draw();};toolbar.append(input,select('Transaction type',[['','All types'],['income','Income'],['expense','Expense'],['transfer','Transfers']],kindFilter,v=>{kindFilter=v;draw();}),select('Review status',[['','All reviews'],['needs','Needs review'],['reviewed','Reviewed']],reviewFilter,v=>{reviewFilter=v;draw();}),select('Posting status',[['','All statuses'],['posted','Posted'],['pending','Pending']],statusFilter,v=>{statusFilter=v;draw();}),button('Import CSV',importForm),button('Export CSV',()=>downloadCSV(filteredTransactions())));p.append(toolbar,results);$('content').append(p);draw();
}
function renderAccounts(){
 const cards=el('div','','account-cards'),b=balances(rows('accounts'),rows('transactions'));
 for(const a of rows('accounts')){const card=el('section','','account-card');card.append(el('div',a.kind.toUpperCase(),'eyebrow'),el('h3',a.name),el('div',a.institution||'Manual account','muted small'),el('div',fmt(b.get(a.id)),'balance'),el('p','Posted balance through today','muted small'));const actions=el('div','','toolbar');actions.append(button('Transactions',()=>navigate('transactions',a.id)),button('Edit',()=>accountForm(a)),button('Delete',()=>confirmDelete('accounts',a,'account')));card.append(actions);cards.append(card);}if(!rows('accounts').length)noRows(cards,'Add your first account.','Start with checking, savings, cash, or a credit card.',button('+ Account',()=>accountForm(),'primary'));$('content').append(cards);
}
function renderBudgets(){
 const p=panel(),budgets=rows('budgets').filter(b=>b.month===month+'-01');
 if(!budgets.length)noRows(p,'Plan this month.','Set a spending limit for an expense category.',button('+ Budget',()=>budgetForm(),'primary'));
 for(const b of budgets){const category=rows('categories').find(c=>c.id===b.category_id),spent=-rows('transactions').filter(t=>t.category_id===b.category_id&&t.kind==='expense'&&t.status==='posted'&&t.date<=today()&&t.date.startsWith(month)).reduce((n,t)=>n+Number(t.amount_cents),0);const row=el('div','','spending-row'),label=el('div','','spending-label');label.append(el('strong',category?.name||'Category'),el('span',`${fmt(spent)} / ${fmt(b.amount_cents)}`));const track=el('div','','bar-track'),fill=el('div','','bar-fill'+(spent>b.amount_cents?' over':''));fill.style.width=Math.min(100,spent/b.amount_cents*100)+'%';track.append(fill);const actions=el('div','','toolbar');actions.append(el('p',spent>b.amount_cents?`${fmt(spent-b.amount_cents)} over budget`:`${fmt(b.amount_cents-spent)} remaining`,'muted small'),button('Edit',()=>budgetForm(b)),button('Delete',()=>confirmDelete('budgets',b,'budget')));row.append(label,track,actions);p.append(row);}p.append(el('p','Includes posted expenses through today. Pending transactions and transfers are excluded.','grid-footer'));$('content').append(p);
}
function renderCategories(){
 const p=panel();if(!rows('categories').length)noRows(p,'Create your categories.','Use categories such as Housing, Groceries, Client income, or Software.');
 else{const host=el('div','','grid-host');p.append(host);grid=createEBGrid(host,{data:rows('categories').map(c=>({...c})),columns:[{key:'name',label:'Category',sortable:true},{key:'kind',label:'Type',sortable:true},{key:'edit',label:'',type:'button',button:{text:'Edit',onClick:r=>categoryForm(r)}},{key:'delete',label:'',type:'button',button:{text:'Delete',onClick:r=>confirmDelete('categories',r,'category')}}],sortable:true,filterable:false,pagination:true,pageSize:25,editableRows:false,contextMenu:false});}$('content').append(p);
}
function workspaceForm(){form('New workspace',[{name:'name',label:'Workspace name',required:true,maxLength:100},{name:'kind',label:'Workspace type',options:[['personal','Personal'],['business','Small business']]},{name:'currency',label:'Currency',options:['USD','CAD','EUR','GBP','AUD','NZD'].map(c=>[c,c])}],async values=>{await mutate('workspaces',{...values,name:values.name.trim()});workspaceId=data.workspaces.findLast(w=>w.name===values.name.trim())?.id||data.workspaces[0]?.id;view='overview';render();},{description:'Each workspace has its own accounts, categories, and currency. This version is private to your login.'});}
function accountForm(a){if(!workspace())return;form(a?'Edit account':'Add account',[{name:'name',label:'Account name',required:true,maxLength:100,value:a?.name},{name:'kind',label:'Account type',value:a?.kind,options:['checking','savings','credit','cash','loan','investment'].map(k=>[k,k[0].toUpperCase()+k.slice(1)])},{name:'institution',label:'Institution (optional)',value:a?.institution,maxLength:100},{name:'opening',label:`Opening balance (${workspace().currency})`,required:true,value:((a?.opening_balance_cents||0)/100).toFixed(2)}],async v=>{const balance=cents(v.opening);await mutate('accounts',{workspace_id:workspaceId,name:v.name.trim(),kind:v.kind,institution:v.institution.trim(),opening_balance_cents:balance},a?.id);},{description:'Use the balance immediately before the earliest transaction you will enter. Enter debt owed on credit cards or loans as a negative amount.'});}
function categoryForm(c){form(c?'Edit category':'Add category',[{name:'name',label:'Category name',required:true,maxLength:80,value:c?.name},{name:'kind',label:'Type',value:c?.kind,options:[['expense','Expense'],['income','Income']]}],async v=>{if(data.categories.some(x=>x.workspace_id===workspaceId&&x.name===v.name.trim()&&x.kind===v.kind&&x.id!==c?.id))throw new Error('That category already exists.');await mutate('categories',{workspace_id:workspaceId,name:v.name.trim(),kind:v.kind},c?.id);});}
function transactionForm(t){
 if(!rows('accounts').length){eBStatus.info('Add an account before recording transactions.');accountForm();return;}
 const options=rows('accounts').map(a=>[a.id,a.name]);
 const f=form(t?'Edit transaction':'New transaction',[
  {name:'kind',label:'Type',value:t?.kind||'expense',options:[['expense','Expense'],['income','Income'],['transfer','Transfer']]},
  {name:'date',label:'Date',type:'date',required:true,value:t?.date||today()},
  {name:'payee',label:'Payee / description',required:true,maxLength:200,value:t?.payee},
  {name:'account_id',label:'Account / transfer from',options,value:t?.account_id||accountId||options[0][0]},
  {name:'to_account_id',label:'Transfer to',options:[['','Select account'],...options],value:t?.to_account_id||''},
  {name:'amount',label:`Amount (${workspace().currency}, positive number)`,required:true,value:t?(Math.abs(t.amount_cents)/100).toFixed(2):''},
  {name:'category_id',label:'Category',options:[['','Uncategorized']],value:''},
  {name:'status',label:'Status',options:[['posted','Posted'],['pending','Pending']],value:t?.status||'posted'},
  {name:'reviewed',label:'Review',options:[['false','Needs review'],['true','Reviewed']],value:String(t?.reviewed||false)},
  {name:'notes',label:'Notes',type:'textarea',value:t?.notes,maxLength:4000},
 ],async v=>{
  const amount=cents(v.amount);if(amount<=0)throw new Error('Amount must be greater than zero.');if(!dateValid(v.date))throw new Error('Enter a valid date.');if(v.kind==='transfer'&&(!v.to_account_id||v.to_account_id===v.account_id))throw new Error('Select a different destination account.');
  const row={workspace_id:workspaceId,date:v.date,payee:v.payee.trim(),account_id:v.account_id,to_account_id:v.kind==='transfer'?v.to_account_id:null,category_id:v.kind==='transfer'?null:v.category_id||null,amount_cents:v.kind==='income'?amount:-amount,kind:v.kind,status:v.status,reviewed:v.reviewed==='true',notes:v.notes};await mutate('transactions',row,t?.id);
 });
 const update=()=>{const kind=f.inputs.kind.value;f.inputs.to_account_id.parentElement.hidden=kind!=='transfer';f.inputs.category_id.parentElement.hidden=kind==='transfer';const cat=f.inputs.category_id;cat.replaceChildren();for(const [v,label]of[['','Uncategorized'],...rows('categories').filter(c=>c.kind===kind).map(c=>[c.id,c.name])]){const o=el('option',label);o.value=v;cat.append(o);}if(t?.kind===kind)cat.value=t.category_id||'';};f.inputs.kind.onchange=update;update();
 if(t){const del=button('Delete transaction',()=>{f.dialog.close();confirmDelete('transactions',t,'transaction');});f.body.append(del);}
}
function budgetForm(b){const cats=rows('categories').filter(c=>c.kind==='expense');if(!cats.length){eBStatus.info('Create an expense category first.');categoryForm();return;}form(b?'Edit budget':'Set budget',[{name:'category_id',label:'Expense category',options:cats.map(c=>[c.id,c.name]),value:b?.category_id},{name:'month',label:'Month',type:'month',required:true,value:b?.month.slice(0,7)||month},{name:'amount',label:`Budget (${workspace().currency})`,required:true,value:b?(b.amount_cents/100).toFixed(2):''}],async v=>{const amount_cents=cents(v.amount);if(amount_cents<=0)throw new Error('Budget must be greater than zero.');if(rows('budgets').some(x=>x.id!==b?.id&&x.category_id===v.category_id&&x.month===v.month+'-01'))throw new Error('A budget already exists for this category and month.');await mutate('budgets',{workspace_id:workspaceId,category_id:v.category_id,month:v.month+'-01',amount_cents},b?.id);});}
function downloadCSV(ts){
 const csv=exportCSV([['date','payee','amount','account','category','type','status','reviewed','notes','transfer_to'],...ts.map(t=>[t.date,t.payee,(t.amount_cents/100).toFixed(2),rows('accounts').find(a=>a.id===t.account_id)?.name,rows('categories').find(c=>c.id===t.category_id)?.name,t.kind,t.status,t.reviewed,t.notes,rows('accounts').find(a=>a.id===t.to_account_id)?.name])]);
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`eb-finance-${month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);eBStatus.success('Filtered transactions exported.');
}
function importForm(){
 if(!rows('accounts').length){accountForm();return;}
 form('Import bank CSV',[{name:'account',label:'Destination account',options:rows('accounts').map(a=>[a.id,a.name]),value:accountId||rows('accounts')[0].id},{name:'file',label:'CSV file',type:'file',accept:'.csv,text/csv',required:true}],async v=>{
  if(!v.file||v.file.size>2000000)throw new Error('Choose a CSV under 2 MB.');const content=await v.file.text();const parsed=importRows(content);if(!parsed.length)throw new Error('No transaction rows found.');
  if(/^date,payee,amount,account,category,type,/i.test(content.replaceAll('"','').replace(/^\uFEFF/,'')))throw new Error('This is an eB Finance report export. Import a bank CSV; reports include transfers and are not a backup format.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const preview=el('div','','csv-preview'),table=el('table');for(const r of parsed.slice(0,10)){const tr=el('tr');tr.append(el('td',r.date),el('td',r.payee),el('td',fmt(r.amount_cents)));table.append(tr);}preview.append(table);
  form('Review import',[],async()=>{
   const payload=parsed.map((r,i)=>({...r,workspace_id:workspaceId,account_id:v.account,owner_id:session?.user.id,import_key:`csv:${v.account}:${hash}:${i}`}));let count;
   if(demo){const fresh=payload.filter(r=>!data.transactions.some(t=>t.import_key===r.import_key));data.transactions.push(...fresh.map(r=>({...r,id:crypto.randomUUID()})));count=fresh.length;render();}
   else{count=await importTransactions(payload);await refresh();}eBStatus.success(`Imported ${count} transactions; skipped ${parsed.length-count} previously imported rows.`);
  },{submit:`Import ${parsed.length} rows`,description:`Preview of the first ${Math.min(parsed.length,10)} rows. Positive amounts are income; negative amounts are expenses. All rows need review. Reimporting the same file to the same account is skipped. Overlapping exports may still duplicate transactions.`,extra:preview});
 },{submit:'Preview',description:'Required headers: date, payee, amount. Optional: notes. Use YYYY-MM-DD dates, signed decimal amounts, and no currency symbols or thousands separators. Transfers should be entered as transfers after review.'});
}
function renderConnections(){const p=panel();p.classList.add('prose');p.innerHTML='<span class="badge">Not connected</span><h2 style="margin-top:18px">Bring your bank into the picture.</h2><p>Your accounts currently use manual transactions and CSV imports. No bank credentials or bank tokens are stored by this version.</p><h3>Recommended path: Plaid Link + Transactions</h3><p>For supported US and Canadian banks, evaluate Plaid first. Test your exact institutions and business account types before committing. Start in Sandbox, then request a Trial or Production plan.</p><ol><li>Choose Connect bank and complete the bank’s consent flow in Plaid Link.</li><li>A server-side Supabase Edge Function exchanges the temporary token. Long-lived bank tokens stay on the server.</li><li>A verified webhook triggers transaction sync, with a saved cursor and duplicate protection.</li><li>Imported transactions enter the review grid. You can categorize them and disconnect later.</li></ol><p>Live connectivity is not enabled yet. It requires a Plaid account, server secrets, sync functions, consent and disconnect flows, and testing against your banks.</p><p><a href="https://plaid.com/docs/quickstart/" target="_blank" rel="noopener">Plaid integration guide ↗</a> · <a href="https://plaid.com/docs/account/billing/" target="_blank" rel="noopener">Current plans and billing ↗</a></p>';
 p.append(button('Import a CSV instead',importForm));$('content').append(p);}
function applyTheme(value){const preference=value||'system';const effective=preference==='system'?(window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;document.documentElement.dataset.theme=effective;document.documentElement.dataset.themePreference=preference;}
function renderSettings(){const p=panel('Workspace');p.append(el('p',`${workspace().name} · ${workspace().kind} · ${workspace().currency}`,'muted small'),button('Rename workspace',()=>form('Rename workspace',[{name:'name',label:'Name',required:true,maxLength:100,value:workspace().name}],v=>mutate('workspaces',{name:v.name.trim()},workspaceId))));const theme=panel('Appearance');const preference=localStorage.getItem('eb-fin-theme')||'system';theme.append(select('Appearance',[['system','System (follow Chrome)'],['light','Light'],['dark','Dark']],preference,v=>{applyTheme(v);localStorage.setItem('eb-fin-theme',v);}),document.createTextNode(' '),select('Grid density',[['comfortable','Comfortable'],['compact','Compact']],localStorage.getItem('eb-fin-density')||'comfortable',v=>{document.body.dataset.density=v;localStorage.setItem('eb-fin-density',v);}));const info=panel('About this workspace');info.append(el('p','Each workspace uses one currency and is private to its owner. Small-business views track cash flow and spending; this version does not provide double-entry accounting, tax filing, invoicing, or team access.','muted small'));$('content').append(p,theme,info);}

eBStatus.init();CFstatus.init($('cf-status'),{endpoint:'./deployment-status.json',pollInterval:0});
applyTheme(localStorage.getItem('eb-fin-theme')||'system');document.body.dataset.density=localStorage.getItem('eb-fin-density')||'comfortable';
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((localStorage.getItem('eb-fin-theme')||'system')==='system')applyTheme('system');});
$('workspace').onchange=e=>switchWorkspace(e.target.value);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$('newWorkspace').onclick=$('firstWorkspace').onclick=()=>run(workspaceForm);$('refresh').onclick=()=>run(refresh);$('refreshApp').onclick=()=>location.reload();
$('openAuth').onclick=e=>{e.stopPropagation();$('auth').querySelector('details').open=true;$('auth').querySelector('input').focus();};
$('enterDemo').onclick=()=>{++epoch;demo=true;data=demoData();workspaceId='personal';view='overview';render();eBStatus.info('Demo mode: sample data only.');};
$('exitDemo').onclick=()=>{++epoch;demo=false;data=empty();workspaceId='';render();eBStatus.clear();if(session)run(refresh);else eBStatus.info('Sign in to save your finances.');};
$('debugApp').onclick=()=>eBStatus.info(`eB Finance 1.0 · ${demo?'demo':session?'signed in':'signed out'} · ${data.workspaces.length} workspaces · ${data.transactions.length} transactions loaded`);
for(const [id,level]of[['testStatusSuccess','success'],['testStatusWarn','warn'],['testStatusError','error']])$(id).onclick=()=>eBStatus[level]('Test '+level+' message');
$('testComboBox').onclick=()=>{const f=form('Combo box test',[{name:'example',label:'Example category'}],async()=>{}, {submit:'Done'});const combo=createEBComboBox(f.inputs.example,{source:[{value:'housing',label:'Housing'},{value:'groceries',label:'Groceries'}],minChars:0});f.dialog.addEventListener('close',()=>combo.destroy());};
document.addEventListener('click',e=>{if(e.target.closest('[data-eb-profile-edit]')){if(!session)return;form('Edit profile',[{name:'display_name',label:'Display name',value:session.user.user_metadata?.display_name||'',maxLength:100}],async v=>{const {error}=await db.auth.updateUser({data:{display_name:v.display_name.trim()}});if(error)throw error;eBStatus.success('Profile updated.');});}});
const splitter=$('splitter');let width=Number(localStorage.getItem('eb-fin-tree-width'))||230;
const resize=()=>{width=Math.min(420,Math.max(160,width));document.documentElement.style.setProperty('--finance-tree-width',width+'px');splitter.setAttribute('aria-valuenow',String(width));localStorage.setItem('eb-fin-tree-width',String(width));};resize();let dragging=false;
splitter.onpointerdown=e=>{dragging=true;splitter.setPointerCapture(e.pointerId);};splitter.onpointermove=e=>{if(dragging){width=e.clientX;resize();}};splitter.onpointerup=()=>dragging=false;splitter.onpointercancel=()=>dragging=false;splitter.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width+=e.key==='ArrowLeft'?-10:10;resize();}};
render();initAuth({api:authAPI,container:$('auth'),onSession,setStatus:(message,level='info')=>eBStatus[level]?.(message)}).then(r=>onSession(r.data.session)).catch(e=>eBStatus.error(e.message));
