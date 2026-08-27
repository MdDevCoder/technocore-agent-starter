import * as C from "./candidate.mjs";
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
let pass=0,fail=0; const t=(name,cond)=>{ if(cond){pass++;console.log('  ok   '+name);} else {fail++;console.log('  FAIL '+name);} };

const kp=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',kp.privateKey);
const seed=new Uint8Array(Buffer.from(jwk.d,'base64url'));
const pub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey));
const did=C.publicKeyToDid(pub);

console.log('\n[verification round-trip]');
const room='lobby', nonce=C.makeNonce(), text=C.cleanText('Agent online. Exploring Technocore.');
const sig=await C.signBytes(seed,pub,C.roomMessagePayload(room,nonce,text));
t('valid room-message signature verifies', await C.verifyBytes(did,sig,C.roomMessagePayload(room,nonce,text)));
t('tampered text fails', !(await C.verifyBytes(did,sig,C.roomMessagePayload(room,nonce,text+'!'))));
t('tampered room fails', !(await C.verifyBytes(did,sig,C.roomMessagePayload('technocore',nonce,text))));
t('tampered nonce fails', !(await C.verifyBytes(did,sig,C.roomMessagePayload(room,'1700000000000000000',text))));
const other=C.publicKeyToDid(new Uint8Array(await crypto.subtle.exportKey('raw',(await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify'])).publicKey)));
t('wrong DID fails', !(await C.verifyBytes(other,sig,C.roomMessagePayload(room,nonce,text))));
// bit-flipped signature
const fl=C.b64urlDecode(sig); fl[10]^=1;
t('bit-flipped signature fails', !(await C.verifyBytes(did,C.b64url(fl),C.roomMessagePayload(room,nonce,text))));

console.log('\n[malformed signature rejection]');
for (const [n,s] of [['85 chars',sig.slice(0,85)],['87 chars',sig+'A'],['base64 std chars',sig.slice(0,84)+'+/'],['empty',''],['padded',sig+'==']])
  { let threw=false; try{ await C.verifyBytes(did,s,new Uint8Array(1)); }catch(e){ threw=/MALFORMED_SIGNATURE/.test(e.message); } t(n+' rejected',threw); }

console.log('\n[malformed DID rejection]');
for (const [n,d] of [['wrong method','did:web:example.com'],['no prefix','z6Mk'+'1'.repeat(44)],
  ['secp256k1 codec','did:key:zQ3shokFTS3brHcDQrn82RUDfCZESWL1ZdCEJwekUDPQiYBme'],['empty',''],
  ['bad base58 char','did:key:z6Mk'+'0'.repeat(44)],['too short','did:key:z6Mk'],['truncated',did.slice(0,-1)],
  ['extra char',did+'a'],['null',null]])
  { let threw=false; try{ C.didToPublicKey(d); }catch(e){ threw=/MALFORMED_DID/.test(e.message); } t(n+' rejected',threw); }
t('valid DID round-trips', hex(C.didToPublicKey(did))===hex(pub));

console.log('\n[did:key invariants over 500 keys]');
let allOk=true;
for(let i=0;i<500;i++){
  const p=new Uint8Array(await crypto.subtle.exportKey('raw',(await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify'])).publicKey));
  const d=C.publicKeyToDid(p);
  if(d.length!==56 || !d.startsWith('did:key:z6Mk') || hex(C.didToPublicKey(d))!==hex(p)) allOk=false;
}
t('500/500 keys -> 48-char multibase, z6Mk prefix, exact round-trip', allOk);

console.log('\n[proof verification]');
const proof=await C.createProof(seed,pub,'https://x.com/u/status/1','a'.repeat(40));
t('valid proof verifies', await C.verifyProof(proof));
t('tampered url fails', !(await C.verifyProof({...proof,artifact_url:'https://x.com/u/status/2'})));
t('tampered commit fails', !(await C.verifyProof({...proof,commit:'b'.repeat(40)})));
t('tampered did fails', !(await C.verifyProof({...proof,did:other})));
for (const [n,p] of [['bad schema',{...proof,schema:'x'}],['missing signature',{...proof,signature:undefined}],['missing did',{...proof,did:undefined}]])
  { let threw=false; try{ await C.verifyProof(p); }catch(e){ threw=true; } t(n+' rejected',threw); }

console.log('\n[nonce]');
const ns=Array.from({length:2000},()=>C.makeNonce());
t('all 19-digit numeric', ns.every(n=>/^[0-9]{1,19}$/.test(n)));
t('strictly monotonic + unique', ns.every((n,i)=>i===0||BigInt(n)>BigInt(ns[i-1])));
t('within ~now', Math.abs(Number(BigInt(ns[0])/1000000n)-Date.now())<60000);

console.log('\n[SECURITY: does WebCrypto validate d against x on JWK import?]');
const bad=new Uint8Array(pub); bad[0]^=0xff;
let importedMismatch=false, sigVerifies=null;
try{
  const k=await crypto.subtle.importKey('jwk',{kty:'OKP',crv:'Ed25519',d:C.b64url(seed),x:C.b64url(bad),key_ops:['sign'],ext:true},{name:'Ed25519'},true,['sign']);
  importedMismatch=true;
  const s=new Uint8Array(await crypto.subtle.sign({name:'Ed25519'},k,new Uint8Array([1])));
  const vk=await crypto.subtle.importKey('raw',bad,{name:'Ed25519'},false,['verify']);
  sigVerifies=await crypto.subtle.verify({name:'Ed25519'},vk,s,new Uint8Array([1]));
}catch(e){ console.log('  import rejected mismatched d/x ->', e.name); }
console.log(`  mismatched d/x imported = ${importedMismatch}; signature verifies against claimed x = ${sigVerifies}`);
console.log(`  => identity self-test after import is ${importedMismatch? 'REQUIRED':'belt-and-braces'}`);

console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
