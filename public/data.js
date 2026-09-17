import { config } from './config.js';
export const db=window.supabase.createClient(config.url,config.publishableKey);
export const tables=['workspaces','accounts','categories','transactions','budgets'];
export async function readAll(name,userId) {
  let all=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await db.from('finance_'+name).select('*').eq('owner_id',userId).order('id').range(offset,offset+999);
    if(error)throw error;all.push(...data);if(data.length<1000)return all;
  }
}
export async function loadData(userId) { return Object.fromEntries(await Promise.all(tables.map(async t=>[t,await readAll(t,userId)]))); }
export async function save(name,row,id) {
  let query=id?db.from('finance_'+name).update(row).eq('id',id):db.from('finance_'+name).insert(row);
  const {data,error}=await query.select().single();if(error)throw error;return data;
}
export async function remove(name,id) { const {data,error}=await db.from('finance_'+name).delete().eq('id',id).select('id').single();if(error)throw error;return data; }
export async function importTransactions(rows) {
  const {data,error}=await db.from('finance_transactions').upsert(rows,{onConflict:'workspace_id,import_key',ignoreDuplicates:true}).select('id');
  if(error)throw error;return data.length;
}
// Governance's auth component receives its existing API contract, backed by this project.
export const authAPI={
 auth:{
  signIn:(email,password)=>db.auth.signInWithPassword({email,password}),
  signUp:(email,password)=>db.auth.signUp({email,password}),
  signOut:()=>db.auth.signOut({scope:'local'}),
  getSession:()=>db.auth.getSession(),
  onAuthStateChange:callback=>db.auth.onAuthStateChange((event,session)=>setTimeout(()=>callback(event,session),0)),
 },
 profile:{list:async()=>[]},
 identity:{actor:async()=>null,clear:()=>{}},
};
